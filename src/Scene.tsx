import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Sparkles, useAnimations, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { COLORS, availableTargets, type GameState, type Interactable, type Player } from './shared';

type SceneProps = { state: GameState; selfId: string; onInteract: (id: string) => void; onHold: (id: string | null) => void };
const mat = (color: string, metalness = 0, roughness = 0.7) => ({ color, metalness, roughness });

function Box({ pos, size, color, metal = 0, rotation = [0, 0, 0] }: { pos: [number, number, number]; size: [number, number, number]; color: string; metal?: number; rotation?: [number, number, number] }) {
  return <mesh position={pos} rotation={rotation} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial {...mat(color, metal)} /></mesh>;
}
function Cylinder({ pos, radius = 0.5, height = 1, color, sides = 16, metal = 0, rotation = [0, 0, 0] }: { pos: [number, number, number]; radius?: number; height?: number; color: string; sides?: number; metal?: number; rotation?: [number, number, number] }) {
  return <mesh position={pos} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[radius, radius, height, sides]} /><meshStandardMaterial {...mat(color, metal)} /></mesh>;
}
function Sphere({ pos, radius, color, emissive }: { pos: [number, number, number]; radius: number; color: string; emissive?: string }) {
  return <mesh position={pos} castShadow><sphereGeometry args={[radius, 16, 12]} /><meshStandardMaterial color={color} emissive={emissive || '#000000'} emissiveIntensity={emissive ? 1.5 : 0} roughness={0.55} /></mesh>;
}

function RoomShell({ stage, lowQuality }: { stage: number; lowQuality: boolean }) {
  const stone = stage === 2 || stage === 5 ? '#29333a' : stage === 4 ? '#34323a' : '#39333b';
  const floor = stage === 2 || stage === 5 ? '#303638' : stage === 3 ? '#4a4140' : '#4e3a35';
  return <group>
    <Box pos={[0, -0.2, 0]} size={[14, 0.35, 10]} color={floor} />
    {Array.from({ length: 12 }, (_, i) => <Box key={`plank-${i}`} pos={[-6.4 + i * 1.16, 0.015, 0]} size={[0.012, 0.02, 9.8]} color={stage === 2 || stage === 5 ? '#465052' : '#745045'} />)}
    <Box pos={[0, 2.65, -5]} size={[14.4, 5.7, 0.45]} color={stone} />
    <Box pos={[-7.05, 2.65, 0]} size={[0.45, 5.7, 10.4]} color={stone} />
    <Box pos={[7.05, 2.65, 0]} size={[0.45, 5.7, 10.4]} color={stone} />
    {[-6.6, -3.3, 3.3, 6.6].map((x, i) => <group key={i}>
      <Box pos={[x, 2.7, -4.72]} size={[0.22, 5.2, 0.18]} color="#75665e" />
      <Box pos={[x, 5.1, -4.65]} size={[0.43, 0.19, 0.35]} color="#a68a6d" />
      <Box pos={[x, 0.45, -4.65]} size={[0.4, 0.17, 0.36]} color="#a68a6d" />
    </group>)}
    <Box pos={[0, 0.35, -4.72]} size={[14, 0.28, 0.2]} color="#93765d" />
    <Box pos={[0, 4.9, -4.7]} size={[14, 0.22, 0.23]} color="#93765d" />
    {[-6.65, 6.65].map((x, i) => <group key={i}>
      <Box pos={[x, 2.7, 0]} size={[0.23, 5.2, 0.2]} color="#77675f" />
      <Box pos={[x, 4.9, 0]} size={[0.45, 0.2, 9.8]} color="#a68a6d" />
      {[-3.4, -0.5, 2.5].map((z, j) => <Box key={j} pos={[x, 2.65, z]} size={[0.27, 3.5, 0.12]} color="#6a5c58" />)}
    </group>)}
    <Box pos={[0, 0.02, 0.4]} size={[4.1, 0.015, 5.7]} color={stage === 3 ? '#4f6568' : stage === 5 ? '#405056' : '#6b3037'} />
    <Box pos={[0, 0.034, 0.4]} size={[3.6, 0.012, 5.2]} color={stage === 3 ? '#788a80' : stage === 5 ? '#6c7272' : '#9c6c59'} />
    <Box pos={[0, 0.041, 0.4]} size={[3.15, 0.01, 4.75]} color={stage === 3 ? '#435355' : stage === 5 ? '#374149' : '#542c36'} />
    {!lowQuality && <ContactShadows position={[0, 0.03, 0]} opacity={0.4} scale={16} blur={2.8} far={5} />}
  </group>;
}

