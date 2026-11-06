export type Vec2 = { x: number; z: number };
export type Item = 'lamp' | 'hallKey' | 'bookA' | 'bookB' | 'bookC' | 'fuseA' | 'fuseB' | 'tool' | 'red' | 'blue' | 'amber' | 'prism' | 'sigil' | 'gear' | 'finalKey';
export type Avatar = 0 | 1 | 2 | 3;
export type Player = { id: string; name: string; avatar: Avatar; x: number; z: number; facing: number; moving: boolean; running: boolean; ready: boolean; online: boolean; inventory: Item[]; hold: string | null; exited: boolean; action?: 'search' | 'take' | 'use' | 'door' | 'push' | 'inspect'; actionAt?: number };
export type FloorItem = { id: string; item: Item; x: number; z: number; stage: number };
export type GameState = { code: string; team: string; host: string; stage: number; status: 'lobby' | 'playing' | 'won'; players: Player[]; flags: Record<string, boolean>; nums: Record<string, number>; floor: FloorItem[]; startedAt: number | null; finishedAt: number | null; hints: number; penaltyMs: number; event: string; eventAt: number; serverNow?: number };
export type LeaderRow = { team: string; playerIds: string[]; elapsedMs: number; hints: number; penaltyMs: number; rankedMs: number; completedAt: number; world: string };
export type ServerMessage = { type: 'welcome'; id: string; token: string; state: GameState } | { type: 'state'; state: GameState } | { type: 'error'; message: string } | { type: 'hint'; text: string } | { type: 'leaderboard'; rows: LeaderRow[] };
export type ClientMessage =
  | { type: 'create'; team: string; name: string; avatar: Avatar }
  | { type: 'join'; code: string; name: string; avatar: Avatar }
  | { type: 'resume'; code: string; id: string; token: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'leave' }
  | { type: 'start' }
  | { type: 'input'; x: number; z: number; run: boolean }
  | { type: 'interact'; target: string }
  | { type: 'hold'; target: string | null }
  | { type: 'drop'; slot: number }
  | { type: 'give'; slot: number; to: string }
  | { type: 'hint' }
  | { type: 'leaderboard'; period: 'all' | 'week' | 'month' };

export const STAGES = [
  { name: 'Le hall abandonné', objective: 'Trouver le passage vers la bibliothèque.', hints: ['La lumière révèle les détails cachés du hall.', 'Fouille le buffet. Deux explorateurs peuvent pousser l’armoire ensemble.', 'Prends la lampe, maintiens les deux côtés de l’armoire avec deux joueurs, éclaire le tableau, prends la clé puis ouvre et franchis la porte.'] },
  { name: 'La bibliothèque mystérieuse', objective: 'Découvrir l’escalier dissimulé.', hints: ['Les trois reliures marquées ont une place réservée.', 'Observe les symboles sur les livres et les niches du pupitre.', 'Récupère les trois livres et place-les dans les niches correspondantes, puis actionne la bibliothèque.'] },
  { name: 'Le sous-sol électrique', objective: 'Rétablir le courant et ouvrir le laboratoire.', hints: ['Le tableau attend deux fusibles et un outil.', 'Deux interrupteurs doivent rester actifs ensemble.', 'Place les deux fusibles, utilise l’outil sur le tableau, puis maintiens les deux interrupteurs à deux joueurs.'] },
  { name: 'Le laboratoire', objective: 'Fabriquer le composant de la serrure.', hints: ['La recette est inscrite près de la machine.', 'Le mélange suit les couleurs du vitrail : bleu, ambre, rouge.', 'Récupère les trois fioles, verse-les dans l’ordre bleu, ambre, rouge et lance la machine.'] },
  { name: 'La salle des machines', objective: 'Synchroniser les quatre postes.', hints: ['Chaque poste a besoin d’une personne.', 'Tenez les quatre commandes en même temps pendant quelques secondes.', 'Un joueur maintient le levier, un la roue, un l’alimentation et un le verrou jusqu’au signal vert.'] },
  { name: 'Le passage secret', objective: 'Franchir la grille du passage.', hints: ['Une caisse peut peser sur une dalle.', 'Une seconde dalle doit être tenue pendant que la grille s’ouvre.', 'Pousse la caisse sur la dalle marquée, maintiens la seconde dalle avec un joueur et actionne la grille.'] },
  { name: 'Le coffre central', objective: 'Ouvrir le coffre et récupérer la clé finale.', hints: ['Les objets recueillis plus tôt correspondent aux trois empreintes.', 'Le sceau, le prisme et l’engrenage sont nécessaires.', 'Place le sceau, le prisme et l’engrenage dans le coffre, tourne la serrure puis prends la clé.'] },
  { name: 'La porte finale', objective: 'Ouvrir la porte et sortir tous ensemble.', hints: ['La clé n’achève pas seule le mécanisme.', 'Quatre commandes doivent être maintenues simultanément.', 'Insère la clé, maintiens les quatre commandes à quatre joueurs puis entrez tous dans la zone de sortie.'] },
] as const;

