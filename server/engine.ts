import { randomUUID } from 'node:crypto';
import { INTERACTABLES, STAGES, type GameState, type Item, type Player, type Vec2 } from '../src/shared.js';

export const MAX_PLAYERS = 4;
const INTERACTION_RADIUS = 1.9;
const SPEED = 2.25;
const RUN_SPEED = 3.8;

export type Input = { x: number; z: number; run: boolean };

export function makeGame(code: string, team: string, host: Player): GameState {
  return { code, team, host: host.id, stage: 0, status: 'lobby', players: [host], flags: {}, nums: {}, floor: [], startedAt: null, finishedAt: null, hints: 0, penaltyMs: 0, event: 'En attente de quatre explorateurs.', eventAt: Date.now() };
}

export function makePlayer(id: string, name: string, avatar: 0 | 1 | 2 | 3): Player {
  return { id, name: name.trim().slice(0, 24) || 'Explorateur', avatar, x: -2.4 + avatar * 1.6, z: 2.5, facing: Math.PI, moving: false, running: false, ready: false, online: true, inventory: [], hold: null, exited: false };
}

function tell(s: GameState, message: string) { s.event = message; s.eventAt = Date.now(); }
function has(p: Player, item: Item) { return p.inventory.includes(item); }
function take(p: Player, item: Item) { const index = p.inventory.indexOf(item); if (index < 0) return false; p.inventory.splice(index, 1); return true; }
function give(s: GameState, p: Player, item: Item) {
  if (p.inventory.length < 4) p.inventory.push(item);
  else s.floor.push({ id: randomUUID(), item, stage: s.stage, x: p.x, z: p.z });
}
function dist(a: Vec2, b: Vec2) { return Math.hypot(a.x - b.x, a.z - b.z); }
function flag(s: GameState, key: string) { return !!s.flags[key]; }

export function startGame(s: GameState, playerId: string) {
  if (s.status !== 'lobby' || playerId !== s.host || s.players.length !== 4 || !s.players.every(p => p.ready && p.online)) return false;
  s.status = 'playing'; s.startedAt = Date.now(); s.stage = 0; tell(s, 'La porte du manoir se referme derrière vous.'); return true;
}

export function canOccupy(s: GameState, px: number, pz: number) {
  if (px < -6.05 || px > 6.05 || pz < -4.15 || pz > 4.1) return false;
  const obstacles: [number, number, number, number][][] = [
      [[-5.95, -3.65, 1.25, 2.95], [s.flags.wardrobeMoved ? 3.55 : 2.55, s.flags.wardrobeMoved ? 5.75 : 4.85, -3.15, -1.25], [-2.05, 2.05, -0.2, 1.6]],
      [[-6.4, -4, -4.5, -3.25], [-4, -1.65, -4.5, -3.25], [3.8, 6.2, -4.5, -3.25], [-6.4, -4, 2.2, 3.5], [-2.05, 2.05, -3.75, -2.1]],
      [[-1.75, 1.75, -4.4, -3.65], [-5.95, -3.65, -3.5, -2.05], [3.65, 5.95, 1.85, 3.25]],
      [[-5.95, -3.65, 1.85, 3.25], [3.65, 5.95, 1.85, 3.25], [-2.05, 2.05, -3.05, -1.55]],
      [[-1.95, 1.95, -0.8, 0.8]],
      [[-3.75, -2.25, s.flags.crateOnPad ? -2.35 : -0.75, s.flags.crateOnPad ? -0.85 : 0.75]],
      [[-2.45, 2.45, -3.2, -1.35]],
      [],
  ];
  if (obstacles[s.stage].some(([minX, maxX, minZ, maxZ]) => px > minX - 0.2 && px < maxX + 0.2 && pz > minZ - 0.2 && pz < maxZ + 0.2)) return false;
  return true;
}

