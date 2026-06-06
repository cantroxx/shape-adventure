import { useState, useCallback, useMemo, useEffect } from "react";

// ─── Grid & Cell ───
const GRID = 7;
const CELL = 52;

// ─── Transform helpers ───
function bbox(cells) {
  const rs = cells.map(c => c[0]), cs = cells.map(c => c[1]);
  return { r0: Math.min(...rs), r1: Math.max(...rs), c0: Math.min(...cs), c1: Math.max(...cs) };
}
function center(cells) {
  const b = bbox(cells);
  return { cr: (b.r0 + b.r1) / 2, cc: (b.c0 + b.c1) / 2 };
}
function move(cells, dr, dc) {
  return cells.map(([r, c]) => [r + dr, c + dc]);
}
function flipH(cells) {
  const { cc } = center(cells);
  return cells.map(([r, c]) => [r, Math.round(2 * cc - c)]);
}
function flipV(cells) {
  const { cr } = center(cells);
  return cells.map(([r, c]) => [Math.round(2 * cr - r), c]);
}
function rotateCW(cells) {
  const { cr, cc } = center(cells);
  return cells.map(([r, c]) => [Math.round(cr + (c - cc)), Math.round(cc - (r - cr))]);
}
function inBounds(cells) {
  return cells.every(([r, c]) => r >= 0 && r < GRID && c >= 0 && c < GRID);
}
function cellKey(cells) {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(c => c.join(",")).join("|");
}
function cellsMatch(a, b) {
  return a.length === b.length && cellKey(a) === cellKey(b);
}
function cellSet(cells) {
  return new Set(cells.map(c => c.join(",")));
}

// ─── Stage Data ───
const CHAPTERS = [
  { id: 1, name: "밀기 마을", icon: "🏘️", desc: "도형을 밀어서 옮겨요", color: "#4ECDC4" },
  { id: 2, name: "거울 숲", icon: "🪞", desc: "도형을 뒤집어 봐요", color: "#A78BFA" },
  { id: 3, name: "회전 탑", icon: "🏰", desc: "도형을 돌려 봐요", color: "#F59E0B" },
  { id: 4, name: "뒤틀이의 성", icon: "👾", desc: "모두 합쳐서 도전!", color: "#EF4444" },
];