function Door({ open, final = false }: { open: boolean; final?: boolean }) {
  const left = useRef<THREE.Group>(null); const right = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const t = Math.min(1, dt * 2.2);
    if (left.current) { left.current.position.x = THREE.MathUtils.lerp(left.current.position.x, open ? -1.15 : -0.68, t); left.current.position.z = THREE.MathUtils.lerp(left.current.position.z, open ? 0.95 : 0.28, t); left.current.rotation.y = THREE.MathUtils.lerp(left.current.rotation.y, open ? -Math.PI / 2.7 : 0, t); }
    if (right.current) { right.current.position.x = THREE.MathUtils.lerp(right.current.position.x, open ? 1.15 : 0.68, t); right.current.position.z = THREE.MathUtils.lerp(right.current.position.z, open ? 0.95 : 0.28, t); right.current.rotation.y = THREE.MathUtils.lerp(right.current.rotation.y, open ? Math.PI / 2.7 : 0, t); }
  });
  return <group position={[0, 0, -4.72]}>
    <Box pos={[-1.5, 2.3, 0.2]} size={[0.25, 4.6, 0.52]} color="#b59360" metal={0.4} />
    <Box pos={[1.5, 2.3, 0.2]} size={[0.25, 4.6, 0.52]} color="#b59360" metal={0.4} />
    <Box pos={[0, 4.55, 0.2]} size={[3.2, 0.3, 0.52]} color="#b59360" metal={0.4} />
    <Box pos={[0, 2.3, -0.05]} size={[2.8, 4.3, 0.13]} color="#101d22" />
    <group ref={left} position={[-0.68, 2.2, 0.28]}>
      <Box pos={[0, 0, 0]} size={[1.36, 4.2, 0.24]} color={final ? '#4f5960' : '#432b25'} metal={final ? 0.55 : 0} />
      {[-1.1, 0.3, 1.3].map((y, i) => <Box key={i} pos={[0, y, 0.14]} size={[1.1, 0.75, 0.07]} color={final ? '#798a89' : '#795539'} />)}
      <Sphere pos={[0.47, -0.15, 0.24]} radius={0.08} color="#d4b16e" />
    </group>
    <group ref={right} position={[0.68, 2.2, 0.28]}>
      <Box pos={[0, 0, 0]} size={[1.36, 4.2, 0.24]} color={final ? '#4f5960' : '#432b25'} metal={final ? 0.55 : 0} />
      {[-1.1, 0.3, 1.3].map((y, i) => <Box key={i} pos={[0, y, 0.14]} size={[1.1, 0.75, 0.07]} color={final ? '#798a89' : '#795539'} />)}
      <Sphere pos={[-0.47, -0.15, 0.24]} radius={0.08} color="#d4b16e" />
    </group>
    {final && <group><Cylinder pos={[0, 3.45, 0.5]} radius={0.47} height={0.16} color="#b7975d" metal={0.7} rotation={[Math.PI / 2, 0, 0]} /><Sphere pos={[0, 3.45, 0.6]} radius={0.18} color="#d8c592" emissive={open ? '#f7d991' : undefined} /></group>}
  </group>;
}