export function movePlayer(s: GameState, p: Player, input: Input, dt: number) {
  if (s.status !== 'playing' || p.exited) return;
  const x = Number.isFinite(input.x) ? Math.max(-1, Math.min(1, input.x)) : 0;
  const z = Number.isFinite(input.z) ? Math.max(-1, Math.min(1, input.z)) : 0;
  const length = Math.hypot(x, z);
  const nx = length > 1 ? x / length : x;
  const nz = length > 1 ? z / length : z;
  const speed = input.run ? RUN_SPEED : SPEED;
  const vx = nx * speed * Math.min(dt, 0.1);
  const vz = nz * speed * Math.min(dt, 0.1);
  if (canOccupy(s, p.x + vx, p.z)) p.x += vx;
  if (canOccupy(s, p.x, p.z + vz)) p.z += vz;
  p.moving = length > 0.08; p.running = p.moving && !!input.run;
  if (p.moving) p.facing = Math.atan2(nx, nz);
  if (p.hold) {
    const target = INTERACTABLES[s.stage].find(i => i.id === p.hold);
    if (!target || dist(p, target) > INTERACTION_RADIUS) p.hold = null;
  }
}

function nextStage(s: GameState) {
  const old = s.stage;
  s.stage++;
  s.floor.filter(f => f.stage === old).forEach(f => { f.stage = s.stage; f.x = -3 + Math.random() * 6; f.z = 2.2; });
  s.players.forEach((p, i) => { p.x = -2.4 + i * 1.6; p.z = 2.5; p.hold = null; p.exited = false; });
  tell(s, STAGES[s.stage].name);
}

