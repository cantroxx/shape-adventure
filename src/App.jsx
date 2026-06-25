import { useState, useCallback, useMemo, useEffect, useRef } from "react";

// ─── Grid & Cell ───
const GRID = 7;
const CELL = 62;
const SANDBOX_GRID = 16;
const SANDBOX_CELL = 38;

// ─── Transform helpers ───
function bbox(cells) {
  const rs = cells.map(c => c[0]), cs = cells.map(c => c[1]);
  return { r0: Math.min(...rs), r1: Math.max(...rs), c0: Math.min(...cs), c1: Math.max(...cs) };
}
function center(cells) {
  const b = bbox(cells);
  return { cr: (b.r0 + b.r1) / 2, cc: (b.c0 + b.c1) / 2 };
}
function keepInGrid(cells, gridSize = GRID) {
  const rs = cells.map(c => c[0]), cs = cells.map(c => c[1]);
  const minR = Math.min(...rs), maxR = Math.max(...rs);
  const minC = Math.min(...cs), maxC = Math.max(...cs);
  let dr = 0, dc = 0;
  if (minR < 0) dr = -minR;
  else if (maxR >= gridSize) dr = gridSize - 1 - maxR;
  if (minC < 0) dc = -minC;
  else if (maxC >= gridSize) dc = gridSize - 1 - maxC;
  return cells.map(([r, c]) => [r + dr, c + dc]);
}
function move(cells, dr, dc) {
  return cells.map(([r, c]) => [r + dr, c + dc]);
}
function flipH(cells, gridSize = GRID) {
  const { c0 } = bbox(cells);
  const flipped = cells.map(([r, c]) => [r, 2 * c0 - c - 1]);
  return keepInGrid(flipped, gridSize);
}
function flipV(cells, gridSize = GRID) {
  const { r0 } = bbox(cells);
  const flipped = cells.map(([r, c]) => [2 * r0 - r - 1, c]);
  return keepInGrid(flipped, gridSize);
}
function rotateCW(cells, gridSize = GRID) {
  const { r0, c0 } = bbox(cells);
  const rotated = cells.map(([r, c]) => [
    r0 + (c - c0),
    c0 + (r0 - r - 1)
  ]);
  return keepInGrid(rotated, gridSize);
}
function isValid(cells, blocked = []) {
  const bSet = cellSet(blocked);
  return cells.every(([r, c]) => r >= 0 && r < GRID && c >= 0 && c < GRID && !bSet.has(`${r},${c}`));
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

// ─── Polygon helpers ───
function rasterLine(r0, c0, r1, c1) {
  const cells = [];
  const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  const steps = Math.max(dr, dc);
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    cells.push([Math.round(r0 + t * (r1 - r0)), Math.round(c0 + t * (c1 - c0))]);
  }
  return cells;
}
function pointInPoly(pr, pc, verts) {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const ri = verts[i][0] + 0.5, ci = verts[i][1] + 0.5;
    const rj = verts[j][0] + 0.5, cj = verts[j][1] + 0.5;
    const tr = pr + 0.5, tc = pc + 0.5;
    if ((ri > tr) !== (rj > tr) && tc < (cj - ci) * (tr - ri) / (rj - ri) + ci) {
      inside = !inside;
    }
  }
  return inside;
}
function fillPolygon(verts, gridSize) {
  const edgeCells = new Set();
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    rasterLine(verts[i][0], verts[i][1], verts[j][0], verts[j][1])
      .forEach(([r, c]) => edgeCells.add(`${r},${c}`));
  }
  const filled = new Set(edgeCells);
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (!filled.has(`${r},${c}`) && pointInPoly(r, c, verts)) {
        filled.add(`${r},${c}`);
      }
    }
  }
  return [...filled].map(k => k.split(",").map(Number));
}

// ─── Stage Data ───
const CHAPTERS = [
  { id: 1, name: "밀기 마을", icon: "🏘️", desc: "도형을 밀어서 옮겨요", color: "#4ECDC4" },
  { id: 2, name: "거울 숲", icon: "🪞", desc: "도형을 뒤집어 봐요", color: "#A78BFA" },
  { id: 3, name: "회전 탑", icon: "🏰", desc: "도형을 돌려 봐요", color: "#F59E0B" },
  { id: 4, name: "뒤틀이의 성", icon: "👾", desc: "모두 합쳐서 도전!", color: "#EF4444" },
  { id: 5, name: "장애물 미로", icon: "🧱", desc: "벽을 피해서 도형을 옮겨요", color: "#06B6D4" },
];

