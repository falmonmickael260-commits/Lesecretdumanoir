import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
// Node 24 ships SQLite. The Node 22 type package treats it as experimental.
// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import type { Avatar, ClientMessage, GameState, LeaderRow, Player, ServerMessage } from '../src/shared.js';
import { dropItem, giveItem, interact, makeGame, makePlayer, movePlayer, requestHint, setHold, startGame, tickMechanisms, MAX_PLAYERS, type Input } from './engine.js';

const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DIST_DIR = resolve(process.cwd(), 'dist');
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'manoir.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, tokens TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS results (code TEXT PRIMARY KEY, team TEXT NOT NULL, players TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, hints INTEGER NOT NULL, penalty_ms INTEGER NOT NULL, ranked_ms INTEGER NOT NULL, completed_at INTEGER NOT NULL, world TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS results_date ON results(completed_at);`);

type Room = { state: GameState; tokens: Record<string, string> };
const rooms = new Map<string, Room>();
for (const row of db.prepare('SELECT code, state, tokens FROM rooms').all() as { code: string; state: string; tokens: string }[]) {
  try {
    const room: Room = { state: JSON.parse(row.state), tokens: JSON.parse(row.tokens) };
    room.state.players.forEach(p => { p.online = false; p.hold = null; p.moving = false; });
    rooms.set(row.code, room);
  } catch { /* Ignore a damaged saved room; other rooms remain available. */ }
}

const clients = new Map<string, WebSocket>();
const auth = new WeakMap<WebSocket, { code: string; id: string }>();
const inputs = new Map<string, Input>();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const send = (ws: WebSocket, msg: ServerMessage) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
const safeName = (value: unknown, fallback: string) => typeof value === 'string' ? value.trim().slice(0, 32) || fallback : fallback;
const validAvatar = (n: unknown): n is Avatar => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 3;
const roomOf = (ws: WebSocket) => { const a = auth.get(ws); return a ? rooms.get(a.code) : undefined; };
const actorOf = (ws: WebSocket, room: Room) => room.state.players.find(p => p.id === auth.get(ws)?.id);

function save(room: Room) {
  db.prepare('INSERT INTO rooms(code,state,tokens) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state,tokens=excluded.tokens')
    .run(room.state.code, JSON.stringify(room.state), JSON.stringify(room.tokens));
}
function broadcast(room: Room) {
  room.state.serverNow = Date.now();
  const msg: ServerMessage = { type: 'state', state: room.state };
  room.state.players.forEach(p => { const ws = clients.get(p.id); if (ws) send(ws, msg); });
}
function error(ws: WebSocket, message: string) { send(ws, { type: 'error', message }); }
function roomCode() { let code: string; do { code = randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(code)); return code; }

function attach(ws: WebSocket, room: Room, player: Player, token: string) {
  const previous = clients.get(player.id);
  if (previous && previous !== ws) previous.close(4001, 'Session reprise ailleurs');
  clients.set(player.id, ws); auth.set(ws, { code: room.state.code, id: player.id });
  player.online = true; player.hold = null; player.moving = false;
  room.tokens[player.id] = hash(token); save(room);
  send(ws, { type: 'welcome', id: player.id, token, state: room.state }); broadcast(room);
}

