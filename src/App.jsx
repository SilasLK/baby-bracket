import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCXz8ydJotmCr06P8gYSIRWrIfhK2aeCEk",
  authDomain: "baby-bracket-59a13.firebaseapp.com",
  databaseURL: "https://baby-bracket-59a13-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "baby-bracket-59a13",
  storageBucket: "baby-bracket-59a13.firebasestorage.app",
  messagingSenderId: "572277612304",
  appId: "1:572277612304:web:c217771e79bef2654dcf95"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const ROUND_NAMES = ["Round of 16", "Quarterfinals", "Semifinals", "Final"];
const SIDES = ["a", "b"];
const GAME_REF = "bracket/game";
const VOTES_REF = "bracket/votes";

function mkKey(r, m) { return `r${r}_m${m}`; }

function initRounds(names) {
  const players = names.map((n, i) => ({ id: i, name: n }));
  const pairs = [];
  for (let i = 0; i < players.length; i += 2) {
    pairs.push({ a: players[i], b: players[i + 1] });
  }
  return [pairs];
}

function advanceWinners(rounds, votes, currentRound) {
  const cur = rounds[currentRound];
  const winners = cur.map((m, mi) => {
    const v = votes[mkKey(currentRound, mi)] || { a: 0, b: 0 };
    return v.a >= v.b ? m.a : m.b;
  });
  if (winners.length === 1) return { champion: winners[0], newRounds: rounds, newRoundIdx: currentRound };
  const np = [];
  for (let i = 0; i < winners.length; i += 2) {
    np.push({ a: winners[i], b: winners[i + 1] });
  }
  return { champion: null, newRounds: [...rounds, np], newRoundIdx: currentRound + 1 };
}

function computeAllWinner(rounds, votes) {
  let ar = [...rounds];
  let ri = 0;
  while (true) {
    const cur = ar[ri];
    const winners = cur.map((m, mi) => {
      const v = votes[mkKey(ri, mi)] || { a: 0, b: 0 };
      return v.a >= v.b ? m.a : m.b;
    });
    if (winners.length === 1) return { champion: winners[0], rounds: ar };
    const np = [];
    for (let i = 0; i < winners.length; i += 2) {
      np.push({ a: winners[i], b: winners[i + 1] });
    }
    ar = [...ar, np];
    ri++;
  }
}

function buildSimRounds(rounds, votes) {
  let simR = [rounds[0]];
  let ri = 0;
  while (true) {
    const cur = simR[ri];
    if (cur.length === 1) break;
    const winners = cur.map((m, mi) => {
      const v = votes[mkKey(ri, mi)] || { a: 0, b: 0 };
      return v.a >= v.b ? m.a : m.b;
    });
    const np = [];
    for (let i = 0; i < winners.length; i += 2) {
      np.push({ a: winners[i], b: winners[i + 1] });
    }
    simR.push(np);
    ri++;
  }
  return simR;
}

