"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

interface BlockPuzzleBattleProps {
 onClose?: () => void;
}

type Cell = string | null;
type Board = Cell[][];
type Mode = "menu" | "solo" | "bot";
type Shape = {
 id: string;
 color: string;
 cells: [number, number][];
};

const SIZE = 8;
const BATTLE_SECONDS = 90;
const COLORS = ["#f97316", "#eab308", "#22c55e", "#06b6d4", "#8b5cf6", "#ec4899"];
const SHAPES: [number, number][][] = [
 [[0, 0]],
 [[0, 0], [0, 1]],
 [[0, 0], [1, 0]],
 [[0, 0], [0, 1], [0, 2]],
 [[0, 0], [1, 0], [2, 0]],
 [[0, 0], [0, 1], [1, 0], [1, 1]],
 [[0, 0], [1, 0], [1, 1]],
 [[0, 1], [1, 0], [1, 1]],
 [[0, 0], [0, 1], [0, 2], [0, 3]],
 [[0, 0], [1, 0], [2, 0], [3, 0]],
 [[0, 0], [0, 1], [1, 1], [1, 2]],
 [[0, 1], [0, 2], [1, 0], [1, 1]],
 [[0, 0], [0, 1], [0, 2], [1, 1]],
 [[0, 0], [1, 0], [2, 0], [2, 1]],
];

const emptyBoard = (): Board =>
 Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));

const makeTray = (): Shape[] =>
 Array.from({ length: 3 }, (_, index) => ({
   id: `${Date.now()}-${index}-${Math.random()}`,
   color: COLORS[Math.floor(Math.random() * COLORS.length)],
   cells: SHAPES[Math.floor(Math.random() * SHAPES.length)],
 }));

const getShapeAnchor = (
 shape: Shape
): [number, number] => {
 const maximumRow = Math.max(
   ...shape.cells.map(([row]) => row)
 );
 const maximumCol = Math.max(
   ...shape.cells.map(([, col]) => col)
 );
 const centerRow = maximumRow / 2;
 const centerCol = maximumCol / 2;

 return [...shape.cells].sort(
   ([firstRow, firstCol], [secondRow, secondCol]) => {
     const firstDistance =
       Math.abs(firstRow - centerRow) +
       Math.abs(firstCol - centerCol);
     const secondDistance =
       Math.abs(secondRow - centerRow) +
       Math.abs(secondCol - centerCol);

     return firstDistance - secondDistance;
   }
 )[0];
};

const getPlacementOrigin = (
 shape: Shape,
 targetRow: number,
 targetCol: number
) => {
 const [anchorRow, anchorCol] = getShapeAnchor(shape);

 return {
   row: targetRow - anchorRow,
   col: targetCol - anchorCol,
 };
};

const canPlace = (board: Board, shape: Shape, row: number, col: number) =>
 shape.cells.every(([dr, dc]) => {
   const origin = getPlacementOrigin(shape, row, col);
   const nextRow = origin.row + dr;
   const nextCol = origin.col + dc;
   return (
     nextRow >= 0 &&
     nextRow < SIZE &&
     nextCol >= 0 &&
     nextCol < SIZE &&
     board[nextRow][nextCol] === null
   );
 });

const hasAnyMove = (board: Board, shapes: Shape[]) =>
 shapes.some((shape) =>
   board.some((_, row) =>
     board[row].some((__, col) => canPlace(board, shape, row, col))
   )
 );

const placeAndClear = (
 board: Board,
 shape: Shape,
 row: number,
 col: number
) => {
 const next = board.map((line) => [...line]);
 const origin = getPlacementOrigin(shape, row, col);
 shape.cells.forEach(([dr, dc]) => {
   next[origin.row + dr][origin.col + dc] = shape.color;
 });

 const fullRows = next
   .map((line, index) => (line.every(Boolean) ? index : -1))
   .filter((index) => index >= 0);
 const fullCols = Array.from({ length: SIZE }, (_, colIndex) =>
   next.every((line) => Boolean(line[colIndex])) ? colIndex : -1
 ).filter((index) => index >= 0);

 fullRows.forEach((rowIndex) => {
   for (let colIndex = 0; colIndex < SIZE; colIndex += 1) next[rowIndex][colIndex] = null;
 });
 fullCols.forEach((colIndex) => {
   for (let rowIndex = 0; rowIndex < SIZE; rowIndex += 1) next[rowIndex][colIndex] = null;
 });

 return {
   board: next,
   lines: fullRows.length + fullCols.length,
   points: shape.cells.length + (fullRows.length + fullCols.length) * 12,
 };
};