export type Interactable = { id: string; label: string; x: number; z: number; kind: 'search' | 'take' | 'use' | 'door' | 'hold' | 'push' | 'inspect'; requires?: string };
export const INTERACTABLES: Interactable[][] = [
  [
    { id: 'buffet', label: 'Fouiller le buffet', x: -4.7, z: 2.2, kind: 'search' },
    { id: 'wardrobeLeft', label: 'Pousser le côté gauche de l’armoire', x: 2.8, z: -2.2, kind: 'hold' },
    { id: 'wardrobeRight', label: 'Pousser le côté droit de l’armoire', x: 4.6, z: -2.2, kind: 'hold' },
    { id: 'painting', label: 'Examiner le tableau', x: 5.8, z: -3.8, kind: 'inspect' },
    { id: 'key', label: 'Prendre la clé', x: 5.5, z: -3.5, kind: 'take', requires: 'paintingOpen' },
    { id: 'hallDoor', label: 'Ouvrir la bibliothèque', x: 0, z: -4.55, kind: 'door' },
  ],
  [
    { id: 'bookA', label: 'Prendre le livre au soleil', x: -5, z: -2.8, kind: 'take' },
    { id: 'bookB', label: 'Prendre le livre à la lune', x: 4.8, z: -2.7, kind: 'take' },
    { id: 'bookC', label: 'Prendre le livre à l’étoile', x: -4.5, z: 2.9, kind: 'take' },
    { id: 'slotA', label: 'Placer le livre au soleil', x: -1.5, z: -3.4, kind: 'use' },
    { id: 'slotB', label: 'Placer le livre à la lune', x: 0, z: -3.4, kind: 'use' },
    { id: 'slotC', label: 'Placer le livre à l’étoile', x: 1.5, z: -3.4, kind: 'use' },
    { id: 'bookcase', label: 'Faire coulisser la bibliothèque', x: 5.5, z: -1.2, kind: 'push' },
    { id: 'libraryDoor', label: 'Descendre au sous-sol', x: 0, z: -4.6, kind: 'door' },
  ],
  [
    { id: 'fuseA', label: 'Prendre le fusible gauche', x: -5, z: 2.7, kind: 'take' },
    { id: 'fuseB', label: 'Prendre le fusible droit', x: 4.9, z: 2.5, kind: 'take' },
    { id: 'tool', label: 'Prendre la clé isolée', x: -4.8, z: -2.8, kind: 'take' },
    { id: 'panelA', label: 'Insérer le premier fusible', x: -1.2, z: -3.5, kind: 'use' },
    { id: 'panelB', label: 'Insérer le second fusible', x: 0, z: -3.5, kind: 'use' },
    { id: 'repair', label: 'Réparer le tableau', x: 1.2, z: -3.5, kind: 'use' },
    { id: 'switchA', label: 'Maintenir l’interrupteur A', x: -5.3, z: 0, kind: 'hold' },
    { id: 'switchB', label: 'Maintenir l’interrupteur B', x: 5.3, z: 0, kind: 'hold' },
    { id: 'basementDoor', label: 'Ouvrir le laboratoire', x: 0, z: -4.6, kind: 'door' },
  ],
  [
    { id: 'blue', label: 'Prendre la fiole bleue', x: -5, z: 2.5, kind: 'take' },
    { id: 'amber', label: 'Prendre la fiole ambre', x: 0, z: 2.6, kind: 'take' },
    { id: 'red', label: 'Prendre la fiole rouge', x: 5, z: 2.5, kind: 'take' },
    { id: 'mixBlue', label: 'Verser la fiole bleue', x: -1.2, z: -2.3, kind: 'use' },
    { id: 'mixAmber', label: 'Verser la fiole ambre', x: 0, z: -2.3, kind: 'use' },
    { id: 'mixRed', label: 'Verser la fiole rouge', x: 1.2, z: -2.3, kind: 'use' },
    { id: 'mixer', label: 'Activer le mélangeur', x: 0, z: -3.2, kind: 'use' },
    { id: 'labDoor', label: 'Ouvrir la salle des machines', x: 0, z: -4.6, kind: 'door' },
  ],
  [
    { id: 'lever', label: 'Maintenir le levier', x: -5, z: -2.5, kind: 'hold' },
    { id: 'wheel', label: 'Tourner la roue', x: 5, z: -2.5, kind: 'hold' },
    { id: 'feed', label: 'Alimenter le mécanisme', x: -5, z: 2.5, kind: 'hold' },
    { id: 'lock', label: 'Maintenir le verrou', x: 5, z: 2.5, kind: 'hold' },
    { id: 'machineDoor', label: 'Ouvrir le passage secret', x: 0, z: -4.6, kind: 'door' },
  ],
  [
    { id: 'crate', label: 'Pousser la caisse sur la dalle', x: -3, z: 0, kind: 'push' },
    { id: 'pad', label: 'Maintenir la dalle', x: 3.5, z: 1.5, kind: 'hold' },
    { id: 'grate', label: 'Lever la grille', x: 0, z: -3.8, kind: 'use' },
    { id: 'passageDoor', label: 'Entrer dans la chambre du coffre', x: 0, z: -4.6, kind: 'door' },
  ],
  [
    { id: 'socketSigil', label: 'Placer le sceau', x: -1.7, z: -1.2, kind: 'use' },
    { id: 'socketPrism', label: 'Placer le prisme', x: 0, z: -1.2, kind: 'use' },
    { id: 'socketGear', label: 'Placer l’engrenage', x: 1.7, z: -1.2, kind: 'use' },
    { id: 'chest', label: 'Tourner la serrure du coffre', x: 0, z: -1.2, kind: 'use' },
    { id: 'finalKey', label: 'Prendre la clé finale', x: 0, z: -1.2, kind: 'take', requires: 'chestOpen' },
    { id: 'vaultDoor', label: 'Ouvrir la porte finale', x: 0, z: -4.6, kind: 'door' },
  ],
  [
    { id: 'keyhole', label: 'Insérer la clé finale', x: 0, z: -3.7, kind: 'use' },
    { id: 'finalA', label: 'Maintenir le mécanisme I', x: -5, z: -2, kind: 'hold' },
    { id: 'finalB', label: 'Maintenir le mécanisme II', x: 5, z: -2, kind: 'hold' },
    { id: 'finalC', label: 'Maintenir le mécanisme III', x: -5, z: 2, kind: 'hold' },
    { id: 'finalD', label: 'Maintenir le mécanisme IV', x: 5, z: 2, kind: 'hold' },
    { id: 'exit', label: 'Entrer dans la lumière', x: 0, z: -4.6, kind: 'door', requires: 'finalOpen' },
  ],
];

