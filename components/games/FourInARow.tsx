"use client";

import React, { useState, useEffect, useRef } from "react";

interface FourInARowProps {
 onClose?: () => void;
 onResult?: (result: "Win" | "Loss" | "Draw") => void;
}

type Player = 1 | 2; // 1 = You (Red), 2 = Opponent (Yellow)
type Board = (Player | null)[][];

const ROWS = 6;
const COLS = 7;
const PLAYER: Player = 1;
const COMPUTER: Player = 2;
const SEARCH_DEPTH = 6;
const CENTER_FIRST_COLUMNS = [3, 2, 4, 1, 5, 0, 6];

const getOpenRow = (board: Board, column: number) => {
 for (let row = ROWS - 1; row >= 0; row -= 1) {
   if (board[row][column] === null) return row;
 }

 return -1;
};

const getValidColumns = (board: Board) =>
 CENTER_FIRST_COLUMNS.filter((column) => board[0][column] === null);

const simulateMove = (board: Board, column: number, player: Player) => {
 const row = getOpenRow(board, column);
 if (row < 0) return null;

 const nextBoard = board.map((boardRow) => [...boardRow]);
 nextBoard[row][column] = player;
 return nextBoard;
};

const hasFour = (board: Board, player: Player) => {
 for (let row = 0; row < ROWS; row += 1) {
   for (let column = 0; column < COLS; column += 1) {
     if (board[row][column] !== player) continue;

     const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
     for (const [rowStep, columnStep] of directions) {
       let matches = 1;
       for (let offset = 1; offset < 4; offset += 1) {
         const nextRow = row + rowStep * offset;
         const nextColumn = column + columnStep * offset;
         if (
           nextRow < 0 ||
           nextRow >= ROWS ||
           nextColumn < 0 ||
           nextColumn >= COLS ||
           board[nextRow][nextColumn] !== player
         ) break;
         matches += 1;
       }
       if (matches === 4) return true;
     }
   }
 }

 return false;
};

const scoreWindow = (window: (Player | null)[]) => {
 const computerCount = window.filter((cell) => cell === COMPUTER).length;
 const playerCount = window.filter((cell) => cell === PLAYER).length;
 const emptyCount = window.filter((cell) => cell === null).length;
 let score = 0;

 if (computerCount === 4) score += 100000;
 else if (computerCount === 3 && emptyCount === 1) score += 130;
 else if (computerCount === 2 && emptyCount === 2) score += 18;

 if (playerCount === 4) score -= 120000;
 else if (playerCount === 3 && emptyCount === 1) score -= 160;
 else if (playerCount === 2 && emptyCount === 2) score -= 20;

 return score;
};

const evaluateBoard = (board: Board) => {
 let score = 0;

 for (let row = 0; row < ROWS; row += 1) {
   if (board[row][3] === COMPUTER) score += 8;
   if (board[row][3] === PLAYER) score -= 8;
 }

 for (let row = 0; row < ROWS; row += 1) {
   for (let column = 0; column <= COLS - 4; column += 1) {
     score += scoreWindow(board[row].slice(column, column + 4));
   }
 }

 for (let column = 0; column < COLS; column += 1) {
   for (let row = 0; row <= ROWS - 4; row += 1) {
     score += scoreWindow(Array.from({ length: 4 }, (_, index) => board[row + index][column]));
   }
 }

 for (let row = 0; row <= ROWS - 4; row += 1) {
   for (let column = 0; column <= COLS - 4; column += 1) {
     score += scoreWindow(Array.from({ length: 4 }, (_, index) => board[row + index][column + index]));
   }
 }

 for (let row = 0; row <= ROWS - 4; row += 1) {
   for (let column = 3; column < COLS; column += 1) {
     score += scoreWindow(Array.from({ length: 4 }, (_, index) => board[row + index][column - index]));
   }
 }

 return score;
};

const minimax = (
 board: Board,
 depth: number,
 alphaValue: number,
 betaValue: number,
 maximizing: boolean
): number => {
 const validColumns = getValidColumns(board);

 if (hasFour(board, COMPUTER)) return 1000000 + depth;
 if (hasFour(board, PLAYER)) return -1000000 - depth;
 if (validColumns.length === 0) return 0;
 if (depth === 0) return evaluateBoard(board);

 let alpha = alphaValue;
 let beta = betaValue;

 if (maximizing) {
   let bestScore = -Infinity;
   for (const column of validColumns) {
     const child = simulateMove(board, column, COMPUTER);
     if (!child) continue;
     bestScore = Math.max(bestScore, minimax(child, depth - 1, alpha, beta, false));
     alpha = Math.max(alpha, bestScore);
     if (alpha >= beta) break;
   }
   return bestScore;
 }

 let bestScore = Infinity;
 for (const column of validColumns) {
   const child = simulateMove(board, column, PLAYER);
   if (!child) continue;
   bestScore = Math.min(bestScore, minimax(child, depth - 1, alpha, beta, true));
   beta = Math.min(beta, bestScore);
   if (alpha >= beta) break;
 }
 return bestScore;
};