function recordWin(room: Room) {
  const s = room.state;
  if (!s.startedAt || !s.finishedAt) return;
  const elapsed = s.finishedAt - s.startedAt;
  db.prepare('INSERT OR IGNORE INTO results(code,team,players,elapsed_ms,hints,penalty_ms,ranked_ms,completed_at,world) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(s.code, s.team, JSON.stringify(s.players.map(p => p.id)), elapsed, s.hints, s.penaltyMs, elapsed + s.penaltyMs, s.finishedAt, 'Les Secrets du Manoir');
}

function leaderboard(period: 'all' | 'week' | 'month'): LeaderRow[] {
  const since = period === 'week' ? Date.now() - 7 * 86400_000 : period === 'month' ? Date.now() - 30 * 86400_000 : 0;
  const rows = db.prepare(`SELECT team,players,elapsed_ms,hints,penalty_ms,ranked_ms,completed_at,world FROM (
    SELECT *, ROW_NUMBER() OVER(PARTITION BY lower(team) ORDER BY ranked_ms ASC, completed_at ASC) AS rn FROM results WHERE completed_at >= ?
  ) WHERE rn = 1 ORDER BY ranked_ms ASC, completed_at ASC LIMIT 100`).all(since) as Record<string, unknown>[];
  return rows.map(r => ({ team: String(r.team), playerIds: JSON.parse(String(r.players)), elapsedMs: Number(r.elapsed_ms), hints: Number(r.hints), penaltyMs: Number(r.penalty_ms), rankedMs: Number(r.ranked_ms), completedAt: Number(r.completed_at), world: String(r.world) }));
}

function history(team: string): LeaderRow[] {
  const rows = db.prepare('SELECT team,players,elapsed_ms,hints,penalty_ms,ranked_ms,completed_at,world FROM results WHERE lower(team)=lower(?) ORDER BY completed_at DESC LIMIT 100').all(team) as Record<string, unknown>[];
  return rows.map(r => ({ team: String(r.team), playerIds: JSON.parse(String(r.players)), elapsedMs: Number(r.elapsed_ms), hints: Number(r.hints), penaltyMs: Number(r.penalty_ms), rankedMs: Number(r.ranked_ms), completedAt: Number(r.completed_at), world: String(r.world) }));
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(urlPath: string, res: import('node:http').ServerResponse) {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { res.writeHead(400); res.end('Bad URL'); return; }
  const path = resolve(DIST_DIR, decoded.replace(/^\/+/, ''));
  if (path !== DIST_DIR && !path.startsWith(DIST_DIR + sep)) { res.writeHead(403); res.end(); return; }
  const file = extname(path) ? path : join(DIST_DIR, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('Build the client first: npm run build'); return; }
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', file.includes(`${sep}assets${sep}`) || file.endsWith('.glb') ? 'public, max-age=604800' : 'no-cache');
  res.end(readFileSync(file));
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname === '/api/leaderboard') {
    const period = url.searchParams.get('period');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(leaderboard(period === 'week' || period === 'month' ? period : 'all'))); return;
  }
  if (url.pathname === '/api/history') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(history((url.searchParams.get('team') || '').slice(0, 32)))); return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') { serveStatic(url.pathname, res); return; }
  res.writeHead(405); res.end('Method not allowed');
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16_384 });
wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()); } catch { return error(ws, 'Message illisible.'); }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'leaderboard') { send(ws, { type: 'leaderboard', rows: leaderboard(msg.period === 'week' || msg.period === 'month' ? msg.period : 'all') }); return; }
    if (msg.type === 'create') {
      if (auth.has(ws) || !validAvatar(msg.avatar)) return error(ws, 'Choisis un personnage.');
      const id = randomUUID(); const player = makePlayer(id, safeName(msg.name, 'Hôte'), msg.avatar);
      const room = { state: makeGame(roomCode(), safeName(msg.team, 'Équipe sans nom'), player), tokens: {} };
      rooms.set(room.state.code, room); attach(ws, room, player, newToken()); return;
    }
    if (msg.type === 'join') {
      if (auth.has(ws)) return;
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room || room.state.status !== 'lobby') return error(ws, 'Cette salle est introuvable ou déjà lancée.');
      if (room.state.players.length >= MAX_PLAYERS) return error(ws, 'La salle est complète.');
      if (!validAvatar(msg.avatar) || room.state.players.some(p => p.avatar === msg.avatar)) return error(ws, 'Ce personnage est déjà choisi.');
      const player = makePlayer(randomUUID(), safeName(msg.name, 'Explorateur'), msg.avatar);
      room.state.players.push(player); attach(ws, room, player, newToken()); return;
    }
    if (msg.type === 'resume') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      const player = room?.state.players.find(p => p.id === msg.id);
      if (!room || !player || typeof msg.token !== 'string' || room.tokens[player.id] !== hash(msg.token)) return error(ws, 'Session de reconnexion invalide.');
      attach(ws, room, player, newToken()); return;
    }
    const room = roomOf(ws);
    const player = room && actorOf(ws, room);
    if (!room || !player) return error(ws, 'Rejoins une salle avant de jouer.');
    const s = room.state;
    if (msg.type === 'leave' && s.status === 'lobby') {
      s.players.splice(s.players.indexOf(player), 1);
      delete room.tokens[player.id]; clients.delete(player.id); inputs.delete(player.id);
      if (s.host === player.id) s.host = s.players[0]?.id || '';
      if (s.players.length === 0) { rooms.delete(s.code); db.prepare('DELETE FROM rooms WHERE code=?').run(s.code); }
      else { save(room); broadcast(room); }
      ws.close(1000, 'Salle quittée'); return;
    }
    if (msg.type === 'ready' && s.status === 'lobby') { player.ready = !!msg.ready; save(room); broadcast(room); return; }
    if (msg.type === 'start') { if (!startGame(s, player.id)) return error(ws, 'Les quatre joueurs doivent être prêts et connectés.'); save(room); broadcast(room); return; }
    if (msg.type === 'input') { inputs.set(player.id, { x: msg.x, z: msg.z, run: !!msg.run }); return; }
    if (msg.type === 'interact') {
      const before = s.status;
      interact(s, player, String(msg.target).slice(0, 100));
      if (before !== 'won' && s.status === 'won') recordWin(room);
      save(room); broadcast(room); return;
    }
    if (msg.type === 'hold') { setHold(s, player, typeof msg.target === 'string' ? msg.target.slice(0, 100) : null); broadcast(room); return; }
    if (msg.type === 'drop') { dropItem(s, player, msg.slot); save(room); broadcast(room); return; }
    if (msg.type === 'give') { const to = s.players.find(p => p.id === msg.to); if (to) giveItem(s, player, to, msg.slot); save(room); broadcast(room); return; }
    if (msg.type === 'hint') { const hint = requestHint(s); if (hint) send(ws, { type: 'hint', text: hint }); save(room); broadcast(room); return; }
  });
  ws.on('close', () => {
    const a = auth.get(ws); if (!a || clients.get(a.id) !== ws) return;
    clients.delete(a.id); inputs.delete(a.id);
    const room = rooms.get(a.code); const player = room?.state.players.find(p => p.id === a.id);
    if (room && player) { player.online = false; player.hold = null; player.moving = false; save(room); broadcast(room); }
  });
});

let last = Date.now(); let persistAt = last;
setInterval(() => {
  const now = Date.now(); const dt = Math.min((now - last) / 1000, 0.1); last = now;
  for (const room of rooms.values()) {
    if (room.state.status === 'playing') {
      room.state.players.forEach(p => { if (p.online) movePlayer(room.state, p, inputs.get(p.id) || { x: 0, z: 0, run: false }, dt); });
      tickMechanisms(room.state, dt); broadcast(room);
      if (now - persistAt > 1000) save(room);
    }
  }
  if (now - persistAt > 1000) persistAt = now;
}, 50);

server.listen(PORT, '0.0.0.0', () => console.log(`Manoir server listening on http://localhost:${PORT}`));
