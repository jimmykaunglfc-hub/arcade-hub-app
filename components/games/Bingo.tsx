"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface BingoProps {
 onClose?: () => void;
 onResult?: (result: "Win" | "Loss" | "Draw") => void;
 roomId?: string;
 seat?: 1 | 2;
}

type BoardTile = {
 id: string;
 number: number | string;
 marked: boolean;
};

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

export const BingoGame: React.FC<BingoProps> = ({ onClose, onResult, roomId, seat = 1 }) => {
 const [appState, setAppState] = useState<"loading" | "menu" | "playing">(roomId ? "loading" : "menu");
 const [board, setBoard] = useState<BoardTile[]>([]);
 const [computerBoard, setComputerBoard] = useState<BoardTile[]>(() =>
   generateBingoCard()
 );
 const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
 const [completedLines, setCompletedLines] = useState<number>(0);
 const [computerLines, setComputerLines] = useState<number>(0);

 const [isGameOver, setIsGameOver] = useState<boolean>(false);
 const [hasWon, setHasWon] = useState<boolean>(false);
 const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
 const [isAutoCalling, setIsAutoCalling] = useState<boolean>(true);
 const resultReportedRef = React.useRef(false);
 const [roomVersion, setRoomVersion] = useState(1);
 const isSharedCaller = !roomId || seat === 1;
 const [isDrawing, setIsDrawing] = useState(false);
 const [callerError, setCallerError] = useState<string | null>(null);
 const lastFallbackDrawAt = React.useRef(0);

 useEffect(() => {
   if (!roomId) return;
   const load = async () => {
     const [{ data: game }, { data: card }] = await Promise.all([
       supabase.from("two_player_game_state").select("state,version,status").eq("room_id", roomId).maybeSingle(),
       supabase.from("bingo_match_cards").select("card,marked").eq("room_id", roomId).eq("seat", seat).maybeSingle(),
     ]);
     if (game) {
       setCalledNumbers(game.state?.called_numbers || []);
       setRoomVersion(game.version);
       if (typeof game.state?.auto_calling === "boolean") setIsAutoCalling(game.state.auto_calling);
       const winner = Number(game.state?.winner_seat || 0);
       setIsGameOver(game.status === "completed");
       setHasWon(winner === seat);
       // Online rooms are created server-side.  Never make either player
       // press the local start button after the second player has joined.
       if (game.status === "playing" || game.status === "completed") setAppState("playing");
     }
     if (card?.card) {
       const nextBoard = card.card.map((number: number | null, index: number) => ({ id: `tile-${index}`, number: index === 12 ? "FREE" : number, marked: (card.marked || []).includes(index) }));
       setBoard(nextBoard);
       setCompletedLines(countCompletedLines(nextBoard));
     }
   };
   void load();
   // Realtime gives immediate updates; this small fallback prevents a delayed
   // websocket from leaving either player on an old card/ball state.
   const refreshTimer = window.setInterval(() => { void load(); }, 2000);
   const channel = supabase.channel(`bingo-${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "two_player_game_state", filter: `room_id=eq.${roomId}` }, load).on("postgres_changes", { event: "*", schema: "public", table: "bingo_match_cards", filter: `room_id=eq.${roomId}` }, load).subscribe();
   return () => { window.clearInterval(refreshTimer); void supabase.removeChannel(channel); };
 }, [roomId, seat]);

 useEffect(() => {
   if (!isGameOver || resultReportedRef.current) return;
   resultReportedRef.current = true;
   onResult?.(hasWon ? "Win" : "Loss");
 }, [hasWon, isGameOver, onResult]);

 // Call Next Ball
 const callNextNumber = useCallback(async () => {
   if (isDrawing || isGameOver) return;
   if (roomId) {
     setIsDrawing(true);
     const { error } = await supabase.rpc("bingo_draw_number", { p_room_id: roomId, p_expected_version: roomVersion });
     // The room can have updated a moment before a tap. Reloading is safer
     // than leaving a button that appears broken.
     if (error) {
       console.warn("Bingo draw did not apply:", error.message);
       setCallerError("Ball call did not reach the room. Please retry.");
     } else setCallerError(null);
     setIsDrawing(false);
     return;
   }
   if (calledNumbers.length >= 75 || isGameOver) return;

   const available = Array.from({ length: 75 }, (_, idx) => idx + 1).filter(
     (n) => !calledNumbers.includes(n)
   );

   if (available.length === 0) return;

   const next = available[Math.floor(Math.random() * available.length)];
   setCalledNumbers((prev) => [next, ...prev]);

   // The computer uses a real card and the exact same called number.
   setComputerBoard((previousBoard) => {
     const nextBoard = previousBoard.map((tile) =>
       tile.number === next
         ? { ...tile, marked: true }
         : tile
     );
     const nextLines = countCompletedLines(nextBoard);

     setComputerLines(nextLines);

     if (nextLines >= 5) {
       setIsGameOver(true);
       setHasWon(false);
     }

     return nextBoard;
   });
 }, [calledNumbers, isDrawing, isGameOver, roomId, roomVersion]);

 // Start Game
 const startNewGame = () => {
   resultReportedRef.current = false;
   setBoard(generateBingoCard());
   setComputerBoard(generateBingoCard());
   setCalledNumbers([]);
   setCompletedLines(0);
   setComputerLines(0);
   setIsGameOver(false);
   setHasWon(false);
   setIsAutoCalling(true);
   setAppState("playing");
 };

 const exitGame = () => {
   if (roomId) void supabase.rpc("leave_bingo_match", { p_room_id: roomId });
   onClose?.();
 };

 const toggleAutoCaller = async () => {
   const next = !isAutoCalling;
   if (!roomId) { setIsAutoCalling(next); return; }
   setCallerError(null);
   const { error } = await supabase.rpc("bingo_set_auto_calling", { p_room_id: roomId, p_enabled: next });
   if (error) {
     setCallerError("Could not change the shared caller. Please retry.");
     return;
   }
   setIsAutoCalling(next);
 };

 // One shared caller automatically draws a ball every five seconds.
 useEffect(() => {
   if (
     roomId ||
     appState !== "playing" ||
     isGameOver ||
     showHowToPlay ||
     !isAutoCalling
   ) return;
   const timer = setInterval(() => { void callNextNumber(); }, 5000);
   return () => clearInterval(timer);
 }, [appState, isGameOver, showHowToPlay, isAutoCalling, callNextNumber]);

 // In online rooms all clients ask the database to advance the shared timer.
 // The RPC locks the game row, so one due ball is drawn exactly once even when
 // both devices fire this request at the same time.
 useEffect(() => {
   if (!roomId || appState !== "playing" || isGameOver) return;
   const tick = async () => {
     const { error } = await supabase.rpc("advance_bingo_draws", { p_room_id: roomId });
     if (!error) {
       setCallerError(null);
       return;
     }

     // Compatibility path for a deployment where the timer RPC has not yet
     // refreshed. The host still makes exactly one shared draw every 5s;
     // the authoritative Bingo draw RPC prevents duplicate numbers.
     const now = Date.now();
     if (isAutoCalling && isSharedCaller && now - lastFallbackDrawAt.current >= 5000) {
       lastFallbackDrawAt.current = now;
       const { error: drawError } = await supabase.rpc("bingo_draw_number", { p_room_id: roomId, p_expected_version: roomVersion });
       if (!drawError) { setCallerError(null); return; }
     }
     setCallerError("Shared caller is reconnecting. Please retry in a moment.");
   };
   tick();
   const timer = window.setInterval(() => { void tick(); }, 1000);
   return () => window.clearInterval(timer);
 }, [appState, isAutoCalling, isGameOver, isSharedCaller, roomId, roomVersion]);

 // Handle Tile Click
 const handleTileClick = (index: number) => {
   if (roomId) {
     if (isGameOver || index === 12) return;
     void supabase.rpc("bingo_mark_square", { p_room_id: roomId, p_tile_index: index, p_expected_version: roomVersion });
     return;
   }
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

 const getColumnTileBg = (column: number) => {
   const columnStyles = [
     "bg-gradient-to-b from-pink-100 to-pink-200 border-pink-300 text-pink-950",
     "bg-gradient-to-b from-lime-100 to-lime-200 border-lime-300 text-lime-950",
     "bg-gradient-to-b from-cyan-100 to-cyan-200 border-cyan-300 text-cyan-950",
     "bg-gradient-to-b from-amber-100 to-amber-200 border-amber-300 text-amber-950",
     "bg-gradient-to-b from-purple-100 to-purple-200 border-purple-300 text-purple-950",
   ];

   return columnStyles[column] ?? columnStyles[0];
 };

 return (
   <div className="fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0d1527] text-white font-sans z-[100] select-none">
     {appState === "loading" ? (
       <div className="grid flex-1 place-items-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" /><p className="text-xs font-black uppercase tracking-[.2em] text-emerald-200">Loading Bingo room</p></div></div>
     ) : appState === "menu" ? (
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
             {roomId ? "Online Bingo Match" : "Bingo Safari"}
           </p>
         </div>

         <div className="flex flex-col gap-4 w-full max-w-xs">
           <button
             onClick={startNewGame}
             className="bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black py-4 rounded-2xl shadow-[0_5px_0_#b45309] hover:brightness-110 active:translate-y-1 active:shadow-none transition-all text-sm tracking-wider uppercase border-2 border-amber-200"
           >
             Start Bingo
           </button>

         </div>
       </div>
     ) : (
       /* PLAYING SCREEN - Clears top JOE YOKES bar with pt-20 */
       <div className="flex-1 w-full flex flex-col relative overflow-y-auto overscroll-none pt-[max(5rem,calc(env(safe-area-inset-top)+4.5rem))] pb-8">
        
         {/* Menu Back Button Row */}
         <div className="w-full px-4 flex items-center justify-between mb-3">
           <div className="flex w-20 justify-start">
             <button
               onClick={roomId ? exitGame : () => setAppState("menu")}
               aria-label={roomId ? "Exit Bingo game" : "Back to Bingo menu"}
               className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 shadow-sm transition-colors hover:text-amber-400"
             >
               <svg
                 aria-hidden="true"
                 viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 strokeWidth="2.2"
                 strokeLinecap="round"
                 strokeLinejoin="round"
                 className="h-4 w-4 shrink-0"
               >
                 <path d="M19 12H5" />
                 <path d="m12 19-7-7 7-7" />
               </svg>
             </button>
           </div>

           <div className="flex items-center gap-1.5">
             <button
               type="button"
               onClick={() => void toggleAutoCaller()}
               aria-pressed={isAutoCalling}
               disabled={roomId ? false : !isSharedCaller}
               className={`rounded-xl border px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                 isAutoCalling
                   ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                   : "border-slate-600 bg-slate-800 text-slate-400"
               }`}
             >
               {isAutoCalling ? "Auto On" : "Auto Off"}
             </button>

             <button
               type="button"
               onClick={() => setShowHowToPlay(true)}
               aria-label="How to play Bingo Safari"
               className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_14px_rgba(204,255,0,0.12)] transition-colors hover:bg-[#ccff00]/20"
             >
               <span
                 aria-hidden="true"
                 className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none text-[#ccff00]"
               >
                 ?
               </span>
             </button>
           </div>
         </div>

         {/* Automatically called bingo balls */}
         <div className="w-full shrink-0 flex flex-col items-center justify-center gap-3 py-2">
           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
             {isAutoCalling
               ? "Balls are called every 5 seconds"
               : "Automatic caller is paused"}
           </p>
           {callerError && <p className="text-center text-xs font-bold text-rose-300">{callerError}</p>}

           {!isAutoCalling && (roomId || isSharedCaller) && (
             <button
               type="button"
               onClick={() => void callNextNumber()}
               disabled={isDrawing || isGameOver || calledNumbers.length >= 75}
               className="flex items-center gap-2 rounded-xl border-2 border-[#ccff00] bg-[#ccff00] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[0_0_20px_rgba(204,255,0,0.28)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
             >
               <span aria-hidden="true" className="text-base">🎱</span>
               Call Next Ball
             </button>
           )}

           {/* Rendered 3D Glossy Bingo Balls */}
           <div className="flex min-h-[118px] items-center justify-center gap-3">
             {calledNumbers.length > 0 &&
               calledNumbers.slice(0, 1).map((num, idx) => {
                 const letter = getBallLetter(num);
                 return (
                   <div key={`${num}-${idx}`} className="flex flex-col items-center gap-1">
                     {idx === 0 && (
                       <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300">
                         Current Ball
                       </span>
                     )}
                     <div
                       className={`rounded-full border-2 ${getBallBg(
                         letter
                       )} flex flex-col items-center justify-center font-black shadow-[0_7px_16px_rgba(0,0,0,0.62)] transition-all ${
                         idx === 0
                           ? "h-16 w-16 border-4 ring-2 ring-white/70 ring-offset-2 ring-offset-[#0d1527]"
                           : "h-11 w-11 opacity-65"
                       }`}
                     >
                       <span className={`${idx === 0 ? "text-xs" : "text-[9px]"} leading-none text-white drop-shadow-sm`}>
                         {letter}
                       </span>
                       <span className={`${idx === 0 ? "text-2xl" : "text-sm"} leading-none text-white drop-shadow-md`}>
                         {num}
                       </span>
                     </div>
                   </div>
                 );
               })}
           </div>
         </div>

         {/* Lines & Status Bar */}
         <div className="mt-8 w-full shrink-0 flex items-center justify-between px-6 py-1 max-w-sm mx-auto text-base font-extrabold text-amber-300">
           <span>Your Lines: {completedLines} / 5</span>
           {!roomId && <span className="text-rose-400">Opponent: {computerLines} / 5</span>}
         </div>

         {/* Main Gameplay Area */}
         <div className="w-full flex items-center justify-center px-3 pb-6 pt-6 gap-3 max-w-2xl mx-auto">
          
           {/* Legacy local preview; online games render only the player’s private card. */}
             {!roomId && <div className="hidden sm:flex flex-col items-center relative shrink-0">
               <div className="bg-[#4a2311] border-2 border-[#2d1408] rounded-lg p-1.5 w-24 shadow-2xl">
                 <div className="grid grid-cols-5 gap-0.5 text-[8px] font-black text-center mb-1">
                   <span className="text-pink-400">B</span>
                   <span className="text-lime-400">I</span>
                   <span className="text-cyan-400">N</span>
                   <span className="text-amber-400">G</span>
                   <span className="text-purple-400">O</span>
                 </div>
                 <div className="grid grid-cols-5 gap-0.5 aspect-square">
                   {computerBoard.map((tile, idx) => (
                     <div
                       key={idx}
                       className={`text-[8px] font-extrabold flex items-center justify-center rounded-sm ${
                         tile.marked
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
             </div>}

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
                           : `${getColumnTileBg(idx % 5)} hover:brightness-105 active:scale-95`
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
                   {hasWon ? "BINGO! YOU WIN!" : roomId ? "OPPONENT WINS BINGO!" : "COMPUTER WINS BINGO!"}
                 </h2>
               </div>

               <div className="flex flex-col gap-3 w-full pt-2">
                 <button
                   onClick={roomId ? exitGame : startNewGame}
                   className="w-full bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 py-3.5 rounded-xl font-black text-sm tracking-wider uppercase transition-all shadow-lg active:scale-95"
                 >
                   {roomId ? "Exit Arena" : "Play Again"}
                 </button>
                 <button
                   onClick={roomId ? exitGame : () => setAppState("menu")}
                   className="w-full bg-slate-800 text-slate-300 border border-slate-700 py-3.5 rounded-xl font-bold text-sm tracking-wider uppercase transition-all active:scale-95"
                 >
                   {roomId ? "Exit Game" : "Main Menu"}
                 </button>
               </div>

             </div>
           </div>
         )}

       </div>
     )}

     {/* How to Play Modal */}
     {showHowToPlay && (
       <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-md">
         <div
           role="dialog"
           aria-modal="true"
           aria-labelledby="bingo-how-to-play-title"
           className="w-full max-w-sm rounded-3xl border-2 border-[#ccff00]/70 bg-gradient-to-b from-slate-900 to-[#0d1527] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.75)]"
         >
           <div className="mb-5 flex items-start justify-between gap-4">
             <div className="flex items-center gap-3">
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] bg-[#ccff00]/10 text-2xl font-black text-[#ccff00] shadow-[0_0_18px_rgba(204,255,0,0.22)]">
                 ?
               </div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">
                   Bingo Safari
                 </p>
                 <h2
                   id="bingo-how-to-play-title"
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
               ["🎱", "Watch the caller", "When Auto is on, a new Bingo ball is called every 5 seconds."],
               ["👆", "Mark your card", "Find the called number and tap its square. Uncalled numbers cannot be marked."],
               ["⭐", "Use the free space", "The center FREE square starts marked and counts toward every crossing line."],
               ["🏆", "Beat the computer", "Complete 5 rows, columns, or diagonals before the computer completes 5."],
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
   </div>
 );
};

export default BingoGame;
