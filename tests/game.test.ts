import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTERACTABLES, type GameState, type Player } from '../src/shared.js';
import { canOccupy, dropItem, giveItem, interact, makeGame, makePlayer, requestHint, setHold, startGame, tickMechanisms } from '../server/engine.js';

function game() {
  const players = [0, 1, 2, 3].map(n => makePlayer(`player-${n}`, `Joueur ${n + 1}`, n as 0 | 1 | 2 | 3));
  const s = makeGame('TEST1234', 'Les Veilleurs', players[0]);
  s.players = players; players.forEach(p => p.ready = true);
  assert.equal(startGame(s, players[0].id), true);
  return { s, players };
}
function go(s: GameState, p: Player, id: string) {
  const t = INTERACTABLES[s.stage].find(t => t.id === id)!;
  p.x = t.x; p.z = Math.max(-4.1, Math.min(4.1, t.z));
  assert.equal(interact(s, p, id), true, `stage ${s.stage}: ${id}`);
}
function hold(s: GameState, p: Player, id: string) {
  const t = INTERACTABLES[s.stage].find(t => t.id === id)!;
  p.x = t.x; p.z = t.z;
  assert.equal(setHold(s, p, id), true, `stage ${s.stage}: hold ${id}`);
}

test('four players can complete all eight rooms, with server-validated cooperation', () => {
  const { s, players: p } = game();
  assert.equal(interact(s, p[0], 'painting'), false);
  go(s, p[0], 'buffet'); hold(s, p[1], 'wardrobeLeft'); hold(s, p[3], 'wardrobeRight'); tickMechanisms(s, 1.9);
  assert.equal(interact(s, p[2], 'painting'), false); // Only a player carrying the lamp can reveal the latch.
  go(s, p[0], 'painting'); go(s, p[2], 'key');
  assert.equal(interact(s, p[0], 'hallDoor'), false); // The holder must physically use the key.
  go(s, p[2], 'hallDoor'); assert.equal(s.flags.hallDoorOpen, true);
  go(s, p[2], 'hallDoor'); assert.equal(s.stage, 1);
  go(s, p[0], 'bookA'); go(s, p[1], 'bookB'); go(s, p[2], 'bookC');
  go(s, p[0], 'slotA'); go(s, p[1], 'slotB'); go(s, p[2], 'slotC'); go(s, p[3], 'bookcase'); go(s, p[3], 'libraryDoor');
  assert.equal(s.stage, 2);
  go(s, p[0], 'fuseA'); go(s, p[1], 'fuseB'); go(s, p[2], 'tool');
  go(s, p[0], 'panelA'); go(s, p[1], 'panelB'); go(s, p[2], 'repair');
  hold(s, p[0], 'switchA'); tickMechanisms(s, 2); assert.equal(s.flags.powerOn, undefined);
  hold(s, p[1], 'switchB'); tickMechanisms(s, 1.6); assert.equal(s.flags.powerOn, true);
  go(s, p[2], 'basementDoor'); assert.equal(s.stage, 3);
  go(s, p[0], 'blue'); go(s, p[1], 'amber'); go(s, p[2], 'red');
  assert.equal(interact(s, p[0], 'mixRed'), false);
  go(s, p[0], 'mixBlue'); go(s, p[1], 'mixAmber'); go(s, p[2], 'mixRed'); go(s, p[0], 'mixer'); go(s, p[0], 'labDoor');
  assert.equal(s.stage, 4);
  hold(s, p[0], 'lever'); hold(s, p[1], 'wheel'); hold(s, p[2], 'feed');
  tickMechanisms(s, 5); assert.equal(s.flags.machineDone, undefined);
  hold(s, p[3], 'lock'); tickMechanisms(s, 3.1); assert.equal(s.flags.machineDone, true);
  go(s, p[0], 'machineDoor'); assert.equal(s.stage, 5);
  go(s, p[0], 'crate'); hold(s, p[1], 'pad'); go(s, p[2], 'grate'); go(s, p[2], 'passageDoor');
  assert.equal(s.stage, 6);
  go(s, p[3], 'socketSigil'); go(s, p[0], 'socketPrism'); go(s, p[0], 'socketGear'); go(s, p[2], 'chest'); go(s, p[2], 'finalKey'); go(s, p[2], 'vaultDoor');
  assert.equal(s.stage, 7);
  go(s, p[2], 'keyhole');
  hold(s, p[0], 'finalA'); hold(s, p[1], 'finalB'); hold(s, p[2], 'finalC'); tickMechanisms(s, 4); assert.equal(s.flags.finalOpen, undefined);
  hold(s, p[3], 'finalD'); tickMechanisms(s, 3.1); assert.equal(s.flags.finalOpen, true);
  p.forEach(q => go(s, q, 'exit'));
  assert.equal(s.status, 'won'); assert.ok(s.finishedAt && s.startedAt && s.finishedAt >= s.startedAt);
});

