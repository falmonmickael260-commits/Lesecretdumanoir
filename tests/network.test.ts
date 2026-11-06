import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, type RawData } from 'ws';
import type { ServerMessage } from '../src/shared.js';

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms));
function waitFor(ws: WebSocket, predicate: (m: ServerMessage) => boolean): Promise<ServerMessage> {
  return Promise.race([new Promise<ServerMessage>((resolve, reject) => {
    const onMessage = (raw: RawData) => {
      const m = JSON.parse(raw.toString()) as ServerMessage;
      if (predicate(m)) { ws.off('message', onMessage); resolve(m); }
    };
    ws.on('message', onMessage); ws.once('close', () => reject(new Error('Socket closed')));
  }), timeout(6000)]);
}
function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.once('open', () => resolve(ws)); ws.once('error', reject);
  });
}
function startServer(port: number, data: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk.toString(); if (output.includes('listening')) resolve(child); });
    child.stderr?.on('data', chunk => { output += chunk.toString(); });
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${output}`)));
    setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 6000);
  });
}

test('four WebSocket clients reconnect across a server restart without resetting the timer', { timeout: 30000 }, async () => {
  const port = 22000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), 'manoir-test-'));
  let server: ChildProcess | null = null;
  const sockets: WebSocket[] = [];
  try {
    server = await startServer(port, dir);
    const boardResponse = await fetch(`http://127.0.0.1:${port}/api/leaderboard?period=week`);
    assert.equal(boardResponse.status, 200); assert.deepEqual(await boardResponse.json(), []);
    const historyResponse = await fetch(`http://127.0.0.1:${port}/api/history?team=Les%20Veilleurs`);
    assert.equal(historyResponse.status, 200); assert.deepEqual(await historyResponse.json(), []);
    if (existsSync(join(process.cwd(), 'dist', 'index.html'))) {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(page.status, 200); assert.match(await page.text(), /ESCAPE PROJECT/);
      const model = await fetch(`http://127.0.0.1:${port}/models/h-adventurer.glb`);
      assert.equal(model.status, 200); assert.match(model.headers.get('content-type') || '', /gltf-binary/);
    }
    const credentials: { code: string; id: string; token: string }[] = [];
    const host = await connect(port); sockets.push(host);
    let welcome = waitFor(host, m => m.type === 'welcome');
    host.send(JSON.stringify({ type: 'create', team: 'Les Veilleurs', name: 'Hôte', avatar: 0 }));
    const first = await welcome as Extract<ServerMessage, { type: 'welcome' }>;
    credentials.push({ code: first.state.code, id: first.id, token: first.token });
    for (let avatar = 1; avatar < 4; avatar++) {
      const ws = await connect(port); sockets.push(ws);
      welcome = waitFor(ws, m => m.type === 'welcome');
      ws.send(JSON.stringify({ type: 'join', code: first.state.code, name: `Joueur ${avatar}`, avatar }));
      const joined = await welcome as Extract<ServerMessage, { type: 'welcome' }>;
      credentials.push({ code: joined.state.code, id: joined.id, token: joined.token });
    }
    const left = waitFor(host, m => m.type === 'state' && m.state.players.length === 3);
    sockets[3].send(JSON.stringify({ type: 'leave' })); await left;
    const replacement = await connect(port); sockets[3] = replacement;
    welcome = waitFor(replacement, m => m.type === 'welcome');
    replacement.send(JSON.stringify({ type: 'join', code: first.state.code, name: 'Remplaçante', avatar: 3 }));
    const newPlayer = await welcome as Extract<ServerMessage, { type: 'welcome' }>;
    credentials[3] = { code: newPlayer.state.code, id: newPlayer.id, token: newPlayer.token };
    const allReady = waitFor(host, m => m.type === 'state' && m.state.players.length === 4 && m.state.players.every(p => p.ready));
    for (const ws of sockets) ws.send(JSON.stringify({ type: 'ready', ready: true }));
    await allReady;
    const playing = waitFor(host, m => m.type === 'state' && m.state.status === 'playing');
    host.send(JSON.stringify({ type: 'start' }));
    const initial = await playing as Extract<ServerMessage, { type: 'state' }>;
    assert.equal(initial.state.players.length, 4); assert.ok(initial.state.startedAt);
    const closed = new Promise<void>(resolve => sockets[2].once('close', () => resolve()));
    sockets[2].close(); await closed;
    const resumed = await connect(port); sockets.push(resumed);
    welcome = waitFor(resumed, m => m.type === 'welcome');
    resumed.send(JSON.stringify({ type: 'resume', ...credentials[2] }));
    const session = await welcome as Extract<ServerMessage, { type: 'welcome' }>;
    assert.equal(session.state.startedAt, initial.state.startedAt);
    assert.notEqual(session.token, credentials[2].token);
    credentials[2].token = session.token;
    sockets.forEach(ws => ws.close());
    server.kill('SIGTERM'); await new Promise<void>(resolve => server!.once('exit', () => resolve()));
    server = await startServer(port, dir);
    const afterRestart = await connect(port); sockets.push(afterRestart);
    welcome = waitFor(afterRestart, m => m.type === 'welcome');
    afterRestart.send(JSON.stringify({ type: 'resume', ...credentials[2] }));
    const recovered = await welcome as Extract<ServerMessage, { type: 'welcome' }>;
    assert.equal(recovered.state.startedAt, initial.state.startedAt);
    assert.equal(recovered.state.stage, 0);
    assert.equal(recovered.state.status, 'playing');
  } finally {
    sockets.forEach(ws => { try { ws.close(); } catch { /* no-op */ } });
    server?.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});