const chooseComputerMove = (board: Board) => {
 const validColumns = getValidColumns(board);

 for (const column of validColumns) {
   const nextBoard = simulateMove(board, column, COMPUTER);
   if (nextBoard && hasFour(nextBoard, COMPUTER)) return column;
 }

 for (const column of validColumns) {
   const nextBoard = simulateMove(board, column, PLAYER);
   if (nextBoard && hasFour(nextBoard, PLAYER)) return column;
 }

 let bestColumn = validColumns[0] ?? 0;
 let bestScore = -Infinity;

 for (const column of validColumns) {
   const nextBoard = simulateMove(board, column, COMPUTER);
   if (!nextBoard) continue;
   const score = minimax(nextBoard, SEARCH_DEPTH - 1, -Infinity, Infinity, false);
   if (score > bestScore) {
     bestScore = score;
     bestColumn = column;
   }
 }

 return bestColumn;
};

export const FourInARow: React.FC<FourInARowProps> = ({ onClose, onResult }) => {
 const [board, setBoard] = useState<Board>(() =>
   Array.from({ length: ROWS }, () => Array(COLS).fill(null))
 );
 const [currentPlayer, setCurrentPlayer] = useState<Player>(1);
 const [hoveredCol, setHoveredCol] = useState<number | null>(null);
 const [winner, setWinner] = useState<Player | "Draw" | null>(null);
 const [winningCells, setWinningCells] = useState<[number, number][]>([]);
 const [showHowToPlay, setShowHowToPlay] = useState(false);
 const resultReportedRef = useRef(false);

 useEffect(() => {
   if (!winner || resultReportedRef.current) return;
   resultReportedRef.current = true;
   onResult?.(winner === "Draw" ? "Draw" : winner === 1 ? "Win" : "Loss");
 }, [onResult, winner]);

 // Reference to board for dynamic pixel calculation across touch & mouse
 const boardRef = useRef<HTMLDivElement>(null);

 const checkWin = (
   currentBoard: Board,
   row: number,
   col: number,
   player: Player
 ): [number, number][] | null => {
   const directions = [
     [[0, 1], [0, -1]],   // Horizontal
     [[1, 0], [-1, 0]],   // Vertical
     [[1, 1], [-1, -1]],  // Diagonal Right-Down / Left-Up
     [[1, -1], [-1, 1]],  // Diagonal Left-Down / Right-Up
   ];

   for (const d of directions) {
     const cells: [number, number][] = [[row, col]];
     for (const [dr, dc] of d) {
       let r = row + dr;
       let c = col + dc;
       while (r >= 0 && r < ROWS && c >= 0 && c < COLS && currentBoard[r][c] === player) {
         cells.push([r, c]);
         r += dr;
         c += dc;
       }
     }
     if (cells.length >= 4) {
       return cells;
     }
   }
   return null;
 };

 const executeMove = (colIndex: number, player: Player) => {
   let rowIndex = -1;
   for (let r = ROWS - 1; r >= 0; r--) {
     if (!board[r][colIndex]) {
       rowIndex = r;
       break;
     }
   }

   if (rowIndex === -1) return false;

   const newBoard = board.map((row) => [...row]);
   newBoard[rowIndex][colIndex] = player;
   setBoard(newBoard);

   const winningLine = checkWin(newBoard, rowIndex, colIndex, player);
   if (winningLine) {
     setWinner(player);
     setWinningCells(winningLine);
     return true;
   }

   if (newBoard.every((row) => row.every((cell) => cell !== null))) {
     setWinner("Draw");
     return true;
   }

   setCurrentPlayer((prev) => (prev === 1 ? 2 : 1));
   return true;
 };

 // Helper to dynamically calculate column index from touch/pointer screen position
 const updateHoverFromPos = (clientX: number) => {
   if (!boardRef.current || winner || currentPlayer !== 1) return;
   const rect = boardRef.current.getBoundingClientRect();
   const relativeX = clientX - rect.left;
   const colWidth = rect.width / COLS;
   const calculatedCol = Math.floor(relativeX / colWidth);
   const clampedCol = Math.min(Math.max(calculatedCol, 0), COLS - 1);
   setHoveredCol(clampedCol);
 };

 const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
   updateHoverFromPos(e.clientX);
 };

 const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
   if (e.touches.length > 0) {
     updateHoverFromPos(e.touches[0].clientX);
   }
 };

 const handleBoardClick = (e: React.MouseEvent<HTMLDivElement>) => {
   if (winner || currentPlayer !== 1 || !boardRef.current) return;
   const rect = boardRef.current.getBoundingClientRect();
   const relativeX = e.clientX - rect.left;
   const colWidth = rect.width / COLS;
   const clickedCol = Math.min(Math.max(Math.floor(relativeX / colWidth), 0), COLS - 1);
   executeMove(clickedCol, 1);
 };

 // Strong computer move: immediate tactics plus depth-six alpha-beta search.
 useEffect(() => {
   if (currentPlayer === 2 && !winner && !showHowToPlay) {
     const timer = setTimeout(() => {
       const validColumns = getValidColumns(board);
       if (validColumns.length > 0) {
         executeMove(chooseComputerMove(board), COMPUTER);
       }
     }, 650);

     return () => clearTimeout(timer);
   }
 }, [currentPlayer, winner, board, showHowToPlay]);

 const resetGame = () => {
   resultReportedRef.current = false;
   setBoard(Array.from({ length: ROWS }, () => Array(COLS).fill(null)));
   setCurrentPlayer(1);
   setWinner(null);
   setWinningCells([]);
   setHoveredCol(null);
 };

 const isWinningCell = (r: number, c: number) =>
   winningCells.some(([winR, winC]) => winR === r && winC === c);

 return (
   <div className="fixed inset-0 flex flex-col items-center justify-start bg-[#258a8a] text-white font-sans p-4 pt-20 overflow-y-auto select-none z-[100] bg-[radial-gradient(#2ea4a4_1px,transparent_1px)] [background-size:16px_16px]">
    
     {/* Top Header Bar */}
     <div className="mb-4 grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center">
       <div className="flex justify-start">
         {onClose && (
           <button
             type="button"
             onClick={onClose}
             aria-label="Back to Arcade Hub"
             className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur-sm transition-colors hover:text-amber-300"
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
         )}
       </div>

       <h1 className="text-xl font-black text-amber-300 tracking-wider uppercase drop-shadow">
         4 IN A ROW
       </h1>

       <div className="flex items-center justify-end gap-2">
         <button
           onClick={resetGame}
           className="text-xs font-black uppercase tracking-wider bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-1.5 rounded-xl border border-amber-200 shadow-sm transition-all active:scale-95"
         >
           RESET
         </button>

         <button
           type="button"
           onClick={() => setShowHowToPlay(true)}
           aria-label="How to play Four in a Row"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_14px_rgba(204,255,0,0.16)] transition-colors hover:bg-[#ccff00]/20"
         >
           <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none">
             ?
           </span>
         </button>
       </div>
     </div>

     {/* Turn Status Card Badge */}
     <div className="flex items-center justify-center gap-3 bg-white border-2 border-blue-400 p-2 px-5 rounded-2xl shadow-lg mb-4">
       <span className="text-xs font-black tracking-wider uppercase text-blue-600">
         {winner
           ? winner === "Draw"
             ? "DRAW GAME!"
             : winner === 1
             ? "YOU WIN!"
             : "OPPONENT WINS!"
           : currentPlayer === 1
           ? "PLAYER TURN"
           : "OPPONENT TURN"}
       </span>

       {/* 3D Disc Box beside turn text */}
       <div className="w-8 h-8 bg-[#1965e0] border-2 border-[#0e4cb8] rounded-xl flex items-center justify-center shadow-inner">
         <div
           className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.7)] transition-all ${
             winner
               ? winner === 1
                 ? "bg-gradient-to-b from-rose-400 via-rose-500 to-rose-700 border-rose-200"
                 : winner === 2
                 ? "bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 border-amber-100"
                 : "bg-slate-400 border-slate-200"
               : currentPlayer === 1
               ? "bg-gradient-to-b from-rose-400 via-rose-500 to-rose-700 border-rose-200"
               : "bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 border-amber-100"
           }`}
         >
           <div className="w-3.5 h-3.5 rounded-full border border-white/40" />
         </div>
       </div>
     </div>

     {/* Main Connect Four Board Container */}
     <div
       onMouseLeave={() => setHoveredCol(null)}
       className="relative bg-[#1965e0] border-4 border-[#0e4cb8] rounded-[2.5rem] p-3 shadow-[0_20px_40px_rgba(0,0,0,0.6)] w-full max-w-[360px] sm:max-w-[400px] touch-none"
     >
       {winner && winner !== "Draw" && (
         <div className="absolute inset-x-5 top-3 z-30 rounded-xl border-2 border-white bg-slate-950/90 px-3 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_0_22px_rgba(255,255,255,0.6)]">
           {winner === PLAYER ? "Winning four — red" : "Winning four — yellow"}
         </div>
       )}
      
       {/* White Arrow Pointer Header */}
       <div className="grid grid-cols-7 gap-1.5 mb-1.5 px-1 relative h-6 items-center">
         {Array.from({ length: COLS }).map((_, c) => (
           <div key={c} className="flex justify-center items-center h-full">
             {hoveredCol === c && !winner && currentPlayer === 1 && (
               <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[16px] border-t-white drop-shadow-[0_3px_2px_rgba(0,0,0,0.4)] transition-all duration-75" />
             )}
           </div>
         ))}
       </div>

       {/* 6x7 Grid Box with Unified Pointer & Touch Events */}
       <div
         ref={boardRef}
         onPointerDown={handlePointerMove}
         onPointerMove={handlePointerMove}
         onTouchStart={handleTouchMove}
         onTouchMove={handleTouchMove}
         onClick={handleBoardClick}
         className="grid grid-cols-7 gap-1.5 bg-[#1252be] p-2 rounded-3xl border-2 border-[#2b72f0] shadow-inner cursor-pointer select-none touch-none"
       >
         {board.map((row, r) =>
           row.map((cell, c) => (
             <div
               key={`${r}-${c}`}
               className={`
                 w-full aspect-square rounded-full flex items-center justify-center transition-all duration-150 relative overflow-hidden shadow-inner pointer-events-none
                 ${
                   cell === 1
                     ? "bg-rose-500 border-2 border-rose-300"
                     : cell === 2
                     ? "bg-amber-400 border-2 border-amber-200"
                     : "bg-[#0a388a] border-2 border-[#082a69]"
                 }
                 ${
                   isWinningCell(r, c)
                     ? "scale-105 border-4 border-white animate-bounce z-20 shadow-[0_0_20px_rgba(255,255,255,0.9)]"
                     : ""
                 }
               `}
             >
               {cell && (
                 <div className="w-3/4 h-3/4 rounded-full border border-white/30 flex items-start justify-center pt-0.5">
                   <div className="w-1/2 h-1/3 bg-white/40 rounded-full blur-[0.5px]" />
                 </div>
               )}
             </div>
           ))
         )}
       </div>

     </div>

     {/* HOW TO PLAY MODAL */}
     {showHowToPlay && (
       <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-md">
         <div
           role="dialog"
           aria-modal="true"
           aria-labelledby="four-in-a-row-how-to-play-title"
           className="max-h-[92%] w-full max-w-sm overflow-y-auto rounded-3xl border-2 border-[#ccff00]/70 bg-gradient-to-b from-slate-900 to-[#0d1527] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.75)]"
         >
           <div className="mb-5 flex items-start justify-between gap-4">
             <div className="flex items-center gap-3">
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] bg-[#ccff00]/10 text-2xl font-black text-[#ccff00] shadow-[0_0_18px_rgba(204,255,0,0.22)]">
                 ?
               </div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">
                   Four in a Row
                 </p>
                 <h2
                   id="four-in-a-row-how-to-play-title"
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
               ["🔴", "You play red", "You always use the red discs and make the first move."],
               ["👆", "Choose a column", "Tap any open column. Your disc falls into its lowest empty space."],
               ["🤖", "Computer plays yellow", "After your move, the computer studies the board and drops a yellow disc."],
               ["🏆", "Connect four", "Win by connecting 4 discs horizontally, vertically, or diagonally."],
               ["🤝", "Avoid a draw", "If every space fills before either side connects four, the match is a draw."],
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
     )}

     {/* WIN / GAME OVER POPUP MODAL */}
     {winner && (
       <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 z-[200]">
         <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/80 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center max-w-sm w-full flex flex-col items-center gap-6 transform transition-all animate-in zoom-in-95 duration-200">
          
           <div className="flex flex-col items-center gap-2">
             <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-inner mb-1">
               {winner === 1 ? "🏆" : winner === 2 ? "🤖" : "🤝"}
             </div>
             <span className="text-[11px] font-extrabold text-amber-300 tracking-[0.2em] uppercase">
               Match Finished
             </span>
             <h2 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 drop-shadow">
               {winner === "Draw"
                 ? "IT'S A DRAW!"
                 : winner === 1
                 ? "YOU WON!"
                 : "OPPONENT WINS!"}
             </h2>
           </div>

           <div className="flex flex-col gap-3 w-full pt-2">
             <button
               onClick={resetGame}
               className="w-full bg-gradient-to-b from-amber-400 to-amber-600 hover:brightness-110 text-slate-950 py-3.5 rounded-xl font-black text-sm tracking-wider uppercase transition-all shadow-lg active:scale-95 border border-amber-200"
             >
               Restart Your Game
             </button>
             {onClose && (
               <button
                 onClick={onClose}
                 className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 py-3.5 rounded-xl font-bold text-sm tracking-wider uppercase transition-all active:scale-95"
               >
                 Exit Main Menu
               </button>
             )}
           </div>

         </div>
       </div>
     )}

   </div>
 );
};

export default FourInARow;