function Cabinet({ x, z, tall = false, moved = false }: { x: number; z: number; tall?: boolean; moved?: boolean }) {
  const h = tall ? 3.5 : 1.65;
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (root.current) root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, x + (moved ? 0.8 : 0), Math.min(1, dt * 2)); });
  return <group ref={root} position={[x, 0, z]}>
    {[[-0.8, -0.48], [0.8, -0.48], [-0.8, 0.48], [0.8, 0.48]].map(([px, pz], i) => <Cylinder key={i} pos={[px, 0.25, pz]} radius={0.09} height={0.5} color="#71523c" />)}
    <Box pos={[0, h / 2 + 0.38, 0]} size={[1.9, h, 1.18]} color="#4b3028" />
    <Box pos={[0, h + 0.4, 0]} size={[2.08, 0.14, 1.32]} color="#a27a52" />
    {[-0.46, 0.46].map((px, i) => <group key={i}>
      <Box pos={[px, h / 2 + 0.38, 0.62]} size={[0.82, h - 0.18, 0.08]} color="#745139" />
      <Box pos={[px, h / 2 + 0.38, 0.67]} size={[0.65, h - 0.48, 0.035]} color="#51362b" />
      <Sphere pos={[px + (i ? -0.22 : 0.22), h / 2 + 0.4, 0.73]} radius={0.06} color="#d4a968" />
    </group>)}
    <Box pos={[0, 0.5, 0.66]} size={[1.85, 0.11, 0.12]} color="#b48a5b" />
  </group>;
}

function Bookshelf({ x, z, slide = false }: { x: number; z: number; slide?: boolean }) {
  const colors = ['#943f3e', '#a58351', '#3b6265', '#735c72', '#918870', '#a9654d'];
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (root.current) root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, x + (slide ? 1.9 : 0), Math.min(1, dt * 1.4)); });
  return <group ref={root} position={[x, 0, z]}>
    <Box pos={[0, 2.1, 0]} size={[2.15, 4.1, 0.58]} color="#3e2a25" />
    {Array.from({ length: 4 }, (_, row) => <group key={row}>
      <Box pos={[0, 0.75 + row * 0.94, 0.4]} size={[2.24, 0.11, 0.77]} color="#946c4b" />
      {Array.from({ length: 11 }, (_, col) => <Box key={col} pos={[-0.88 + col * 0.17, 0.42 + row * 0.94 + ((col * 7) % 3) * 0.03, 0.44]} size={[0.13, 0.5 + ((col * 7) % 3) * 0.07, 0.34]} color={colors[(col + row * 3) % colors.length]} />)}
    </group>)}
    <Box pos={[0, 4.19, 0.12]} size={[2.38, 0.18, 0.78]} color="#b08b62" />
  </group>;
}

function Table({ x, z, wide = false }: { x: number; z: number; wide?: boolean }) {
  const w = wide ? 3.6 : 2.2;
  return <group position={[x, 0, z]}>
    <Box pos={[0, 1.15, 0]} size={[w, 0.2, 1.35]} color="#815c42" />
    {[-1, 1].flatMap(a => [-1, 1].map(b => <Cylinder key={`${a}${b}`} pos={[a * (w / 2 - 0.18), 0.55, b * 0.48]} radius={0.085} height={1.05} color="#5b3d30" />))}
    <Box pos={[0, 0.87, 0.55]} size={[w - 0.35, 0.08, 0.12]} color="#b1855b" />
  </group>;
}

function Sconce({ x, z = -4.55, lit = true }: { x: number; z?: number; lit?: boolean }) {
  return <group position={[x, 3.4, z]}>
    <Box pos={[0, 0, 0]} size={[0.25, 0.6, 0.2]} color="#ad8a55" metal={0.7} />
    <Cylinder pos={[0, -0.18, 0.22]} radius={0.19} height={0.08} color="#b29260" metal={0.6} />
    <Cylinder pos={[0, 0.12, 0.22]} radius={0.11} height={0.52} color="#ddd0a4" />
    <Sphere pos={[0, 0.48, 0.22]} radius={0.13} color={lit ? '#ffdc9b' : '#4b4b46'} emissive={lit ? '#ffae53' : undefined} />
    {lit && <pointLight position={[0, 0.4, 0.3]} intensity={1.5} distance={5.5} color="#ffb16a" />}
  </group>;
}