test('key cannot be lost and can be exchanged after being dropped', () => {
  const { s, players: p } = game();
  go(s, p[0], 'buffet'); hold(s, p[0], 'wardrobeLeft'); hold(s, p[2], 'wardrobeRight'); tickMechanisms(s, 1.9);
  go(s, p[0], 'painting'); go(s, p[0], 'key');
  const slot = p[0].inventory.indexOf('hallKey'); assert.ok(slot >= 0);
  assert.equal(dropItem(s, p[0], slot), true);
  assert.equal(p[0].inventory.includes('hallKey'), false);
  const item = s.floor[0]; p[1].x = item.x; p[1].z = item.z;
  assert.equal(interact(s, p[1], `floor:${item.id}`), true);
  p[0].x = p[1].x; p[0].z = p[1].z;
  assert.equal(giveItem(s, p[1], p[0], p[1].inventory.indexOf('hallKey')), true);
  go(s, p[0], 'hallDoor'); go(s, p[0], 'hallDoor'); assert.equal(s.stage, 1);
});

test('start, proximity and hint penalties are controlled by the server', () => {
  const host = makePlayer('host', 'Hôte', 0); const s = makeGame('ROOM', 'Équipe', host);
  host.ready = true; assert.equal(startGame(s, host.id), false);
  const p = [1, 2, 3].map(n => makePlayer(String(n), String(n), n as 1 | 2 | 3));
  s.players.push(...p); p.forEach(q => q.ready = true);
  assert.equal(startGame(s, p[0].id), false);
  assert.equal(startGame(s, host.id), true);
  assert.equal(interact(s, host, 'buffet'), false); // Too far away.
  assert.equal(requestHint(s), 'La lumière révèle les détails cachés du hall.');
  assert.equal(s.penaltyMs, 60_000);
  requestHint(s); requestHint(s); requestHint(s);
  assert.equal(s.hints, 3); assert.equal(s.penaltyMs, 360_000);
});

test('every required interaction is physically reachable around furniture', () => {
  const { s } = game();
  const step = 0.25;
  const width = 49, height = 33;
  const at = (ix: number, iz: number) => ({ x: -6 + ix * step, z: -4 + iz * step });
  for (let stage = 0; stage < INTERACTABLES.length; stage++) {
    s.stage = stage;
    const start = { x: Math.round((-2.4 + 6) / step), z: Math.round((2.5 + 4) / step) };
    const queue = [start]; const seen = new Set([`${start.x}:${start.z}`]);
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cell.x + dx, nz = cell.z + dz, key = `${nx}:${nz}`;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height || seen.has(key)) continue;
        const p = at(nx, nz); if (!canOccupy(s, p.x, p.z)) continue;
        seen.add(key); queue.push({ x: nx, z: nz });
      }
    }
    for (const target of INTERACTABLES[stage]) {
      assert.ok(queue.some(cell => { const p = at(cell.x, cell.z); return Math.hypot(p.x - target.x, p.z - target.z) < 1.9; }), `stage ${stage}: ${target.id} unreachable`);
    }
  }
});