const STAGES = [
  // Chapter 1: 밀기
  {
    ch: 1, num: 1, title: "네모를 옮겨요",
    desc: "네모를 오른쪽으로 밀어 초록 자리에 맞춰 보세요!",
    start: [[1,1],[1,2],[2,1],[2,2]],
    target: [[1,4],[1,5],[2,4],[2,5]],
    ops: ["move"], stars: [3, 5, 7],
    hint: "오른쪽 화살표를 눌러 보세요!",
  },
  {
    ch: 1, num: 2, title: "막대를 옮겨요",
    desc: "세로 막대를 아래, 오른쪽으로 밀어 보세요.",
    start: [[0,1],[1,1],[2,1]],
    target: [[2,4],[3,4],[4,4]],
    ops: ["move"], stars: [5, 7, 9],
    hint: "아래로 2번, 오른쪽으로 3번!",
  },
  {
    ch: 1, num: 3, title: "L자 도형을 옮겨요",
    desc: "L자 모양을 목표 지점까지 밀어 주세요.",
    start: [[0,0],[1,0],[2,0],[2,1]],
    target: [[3,3],[4,3],[5,3],[5,4]],
    ops: ["move"], stars: [6, 8, 10],
    hint: "아래로 3번, 오른쪽으로 3번 밀어요!",
  },
  // Chapter 2: 뒤집기
  {
    ch: 2, num: 1, title: "좌우로 뒤집어요",
    desc: "L자 도형을 좌우로 뒤집어 보세요!",
    start: [[2,1],[3,1],[4,1],[4,2]],
    target: [[2,2],[3,2],[4,1],[4,2]],
    ops: ["flipH"], stars: [1, 2, 3],
    hint: "좌우 뒤집기 버튼을 눌러 보세요!",
  },
  {
    ch: 2, num: 2, title: "상하로 뒤집어요",
    desc: "T자 도형을 위아래로 뒤집어 보세요!",
    start: [[1,2],[1,3],[1,4],[2,3]],
    target: [[1,3],[2,2],[2,3],[2,4]],
    ops: ["flipV"], stars: [1, 2, 3],
    hint: "상하 뒤집기 버튼을 눌러 보세요!",
  },
  {
    ch: 2, num: 3, title: "뒤집고 옮겨요",
    desc: "Z자 도형을 뒤집고 옮겨서 맞춰 보세요!",
    start: [[2,1],[2,2],[3,2],[3,3]],
    target: [[2,4],[2,5],[3,3],[3,4]],
    ops: ["move", "flipH"], stars: [3, 5, 7],
    hint: "먼저 좌우로 뒤집은 뒤, 오른쪽으로 밀어요!",
  },
  // Chapter 3: 돌리기
  {
    ch: 3, num: 1, title: "막대를 돌려요",
    desc: "세로 막대를 돌려서 가로로 만들어 보세요!",
    start: [[1,3],[2,3],[3,3]],
    target: [[2,2],[2,3],[2,4]],
    ops: ["rotate"], stars: [1, 2, 3],
    hint: "돌리기 버튼을 한 번 눌러 보세요!",
  },
  {
    ch: 3, num: 2, title: "L자를 돌려요",
    desc: "L자 도형을 90도 돌려 보세요!",
    start: [[1,2],[2,2],[3,2],[3,3]],
    target: [[2,2],[2,3],[2,4],[3,2]],
    ops: ["rotate"], stars: [1, 2, 3],
    hint: "돌리기 버튼을 한 번 눌러 보세요!",
  },
  {
    ch: 3, num: 3, title: "돌리고 옮겨요",
    desc: "L자를 돌린 다음 아래로 옮겨 보세요!",
    start: [[1,1],[2,1],[3,1],[3,2]],
    target: [[4,1],[4,2],[4,3],[5,1]],
    ops: ["move", "rotate"], stars: [3, 5, 7],
    hint: "먼저 한 번 돌리고, 아래로 밀어요!",
  },
  // Chapter 4: 종합
  {
    ch: 4, num: 1, title: "뒤집고 돌려요",
    desc: "T자를 뒤집고 돌려서 맞춰 보세요!",
    start: [[1,2],[1,3],[1,4],[2,3]],
    target: [[1,3],[2,3],[2,4],[3,3]],
    ops: ["flipV", "rotate"], stars: [2, 4, 6],
    hint: "상하 뒤집기 후 돌리기를 해 보세요!",
  },
  {
    ch: 4, num: 2, title: "뒤집고 옮기고!",
    desc: "L자를 뒤집고 오른쪽으로 밀어 보세요!",
    start: [[1,1],[2,1],[3,1],[3,2]],
    target: [[1,5],[2,5],[3,4],[3,5]],
    ops: ["move", "flipH"], stars: [4, 6, 8],
    hint: "좌우 뒤집기 후 오른쪽으로 밀어요!",
  },
  {
    ch: 4, num: 3, title: "뒤틀이를 물리쳐라!",
    desc: "모든 기술을 사용해 도형을 맞춰 보세요!",
    start: [[1,1],[1,2],[2,1],[3,1],[3,2]],
    target: [[1,4],[1,5],[2,5],[3,4],[3,5]],
    ops: ["move", "flipH", "flipV", "rotate"], stars: [4, 6, 9],
    hint: "좌우 뒤집기 후 오른쪽으로 밀어 보세요!",
  },
];

// ─── Colors ───
const C = {
  bg: "#FFF8F0",
  grid: "#F5EDE3",
  gridLine: "#E8DDD0",
  player: "#FF6B6B",
  playerStroke: "#E05555",
  target: "#4ECDC4",
  targetAlpha: "rgba(78,205,196,0.3)",
  targetStroke: "rgba(78,205,196,0.6)",
  match: "#2ECC71",
  matchStroke: "#27AE60",
  btnMove: "#4ECDC4",
  btnFlip: "#A78BFA",
  btnRotate: "#F59E0B",
  btnUndo: "#94A3B8",
  dark: "#2D3436",
  mid: "#636E72",
  light: "#B2BEC3",
  accent: "#FF6B6B",
  gold: "#F59E0B",
  card: "#FFFFFF",
};

// ─── Styles ───
const font = `'Pretendard', 'Noto Sans KR', sans-serif`;
const fontTitle = `'Black Han Sans', 'Jua', sans-serif`;