function Gear({ x, y, z, radius = 0.65, spin = 0 }: { x: number; y: number; z: number; radius?: number; spin?: number }) {
  return <group position={[x, y, z]} rotation={[Math.PI / 2, 0, spin]}>
    <Cylinder pos={[0, 0, 0]} radius={radius} height={0.18} color="#a17b50" metal={0.8} />
    <Cylinder pos={[0, 0.1, 0]} radius={radius * 0.35} height={0.22} color="#494644" metal={0.5} />
    {Array.from({ length: 12 }, (_, i) => <Box key={i} pos={[Math.sin(i * Math.PI / 6) * radius, 0, Math.cos(i * Math.PI / 6) * radius]} size={[0.19, 0.17, 0.26]} color="#a17b50" metal={0.8} rotation={[0, i * Math.PI / 6, 0]} />)}
  </group>;
}

function Painting({ open }: { open: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (root.current) root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, open ? -0.65 : 0, Math.min(1, dt * 2)); });
  return <group ref={root} position={[5.8, 2.8, -4.45]}>
    <Box pos={[0, 0, 0]} size={[1.45, 1.9, 0.12]} color="#c5a16f" />
    <Box pos={[0, 0, 0.08]} size={[1.15, 1.58, 0.06]} color="#252c37" />
    <Cylinder pos={[0, 0.28, 0.14]} radius={0.34} height={0.05} color="#9e8769" rotation={[Math.PI / 2, 0, 0]} />
    <Box pos={[0, -0.32, 0.14]} size={[0.78, 0.45, 0.04]} color="#465a5e" />
  </group>;
}