const STAGES = [
  // ── Chapter 1: 밀기 ──
  {
    ch: 1, num: 1, title: "네모를 옮겨요",
    desc: "네모를 오른쪽으로 밀어 초록 자리에 맞춰 보세요!",
    start: [[1,1],[1,2],[2,1],[2,2]],
    target: [[1,4],[1,5],[2,4],[2,5]],
    blocked: [],
    ops: ["move"], stars: [3, 5, 7],
    hint: "오른쪽 화살표를 눌러 보세요!",
  },
  {
    ch: 1, num: 2, title: "막대를 옮겨요",
    desc: "세로 막대를 아래, 오른쪽으로 밀어 보세요.",
    start: [[0,1],[1,1],[2,1]],
    target: [[2,4],[3,4],[4,4]],
    blocked: [],
    ops: ["move"], stars: [5, 7, 9],
    hint: "아래로 2번, 오른쪽으로 3번!",
  },
  {
    ch: 1, num: 3, title: "L자 도형을 옮겨요",
    desc: "L자 모양을 목표 지점까지 밀어 주세요.",
    start: [[0,0],[1,0],[2,0],[2,1]],
    target: [[3,3],[4,3],[5,3],[5,4]],
    blocked: [],
    ops: ["move"], stars: [6, 8, 10],
    hint: "아래로 3번, 오른쪽으로 3번 밀어요!",
  },
  // ── Chapter 2: 뒤집기 ──
  {
    ch: 2, num: 1, title: "좌우로 뒤집어요",
    desc: "L자 도형을 좌우로 뒤집어 보세요!",
    start: [[2,1],[3,1],[4,1],[4,2]],
    target: [[2,1],[3,1],[4,0],[4,1]],
    blocked: [],
    ops: ["flipH"], stars: [1, 2, 3],
    hint: "좌우 뒤집기 버튼을 눌러 보세요!",
  },
  {
    ch: 2, num: 2, title: "상하로 뒤집어요",
    desc: "T자 도형을 위아래로 뒤집어 보세요!",
    start: [[1,2],[1,3],[1,4],[2,3]],
    target: [[0,3],[1,2],[1,3],[1,4]],
    blocked: [],
    ops: ["flipV"], stars: [1, 2, 3],
    hint: "상하 뒤집기 버튼을 눌러 보세요!",
  },
  {
    ch: 2, num: 3, title: "뒤집고 옮겨요",
    desc: "Z자 도형을 뒤집고 옮겨서 맞춰 보세요!",
    start: [[2,1],[2,2],[3,2],[3,3]],
    target: [[2,3],[2,4],[3,2],[3,3]],
    blocked: [],
    ops: ["move", "flipH"], stars: [3, 5, 7],
    hint: "좌우 뒤집기 후 오른쪽으로 2번 밀어 보세요!",
  },
  // ── Chapter 3: 돌리기 ──
  {
    ch: 3, num: 1, title: "막대를 돌려요",
    desc: "세로 막대를 돌려서 가로로 만들어 보세요!",
    start: [[1,3],[2,3],[3,3]],
    target: [[1,0],[1,1],[1,2]],
    blocked: [],
    ops: ["rotate"], stars: [1, 2, 3],
    hint: "돌리기 버튼을 한 번 눌러 보세요!",
  },
  {
    ch: 3, num: 2, title: "L자를 돌려요",
    desc: "L자 도형을 90도 돌려 보세요!",
    start: [[1,2],[2,2],[3,2],[3,3]],
    target: [[1,0],[1,1],[1,2],[2,0]],
    blocked: [],
    ops: ["rotate"], stars: [1, 2, 3],
    hint: "돌리기 버튼을 한 번 눌러 보세요!",
  },
  {
    ch: 3, num: 3, title: "돌리고 옮겨요",
    desc: "L자를 돌린 다음 아래로 옮겨 보세요!",
    start: [[1,1],[2,1],[3,1],[3,2]],
    target: [[4,0],[4,1],[4,2],[5,0]],
    blocked: [],
    ops: ["move", "rotate"], stars: [4, 6, 8],
    hint: "먼저 한 번 돌리고, 아래로 3번 밀어요!",
  },
  // ── Chapter 4: 종합 ──
  {
    ch: 4, num: 1, title: "뒤집고 돌려요",
    desc: "T자를 뒤집고 돌려서 맞춰 보세요!",
    start: [[1,2],[1,3],[1,4],[2,3]],
    target: [[0,0],[1,0],[1,1],[2,0]],
    blocked: [],
    ops: ["flipV", "rotate"], stars: [2, 4, 6],
    hint: "상하 뒤집기 후 돌리기를 해 보세요!",
  },
  {
    ch: 4, num: 2, title: "뒤집고 옮기고!",
    desc: "L자를 뒤집고 오른쪽으로 밀어 보세요!",
    start: [[1,1],[2,1],[3,1],[3,2]],
    target: [[1,4],[2,4],[3,3],[3,4]],
    blocked: [],
    ops: ["move", "flipH"], stars: [4, 6, 8],
    hint: "좌우 뒤집기 후 오른쪽으로 3번 밀어요!",
  },
  {
    ch: 4, num: 3, title: "뒤틀이를 물리쳐라!",
    desc: "모든 기술을 사용해 도형을 맞춰 보세요!",
    start: [[1,1],[1,2],[2,1],[3,1],[3,2]],
    target: [[1,3],[1,4],[2,4],[3,3],[3,4]],
    blocked: [],
    ops: ["move", "flipH", "flipV", "rotate"], stars: [4, 6, 9],
    hint: "좌우 뒤집기 후 오른쪽으로 3번 밀어 보세요!",
  },
  // ── Chapter 5: 장애물 미로 ──
  {
    ch: 5, num: 1, title: "벽을 피해서",
    desc: "벽이 길을 막고 있어요! 돌아서 가야 해요.",
    start: [[1,1],[1,2],[2,1],[2,2]],
    target: [[1,5],[1,6],[2,5],[2,6]],
    blocked: [[0,3],[1,3],[2,3]],
    ops: ["move"], stars: [8, 10, 14],
    hint: "아래로 내려가서 벽 아래를 돌아가세요!",
  },
  {
    ch: 5, num: 2, title: "돌려서 통과해",
    desc: "벽 사이 좁은 틈을 통과하려면 도형을 돌려야 해요!",
    start: [[1,1],[2,1],[3,1]],
    target: [[3,4],[3,5],[3,6]],
    blocked: [[1,3],[2,3],[4,3],[5,3]],
    ops: ["move", "rotate"], stars: [7, 9, 11],
    hint: "아래로 2번 이동 후 돌리고, 오른쪽으로 4번 밀어 틈으로 통과해요!",
  },
  {
    ch: 5, num: 3, title: "미로를 탈출해!",
    desc: "뒤집고 돌리고 밀어서 미로를 돌파하세요!",
    start: [[0,0],[1,0],[1,1]],
    target: [[5,5],[5,6],[6,5]],
    blocked: [[3,0],[3,1],[3,2],[3,3],[3,4]],
    ops: ["move", "flipH", "flipV", "rotate"], stars: [8, 11, 15],
    hint: "뒤집어서 모양을 바꾼 뒤, 벽 오른쪽으로 돌아가세요!",
  },
];

