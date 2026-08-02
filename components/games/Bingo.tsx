"use client";


import React, { useState, useEffect, useCallback } from "react";


interface BingoProps {
 onClose?: () => void;
 onResult?: (result: "Win" | "Loss" | "Draw") => void;
}


type BoardTile = {
 id: string;
 number: number | string;
 marked: boolean;
};


type GameMode = "friend" | "offline";


const generateBingoCard = (): BoardTile[] => {
 const getColNumbers = (min: number, max: number) => {
   const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
   pool.sort(() => Math.random() - 0.5);
   return pool.slice(0, 5);
 };


 const b = getColNumbers(1, 15);
 const i = getColNumbers(16, 30);
 const n = getColNumbers(31, 45);
 const g = getColNumbers(46, 60);
 const o = getColNumbers(61, 75);


 const board: BoardTile[] = [];
 let idCounter = 0;


 for (let row = 0; row < 5; row++) {
   for (let col = 0; col < 5; col++) {
     idCounter++;
     if (row === 2 && col === 2) {
       board.push({ id: `tile-${idCounter}`, number: "FREE", marked: true });
     } else {
       const cols = [b, i, n, g, o];
       board.push({
         id: `tile-${idCounter}`,
         number: cols[col][row],
         marked: false,
       });
     }
   }
 }
 return board;
};


const countCompletedLines = (board: BoardTile[]): number => {
 let lines = 0;
 for (let r = 0; r < 5; r++) {
   if ([0, 1, 2, 3, 4].every((c) => board[r * 5 + c].marked)) lines++;
 }
 for (let c = 0; c < 5; c++) {
   if ([0, 1, 2, 3, 4].every((r) => board[r * 5 + c].marked)) lines++;
 }
 if ([0, 6, 12, 18, 24].every((idx) => board[idx].marked)) lines++;
 if ([4, 8, 12, 16, 20].every((idx) => board[idx].marked)) lines++;
 return lines;
};