const S = {
  app: {
    fontFamily: font,
    minHeight: "100vh",
    background: `linear-gradient(135deg, ${C.bg} 0%, #FFF0E6 50%, #F0E6FF 100%)`,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    color: C.dark,
    overflow: "hidden",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  container: {
    width: "100%",
    maxWidth: 480,
    padding: "0 16px",
    boxSizing: "border-box",
  },
};

// ─── Components ───

function StarDisplay({ count, size = 24 }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          fontSize: size,
          filter: i < count ? "none" : "grayscale(1) opacity(0.3)",
          transition: "all 0.3s",
          transform: i < count ? "scale(1)" : "scale(0.8)",
        }}>⭐</span>
      ))}
    </span>
  );
}

function GridView({ playerCells, targetCells, matched }) {
  const gridPx = CELL * GRID;
  const pSet = cellSet(playerCells);
  const tSet = cellSet(targetCells);

  return (
    <div style={{
      position: "relative",
      width: gridPx + 2,
      height: gridPx + 2,
      margin: "0 auto",
      borderRadius: 16,
      overflow: "hidden",
      background: C.grid,
      border: `2px solid ${C.gridLine}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.6)",
    }}>
      {/* Grid lines */}
      {Array.from({ length: GRID - 1 }).map((_, i) => (
        <div key={`h${i}`} style={{
          position: "absolute", left: 0, right: 0,
          top: (i + 1) * CELL, height: 1,
          background: C.gridLine,
        }} />
      ))}
      {Array.from({ length: GRID - 1 }).map((_, i) => (
        <div key={`v${i}`} style={{
          position: "absolute", top: 0, bottom: 0,
          left: (i + 1) * CELL, width: 1,
          background: C.gridLine,
        }} />
      ))}

      {/* Target cells */}
      {targetCells.map(([r, c]) => {
        const key = `${r},${c}`;
        const isMatched = pSet.has(key);
        return (
          <div key={`t-${key}`} style={{
            position: "absolute",
            left: c * CELL + 3, top: r * CELL + 3,
            width: CELL - 6, height: CELL - 6,
            borderRadius: 8,
            background: isMatched ? "transparent" : C.targetAlpha,
            border: isMatched ? "none" : `2px dashed ${C.targetStroke}`,
            transition: "all 0.3s ease",
          }} />
        );
      })}

      {/* Player cells */}
      {playerCells.map(([r, c]) => {
        const key = `${r},${c}`;
        const isOnTarget = tSet.has(key);
        return (
          <div key={`p-${key}`} style={{
            position: "absolute",
            left: c * CELL + 2, top: r * CELL + 2,
            width: CELL - 4, height: CELL - 4,
            borderRadius: 10,
            background: matched
              ? `linear-gradient(135deg, ${C.match}, #58D68D)`
              : isOnTarget
                ? `linear-gradient(135deg, ${C.match}, #58D68D)`
                : `linear-gradient(135deg, ${C.player}, #FF8E8E)`,
            border: `2px solid ${matched || isOnTarget ? C.matchStroke : C.playerStroke}`,
            boxShadow: matched
              ? `0 0 16px rgba(46,204,113,0.5)`
              : `0 3px 8px rgba(0,0,0,0.12)`,
            transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: matched ? "scale(1.05)" : "scale(1)",
          }} />
        );
      })}
    </div>
  );
}

function OpButton({ label, icon, color, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 2, padding: "10px 6px", minWidth: 64,
        background: disabled ? "#E2E8F0" : `linear-gradient(135deg, ${color}, ${color}DD)`,
        color: disabled ? "#A0AEC0" : "#FFF",
        border: "none", borderRadius: 14,
        fontSize: 11, fontWeight: 700, fontFamily: font,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 4px 12px ${color}44`,
        transition: "all 0.2s",
        transform: disabled ? "none" : "translateY(0)",
        flex: 1,
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "translateY(2px) scale(0.96)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── Screens ───

function TitleScreen({ onStart }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);
  return (
    <div style={{
      ...S.container,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", gap: 24, textAlign: "center",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(30px)",
      transition: "all 0.8s ease",
    }}>
      <div style={{ fontSize: 72, lineHeight: 1, marginBottom: -8 }}>🔷</div>
      <div>
        <h1 style={{
          fontFamily: fontTitle, fontSize: 36, margin: 0,
          background: `linear-gradient(135deg, ${C.player}, ${C.target})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          letterSpacing: -1,
        }}>도형 탐험대</h1>
        <p style={{ color: C.mid, fontSize: 14, margin: "8px 0 0" }}>
          밀고 · 뒤집고 · 돌리고
        </p>
      </div>
      <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        마왕 뒤틀이가 엉망으로 만든 도형 왕국!<br />
        도형을 움직여 원래 모습으로 되돌려 주세요!
      </p>
      <button onClick={onStart} style={{
        padding: "16px 48px", fontSize: 18, fontWeight: 800,
        fontFamily: font,
        background: `linear-gradient(135deg, ${C.player}, #FF8E8E)`,
        color: "#FFF", border: "none", borderRadius: 20,
        cursor: "pointer",
        boxShadow: `0 6px 24px ${C.player}44`,
        transition: "all 0.2s",
      }}>
        탐험 시작! 🚀
      </button>
      <p style={{ color: C.light, fontSize: 11, marginTop: 8 }}>
        4학년 수학 · 평면도형의 이동
      </p>
    </div>
  );
}

