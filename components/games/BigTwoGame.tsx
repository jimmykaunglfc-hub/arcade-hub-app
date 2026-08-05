"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getRandomBotOpponent } from "@/lib/botUtils";

interface BigTwoGameProps { onClose?: () => void; onPlayAgain?: () => void; roomId?: string | null; }
type Suit = 0 | 1 | 2 | 3;
type Card = { id: string; rank: number; suit: Suit };
type HandType = "single" | "pair" | "triple" | "straight" | "flush" | "full-house" | "four-kind" | "straight-flush";
type HandValue = { type: HandType; count: number; category: number; power: number; label: string };
type Play = { cards: Card[]; value: HandValue; player: number };

const RANKS = ["3","4","5","6","7","8","9","10","J","Q","K","A","2"];
const SUITS = ["♦","♣","♥","♠"];
const SUIT_COLORS = ["text-rose-500","text-slate-800","text-rose-500","text-slate-800"];
const STRAIGHTS = [
 [11,12,0,1,2], [12,0,1,2,3], [0,1,2,3,4], [1,2,3,4,5], [2,3,4,5,6],
 [3,4,5,6,7], [4,5,6,7,8], [5,6,7,8,9], [6,7,8,9,10], [7,8,9,10,11],
];

const shuffledDeck = () => {
 const deck: Card[] = [];
 for (let rank = 0; rank < 13; rank += 1) for (let suit = 0; suit < 4; suit += 1) deck.push({ id:`${rank}-${suit}`, rank, suit:suit as Suit });
 for (let i = deck.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
 return deck;
};

const sortCards = (cards: Card[]) => [...cards].sort((a,b) => a.rank - b.rank || a.suit - b.suit);
const countsByRank = (cards: Card[]) => cards.reduce<Record<number,Card[]>>((map,card) => { (map[card.rank] ??= []).push(card); return map; }, {});
const straightIndex = (cards: Card[]) => {
 const unique = [...new Set(cards.map(card => card.rank))];
 if (unique.length !== 5) return -1;
 return STRAIGHTS.findIndex(sequence => sequence.every(rank => unique.includes(rank)));
};

const evaluate = (cards: Card[]): HandValue | null => {
 const sorted = sortCards(cards);
 const count = sorted.length;
 if (count === 1) return { type:"single", count, category:0, power:sorted[0].rank * 4 + sorted[0].suit, label:"Single" };
 const groups = Object.values(countsByRank(sorted)).sort((a,b) => b.length - a.length || b[0].rank - a[0].rank);
 if (count === 2 && groups.length === 1) return { type:"pair", count, category:0, power:sorted[0].rank * 4 + Math.max(...sorted.map(card=>card.suit)), label:"Pair" };
 if (count === 3 && groups.length === 1) return { type:"triple", count, category:0, power:sorted[0].rank, label:"Triple" };
 if (count !== 5) return null;

 const sequence = straightIndex(sorted);
 const flush = sorted.every(card => card.suit === sorted[0].suit);
 if (sequence >= 0 && flush) return { type:"straight-flush", count, category:5, power:sequence * 4 + Math.max(...sorted.map(card=>card.suit)), label:"Straight Flush" };
 if (groups[0].length === 4) return { type:"four-kind", count, category:4, power:groups[0][0].rank, label:"Four of a Kind" };
 if (groups[0].length === 3 && groups[1]?.length === 2) return { type:"full-house", count, category:3, power:groups[0][0].rank, label:"Full House" };
 if (flush) {
   const ranks = [...sorted].sort((a,b)=>b.rank-a.rank).reduce((value,card)=>value*13+card.rank,0);
   return { type:"flush", count, category:2, power:sorted[0].suit * 400000 + ranks, label:"Flush" };
 }
 if (sequence >= 0) {
   const topRank = STRAIGHTS[sequence][STRAIGHTS[sequence].length-1];
   const topSuit = Math.max(...sorted.filter(card=>card.rank===topRank).map(card=>card.suit));
   return { type:"straight", count, category:1, power:sequence * 4 + topSuit, label:"Straight" };
 }
 return null;
};

const beats = (candidate: HandValue, previous: HandValue | null) => {
 if (!previous) return true;
 if (candidate.count !== previous.count) return false;
 if (candidate.count === 5) return candidate.category > previous.category || (candidate.category === previous.category && candidate.power > previous.power);
 return candidate.type === previous.type && candidate.power > previous.power;
};

const combinations = <T,>(items:T[], size:number):T[][] => {
 const result:T[][]=[];
 const build=(start:number,current:T[])=>{ if(current.length===size){result.push([...current]);return;} for(let i=start;i<=items.length-(size-current.length);i+=1){current.push(items[i]);build(i+1,current);current.pop();} };
 build(0,[]); return result;
};

const legalPlays = (hand:Card[], previous:HandValue|null, mustContainThreeDiamond:boolean) => {
 const sizes = previous ? [previous.count] : [1,2,3,5];
 const plays:{cards:Card[];value:HandValue}[]=[];
 sizes.forEach(size => combinations(hand,size).forEach(cards => {
   if (mustContainThreeDiamond && !cards.some(card=>card.rank===0&&card.suit===0)) return;
   const value=evaluate(cards); if(value&&beats(value,previous)) plays.push({cards,value});
 }));
 return plays.sort((a,b) => previous ? a.value.category-b.value.category || a.value.power-b.value.power : b.cards.length-a.cards.length || a.value.category-b.value.category || a.value.power-b.value.power);
};

const dealGame = () => {
 const deck = shuffledDeck();
 const hands = [0,1,2,3].map(index => sortCards(deck.slice(index * 13, (index + 1) * 13)));
 const starter = hands.findIndex(hand => hand.some(card => card.rank === 0 && card.suit === 0));
 return { hands, starter };
};

function PlayingCard({card,selected,onClick,small=false}:{card:Card;selected?:boolean;onClick?:()=>void;small?:boolean}) {
 return <button type="button" onClick={onClick} className={`${small?"h-16 w-11":"h-24 w-16"} relative shrink-0 rounded-xl border-2 bg-white shadow-lg transition ${selected?"-translate-y-4 border-amber-300 ring-2 ring-amber-300":"border-slate-300"} ${SUIT_COLORS[card.suit]}`}>
   <span className={`${small?"text-xs":"text-base"} absolute left-1.5 top-1 font-black leading-none`}>{RANKS[card.rank]}<span className="block">{SUITS[card.suit]}</span></span>
   <span className={`${small?"text-xl":"text-3xl"} font-black`}>{SUITS[card.suit]}</span>
 </button>;
}

function CardBack({ className = "" }: { className?: string }) {
 return <span className={`block h-12 w-8 shrink-0 rounded-md border-2 border-white bg-rose-600 p-[2px] shadow-md ${className}`}><span className="block h-full w-full rounded-[3px] border border-white/70 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.85)_0_2px,transparent_2px_5px)]" /></span>;
}

export default function BigTwoGame({onClose, onPlayAgain, roomId}:BigTwoGameProps) {
 const [roomReady, setRoomReady] = useState(!roomId);
 const [playerNames, setPlayerNames] = useState(() => ["You", ...Array.from({ length: 3 }, () => getRandomBotOpponent().name)]);
 const [initialGame] = useState(dealGame);
 const [hands,setHands]=useState<Card[][]>(initialGame.hands);
 const [turn,setTurn]=useState(initialGame.starter);
 const [currentPlay,setCurrentPlay]=useState<Play|null>(null);
 const [selected,setSelected]=useState<string[]>([]);
 const [passes,setPasses]=useState(0);
 const [opening,setOpening]=useState(true);
 const [freeLead, setFreeLead] = useState(false);
 const [oneCardCalled, setOneCardCalled] = useState(false);
 const [turnDeadline, setTurnDeadline] = useState<string | null>(null);
 const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
 const [winner,setWinner]=useState<number|null>(null);
 const [winnerName,setWinnerName]=useState<string | null>(null);
 const [viewerWon,setViewerWon]=useState(false);
 const [message,setMessage]=useState(initialGame.starter===0?"You have 3♦. Lead the first trick.":`${playerNames[initialGame.starter]} has 3♦ and starts.`);
 const [showRules,setShowRules]=useState(false);

 useEffect(() => {
   if (!turnDeadline) { setSecondsLeft(null); return; }
   const update = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(turnDeadline).getTime() - Date.now()) / 1000)));
   update();
   const timer = window.setInterval(update, 250);
   return () => window.clearInterval(timer);
 }, [turnDeadline]);

 useEffect(() => {
   if (!roomId) return;
   const timer = window.setInterval(() => { void supabase.rpc("resolve_big_two_bot_turns", { p_room_id: roomId }); }, 1000);
   return () => window.clearInterval(timer);
 }, [roomId]);

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

 useEffect(() => {
   if (!roomId) return;
   const loadRoom = async () => {
     const [{ data: auth }, { data: room }, { data: state }] = await Promise.all([
       supabase.auth.getUser(),
       supabase.rpc("get_matchmaking_room", { p_room_id: roomId }),
       supabase.from("big_two_match_state").select("state,current_seat,status,turn_deadline").eq("room_id", roomId).maybeSingle(),
     ]);
     const seat = (room?.players || []).find((player: any) => player.user_id === auth.user?.id)?.seat;
     if (!seat || !state || (state.status !== "playing" && state.status !== "completed")) return;
     // A bot opening seat must never depend on a particular human device
     // staying on the game screen. The RPC is row-locked and idempotent, so
     // every client may safely nudge it as soon as it observes a bot turn.
     const currentSeatPlayer = (room?.players || []).find((player: any) => player.seat === state.current_seat);
     if (state.status === "playing" && currentSeatPlayer?.is_bot) {
       void supabase.rpc("resolve_big_two_bot_turns", { p_room_id: roomId });
     }
     const { data: hand } = await supabase.from("big_two_player_hands").select("cards").eq("room_id", roomId).eq("seat", seat).maybeSingle();
     if (!hand) return;
     const bySeat = new Map<number, { name?: string }>((room.players || []).map((player: any) => [player.seat, player]));
     const order = [seat, seat % 4 + 1, (seat + 1) % 4 + 1, (seat + 2) % 4 + 1];
     setPlayerNames(order.map((number) => bySeat.get(number)?.name || getRandomBotOpponent().name));
     const counts = state.state?.hand_counts || [13,13,13,13];
     const ownCards = sortCards((hand.cards || []) as Card[]);
     setHands(order.map((number, index) => index === 0 ? ownCards : Array.from({ length: counts[number - 1] || 0 }, (_, card) => ({ id: `back-${number}-${card}`, rank: 0, suit: 0 as Suit }))));
     const tableCards = (state.state?.table_cards || []) as Card[];
     const tableValue = tableCards.length ? evaluate(tableCards) : null;
     const lastSeat = Number(state.state?.last_play_seat || 0);
     const displayTurn = order.indexOf(state.current_seat);
     const displayLastPlayer = order.indexOf(lastSeat);
     setTurn(displayTurn >= 0 ? displayTurn : 0);
     setCurrentPlay(tableValue && displayLastPlayer >= 0 ? { cards: tableCards, value: tableValue, player: displayLastPlayer } : null);
     setFreeLead(Boolean(state.state?.free_lead));
     setOneCardCalled(Number(state.state?.one_card_called_seat || 0) === seat);
     setPasses(Number(state.state?.passes || 0));
     setOpening(Boolean(state.state?.opening_required));
     setTurnDeadline(state.turn_deadline || null);
    // `winner_seat` is authoritative and is written with the final play.  Do
    // not infer a win from the local hand: an older local snapshot can be
    // empty while another player has already completed the shared match.
    const winnerSeat = Number(state.state?.winner_seat || 0);
     const displayWinner = order.indexOf(winnerSeat);
     const winningPlayer = (room.players || []).find((player: any) => player.seat === winnerSeat);
     if (state.status === "completed" && winningPlayer) {
       setWinner(displayWinner >= 0 ? displayWinner : -1);
       setWinnerName(winningPlayer.name || "Player");
       setViewerWon(winningPlayer.user_id === auth.user?.id);
     } else {
       setWinner(null);
       setWinnerName(null);
       setViewerWon(false);
     }
     setMessage(tableCards.length && tableValue && displayLastPlayer >= 0
       ? `${order.map((number) => bySeat.get(number)?.name || "Player")[displayLastPlayer]} played ${tableValue.label}.`
       : displayTurn === 0 ? (state.state?.opening_required ? "Your opening play must include 3♦." : "Your turn. Lead the new trick.") : `${order.map((number) => bySeat.get(number)?.name || "Player")[displayTurn] || "Player"}'s turn.`);
     setRoomReady(true);
   };
   void loadRoom();
   const channel = supabase.channel(`big-two-${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "big_two_match_state", filter: `room_id=eq.${roomId}` }, loadRoom).on("postgres_changes", { event: "*", schema: "public", table: "big_two_player_hands", filter: `room_id=eq.${roomId}` }, loadRoom).subscribe();
   // Polling remains as a reliable fallback when Supabase Realtime has not
   // yet been enabled for these new tables in a production project.
   const poll = window.setInterval(() => { void loadRoom(); }, 1500);
   return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
 }, [roomId]);

 const startGame=useCallback(()=>{ if(roomId) return; const deck=shuffledDeck(); const next=[0,1,2,3].map(i=>sortCards(deck.slice(i*13,(i+1)*13))); const starter=next.findIndex(hand=>hand.some(card=>card.rank===0&&card.suit===0)); setHands(next);setTurn(starter);setCurrentPlay(null);setSelected([]);setPasses(0);setOpening(true);setWinner(null);setMessage(starter===0?"You have 3♦. Lead the first trick.":`${playerNames[starter]} has 3♦ and starts.`); },[playerNames,roomId]);
 const playCards=useCallback((player:number,cards:Card[],value:HandValue)=>{ const nextHands=hands.map(hand=>[...hand]); nextHands[player]=nextHands[player].filter(card=>!cards.some(played=>played.id===card.id)); setHands(nextHands);setSelected([]);setCurrentPlay({cards,value,player});setPasses(0);setOpening(false);setFreeLead(false);setOneCardCalled(false); if(nextHands[player].length===0){setWinner(player);setMessage(player===0?"You win!":`${playerNames[player]} wins!`);return;} setMessage(`${playerNames[player]} played ${value.label}.`);setTurn((player+1)%4); },[hands,playerNames]);

 const passTurn=useCallback((player:number)=>{ if(!currentPlay)return; const nextPasses=passes+1; if(nextPasses>=3){setPasses(0);setFreeLead(true);setTurn(currentPlay.player);setMessage(`${playerNames[currentPlay.player]} controls the new trick.`);}else{setPasses(nextPasses);setTurn((player+1)%4);setMessage(`${playerNames[player]} passed.`);} },[currentPlay,passes,playerNames]);

 // Room-backed matches must never run local AI. A remote move is applied only
 // after it is accepted by the shared match state; otherwise clients diverge.
 useEffect(()=>{ if(roomId || turn===0||winner!==null||hands[turn].length===0)return; const timer=window.setTimeout(()=>{const plays=legalPlays(hands[turn],currentPlay?.value??null,opening); if(plays.length===0){passTurn(turn);return;} const choice=plays[0];playCards(turn,choice.cards,choice.value);},650);return()=>window.clearTimeout(timer);},[currentPlay,hands,opening,passTurn,playCards,roomId,turn,winner]);

 const selectedCards=useMemo(()=>hands[0].filter(card=>selected.includes(card.id)),[hands,selected]);
 const selectedValue=useMemo(()=>evaluate(selectedCards),[selectedCards]);
 const canPlay=turn===0&&!!selectedValue&&beats(selectedValue,freeLead?null:currentPlay?.value??null)&&(!opening||selectedCards.some(card=>card.rank===0&&card.suit===0));
 const handlePlay=()=>{if(!canPlay||!selectedValue){setMessage(opening?"Your opening play must be valid and include 3♦.":"Select a valid hand that beats the table.");return;} if(roomId){void supabase.rpc("big_two_play_cards", { p_room_id: roomId, p_cards: selectedCards }).then(({ error }) => { if(error) setMessage(error.message); else setSelected([]); });return;} playCards(0,selectedCards,selectedValue);};

 if (roomId && !roomReady) return <div className="fixed inset-0 grid place-items-center bg-[#09090b] p-6 text-center text-white"><p className="font-bold">Waiting for the shared Big Two deal…</p></div>;

 return <div className="fixed inset-0 z-[100] flex h-[100dvh] min-h-[100svh] min-h-0 flex-col overflow-hidden overscroll-none touch-none bg-[radial-gradient(circle_at_top,#14532d_0%,#052e2b_48%,#020617_100%)] text-white select-none">
   <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-white/10 bg-slate-950/55 px-3 py-2"><div>{onClose&&<button onClick={onClose} aria-label="Back to Arcade Hub" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-slate-900"><span className="text-xl">←</span></button>}</div><div className="text-center"><h1 className="text-lg font-black text-amber-300">BIG TWO</h1><p className="text-[9px] font-black uppercase tracking-widest text-emerald-200/70">Classic · 4 Players</p></div><div className="flex justify-end gap-2"><button onClick={startGame} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950">New</button><button onClick={()=>setShowRules(true)} aria-label="How to play Big Two" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00] bg-slate-900 text-[#ccff00]"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black">?</span></button></div></header>

   <main className="min-h-0 flex-1 p-2">
     <div className="relative mx-auto h-full w-full max-w-md overflow-hidden rounded-[2.2rem] border-4 border-emerald-300/25 bg-[radial-gradient(ellipse_at_center,#087443_0%,#075b37_52%,#06452e_100%)] shadow-[inset_0_0_45px_rgba(0,0,0,.35),0_18px_35px_rgba(0,0,0,.45)]">
       <div className={`absolute left-1/2 top-2 z-10 -translate-x-1/2 text-center ${turn===2?"drop-shadow-[0_0_8px_#fde047]":""}`}>
         <div className="flex justify-center -space-x-5">{hands[2].map(card=><CardBack key={card.id}/>)}</div>
         <p className={`mt-1 text-[9px] font-black uppercase ${turn===2?"text-amber-300":"text-emerald-100"}`}>{playerNames[2]} · {hands[2].length}</p>
       </div>

       <div className={`absolute left-2 top-[27%] z-10 w-12 ${turn===1?"drop-shadow-[0_0_8px_#fde047]":""}`}>
         <p className={`absolute -top-5 left-0 w-36 whitespace-nowrap text-left text-[9px] font-black uppercase ${turn===1?"text-amber-300":"text-emerald-100"}`}>{playerNames[1]} · {hands[1].length}</p>
         <div className="flex flex-col items-start -space-y-9">{hands[1].map(card=><CardBack key={card.id} className="rotate-90"/>)}</div>
       </div>

       <div className={`absolute right-2 top-[27%] z-10 w-12 ${turn===3?"drop-shadow-[0_0_8px_#fde047]":""}`}>
         <p className={`absolute -top-5 right-0 w-40 whitespace-nowrap text-right text-[9px] font-black uppercase ${turn===3?"text-amber-300":"text-emerald-100"}`}>{playerNames[3]} · {hands[3].length}</p>
         <div className="flex flex-col items-end -space-y-9">{hands[3].map(card=><CardBack key={card.id} className="rotate-90"/>)}</div>
       </div>

       {secondsLeft !== null && <div className={`absolute left-1/2 top-[22%] z-20 -translate-x-1/2 rounded-full border px-4 py-1 text-sm font-black ${turn===0 ? "border-amber-200 bg-amber-300 text-emerald-950" : "border-white/20 bg-slate-950/70 text-amber-200"}`}>⏱ {secondsLeft}s</div>}
       <section className="absolute left-24 right-24 top-[29%] flex min-h-40 flex-col items-center justify-center rounded-[1.75rem] border border-emerald-200/15 bg-emerald-950/25 p-2">
         <p className="mb-2 text-center text-[10px] font-black uppercase tracking-widest text-amber-200">{currentPlay ? `${playerNames[currentPlay.player]} · ${currentPlay.value.label}${freeLead ? " · Free lead" : ""}` : "New trick — any valid combination"}</p>
         <div className="flex justify-center -space-x-4">{currentPlay?.cards.map(card=><PlayingCard key={card.id} card={card} small />)??<span className="text-5xl text-white/15">♠</span>}</div>
       </section>

       <div className="absolute bottom-[214px] left-16 right-16 rounded-full border border-white/10 bg-slate-950/55 px-3 py-2 text-center text-[10px] font-bold text-slate-100 shadow-lg">{message}</div>

       <button onClick={()=>{if(roomId){void supabase.rpc("big_two_pass",{p_room_id:roomId}).then(({error})=>{if(error)setMessage(error.message);});}else passTurn(0);}} disabled={turn!==0||!currentPlay||freeLead||winner!==null} className="absolute bottom-[148px] left-4 z-30 flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-200 bg-gradient-to-b from-amber-300 to-amber-500 text-xs font-black text-amber-950 shadow-[0_6px_0_#9a5c00] active:translate-y-1 disabled:opacity-30">PASS</button>
       <button onClick={handlePlay} disabled={turn!==0||winner!==null} className={`absolute bottom-[148px] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full border-2 text-xs font-black shadow-[0_6px_0_#14532d] active:translate-y-1 disabled:opacity-35 ${canPlay?"border-lime-200 bg-[#ccff00] text-slate-950":"border-slate-400 bg-slate-600 text-slate-200"}`}>PLAY</button>
       {hands[0].length === 1 && !oneCardCalled && winner===null && <button onClick={()=>{setOneCardCalled(true);setMessage("You called 1 Card!");if(roomId){void supabase.rpc("big_two_call_one",{p_room_id:roomId}).then(({error})=>{if(error){setOneCardCalled(false);setMessage(error.message);}});}}} className="absolute bottom-[148px] left-1/2 z-30 -translate-x-1/2 rounded-full border border-red-200 bg-red-600 px-3 py-2 text-[10px] font-black text-white shadow-lg">CALL 1 CARD</button>}
       {hands[0].length === 1 && oneCardCalled && winner===null && <div className="absolute bottom-[154px] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-lime-200 bg-lime-400 px-3 py-2 text-[10px] font-black text-slate-950 shadow-lg">✓ 1 CARD CALLED</div>}

       <div className={`absolute bottom-0 left-0 right-0 z-20 ${turn===0?"drop-shadow-[0_0_8px_rgba(253,224,71,.5)]":""}`}>
         <div className="flex items-center justify-between px-4"><span className={`text-[10px] font-black uppercase ${turn===0?"text-amber-300":"text-cyan-200"}`}>Your hand · {hands[0].length}</span><span className="text-[9px] text-emerald-100">{selectedValue?.label??"Tap cards to select"}</span></div>
         <div className="flex h-28 items-end justify-center overflow-visible px-2 pt-5">{hands[0].map((card,index)=><div key={card.id} className={index?"-ml-6":""}><PlayingCard card={card} small selected={selected.includes(card.id)} onClick={()=>turn===0&&setSelected(ids=>ids.includes(card.id)?ids.filter(id=>id!==card.id):[...ids,card.id])}/></div>)}</div>
       </div>
     </div>
   </main>

   {showRules&&<div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/88 p-4 backdrop-blur-md"><div className="max-h-[92%] w-full max-w-md overflow-y-auto rounded-[2rem] border-2 border-[#ccff00] bg-slate-900 p-5"><div className="flex justify-between"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#ccff00]">Classic Big Two</p><h2 className="text-2xl font-black">How to Play</h2></div><button onClick={()=>setShowRules(false)} className="h-10 w-10 rounded-full bg-slate-800 text-2xl">×</button></div><div className="mt-5 space-y-3">{[["🃏","Card order","3 is lowest and 2 is highest. Suits are ♦, ♣, ♥, ♠ from low to high."],["♦","Opening play","The player holding 3♦ starts and must include it in the first play."],["✋","Valid plays","Play a single, pair, triple, or five cards: straight, flush, full house, four of a kind plus one, or straight flush."],["⬆️","Beat the table","Match the number of cards. Five-card hands rank: straight, flush, full house, four of a kind, straight flush."],["⏭️","Pass and reset","You may pass. After all three opponents pass, the last player starts a new trick with any valid play."],["🏆","Empty your hand","The first player to play all 13 cards wins."]].map(([icon,title,text])=><div key={title} className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-800 p-3"><span className="text-xl">{icon}</span><div><h3 className="font-black text-amber-300">{title}</h3><p className="text-xs leading-5 text-slate-300">{text}</p></div></div>)}</div><button onClick={()=>setShowRules(false)} className="mt-5 w-full rounded-2xl bg-amber-400 py-3 font-black text-slate-950">Got It — Let&apos;s Play</button></div></div>}
   {winner!==null&&<div className="absolute inset-0 z-[260] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-sm"><div className="w-full max-w-sm overflow-hidden rounded-[2rem] border-2 border-amber-300 bg-slate-900 text-center shadow-2xl"><div className="bg-[radial-gradient(circle_at_center,#fbbf24_0%,#92400e_45%,#111827_78%)] px-7 pb-6 pt-8"><div className="text-7xl drop-shadow-xl">{viewerWon || (!roomId && winner===0)?"🏆":"🎮"}</div><p className="mt-3 text-xs font-black uppercase tracking-[.25em] text-amber-100">Big Two complete</p><h2 className="mt-2 text-3xl font-black text-white">{viewerWon || (!roomId && winner===0)?"You Win!":`${winnerName || playerNames[winner] || "Player"} Wins`}</h2><p className="mt-2 text-sm text-amber-100/90">{viewerWon || (!roomId && winner===0)?"Excellent play — you cleared your hand first.":"The match has ended. Ready for another round?"}</p></div><div className="space-y-3 p-5"><button onClick={onPlayAgain ?? startGame} className="w-full rounded-2xl bg-amber-400 py-3 font-black text-slate-950">Play Again</button><button onClick={onClose} className="w-full rounded-2xl border border-slate-600 bg-slate-800 py-3 font-black text-white">Exit to Arcade</button></div></div></div>}
 </div>;
}