// ─── Bracket SVG ─────────────────────────────────────────────────────────────
function BracketSVG({ rounds, votes, activeRound, activeMatch, mode, animWinner }) {
  const W = 680, BOX_W = 90, BOX_H = 26, GAP = 10;
  const finalX = (W - BOX_W) / 2;
  const colX = { 0: 30, 1: 150, 2: 270, 3: 320, 4: 440, 5: 560 };

  const r16L = [0,1,2,3].map(i => ({ x: colX[0], aY: 30+i*120, bY: 30+i*120+BOX_H+GAP }));
  const qfL  = [0,1].map(i => ({ x: colX[1], aY: 30+BOX_H/2+i*240, bY: 30+BOX_H/2+i*240+BOX_H+GAP }));
  const sfL  = [{ x: colX[2], aY: 30+BOX_H/2+120, bY: 30+BOX_H/2+120+BOX_H+GAP }];
  const fin  = [{ x: finalX, aY: 232, bY: 232+BOX_H+GAP }];
  const sfR  = [{ x: colX[3], aY: 30+BOX_H/2+120, bY: 30+BOX_H/2+120+BOX_H+GAP }];
  const qfR  = [0,1].map(i => ({ x: colX[4], aY: 30+BOX_H/2+i*240, bY: 30+BOX_H/2+i*240+BOX_H+GAP }));
  const r16R = [0,1,2,3].map(i => ({ x: colX[5], aY: 30+i*120, bY: 30+i*120+BOX_H+GAP }));

  // Only project rounds that have actually been decided
  const projected = [...rounds];
  let pri = 0;
  while (pri < projected.length) {
    const cur = projected[pri];
    if (cur.length === 1) break;
    // Only advance if all matches in this round are done
    const roundDone = cur.every((_, mi) => {
      const v = votes[mkKey(pri, mi)] || { a: 0, b: 0 };
      return v.a + v.b > 0 && pri < activeRound;
    });
    if (!roundDone) break;
    const winners = cur.map((m, mi) => {
      const v = votes[mkKey(pri, mi)] || { a: 0, b: 0 };
      return v.a >= v.b ? m.a : m.b;
    });
    const np = [];
    for (let i = 0; i < winners.length; i += 2) {
      np.push({ a: winners[i], b: winners[i + 1] });
    }
    if (pri + 1 >= projected.length) projected.push(np);
    pri++;
  }

  const getMatch = (ri, mi) => projected[ri] && projected[ri][mi];
  const lv = (ri, mi) => votes[mkKey(ri, mi)] || { a: 0, b: 0 };
  const isDone = (ri, mi) => { const v = lv(ri, mi); return v.a + v.b > 0 && ri < activeRound; };
  const winSide = (ri, mi) => { const v = lv(ri, mi); return v.a >= v.b ? "a" : "b"; };
  const isActive = (ri, mi) => mode === "single" && ri === activeRound && mi === activeMatch;

  const NameBox = ({ ri, mi, side, x, y, name, isProj }) => {
    const active = isActive(ri, mi);
    const done = isDone(ri, mi);
    const isW = done && winSide(ri, mi) === side;
    const isL = done && winSide(ri, mi) !== side;
    const isAW = animWinner && animWinner.ri === ri && animWinner.mi === mi && animWinner.side === side;
    let fill = "#f3f4f6", stroke = "#e5e7eb", textFill = "#374151", opacity = 1;
    if (active)  { fill = "#eef2ff"; stroke = "#6366f1"; textFill = "#4338ca"; }
    if (isW)     { fill = "#dcfce7"; stroke = "#16a34a"; textFill = "#15803d"; }
    if (isL)     { fill = "#f9fafb"; stroke = "#e5e7eb"; textFill = "#9ca3af"; opacity = 0.6; }
    if (isAW)    { fill = "#fef9c3"; stroke = "#ca8a04"; textFill = "#92400e"; }
    if (isProj && !isW && !isL && !active) { fill = "#f8f9ff"; stroke = "#c7d2fe"; textFill = "#818cf8"; }
    const label = name ? (name.length > 10 ? name.slice(0, 10) + "…" : name) : "TBD";
    return (
      <g opacity={opacity}>
        <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={4} fill={fill} stroke={stroke} strokeWidth={active ? 1.5 : 0.7} />
        <text x={x+BOX_W/2} y={y+BOX_H/2} textAnchor="middle" dominantBaseline="central"
          fontSize={10} fontWeight={active || isW ? 600 : 400} fill={textFill} fontFamily="system-ui,sans-serif">
          {label}
        </text>
      </g>
    );
  };

  const Conn = ({ fromX, fromAY, fromBY, toX, toY, dir, active }) => {
    const midY = (fromAY + BOX_H/2 + fromBY + BOX_H/2) / 2;
    const outX = dir === 1 ? fromX + BOX_W : fromX;
    const inX  = dir === 1 ? toX : toX + BOX_W;
    const clr = active ? "#6366f1" : "#d1d5db";
    const sw  = active ? 1.2 : 0.5;
    return (
      <g>
        <line x1={outX} y1={fromAY+BOX_H/2} x2={outX} y2={midY} stroke={clr} strokeWidth={sw} />
        <line x1={outX} y1={fromBY+BOX_H/2} x2={outX} y2={midY} stroke={clr} strokeWidth={sw} />
        <line x1={outX} y1={midY} x2={inX}  y2={midY}           stroke={clr} strokeWidth={sw} />
        <line x1={inX}  y1={midY} x2={inX}  y2={toY+BOX_H/2}   stroke={clr} strokeWidth={sw} />
      </g>
    );
  };

  const elems = [];

  for (let mi = 0; mi < 4; mi++) {
    const m = getMatch(0, mi); if (!m) continue;
    const p = r16L[mi];
    elems.push(<g key={`r16l${mi}`}><NameBox ri={0} mi={mi} side="a" x={p.x} y={p.aY} name={m.a.name} /><NameBox ri={0} mi={mi} side="b" x={p.x} y={p.bY} name={m.b.name} /></g>);
  }
  for (let mi = 0; mi < 2; mi++) {
    const m = getMatch(1, mi); if (!m) continue;
    const p = qfL[mi], f0 = r16L[mi*2], f1 = r16L[mi*2+1];
    elems.push(<g key={`qfl${mi}`}><Conn fromX={colX[0]} fromAY={f0.aY} fromBY={f0.bY} toX={colX[1]} toY={p.aY} dir={1} active={isActive(0,mi*2)} /><Conn fromX={colX[0]} fromAY={f1.aY} fromBY={f1.bY} toX={colX[1]} toY={p.bY} dir={1} active={isActive(0,mi*2+1)} /><NameBox ri={1} mi={mi} side="a" x={p.x} y={p.aY} name={m.a.name} isProj={!isDone(0,mi*2)} /><NameBox ri={1} mi={mi} side="b" x={p.x} y={p.bY} name={m.b.name} isProj={!isDone(0,mi*2+1)} /></g>);
  }
  const mSFL = getMatch(2, 0);
  if (mSFL) {
    const p = sfL[0];
    elems.push(<g key="sfl"><Conn fromX={colX[1]} fromAY={qfL[0].aY} fromBY={qfL[0].bY} toX={colX[2]} toY={p.aY} dir={1} active={isActive(1,0)} /><Conn fromX={colX[1]} fromAY={qfL[1].aY} fromBY={qfL[1].bY} toX={colX[2]} toY={p.bY} dir={1} active={isActive(1,1)} /><NameBox ri={2} mi={0} side="a" x={p.x} y={p.aY} name={mSFL.a.name} isProj /><NameBox ri={2} mi={0} side="b" x={p.x} y={p.bY} name={mSFL.b.name} isProj /></g>);
  }
  for (let mi = 4; mi < 8; mi++) {
    const m = getMatch(0, mi); if (!m) continue;
    const p = r16R[mi-4];
    elems.push(<g key={`r16r${mi}`}><NameBox ri={0} mi={mi} side="a" x={p.x} y={p.aY} name={m.a.name} /><NameBox ri={0} mi={mi} side="b" x={p.x} y={p.bY} name={m.b.name} /></g>);
  }
  for (let mi = 2; mi < 4; mi++) {
    const m = getMatch(1, mi); if (!m) continue;
    const idx = mi-2, p = qfR[idx], f0 = r16R[idx*2], f1 = r16R[idx*2+1];
    elems.push(<g key={`qfr${mi}`}><Conn fromX={colX[5]} fromAY={f0.aY} fromBY={f0.bY} toX={colX[4]} toY={p.aY} dir={-1} active={isActive(0,mi*2)} /><Conn fromX={colX[5]} fromAY={f1.aY} fromBY={f1.bY} toX={colX[4]} toY={p.bY} dir={-1} active={isActive(0,mi*2+1)} /><NameBox ri={1} mi={mi} side="a" x={p.x} y={p.aY} name={m.a.name} isProj={!isDone(0,mi*2)} /><NameBox ri={1} mi={mi} side="b" x={p.x} y={p.bY} name={m.b.name} isProj={!isDone(0,mi*2+1)} /></g>);
  }
  const mSFR = getMatch(2, 1);
  if (mSFR) {
    const p = sfR[0];
    elems.push(<g key="sfr"><Conn fromX={colX[4]} fromAY={qfR[0].aY} fromBY={qfR[0].bY} toX={colX[3]} toY={p.aY} dir={-1} active={isActive(1,2)} /><Conn fromX={colX[4]} fromAY={qfR[1].aY} fromBY={qfR[1].bY} toX={colX[3]} toY={p.bY} dir={-1} active={isActive(1,3)} /><NameBox ri={2} mi={1} side="a" x={p.x} y={p.aY} name={mSFR.a.name} isProj /><NameBox ri={2} mi={1} side="b" x={p.x} y={p.bY} name={mSFR.b.name} isProj /></g>);
  }
  const mFin = getMatch(3, 0);
  if (mFin) {
    const p = fin[0];
    elems.push(<g key="final"><Conn fromX={colX[2]} fromAY={sfL[0].aY} fromBY={sfL[0].bY} toX={finalX} toY={p.aY} dir={1} active={isActive(2,0)} /><Conn fromX={colX[3]+BOX_W} fromAY={sfR[0].aY} fromBY={sfR[0].bY} toX={finalX+BOX_W} toY={p.bY} dir={-1} active={isActive(2,1)} /><NameBox ri={3} mi={0} side="a" x={p.x} y={p.aY} name={mFin.a.name} isProj /><NameBox ri={3} mi={0} side="b" x={p.x} y={p.bY} name={mFin.b.name} isProj /></g>);
  }

  const activePos = (() => {
    if (mode !== "single") return null;
    if (activeRound === 0) return activeMatch < 4 ? r16L[activeMatch] : r16R[activeMatch-4];
    if (activeRound === 1) return activeMatch < 2 ? qfL[activeMatch] : qfR[activeMatch-2];
    if (activeRound === 2) return activeMatch === 0 ? sfL[0] : sfR[0];
    if (activeRound === 3) return fin[0];
    return null;
  })();

  const headers = [
    { x: colX[0]+BOX_W/2, label: "R16" }, { x: colX[1]+BOX_W/2, label: "QF" },
    { x: colX[2]+BOX_W/2, label: "SF" },  { x: W/2, label: "Final" },
    { x: colX[3]+BOX_W/2, label: "SF" },  { x: colX[4]+BOX_W/2, label: "QF" },
    { x: colX[5]+BOX_W/2, label: "R16" },
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${W} 510`} style={{ display: "block", fontFamily: "system-ui,sans-serif" }}>
      <text x={W/2} y={16} textAnchor="middle" fontSize={11} fill="#9ca3af" fontFamily="system-ui,sans-serif">
        {ROUND_NAMES[activeRound] || "Bracket"}{mode === "single" ? ` · Game ${activeMatch+1}` : ""}
      </text>
      {headers.map((h, i) => (
        <text key={i} x={h.x} y={495} textAnchor="middle" fontSize={9} fill="#9ca3af" fontFamily="system-ui,sans-serif">{h.label}</text>
      ))}
      {elems}
      {activePos && (
        <rect x={activePos.x-4} y={activePos.aY-4} width={BOX_W+8} height={BOX_H*2+GAP+8} rx={7}
          fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.6} />
      )}
    </svg>
  );
}

// ─── Countdown Reveal ─────────────────────────────────────────────────────────
function CountdownReveal({ match, votes, onDone }) {
  const [count, setCount] = useState(3);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (count > 0) { const t = setTimeout(() => setCount(c => c-1), 900); return () => clearTimeout(t); }
    else setRevealed(true);
  }, [count]);
  const v = votes || { a: 0, b: 0 };
  const total = v.a + v.b;
  const winner = v.a >= v.b ? match.a : match.b;
  const wPct = total ? Math.round((Math.max(v.a, v.b) / total) * 100) : 50;
  if (!revealed) return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 64, fontWeight: 800, color: "#6366f1", lineHeight: 1 }}>{count}</div>
      <p style={{ color: "#9ca3af", marginTop: 8 }}>Revealing winner…</p>
    </div>
  );
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>{match.a.name} {v.a} — {v.b} {match.b.name}</div>
      <div style={{ background: "#e5e7eb", borderRadius: 99, height: 8, margin: "0 0 16px" }}>
        <div style={{ width: `${total ? (v.a/total)*100 : 50}%`, background: "#6366f1", height: "100%", borderRadius: 99 }} />
      </div>
      <div style={{ background: "#fef9c3", borderRadius: 12, padding: "16px 24px", display: "inline-block", border: "2px solid #ca8a04", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#92400e" }}>🏆 Winner</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#78350f" }}>{winner.name}</div>
        <div style={{ fontSize: 12, color: "#92400e" }}>{wPct}% of votes</div>
      </div>
      <br />
      <button onClick={onDone} style={s.btn}>Next Game →</button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [names, setNames] = useState(Array(16).fill(""));
  const [game, setGame] = useState(null);   // live from Firebase
  const [votes, setVotes] = useState({});   // live from Firebase
  const [voterVotes, setVoterVotes] = useState({});
  const [mode, setMode] = useState(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [bracketView, setBracketView] = useState(false);
  const [animWinner, setAnimWinner] = useState(null);
  const [copied, setCopied] = useState(false);

  const voteLink = `${typeof window !== "undefined" ? window.location.href.split("?")[0] : ""}?join=1`;

  // Subscribe to Firebase in real time
  useEffect(() => {
    const gameRef = ref(db, GAME_REF);
    const votesRef = ref(db, VOTES_REF);

    const unsubGame = onValue(gameRef, snap => {
      const data = snap.val();
      setGame(data);
      if (data) setMode(data.mode);
    });

    const unsubVotes = onValue(votesRef, snap => {
      setVotes(snap.val() || {});
    });

    // Check if voter joining via link
    const params = new URLSearchParams(window.location.search);
    if (params.get("join") === "1") {
      setIsAdmin(false);
      setView("vote");
    } else {
      setView("home");
    }

    return () => { unsubGame(); unsubVotes(); };
  }, []);

  const pushGame = (updates) => update(ref(db, GAME_REF), updates);

  const handleSetupDone = () => {
    if (names.some(n => !n.trim())) { alert("Fill in all 16 names!"); return; }
    if (!mode) { alert("Select a voting mode!"); return; }
    const rounds = initRounds(names);
    set(ref(db, GAME_REF), {
      rounds, mode, currentRound: 0, currentMatch: 0,
      votingOpen: false, champion: null,
    });
    set(ref(db, VOTES_REF), {});
    setIsAdmin(true);
    setView("bracket");
  };

  const handleVote = (key, side) => {
    if (voterVotes[key] !== undefined) return;
    setVoterVotes(prev => ({ ...prev, [key]: side }));
    const curVotes = votes && votes[key] ? votes[key] : { a: 0, b: 0 };
    const newVotes = {
      a: side === "a" ? (curVotes.a || 0) + 1 : (curVotes.a || 0),
      b: side === "b" ? (curVotes.b || 0) + 1 : (curVotes.b || 0),
    };
    set(ref(db, `bracket/votes/${key}`), newVotes);
  };

  const handleOpenVoting = () => set(ref(db, GAME_REF), { ...game, votingOpen: true });

  const handleCloseAndReveal = () => setShowCountdown(true);

  const handleCountdownDone = () => {
    setShowCountdown(false);
    if (!game) return;
    const { rounds, currentRound, currentMatch } = game;
    const cur = rounds[currentRound];
    const key = mkKey(currentRound, currentMatch);
    const v = votes[key] || { a: 0, b: 0 };
    setAnimWinner({ ri: currentRound, mi: currentMatch, side: v.a >= v.b ? "a" : "b" });
    setTimeout(() => setAnimWinner(null), 2000);
    const nextMatch = currentMatch + 1;
    if (nextMatch < cur.length) {
      pushGame({ currentMatch: nextMatch, votingOpen: false });
      return;
    }
    const { champion, newRounds, newRoundIdx } = advanceWinners(rounds, votes, currentRound);
    if (champion) {
      pushGame({ champion, votingOpen: false });
      setView("results"); return;
    }
    pushGame({ rounds: newRounds, currentRound: newRoundIdx, currentMatch: 0, votingOpen: false });
    setBracketView(true);
  };

  const handleAdvanceRounds = () => {
    if (!game) return;
    const { rounds, currentRound } = game;
    const { champion, newRounds, newRoundIdx } = advanceWinners(rounds, votes, currentRound);
    if (champion) { pushGame({ champion, votingOpen: false }); setView("results"); return; }
    pushGame({ rounds: newRounds, currentRound: newRoundIdx, currentMatch: 0, votingOpen: false });
  };

  const handleAdvanceAll = () => {
    if (!game) return;
    const { champion, rounds: finalRounds } = computeAllWinner(game.rounds, votes);
    pushGame({ champion, votingOpen: false, rounds: finalRounds });
    setView("results");
  };

  const handleShuffle = () => {
    const sh = [...names];
    for (let i = sh.length-1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [sh[i], sh[j]] = [sh[j], sh[i]];
    }
    setNames(sh);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(voteLink).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  // Derive current state from live Firebase game
  const rounds       = game?.rounds || null;
  const currentRound = game?.currentRound || 0;
  const currentMatch = game?.currentMatch || 0;
  const votingOpen   = game?.votingOpen || false;
  const champion     = game?.champion || null;
  const curMatch     = rounds && rounds[currentRound] && rounds[currentRound][currentMatch];
  const curKey       = mkKey(currentRound, currentMatch);

  // Redirect voter to results if champion set
  useEffect(() => {
    if (!isAdmin && champion) setView("results");
  }, [champion, isAdmin]);

  // Voter: auto-show bracket when new round starts
  useEffect(() => {
    if (!isAdmin && game?.mode === "single" && game?.votingOpen === false) {
      setBracketView(true);
    }
  }, [game?.currentRound]);

  // ── LOADING ──
  if (view === "loading") return (
    <div style={s.page}><div style={s.card}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>👶</div>
      <p style={s.sub}>Connecting…</p>
    </div></div>
  );

  // ── HOME ──
  if (view === "home") return (
    <div style={s.page}><div style={s.card}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>👶</div>
      <h1 style={s.title}>Baby Name Bracket</h1>
      <p style={s.sub}>March Madness — for your baby boy's name!</p>
      <button style={s.btn} onClick={() => { setIsAdmin(true); setView("setup"); }}>🏆 Admin: Set Up Bracket</button>
      {rounds && <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setIsAdmin(true); setView("bracket"); }}>📊 Continue Bracket (Admin)</button>}
    </div></div>
  );

  // ── SETUP ──
  if (view === "setup") return (
    <div style={s.page}><div style={{ ...s.card, maxWidth: 540 }}>
      <h2 style={s.title}>Set Up Bracket</h2>
      <p style={{ fontWeight: 600, color: "#374151", marginBottom: 8, textAlign: "left", fontSize: 14 }}>1. Choose Voting Mode</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {[
          { id: "rounds", icon: "🔄", label: "Round by Round", desc: "Vote all matchups in a round, then advance" },
          { id: "all",    icon: "📋", label: "All at Once",    desc: "Fill out the whole bracket upfront" },
          { id: "single", icon: "🎯", label: "One Game at a Time", desc: "Vote one game, see winner — most dramatic!" },
        ].map(opt => (
          <div key={opt.id} onClick={() => setMode(opt.id)} style={{ border: `2px solid ${mode === opt.id ? "#6366f1" : "#e5e7eb"}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: mode === opt.id ? "#eef2ff" : "#fff" }}>
            <span style={{ fontSize: 22 }}>{opt.icon}</span>
            <div style={{ textAlign: "left" }}>
              <p style={{ margin: 0, fontWeight: 600, color: mode === opt.id ? "#4f46e5" : "#1f2937", fontSize: 14 }}>{opt.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{opt.desc}</p>
            </div>
            {mode === opt.id && <span style={{ marginLeft: "auto", color: "#6366f1", fontWeight: 800 }}>✓</span>}
          </div>
        ))}
      </div>
      <p style={{ fontWeight: 600, color: "#374151", marginBottom: 8, textAlign: "left", fontSize: 14 }}>2. Enter 16 Names</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {names.map((n, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={s.seed}>#{i+1}</span>
            <input style={{ ...s.input, margin: 0, flex: 1 }} placeholder={`Name ${i+1}`} value={n}
              onChange={e => { const u = [...names]; u[i] = e.target.value; setNames(u); }} />
          </div>
        ))}
      </div>
      <button style={{ ...s.btn, background: "#8b5cf6" }} onClick={handleShuffle}>🔀 Shuffle Names</button>
      <button style={s.btn} onClick={handleSetupDone}>Generate Bracket →</button>
      <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setView("home")}>Back</button>
    </div></div>
  );

  // ── BRACKET ADMIN ──
  if (view === "bracket" && rounds) {
    const curMatches = rounds[currentRound];
    return (
      <div style={s.page}><div style={{ ...s.card, maxWidth: 720, padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ ...s.title, margin: 0, fontSize: 18 }}>
            {mode === "single"
              ? `🎯 ${ROUND_NAMES[currentRound] || `Round ${currentRound+1}`} · Game ${currentMatch+1}/${curMatches.length}`
              : `🏆 ${ROUND_NAMES[currentRound] || `Round ${currentRound+1}`}`}
          </h2>
          <span style={{ fontSize: 10, background: "#eef2ff", color: "#6366f1", padding: "3px 8px", borderRadius: 99, fontWeight: 600 }}>
            {mode === "single" ? "🎯 One Game" : mode === "all" ? "📋 All at Once" : "🔄 By Round"}
          </span>
        </div>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 12, textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Share this link with your family:</p>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#15803d", wordBreak: "break-all" }}>{voteLink}</p>
          <button onClick={handleCopyLink} style={{ ...s.btn, background: copied ? "#15803d" : "#16a34a", marginBottom: 0, padding: "8px", fontSize: 13 }}>
            {copied ? "✅ Copied!" : "📋 Copy Voting Link"}
          </button>
        </div>
        <BracketSVG rounds={rounds} votes={votes} activeRound={currentRound} activeMatch={currentMatch} mode={mode} animWinner={animWinner} />
        {showCountdown && curMatch && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 32, minWidth: 280, textAlign: "center" }}>
              <h3 style={{ margin: "0 0 4px" }}>{curMatch.a.name} vs {curMatch.b.name}</h3>
              <CountdownReveal match={curMatch} votes={votes[curKey]} onDone={handleCountdownDone} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {!votingOpen && <button style={s.btn} onClick={handleOpenVoting}>🗳️ Open Voting</button>}
          {votingOpen && mode === "rounds" && <button style={{ ...s.btn, background: "#16a34a" }} onClick={handleAdvanceRounds}>✅ Close &amp; Advance</button>}
          {votingOpen && mode === "all"    && <button style={{ ...s.btn, background: "#16a34a" }} onClick={handleAdvanceAll}>✅ Reveal Champion</button>}
          {votingOpen && mode === "single" && <button style={{ ...s.btn, background: "#16a34a" }} onClick={handleCloseAndReveal}>✅ Close &amp; Reveal</button>}
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setIsAdmin(false); setView("home"); }}>Home</button>
        </div>
      </div></div>
    );
  }

  // ── VOTE ──
  if (view === "vote") {
    if (!rounds) return (
      <div style={s.page}><div style={s.card}>
        <div style={{ fontSize: 40 }}>⏳</div>
        <h2 style={s.title}>Waiting for Admin</h2>
        <p style={s.sub}>The bracket hasn't been set up yet. Keep this page open!</p>
      </div></div>
    );

    if (bracketView && mode === "single") return (
      <div style={s.page}><div style={{ ...s.card, maxWidth: 720, padding: "20px 16px" }}>
        <h2 style={s.title}>📊 {ROUND_NAMES[currentRound] || `Round ${currentRound+1}`}</h2>
        <p style={s.sub}>Here's the bracket — voting opens soon!</p>
        <BracketSVG rounds={rounds} votes={votes} activeRound={currentRound} activeMatch={currentMatch} mode={mode} />
        {votingOpen
          ? <button style={s.btn} onClick={() => setBracketView(false)}>🎯 Start Voting →</button>
          : <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>⏳ Waiting for admin to open voting…</p>
        }
      </div></div>
    );

    if (!votingOpen) return (
      <div style={s.page}><div style={s.card}>
        <div style={{ fontSize: 40 }}>⏳</div>
        <h2 style={s.title}>Voting Not Open Yet</h2>
        <p style={s.sub}>You'll be taken straight in when the admin opens voting — keep this page open!</p>
        {rounds && <BracketSVG rounds={rounds} votes={votes} activeRound={currentRound} activeMatch={currentMatch} mode={mode} />}
      </div></div>
    );

    // Single game
    if (mode === "single" && curMatch) {
      const picked = voterVotes[curKey];
      return (
        <div style={s.page}><div style={{ ...s.card, maxWidth: 420 }}>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 4px" }}>{ROUND_NAMES[currentRound] || `Round ${currentRound+1}`} · Game {currentMatch+1}</p>
          <h2 style={{ ...s.title, fontSize: 18, marginBottom: 4 }}>Which name do you prefer?</h2>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {SIDES.map(side => {
              const nm = side === "a" ? curMatch.a.name : curMatch.b.name;
              const chosen = picked === side, other = picked && picked !== side;
              return (
                <button key={side} onClick={() => handleVote(curKey, side)} disabled={!!picked}
                  style={{ flex: 1, padding: "18px 8px", borderRadius: 12, border: "2px solid", borderColor: chosen ? "#6366f1" : other ? "#e5e7eb" : "#d1d5db", background: chosen ? "#eef2ff" : other ? "#f9fafb" : "#fff", color: other ? "#9ca3af" : "#1f2937", fontWeight: chosen ? 700 : 500, fontSize: 17, cursor: picked ? "default" : "pointer", transition: "all 0.2s" }}>
                  {chosen && "✓ "}{nm}
                </button>
              );
            })}
          </div>
          {picked && <p style={{ color: "#16a34a", fontWeight: 600, marginTop: 12, textAlign: "center", fontSize: 13 }}>✅ Voted! The next game will open automatically.</p>}
        </div></div>
      );
    }

    // Rounds
    if (mode === "rounds") {
      const curMatches = rounds[currentRound];
      const allVoted = curMatches.every((_, i) => voterVotes[mkKey(currentRound, i)] !== undefined);
      return (
        <div style={s.page}><div style={{ ...s.card, maxWidth: 480 }}>
          <h2 style={s.title}>🗳️ {ROUND_NAMES[currentRound] || `Round ${currentRound+1}`}</h2>
          <p style={s.sub}>Pick your favorite in each matchup</p>
          {curMatches.map((match, i) => {
            const key = mkKey(currentRound, i), picked = voterVotes[key];
            return (
              <div key={i} style={s.matchCard}>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px", textAlign: "center" }}>Match {i+1}</p>
                <div style={{ display: "flex", gap: 10 }}>
                  {SIDES.map(side => {
                    const nm = side === "a" ? match.a.name : match.b.name;
                    const chosen = picked === side, other = picked && picked !== side;
                    return (
                      <button key={side} onClick={() => handleVote(key, side)} disabled={!!picked}
                        style={{ flex: 1, padding: "14px 8px", borderRadius: 10, border: "2px solid", borderColor: chosen ? "#6366f1" : other ? "#e5e7eb" : "#d1d5db", background: chosen ? "#eef2ff" : other ? "#f9fafb" : "#fff", color: other ? "#9ca3af" : "#1f2937", fontWeight: chosen ? 700 : 500, fontSize: 15, cursor: picked ? "default" : "pointer" }}>
                        {chosen && "✓ "}{nm}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {allVoted && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12, textAlign: "center" }}><p style={{ color: "#16a34a", fontWeight: 600, margin: 0 }}>✅ All votes in! The next round will open automatically.</p></div>}
        </div></div>
      );
    }

    // All at once
    if (mode === "all") {
      const simR = buildSimRounds(rounds, votes);
      const total = simR.reduce((sum, r) => sum + r.length, 0);
      const done  = simR.reduce((sum, r, ri2) => sum + r.filter((_, mi) => voterVotes[mkKey(ri2, mi)] !== undefined).length, 0);
      return (
        <div style={s.page}><div style={{ ...s.card, maxWidth: 520 }}>
          <h2 style={s.title}>📋 Fill Out Your Bracket</h2>
          <p style={s.sub}>{done}/{total} picks made</p>
          {simR.map((rnd, ri2) => (
            <div key={ri2} style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 600, color: "#6366f1", fontSize: 12, margin: "0 0 8px", textAlign: "left" }}>{ROUND_NAMES[ri2] || `Round ${ri2+1}`}</p>
              {rnd.map((match, mi) => {
                const key = mkKey(ri2, mi), picked = voterVotes[key];
                const tbd = !match.a.name || !match.b.name;
                return (
                  <div key={mi} style={{ ...s.matchCard, marginBottom: 8, opacity: tbd ? 0.4 : 1 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {SIDES.map(side => {
                        const nm = side === "a" ? match.a.name : match.b.name;
                        const chosen = picked === side, other = picked && picked !== side;
                        return (
                          <button key={side} onClick={() => !tbd && handleVote(key, side)} disabled={!!picked || tbd}
                            style={{ flex: 1, padding: "10px 6px", borderRadius: 8, border: "2px solid", borderColor: chosen ? "#6366f1" : other ? "#e5e7eb" : "#d1d5db", background: chosen ? "#eef2ff" : other ? "#f9fafb" : "#fff", color: other ? "#bbb" : "#1f2937", fontWeight: chosen ? 700 : 500, fontSize: 13, cursor: (picked || tbd) ? "default" : "pointer" }}>
                            {chosen && "✓ "}{nm || "TBD"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {done === total && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12, textAlign: "center" }}><p style={{ color: "#16a34a", fontWeight: 600, margin: 0 }}>✅ Bracket complete! Waiting for champion reveal…</p></div>}
        </div></div>
      );
    }
  }

  // ── RESULTS ──
  if (champion) return (
    <div style={s.page}><div style={s.card}>
      <div style={{ fontSize: 56 }}>🎉</div>
      <h2 style={{ ...s.title, color: "#6366f1" }}>The Family Has Spoken!</h2>
      <div style={{ background: "#eef2ff", borderRadius: 16, padding: "20px 40px", margin: "16px 0", display: "inline-block" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Baby Boy's Name</p>
        <p style={{ margin: "4px 0 0", fontSize: 34, fontWeight: 800, color: "#4f46e5" }}>{champion.name}</p>
      </div>
      <p style={s.sub}>Congratulations! 👶💙</p>
      {isAdmin && <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { set(ref(db, "bracket"), null); setGame(null); setVotes({}); setView("home"); }}>🔁 Start Over</button>}
    </div></div>
  );

  return <div style={s.page}><div style={s.card}><p style={s.sub}>Loading…</p></div></div>;
}

const s = {
  page:      { minHeight: "100vh", background: "linear-gradient(135deg,#ede9fe 0%,#dbeafe 100%)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", fontFamily: "system-ui,sans-serif" },
  card:      { background: "#fff", borderRadius: 20, padding: "28px 24px", boxShadow: "0 8px 32px rgba(99,102,241,0.12)", width: "100%", maxWidth: 440, textAlign: "center" },
  title:     { margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "#1f2937" },
  sub:       { margin: "0 0 20px", color: "#6b7280", fontSize: 14 },
  btn:       { display: "block", width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#6366f1", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10 },
  btnGhost:  { background: "#f3f4f6", color: "#374151" },
  input:     { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: 14, margin: "0 0 12px", boxSizing: "border-box" },
  seed:      { fontSize: 11, color: "#9ca3af", minWidth: 22, textAlign: "right" },
  matchCard: { background: "#f9fafb", borderRadius: 12, padding: "12px", marginBottom: 12, textAlign: "left" },
};
