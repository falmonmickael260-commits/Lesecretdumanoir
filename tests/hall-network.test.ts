import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import type { GameState, ServerMessage } from '../src/shared.js';

type Client = { ws: WebSocket; id: string; state: GameState; send: (message: object) => void };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string, limit = 6000) {
  const start = Date.now();
  while (!check()) { if (Date.now() - start > limit) throw new Error(`Timed out: ${label}`); await sleep(30); }
}
function launch(port: number, dir: string): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout?.on('data', data => { output += data; if (output.includes('listening')) resolve(child); });
    child.stderr?.on('data', data => { output += data; });
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${output}`)));
    setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 6000);
  });
}
async function connect(port: number, request: object): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const client: Client = { ws, id: '', state: undefined!, send: message => ws.send(JSON.stringify(message)) };
  ws.on('message', raw => { const msg = JSON.parse(raw.toString()) as ServerMessage; if (msg.type === 'welcome') client.id = msg.id; if (msg.type === 'welcome' || msg.type === 'state') client.state = msg.state; });
  client.send(request);
  await until(() => !!client.id, 'welcome');
  return client;
}
async function move(client: Client, x: number, z: number, reached: (x: number, z: number) => boolean, label: string) {
  const start = Date.now();
  try {
    while (true) {
      const p = client.state.players.find(q => q.id === client.id)!;
      if (reached(p.x, p.z)) break;
      if (Date.now() - start > 6000) throw new Error(`Movement blocked: ${label} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
      client.send({ type: 'input', x, z, run: true }); await sleep(50);
    }
  } finally { client.send({ type: 'input', x: 0, z: 0, run: false }); await sleep(80); }
}
async function interact(client: Client, target: string, flag: string) {
  client.send({ type: 'interact', target });
  await until(() => !!client.state.flags[flag], `${target} interaction`);
}

test('four network clients physically solve the hall and open its door', { timeout: 45000 }, async () => {
  const port = 22000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), 'manoir-hall-'));
  let server: ChildProcess | null = null; const clients: Client[] = [];
  try {
    server = await launch(port, dir);
    const host = await connect(port, { type: 'create', team: 'Équipe du Hall', name: 'Exploratrice', avatar: 0 }); clients.push(host);
    for (let avatar = 1; avatar < 4; avatar++) clients.push(await connect(port, { type: 'join', code: host.state.code, name: `Partenaire ${avatar}`, avatar }));
    clients.forEach(c => c.send({ type: 'ready', ready: true }));
    await until(() => host.state.players.every(p => p.ready), 'all players ready');
    host.send({ type: 'start' }); await until(() => host.state.status === 'playing', 'game start');

    await move(host, -1, 0, x => x < -3.25, 'buffet');
    await interact(host, 'buffet', 'buffetOpen');
    assert.ok(host.state.players.find(p => p.id === host.id)?.inventory.includes('lamp'));

    await move(clients[1], 1, 0, x => x > 2.6, 'wardrobe left approach');
    await move(clients[1], 0, -1, (_, z) => z < -0.95, 'wardrobe left');
    await move(clients[3], 1, 0, x => x > 5.2, 'wardrobe right approach');
    await move(clients[3], 0, -1, (_, z) => z < -1.1, 'wardrobe right');
    clients[1].send({ type: 'hold', target: 'wardrobeLeft' });
    clients[3].send({ type: 'hold', target: 'wardrobeRight' });
    await until(() => !!host.state.flags.wardrobeMoved, 'wardrobe pushed by two players');

    await move(host, 0, -1, (_, z) => z < -0.75, 'hall left aisle');
    await move(host, 1, 0, x => x > 2.85, 'hall back aisle');
    await move(host, 0, -1, (_, z) => z < -3.45, 'painting aisle');
    await move(host, 1, 0, x => x > 5.45, 'painting');
    await interact(host, 'painting', 'paintingOpen');
    await interact(host, 'key', 'keyTaken');
    await move(host, -1, 0, x => x < 0.3, 'library door');
    await interact(host, 'hallDoor', 'hallDoorOpen');
    host.send({ type: 'interact', target: 'hallDoor' });
    await until(() => host.state.stage === 1, 'library entered');
    assert.equal(host.state.players.length, 4);
  } finally {
    clients.forEach(c => { try { c.ws.close(); } catch { /* no-op */ } });
    server?.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});