export function interact(s: GameState, p: Player, id: string) {
  if (s.status !== 'playing' || !p.online || p.exited) return false;
  if (id.startsWith('floor:')) {
    const found = s.floor.find(f => `floor:${f.id}` === id && f.stage === s.stage);
    if (!found || dist(p, found) > INTERACTION_RADIUS || p.inventory.length >= 4) return false;
    p.inventory.push(found.item); s.floor.splice(s.floor.indexOf(found), 1); tell(s, `${p.name} récupère un objet.`); return true;
  }
  const target = INTERACTABLES[s.stage].find(i => i.id === id);
  if (!target || dist(p, target) > INTERACTION_RADIUS || (target.requires && !flag(s, target.requires))) return false;
  p.action = target.kind === 'hold' ? 'use' : target.kind;
  p.actionAt = Date.now();
  const once = (key: string, message: string, item?: Item) => {
    if (flag(s, key)) return false;
    s.flags[key] = true; if (item) give(s, p, item); tell(s, message); return true;
  };
  const consume = (item: Item, key: string, message: string) => {
    if (flag(s, key) || !take(p, item)) return false;
    s.flags[key] = true; tell(s, message); return true;
  };
  switch (s.stage) {
    case 0:
      if (id === 'buffet') return once('buffetOpen', 'Une lampe encore fonctionnelle se trouvait dans le buffet.', 'lamp');
      if (id === 'painting') { if (!flag(s, 'wardrobeMoved')) { tell(s, 'Le cadre résiste. Quelque chose le retient.'); return false; } if (!has(p, 'lamp')) { tell(s, 'Des marques sombres sur le cadre demandent de la lumière.'); return false; } return once('paintingOpen', 'La lampe révèle un loquet. Le tableau pivote et dévoile une cachette.'); }
      if (id === 'key') return once('keyTaken', 'La clé du passage est récupérée.', 'hallKey');
      if (id === 'hallDoor' && flag(s, 'hallDoorOpen')) { nextStage(s); return true; }
      if (id === 'hallDoor' && flag(s, 'buffetOpen') && flag(s, 'paintingOpen') && take(p, 'hallKey')) return once('hallDoorOpen', 'La clé tourne. Les deux battants s’ouvrent vers la bibliothèque.');
      break;
    case 1:
      if (id === 'bookA' || id === 'bookB' || id === 'bookC') return once(`${id}Taken`, `${p.name} trouve un livre marqué.`, id);
      if (id === 'slotA') return consume('bookA', 'slotA', 'Le soleil s’aligne.');
      if (id === 'slotB') return consume('bookB', 'slotB', 'La lune s’aligne.');
      if (id === 'slotC') return consume('bookC', 'slotC', 'L’étoile s’aligne.');
      if (id === 'bookcase' && ['slotA', 'slotB', 'slotC'].every(k => flag(s, k))) return once('bookcaseOpen', 'La bibliothèque coulisse. Un sceau tombe du mécanisme.', 'sigil');
      if (id === 'libraryDoor' && flag(s, 'bookcaseOpen')) { nextStage(s); return true; }
      break;
    case 2:
      if (id === 'fuseA' || id === 'fuseB' || id === 'tool') return once(`${id}Taken`, `${p.name} récupère ${id === 'tool' ? 'une clé isolée' : 'un fusible'}.`, id);
      if (id === 'panelA') return consume('fuseA', 'panelA', 'Premier fusible installé.');
      if (id === 'panelB') return consume('fuseB', 'panelB', 'Second fusible installé.');
      if (id === 'repair' && flag(s, 'panelA') && flag(s, 'panelB')) return consume('tool', 'repaired', 'Le tableau réparé attend les deux circuits.');
      if (id === 'basementDoor' && flag(s, 'powerOn')) { nextStage(s); return true; }
      break;
    case 3:
      if (id === 'blue' || id === 'amber' || id === 'red') return once(`${id}Taken`, `${p.name} récupère une fiole.`, id);
      if (id === 'mixBlue' || id === 'mixAmber' || id === 'mixRed') {
        const order: Item[] = ['blue', 'amber', 'red'];
        const index = s.nums.mixStep || 0;
        const item = id.slice(3).toLowerCase() as Item;
        if (item !== order[index]) { tell(s, 'La recette indique un autre ordre.'); return false; }
        if (!has(p, item)) return false;
        take(p, item); s.nums.mixStep = index + 1; tell(s, `Le ${item === 'blue' ? 'bleu' : item === 'amber' ? 'ambre' : 'rouge'} traverse la machine.`); return true;
      }
      if (id === 'mixer' && s.nums.mixStep === 3) return once('prismMade', 'Un prisme lumineux sort de la machine.', 'prism');
      if (id === 'labDoor' && flag(s, 'prismMade')) { nextStage(s); return true; }
      break;
    case 4:
      if (id === 'machineDoor' && flag(s, 'machineDone')) { nextStage(s); return true; }
      break;
    case 5:
      if (id === 'crate') return once('crateOnPad', 'La caisse glisse sur la première dalle.');
      if (id === 'grate' && flag(s, 'crateOnPad') && s.players.some(q => q.hold === 'pad') && s.players.some(q => has(q, 'lamp'))) return once('grateOpen', 'La grille remonte dans un grondement de métal.');
      if (id === 'passageDoor' && flag(s, 'grateOpen')) { nextStage(s); return true; }
      break;
    case 6:
      if (id === 'socketSigil') return consume('sigil', 'socketSigil', 'Le sceau s’enclenche.');
      if (id === 'socketPrism') return consume('prism', 'socketPrism', 'Le prisme illumine le coffre.');
      if (id === 'socketGear') return consume('gear', 'socketGear', 'L’engrenage tourne.');
      if (id === 'chest' && ['socketSigil', 'socketPrism', 'socketGear'].every(k => flag(s, k))) return once('chestOpen', 'Le coffre s’ouvre lentement.');
      if (id === 'finalKey') return once('finalKeyTaken', 'La clé finale est récupérée.', 'finalKey');
      if (id === 'vaultDoor' && flag(s, 'finalKeyTaken')) { nextStage(s); return true; }
      break;
    case 7:
      if (id === 'keyhole') return consume('finalKey', 'keyInserted', 'La clé tourne. Quatre commandes s’illuminent.');
      if (id === 'exit' && flag(s, 'finalOpen')) {
        p.exited = true; p.hold = null; tell(s, `${p.name} franchit la porte.`);
        if (s.players.length === 4 && s.players.every(q => q.exited)) { s.status = 'won'; s.finishedAt = Date.now(); tell(s, 'Les quatre explorateurs se sont échappés du manoir !'); }
        return true;
      }
      break;
  }
  tell(s, 'Le mécanisme attend encore quelque chose.'); return false;
}