function StageDecor({ state }: { state: GameState }) {
  const s = state.stage; const f = state.flags;
  return <group>
    <Door open={s === 0 ? !!f.hallDoorOpen : s === 1 ? !!f.bookcaseOpen : s === 2 ? !!f.powerOn : s === 3 ? !!f.prismMade : s === 4 ? !!f.machineDone : s === 5 ? !!f.grateOpen : s === 6 ? !!f.chestOpen : !!f.finalOpen} final={s === 7} />
    <Sconce x={-4.2} lit={s !== 2 || !!f.powerOn} /><Sconce x={4.2} lit={s !== 2 || !!f.powerOn} />
    {s === 0 && <>
      <Cabinet x={-4.8} z={2.1} /><Cabinet x={3.7} z={-2.25} tall moved={!!f.wardrobeMoved} />
      <Table x={0} z={0.7} wide />
      <Cylinder pos={[0, 1.48, 0.7]} radius={0.32} height={0.55} color="#b69368" /><Sphere pos={[0, 1.82, 0.7]} radius={0.22} color="#e5cca0" emissive="#815737" />
      <Painting open={!!f.paintingOpen} />
      {!f.keyTaken && f.paintingOpen && <Sphere pos={[5.5, 1.65, -4.15]} radius={0.09} color="#ffe5a1" emissive="#ffb936" />}
      <Box pos={[-4.8, 0.04, -3.2]} size={[2.7, 0.04, 1.4]} color="#4b3336" />
    </>}
    {s === 1 && <>
      <Bookshelf x={-5.2} z={-3.95} /><Bookshelf x={-2.8} z={-3.95} /><Bookshelf x={5} z={-3.95} /><Bookshelf x={5.1} z={-1.65} slide={!!f.bookcaseOpen} />
      <Bookshelf x={-5.2} z={2.8} /><Table x={0} z={-2.9} wide />
      {!f.bookATaken && <Box pos={[-5, 1.55, -3.28]} size={[0.28, 0.77, 0.38]} color="#d4a663" />}
      {!f.bookBTaken && <Box pos={[4.8, 1.55, -3.28]} size={[0.28, 0.77, 0.38]} color="#9aabd2" />}
      {!f.bookCTaken && <Box pos={[-4.5, 1.55, 3.23]} size={[0.28, 0.77, 0.38]} color="#d5c9a1" />}
      {[-1.5, 0, 1.5].map((x, i) => <group key={i}><Box pos={[x, 1.3, -2.9]} size={[0.55, 0.12, 0.55]} color="#c2a46e" /><Sphere pos={[x, 1.38, -2.9]} radius={0.1} color={['#d39764', '#a6b0d5', '#e6d6a0'][i]} emissive={f[['slotA', 'slotB', 'slotC'][i]] ? '#dca760' : undefined} /></group>)}
      <Cylinder pos={[0, 3.8, -4.45]} radius={0.6} height={0.06} color="#b18d5b" rotation={[Math.PI / 2, 0, 0]} />
    </>}
    {s === 2 && <>
      <Box pos={[0, 2.2, -4.38]} size={[3.3, 2.65, 0.3]} color="#535e61" metal={0.5} />
      {[-1.2, 0, 1.2].map((x, i) => <group key={i}><Box pos={[x, 2.2, -4.12]} size={[0.62, 1.45, 0.12]} color="#242d32" /><Sphere pos={[x, 2.5, -4.03]} radius={0.11} color={f[['panelA', 'panelB', 'repaired'][i]] ? '#a0e3b0' : '#a5574d'} emissive={f[['panelA', 'panelB', 'repaired'][i]] ? '#4bdb87' : undefined} /></group>)}
      {[-5.35, 5.35].map((x, i) => <group key={i}><Box pos={[x, 1.4, 0]} size={[0.7, 1.35, 0.55]} color="#526265" metal={0.4} /><Box pos={[x, 1.7, 0.34]} size={[0.13, 0.65, 0.15]} color="#c8a569" rotation={[0, 0, i ? 0.35 : -0.35]} /></group>)}
      <Table x={-4.8} z={-2.8} /><Table x={4.8} z={2.5} />
      <Sparkles count={f.powerOn ? 25 : 5} scale={[9, 2, 7]} size={2.5} speed={0.4} color="#a6d5e8" />
    </>}
    {s === 3 && <>
      <Table x={-4.8} z={2.5} /><Table x={4.8} z={2.5} /><Table x={0} z={-2.3} wide />
      {[-5, 0, 5].map((x, i) => <group key={i}><Cylinder pos={[x, 1.47, 2.4]} radius={0.2} height={0.54} color={['#236a95', '#d79d4f', '#a7464c'][i]} /><Sphere pos={[x, 1.79, 2.4]} radius={0.11} color="#c9d0c5" /></group>)}
      <Cylinder pos={[0, 1.55, -2.3]} radius={0.65} height={0.7} color="#69777a" metal={0.65} />
      <Cylinder pos={[0, 2.1, -2.3]} radius={0.5} height={0.3} color="#b6a982" metal={0.5} />
      {[-1.2, 0, 1.2].map((x, i) => <Cylinder key={i} pos={[x, 1.35, -2.3]} radius={0.16} height={0.2} color={['#3c80a0', '#b58644', '#a65450'][i]} />)}
      <Box pos={[3.7, 2.4, -4.43]} size={[1.85, 1.45, 0.1]} color="#a58366" />
      <Box pos={[3.7, 2.4, -4.35]} size={[1.55, 1.17, 0.03]} color="#594740" />
      {[-0.48, 0, 0.48].map((offset, i) => <group key={i}>
        <Sphere pos={[3.7 + offset, 2.43, -4.29]} radius={0.13} color={['#468db5', '#d5a454', '#b85655'][i]} emissive={['#155981', '#986424', '#792b2b'][i]} />
        {Array.from({ length: i + 1 }, (_, j) => <Box key={j} pos={[3.7 + offset - i * 0.05 + j * 0.1, 2.13, -4.27]} size={[0.05, 0.18, 0.025]} color="#e2cfaa" />)}
      </group>)}
      <Sparkles count={15} scale={[8, 3, 7]} size={2} speed={0.3} color="#d5ab77" />
    </>}
    {s === 4 && <>
      <Gear x={0} y={2.15} z={-4.2} radius={1.1} spin={f.machineDone ? 0.7 : 0} />
      <Gear x={-1.8} y={1.65} z={-4.1} radius={0.65} /><Gear x={1.8} y={1.65} z={-4.1} radius={0.65} />
      {[-5, 5].flatMap(x => [-2.5, 2.5].map(z => <group key={`${x}${z}`}><Cylinder pos={[x, 0.55, z]} radius={0.52} height={1.05} color="#5b5a59" metal={0.55} /><Box pos={[x, 1.1, z]} size={[0.75, 0.25, 0.75]} color="#b29763" metal={0.6} /><Cylinder pos={[x, 1.52, z]} radius={0.12} height={0.75} color="#d6bb7b" metal={0.7} /></group>))}
      <Box pos={[0, 0.7, 0]} size={[3.5, 1.2, 1.3]} color="#394144" metal={0.4} />
      <Sparkles count={20} scale={[11, 3, 8]} size={1.8} speed={0.25} color="#d9b779" />
    </>}
    {s === 5 && <>
      <Box pos={[0, 3.6, -3.7]} size={[3.3, 2.4, 0.32]} color="#3b4547" metal={0.5} />
      {Array.from({ length: 8 }, (_, i) => <Box key={i} pos={[-1.4 + i * 0.4, f.grateOpen ? 4.1 : 2.35, -3.42]} size={[0.11, 3.5, 0.14]} color="#9b9a84" metal={0.7} />)}
      <Box pos={[-3, 0.52, f.crateOnPad ? -1.6 : 0]} size={[1.1, 1.05, 1.1]} color="#8e6747" />
      <Box pos={[-3, 1.06, f.crateOnPad ? -1.6 : 0]} size={[1.15, 0.1, 1.15]} color="#bb8c58" />
      <Box pos={[-3, 0.04, -1.6]} size={[1.55, 0.08, 1.55]} color={f.crateOnPad ? '#86b39a' : '#856f59'} metal={0.4} />
      <Box pos={[3.5, 0.04, 1.5]} size={[1.55, 0.08, 1.55]} color="#86b39a" metal={0.4} />
      <Sparkles count={12} scale={[12, 4, 9]} size={2} speed={0.2} color="#84b2ac" />
    </>}
    {s === 6 && <>
      <Box pos={[0, 1.25, -2.3]} size={[4.6, 2.4, 1.7]} color="#463b36" metal={0.15} />
      <Box pos={[0, 2.47, -2.3]} size={[4.85, 0.24, 1.9]} color="#b08a59" metal={0.4} rotation={[0, 0, f.chestOpen ? -0.18 : 0]} />
      {[-1.7, 0, 1.7].map((x, i) => <group key={i}><Cylinder pos={[x, 1.7, -1.35]} radius={0.36} height={0.12} color="#c2a56f" metal={0.7} rotation={[Math.PI / 2, 0, 0]} /><Sphere pos={[x, 1.7, -1.24]} radius={0.11} color={f[['socketSigil', 'socketPrism', 'socketGear'][i]] ? '#d9e8ba' : '#594c43'} emissive={f[['socketSigil', 'socketPrism', 'socketGear'][i]] ? '#c5d789' : undefined} /></group>)}
      <Gear x={0} y={1.1} z={-1.2} radius={0.48} />
      {f.chestOpen && !f.finalKeyTaken && <Sphere pos={[0, 2.8, -2.2]} radius={0.18} color="#e6d08e" emissive="#f7c95d" />}
    </>}
    {s === 7 && <>
      {[-5, 5].flatMap(x => [-2, 2].map(z => <group key={`${x}${z}`}><Cylinder pos={[x, 0.75, z]} radius={0.48} height={1.5} color="#555f60" metal={0.55} /><Cylinder pos={[x, 1.5, z]} radius={0.32} height={0.16} color="#bf9d66" metal={0.7} /><Sphere pos={[x, 1.7, z]} radius={0.17} color={f.finalOpen ? '#e7e9cb' : '#a48361'} emissive={f.finalOpen ? '#d7e6af' : undefined} /></group>))}
      {f.finalOpen && <><pointLight position={[0, 2.5, -4.2]} intensity={7} distance={9} color="#fff4c9" /><Sparkles count={75} scale={[5, 5, 3]} size={4} speed={0.7} color="#fff0b5" /></>}
    </>}
  </group>;
}

