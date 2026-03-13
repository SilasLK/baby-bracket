import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
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

const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const ROUND_NAMES = ["Round of 16", "Quarterfinals", "Semifinals", "Final"];
const SIDES = ["a", "b"];
const GAME_REF = "bracket/game";
const VOTES_REF = "bracket/votes";

function mkKey(r, m) { return `r${r}_m${m}`; }

function initRounds(names) {
  const players = names.map((n, i) => ({ id: i, name: n }));
  const pairs = [];
  for (let i = 0; i < players.length; i += 2)
    pairs.push({ a: players[i], b: players[i + 1] });
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
  for (let i = 0; i < winners.length; i += 2)
    np.push({ a: winners[i], b: winners[i + 1] });
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
    for (let i = 0; i < winners.length; i += 2)
      np.push({ a: winners[i], b: winners[i + 1] });
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
    for (let i = 0; i < winners.length; i += 2)
      np.push({ a: winners[i], b: winners[i + 1] });
    simR.push(np);
    ri++;
  }
  return simR;
}

// ─── Bracket SVG ──────────────────────────────────────────────────────────────
// Always renders all 4 rounds. Confirmed rounds show real names; future rounds show TBD.
// Future rounds are NEVER populated with projected/simulated winners.
function BracketSVG({ rounds, votes, activeRound, activeMatch, mode, animWinner }) {
  const W = 720, BOX_W = 115, BOX_H = 28, GAP = 10;
  const TOTAL_ROUNDS = 4;
  const colW = W / TOTAL_ROUNDS;

  // matchCount(ri) = number of matches in that round
  const matchCount = (ri) => Math.pow(2, TOTAL_ROUNDS - 1 - ri) / 2; // 8,4,2,1
  const svgH = Math.max(420, matchCount(0) * (BOX_H * 2 + GAP + 20) + 60);

  const isDone = (ri, mi) => {
    const v = votes[mkKey(ri, mi)] || { a: 0, b: 0 };
    return v.a + v.b > 0 && ri < activeRound;
  };
  const winSide = (ri, mi) => {
    const v = votes[mkKey(ri, mi)] || { a: 0, b: 0 };
    return v.a >= v.b ? "a" : "b";
  };
  const isActive = (ri, mi) => mode === "single" && ri === activeRound && mi === activeMatch;

  // Only use confirmed rounds — never project future rounds
  const getMatch = (ri, mi) => (rounds[ri] ? rounds[ri][mi] : null);

  const NameBox = ({ ri, mi, side, x, y, name, isTbd }) => {
    const active = isActive(ri, mi);
    const done = isDone(ri, mi);
    const isW = done && winSide(ri, mi) === side;
    const isL = done && winSide(ri, mi) !== side;
    const isAW = animWinner && animWinner.ri === ri && animWinner.mi === mi && animWinner.side === side;
    let fill = "#f3f4f6", stroke = "#e5e7eb", textFill = "#374151", opacity = 1;
    if (isTbd)  { fill = "#fafafa"; stroke = "#eeeeee"; textFill = "#d1d5db"; }
    if (active) { fill = "#eef2ff"; stroke = "#6366f1"; textFill = "#4338ca"; }
    if (isW)    { fill = "#dcfce7"; stroke = "#16a34a"; textFill = "#15803d"; }
    if (isL)    { fill = "#f9fafb"; stroke = "#e5e7eb"; textFill = "#9ca3af"; opacity = 0.5; }
    if (isAW)   { fill = "#fef9c3"; stroke = "#ca8a04"; textFill = "#92400e"; }
    const label = isTbd ? "TBD" : (name?.length > 13 ? name.slice(0, 13) + "…" : name) || "TBD";
    return (
      <g opacity={opacity}>
        <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={5} fill={fill} stroke={stroke} strokeWidth={active ? 1.8 : 0.8} />
        <text x={x + BOX_W / 2} y={y + BOX_H / 2} textAnchor="middle" dominantBaseline="central"
          fontSize={11} fontWeight={active || isW ? 700 : 400} fill={textFill} fontFamily="system-ui,sans-serif">
          {label}
        </text>
      </g>
    );
  };

  const elems = [];

  for (let ri = 0; ri < TOTAL_ROUNDS; ri++) {
    const matches = matchCount(ri);
    const slotH = svgH / matches;
    const colX = ri * colW + (colW - BOX_W) / 2;
    const confirmed = ri < rounds.length; // this round has real data

    elems.push(
      <text key={`hdr${ri}`} x={ri * colW + colW / 2} y={22} textAnchor="middle"
        fontSize={10} fill={ri === activeRound ? "#6366f1" : "#9ca3af"}
        fontWeight={ri === activeRound ? 700 : 400} fontFamily="system-ui,sans-serif">
        {ROUND_NAMES[ri] || `Round ${ri + 1}`}
      </text>
    );

    for (let mi = 0; mi < matches; mi++) {
      const m = confirmed ? getMatch(ri, mi) : null;
      const isTbd = !m; // no confirmed data for this match yet
      const centerY = 40 + slotH * mi + slotH / 2;
      const aY = centerY - BOX_H - GAP / 2;
      const bY = centerY + GAP / 2;

      elems.push(
        <g key={`m${ri}_${mi}`}>
          <NameBox ri={ri} mi={mi} side="a" x={colX} y={aY} name={m?.a?.name} isTbd={isTbd} />
          <NameBox ri={ri} mi={mi} side="b" x={colX} y={bY} name={m?.b?.name} isTbd={isTbd} />

          {/* Connector lines to next round — always draw skeleton */}
          {ri < TOTAL_ROUNDS - 1 && (() => {
            const nextSlotH = svgH / matchCount(ri + 1);
            const nextMi = Math.floor(mi / 2);
            const nextCenterY = 40 + nextSlotH * nextMi + nextSlotH / 2;
            const nextY = mi % 2 === 0 ? nextCenterY - BOX_H - GAP / 2 : nextCenterY + GAP / 2;
            const fromX = colX + BOX_W;
            const toX = (ri + 1) * colW + (colW - BOX_W) / 2;
            const fromY = (aY + BOX_H / 2 + bY + BOX_H / 2) / 2;
            const midX = fromX + (toX - fromX) / 2;
            const toY = nextY + BOX_H / 2;
            const clr = isActive(ri, mi) ? "#6366f1" : isDone(ri, mi) ? "#16a34a" : "#e5e7eb";
            const sw = isDone(ri, mi) ? 1.5 : 0.5;
            return (
              <path key={`conn${ri}_${mi}`}
                d={`M${fromX} ${fromY} L${midX} ${fromY} L${midX} ${toY} L${toX} ${toY}`}
                fill="none" stroke={clr} strokeWidth={sw} strokeDasharray={isTbd ? "3 3" : "none"} />
            );
          })()}

          {/* Active match highlight ring */}
          {isActive(ri, mi) && (
            <rect x={colX - 4} y={aY - 4} width={BOX_W + 8} height={BOX_H * 2 + GAP + 8} rx={8}
              fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.6} />
          )}
        </g>
      );
    }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${svgH}`} style={{ display: "block", fontFamily: "system-ui,sans-serif" }}>
      {elems}
    </svg>
  );
}

// ─── Countdown Reveal ─────────────────────────────────────────────────────────
function CountdownReveal({ match, votes, onDone, onRevote }) {
  const [count, setCount] = useState(3);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (count > 0) { const t = setTimeout(() => setCount(c => c - 1), 900); return () => clearTimeout(t); }
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
        <div style={{ width: `${total ? (v.a / total) * 100 : 50}%`, background: "#6366f1", height: "100%", borderRadius: 99 }} />
      </div>
      <div style={{ background: "#fef9c3", borderRadius: 12, padding: "16px 24px", display: "inline-block", border: "2px solid #ca8a04", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#92400e" }}>🏆 Winner</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#78350f" }}>{winner.name}</div>
        <div style={{ fontSize: 12, color: "#92400e" }}>{wPct}% of votes</div>
      </div>
      <br />
      <button onClick={onDone} style={s.btn}>Next Game →</button>
      <button onClick={onRevote} style={{ ...s.btn, ...s.btnGhost, marginTop: 4 }}>🔁 Revote</button>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [names, setNames] = useState(Array(16).fill(""));
  const [game, setGame] = useState(null);
  const [votes, setVotes] = useState({});
  // voterVotes: tracks what THIS client has voted, keyed by matchKey
  // We also watch game.revoteKey in Firebase — when it changes, we clear that local vote
  const [voterVotes, setVoterVotes] = useState({});
  const [mode, setMode] = useState(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [bracketView, setBracketView] = useState(false);
  const [animWinner, setAnimWinner] = useState(null);
  const [copied, setCopied] = useState(false);

  const prevRoundRef = useRef(null);
  // Track the last revoteKey we saw so we can clear local vote when it changes
  const prevRevoteKeyRef = useRef(null);

  const voteLink = `${typeof window !== "undefined" ? window.location.href.split("?")[0] : ""}?join=1`;

  useEffect(() => {
    const gameRef = ref(db, GAME_REF);
    const votesRef = ref(db, VOTES_REF);

    const unsubGame = onValue(gameRef, snap => {
      const data = snap.val();
      setGame(data);
      if (data?.mode) setMode(data.mode);
    });
    const unsubVotes = onValue(votesRef, snap => {
      setVotes(snap.val() || {});
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("join") === "1") {
      setIsAdmin(false);
      setView("vote");
    } else {
      setView("home");
    }

    return () => { unsubGame(); unsubVotes(); };
  }, []);

  // When game.revoteKey changes, clear that match's local vote so voter can re-vote
  useEffect(() => {
    if (!game?.revoteKey) return;
    if (game.revoteKey !== prevRevoteKeyRef.current) {
      prevRevoteKeyRef.current = game.revoteKey;
      setVoterVotes(prev => {
        const u = { ...prev };
        delete u[game.revoteKey];
        return u;
      });
    }
  }, [game?.revoteKey]);

  // Voter: show bracket interstitial when round advances
  useEffect(() => {
    if (!game || isAdmin) return;
    if (prevRoundRef.current !== null && prevRoundRef.current !== game.currentRound) {
      setBracketView(true);
    }
    prevRoundRef.current = game.currentRound;
  }, [game?.currentRound, isAdmin]);

  // Voter: redirect to results when champion set
  useEffect(() => {
    if (!isAdmin && game?.champion) setView("results");
  }, [game?.champion, isAdmin]);

  const pushGame = (updates) => update(ref(db, GAME_REF), updates);

  const handleSetupDone = () => {
    if (names.some(n => !n.trim())) { alert("Fill in all 16 names!"); return; }
    if (!mode) { alert("Select a voting mode!"); return; }
    const rounds = initRounds(names);
    set(ref(db, GAME_REF), {
      rounds, mode, currentRound: 0, currentMatch: 0,
      votingOpen: false, champion: null, revoteKey: null,
    });
    set(ref(db, VOTES_REF), {});
    setVoterVotes({});
    setBracketView(false);
    setIsAdmin(true);
    setView("bracket");
  };

  const handleVote = (key, side) => {
    if (voterVotes[key] !== undefined) return;
    setVoterVotes(prev => ({ ...prev, [key]: side }));
    const curVotes = votes?.[key] || { a: 0, b: 0 };
    set(ref(db, `bracket/votes/${key}`), {
      a: side === "a" ? (curVotes.a || 0) + 1 : (curVotes.a || 0),
      b: side === "b" ? (curVotes.b || 0) + 1 : (curVotes.b || 0),
    });
  };

  const handleOpenVoting = () => set(ref(db, GAME_REF), { ...game, votingOpen: true });

  const handleCloseAndReveal = () => {
    set(ref(db, GAME_REF), { ...game, votingOpen: false });
    setShowCountdown(true);
  };

  const handleRevote = () => {
    if (!game) return;
    // Reset the vote in Firebase
    set(ref(db, `bracket/votes/${curKey}`), { a: 0, b: 0 });
    // Clear admin's own local vote for this key
    setVoterVotes(prev => { const u = { ...prev }; delete u[curKey]; return u; });
    setShowCountdown(false);
    // Write revoteKey to Firebase so all voter clients clear their local vote
    set(ref(db, GAME_REF), { ...game, votingOpen: true, revoteKey: curKey });
  };

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
    for (let i = sh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sh[i], sh[j]] = [sh[j], sh[i]];
    }
    setNames(sh);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(voteLink).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const rounds       = game?.rounds || null;
  const currentRound = game?.currentRound ?? 0;
  const currentMatch = game?.currentMatch ?? 0;
  const votingOpen   = game?.votingOpen ?? false;
  const champion     = game?.champion || null;
  const curMatch     = rounds?.[currentRound]?.[currentMatch];
  const curKey       = mkKey(currentRound, currentMatch);

  // ── LOADING ──
  if (view === "loading") return (
    <div style={s.page}><div style={s.card}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>👶</div>
      <p style={s.sub}>Connecting…</p>
    </div></div>
  );

  // ── RESULTS ──
  if (champion || view === "results") return (
    <div style={s.page}><div style={s.card}>
      <div style={{ fontSize: 56 }}>🎉</div>
      <h2 style={{ ...s.title, color: "#6366f1" }}>The Family Has Spoken!</h2>
      <div style={{ background: "#eef2ff", borderRadius: 16, padding: "20px 40px", margin: "16px 0", display: "inline-block" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Baby Boy's Name</p>
        <p style={{ margin: "4px 0 0", fontSize: 34, fontWeight: 800, color: "#4f46e5" }}>{champion?.name}</p>
      </div>
      <p style={s.sub}>Congratulations! 👶💙</p>
      {isAdmin && (
        <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => {
          set(ref(db, "bracket"), null);
          setGame(null); setVotes({}); setVoterVotes({});
          prevRoundRef.current = null; prevRevoteKeyRef.current = null;
          setView("home");
        }}>🔁 Start Over</button>
      )}
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
          <div key={opt.id} onClick={() => setMode(opt.id)}
            style={{ border: `2px solid ${mode === opt.id ? "#6366f1" : "#e5e7eb"}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: mode === opt.id ? "#eef2ff" : "#fff" }}>
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
            <span style={s.seed}>#{i + 1}</span>
            <input style={{ ...s.input, margin: 0, flex: 1 }} placeholder={`Name ${i + 1}`} value={n}
              onChange={e => { const u = [...names]; u[i] = e.target.value; setNames(u); }} />
          </div>
        ))}
      </div>
      <button style={{ ...s.btn, background: "#8b5cf6" }} onClick={handleShuffle}>🔀 Shuffle Names</button>
      <button style={s.btn} onClick={handleSetupDone}>Generate Bracket →</button>
      <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setView("home")}>Back</button>
    </div></div>
  );

  // ── BRACKET (ADMIN) ──
  if (view === "bracket" && rounds) {
    const curMatches = rounds[currentRound];
    return (
      <div style={s.page}><div style={{ ...s.card, maxWidth: 760, padding: "20px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ ...s.title, margin: 0, fontSize: 18 }}>
            {mode === "single"
              ? `🎯 ${ROUND_NAMES[currentRound] || `Round ${currentRound + 1}`} · Game ${currentMatch + 1}/${curMatches.length}`
              : `🏆 ${ROUND_NAMES[currentRound] || `Round ${currentRound + 1}`}`}
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

        {mode === "single" && votingOpen && curMatch && (
          <div style={{ background: "#f5f3ff", border: "1px solid #c4b5fd", borderRadius: 10, padding: "10px 14px", margin: "10px 0", textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#7c3aed", fontWeight: 600 }}>Live Votes</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#4c1d95" }}>
              {curMatch.a.name}: {votes[curKey]?.a || 0} — {votes[curKey]?.b || 0} :{curMatch.b.name}
            </p>
          </div>
        )}

        {showCountdown && curMatch && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 32, minWidth: 280, textAlign: "center" }}>
              <h3 style={{ margin: "0 0 4px" }}>{curMatch.a.name} vs {curMatch.b.name}</h3>
              <CountdownReveal match={curMatch} votes={votes[curKey]} onDone={handleCountdownDone} onRevote={handleRevote} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {!votingOpen && <button style={s.btn} onClick={handleOpenVoting}>🗳️ Open Voting</button>}
          {votingOpen && mode === "rounds"  && <button style={{ ...s.btn, background: "#16a34a" }} onClick={handleAdvanceRounds}>✅ Close &amp; Advance</button>}
          {votingOpen && mode === "all"     && <button style={{ ...s.btn, background: "#16a34a" }} onClick={handleAdvanceAll}>✅ Reveal Champion</button>}
          {votingOpen && mode === "single"  && <button style={{ ...s.btn, background: "#16a34a" }} onClick={handleCloseAndReveal}>✅ Close &amp; Reveal</button>}
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
      <div style={s.page}><div style={{ ...s.card, maxWidth: 760, padding: "20px 16px" }}>
        <h2 style={s.title}>📊 {ROUND_NAMES[currentRound] || `Round ${currentRound + 1}`}</h2>
        <p style={s.sub}>Here's the bracket — voting opens soon!</p>
        <BracketSVG rounds={rounds} votes={votes} activeRound={currentRound} activeMatch={currentMatch} mode={mode} />
        {votingOpen
          ? <button style={s.btn} onClick={() => setBracketView(false)}>🎯 Start Voting →</button>
          : <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>⏳ Waiting for admin to open voting…</p>
        }
      </div></div>
    );

    if (!votingOpen) return (
      <div style={s.page}><div style={{ ...s.card, maxWidth: 760, padding: "20px 16px" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
        <h2 style={s.title}>Voting Not Open Yet</h2>
        <p style={s.sub}>You'll be taken in automatically when the admin opens voting!</p>
        <BracketSVG rounds={rounds} votes={votes} activeRound={currentRound} activeMatch={currentMatch} mode={mode} />
      </div></div>
    );

    // ── Single game ──
    if (mode === "single" && curMatch) {
      const picked = voterVotes[curKey];
      return (
        <div style={s.page}><div style={{ ...s.card, maxWidth: 420 }}>
          <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 4px" }}>{ROUND_NAMES[currentRound] || `Round ${currentRound + 1}`} · Game {currentMatch + 1}</p>
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
          {picked && <p style={{ color: "#16a34a", fontWeight: 600, marginTop: 12, textAlign: "center", fontSize: 13 }}>✅ Voted! The next game opens automatically.</p>}
        </div></div>
      );
    }

    // ── Round by round ──
    if (mode === "rounds") {
      const curMatches = rounds[currentRound];
      const allVoted = curMatches.every((_, i) => voterVotes[mkKey(currentRound, i)] !== undefined);
      return (
        <div style={s.page}><div style={{ ...s.card, maxWidth: 480 }}>
          <h2 style={s.title}>🗳️ {ROUND_NAMES[currentRound] || `Round ${currentRound + 1}`}</h2>
          <p style={s.sub}>Pick your favorite in each matchup</p>
          {curMatches.map((match, i) => {
            const key = mkKey(currentRound, i), picked = voterVotes[key];
            return (
              <div key={i} style={s.matchCard}>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px", textAlign: "center" }}>Match {i + 1}</p>
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
          {allVoted && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 12, textAlign: "center" }}><p style={{ color: "#16a34a", fontWeight: 600, margin: 0 }}>✅ All votes in! The next round opens automatically.</p></div>}
        </div></div>
      );
    }

    // ── All at once ──
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
              <p style={{ fontWeight: 600, color: "#6366f1", fontSize: 12, margin: "0 0 8px", textAlign: "left" }}>{ROUND_NAMES[ri2] || `Round ${ri2 + 1}`}</p>
              {rnd.map((match, mi) => {
                const key = mkKey(ri2, mi), picked = voterVotes[key];
                const tbd = !match.a?.name || !match.b?.name;
                return (
                  <div key={mi} style={{ ...s.matchCard, marginBottom: 8, opacity: tbd ? 0.4 : 1 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {SIDES.map(side => {
                        const nm = side === "a" ? match.a?.name : match.b?.name;
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