const chooseComputerPlacement = (board: Board, shapes: Shape[]) => {
 const choices: Array<{
   shape: Shape;
   row: number;
   col: number;
   result: ReturnType<typeof placeAndClear>;
   value: number;
 }> = [];

 shapes.forEach((shape) => {
   for (let row = 0; row < SIZE; row += 1) {
     for (let col = 0; col < SIZE; col += 1) {
       if (!canPlace(board, shape, row, col)) continue;
       const result = placeAndClear(board, shape, row, col);
       const emptyCells = result.board.flat().filter((cell) => cell === null).length;
       const centerDistance = Math.abs(row - 3.5) + Math.abs(col - 3.5);
       const comboBonus = result.lines > 1 ? result.lines * 8 : 0;
       choices.push({
         shape,
         row,
         col,
         result,
         value: result.points + comboBonus + result.lines * 40 + emptyCells * 0.35 - centerDistance * 0.2 + Math.random(),
       });
     }
   }
 });

 choices.sort((first, second) => second.value - first.value);
 return choices[0] ?? null;
};

function ComputerBoard({ board }: { board: Board }) {
 return (
   <div className="grid aspect-square grid-cols-8 gap-[2px] rounded-xl border-2 border-fuchsia-300/35 bg-slate-950/75 p-1.5 shadow-lg">
     {board.flat().map((cell, index) => (
       <span
         key={index}
         className={`rounded-[3px] transition-all duration-200 ${cell ? "animate-[botBlockPop_220ms_ease-out] shadow-[inset_0_1px_2px_rgba(255,255,255,0.35)]" : "bg-slate-800"}`}
         style={{ backgroundColor: cell ?? undefined }}
       />
     ))}
   </div>
 );
}

function MiniShape({ shape, selected }: { shape: Shape; selected: boolean }) {
 const rows = Math.max(...shape.cells.map(([row]) => row)) + 1;
 const cols = Math.max(...shape.cells.map(([, col]) => col)) + 1;
 return (
   <div
     className={`grid gap-1 rounded-xl p-2 transition ${selected ? "bg-white/25 ring-2 ring-white scale-105" : "bg-black/15"}`}
     style={{ gridTemplateColumns: `repeat(${cols}, 14px)`, gridTemplateRows: `repeat(${rows}, 14px)` }}
   >
     {Array.from({ length: rows * cols }, (_, index) => {
       const row = Math.floor(index / cols);
       const col = index % cols;
       const filled = shape.cells.some(([r, c]) => r === row && c === col);
       return (
         <span
           key={index}
           className="rounded-[4px]"
           style={{ background: filled ? shape.color : "transparent" }}
         />
       );
     })}
   </div>
 );
}

