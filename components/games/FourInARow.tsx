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


export const FourInARow: React.FC<FourInARowProps> = ({ onClose, onResult }) => {
 const [board, setBoard] = useState<Board>(() =>
   Array.from({ length: ROWS }, () => Array(COLS).fill(null))
 );
 const [currentPlayer, setCurrentPlayer] = useState<Player>(1);
 const [hoveredCol, setHoveredCol] = useState<number | null>(null);
 const [winner, setWinner] = useState<Player | "Draw" | null>(null);
 const [winningCells, setWinningCells] = useState<[number, number][]>([]);
 const resultReported = useRef(false);

 useEffect(() => {
   if (!winner || resultReported.current) return;
   resultReported.current = true;
   onResult?.(winner === "Draw" ? "Draw" : winner === 1 ? "Win" : "Loss");
 }, [winner, onResult]);


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


 // Opponent AI Move
 useEffect(() => {
   if (currentPlayer === 2 && !winner) {
     const timer = setTimeout(() => {
       const validCols = [];
       for (let c = 0; c < COLS; c++) {
         if (!board[0][c]) validCols.push(c);
       }


       if (validCols.length > 0) {
         const randomCol = validCols[Math.floor(Math.random() * validCols.length)];
         executeMove(randomCol, 2);
       }
     }, 1000);


     return () => clearTimeout(timer);
   }
 }, [currentPlayer, winner, board]);


 const resetGame = () => {
   setBoard(Array.from({ length: ROWS }, () => Array(COLS).fill(null)));
   setCurrentPlayer(1);
   setWinner(null);
   setWinningCells([]);
  setHoveredCol(null);
  resultReported.current = false;
 };


 const isWinningCell = (r: number, c: number) =>
   winningCells.some(([winR, winC]) => winR === r && winC === c);


 return (
   <div className="fixed inset-0 flex flex-col items-center justify-start bg-[#258a8a] text-white font-sans p-4 pt-20 overflow-y-auto select-none z-[100] bg-[radial-gradient(#2ea4a4_1px,transparent_1px)] [background-size:16px_16px]">
    
     {/* Top Header Bar */}
     <div className="w-full max-w-md flex items-center justify-between mb-4">
       {onClose ? (
         <button
           onClick={onClose}
           className="flex items-center gap-1 text-slate-100 hover:text-amber-300 text-xs font-black uppercase tracking-wider bg-black/30 px-3 py-1.5 rounded-xl border border-white/20 backdrop-blur-sm transition-colors"
         >
           ‹ EXIT
         </button>
       ) : (
         <div />
       )}


       <h1 className="text-xl font-black text-amber-300 tracking-wider uppercase drop-shadow">
         4 IN A ROW
       </h1>


       <button
         onClick={resetGame}
         className="text-xs font-black uppercase tracking-wider bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-1.5 rounded-xl border border-amber-200 shadow-sm transition-all active:scale-95"
       >
         RESET
       </button>
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