export const BingoGame: React.FC<BingoProps> = ({ onClose, onResult }) => {
 const [appState, setAppState] = useState<"menu" | "playing">("menu");
 const [gameMode, setGameMode] = useState<GameMode>("offline");
 const [board, setBoard] = useState<BoardTile[]>([]);
 const [miniBoard] = useState<BoardTile[]>(() => generateBingoCard());
 const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
 const [completedLines, setCompletedLines] = useState<number>(0);


 // Friend Mode States
 const [roomCode, setRoomCode] = useState<string>("");
 const [friendOpponentLines, setFriendOpponentLines] = useState<number>(0);


 const [isGameOver, setIsGameOver] = useState<boolean>(false);
 const [hasWon, setHasWon] = useState<boolean>(false);
 const [isAutoCalling, setIsAutoCalling] = useState<boolean>(false);
 const resultReported = React.useRef(false);

 useEffect(() => {
   if (!isGameOver || resultReported.current) return;
   resultReported.current = true;
   onResult?.(hasWon ? "Win" : "Loss");
 }, [hasWon, isGameOver, onResult]);


 // Call Next Ball
 const callNextNumber = useCallback(() => {
   if (calledNumbers.length >= 75 || isGameOver) return;


   const available = Array.from({ length: 75 }, (_, idx) => idx + 1).filter(
     (n) => !calledNumbers.includes(n)
   );


   if (available.length === 0) return;


   const next = available[Math.floor(Math.random() * available.length)];
   const newCalledCount = calledNumbers.length + 1;


   setCalledNumbers((prev) => [next, ...prev]);


   // Opponent Progression in Friend Mode
   if (gameMode === "friend" && newCalledCount >= 4) {
     const maxPossibleLines = Math.min(5, Math.floor(newCalledCount / 3.5));


     setFriendOpponentLines((prev) => {
       if (prev < maxPossibleLines && Math.random() < 0.25) {
         const nextLines = prev + 1;
         if (nextLines === 5 && !isGameOver) {
           setIsGameOver(true);
  setHasWon(false);
  resultReported.current = false;
         }
         return nextLines;
       }
       return prev;
     });
   }
 }, [calledNumbers, isGameOver, gameMode]);


 // Start Game
 const startNewGame = (mode: GameMode) => {
   setGameMode(mode);
   setBoard(generateBingoCard());
   setCalledNumbers([]);
   setCompletedLines(0);
   setFriendOpponentLines(0);
   setIsGameOver(false);
   setHasWon(false);


   if (mode === "friend") {
     setRoomCode(Math.floor(1000 + Math.random() * 9000).toString());
     setIsAutoCalling(true);
   } else {
     setIsAutoCalling(false);
   }


   setAppState("playing");
 };


 // Auto Ball Timer (For Friend Mode)
 useEffect(() => {
   if (appState !== "playing" || isGameOver || !isAutoCalling) return;
   const timer = setInterval(() => callNextNumber(), 3000);
   return () => clearInterval(timer);
 }, [appState, isGameOver, isAutoCalling, callNextNumber]);


 // Handle Tile Click
 const handleTileClick = (index: number) => {
   if (isGameOver) return;
   const tile = board[index];


   // Must be a called number or FREE tile
   if (typeof tile.number === "number" && !calledNumbers.includes(tile.number)) {
     return;
   }


   const nextBoard = [...board];
   nextBoard[index].marked = !nextBoard[index].marked;
   setBoard(nextBoard);


   const lines = countCompletedLines(nextBoard);
   setCompletedLines(lines);


   if (lines >= 5 && !isGameOver) {
     setHasWon(true);
     setIsGameOver(true);
   }
 };


 const getBallLetter = (num: number | null) => {
   if (!num) return "";
   if (num <= 15) return "B";
   if (num <= 30) return "I";
   if (num <= 45) return "N";
   if (num <= 60) return "G";
   return "O";
 };


 const getBallBg = (letter: string) => {
   switch (letter) {
     case "B": return "bg-gradient-to-b from-pink-400 to-pink-600 border-pink-300";
     case "I": return "bg-gradient-to-b from-lime-400 to-lime-600 border-lime-300";
     case "N": return "bg-gradient-to-b from-cyan-400 to-cyan-600 border-cyan-300";
     case "G": return "bg-gradient-to-b from-amber-400 to-amber-600 border-amber-300";
     default: return "bg-gradient-to-b from-purple-500 to-purple-700 border-purple-300";
   }
 };


 return (
   <div className="fixed inset-0 flex flex-col w-full h-full bg-[#0d1527] text-white font-sans overflow-y-auto z-[100] select-none">
     {appState === "menu" ? (
       /* MENU SCREEN */
       <div className="flex-1 w-full flex flex-col items-center justify-center p-6 pt-20 relative">
         {onClose && (
           <button
             onClick={onClose}
             className="absolute top-20 left-6 flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
           >
             <span className="text-2xl leading-none">‹</span>
             <span className="text-xs font-bold tracking-widest uppercase mt-0.5">Exit Game</span>
           </button>
         )}


         <div className="text-center mb-8">
           <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] mb-2 tracking-tight">
             BINGO SAFARI
           </h1>
           <p className="text-emerald-200 font-bold tracking-widest uppercase text-xs drop-shadow">
             Select Match Mode
           </p>
         </div>


         <div className="flex flex-col gap-4 w-full max-w-xs">
           <button
             onClick={() => startNewGame("friend")}
             className="bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black py-4 rounded-2xl shadow-[0_5px_0_#b45309] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all text-sm tracking-wider uppercase border-2 border-amber-200"
           >
             👥 PLAY WITH FRIEND
           </button>


           <button
             onClick={() => startNewGame("offline")}
             className="bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black py-4 rounded-2xl shadow-[0_5px_0_#b45309] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all text-sm tracking-wider uppercase border-2 border-amber-200"
           >
             🤖 PLAY OFFLINE
           </button>
         </div>
       </div>
     ) : (
       /* PLAYING SCREEN - Clears top JOE YOKES bar with pt-20 */
       <div className="flex-1 w-full flex flex-col relative pt-20 pb-8 overflow-y-auto">
        
         {/* Menu Back Button Row */}
         <div className="w-full px-4 flex items-center justify-between mb-3">
           <button
             onClick={() => setAppState("menu")}
             className="flex items-center gap-1 text-slate-300 hover:text-amber-400 transition-colors bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm"
           >
             <span className="text-lg leading-none">‹</span>
             <span className="text-xs font-black tracking-widest uppercase">Menu</span>
           </button>


           <span className="text-xs font-black text-amber-300 tracking-widest uppercase">
             {gameMode === "friend" ? `👥 Code: ${roomCode}` : "🤖 Offline Mode"}
           </span>


           {gameMode === "friend" && (
             <button
               onClick={() => setIsAutoCalling((prev) => !prev)}
               className={`text-[10px] font-black tracking-wider px-2.5 py-1 rounded-lg border uppercase transition-colors ${
                 isAutoCalling
                   ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                   : "bg-slate-800 border-slate-700 text-slate-400"
               }`}
             >
               {isAutoCalling ? "Auto ON" : "Auto OFF"}
             </button>
           )}
         </div>


         {/* Ball Display & DRAW BALL Button Area */}
         <div className="w-full shrink-0 flex flex-col items-center justify-center gap-3 py-2">
          
           {/* Draw Ball Action Button */}
           <button
             onClick={callNextNumber}
             className="bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 text-slate-950 font-black text-sm tracking-wider px-8 py-3 rounded-2xl shadow-[0_4px_12px_rgba(245,158,11,0.5)] border-2 border-amber-200 hover:brightness-110 active:scale-95 transition-all uppercase animate-pulse"
           >
             🎲 DRAW BALL 🎲
           </button>


           {/* Rendered 3D Glossy Bingo Balls */}
           <div className="flex items-center justify-center gap-3 min-h-[55px]">
             {calledNumbers.length > 0 &&
               calledNumbers.slice(0, 3).map((num, idx) => {
                 const letter = getBallLetter(num);
                 return (
                   <div
                     key={idx}
                     className={`w-12 h-12 rounded-full border-2 ${getBallBg(
                       letter
                     )} flex flex-col items-center justify-center font-black shadow-[0_6px_12px_rgba(0,0,0,0.6)] transform ${
                       idx === 0 ? "scale-110 z-10" : "scale-90 opacity-80"
                     } transition-all`}
                   >
                     <span className="text-[10px] leading-none text-white drop-shadow-sm">{letter}</span>
                     <span className="text-base leading-none text-white drop-shadow-md">{num}</span>
                   </div>
                 );
               })}
           </div>
         </div>


         {/* Lines & Status Bar */}
         <div className="w-full shrink-0 flex items-center justify-between px-6 py-1 max-w-sm mx-auto text-xs font-extrabold text-amber-300">
           <span>Your Lines: {completedLines} / 5</span>
           {gameMode === "friend" ? (
             <span className="text-rose-400">Friend: {friendOpponentLines} / 5</span>
           ) : (
             <span className="text-slate-300">Called: {calledNumbers.length} / 75</span>
           )}
         </div>


         {/* Main Gameplay Area */}
         <div className="w-full flex items-center justify-center p-3 gap-3 max-w-2xl mx-auto">
          
           {/* Left Side: Mini Friend Board Preview */}
           {gameMode === "friend" && (
             <div className="hidden sm:flex flex-col items-center relative shrink-0">
               <div className="bg-[#4a2311] border-2 border-[#2d1408] rounded-lg p-1.5 w-24 shadow-2xl">
                 <div className="grid grid-cols-5 gap-0.5 text-[8px] font-black text-center mb-1">
                   <span className="text-pink-400">B</span>
                   <span className="text-lime-400">I</span>
                   <span className="text-cyan-400">N</span>
                   <span className="text-amber-400">G</span>
                   <span className="text-purple-400">O</span>
                 </div>
                 <div className="grid grid-cols-5 gap-0.5 aspect-square">
                   {miniBoard.map((tile, idx) => (
                     <div
                       key={idx}
                       className={`text-[8px] font-extrabold flex items-center justify-center rounded-sm ${
                         idx === 12
                           ? "bg-rose-600 text-white"
                           : "bg-[#fcedd0] text-slate-900"
                       }`}
                     >
                       {tile.number === "FREE" ? "O" : tile.number}
                     </div>
                   ))}
                 </div>
               </div>
               <div className="absolute right-[-10px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-l-8 border-l-rose-500 drop-shadow" />
             </div>
           )}


           {/* Main Wooden Bingo Board */}
           <div className="bg-[#4a2311] border-4 border-[#2d1408] rounded-3xl p-3 shadow-[0_15px_30px_rgba(0,0,0,0.8)] w-full max-w-[360px]">
            
             {/* Colored B-I-N-G-O Header */}
             <div className="grid grid-cols-5 gap-1.5 mb-2 text-center text-xl font-black text-white drop-shadow-md">
               <div className="bg-gradient-to-b from-pink-500 to-pink-600 py-1.5 rounded-t-xl">B</div>
               <div className="bg-gradient-to-b from-lime-500 to-lime-600 py-1.5 rounded-t-xl">I</div>
               <div className="bg-gradient-to-b from-cyan-500 to-cyan-600 py-1.5 rounded-t-xl">N</div>
               <div className="bg-gradient-to-b from-amber-400 to-amber-500 py-1.5 rounded-t-xl">G</div>
               <div className="bg-gradient-to-b from-purple-500 to-purple-600 py-1.5 rounded-t-xl">O</div>
             </div>


             {/* 5x5 Grid */}
             <div className="grid grid-cols-5 gap-1.5 aspect-square">
               {board.map((tile, idx) => {
                 const isFree = tile.number === "FREE";


                 return (
                   <button
                     key={tile.id}
                     onClick={() => handleTileClick(idx)}
                     className={`
                       w-full h-full aspect-square flex items-center justify-center rounded-2xl font-black text-xl border-b-4 transition-all duration-150 relative overflow-hidden shadow-md
                       ${
                         tile.marked
                           ? "bg-gradient-to-b from-rose-500 to-rose-700 border-rose-900 text-white scale-95 shadow-inner"
                           : "bg-gradient-to-b from-[#fff6e5] to-[#f5e3be] border-[#d8be93] text-slate-900 hover:brightness-105 active:scale-95"
                       }
                     `}
                   >
                     {tile.marked ? (
                       <div className="w-8 h-8 rounded-full border-4 border-white flex items-center justify-center font-black text-lg text-white drop-shadow">
                         O
                       </div>
                     ) : isFree ? (
                       <span className="text-xs font-black text-amber-600 tracking-tighter">FREE</span>
                     ) : (
                       <span className="leading-none drop-shadow-sm">{tile.number}</span>
                     )}
                   </button>
                 );
               })}
             </div>


           </div>
         </div>


         {/* Game Over Modal */}
         {isGameOver && (
           <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 z-[200]">
             <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/80 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center max-w-sm w-full flex flex-col items-center gap-6 transform transition-all animate-in zoom-in-95 duration-200">
              
               <div className="flex flex-col items-center gap-2">
                 <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-inner mb-1">
                   {hasWon ? "🏆" : "❌"}
                 </div>
                 <span className="text-[11px] font-extrabold text-amber-300 tracking-[0.2em] uppercase">
                   Match Result
                 </span>
                 <h2 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 drop-shadow">
                   {hasWon ? "BINGO! YOU WIN!" : "FRIEND WINS BINGO!"}
                 </h2>
               </div>


               <div className="flex flex-col gap-3 w-full pt-2">
                 <button
                   onClick={() => startNewGame(gameMode)}
                   className="w-full bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 py-3.5 rounded-xl font-black text-sm tracking-wider uppercase transition-all shadow-lg active:scale-95"
                 >
                   Play Again
                 </button>
                 <button
                   onClick={() => setAppState("menu")}
                   className="w-full bg-slate-800 text-slate-300 border border-slate-700 py-3.5 rounded-xl font-bold text-sm tracking-wider uppercase transition-all active:scale-95"
                 >
                   Main Menu
                 </button>
               </div>


             </div>
           </div>
         )}


       </div>
     )}
   </div>
 );
};


export default BingoGame;