export const COLORS = ['#a7886c', '#8f9cb4', '#a38364', '#687e82'] as const;
export const ITEM_NAMES: Record<Item, string> = { lamp: 'Lampe', hallKey: 'Clé du hall', bookA: 'Livre Soleil', bookB: 'Livre Lune', bookC: 'Livre Étoile', fuseA: 'Fusible A', fuseB: 'Fusible B', tool: 'Clé isolée', red: 'Fiole rouge', blue: 'Fiole bleue', amber: 'Fiole ambre', prism: 'Prisme', sigil: 'Sceau', gear: 'Engrenage', finalKey: 'Clé finale' };

export function availableTargets(state: GameState): Interactable[] {
  const done = state.flags;
  return INTERACTABLES[state.stage].filter(t => {
    if (t.requires && !done[t.requires]) return false;
    if (t.id === 'buffet' && done.buffetOpen) return false;
    if (t.id.startsWith('wardrobe') && done.wardrobeMoved) return false;
    if (t.id === 'painting' && done.paintingOpen) return false;
    if (t.id === 'key' && done.keyTaken) return false;
    if (['bookA', 'bookB', 'bookC', 'fuseA', 'fuseB', 'tool', 'blue', 'amber', 'red'].includes(t.id) && done[`${t.id}Taken`]) return false;
    if (['slotA', 'slotB', 'slotC', 'panelA', 'panelB', 'repair', 'socketSigil', 'socketPrism', 'socketGear'].includes(t.id) && done[t.id === 'repair' ? 'repaired' : t.id]) return false;
    if (t.id === 'bookcase' && done.bookcaseOpen) return false;
    if ((t.id === 'switchA' || t.id === 'switchB') && done.powerOn) return false;
    if (t.id === 'mixBlue' && (state.nums.mixStep || 0) >= 1) return false;
    if (t.id === 'mixAmber' && (state.nums.mixStep || 0) >= 2) return false;
    if (t.id === 'mixRed' && (state.nums.mixStep || 0) >= 3) return false;
    if (t.id === 'mixer' && done.prismMade) return false;
    if (['lever', 'wheel', 'feed', 'lock'].includes(t.id) && done.machineDone) return false;
    if (t.id === 'crate' && done.crateOnPad) return false;
    if ((t.id === 'pad' || t.id === 'grate') && done.grateOpen) return false;
    if (t.id === 'chest' && done.chestOpen) return false;
    if (t.id === 'finalKey' && done.finalKeyTaken) return false;
    if (t.id === 'keyhole' && done.keyInserted) return false;
    if (t.id.startsWith('final') && t.kind === 'hold' && done.finalOpen) return false;
    return true;
  });
}