function Marker({ target, active, onInteract, onHold }: { target: Interactable; active: boolean; onInteract: (id: string) => void; onHold: (id: string | null) => void }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = 0.12 + Math.sin(clock.elapsedTime * 2.5) * 0.08; });
  return <group position={[target.x, 0, target.z]}>
    <group ref={ref} onPointerDown={e => { e.stopPropagation(); if (target.kind === 'hold') onHold(target.id); else onInteract(target.id); }} onPointerUp={e => { if (target.kind === 'hold') onHold(null); e.stopPropagation(); }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.29, 0.38, 32]} /><meshBasicMaterial color={active ? '#e9d094' : '#bba87f'} transparent opacity={active ? 0.95 : 0.42} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.22, 0]}><octahedronGeometry args={[0.1, 0]} /><meshStandardMaterial color="#f4d08a" emissive="#c49247" emissiveIntensity={active ? 1.7 : 0.35} /></mesh>
    </group>
    {active && <pointLight position={[0, 0.3, 0]} intensity={0.35} distance={1.3} color="#f2ca78" />}
  </group>;
}

const MODELS = ['/models/h-adventurer.glb', '/models/f-adventurer.glb', '/models/h-suit.glb', '/models/f-formal.glb'] as const;
function RiggedAvatar({ player, self }: { player: Player; self: boolean }) {
  const { scene, animations } = useGLTF(MODELS[player.avatar]);
  const model = useMemo(() => SkeletonUtils.clone(scene) as THREE.Group, [scene]);
  const rig = useRef<THREE.Group>(null);
  const root = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3(player.x, 0, player.z));
  const actionStart = useRef(0);
  const bones = useMemo(() => {
    const found: Record<string, THREE.Bone> = {};
    model.traverse(o => { if ((o as THREE.Bone).isBone) found[o.name] = o as THREE.Bone; if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = false; } });
    return found;
  }, [model]);
  const { scale, groundY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size);
    const scale = size.y > 0.001 ? 2.4 / size.y : 1;
    return { scale, groundY: -box.min.y * scale };
  }, [model]);
  const { actions } = useAnimations(animations, rig);
  useEffect(() => { const idle = actions.Idle || actions.Idle_Neutral; idle?.reset().fadeIn(0.2).play(); return () => { idle?.fadeOut(0.2); }; }, [actions]);
  useEffect(() => {
    if (!player.actionAt) return;
    actionStart.current = performance.now();
    const interact = actions.Interact;
    if (!interact) return;
    interact.reset().setLoop(THREE.LoopOnce, 1); interact.clampWhenFinished = false; interact.fadeIn(0.12).play();
    const timer = setTimeout(() => interact.fadeOut(0.2), 600);
    return () => clearTimeout(timer);
  }, [actions, player.actionAt]);
  useFrame(({ clock }, dt) => {
    if (!root.current) return;
    target.current.set(player.x, 0, player.z); root.current.position.lerp(target.current, Math.min(1, dt * 12));
    const difference = THREE.MathUtils.euclideanModulo(player.facing - root.current.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    root.current.rotation.y += difference * Math.min(1, dt * 12);
    const phase = clock.elapsedTime * (player.running ? 13 : 9);
    const swing = player.moving ? Math.sin(phase) * (player.running ? 0.55 : 0.35) : 0;
    const action = performance.now() - actionStart.current < 800 ? player.action : null;
    if (bones['UpperLeg.L']) bones['UpperLeg.L'].rotation.x += swing;
    if (bones['UpperLeg.R']) bones['UpperLeg.R'].rotation.x -= swing;
    if (bones['LowerLeg.L']) bones['LowerLeg.L'].rotation.x += Math.max(0, -swing) * 0.55;
    if (bones['LowerLeg.R']) bones['LowerLeg.R'].rotation.x += Math.max(0, swing) * 0.55;
    if (bones['UpperArm.L']) bones['UpperArm.L'].rotation.x += player.hold || action === 'push' ? -0.9 : -swing * 0.55;
    if (bones['UpperArm.R']) bones['UpperArm.R'].rotation.x += player.hold || action === 'push' ? -0.9 : swing * 0.55;
    root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, action === 'push' ? 0.22 : action === 'search' ? 0.25 : 0, Math.min(1, dt * 7));
    root.current.position.y = action === 'take' ? -0.12 : player.moving ? Math.abs(Math.sin(phase)) * 0.035 : 0;
  });
  return <group ref={root} position={[player.x, 0, player.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}><circleGeometry args={[0.36, 24]} /><meshBasicMaterial color={self ? '#f0d99a' : COLORS[player.avatar]} transparent opacity={0.4} /></mesh>
    <group ref={rig} position={[0, groundY, 0]} scale={scale}><primitive object={model} /></group>
    {player.inventory.includes('lamp') && <><Sphere pos={[0.38, 1.13, 0.15]} radius={0.09} color="#e6ca8c" emissive="#e4aa5b" /><pointLight position={[0.4, 1.12, 0.16]} intensity={0.85} distance={4} color="#ffc977" /></>}
    {self && <Sphere pos={[0, 2.75, 0]} radius={0.07} color="#f4d999" emissive="#d5a85f" />}
  </group>;
}

