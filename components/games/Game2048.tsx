"use client";




import { tr } from "../../lib/i18n";
import { LocalizedText } from "../../lib/i18n";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface Game2048BattleProps {
 onClose?: () => void;
}

type Direction = "up" | "down" | "left" | "right";
type Board = number[][];
type Winner = "you" | "computer" | "draw" | null;

const SIZE = 4;
const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const emptyBoard = (): Board =>
 Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

const boardsEqual = (first: Board, second: Board) =>
 first.every((row, rowIndex) =>
   row.every((value, columnIndex) => value === second[rowIndex][columnIndex])
 );

const addRandomTile = (board: Board): Board => {
 const next = cloneBoard(board);
 const empty: Array<[number, number]> = [];

 next.forEach((row, rowIndex) =>
   row.forEach((value, columnIndex) => {
     if (value === 0) empty.push([rowIndex, columnIndex]);
   })
 );

 if (empty.length === 0) return next;
 const [row, column] = empty[Math.floor(Math.random() * empty.length)];
 next[row][column] = Math.random() < 0.9 ? 2 : 4;
 return next;
};

const createBoard = () => addRandomTile(addRandomTile(emptyBoard()));

const collapseLine = (line: number[]) => {
 const values = line.filter(Boolean);
 const result: number[] = [];
 let gained = 0;

 for (let index = 0; index < values.length; index += 1) {
   if (values[index] === values[index + 1]) {
     const merged = values[index] * 2;
     result.push(merged);
     gained += merged;
     index += 1;
   } else {
     result.push(values[index]);
   }
 }

 while (result.length < SIZE) result.push(0);
 return { line: result, gained };
};

const moveBoard = (board: Board, direction: Direction) => {
 const next = emptyBoard();
 let gained = 0;

 for (let index = 0; index < SIZE; index += 1) {
   const line = direction === "left" || direction === "right"
     ? [...board[index]]
     : board.map((row) => row[index]);

   if (direction === "right" || direction === "down") line.reverse();
   const collapsed = collapseLine(line);
   gained += collapsed.gained;
   if (direction === "right" || direction === "down") collapsed.line.reverse();

   collapsed.line.forEach((value, lineIndex) => {
     if (direction === "left" || direction === "right") next[index][lineIndex] = value;
     else next[lineIndex][index] = value;
   });
 }

 return { board: next, gained, changed: !boardsEqual(board, next) };
};

const validMoves = (board: Board) =>
 DIRECTIONS.filter((direction) => moveBoard(board, direction).changed);

const highestTile = (board: Board) => Math.max(...board.flat());

const chooseComputerMove = (board: Board): Direction | null => {
 const choices = validMoves(board).map((direction) => {
   const result = moveBoard(board, direction);
   const empty = result.board.flat().filter((value) => value === 0).length;
   const max = highestTile(result.board);
   const cornerBonus = [result.board[0][0], result.board[0][3], result.board[3][0], result.board[3][3]].includes(max) ? max * 3 : 0;
   const smoothness = result.board.reduce((total, row) =>
     total + row.reduce((rowTotal, value, index) => rowTotal + (index < 3 && value === row[index + 1] ? value : 0), 0), 0);
   return { direction, score: empty * 150 + result.gained * 8 + cornerBonus + smoothness + Math.random() * 15 };
 });

 choices.sort((first, second) => second.score - first.score);
 return choices[0]?.direction ?? null;
};

const TILE_STYLES: Record<number, string> = {
 0: "bg-slate-950/45 text-transparent",
 2: "bg-cyan-100 text-slate-900",
 4: "bg-cyan-300 text-slate-950",
 8: "bg-emerald-400 text-slate-950",
 16: "bg-lime-400 text-slate-950",
 32: "bg-amber-300 text-slate-950",
 64: "bg-orange-500 text-white",
 128: "bg-rose-500 text-white",
 256: "bg-fuchsia-500 text-white",
 512: "bg-violet-500 text-white",
 1024: "bg-indigo-500 text-white",
 2048: "bg-[#ccff00] text-slate-950 shadow-[0_0_18px_rgba(204,255,0,0.8)]",
};