// ─── Colors ───
const C = {
  bg: "#FFF8F0", grid: "#F5EDE3", gridLine: "#E8DDD0",
  player: "#FF6B6B", playerStroke: "#E05555",
  target: "#4ECDC4", targetAlpha: "rgba(78,205,196,0.3)", targetStroke: "rgba(78,205,196,0.6)",
  match: "#2ECC71", matchStroke: "#27AE60",
  blocked: "#636E72", blockedLight: "#B2BEC3",
  btnMove: "#4ECDC4", btnFlip: "#A78BFA", btnRotate: "#F59E0B", btnUndo: "#94A3B8",
  dark: "#2D3436", mid: "#636E72", light: "#B2BEC3",
  accent: "#FF6B6B", gold: "#F59E0B", card: "#FFFFFF",
  sandbox: "#06B6D4", sandboxLight: "#ECFEFF",
};

const font = `'Pretendard','Noto Sans KR',system-ui,sans-serif`;

// ─── Operation labels for history ───
const OP_LABELS = {
  up: "⬆ 위로", down: "⬇ 아래로", left: "⬅ 왼쪽으로", right: "➡ 오른쪽으로",
  flipH: "↔ 좌우 뒤집기", flipV: "↕ 상하 뒤집기", rotate: "🔄 돌리기",
};

// ─── Shared Components ───
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