function ChapterSelect({ cleared, onSelect, onBack }) {
  return (
    <div style={{ ...S.container, paddingTop: 24, paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 4,
        }}>←</button>
        <h2 style={{ fontFamily: fontTitle, fontSize: 22, margin: 0 }}>스테이지 선택</h2>
      </div>
      {CHAPTERS.map(ch => {
        const chStages = STAGES.filter(s => s.ch === ch.id);
        return (
          <div key={ch.id} style={{
            background: C.card, borderRadius: 20, padding: 20, marginBottom: 16,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            border: `2px solid ${ch.color}22`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>{ch.icon}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{ch.name}</div>
                <div style={{ fontSize: 12, color: C.mid }}>{ch.desc}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {chStages.map((st, i) => {
                const idx = STAGES.indexOf(st);
                const prevCleared = idx === 0 || cleared[idx - 1] > 0;
                const stars = cleared[idx] || 0;
                return (
                  <button key={i} onClick={() => prevCleared && onSelect(idx)}
                    disabled={!prevCleared}
                    style={{
                      flex: 1, padding: "12px 8px",
                      background: prevCleared
                        ? `linear-gradient(135deg, ${ch.color}15, ${ch.color}08)`
                        : "#F1F5F9",
                      border: `2px solid ${prevCleared ? ch.color + "44" : "#E2E8F0"}`,
                      borderRadius: 14, cursor: prevCleared ? "pointer" : "not-allowed",
                      opacity: prevCleared ? 1 : 0.5,
                      transition: "all 0.2s",
                    }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: prevCleared ? C.dark : C.light }}>
                      {ch.id}-{st.num}
                    </div>
                    <div style={{ fontSize: 11, color: C.mid, margin: "4px 0" }}>{st.title}</div>
                    <StarDisplay count={stars} size={14} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GameScreen({ stageIdx, cleared, onClear, onBack }) {
  const stage = STAGES[stageIdx];
  const ch = CHAPTERS.find(c => c.id === stage.ch);
  const [cells, setCells] = useState(stage.start.map(c => [...c]));
  const [moves, setMoves] = useState(0);
  const [history, setHistory] = useState([]);
  const [matched, setMatched] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // Reset when stage changes
  useEffect(() => {
    setCells(stage.start.map(c => [...c]));
    setMoves(0);
    setHistory([]);
    setMatched(false);
    setShowHint(false);
    setShowResult(false);
  }, [stageIdx]);

  const applyOp = useCallback((opFn) => {
    if (matched) return;
    const newCells = opFn(cells);
    if (!inBounds(newCells)) return;
    setHistory(h => [...h, { cells: cells.map(c => [...c]), moves }]);
    setCells(newCells);
    setMoves(m => m + 1);
    if (cellsMatch(newCells, stage.target)) {
      setMatched(true);
      setTimeout(() => setShowResult(true), 800);
    }
  }, [cells, moves, matched, stage.target]);

  const undo = useCallback(() => {
    if (history.length === 0 || matched) return;
    const last = history[history.length - 1];
    setCells(last.cells);
    setMoves(last.moves);
    setHistory(h => h.slice(0, -1));
  }, [history, matched]);

  const reset = useCallback(() => {
    setCells(stage.start.map(c => [...c]));
    setMoves(0);
    setHistory([]);
    setMatched(false);
    setShowHint(false);
    setShowResult(false);
  }, [stage]);

  const earnedStars = useMemo(() => {
    if (!matched) return 0;
    const m = moves;
    if (m <= stage.stars[0]) return 3;
    if (m <= stage.stars[1]) return 2;
    return 1;
  }, [matched, moves, stage.stars]);

  const hasOp = (op) => stage.ops.includes(op);

  if (showResult) {
    return (
      <ResultScreen
        stage={stage}
        ch={ch}
        stageIdx={stageIdx}
        moves={moves}
        stars={earnedStars}
        onRetry={reset}
        onNext={() => {
          if (stageIdx < STAGES.length - 1) {
            onClear(stageIdx, earnedStars, true);
          } else {
            onClear(stageIdx, earnedStars);
            onBack();
          }
        }}
        onBack={() => { onClear(stageIdx, earnedStars); onBack(); }}
        isLast={stageIdx >= STAGES.length - 1}
      />
    );
  }

  return (
    <div style={{ ...S.container, paddingTop: 16, paddingBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: 4,
        }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: ch.color,
            textTransform: "uppercase", letterSpacing: 1,
          }}>{ch.icon} {ch.name}</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{stage.title}</div>
        </div>
        <button onClick={reset} style={{
          background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 4,
        }}>🔄</button>
      </div>

      {/* Stage description */}
      <div style={{
        background: `${ch.color}11`, borderRadius: 12, padding: "10px 14px",
        marginBottom: 12, fontSize: 13, color: C.mid, textAlign: "center",
        border: `1px solid ${ch.color}22`,
      }}>
        {stage.desc}
      </div>

      {/* Move counter & stars */}
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        gap: 16, marginBottom: 12,
      }}>
        <div style={{
          background: C.card, borderRadius: 12, padding: "8px 16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: C.mid }}>조작</span>
          <span style={{
            fontSize: 22, fontWeight: 900,
            color: moves > stage.stars[1] ? C.accent : C.dark,
          }}>{moves}</span>
          <span style={{ fontSize: 12, color: C.light }}>/ {stage.stars[2]}</span>
        </div>
        <div style={{
          background: C.card, borderRadius: 12, padding: "8px 12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          <StarDisplay count={
            moves <= stage.stars[0] ? 3 : moves <= stage.stars[1] ? 2 : moves <= stage.stars[2] ? 1 : 0
          } size={18} />
        </div>
      </div>

      {/* Grid */}
      <GridView playerCells={cells} targetCells={stage.target} matched={matched} />

      {/* Controls */}
      <div style={{ marginTop: 16 }}>
        {/* Direction pad - only if move is allowed */}
        {hasOp("move") && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 10 }}>
            <OpButton label="위" icon="⬆" color={C.btnMove}
              onClick={() => applyOp(c => move(c, -1, 0))} disabled={matched} />
            <div style={{ display: "flex", gap: 4 }}>
              <OpButton label="왼쪽" icon="⬅" color={C.btnMove}
                onClick={() => applyOp(c => move(c, 0, -1))} disabled={matched} />
              <OpButton label="아래" icon="⬇" color={C.btnMove}
                onClick={() => applyOp(c => move(c, 1, 0))} disabled={matched} />
              <OpButton label="오른쪽" icon="➡" color={C.btnMove}
                onClick={() => applyOp(c => move(c, 0, 1))} disabled={matched} />
            </div>
          </div>
        )}

        {/* Transform buttons */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {hasOp("flipH") && (
            <OpButton label="좌우 뒤집기" icon="↔️" color={C.btnFlip}
              onClick={() => applyOp(flipH)} disabled={matched} />
          )}
          {hasOp("flipV") && (
            <OpButton label="상하 뒤집기" icon="↕️" color={C.btnFlip}
              onClick={() => applyOp(flipV)} disabled={matched} />
          )}
          {hasOp("rotate") && (
            <OpButton label="돌리기" icon="🔄" color={C.btnRotate}
              onClick={() => applyOp(rotateCW)} disabled={matched} />
          )}
        </div>

        {/* Undo & Hint */}
        <div style={{ display: "flex", gap: 6 }}>
          <OpButton label="되돌리기" icon="↩️" color={C.btnUndo}
            onClick={undo} disabled={matched || history.length === 0} />
          <button onClick={() => setShowHint(!showHint)} style={{
            flex: 1, padding: "10px 6px",
            background: showHint ? `${C.gold}22` : C.card,
            border: `2px solid ${showHint ? C.gold : "#E2E8F0"}`,
            borderRadius: 14, cursor: "pointer",
            fontSize: 11, fontWeight: 700, fontFamily: font,
            color: showHint ? C.gold : C.mid,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
          }}>
            <span style={{ fontSize: 22 }}>💡</span>
            <span>힌트</span>
          </button>
        </div>

        {/* Hint text */}
        {showHint && (
          <div style={{
            marginTop: 10, padding: "12px 16px",
            background: `${C.gold}15`, borderRadius: 12,
            border: `1px solid ${C.gold}33`,
            fontSize: 13, color: C.dark, textAlign: "center",
            animation: "fadeIn 0.3s ease",
          }}>
            💡 {stage.hint}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultScreen({ stage, ch, stageIdx, moves, stars, onRetry, onNext, onBack, isLast }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);

  const messages = [
    "", "잘했어요! 👏", "훌륭해요! 🎉", "완벽해요! 🌟"
  ];

  return (
    <div style={{
      ...S.container,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", gap: 20, textAlign: "center",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(20px) scale(0.95)",
      transition: "all 0.6s ease",
    }}>
      <div style={{ fontSize: 64, marginBottom: -8 }}>
        {stars === 3 ? "🏆" : stars === 2 ? "🎉" : "👍"}
      </div>
      <h2 style={{ fontFamily: fontTitle, fontSize: 28, margin: 0, color: C.dark }}>
        스테이지 클리어!
      </h2>
      <p style={{ fontSize: 18, color: C.mid, margin: 0 }}>{messages[stars]}</p>

      <div style={{
        background: C.card, borderRadius: 20, padding: "24px 32px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontSize: 14, color: C.mid, marginBottom: 8 }}>
          {ch.icon} {ch.name} · {stage.title}
        </div>
        <StarDisplay count={stars} size={36} />
        <div style={{ marginTop: 12, fontSize: 14, color: C.mid }}>
          조작 횟수: <strong style={{ color: C.dark }}>{moves}번</strong>
          <span style={{ color: C.light }}> (최소 {stage.stars[0]}번)</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onRetry} style={{
          padding: "14px 24px", fontSize: 15, fontWeight: 700,
          fontFamily: font,
          background: C.card, color: C.mid,
          border: `2px solid #E2E8F0`, borderRadius: 16,
          cursor: "pointer",
        }}>
          다시 도전
        </button>
        {!isLast ? (
          <button onClick={onNext} style={{
            padding: "14px 32px", fontSize: 15, fontWeight: 700,
            fontFamily: font,
            background: `linear-gradient(135deg, ${ch.color}, ${ch.color}CC)`,
            color: "#FFF", border: "none", borderRadius: 16,
            cursor: "pointer",
            boxShadow: `0 4px 16px ${ch.color}44`,
          }}>
            다음 스테이지 →
          </button>
        ) : (
          <button onClick={onBack} style={{
            padding: "14px 32px", fontSize: 15, fontWeight: 700,
            fontFamily: font,
            background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`,
            color: "#FFF", border: "none", borderRadius: 16,
            cursor: "pointer",
            boxShadow: `0 4px 16px ${C.gold}44`,
          }}>
            🏆 축하합니다!
          </button>
        )}
      </div>

      <button onClick={onBack} style={{
        background: "none", border: "none",
        color: C.light, fontSize: 13, cursor: "pointer", fontFamily: font,
      }}>
        스테이지 선택으로
      </button>
    </div>
  );
}

// ─── App ───
export default function App() {
  const [screen, setScreen] = useState("title"); // title | chapters | game
  const [stageIdx, setStageIdx] = useState(0);
  const [cleared, setCleared] = useState(() => Array(STAGES.length).fill(0));

  const handleClear = useCallback((idx, stars, goNext) => {
    setCleared(prev => {
      const next = [...prev];
      next[idx] = Math.max(next[idx], stars);
      return next;
    });
    if (goNext && idx < STAGES.length - 1) {
      setStageIdx(idx + 1);
    }
  }, []);

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;700;900&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.96) !important; }
      `}</style>

      {screen === "title" && (
        <TitleScreen onStart={() => setScreen("chapters")} />
      )}
      {screen === "chapters" && (
        <ChapterSelect
          cleared={cleared}
          onSelect={(idx) => { setStageIdx(idx); setScreen("game"); }}
          onBack={() => setScreen("title")}
        />
      )}
      {screen === "game" && (
        <GameScreen
          stageIdx={stageIdx}
          cleared={cleared}
          onClear={handleClear}
          onBack={() => setScreen("chapters")}
        />
      )}
    </div>
  );
}