function CameraFollow({ player }: { player?: Player }) {
  const { camera } = useThree();
  useFrame((_, dt) => {
    if (!player) return;
    const target = new THREE.Vector3(player.x + 7.7, 9.5, player.z + 11.1);
    camera.position.lerp(target, Math.min(1, dt * 2.2));
    camera.lookAt(player.x, 0.8, player.z - 0.6);
  });
  return null;
}

export function GameScene({ state, selfId, onInteract, onHold }: SceneProps) {
  const self = state.players.find(p => p.id === selfId);
  const lowQuality = typeof window !== 'undefined' && window.matchMedia('(max-width: 650px)').matches;
  const targets = useMemo(() => availableTargets(state), [state]);
  return <Canvas shadows dpr={lowQuality ? [1, 1.25] : [1, 1.7]} camera={{ position: [8, 10, 12], fov: 49, near: 0.1, far: 70 }} gl={{ antialias: !lowQuality, powerPreference: 'high-performance' }}>
    <color attach="background" args={['#11151b']} /><fog attach="fog" args={['#11151b', 17, 33]} />
    <ambientLight intensity={state.stage === 2 && !state.flags.powerOn ? 0.28 : 0.63} color="#d2c1ae" />
    <directionalLight position={[3, 8, 6]} intensity={1.6} color="#f1d7b1" castShadow shadow-mapSize={lowQuality ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
    <pointLight position={[0, 4, 0]} intensity={state.stage === 2 && !state.flags.powerOn ? 0.1 : 0.85} distance={12} color="#a8b0bd" />
    <Suspense fallback={null}>
      <RoomShell stage={state.stage} lowQuality={lowQuality} /><StageDecor state={state} />
      {targets.map(t => <Marker key={t.id} target={t} active={!!self && Math.hypot(self.x - t.x, self.z - t.z) < 1.9} onInteract={onInteract} onHold={onHold} />)}
      {state.floor.filter(f => f.stage === state.stage).map(f => <group key={f.id} position={[f.x, 0.22, f.z]} onClick={e => { e.stopPropagation(); onInteract(`floor:${f.id}`); }}><Cylinder pos={[0, 0, 0]} radius={0.16} height={0.18} color="#c9a768" metal={0.5} /><Sparkles count={5} scale={0.5} size={2} color="#e6c586" /></group>)}
      {state.players.map(p => <RiggedAvatar key={p.id} player={p} self={p.id === selfId} />)}
      <CameraFollow player={self} />
    </Suspense>
  </Canvas>;
}