function GridView({
  playerCells, targetCells = [], blocked = [], matched, onCellClick, onCellDrag, clickable,
  gridSize = GRID, cellSize = CELL, polygons = [], ghostPolygons = [], currentVertices = [],
  showFlipHLine = false, showFlipVLine = false, showRotatePivot = false
}) {
  const gridPx = cellSize * gridSize;
  const pSet = cellSet(playerCells);
  const tSet = cellSet(targetCells);
  const drawRef = useRef({ active: false, mode: null });
  const gridRef = useRef(null);
  const b = playerCells.length > 0 ? bbox(playerCells) : null;

  const getCellFromPos = useCallback((clientX, clientY) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const c = Math.floor(x / cellSize), r = Math.floor(y / cellSize);
    if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return null;
    return [r, c];
  }, [cellSize, gridSize]);

  const handlePointerDown = useCallback((e) => {
    if (!clickable) return;
    e.preventDefault();
    const pos = getCellFromPos(e.clientX, e.clientY);
    if (!pos) return;
    const [r, c] = pos;
    const exists = playerCells.find(([cr, cc]) => cr === r && cc === c);
    drawRef.current = { active: true, mode: exists ? "erase" : "draw", visited: new Set([`${r},${c}`]) };
    onCellClick?.(r, c);
  }, [clickable, playerCells, onCellClick, getCellFromPos]);

  const handlePointerMove = useCallback((e) => {
    if (!clickable || !drawRef.current.active) return;
    e.preventDefault();
    const pos = getCellFromPos(e.clientX, e.clientY);
    if (!pos) return;
    const [r, c] = pos;
    const key = `${r},${c}`;
    if (drawRef.current.visited.has(key)) return;
    drawRef.current.visited.add(key);
    const exists = playerCells.find(([cr, cc]) => cr === r && cc === c);
    if (drawRef.current.mode === "draw" && !exists) onCellDrag?.(r, c, "add");
    else if (drawRef.current.mode === "erase" && exists) onCellDrag?.(r, c, "remove");
  }, [clickable, playerCells, onCellDrag, getCellFromPos]);

  const handlePointerUp = useCallback(() => {
    drawRef.current = { active: false, mode: null };
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    return () => window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerUp]);

  return (
    <div ref={gridRef} style={{
      position: "relative", width: gridPx + 2, height: gridPx + 2,
      margin: "0 auto", borderRadius: 16, overflow: "hidden",
      background: C.grid, border: `2px solid ${C.gridLine}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.08), inset 0 2px 4px rgba(255,255,255,0.6)",
      touchAction: "none",
    }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* Grid lines */}
      {Array.from({ length: gridSize - 1 }).map((_, i) => (
        <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: (i + 1) * cellSize, height: 1, background: C.gridLine }} />
      ))}
      {Array.from({ length: gridSize - 1 }).map((_, i) => (
        <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: (i + 1) * cellSize, width: 1, background: C.gridLine }} />
      ))}

      {/* Blocked cells */}
      {blocked.map(([r, c]) => (
        <div key={`b-${r},${c}`} style={{
          position: "absolute", left: c * cellSize + 2, top: r * cellSize + 2,
          width: cellSize - 4, height: cellSize - 4, borderRadius: 8,
          background: `repeating-linear-gradient(45deg, ${C.blocked}, ${C.blocked} 4px, ${C.blockedLight} 4px, ${C.blockedLight} 8px)`,
          opacity: 0.6,
        }} />
      ))}

      {/* Target cells */}
      {targetCells.map(([r, c]) => {
        const key = `${r},${c}`;
        const isMatched = pSet.has(key);
        return (
          <div key={`t-${key}`} style={{
            position: "absolute", left: c * cellSize + 3, top: r * cellSize + 3,
            width: cellSize - 6, height: cellSize - 6, borderRadius: 8,
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
            left: c * cellSize + 2, top: r * cellSize + 2,
            width: cellSize - 4, height: cellSize - 4, borderRadius: cellSize > 40 ? 10 : 6,
            background: matched
              ? `linear-gradient(135deg, ${C.match}, #58D68D)`
              : isOnTarget
                ? `linear-gradient(135deg, ${C.match}, #58D68D)`
                : `linear-gradient(135deg, ${C.player}, #FF8E8E)`,
            border: `2px solid ${matched || isOnTarget ? C.matchStroke : C.playerStroke}`,
            boxShadow: matched ? `0 0 16px rgba(46,204,113,0.5)` : `0 3px 8px rgba(0,0,0,0.12)`,
            transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: matched ? "scale(1.05)" : "scale(1)",
            zIndex: 2,
          }} />
        );
      })}

      {/* SVG polygon overlay */}
      {(polygons.length > 0 || ghostPolygons.length > 0 || currentVertices.length > 0 || (playerCells.length > 0 && (showFlipHLine || showFlipVLine || showRotatePivot))) && (
        <svg style={{ position: "absolute", top: 0, left: 0, width: cellSize * gridSize, height: cellSize * gridSize, pointerEvents: "none", zIndex: 8 }}>
          {/* Flip H Axis Line */}
          {showFlipHLine && b && (
            <line
              x1={b.c0 * cellSize} y1={0}
              x2={b.c0 * cellSize} y2={gridSize * cellSize}
              stroke={C.btnFlip} strokeWidth="3" strokeDasharray="6,4"
              opacity="0.8"
            />
          )}
          {/* Flip V Axis Line */}
          {showFlipVLine && b && (
            <line
              x1={0} y1={b.r0 * cellSize}
              x2={gridSize * cellSize} y2={b.r0 * cellSize}
              stroke={C.btnFlip} strokeWidth="3" strokeDasharray="6,4"
              opacity="0.8"
            />
          )}
          {/* Rotation Pivot Point */}
          {showRotatePivot && b && (
            <g>
              <circle
                cx={b.c0 * cellSize} cy={b.r0 * cellSize}
                r="7" fill={C.btnRotate} stroke="#FFF" strokeWidth="2"
                style={{ filter: "drop-shadow(0px 1px 3px rgba(0,0,0,0.3))" }}
              />
              <circle
                cx={b.c0 * cellSize} cy={b.r0 * cellSize}
                r="12" fill="none" stroke={C.btnRotate} strokeWidth="1.5" strokeDasharray="3,2"
                className="pulse-anim"
              />
            </g>
          )}

          {/* Ghost polygons (original position) */}
          {ghostPolygons.map((poly, pi) => (
            <polygon key={`gp-${pi}`}
              points={poly.map(([r,c]) => `${c * cellSize + cellSize/2},${r * cellSize + cellSize/2}`).join(" ")}
              fill="none" stroke={C.targetStroke} strokeWidth="2.5" strokeDasharray="6,4" strokeLinejoin="round"
            />
          ))}
          {/* Completed polygons */}
          {polygons.map((poly, pi) => (
            <polygon key={`cp-${pi}`}
              points={poly.map(([r,c]) => `${c * cellSize + cellSize/2},${r * cellSize + cellSize/2}`).join(" ")}
              fill="none" stroke={C.player} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"
            />
          ))}
          {polygons.map((poly, pi) => poly.map(([r,c], vi) => (
            <circle key={`cv-${pi}-${vi}`}
              cx={c * cellSize + cellSize/2} cy={r * cellSize + cellSize/2}
              r="5" fill={C.player} stroke="#FFF" strokeWidth="2"
            />
          )))}
          {/* In-progress polygon preview */}
          {currentVertices.length >= 2 && (
            <polyline
              points={currentVertices.map(([r,c]) => `${c * cellSize + cellSize/2},${r * cellSize + cellSize/2}`).join(" ")}
              fill="none" stroke={C.player} strokeWidth="2.5" strokeDasharray="6,4" strokeLinejoin="round"
            />
          )}
          {currentVertices.map(([r,c], i) => (
            <g key={`pv-${i}`}>
              <circle cx={c * cellSize + cellSize/2} cy={r * cellSize + cellSize/2}
                r="7" fill={i === 0 ? "#3B82F6" : "#F59E0B"} stroke="#FFF" strokeWidth="2" />
              <text x={c * cellSize + cellSize/2} y={r * cellSize + cellSize/2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                fill="#FFF" fontSize="8" fontWeight="900">{i + 1}</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function OpButton({ label, icon, color, onClick, disabled, small }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 2, padding: small ? "8px 4px" : "10px 6px", minWidth: small ? 54 : 64,
      background: disabled ? "#E2E8F0" : `linear-gradient(135deg, ${color}, ${color}DD)`,
      color: disabled ? "#A0AEC0" : "#FFF",
      border: "none", borderRadius: 14,
      fontSize: small ? 10 : 11, fontWeight: 700, fontFamily: font,
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : `0 4px 12px ${color}44`,
      transition: "all 0.15s", flex: 1,
    }}>
      <span style={{ fontSize: small ? 18 : 22, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ─── Title Screen ───
function TitleScreen({ onStart, onSandbox }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", gap: 20, textAlign: "center", padding: "0 24px",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(30px)",
      transition: "all 0.8s ease",
    }}>
      <div style={{ fontSize: 64 }}>🔷</div>
      <div>
        <h1 style={{
          fontSize: 34, margin: 0, fontWeight: 900,
          background: `linear-gradient(135deg, ${C.player}, ${C.target})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>도형 탐험대</h1>
        <p style={{ color: C.mid, fontSize: 14, margin: "6px 0 0" }}>밀고 · 뒤집고 · 돌리고</p>
      </div>
      <p style={{ color: C.mid, fontSize: 13, lineHeight: 1.6, maxWidth: 280 }}>
        마왕 뒤틀이가 엉망으로 만든 도형 왕국!<br />
        도형을 움직여 원래 모습으로 되돌려 주세요!
      </p>
      <button onClick={onStart} style={{
        padding: "16px 48px", fontSize: 18, fontWeight: 800, fontFamily: font,
        background: `linear-gradient(135deg, ${C.player}, #FF8E8E)`,
        color: "#FFF", border: "none", borderRadius: 20, cursor: "pointer",
        boxShadow: `0 6px 24px ${C.player}44`,
      }}>
        탐험 시작! 🚀
      </button>
      <button onClick={onSandbox} style={{
        padding: "12px 32px", fontSize: 15, fontWeight: 700, fontFamily: font,
        background: C.card, color: C.sandbox,
        border: `2px solid ${C.sandbox}44`, borderRadius: 16, cursor: "pointer",
      }}>
        🎨 자유 창작 모드
      </button>
      <p style={{ color: C.light, fontSize: 11 }}>4학년 수학 · 평면도형의 이동</p>
    </div>
  );
}

// ─── Chapter Select ───
function ChapterSelect({ cleared, onSelect, onBack }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
        <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>스테이지 선택</h2>
      </div>
      {CHAPTERS.map(ch => {
        const chStages = STAGES.filter(s => s.ch === ch.id);
        return (
          <div key={ch.id} style={{
            background: C.card, borderRadius: 20, padding: 20, marginBottom: 16,
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)", border: `2px solid ${ch.color}22`,
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
                      background: prevCleared ? `linear-gradient(135deg, ${ch.color}15, ${ch.color}08)` : "#F1F5F9",
                      border: `2px solid ${prevCleared ? ch.color + "44" : "#E2E8F0"}`,
                      borderRadius: 14, cursor: prevCleared ? "pointer" : "not-allowed",
                      opacity: prevCleared ? 1 : 0.5, transition: "all 0.2s",
                    }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: prevCleared ? C.dark : C.light }}>{ch.id}-{st.num}</div>
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

// ─── Game Screen ───
function GameScreen({ stageIdx, cleared, onClear, onBack }) {
  const stage = STAGES[stageIdx];
  const ch = CHAPTERS.find(c => c.id === stage.ch);
  const [cells, setCells] = useState(stage.start.map(c => [...c]));
  const [moves, setMoves] = useState(0);
  const [history, setHistory] = useState([]);
  const [opLog, setOpLog] = useState([]);
  const [matched, setMatched] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    setCells(stage.start.map(c => [...c]));
    setMoves(0); setHistory([]); setOpLog([]);
    setMatched(false); setShowHint(false); setShowResult(false); setReplaying(false);
  }, [stageIdx]);

  const applyOp = useCallback((opFn, opName) => {
    if (matched || replaying) return;
    const newCells = opFn(cells, GRID);
    if (!isValid(newCells, stage.blocked)) return;
    setHistory(h => [...h, { cells: cells.map(c => [...c]), moves, opLog: [...opLog] }]);
    setCells(newCells);
    setMoves(m => m + 1);
    setOpLog(l => [...l, opName]);
    if (cellsMatch(newCells, stage.target)) {
      setMatched(true);
      setTimeout(() => setShowResult(true), 800);
    }
  }, [cells, moves, matched, replaying, stage, opLog]);

  const undo = useCallback(() => {
    if (history.length === 0 || matched || replaying) return;
    const last = history[history.length - 1];
    setCells(last.cells); setMoves(last.moves); setOpLog(last.opLog);
    setHistory(h => h.slice(0, -1));
  }, [history, matched, replaying]);

  const reset = useCallback(() => {
    setCells(stage.start.map(c => [...c]));
    setMoves(0); setHistory([]); setOpLog([]);
    setMatched(false); setShowHint(false); setShowResult(false); setReplaying(false);
  }, [stage]);

  // ── Replay ──
  const startReplay = useCallback(() => {
    if (history.length === 0) return;
    setReplaying(true);
    const steps = [stage.start, ...history.map(h => h.cells), cells];
    let i = 0;
    setCells(steps[0].map(c => [...c]));
    const timer = setInterval(() => {
      i++;
      if (i >= steps.length) {
        clearInterval(timer);
        setTimeout(() => setReplaying(false), 300);
        return;
      }
      setCells(steps[i].map(c => [...c]));
    }, 500);
  }, [history, cells, stage]);

  const earnedStars = useMemo(() => {
    if (!matched) return 0;
    return moves <= stage.stars[0] ? 3 : moves <= stage.stars[1] ? 2 : 1;
  }, [matched, moves, stage.stars]);

  const currentStars = moves <= stage.stars[0] ? 3 : moves <= stage.stars[1] ? 2 : moves <= stage.stars[2] ? 1 : 0;
  const hasOp = (op) => stage.ops.includes(op);

  if (showResult) {
    return (
      <ResultScreen stage={stage} ch={ch} stageIdx={stageIdx}
        moves={moves} stars={earnedStars} opLog={opLog}
        onRetry={reset}
        onReplay={() => { setShowResult(false); setTimeout(startReplay, 200); }}
        onNext={() => {
          if (stageIdx < STAGES.length - 1) onClear(stageIdx, earnedStars, true);
          else { onClear(stageIdx, earnedStars); onBack(); }
        }}
        onBack={() => { onClear(stageIdx, earnedStars); onBack(); }}
        isLast={stageIdx >= STAGES.length - 1}
      />
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ch.color }}>{ch.icon} {ch.name}</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{stage.title}</div>
        </div>
        <button onClick={reset} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>🔄</button>
      </div>

      {/* Description */}
      <div style={{
        background: `${ch.color}11`, borderRadius: 12, padding: "10px 14px",
        marginBottom: 12, fontSize: 13, color: C.mid, textAlign: "center",
        border: `1px solid ${ch.color}22`,
      }}>
        {replaying ? "🎬 풀이를 다시 보여 드릴게요..." : stage.desc}
      </div>

      {/* Move counter */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <div style={{
          background: C.card, borderRadius: 12, padding: "8px 16px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: C.mid }}>조작</span>
          <span style={{ fontSize: 22, fontWeight: 900, color: moves > stage.stars[1] ? C.accent : C.dark }}>{moves}</span>
          <span style={{ fontSize: 12, color: C.light }}>/ {stage.stars[2]}</span>
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: "8px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <StarDisplay count={currentStars} size={18} />
        </div>
      </div>

      {/* Grid */}
      <GridView
        playerCells={cells}
        targetCells={stage.target}
        blocked={stage.blocked}
        matched={matched}
        showFlipHLine={stage.ops.includes("flipH")}
        showFlipVLine={stage.ops.includes("flipV")}
        showRotatePivot={stage.ops.includes("rotate")}
      />

      {/* Controls */}
      {!replaying && (
        <div style={{ marginTop: 16 }}>
          {hasOp("move") && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 10 }}>
              <OpButton label="위" icon="⬆" color={C.btnMove} onClick={() => applyOp(c => move(c, -1, 0), "up")} disabled={matched} />
              <div style={{ display: "flex", gap: 4 }}>
                <OpButton label="왼쪽" icon="⬅" color={C.btnMove} onClick={() => applyOp(c => move(c, 0, -1), "left")} disabled={matched} />
                <OpButton label="아래" icon="⬇" color={C.btnMove} onClick={() => applyOp(c => move(c, 1, 0), "down")} disabled={matched} />
                <OpButton label="오른쪽" icon="➡" color={C.btnMove} onClick={() => applyOp(c => move(c, 0, 1), "right")} disabled={matched} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {hasOp("flipH") && <OpButton label="좌우 뒤집기" icon="↔️" color={C.btnFlip} onClick={() => applyOp(flipH, "flipH")} disabled={matched} />}
            {hasOp("flipV") && <OpButton label="상하 뒤집기" icon="↕️" color={C.btnFlip} onClick={() => applyOp(flipV, "flipV")} disabled={matched} />}
            {hasOp("rotate") && <OpButton label="돌리기" icon="🔄" color={C.btnRotate} onClick={() => applyOp(rotateCW, "rotate")} disabled={matched} />}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <OpButton label="되돌리기" icon="↩️" color={C.btnUndo} onClick={undo} disabled={matched || history.length === 0} />
            <button onClick={() => setShowHint(!showHint)} style={{
              flex: 1, padding: "10px 6px", background: showHint ? `${C.gold}22` : C.card,
              border: `2px solid ${showHint ? C.gold : "#E2E8F0"}`, borderRadius: 14,
              cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: font,
              color: showHint ? C.gold : C.mid,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <span style={{ fontSize: 22 }}>💡</span><span>힌트</span>
            </button>
          </div>
          {showHint && (
            <div style={{
              marginTop: 10, padding: "12px 16px", background: `${C.gold}15`,
              borderRadius: 12, border: `1px solid ${C.gold}33`,
              fontSize: 13, color: C.dark, textAlign: "center",
            }}>
              💡 {stage.hint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Result Screen ───
function ResultScreen({ stage, ch, stageIdx, moves, stars, opLog, onRetry, onReplay, onNext, onBack, isLast }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setTimeout(() => setShow(true), 100); }, []);
  const msgs = ["", "잘했어요! 👏", "훌륭해요! 🎉", "완벽해요! 🌟"];

  return (
    <div style={{
      maxWidth: 480, margin: "0 auto", padding: "0 16px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", gap: 16, textAlign: "center",
      opacity: show ? 1 : 0, transform: show ? "none" : "translateY(20px) scale(0.95)",
      transition: "all 0.6s ease",
    }}>
      <div style={{ fontSize: 56 }}>{stars === 3 ? "🏆" : stars === 2 ? "🎉" : "👍"}</div>
      <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>스테이지 클리어!</h2>
      <p style={{ fontSize: 16, color: C.mid, margin: 0 }}>{msgs[stars]}</p>

      <div style={{
        background: C.card, borderRadius: 20, padding: "20px 28px", width: "100%",
        boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
      }}>
        <div style={{ fontSize: 13, color: C.mid, marginBottom: 8 }}>{ch.icon} {ch.name} · {stage.title}</div>
        <StarDisplay count={stars} size={32} />
        <div style={{ marginTop: 10, fontSize: 14, color: C.mid }}>
          조작 횟수: <strong style={{ color: C.dark }}>{moves}번</strong>
          <span style={{ color: C.light }}> (최소 {stage.stars[0]}번)</span>
        </div>

        {/* Operation log */}
        {opLog.length > 0 && (
          <div style={{
            marginTop: 12, padding: "10px 12px", background: "#F8FAFC",
            borderRadius: 10, fontSize: 12, color: C.mid, textAlign: "left",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: C.dark }}>풀이 과정:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {opLog.map((op, i) => (
                <span key={i} style={{
                  padding: "3px 8px", background: "#E2E8F0",
                  borderRadius: 8, fontSize: 11, whiteSpace: "nowrap",
                }}>
                  {i + 1}. {OP_LABELS[op]}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 4, width: "100%" }}>
        <button onClick={onReplay} style={{
          flex: 1, padding: "12px", fontSize: 14, fontWeight: 700, fontFamily: font,
          background: "#F1F5F9", color: C.mid, border: "none", borderRadius: 14, cursor: "pointer",
        }}>
          🎬 다시 보기
        </button>
        <button onClick={onRetry} style={{
          flex: 1, padding: "12px", fontSize: 14, fontWeight: 700, fontFamily: font,
          background: C.card, color: C.mid, border: `2px solid #E2E8F0`, borderRadius: 14, cursor: "pointer",
        }}>
          다시 도전
        </button>
      </div>
      {!isLast ? (
        <button onClick={onNext} style={{
          width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, fontFamily: font,
          background: `linear-gradient(135deg, ${ch.color}, ${ch.color}CC)`,
          color: "#FFF", border: "none", borderRadius: 16, cursor: "pointer",
          boxShadow: `0 4px 16px ${ch.color}44`,
        }}>
          다음 스테이지 →
        </button>
      ) : (
        <button onClick={onBack} style={{
          width: "100%", padding: "14px", fontSize: 16, fontWeight: 700, fontFamily: font,
          background: `linear-gradient(135deg, ${C.gold}, ${C.gold}CC)`,
          color: "#FFF", border: "none", borderRadius: 16, cursor: "pointer",
        }}>
          🏆 모든 스테이지 클리어!
        </button>
      )}
      <button onClick={onBack} style={{
        background: "none", border: "none", color: C.light, fontSize: 13, cursor: "pointer", fontFamily: font,
      }}>
        스테이지 선택으로
      </button>
    </div>
  );
}

// ─── Sandbox Mode ───
// ─── Sandbox Mode ───
function SandboxScreen({ onBack }) {
  const [cells, setCells] = useState([]);
  const [polygons, setPolygons] = useState([]);
  const [ghostCells, setGhostCells] = useState([]);
  const [ghostPolygons, setGhostPolygons] = useState([]);
  const [opLog, setOpLog] = useState([]);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState("draw");
  const [drawTool, setDrawTool] = useState("free");
  const [vertices, setVertices] = useState([]);
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);

  const hasContent = cells.length > 0 || polygons.length > 0;

  const handleCellClick = (r, c) => {
    if (mode !== "draw") return;
    if (drawTool === "polygon") {
      if (vertices.length >= 3 && vertices[0][0] === r && vertices[0][1] === c) {
        completePolygon(); return;
      }
      setVertices(v => [...v, [r, c]]); return;
    }
    const exists = cells.find(([cr, cc]) => cr === r && cc === c);
    if (exists) setCells(cells.filter(([cr, cc]) => !(cr === r && cc === c)));
    else setCells([...cells, [r, c]]);
  };

  const handleCellDrag = (r, c, action) => {
    if (mode !== "draw" || drawTool !== "free") return;
    if (action === "add") setCells(prev => [...prev, [r, c]]);
    else if (action === "remove") setCells(prev => prev.filter(([cr, cc]) => !(cr === r && cc === c)));
  };

  const completePolygon = () => {
    if (vertices.length < 3) return;
    setPolygons(prev => [...prev, vertices.map(v => [...v])]);
    setVertices([]);
  };

  const startOperate = () => {
    if (!hasContent) return;
    setMode("operate");
    setGhostCells(cells.map(c => [...c]));
    setGhostPolygons(polygons.map(p => p.map(v => [...v])));
    setOpLog([]); setHistory([]);
  };

  const backToDraw = () => {
    setMode("draw"); setGhostCells([]); setGhostPolygons([]); setOpLog([]); setHistory([]);
  };

  const applyOp = (opFn, opName) => {
    const newCells = cells.length > 0 ? opFn(cells, SANDBOX_GRID) : [];
    const newPolygons = polygons.map(p => opFn(p, SANDBOX_GRID));
    const allPts = [...newCells, ...newPolygons.flat()];
    if (!allPts.every(([r, c]) => r >= 0 && r < SANDBOX_GRID && c >= 0 && c < SANDBOX_GRID)) return;
    setHistory(h => [...h, {
      cells: cells.map(c => [...c]),
      polygons: polygons.map(p => p.map(v => [...v])),
      opLog: [...opLog],
    }]);
    setCells(newCells); setPolygons(newPolygons); setOpLog(l => [...l, opName]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setCells(last.cells); setPolygons(last.polygons); setOpLog(last.opLog);
    setHistory(h => h.slice(0, -1));
  };

  const clearAll = () => {
    setCells([]); setPolygons([]); setGhostCells([]); setGhostPolygons([]);
    setOpLog([]); setHistory([]); setMode("draw"); setVertices([]);
    setCompareA(null); setCompareB(null);
  };

  const saveSlot = (slot) => {
    const data = {
      cells: cells.map(c => [...c]),
      polygons: polygons.map(p => p.map(v => [...v])),
      opLog: [...opLog],
    };
    if (slot === "A") setCompareA(data); else setCompareB(data);
  };

  const slotsMatch = compareA && compareB &&
    cellKey(compareA.cells) === cellKey(compareB.cells) &&
    JSON.stringify(compareA.polygons) === JSON.stringify(compareB.polygons);

  const drawDesc = drawTool === "free"
    ? "드래그해서 자유롭게 그려요!"
    : vertices.length === 0
      ? "꼭짓점을 찍어 다각형을 그려요!"
      : `꼭짓점 ${vertices.length}개 — ${vertices.length >= 3 ? "첫 점 클릭 또는 완성 버튼!" : "계속 찍어주세요"}`;

  return (
    <div style={{ maxWidth: 650, margin: "0 auto", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>←</button>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>🎨 자유 창작 모드</h2>
          <p style={{ fontSize: 12, color: C.mid, margin: 0 }}>
            {mode === "draw" ? drawDesc : "도형을 밀고, 뒤집고, 돌려 보세요!"}
          </p>
        </div>
      </div>

      {mode === "draw" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => { setDrawTool("free"); setVertices([]); }} style={{
            flex: 1, padding: "8px", fontSize: 13, fontWeight: 700, fontFamily: font,
            background: drawTool === "free" ? C.sandbox : "#F1F5F9",
            color: drawTool === "free" ? "#FFF" : C.mid,
            border: "none", borderRadius: 12, cursor: "pointer",
          }}>✏️ 자유 그리기</button>
          <button onClick={() => setDrawTool("polygon")} style={{
            flex: 1, padding: "8px", fontSize: 13, fontWeight: 700, fontFamily: font,
            background: drawTool === "polygon" ? C.sandbox : "#F1F5F9",
            color: drawTool === "polygon" ? "#FFF" : C.mid,
            border: "none", borderRadius: 12, cursor: "pointer",
          }}>📐 다각형 그리기</button>
        </div>
      )}

      {mode === "draw" && drawTool === "polygon" && vertices.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {vertices.length >= 3 && (
            <button onClick={completePolygon} style={{
              flex: 1, padding: "8px", fontSize: 13, fontWeight: 700, fontFamily: font,
              background: `linear-gradient(135deg, ${C.match}, #58D68D)`,
              color: "#FFF", border: "none", borderRadius: 12, cursor: "pointer",
            }}>✅ {vertices.length}각형 완성</button>
          )}
          <button onClick={() => setVertices([])} style={{
            padding: "8px 14px", fontSize: 13, fontWeight: 700, fontFamily: font,
            background: "#FEE2E2", color: "#EF4444",
            border: "none", borderRadius: 12, cursor: "pointer",
          }}>✕ 취소</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={mode === "draw" ? startOperate : backToDraw} style={{
          flex: 1, padding: "10px", fontSize: 14, fontWeight: 700, fontFamily: font,
          background: mode === "draw"
            ? (hasContent ? `linear-gradient(135deg, ${C.sandbox}, ${C.sandbox}CC)` : "#E2E8F0")
            : C.card,
          color: mode === "draw" ? (hasContent ? "#FFF" : "#A0AEC0") : C.sandbox,
          border: mode === "draw" ? "none" : `2px solid ${C.sandbox}`,
          borderRadius: 14, cursor: hasContent || mode === "operate" ? "pointer" : "not-allowed",
        }}>{mode === "draw" ? "✅ 도형 완성! 조작하기 →" : "✏️ 다시 그리기"}</button>
        <button onClick={clearAll} style={{
          padding: "10px 16px", fontSize: 14, fontWeight: 700, fontFamily: font,
          background: "#FEE2E2", color: "#EF4444",
          border: "none", borderRadius: 14, cursor: "pointer",
        }}>🗑️</button>
      </div>

      <GridView
        playerCells={cells}
        targetCells={mode === "operate" ? ghostCells : []}
        clickable={mode === "draw"}
        onCellClick={handleCellClick}
        onCellDrag={handleCellDrag}
        gridSize={SANDBOX_GRID}
        cellSize={SANDBOX_CELL}
        polygons={polygons}
        ghostPolygons={mode === "operate" ? ghostPolygons : []}
        currentVertices={mode === "draw" ? vertices : []}
        showFlipHLine={mode === "operate"}
        showFlipVLine={mode === "operate"}
        showRotatePivot={mode === "operate"}
      />

      {mode === "operate" && (ghostCells.length > 0 || ghostPolygons.length > 0) && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 12, color: C.mid }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 16, height: 3, background: C.player, borderRadius: 2 }} /> 현재
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 16, height: 3, background: C.targetStroke, borderRadius: 2, borderTop: "2px dashed" }} /> 처음 위치
          </span>
        </div>
      )}

      {mode === "operate" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <OpButton label="위" icon="⬆" color={C.btnMove} small onClick={() => applyOp(c => move(c, -1, 0), "up")} />
            <div style={{ display: "flex", gap: 4 }}>
              <OpButton label="왼쪽" icon="⬅" color={C.btnMove} small onClick={() => applyOp(c => move(c, 0, -1), "left")} />
              <OpButton label="아래" icon="⬇" color={C.btnMove} small onClick={() => applyOp(c => move(c, 1, 0), "down")} />
              <OpButton label="오른쪽" icon="➡" color={C.btnMove} small onClick={() => applyOp(c => move(c, 0, 1), "right")} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <OpButton label="좌우 뒤집기" icon="↔️" color={C.btnFlip} small onClick={() => applyOp(flipH, "flipH")} />
            <OpButton label="상하 뒤집기" icon="↕️" color={C.btnFlip} small onClick={() => applyOp(flipV, "flipV")} />
            <OpButton label="돌리기" icon="🔄" color={C.btnRotate} small onClick={() => applyOp(rotateCW, "rotate")} />
          </div>
          <OpButton label="되돌리기" icon="↩️" color={C.btnUndo} small onClick={undo} disabled={history.length === 0} />
        </div>
      )}

      {mode === "operate" && opLog.length > 0 && (
        <div style={{ marginTop: 12, padding: "12px", background: C.card, borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: C.dark }}>조작 기록 ({opLog.length}번)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {opLog.map((op, i) => (
              <span key={i} style={{ padding: "3px 8px", background: "#F1F5F9", borderRadius: 8, fontSize: 11, color: C.mid }}>
                {i + 1}. {OP_LABELS[op]}
              </span>
            ))}
          </div>
        </div>
      )}

      {mode === "operate" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            💡 조작 순서를 바꿔 보면 결과가 달라질까요?
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => saveSlot("A")} style={{
              flex: 1, padding: "10px", fontSize: 13, fontWeight: 700, fontFamily: font,
              background: compareA ? "#DBEAFE" : "#F1F5F9",
              border: `2px solid ${compareA ? "#3B82F6" : "#E2E8F0"}`,
              borderRadius: 12, cursor: "pointer", color: compareA ? "#3B82F6" : C.mid,
            }}>{compareA ? `A 저장됨 (${compareA.opLog.length}번)` : "A에 저장"}</button>
            <button onClick={() => saveSlot("B")} style={{
              flex: 1, padding: "10px", fontSize: 13, fontWeight: 700, fontFamily: font,
              background: compareB ? "#FEF3C7" : "#F1F5F9",
              border: `2px solid ${compareB ? "#F59E0B" : "#E2E8F0"}`,
              borderRadius: 12, cursor: "pointer", color: compareB ? "#F59E0B" : C.mid,
            }}>{compareB ? `B 저장됨 (${compareB.opLog.length}번)` : "B에 저장"}</button>
          </div>
          {compareA && compareB && (
            <div style={{ marginTop: 10, padding: "12px", background: C.card, borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: C.dark }}>
                A와 B 비교 — {slotsMatch ? "✅ 같은 결과!" : "❌ 다른 결과!"}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[compareA, compareB].map((slot, si) => (
                  <div key={si} style={{ flex: 1, fontSize: 11, color: C.mid }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, color: si === 0 ? "#3B82F6" : "#F59E0B" }}>
                      {si === 0 ? "A" : "B"}
                    </div>
                    {slot.opLog.map((op, i) => <div key={i}>{i + 1}. {OP_LABELS[op]}</div>)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── App ───
export default function App() {
  const [screen, setScreen] = useState("title");
  const [stageIdx, setStageIdx] = useState(0);
  const [cleared, setCleared] = useState(() => Array(STAGES.length).fill(0));

  const handleClear = useCallback((idx, stars, goNext) => {
    setCleared(prev => {
      const next = [...prev];
      next[idx] = Math.max(next[idx], stars);
      return next;
    });
    if (goNext && idx < STAGES.length - 1) setStageIdx(idx + 1);
  }, []);

  return (
    <div style={{
      fontFamily: font, minHeight: "100vh",
      background: `linear-gradient(135deg, ${C.bg} 0%, #FFF0E6 50%, #F0E6FF 100%)`,
      color: C.dark, userSelect: "none", WebkitUserSelect: "none",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.96) !important; }
        
        @keyframes pulse-opacity {
          0% { opacity: 0.4; }
          50% { opacity: 1.0; }
          100% { opacity: 0.4; }
        }
        .pulse-anim {
          animation: pulse-opacity 1.5s ease-in-out infinite;
        }
      `}</style>

      {screen === "title" && (
        <TitleScreen
          onStart={() => setScreen("chapters")}
          onSandbox={() => setScreen("sandbox")}
        />
      )}
      {screen === "chapters" && (
        <ChapterSelect cleared={cleared}
          onSelect={(idx) => { setStageIdx(idx); setScreen("game"); }}
          onBack={() => setScreen("title")}
        />
      )}
      {screen === "game" && (
        <GameScreen stageIdx={stageIdx} cleared={cleared}
          onClear={handleClear} onBack={() => setScreen("chapters")}
        />
      )}
      {screen === "sandbox" && (
        <SandboxScreen onBack={() => setScreen("title")} />
      )}
    </div>
  );
}