function Grid({ board, compact = false }: { board: Board; compact?: boolean }) {
 return (
   <div className={`grid grid-cols-4 ${compact ? "gap-1 rounded-xl p-1.5" : "gap-2 rounded-[1.75rem] p-3"} border border-white/15 bg-slate-800/90 shadow-xl`}>
     {board.flat().map((value, index) => (
       <div
         key={`${index}-${value}`}
         className={`flex aspect-square items-center justify-center rounded-xl font-black transition-all duration-150 ${TILE_STYLES[value] ?? "bg-gradient-to-br from-amber-300 to-rose-500 text-slate-950"} ${compact ? "text-[10px]" : value >= 1024 ? "text-xl" : value >= 128 ? "text-2xl" : "text-3xl"} ${value ? "animate-[tilePop_160ms_ease-out] shadow-md" : ""}`}
       >
         {value || ""}
       </div>
     ))}
   </div>
 );
}

export default function Game2048Battle({ onClose }: Game2048BattleProps) {
 const [yourBoard, setYourBoard] = useState<Board>(() => createBoard());
 const [computerBoard, setComputerBoard] = useState<Board>(() => createBoard());
 const [yourScore, setYourScore] = useState(0);
 const [computerScore, setComputerScore] = useState(0);
 const [winner, setWinner] = useState<Winner>(null);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState("Swipe the board to make your move.");
 const [showRules, setShowRules] = useState(false);
 const touchStart = useRef<{ x: number; y: number } | null>(null);
 const computerTimer = useRef<number | null>(null);

 const reset = useCallback(() => {
   if (computerTimer.current !== null) {
     window.clearTimeout(computerTimer.current);
     computerTimer.current = null;
   }
   setYourBoard(createBoard());
   setComputerBoard(createBoard());
   setYourScore(0);
   setComputerScore(0);
   setWinner(null);
   setBusy(false);
   setMessage("Swipe the board to make your move.");
 }, []);

 useEffect(() => () => {
   if (computerTimer.current !== null) window.clearTimeout(computerTimer.current);
 }, []);

 const finishByScore = useCallback((nextYourScore: number, nextComputerScore: number, nextYourBoard: Board, nextComputerBoard: Board) => {
   const yourPower = nextYourScore + highestTile(nextYourBoard) * 10;
   const computerPower = nextComputerScore + highestTile(nextComputerBoard) * 10;
   const result: Winner = yourPower === computerPower ? "draw" : yourPower > computerPower ? "you" : "computer";
   setWinner(result);
   setMessage(result === "draw" ? "The battle ends in a draw!" : result === "you" ? "You win the battle!" : "Computer wins the battle.");
 }, []);

 const makeMove = useCallback((direction: Direction) => {
   if (busy || winner) return;

   const yourMove = moveBoard(yourBoard, direction);
   if (!yourMove.changed) {
     setMessage("That direction cannot move any tile.");
     return;
   }

   const nextYourBoard = addRandomTile(yourMove.board);
   const nextYourScore = yourScore + yourMove.gained;
   setYourBoard(nextYourBoard);
   setYourScore(nextYourScore);
   setBusy(true);

   if (highestTile(nextYourBoard) >= 2048) {
     setWinner("you");
     setMessage("You reached 2048 first!");
     setBusy(false);
     return;
   }

   setMessage("Computer is choosing a move…");
   computerTimer.current = window.setTimeout(() => {
     computerTimer.current = null;
     const computerDirection = chooseComputerMove(computerBoard);
     if (!computerDirection) {
       finishByScore(nextYourScore, computerScore, nextYourBoard, computerBoard);
       setBusy(false);
       return;
     }

     const computerMove = moveBoard(computerBoard, computerDirection);
     const nextComputerBoard = addRandomTile(computerMove.board);
     const nextComputerScore = computerScore + computerMove.gained;
     setComputerBoard(nextComputerBoard);
     setComputerScore(nextComputerScore);

     if (highestTile(nextComputerBoard) >= 2048) {
       setWinner("computer");
       setMessage("Computer reached 2048 first.");
     } else if (validMoves(nextYourBoard).length === 0) {
       finishByScore(nextYourScore, nextComputerScore, nextYourBoard, nextComputerBoard);
     } else {
       setMessage(`Computer moved ${computerDirection}. Your turn!`);
     }
     setBusy(false);
   }, 420);
 }, [busy, computerBoard, computerScore, finishByScore, winner, yourBoard, yourScore]);

 useEffect(() => {
   const handleKey = (event: KeyboardEvent) => {
     const direction: Record<string, Direction | undefined> = {
       ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
     };
     const move = direction[event.key];
     if (move) {
       event.preventDefault();
       makeMove(move);
     }
   };
   window.addEventListener("keydown", handleKey);
   return () => window.removeEventListener("keydown", handleKey);
 }, [makeMove]);

 const handleTouchEnd = (event: React.TouchEvent) => {
   if (!touchStart.current) return;
   const touch = event.changedTouches[0];
   const deltaX = touch.clientX - touchStart.current.x;
   const deltaY = touch.clientY - touchStart.current.y;
   touchStart.current = null;
   if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) return;
   makeMove(Math.abs(deltaX) > Math.abs(deltaY) ? (deltaX > 0 ? "right" : "left") : (deltaY > 0 ? "down" : "up"));
 };

 return (
   <div className="fixed inset-x-0 bottom-0 top-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-[radial-gradient(circle_at_top,#4c1d95_0%,#1e1b4b_48%,#020617_100%)] text-white select-none touch-none">
     <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-slate-950/55 px-3 pb-2 pt-[var(--app-safe-top)] backdrop-blur">
       <div className="justify-self-start">
         {onClose && <button type="button" onClick={onClose} aria-label={tr("UI_0373", "Back to Arcade Hub")} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-400/30 bg-slate-900/85 active:scale-95"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg></button>}
       </div>
       <div className="text-center"><h1 className="text-lg font-black text-amber-300"><LocalizedText id="UI_0790" fallback="2048 BATTLE" /></h1><p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-200/70"><LocalizedText id="UI_0791" fallback="You vs Computer" /></p></div>
       <div className="flex items-center justify-self-end gap-2">
         <button type="button" onClick={reset} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 active:scale-95"><LocalizedText id="UI_1468" fallback="New" /></button>
         <button type="button" onClick={() => setShowRules(true)} aria-label={tr("UI_0792", "How to play 2048 Battle")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00] bg-slate-900 text-[#ccff00] shadow-[0_0_12px_rgba(204,255,0,0.25)] active:scale-95"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black">?</span></button>
       </div>
     </header>

     <main className="min-h-0 flex-1 overflow-hidden px-3 py-3">
       <div className="mx-auto flex w-full max-w-md flex-col gap-3">
         <section className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3 shadow-xl">
           <div className="grid h-full min-h-24 grid-cols-2 gap-2">
             <div className="flex flex-col items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-2 py-3 text-center shadow-inner">
               <span className="text-[9px] font-black uppercase tracking-wider text-cyan-300"><LocalizedText id="UI_0793" fallback="Your score" /></span>
               <strong className="mt-1 text-3xl leading-none text-white">{yourScore}</strong>
             </div>
             <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-300/15 bg-rose-400/10 px-2 py-3 text-center shadow-inner">
               <span className="text-[9px] font-black uppercase tracking-wider text-rose-300"><LocalizedText id="UI_0495" fallback="Computer" /></span>
               <strong className="mt-1 text-3xl leading-none text-white">{computerScore}</strong>
             </div>
           </div>
           <div className="w-24"><p className="mb-1 text-center text-[8px] font-black uppercase text-rose-300"><LocalizedText id="UI_0794" fallback="Live AI board" /></p><Grid board={computerBoard} compact /></div>
         </section>

         <section>
           <div className="mb-2 flex items-center justify-between"><span className="text-xs font-black uppercase tracking-widest text-cyan-300"><LocalizedText id="UI_0796" fallback="Your board" /></span><span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold"><LocalizedText id="UI_0795" fallback="Best" />{highestTile(yourBoard)}</span></div>
           <div
             className={`touch-none ${busy ? "pointer-events-none opacity-80" : ""}`}
             onTouchStart={(event) => { const touch = event.touches[0]; touchStart.current = { x: touch.clientX, y: touch.clientY }; }}
             onTouchEnd={handleTouchEnd}
           >
             <Grid board={yourBoard} />
           </div>
         </section>

       </div>
     </main>

     <footer className="mx-auto w-full max-w-md shrink-0 px-3 pb-2">
       <div className="flex h-12 w-full items-center justify-center rounded-2xl border border-violet-300/25 bg-gradient-to-r from-violet-950/90 via-purple-900/90 to-violet-950/90 px-4 text-center text-xs font-black leading-4 text-violet-100 shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
         <span className="block w-full text-center">{message}</span>
       </div>
     </footer>

     {showRules && (
       <div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
         <div role="dialog" aria-modal="true" aria-labelledby="battle-2048-rules" className="max-h-[92%] w-full max-w-md overflow-y-auto rounded-[2rem] border-2 border-[#ccff00] bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-[0_0_35px_rgba(204,255,0,0.18)]">
           <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ccff00]"><LocalizedText id="UI_0797" fallback={tr("UI_0797", "2048 Battle")} /></p><h2 id="battle-2048-rules" className="text-2xl font-black"><LocalizedText id="UI_0394" fallback={tr("UI_0394", "How to Play")} /></h2></div><button type="button" onClick={() => setShowRules(false)} aria-label={tr("UI_0446", "Close how to play")} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-500 bg-slate-800 text-2xl font-black">×</button></div>
           <div className="mt-5 space-y-3">
             {[["👆",tr("UI_0805", "Swipe to move"),tr("UI_0806", "Swipe your board up, down, left, or right. All tiles move together.")],["➕",tr("UI_0801", "Merge matching tiles"),tr("UI_0808", "Two equal tiles combine into one larger tile and add to your score.")],["🤖",tr("UI_0804", "Real computer board"),tr("UI_0798", "After every valid move, the computer evaluates and moves its own visible board.")],["⚖️",tr("UI_0802", "One move each"),tr("UI_0809", "You and the computer receive one move per turn. Invalid swipes do not cost a turn.")],["🏆",tr("UI_0803", "Reach 2048 first"),tr("UI_0807", "The first side to create a 2048 tile wins the battle.")],["🔒",tr("UI_0800", "Locked board"),tr("UI_0799", "If a board has no moves, scores and highest tiles decide the winner.")]].map(([icon,title,text]) => <div key={title} className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-3.5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xl">{icon}</span><div><h3 className="font-black text-amber-300">{title}</h3><p className="mt-1 text-sm leading-5 text-slate-300">{text}</p></div></div>)}
           </div>
           <button type="button" onClick={() => setShowRules(false)} className="mt-5 w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 py-3.5 font-black uppercase text-slate-950 shadow-[0_5px_0_#c56b00] active:translate-y-1 active:shadow-none"><LocalizedText id="UI_0393" fallback={tr("UI_0393", "Got It — Let&apos;s Play")} /></button>
         </div>
       </div>
     )}

     {winner && (
       <div className="absolute inset-0 z-[260] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-md"><div className="w-full max-w-sm rounded-[2rem] border-2 border-amber-300 bg-slate-900 p-7 text-center shadow-2xl"><div className="text-6xl">{winner === "you" ? "🏆" : winner === "draw" ? "🤝" : "🤖"}</div><h2 className="mt-3 text-3xl font-black">{winner === "you" ? tr("UI_0409", "You Win!") : winner === "draw" ? tr("UI_0811", "Draw Battle") : tr("UI_0810", "Computer Wins")}</h2><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-cyan-500/15 p-3"><span className="block text-[9px] uppercase text-cyan-300"><LocalizedText id="UI_0084" fallback={tr("UI_0084", "You")} /></span><strong className="text-xl">{yourScore}</strong></div><div className="rounded-xl bg-rose-500/15 p-3"><span className="block text-[9px] uppercase text-rose-300"><LocalizedText id="UI_0495" fallback={tr("UI_0495", "Computer")} /></span><strong className="text-xl">{computerScore}</strong></div></div><button type="button" onClick={reset} className="mt-6 w-full rounded-2xl bg-amber-400 py-3 font-black text-slate-950"><LocalizedText id="UI_0407" fallback={tr("UI_0407", "Play Again")} /></button></div></div>
     )}

     <style jsx global>{`@keyframes tilePop { 0% { transform: scale(.72); opacity: .35; } 75% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }`}</style>
   </div>
 );
}
