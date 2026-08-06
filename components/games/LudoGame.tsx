"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface LudoGameProps { onClose?: () => void; onPlayAgain?: () => void; roomId?: string | null; }
type PlayerId = 0 | 1 | 2 | 3;
type Point = [number, number];
type TokenState = Record<PlayerId, number[]>;

const PLAYERS = [
 { name: "You", color: "#e5232a", light: "#fecaca", start: 39 },
 { name: "Computer 2", color: "#08a64f", light: "#bbf7d0", start: 0 },
 { name: "Computer 3", color: "#ffd719", light: "#fef08a", start: 13 },
 { name: "Computer 4", color: "#27a9e8", light: "#bfdbfe", start: 26 },
] as const;

const TRACK: Point[] = [
 [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
 [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
 [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
 [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0],
];

const HOME_PATHS: Point[][] = [
 [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
 [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
 [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
 [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
];

const SAFE_GLOBAL = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const initialTokens = (): TokenState => ({ 0: [-1,-1,-1,-1], 1: [-1,-1,-1,-1], 2: [-1,-1,-1,-1], 3: [-1,-1,-1,-1] });
const nextPlayer = (player: PlayerId) => ((player + 1) % 4) as PlayerId;

const globalTrackIndex = (player: PlayerId, progress: number) =>
 progress >= 0 && progress < 52 ? (PLAYERS[player].start + progress) % 52 : null;

const tokenPoint = (player: PlayerId, progress: number): Point | null => {
 if (progress < 0 || progress >= 58) return null;
 if (progress < 52) return TRACK[(PLAYERS[player].start + progress) % 52];
 return HOME_PATHS[player][progress - 52];
};

const movableTokens = (pieces: number[], roll: number) =>
 pieces.map((progress, index) => ({ progress, index })).filter(({ progress }) =>
   progress === -1 ? roll === 6 : progress < 58 && progress + roll <= 58
 ).map(({ index }) => index);

const homePositions: Point[][] = [
 [[11,2],[11,3],[12,2],[12,3]], [[2,2],[2,3],[3,2],[3,3]],
 [[2,11],[2,12],[3,11],[3,12]], [[11,11],[11,12],[12,11],[12,12]],
];

const PIPS: Record<number, Array<[number, number]>> = {
 1: [[1, 1]],
 2: [[0, 2], [2, 0]],
 3: [[0, 2], [1, 1], [2, 0]],
 4: [[0, 0], [0, 2], [2, 0], [2, 2]],
 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
 6: [[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]],
};

function DiceFace({ value }: { value: number }) {
 return (
   <span className="grid h-11 w-11 grid-cols-3 grid-rows-3 rounded-[9px] border-2 border-slate-950 bg-white p-1.5 shadow-[inset_0_0_5px_rgba(0,0,0,0.08)]">
     {PIPS[value].map(([row, col], index) => (
       <span
         key={`${row}-${col}-${index}`}
         className={`h-2.5 w-2.5 self-center justify-self-center rounded-full ${value === 1 ? "bg-red-500" : "bg-slate-950"}`}
         style={{ gridRow: row + 1, gridColumn: col + 1 }}
       />
     ))}
   </span>
 );
}

const SETTLED_DICE_ROTATION: Record<number, string> = {
 1: "rotateX(0deg) rotateY(0deg)",
 2: "rotateX(0deg) rotateY(-90deg)",
 3: "rotateX(-90deg) rotateY(0deg)",
 4: "rotateX(90deg) rotateY(0deg)",
 5: "rotateX(0deg) rotateY(90deg)",
 6: "rotateX(0deg) rotateY(180deg)",
};

function RealDice({ value, rolling }: { value: number; rolling: boolean }) {
 const faces = [
   [1, "translateZ(22px)"],
   [6, "rotateY(180deg) translateZ(22px)"],
   [2, "rotateY(90deg) translateZ(22px)"],
   [5, "rotateY(-90deg) translateZ(22px)"],
   [3, "rotateX(90deg) translateZ(22px)"],
   [4, "rotateX(-90deg) translateZ(22px)"],
 ] as const;

 return (
   <span className={`ludo-dice-stage ${rolling ? "ludo-dice-bounce" : ""}`}>
     <span
       className={`ludo-dice-cube ${rolling ? "ludo-dice-cube-rolling" : ""}`}
       style={!rolling ? { transform: SETTLED_DICE_ROTATION[value] } : undefined}
     >
       {faces.map(([faceValue, transform]) => (
         <span key={faceValue} className="ludo-dice-face" style={{ transform }}>
           <DiceFace value={faceValue} />
         </span>
       ))}
     </span>
   </span>
 );
}

function PawnIcon() {
 return (
   <svg aria-hidden="true" viewBox="0 0 32 44" className="h-full w-full overflow-visible">
     <ellipse cx="16" cy="40" rx="9" ry="3" fill="rgba(15,23,42,0.48)" />
     <path d="M16 2C8.8 2 4 7.2 4 14.1c0 9.2 12 24.9 12 24.9s12-15.7 12-24.9C28 7.2 23.2 2 16 2Z" fill="white" stroke="rgba(15,23,42,0.48)" strokeWidth="1.5" />
     <circle cx="16" cy="14" r="8.3" fill="currentColor" stroke="white" strokeWidth="1" />
     <ellipse cx="13.3" cy="10.8" rx="2.5" ry="1.4" fill="rgba(255,255,255,0.65)" transform="rotate(-28 13.3 10.8)" />
   </svg>
 );
}

export default function LudoGame({ onClose, onPlayAgain, roomId }: LudoGameProps) {
 const [playerNames, setPlayerNames] = useState<string[]>(PLAYERS.map((player) => player.name));
 const [roomReady, setRoomReady] = useState(!roomId);

 useEffect(() => {
   if (!roomId) return;
   const keepRoomAlive = () => {
     void supabase.rpc("heartbeat_matchmaking_room", { p_room_id: roomId });
     void supabase.rpc("replace_expired_four_player_seats", { p_room_id: roomId });
   };
   keepRoomAlive();
   const timer = window.setInterval(keepRoomAlive, 10_000);
   return () => window.clearInterval(timer);
 }, [roomId]);
 
 const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
 const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
 const [isHost, setIsHost] = useState(false);
 const [botIndexes, setBotIndexes] = useState<number[]>([]);
 const [mySeatIndex, setMySeatIndex] = useState(0);
 const timeoutRequested = useRef<string | null>(null);
 const [tokens, setTokens] = useState<TokenState>(() => initialTokens());
 const [current, setCurrent] = useState<PlayerId>(0);
 const [dice, setDice] = useState<number | null>(null);
 const [rolling, setRolling] = useState(false);
 const [winner, setWinner] = useState<PlayerId | null>(null);
 const [message, setMessage] = useState("Your turn. Roll the dice!");
 const [showRules, setShowRules] = useState(false);

 useEffect(() => {
   const preventPinch = (event: Event) => event.preventDefault();
   document.addEventListener("gesturestart", preventPinch, { passive: false });
   return () => document.removeEventListener("gesturestart", preventPinch);
 }, []);

 // 🎯 THE FIX: Continuous aggressive polling for bot resolution AND timeout advancements
 useEffect(() => {
   if (!roomId) return;
   const handleServerTicks = () => {
     void supabase.rpc("resolve_ludo_bot_turns", { p_room_id: roomId });
     void supabase.rpc("advance_ludo_timeout", { p_room_id: roomId });
   };
   
   handleServerTicks();
   const timer = window.setInterval(handleServerTicks, 1000);
   return () => window.clearInterval(timer);
 }, [roomId]);

 useEffect(() => {
   if (!roomId) return;
   void (async () => {
     const [{ data: auth }, { data: room }] = await Promise.all([supabase.auth.getUser(), supabase.rpc("get_matchmaking_room", { p_room_id: roomId })]);
     const seat = (room?.players || []).find((player: any) => player.user_id === auth.user?.id)?.seat;
     if (!seat) return;
     const roster = new Map<number, string>((room.players || []).map((player: any) => [player.seat, player.name]));
     setIsHost(room?.host_id === auth.user?.id);
     const bySeat = new Map<number, any>((room?.players || []).map((player: any) => [player.seat, player]));
     setMySeatIndex(seat - 1);
     setBotIndexes([1,2,3,4].flatMap((number, index) => bySeat.get(number)?.is_bot ? [index] : []));
     setPlayerNames([1,2,3,4].map((number) => roster.get(number) || "Player"));
   })();
 }, [roomId]);

 // 🎯 THE LOCAL FALLBACK: If playing offline, resolve bot turns using setTimeout
 useEffect(() => {
   if (roomId || !botIndexes.includes(current) || winner !== null || rolling) return;
   const timer = window.setTimeout(() => {
     if (dice === null) { rollDice(current); return; }
     const piece = movableTokens(tokens[current], dice)[0];
     if (piece !== undefined) movePiece(current, piece, dice);
   }, 700);
   return () => window.clearTimeout(timer);
 }, [botIndexes, current, dice, rolling, roomId, tokens, winner]);

 useEffect(() => {
   if (!roomId) return;
   const load = async () => {
     const [{ data: auth }, { data: room }, { data: match }] = await Promise.all([
       supabase.auth.getUser(), supabase.rpc("get_matchmaking_room", { p_room_id: roomId }),
       supabase.from("ludo_match_state").select("state,current_seat,status,turn_deadline").eq("room_id", roomId).maybeSingle(),
     ]);
     const seat = (room?.players || []).find((player: any) => player.user_id === auth.user?.id)?.seat;
     if (!seat || !match) return;
     const raw = match.state?.tokens || [];
     const namesBySeat = new Map<number, string>((room?.players || []).map((player: any) => [player.seat, player.name]));
     const displayNames = [1,2,3,4].map((number) => namesBySeat.get(number) || "Player");
     setPlayerNames(displayNames);
     setMySeatIndex(seat - 1);
     setTokens(Object.fromEntries([0,1,2,3].map((index) => [index, raw[index] || [-1,-1,-1,-1]])) as TokenState);
     const displayCurrent = (match.current_seat - 1) as PlayerId;
     setCurrent(displayCurrent);
     setDice(match.state?.dice ?? null);
     setTurnDeadline(match.turn_deadline || null);
     
     // Resolve any bots waiting in the playing state 
     const currentSeatPlayer = (room?.players || []).find((player: any) => player.seat === match.current_seat);
     if (match.status === "playing" && currentSeatPlayer?.is_bot) {
       void supabase.rpc("resolve_ludo_bot_turns", { p_room_id: roomId });
     }

     if (match.status === "completed") setMessage(displayCurrent === seat - 1 ? "Match complete." : `${displayNames[displayCurrent]} wins.`);
     else if (match.state?.dice) setMessage(displayCurrent === seat - 1 ? `You rolled ${match.state.dice}. Choose a token.` : `${displayNames[displayCurrent]} is choosing a token.`);
     else setMessage(displayCurrent === seat - 1 ? "Your turn. Roll the dice!" : `${displayNames[displayCurrent]}'s turn to roll.`);
     const winnerSeat = Number(match.state?.winner_seat || 0);
     setWinner(winnerSeat ? (winnerSeat - 1) as PlayerId : null);
     setRoomReady(true);
   };
   void load(); const poll = window.setInterval(() => { void load(); }, 1200);
   return () => window.clearInterval(poll);
 }, [roomId]);

 useEffect(() => {
   if (!turnDeadline) return;
   timeoutRequested.current = null;
   const update = () => {
     const left = Math.max(0, Math.ceil((new Date(turnDeadline).getTime() - Date.now()) / 1000));
     setSecondsLeft(left);
   };
   update(); const timer = window.setInterval(update, 500);
   return () => window.clearInterval(timer);
 }, [turnDeadline]);

 const available = useMemo(
   () => dice === null ? [] : movableTokens(tokens[current], dice),
   [current, dice, tokens]
 );

 const reset = () => {
   setTokens(initialTokens()); setCurrent(0); setDice(null); setRolling(false);
   setWinner(null); setMessage("Your turn. Roll the dice!");
 };

 const finishTurn = useCallback((player: PlayerId, roll: number, captured: boolean) => {
   if (roll === 6 || captured) {
     setCurrent(player);
     setMessage(`${PLAYERS[player].name} gets another roll!`);
   } else {
     const next = nextPlayer(player);
     setCurrent(next);
     setMessage(next === 0 ? "Your turn. Roll the dice!" : `${PLAYERS[next].name} is thinking...`);
   }
   setDice(null); setRolling(false);
 }, []);

 const movePiece = useCallback((player: PlayerId, pieceIndex: number, roll: number) => {
   if (roomId) { void supabase.rpc("ludo_move", { p_room_id: roomId, p_piece: pieceIndex }).then(({ error }) => { if (error) setMessage(error.message); }); return; }
   const oldProgress = tokens[player][pieceIndex];
   const newProgress = oldProgress === -1 ? 0 : oldProgress + roll;
   const nextState: TokenState = {
     0: [...tokens[0]], 1: [...tokens[1]], 2: [...tokens[2]], 3: [...tokens[3]],
   };
   nextState[player][pieceIndex] = newProgress;

   let captured = false;
   const landedGlobal = globalTrackIndex(player, newProgress);
   if (landedGlobal !== null && !SAFE_GLOBAL.has(landedGlobal)) {
     ([0,1,2,3] as PlayerId[]).forEach((opponent) => {
       if (opponent === player) return;
       nextState[opponent] = nextState[opponent].map((progress) => {
         if (globalTrackIndex(opponent, progress) === landedGlobal) { captured = true; return -1; }
         return progress;
       });
     });
   }

   setTokens(nextState);
   setDice(null);
   if (nextState[player].every((progress) => progress === 58)) {
     setWinner(player); setRolling(false); setMessage(`${PLAYERS[player].name} wins!`); return;
   }
   setMessage(captured ? `${PLAYERS[player].name} captured a piece!` : `${PLAYERS[player].name} moved ${roll}.`);
   window.setTimeout(() => finishTurn(player, roll, captured), 450);
 }, [finishTurn, roomId, tokens]);

 const rollDice = useCallback((player: PlayerId) => {
   if (roomId) { if (player === mySeatIndex) void supabase.rpc("ludo_roll", { p_room_id: roomId }).then(({ error }) => { if (error) setMessage(error.message); }); return; }
   if (rolling || winner !== null || dice !== null) return;
   setRolling(true); setMessage(`${PLAYERS[player].name} is rolling...`);
   window.setTimeout(() => {
     const roll = Math.floor(Math.random() * 6) + 1;
     const moves = movableTokens(tokens[player], roll);
     setDice(roll);
     if (moves.length === 0) {
       setMessage(`${PLAYERS[player].name} rolled ${roll}. No valid move.`);
       window.setTimeout(() => finishTurn(player, roll, false), 650);
     } else {
       setRolling(false);
       setMessage(player === 0 ? `You rolled ${roll}. Choose a piece.` : `${PLAYERS[player].name} rolled ${roll}.`);
     }
   }, 450);
 }, [dice, finishTurn, mySeatIndex, rolling, roomId, tokens, winner]);

 useEffect(() => {
   if (roomId || current === 0 || winner !== null || dice === null || rolling) return;
   const moves = movableTokens(tokens[current], dice);
   if (moves.length === 0) return;
   const choice = [...moves].sort((a, b) => {
     const aTarget = tokens[current][a] === -1 ? 0 : tokens[current][a] + dice;
     const bTarget = tokens[current][b] === -1 ? 0 : tokens[current][b] + dice;
     const aGlobal = globalTrackIndex(current, aTarget);
     const bGlobal = globalTrackIndex(current, bTarget);
     const canCapture = (target: number | null) => target !== null && ([0,1,2,3] as PlayerId[]).some((p) => p !== current && tokens[p].some((v) => globalTrackIndex(p, v) === target));
     return Number(canCapture(bGlobal)) - Number(canCapture(aGlobal)) || bTarget - aTarget;
   })[0];
   const timer = window.setTimeout(() => movePiece(current, choice, dice), 650);
   return () => window.clearTimeout(timer);
 }, [current, dice, movePiece, rolling, roomId, tokens, winner]);

 if (roomId && !roomReady) return <div className="fixed inset-0 grid place-items-center bg-[#09090b] text-white">Loading shared Ludo board…</div>;

 const piecesAt = (row: number, col: number) => {
   const found: { player: PlayerId; piece: number }[] = [];
   ([0,1,2,3] as PlayerId[]).forEach((player) => tokens[player].forEach((progress, piece) => {
     const point = progress === -1 ? homePositions[player][piece] : tokenPoint(player, progress);
     if (point?.[0] === row && point?.[1] === col) found.push({ player, piece });
   }));
   return found;
 };

 const isTrack = (row: number, col: number) => TRACK.some(([r,c]) => r === row && c === col);
 const pathOwner = (row: number, col: number): PlayerId | -1 =>
   HOME_PATHS.findIndex((path) =>
     path.some(([r,c]) => r === row && c === col)
   ) as PlayerId | -1;

 return (
   <div className="fixed inset-0 z-[100] flex h-[100dvh] min-h-[100svh] flex-col overflow-hidden overscroll-none touch-none bg-[radial-gradient(circle_at_center,#2563a8_0%,#173b73_58%,#10284f_100%)] p-3 text-white select-none">
     <header className="mx-auto grid w-full max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2">
       <div className="justify-self-start">
         {onClose && (
           <button
             type="button"
             onClick={onClose}
             aria-label="Back to Arcade Hub"
             className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-400/30 bg-slate-900/85 text-white shadow-sm transition active:scale-95"
           >
             <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
               <path d="M19 12H5" />
               <path d="m12 19-7-7 7-7" />
             </svg>
           </button>
         )}
       </div>

       <div className="text-center">
         <h1 className="text-xl font-black tracking-wide text-amber-300">LUDO</h1>
         <p className="text-[9px] font-bold uppercase tracking-widest text-cyan-200/70">Classic Race</p>
       </div>

       <div className="flex items-center justify-self-end gap-2">
         <button onClick={reset} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 shadow-lg active:scale-95">New</button>
         <button
           type="button"
           onClick={() => setShowRules(true)}
           aria-label="How to play Ludo"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00] bg-slate-900 text-[#ccff00] shadow-[0_0_12px_rgba(204,255,0,0.25)] active:scale-95"
         >
           <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black">?</span>
         </button>
       </div>
     </header>

     <div className="mx-auto mt-2 grid w-[calc(100%_-_0.75rem)] max-w-md grid-cols-4 gap-1">
       {PLAYERS.map((player, index) => (
         <div
           key={player.name}
           className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-xl border bg-[#202020] px-1 py-1.5 text-center transition ${current === index ? "shadow-lg ring-2" : "opacity-90"}`}
           style={{
             borderColor: player.color,
             boxShadow: current === index ? `0 0 0 2px ${player.color}55, 0 5px 14px rgba(0,0,0,0.28)` : undefined,
             ["--tw-ring-color" as string]: `${player.color}55`,
           }}
         >
           <span className="line-clamp-2 block w-full break-words text-[clamp(6px,1.65vw,8px)] font-black uppercase leading-[1.05]" style={{ color: player.light }}>{playerNames[index]}</span>
           <span className="text-xs font-black">{tokens[index as PlayerId].filter((v) => v === 58).length}/4</span>
         </div>
       ))}
     </div>
     {secondsLeft !== null && <div className="mx-auto mt-2 rounded-full bg-slate-950/70 px-4 py-1 text-xs font-black text-amber-300">⏱ {secondsLeft}s {current === mySeatIndex ? "· Your turn" : `· ${playerNames[current] || "Opponent"}'s turn`}</div>}

     <main className="ludo-board-stage flex min-h-0 flex-1 items-center justify-center overflow-hidden py-3">
       <div className="ludo-board grid shrink-0 grid-cols-[repeat(15,minmax(0,1fr))] grid-rows-[repeat(15,minmax(0,1fr))] overflow-hidden rounded-[1.1rem] border-[7px] border-white bg-white shadow-[0_7px_0_#171717,0_20px_42px_rgba(0,0,0,0.52)] ring-2 ring-black/20">
         {Array.from({ length: 225 }, (_, index) => {
           const row = Math.floor(index / 15), col = index % 15;
           const owner = pathOwner(row, col);
           const pieces = piecesAt(row, col);
           const trackIndex = TRACK.findIndex(([r,c]) => r === row && c === col);
           const safe = isTrack(row,col) && SAFE_GLOBAL.has(trackIndex);
           const startOwner = ([0,1,2,3] as PlayerId[]).find(
             (player) => PLAYERS[player].start === trackIndex
           );
           const entryArrowOwner: PlayerId | null =
             row === 0 && col === 7
               ? 2
               : row === 7 && col === 14
                 ? 3
                 : row === 14 && col === 7
                   ? 0
                   : row === 7 && col === 0
                     ? 1
                     : null;
           const homeOwner = row < 6 && col < 6 ? 1 : row < 6 && col > 8 ? 2 : row > 8 && col > 8 ? 3 : row > 8 && col < 6 ? 0 : -1;
           const inHomeTray = homeOwner !== -1 && (
             (row >= 1 && row <= 4 && col >= 1 && col <= 4) ||
             (row >= 1 && row <= 4 && col >= 10 && col <= 13) ||
             (row >= 10 && row <= 13 && col >= 10 && col <= 13) ||
             (row >= 10 && row <= 13 && col >= 1 && col <= 4)
           );
           const isHomeSlot = homeOwner !== -1 && homePositions[homeOwner as PlayerId].some(
             ([homeRow, homeCol]) => homeRow === row && homeCol === col
           );
           const isTrayAnchor = inHomeTray && (
             (row === 1 && col === 1) ||
             (row === 1 && col === 10) ||
             (row === 10 && col === 1) ||
             (row === 10 && col === 10)
           );
           const inCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;
           const centerColor = !inCenter
             ? null
             : row === 7 && col === 7
               ? "#f7e7c5"
               : col === 6
                 ? PLAYERS[1].color
                 : row === 6
                   ? PLAYERS[2].color
                   : col === 8
                     ? PLAYERS[3].color
                     : PLAYERS[0].color;
           const background = owner !== -1
             ? PLAYERS[owner].color
               : isTrack(row,col)
               ? "#fff8e8"
               : homeOwner !== -1
                 ? inHomeTray
                   ? PLAYERS[homeOwner as PlayerId].light
                   : PLAYERS[homeOwner as PlayerId].color
                 : centerColor ?? "#ffffff";
           return (
             <div
               key={index}
               className={`relative flex aspect-square items-center justify-center ${inHomeTray ? "border border-transparent" : homeOwner !== -1 && !isTrack(row,col) ? "border border-transparent shadow-[inset_0_0_7px_rgba(255,255,255,0.09)]" : "border border-slate-300/90"}`}
               style={{
                 background: startOwner !== undefined ? PLAYERS[startOwner].color : background,
               }}
             >
               {isTrayAnchor && (
                 <span
                   aria-hidden="true"
                   className="pointer-events-none absolute left-[25%] top-[25%] z-[1] h-[350%] w-[350%] rounded-[14%] border-[3px] shadow-[inset_0_0_12px_rgba(255,255,255,0.12),0_3px_6px_rgba(0,0,0,0.22)]"
                   style={{
                     background: "color-mix(in srgb, " + PLAYERS[homeOwner as PlayerId].color + " 88%, #111827)",
                     borderColor: PLAYERS[homeOwner as PlayerId].light,
                   }}
                 />
               )}
               {row === 7 && col === 7 && <span className="absolute text-[10px] text-[#6b4c2a]">◆</span>}
               {safe && startOwner === undefined && <span className="absolute text-[9px] text-slate-400 drop-shadow">★</span>}
               {entryArrowOwner !== null && (
                 <span
                   className="absolute z-[2] flex h-full w-full items-center justify-center text-[clamp(0.8rem,3vw,1.15rem)] font-black leading-none drop-shadow-sm"
                   style={{ color: PLAYERS[entryArrowOwner].color }}
                 >
                   {entryArrowOwner === 0 ? "↑" : entryArrowOwner === 1 ? "→" : entryArrowOwner === 2 ? "↓" : "←"}
                 </span>
               )}
               {isHomeSlot && (
                 <span
                   aria-hidden="true"
                   className="absolute z-[2] h-[68%] w-[68%] rounded-full border shadow-[inset_0_2px_3px_rgba(255,255,255,0.4),0_2px_3px_rgba(0,0,0,0.2)]"
                   style={{
                     background: "color-mix(in srgb, " + PLAYERS[homeOwner as PlayerId].color + " 72%, #0f172a)",
                     borderColor: PLAYERS[homeOwner as PlayerId].light,
                   }}
                 />
               )}
               <div className="relative z-10 flex flex-wrap items-center justify-center gap-[1px]">
                 {pieces.map(({ player, piece }) => {
                   const clickable = player === mySeatIndex && current === mySeatIndex && dice !== null && available.includes(piece);
                   return (
                     <button
                       key={`${player}-${piece}`}
                       aria-label={`${PLAYERS[player].name} pawn ${piece + 1}`}
                       disabled={!clickable}
                       onClick={() => dice !== null && movePiece(mySeatIndex as PlayerId, piece, dice)}
                       className={`ludo-pawn ${tokens[player][piece] === -1 ? "ludo-pawn-home" : ""} ${pieces.length > 1 ? "ludo-pawn-stacked" : ""} ${clickable ? "ludo-pawn-playable" : ""}`}
                       style={{ color: PLAYERS[player].color }}
                     >
                       <PawnIcon />
                     </button>
                   );
                 })}
               </div>
             </div>
           );
         })}
       </div>
     </main>

     <section className="mx-auto flex w-full max-w-md shrink-0 items-center gap-3 rounded-3xl border border-white/10 bg-[#202020] p-3 shadow-xl">
       <button
         type="button"
         disabled={current !== mySeatIndex || rolling || dice !== null || winner !== null}
         onClick={() => rollDice(mySeatIndex as PlayerId)}
         aria-label="Roll dice"
         className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-300/70 bg-amber-400/10 shadow-[0_8px_18px_rgba(0,0,0,0.4)] transition active:translate-y-1 ${current !== mySeatIndex || winner !== null ? "opacity-45" : "opacity-100"} ${rolling ? "ring-4 ring-amber-300/40" : current === mySeatIndex && dice === null && winner === null ? "animate-pulse" : ""}`}
       >
         <RealDice value={dice ?? 6} rolling={rolling} />
       </button>
       <div className="min-w-0 flex-1">
         <p className="text-sm font-black">{message}</p>
         <p className="mt-1 text-[10px] text-cyan-100/60">Roll 6 to leave home · Exact roll to finish</p>
       </div>
     </section>

     {showRules && (
       <div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
         <div role="dialog" aria-modal="true" aria-labelledby="ludo-how-to-play-title" className="max-h-[92%] w-full max-w-md overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-[#ccff00] bg-gradient-to-b from-slate-900 to-slate-950 p-5 text-white shadow-[0_0_35px_rgba(204,255,0,0.18)]">
           <div className="flex items-start justify-between gap-3">
             <div className="flex items-center gap-3">
               <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] text-2xl font-black text-[#ccff00]">?</div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">Ludo</p>
                 <h2 id="ludo-how-to-play-title" className="text-2xl font-black">How to Play</h2>
               </div>
             </div>
             <button type="button" onClick={() => setShowRules(false)} aria-label="Close how to play" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-500 bg-slate-800 text-2xl font-black text-slate-200 transition hover:border-[#ccff00] hover:text-[#ccff00] active:scale-95">×</button>
           </div>

           <div className="mt-5 space-y-3">
             {[
               ["🎲", "1. Roll to begin", "Roll a 6 to move one of your red tokens out of home and onto the track."],
               ["🔴", "2. Move your token", "After rolling, tap a glowing red token. It moves forward by the exact dice value."],
               ["⭐", "3. Use safe squares", "Tokens standing on a star-marked safe square cannot be captured."],
               ["💥", "4. Capture opponents", "Land on an opponent outside a safe square to send that token back home."],
               ["🔁", "5. Earn another roll", "Rolling a 6 or capturing an opponent gives you another turn."],
               ["🏆", "6. Bring all four home", "Move around the board and use an exact roll to finish. The first player to finish all four tokens wins."],
             ].map(([icon, title, description]) => (
               <div key={title} className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-3.5">
                 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xl">{icon}</div>
                 <div>
                   <h3 className="font-black text-amber-300">{title}</h3>
                   <p className="mt-1 text-sm leading-5 text-slate-300">{description}</p>
                 </div>
               </div>
             ))}
           </div>

           <button type="button" onClick={() => setShowRules(false)} className="mt-5 w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 py-3.5 font-black uppercase tracking-wide text-slate-950 shadow-[0_5px_0_#c56b00] transition active:translate-y-1 active:shadow-none">
             Got It — Let&apos;s Play
           </button>
         </div>
       </div>
     )}

     {winner !== null && (
       <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm">
         <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center text-slate-950 shadow-2xl"><div className="text-6xl">🏆</div><h2 className="mt-3 text-3xl font-black">{winner === mySeatIndex ? "You Win!" : `${playerNames[winner]} Wins!`}</h2><p className="mt-2 text-sm text-slate-500">The shared Ludo match is complete.</p><button onClick={onPlayAgain ?? reset} className="mt-6 w-full rounded-2xl bg-emerald-500 py-3 font-black text-white">Play Again</button><button onClick={onClose} className="mt-3 w-full rounded-2xl border border-slate-300 py-3 font-black text-slate-700">Exit to Arcade</button></div>
       </div>
     )}

     <style jsx global>{`
       .ludo-board-stage {
         container-type: size;
       }

       .ludo-board {
         width: min(100cqw, 100cqh, 550px);
         height: min(100cqw, 100cqh, 550px);
       }

       .ludo-pawn {
         position: relative;
         display: block;
         width: clamp(14px, 3.5cqw, 18px);
         height: clamp(19px, 4.8cqw, 25px);
         flex: 0 0 auto;
         filter: drop-shadow(0 2px 1px rgba(0,0,0,0.5));
         transform-origin: 50% 50%;
       }

       .ludo-pawn-home {
         transform: scale(1);
       }

       .ludo-pawn-stacked {
         transform: scale(0.68);
         margin: -3px -2px;
       }

       .ludo-pawn-home.ludo-pawn-stacked {
         transform: scale(0.78);
       }

       @keyframes ludoPawnGlow {
         0%, 100% { filter: drop-shadow(0 2px 1px rgba(0,0,0,0.5)) drop-shadow(0 0 2px #fde047); }
         50% { filter: drop-shadow(0 2px 1px rgba(0,0,0,0.5)) drop-shadow(0 0 5px #facc15); }
       }

       .ludo-pawn-playable {
         animation: ludoPawnGlow 850ms ease-in-out infinite;
         cursor: pointer;
       }

       .ludo-dice-stage {
         position: relative;
         display: block;
         width: 44px;
         height: 44px;
         perspective: 240px;
         transform-style: preserve-3d;
       }

       .ludo-dice-cube {
         position: absolute;
         inset: 0;
         transform-style: preserve-3d;
         transition: transform 180ms cubic-bezier(0.2, 0.8, 0.3, 1);
       }

       .ludo-dice-face {
         position: absolute;
         inset: 0;
         display: block;
         width: 44px;
         height: 44px;
         backface-visibility: hidden;
       }

       @keyframes ludoDiceCubeRoll {
         0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
         22% { transform: rotateX(190deg) rotateY(110deg) rotateZ(45deg); }
         48% { transform: rotateX(390deg) rotateY(310deg) rotateZ(135deg); }
         74% { transform: rotateX(610deg) rotateY(520deg) rotateZ(230deg); }
         100% { transform: rotateX(720deg) rotateY(720deg) rotateZ(360deg); }
       }

       @keyframes ludoDiceBounce {
         0% { transform: translate3d(0, 0, 0) scale(1); }
         24% { transform: translate3d(9px, -15px, 0) scale(1.04); }
         52% { transform: translate3d(-5px, -22px, 0) scale(1.08); }
         76% { transform: translate3d(3px, -5px, 0) scale(0.97); }
         88% { transform: translate3d(-1px, 2px, 0) scale(0.94); }
         100% { transform: translate3d(0, 0, 0) scale(1); }
       }

       .ludo-dice-cube-rolling {
         animation: ludoDiceCubeRoll 450ms cubic-bezier(0.16, 0.8, 0.3, 1) both;
         will-change: transform;
       }

       .ludo-dice-bounce {
         animation: ludoDiceBounce 450ms cubic-bezier(0.18, 0.75, 0.25, 1) both;
         will-change: transform;
       }
     `}</style>
   </div>
 );
}