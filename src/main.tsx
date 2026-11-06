import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sound, setMuted, unlockAudio } from './audio';
import { COLORS, availableTargets, ITEM_NAMES, STAGES, type Avatar, type ClientMessage, type GameState, type LeaderRow, type ServerMessage } from './shared';
import './style.css';
import './history.css';

type Saved = { code: string; id: string; token: string };
const STORE_KEY = 'escape-project-session';
const GameScene = React.lazy(() => import('./Scene').then(module => ({ default: module.GameScene })));
const fmt = (ms: number) => { const n = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(n / 3600)).padStart(2, '0')}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; };
function getSaved(): Saved | null { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } }

function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [selfId, setSelfId] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [code, setCode] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(0);
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('all');
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [historyRows, setHistoryRows] = useState<LeaderRow[]>([]);
  const [boardOpen, setBoardOpen] = useState(false);
  const [hintText, setHintText] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [muted, setMutedUi] = useState(false);
  const [now, setNow] = useState(Date.now());
  const ws = useRef<WebSocket | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const selfRef = useRef('');
  const keys = useRef(new Set<string>());
  const joystick = useRef({ x: 0, z: 0 });
  const running = useRef(false);
  const holdRef = useRef<string | null>(null);
  const serverOffset = useRef(0);
  const lastStep = useRef(0);

  const send = useCallback((msg: ClientMessage) => { if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg)); }, []);
  const nearest = useCallback(() => {
    const s = stateRef.current; const p = s?.players.find(q => q.id === selfRef.current);
    if (!s || !p || s.status !== 'playing') return null;
    const targets = [...availableTargets(s), ...s.floor.filter(f => f.stage === s.stage).map(f => ({ id: `floor:${f.id}`, label: `Ramasser ${ITEM_NAMES[f.item]}`, x: f.x, z: f.z, kind: 'take' as const }))];
    return targets.map(t => ({ ...t, distance: Math.hypot(t.x - p.x, t.z - p.z) })).filter(t => t.distance < 1.9).sort((a, b) => a.distance - b.distance)[0] || null;
  }, []);
  const interactNearest = useCallback((down: boolean) => {
    if (!down) { if (holdRef.current) { send({ type: 'hold', target: null }); holdRef.current = null; } return; }
    const target = nearest(); if (!target) return;
    unlockAudio();
    if (target.kind === 'hold') { holdRef.current = target.id; send({ type: 'hold', target: target.id }); }
    else { send({ type: 'interact', target: target.id }); sound(target.kind === 'door' ? 'door' : 'interact'); }
  }, [nearest, send]);

  useEffect(() => {
    let alive = true; let reconnect: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (!alive) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${location.host}/ws`); ws.current = socket; setConnection('connecting');
      socket.onopen = () => { setConnection('online'); const saved = getSaved(); if (saved) socket.send(JSON.stringify({ type: 'resume', ...saved })); };
      socket.onmessage = event => {
        let msg: ServerMessage; try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === 'welcome') {
          selfRef.current = msg.id; setSelfId(msg.id); localStorage.setItem(STORE_KEY, JSON.stringify({ code: msg.state.code, id: msg.id, token: msg.token }));
          stateRef.current = msg.state; setState({ ...msg.state }); setMessage(''); unlockAudio();
        }
        if (msg.type === 'state') {
          const prev = stateRef.current; stateRef.current = msg.state; setState({ ...msg.state }); serverOffset.current = Date.now() - (msg.state.serverNow || Date.now());
          const localPlayer = msg.state.players.find(p => p.id === selfRef.current);
          if (localPlayer?.moving && Date.now() - lastStep.current > (localPlayer.running ? 240 : 380)) { sound('step', msg.state.stage); lastStep.current = Date.now(); }
          if (prev && prev.stage !== msg.state.stage) { sound('door'); setHintText(''); }
          else if (prev && prev.eventAt !== msg.state.eventAt && msg.state.event.includes('ouvre')) sound('success');
          if (prev && prev.status !== 'won' && msg.state.status === 'won') sound('success');
        }
        if (msg.type === 'leaderboard') setBoard(msg.rows);
        if (msg.type === 'hint') setHintText(msg.text);
        if (msg.type === 'error') { setMessage(msg.message); if (msg.message.includes('reconnexion invalide')) { localStorage.removeItem(STORE_KEY); stateRef.current = null; setState(null); } else sound('error'); }
      };
      socket.onclose = () => { if (!alive) return; setConnection('offline'); reconnect = setTimeout(connect, 1500); };
    };
    connect();
    return () => { alive = false; if (reconnect) clearTimeout(reconnect); ws.current?.close(); };
  }, []);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      keys.current.add(e.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key.toLowerCase() === 'e' && !e.repeat) interactNearest(true);
    };
    const onUp = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()); if (e.key.toLowerCase() === 'e') interactNearest(false); };
    const onBlur = () => { keys.current.clear(); interactNearest(false); };
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp); window.addEventListener('blur', onBlur);
    const timer = setInterval(() => {
      if (stateRef.current?.status !== 'playing') return;
      const k = keys.current;
      const x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + joystick.current.x;
      const z = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + joystick.current.z;
      send({ type: 'input', x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)), run: k.has('shift') || running.current });
    }, 50);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); clearInterval(timer); };
  }, [interactNearest, send]);

  const me = state?.players.find(p => p.id === selfId);
  const close = nearest();
  const elapsed = state?.startedAt ? (state.finishedAt || now - serverOffset.current) - state.startedAt : 0;
  const boardRequest = (p: 'all' | 'week' | 'month') => { setPeriod(p); setBoardOpen(true); send({ type: 'leaderboard', period: p }); if (state?.team) void fetch(`/api/history?team=${encodeURIComponent(state.team)}`).then(r => r.json()).then(rows => setHistoryRows(rows)).catch(() => setHistoryRows([])); else setHistoryRows([]); };
  const leaveGame = () => { if (stateRef.current?.status === 'lobby') send({ type: 'leave' }); localStorage.removeItem(STORE_KEY); stateRef.current = null; selfRef.current = ''; setState(null); setSelfId(''); setTimeout(() => ws.current?.close(), 100); };
  const handleJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    joystick.current = { x: Math.max(-1, Math.min(1, (event.clientX - cx) / (r.width * 0.32))), z: Math.max(-1, Math.min(1, (event.clientY - cy) / (r.height * 0.32))) };
    const thumb = event.currentTarget.querySelector('.joystick-thumb') as HTMLElement | null;
    if (thumb) thumb.style.transform = `translate(${joystick.current.x * 32}px, ${joystick.current.z * 32}px)`;
  };
  const resetJoystick = (event: React.PointerEvent<HTMLDivElement>) => { joystick.current = { x: 0, z: 0 }; const thumb = event.currentTarget.querySelector('.joystick-thumb') as HTMLElement | null; if (thumb) thumb.style.transform = 'translate(0,0)'; };
  const choose = (n: Avatar) => { setAvatar(n); unlockAudio(); };
  const startAction = (type: 'create' | 'join') => {
    unlockAudio(); setMessage('');
    if (!name.trim()) { setMessage('Choisis un nom d’explorateur.'); return; }
    if (type === 'create') { if (!team.trim()) { setMessage('Donne un nom à ton équipe.'); return; } send({ type, team, name, avatar }); }
    else { if (!code.trim()) { setMessage('Entre le code de la salle.'); return; } send({ type, code: code.trim().toUpperCase(), name, avatar }); }
  };

  return <div className="app">
    {state?.status === 'playing' || state?.status === 'won' ? <>
      <div className="game-view"><React.Suspense fallback={<div className="scene-loading">Ouverture du manoir…</div>}><GameScene state={state} selfId={selfId} onInteract={id => { send({ type: 'interact', target: id }); sound('interact'); }} onHold={id => { holdRef.current = id; send({ type: 'hold', target: id }); }} /></React.Suspense></div>
      <div className="vignette" />
      <header className="game-top">
        <div className="brand-mini"><span className="brand-mark">✦</span><span>ESCAPE <b>PROJECT</b><small>LES SECRETS DU MANOIR</small></span></div>
        <div className="timer"><span>CHRONOMÈTRE</span><strong>{fmt(elapsed)}</strong><small>{state.hints ? `+ ${fmt(state.penaltyMs)} d’indices` : 'TEMPS RÉEL'}</small></div>
        <div className="top-right"><button className="icon-btn" onClick={() => { setMutedUi(!muted); setMuted(!muted); }} title="Son">{muted ? '♪̸' : '♫'}</button><button className="icon-btn" onClick={() => boardRequest('all')} title="Classement">♛</button></div>
      </header>
      <div className="game-left"><div className="chapter-label">CHAPITRE {String(state.stage + 1).padStart(2, '0')} / 08</div><h1>{STAGES[state.stage].name}</h1><p>{STAGES[state.stage].objective}</p><div className="team-strip">{state.players.map(p => <div key={p.id} className={`mate ${p.id === selfId ? 'self' : ''} ${p.online ? '' : 'offline'}`}><span className="mate-dot" style={{ background: COLORS[p.avatar] }} /><span>{p.name}</span>{p.hold && <em>●</em>}{!p.online && <small>hors ligne</small>}</div>)}</div></div>
      {state.event && <div className="event-toast" key={state.eventAt}><span>✦</span>{state.event}</div>}
      <div className="game-right"><button className="hint-button" onClick={() => { send({ type: 'hint' }); unlockAudio(); }}>✧ <span>INDICE</span><small>{Math.min(3, (state.nums[`hint${state.stage}`] || 0))}/3</small></button>{hintText && <div className="hint-note" onClick={() => setHintText('')}>{hintText}</div>}</div>
      <div className="game-bottom">
        <div className="controls-help">WASD <span>Déplacer</span> · MAJ <span>Courir</span> · E <span>Interagir</span></div>
        <div className="inventory"><div className="inventory-title">INVENTAIRE <span>0{me?.inventory.length || 0} / 04</span></div><div className="slots">{[0, 1, 2, 3].map(i => <button className={`slot ${selectedSlot === i ? 'selected' : ''}`} key={i} onClick={() => setSelectedSlot(selectedSlot === i ? null : i)}><small>0{i + 1}</small><span>{me?.inventory[i] ? ITEM_NAMES[me.inventory[i]] : '+'}</span></button>)}</div>
          {selectedSlot !== null && me?.inventory[selectedSlot] && <div className="slot-menu"><strong>{ITEM_NAMES[me.inventory[selectedSlot]]}</strong><button onClick={() => { send({ type: 'drop', slot: selectedSlot }); setSelectedSlot(null); }}>Déposer au sol</button>{state.players.filter(p => p.id !== selfId && p.online && Math.hypot(p.x - me.x, p.z - me.z) < 1.9).map(p => <button key={p.id} onClick={() => { send({ type: 'give', slot: selectedSlot, to: p.id }); setSelectedSlot(null); }}>Donner à {p.name}</button>)}</div>}
        </div>
        <div className="interaction-card"><span>INTERACTION</span><strong>{close?.label || 'Approche-toi d’un objet'}</strong><button onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); interactNearest(true); }} onPointerUp={() => interactNearest(false)} onPointerCancel={() => interactNearest(false)} disabled={!close}>{close?.kind === 'hold' ? 'MAINTENIR' : 'AGIR'} <kbd>E</kbd></button></div>
      </div>
      <div className="mobile-controls"><div className="joystick" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleJoystick(e); }} onPointerMove={e => { if (e.buttons) handleJoystick(e); }} onPointerUp={resetJoystick} onPointerCancel={resetJoystick}><div className="joystick-thumb" /></div><button className="run-btn" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); running.current = true; }} onPointerUp={() => { running.current = false; }} onPointerCancel={() => { running.current = false; }}>COURIR</button></div>
      {state.status === 'won' && <div className="victory-overlay"><div className="victory-card"><div className="eyebrow">LE MANOIR A LIVRÉ SES SECRETS</div><h2>Vous vous êtes<br/><em>échappés.</em></h2><div className="victory-stats"><div><span>TEMPS RÉEL</span><b>{fmt(elapsed)}</b></div><div><span>INDICES</span><b>{state.hints}</b></div><div><span>TEMPS CLASSÉ</span><b>{fmt(elapsed + state.penaltyMs)}</b></div></div><button className="primary" onClick={() => boardRequest('all')}>VOIR LE CLASSEMENT →</button><button className="secondary victory-replay" onClick={leaveGame}>NOUVELLE ÉQUIPE</button></div></div>}
    </> : state?.status === 'lobby' ? <div className="lobby-shell"><div className="lobby-bg" /><header className="landing-header"><div className="landing-logo">✦ <span>ESCAPE PROJECT</span></div><button className="text-button" onClick={() => boardRequest('all')}>CLASSEMENT ↗</button></header><main className="lobby-main"><div className="eyebrow">SALLE PRIVÉE · QUATRE JOUEURS</div><h1>Le manoir<br/><em>vous attend.</em></h1><p>Invitez votre équipe. Chaque explorateur choisit son personnage et se prépare avant que les portes se referment.</p><div className="room-code"><span>CODE DE VOTRE SALLE</span><strong>{state.code}</strong><button onClick={() => navigator.clipboard.writeText(state.code)}>COPIER</button></div><div className="lobby-players">{[0, 1, 2, 3].map(i => { const p = state.players[i]; return <div key={i} className={`lobby-player ${p ? 'filled' : ''}`}><span className="lobby-player-num">0{i + 1}</span><div className="portrait" style={{ '--avatar': p ? COLORS[p.avatar] : '#313238' } as React.CSSProperties}>{p ? ['♠', '✦', '◆', '☼'][p.avatar] : '＋'}</div><div><b>{p?.name || 'En attente...'}</b><small>{p ? (p.online ? p.ready ? 'PRÊT' : 'EN PRÉPARATION' : 'DÉCONNECTÉ') : 'PLACE LIBRE'}</small></div></div>; })}</div><div className="lobby-actions"><button className="secondary" onClick={() => send({ type: 'ready', ready: !me?.ready })}>{me?.ready ? 'ANNULER PRÊT' : 'JE SUIS PRÊT'}</button>{state.host === selfId && <button className="primary" disabled={state.players.length !== 4 || !state.players.every(p => p.ready && p.online)} onClick={() => { unlockAudio(); send({ type: 'start' }); }}>ENTRER DANS LE MANOIR →</button>}<button className="text-button" onClick={leaveGame}>QUITTER LA SALLE</button></div>{state.players.length < 4 && <small className="lobby-tip">Le jeu démarre avec quatre joueurs prêts.</small>}</main></div> : <div className="landing"><div className="landing-art"><div className="moon"/><div className="mansion"><div className="roof"/><div className="tower left"/><div className="tower right"/><div className="house-body"><div className="window w1"/><div className="window w2"/><div className="window w3"/><div className="window w4"/><div className="house-door"/></div></div></div><header className="landing-header"><div className="landing-logo">✦ <span>ESCAPE PROJECT</span></div><button className="text-button" onClick={() => boardRequest('all')}>CLASSEMENT ↗</button></header><main className="landing-main"><div className="eyebrow">UNE AVENTURE COOPÉRATIVE À QUATRE</div><h1>Les Secrets<br/><em>du Manoir.</em></h1><p>Huit pièces. Quatre esprits. Une seule issue.<br/>Explorez, manipulez, coopérez — et échappez-vous.</p><div className="entry-panel"><label>VOTRE NOM D’EXPLORATEUR<input value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Ex. Camille" /></label><div className="avatar-label">CHOISISSEZ VOTRE PERSONNAGE</div><div className="avatar-choices">{([0, 1, 2, 3] as Avatar[]).map(n => <button key={n} className={avatar === n ? 'active' : ''} style={{ '--avatar': COLORS[n] } as React.CSSProperties} onClick={() => choose(n)}><span>{['♠', '✦', '◆', '☼'][n]}</span><small>{['ÉLIAS', 'NORA', 'MALIK', 'IRIS'][n]}</small></button>)}</div><div className="entry-columns"><div><label>NOM DE L’ÉQUIPE<input value={team} onChange={e => setTeam(e.target.value)} maxLength={32} placeholder="Les Éclaireurs" /></label><button className="primary" onClick={() => startAction('create')}>CRÉER UNE SALLE →</button></div><div className="entry-divider">OU</div><div><label>CODE DE SALLE<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="AB12CD34" /></label><button className="secondary" onClick={() => startAction('join')}>REJOINDRE L’ÉQUIPE →</button></div></div></div><div className="landing-bottom">EXPLORATION 2,5D <span>✦</span> HUIT CHAPITRES <span>✦</span> QUATRE JOUEURS</div></main></div>}
    {message && <div className="message" onClick={() => setMessage('')}>{message}<span>×</span></div>}
    {connection !== 'online' && <div className="connection">{connection === 'connecting' ? 'Connexion au manoir…' : 'Connexion perdue. Reprise en cours…'}</div>}
    {boardOpen && <div className="modal-backdrop" onClick={() => setBoardOpen(false)}><section className="board-modal" onClick={e => e.stopPropagation()}><div className="board-head"><div><div className="eyebrow">LES ÉQUIPES LES PLUS RAPIDES</div><h2>Le classement.</h2></div><button className="close-btn" onClick={() => setBoardOpen(false)}>×</button></div><div className="board-tabs">{([['all', 'MONDIAL'], ['week', 'CETTE SEMAINE'], ['month', 'CE MOIS']] as const).map(([p, label]) => <button key={p} className={period === p ? 'active' : ''} onClick={() => boardRequest(p)}>{label}</button>)}</div>{board.length ? <><div className="podium">{board.slice(0, 3).map((row, i) => <div className={`podium-place place-${i}`} key={`${row.team}-${i}`}><span>{['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</span><b>{row.team}</b><small>{fmt(row.rankedMs)}</small></div>)}</div><div className="board-list">{board.slice(3).map((row, i) => <div key={`${row.team}-${i}`}><span>{String(i + 4).padStart(2, '0')}</span><b>{row.team}</b><small>{row.hints} indices</small><strong>{fmt(row.rankedMs)}</strong></div>)}</div></> : <div className="board-empty">Le classement attend sa première équipe victorieuse.</div>}{historyRows.length > 0 && <div className="history-panel"><div className="history-title"><span>VOTRE ÉQUIPE · {state?.team}</span><strong>MEILLEUR TEMPS {fmt(Math.min(...historyRows.map(r => r.rankedMs)))}</strong></div>{historyRows.slice(0, 8).map((row, i) => <div className="history-row" key={`${row.completedAt}-${i}`}><span>{new Date(row.completedAt).toLocaleDateString("fr-FR")}</span><span>{fmt(row.elapsedMs)} + {fmt(row.penaltyMs)}</span><b>{fmt(row.rankedMs)}</b></div>)}</div>}</section></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