export function setHold(s: GameState, p: Player, id: string | null) {
  if (s.status !== 'playing' || !p.online || p.exited) return false;
  if (id === null) { p.hold = null; return true; }
  const target = INTERACTABLES[s.stage].find(i => i.id === id && i.kind === 'hold');
  if (!target || dist(p, target) > INTERACTION_RADIUS) return false;
  p.hold = id; p.action = id.startsWith('wardrobe') ? 'push' : 'use'; p.actionAt = Date.now(); tell(s, `${p.name} maintient ${target.label.toLowerCase()}.`); return true;
}

export function tickMechanisms(s: GameState, dt: number) {
  if (s.status !== 'playing') return;
  let targets: string[] = [];
  let prerequisite = true;
  let outcome = '';
  let duration = 2;
  if (s.stage === 0) { targets = ['wardrobeLeft', 'wardrobeRight']; outcome = 'wardrobeMoved'; duration = 1.8; }
  if (s.stage === 2) { targets = ['switchA', 'switchB']; prerequisite = flag(s, 'repaired'); outcome = 'powerOn'; duration = 1.5; }
  if (s.stage === 4) { targets = ['lever', 'wheel', 'feed', 'lock']; outcome = 'machineDone'; duration = 3; }
  if (s.stage === 7) { targets = ['finalA', 'finalB', 'finalC', 'finalD']; prerequisite = flag(s, 'keyInserted'); outcome = 'finalOpen'; duration = 3; }
  if (!targets.length || flag(s, outcome)) return;
  const holders = targets.map(id => s.players.find(p => p.online && p.hold === id && !p.exited));
  const distinct = new Set(holders.filter(Boolean).map(p => p!.id));
  const valid = prerequisite && distinct.size === targets.length;
  s.nums.holdProgress = valid ? (s.nums.holdProgress || 0) + dt : 0;
  if (s.nums.holdProgress >= duration) {
    s.flags[outcome] = true; s.nums.holdProgress = duration;
    s.players.forEach(p => { p.hold = null; });
    if (s.stage === 4) give(s, s.players[0], 'gear');
    tell(s, s.stage === 0 ? 'Les deux explorateurs poussent l’armoire. Le cadre du tableau se déverrouille.' : s.stage === 2 ? 'Le courant revient dans tout le sous-sol.' : s.stage === 4 ? 'Les quatre postes s’accordent. Un engrenage est libéré.' : 'La porte finale s’ouvre dans un éclat de lumière.');
  }
}

export function requestHint(s: GameState) {
  if (s.status !== 'playing') return null;
  const key = `hint${s.stage}`;
  const next = s.nums[key] || 0;
  if (next >= 3) return STAGES[s.stage].hints[2];
  s.nums[key] = next + 1; s.hints++; s.penaltyMs += (next + 1) * 60_000;
  tell(s, `Indice ${next + 1} obtenu (+${next + 1} min au classement).`);
  return STAGES[s.stage].hints[next];
}

export function dropItem(s: GameState, p: Player, slot: number) {
  if (s.status !== 'playing' || !Number.isInteger(slot) || slot < 0 || slot >= p.inventory.length) return false;
  const item = p.inventory.splice(slot, 1)[0];
  s.floor.push({ id: randomUUID(), item, stage: s.stage, x: p.x, z: p.z }); tell(s, `${p.name} dépose un objet.`); return true;
}

export function giveItem(s: GameState, from: Player, to: Player, slot: number) {
  if (s.status !== 'playing' || from.id === to.id || !to.online || dist(from, to) > INTERACTION_RADIUS || to.inventory.length >= 4 || !Number.isInteger(slot) || slot < 0 || slot >= from.inventory.length) return false;
  to.inventory.push(from.inventory.splice(slot, 1)[0]); tell(s, `${from.name} transmet un objet à ${to.name}.`); return true;
}