export default function BlockPuzzleBattle({ onClose }: BlockPuzzleBattleProps) {
 const [mode, setMode] = useState<Mode>("menu");
 const [board, setBoard] = useState<Board>(() => emptyBoard());
 const [tray, setTray] = useState<Shape[]>(() => makeTray());
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [score, setScore] = useState(0);
 const [opponentScore, setOpponentScore] = useState(0);
 const [opponentBoard, setOpponentBoard] = useState<Board>(() => emptyBoard());
 const [opponentTray, setOpponentTray] = useState<Shape[]>(() => makeTray());
 const [opponentStatus, setOpponentStatus] = useState("Computer is ready.");
 const [timeLeft, setTimeLeft] = useState(BATTLE_SECONDS);
 const [status, setStatus] = useState("Choose a block, then tap the board.");
 const [gameOver, setGameOver] = useState(false);
 const [showHowToPlay, setShowHowToPlay] = useState(false);

 const selected = useMemo(
   () => tray.find((shape) => shape.id === selectedId) ?? null,
   [selectedId, tray]
 );

 const reset = useCallback((nextMode: Exclude<Mode, "menu">) => {
   setMode(nextMode);
   setBoard(emptyBoard());
   setTray(makeTray());
   setSelectedId(null);
   setScore(0);
   setOpponentScore(0);
   setOpponentBoard(emptyBoard());
   setOpponentTray(makeTray());
   setOpponentStatus("Computer is ready.");
   setTimeLeft(BATTLE_SECONDS);
   setGameOver(false);
   setStatus(nextMode === "bot" ? "Battle started! Build combos to win." : "Choose a block, then tap the board.");
 }, []);

 useEffect(() => {
   if (mode !== "bot" || gameOver || showHowToPlay) return;
   const timer = window.setInterval(() => {
     setTimeLeft((current) => {
       if (current <= 1) {
         setGameOver(true);
         return 0;
       }
       return current - 1;
     });
   }, 1000);
   return () => window.clearInterval(timer);
 }, [gameOver, mode, showHowToPlay]);

 useEffect(() => {
   if (mode !== "bot" || gameOver || showHowToPlay) return;

   const opponent = window.setTimeout(() => {
     const choice = chooseComputerPlacement(opponentBoard, opponentTray);
     if (!choice) {
       setOpponentStatus("Computer has no valid move.");
       return;
     }

     const remaining = opponentTray.filter((shape) => shape.id !== choice.shape.id);
     const nextTray = remaining.length === 0 ? makeTray() : remaining;
     const comboBonus = choice.result.lines > 1 ? choice.result.lines * 8 : 0;
     const gained = choice.result.points + comboBonus;

     setOpponentBoard(choice.result.board);
     setOpponentTray(nextTray);
     setOpponentScore((current) => current + gained);
     setOpponentStatus(
       choice.result.lines > 0
         ? `Computer cleared ${choice.result.lines} line${choice.result.lines > 1 ? "s" : ""}!`
         : `Computer placed a ${choice.shape.cells.length}-block shape.`
     );
   }, 900);

   return () => window.clearTimeout(opponent);
 }, [gameOver, mode, opponentBoard, opponentTray, showHowToPlay]);

 const handleCell = (row: number, col: number) => {
   if (!selected || gameOver) {
     if (!selected) setStatus("Select one of the three blocks first.");
     return;
   }
   if (!canPlace(board, selected, row, col)) {
     setStatus("That block does not fit there.");
     return;
   }

   const result = placeAndClear(board, selected, row, col);
   const remaining = tray.filter((shape) => shape.id !== selected.id);
   const nextTray = remaining.length === 0 ? makeTray() : remaining;
   const comboBonus = result.lines > 1 ? result.lines * 8 : 0;
   const gained = result.points + comboBonus;

   setBoard(result.board);
   setTray(nextTray);
   setSelectedId(null);
   setScore((current) => current + gained);
   setStatus(
     result.lines > 0
       ? `${result.lines} line${result.lines > 1 ? "s" : ""} cleared! +${gained}`
       : `Block placed. +${gained}`
   );

   if (!hasAnyMove(result.board, nextTray)) {
     setGameOver(true);
     setStatus("No more moves.");
   }
 };

 const handleBack = () => {
   if (onClose) {
     onClose();
     return;
   }

   setMode("menu");
 };

 const howToPlayModal = showHowToPlay ? (
   <div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-md">
     <div
       role="dialog"
       aria-modal="true"
       aria-labelledby="block-puzzle-how-to-play-title"
       className="max-h-[92%] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border-2 border-[#ccff00]/70 bg-gradient-to-b from-slate-900 to-[#0d1527] p-6 text-white shadow-[0_24px_70px_rgba(0,0,0,0.75)]"
     >
       <div className="mb-5 flex items-start justify-between gap-4">
         <div className="flex items-center gap-3">
           <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] bg-[#ccff00]/10 text-2xl font-black text-[#ccff00] shadow-[0_0_18px_rgba(204,255,0,0.22)]">
             ?
           </div>
           <div>
             <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">
               Block Battle
             </p>
             <h2
               id="block-puzzle-how-to-play-title"
               className="text-2xl font-black text-white"
             >
               How to Play
             </h2>
           </div>
         </div>

         <button
           type="button"
           onClick={() => setShowHowToPlay(false)}
           aria-label="Close how to play"
           className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-black text-slate-200 transition-colors hover:bg-slate-700"
         >
           ×
         </button>
       </div>

       <div className="space-y-3">
         {[
           ["🧩", "Choose a block", "Select one of the 3 shapes in your tray, then tap the board where you want its center placed."],
           ["✅", "Find a valid space", "Every square in the shape must fit inside the 8×8 board and cannot overlap an occupied square."],
           ["✨", "Clear complete lines", "Fill an entire row or column to clear it. A move can clear several lines at once."],
           ["⭐", "Build your score", "Placed squares earn points. Cleared lines and multi-line combos award large bonuses."],
           ["🔄", "Use all 3 shapes", "Each selected shape is used once. After all 3 are placed, a new tray appears."],
           ["⚔️", "Watch the live battle", "Battle lasts 90 seconds. The computer uses its own visible board and tray, makes legal placements, clears real lines, and earns real points."],
         ].map(([icon, title, description], index) => (
           <div
             key={title}
             className="flex gap-3 rounded-2xl border border-slate-700/80 bg-slate-800/65 p-3"
           >
             <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950/70 text-lg">
               {icon}
             </div>
             <div>
               <p className="text-sm font-black text-amber-300">
                 {index + 1}. {title}
               </p>
               <p className="mt-0.5 text-xs leading-5 text-slate-300">
                 {description}
               </p>
             </div>
           </div>
         ))}
       </div>

       <button
         type="button"
         onClick={() => setShowHowToPlay(false)}
         className="mt-5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition-all active:scale-[0.98]"
       >
         Got It — Let&apos;s Play
       </button>
     </div>
   </div>
 ) : null;

 if (mode === "menu") {
   return (
     <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-violet-950 via-indigo-950 to-slate-950 p-6 text-white">
       <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
         <button
           type="button"
           onClick={handleBack}
           aria-label="Back to Arcade Hub"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition-colors hover:text-amber-300"
         >
           <svg
             aria-hidden="true"
             viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             strokeWidth="2.2"
             strokeLinecap="round"
             strokeLinejoin="round"
             className="h-4 w-4"
           >
             <path d="M19 12H5" />
             <path d="m12 19-7-7 7-7" />
           </svg>
         </button>

         <button
           type="button"
           onClick={() => setShowHowToPlay(true)}
           aria-label="How to play Block Puzzle Battle"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_14px_rgba(204,255,0,0.16)] transition-colors hover:bg-[#ccff00]/20"
         >
           <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none">
             ?
           </span>
         </button>
       </div>

       <div className="mb-5 text-6xl">▦</div>
       <h1 className="text-center text-3xl font-black">Block Puzzle Battle</h1>
       <p className="mt-2 max-w-xs text-center text-sm text-indigo-200">Fill rows and columns, build combos, and beat the clock.</p>
       <div className="mt-8 grid w-full max-w-sm gap-3">
         <button onClick={() => reset("solo")} className="rounded-2xl bg-cyan-400 py-4 font-black text-slate-950 shadow-lg active:scale-95">Solo High Score</button>
         <button onClick={() => reset("bot")} className="rounded-2xl bg-fuchsia-500 py-4 font-black shadow-lg active:scale-95">Battle Computer</button>
       </div>

       {howToPlayModal}
     </div>
   );
 }

 const resultText = mode === "bot" && gameOver
   ? score > opponentScore ? "You win!" : score === opponentScore ? "Draw!" : "Opponent wins"
   : gameOver ? "Game over" : status;

 return (
   <div
     className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-gradient-to-b from-violet-700 via-indigo-800 to-slate-950 p-3 text-white select-none touch-none"
     style={{
       paddingBottom:
         "calc(env(safe-area-inset-bottom) + 160px)",
     }}
   >
     <header className="mx-auto grid w-full max-w-md shrink-0 grid-cols-[1fr_auto_1fr] items-center">
       <div className="flex justify-start">
         <button
           type="button"
           onClick={handleBack}
           aria-label="Back to Arcade Hub"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition-colors hover:text-amber-300"
         >
           <svg
             aria-hidden="true"
             viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             strokeWidth="2.2"
             strokeLinecap="round"
             strokeLinejoin="round"
             className="h-4 w-4"
           >
             <path d="M19 12H5" />
             <path d="m12 19-7-7 7-7" />
           </svg>
         </button>
       </div>

       <div className="text-center">
         <h1 className="text-lg font-black">BLOCK BATTLE</h1>
         {mode === "bot" && <p className="text-xs font-black text-amber-300">{timeLeft}s</p>}
       </div>

       <div className="flex items-center justify-end gap-2">
         <button onClick={() => reset(mode)} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950">New</button>

         <button
           type="button"
           onClick={() => setShowHowToPlay(true)}
           aria-label="How to play Block Puzzle Battle"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_14px_rgba(204,255,0,0.16)] transition-colors hover:bg-[#ccff00]/20"
         >
           <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none">
             ?
           </span>
         </button>
       </div>
     </header>

     {mode === "bot" ? (
       <section className="mx-auto mt-2 grid h-[152px] w-full max-w-md shrink-0 grid-cols-[1fr_104px] items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 p-2.5 shadow-xl">
         <div className="flex h-full min-w-0 flex-col justify-center overflow-hidden">
           <div className="grid grid-cols-2 gap-2 text-center">
             <div className="rounded-xl bg-cyan-400/12 p-2"><span className="block text-[9px] font-black uppercase text-cyan-200">You</span><strong className="text-2xl">{score}</strong></div>
             <div className="rounded-xl bg-fuchsia-400/12 p-2"><span className="block text-[9px] font-black uppercase text-fuchsia-200">Computer</span><strong className="text-2xl">{opponentScore}</strong></div>
           </div>
           <p className="mt-1.5 flex h-8 items-center justify-center overflow-hidden px-1 text-center text-[10px] font-bold leading-4 text-fuchsia-100/80">{opponentStatus}</p>
           <div className="mt-0.5 flex h-11 shrink-0 items-center justify-center gap-0 overflow-visible">
             {opponentTray.map((shape) => (
               <div key={shape.id} className="-mx-2 flex h-11 w-14 shrink-0 scale-[0.56] items-center justify-center">
                 <MiniShape shape={shape} selected={false} />
               </div>
             ))}
           </div>
         </div>
         <div>
           <p className="mb-1 text-center text-[8px] font-black uppercase tracking-wider text-fuchsia-200">Live board</p>
           <ComputerBoard board={opponentBoard} />
         </div>
       </section>
     ) : (
       <div className="mx-auto mt-2 grid w-full max-w-md shrink-0 grid-cols-2 gap-2 text-center">
         <div className="rounded-2xl bg-white/12 p-2"><span className="block text-[9px] font-black uppercase text-cyan-200">You</span><strong className="text-2xl">{score}</strong></div>
         <div className="rounded-2xl bg-white/12 p-2"><span className="block text-[9px] font-black uppercase text-fuchsia-200">Best run</span><strong className="text-2xl">{score}</strong></div>
       </div>
     )}

     <main className="flex min-h-0 flex-1 items-center justify-center py-2">
       <div
         className="grid aspect-square shrink-0 grid-cols-8 gap-1 rounded-[26px] border-4 border-white/20 bg-slate-950/45 p-2 shadow-2xl"
         style={{
           width: "min(86vw, 36dvh, 350px)",
         }}
       >
         {board.map((line, row) =>
           line.map((cell, col) => {
             return (
               <button
                 key={`${row}-${col}`}
                 onClick={() => handleCell(row, col)}
                 className={`aspect-square rounded-[7px] border border-white/10 transition active:scale-90 ${cell ? "shadow-[inset_0_2px_3px_rgba(255,255,255,0.35)]" : "bg-slate-900/75"}`}
                 style={{ backgroundColor: cell ?? undefined }}
                 aria-label={`Row ${row + 1}, column ${col + 1}`}
               />
             );
           })
         )}
       </div>
     </main>

     <section className="relative z-20 mx-auto w-full max-w-md shrink-0 rounded-3xl bg-white/10 p-2.5 backdrop-blur">
       <p className="mb-1 text-center text-xs font-bold text-indigo-100">{resultText}</p>
       <div className="flex min-h-[68px] items-center justify-around gap-2">
         {tray.map((shape) => (
           <button key={shape.id} disabled={gameOver} onClick={() => setSelectedId(shape.id)} className="flex min-h-[62px] min-w-[76px] items-center justify-center rounded-2xl active:scale-95 disabled:opacity-40">
             <MiniShape shape={shape} selected={shape.id === selectedId} />
           </button>
         ))}
       </div>
       {gameOver && <button onClick={() => reset(mode)} className="mt-3 w-full rounded-2xl bg-amber-400 py-3 font-black text-slate-950">Play Again</button>}
     </section>

     {howToPlayModal}

     <style jsx global>{`
       @keyframes botBlockPop {
         0% { transform: scale(0.55); opacity: 0.3; }
         70% { transform: scale(1.12); opacity: 1; }
         100% { transform: scale(1); opacity: 1; }
       }
     `}</style>
   </div>
 );
}

