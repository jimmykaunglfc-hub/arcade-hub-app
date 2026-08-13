"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Card = { rank: number; suit: string };
type Seat = { seat: number; name: string; is_bot: boolean };
type Hand = Card[];

type Evaluation = { score: number; tier: number; multiplier: number; label: string; natural: boolean };

const SUITS = ["♠", "♥", "♦", "♣"];
const suitColor = (suit: string) => (suit === "♥" || suit === "♦" ? "text-rose-600" : "text-slate-900");
const cardRank = (rank: number) => (rank === 1 ? "A" : rank === 11 ? "J" : rank === 12 ? "Q" : rank === 13 ? "K" : String(rank));
const buildDeck = () => {
  const deck = Array.from({ length: 52 }, (_, index) => ({ rank: (index % 13) + 1, suit: SUITS[Math.floor(index / 13)] }));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
};
// Shan Koe Mee counts A as one and 10/J/Q/K as zero, rather than ten.
const point = (hand: Hand) => hand.reduce((sum, card) => sum + (card.rank >= 10 ? 0 : card.rank), 0) % 10;
const isStraight = (hand: Hand) => hand.length === 3 && [...hand].map((card) => card.rank).sort((a, b) => a - b).every((rank, index, ranks) => index === 0 || rank === ranks[index - 1] + 1);
const evaluation = (hand: Hand): Evaluation => {
  const score = point(hand);
  if (hand.length === 2 && (score === 8 || score === 9)) return { score, tier: score === 9 ? 4 : 5, multiplier: 2, label: `Shan ${score}`, natural: true };
  if (hand.length === 3) {
    const ranks = hand.map((card) => card.rank);
    const flush = hand.every((card) => card.suit === hand[0].suit);
    if (ranks.every((rank) => rank === ranks[0])) return { score, tier: 1, multiplier: 5, label: "Three of a kind", natural: false };
    if (isStraight(hand) && flush) return { score, tier: 2, multiplier: 5, label: "Straight flush", natural: false };
    if (isStraight(hand) || flush || ranks.every((rank) => rank >= 11)) return { score, tier: 3, multiplier: 3, label: isStraight(hand) ? "Straight" : flush ? "Three flush" : "Three face cards", natural: false };
  }
  if (hand.length === 2 && (hand[0].rank === hand[1].rank || hand[0].suit === hand[1].suit)) return { score, tier: 6, multiplier: 2, label: `${score} points · ${hand[0].rank === hand[1].rank ? "Pair" : "Double suit"}`, natural: false };
  return { score, tier: 6, multiplier: 1, label: score === 0 ? "Boo" : `${score} points`, natural: false };
};
const label = (hand: Hand) => evaluation(hand).label;
const compareHands = (player: Hand, banker: Hand) => {
  const p = evaluation(player), b = evaluation(banker);
  if (p.tier !== b.tier) return p.tier < b.tier ? 1 : -1;
  if (p.score !== b.score) return p.score > b.score ? 1 : -1;
  return Math.max(...player.map((card) => card.rank)) === Math.max(...banker.map((card) => card.rank)) ? 0 : Math.max(...player.map((card) => card.rank)) > Math.max(...banker.map((card) => card.rank)) ? 1 : -1;
};

function PlayingCard({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  return <div className={`grid h-16 w-11 place-items-center rounded-lg border text-lg font-black shadow-md sm:h-20 sm:w-14 ${hidden || !card ? "border-lime-200 bg-[repeating-linear-gradient(45deg,#99cc00,#99cc00_5px,#ccff00_5px,#ccff00_10px)] text-transparent" : `border-slate-300 bg-white ${suitColor(card.suit)}`}`}>
    {!hidden && card && <span>{cardRank(card.rank)}{card.suit}</span>}
  </div>;
}

export default function ShanKoeMeeGame({ roomId, onClose, onPlayAgain }: { roomId?: string | null; onClose?: () => void; onPlayAgain?: () => void }) {
  const [seats, setSeats] = useState<Seat[]>([{ seat: 1, name: "You", is_bot: false }, { seat: 2, name: "Emerald", is_bot: true }, { seat: 3, name: "Golden", is_bot: true }, { seat: 4, name: "Ruby", is_bot: true }]);
  const [mySeat, setMySeat] = useState(1);
  const [deck, setDeck] = useState<Card[]>([]);
  const [hands, setHands] = useState<Record<number, Hand>>({ 1: [], 2: [], 3: [], 4: [] });
  const [banker, setBanker] = useState(1);
  const [bet, setBet] = useState(100);
  const [phase, setPhase] = useState<"banker" | "betting" | "choice" | "result">("banker");
  const [message, setMessage] = useState("Banker selection: highest card wins the first five-round table.");
  const [revealed, setRevealed] = useState(false);
  const [round, setRound] = useState(1);
  const [chips, setChips] = useState<Record<number, number>>({ 1: 1000, 2: 1000, 3: 1000, 4: 1000 });
  const [bankerDraw, setBankerDraw] = useState<Record<number, Card>>({} as Record<number, Card>);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(10);
  const [language, setLanguage] = useState<"en" | "my">("en");

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    const loadSeats = async () => {
      const [{ data: auth }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("get_matchmaking_room", { p_room_id: roomId }),
      ]);
      if (!mounted || !data) return;
      const players = (data.players || []) as Array<{ seat: number; name: string; is_bot: boolean; user_id?: string | null }>;
      if (players.length) {
        setSeats(players.map((player) => ({ seat: player.seat, name: player.name || `Player ${player.seat}`, is_bot: player.is_bot })));
        const mine = players.find((player) => player.user_id === auth.user?.id);
        if (mine) setMySeat(mine.seat);
      }
      void supabase.rpc("heartbeat_matchmaking_room", { p_room_id: roomId });
      void supabase.rpc("replace_expired_four_player_seats", { p_room_id: roomId });
    };
    void loadSeats();
    const timer = window.setInterval(loadSeats, 10_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [roomId]);

  const orderedSeats = useMemo(() => [...seats].sort((a, b) => a.seat - b.seat), [seats]);
  useEffect(() => {
    if (phase !== "banker") return;
    setSecondsLeft(10);
    const selectionDeck = buildDeck();
    const draw = Object.fromEntries(orderedSeats.map((seat) => [seat.seat, selectionDeck.pop()!])) as Record<number, Card>;
    setBankerDraw(draw);
    const timer = window.setInterval(() => setSecondsLeft((left) => left === null ? null : Math.max(0, left - 1)), 1000);
    const finish = window.setTimeout(() => {
      const winner = orderedSeats.reduce((best, seat) => !best || draw[seat.seat].rank > draw[best].rank ? seat.seat : best, 0);
      setBanker(winner); setPhase("betting"); setMessage(`${seats.find((seat) => seat.seat === winner)?.name || "Player"} is the banker for the next five rounds.`); setSecondsLeft(null);
    }, 10_000);
    return () => { window.clearInterval(timer); window.clearTimeout(finish); };
  }, [orderedSeats, phase, seats]);
  const deal = () => {
    const nextDeck = buildDeck();
    const nextHands: Record<number, Hand> = { 1: [], 2: [], 3: [], 4: [] };
    orderedSeats.forEach((seat) => { nextHands[seat.seat] = [nextDeck.pop()!, nextDeck.pop()!]; });
    setDeck(nextDeck);
    setHands(nextHands);
    setRevealed(false);
    setPhase("choice");
    setSecondsLeft(15);
    setMessage(evaluation(nextHands[mySeat]).natural ? "Natural Shan hand — showdown is ready." : "Squeeze your cards, then draw or stay within 15 seconds.");
  };
  const finish = (updatedHands: Record<number, Hand>) => {
    const result = compareHands(updatedHands[mySeat], updatedHands[banker]);
    const winAmount = bet * (result > 0 ? evaluation(updatedHands[mySeat]).multiplier : evaluation(updatedHands[banker]).multiplier);
    const outcome = result > 0 ? `You win ${winAmount} table chips` : result < 0 ? `Banker wins ${winAmount} table chips` : "Push — stake returned";
    setChips((current) => result === 0 ? current : { ...current, [mySeat]: Math.max(0, current[mySeat] + (result > 0 ? winAmount : -winAmount)), [banker]: Math.max(0, current[banker] + (result > 0 ? -winAmount : winAmount)) });
    setSecondsLeft(null); setHands(updatedHands); setRevealed(true); setPhase("result"); setMessage(`${outcome}. Banker: ${label(updatedHands[banker])}.`);
  };
  const stay = () => {
    const nextHands = { ...hands };
    orderedSeats.filter((seat) => seat.seat !== banker && seat.seat !== mySeat && point(nextHands[seat.seat]) <= 5).forEach((seat) => { nextHands[seat.seat] = [...nextHands[seat.seat], deck.pop()!]; });
    if (point(nextHands[banker]) <= 5) nextHands[banker] = [...nextHands[banker], deck.pop()!];
    setDeck([...deck]); finish(nextHands);
  };
  const draw = () => { const nextHands = { ...hands, [mySeat]: [...hands[mySeat], deck.pop()!] }; setDeck([...deck]); finish(nextHands); };
  const nextRound = () => { setRound((value) => value + 1); setPhase(round % 5 === 0 ? "banker" : "betting"); setMessage(round % 5 === 0 ? "Banker selection: highest card wins the five-round table." : "Choose your stake, then deal the cards."); setHands({ 1: [], 2: [], 3: [], 4: [] }); setRevealed(false); };
  useEffect(() => {
    if (phase !== "choice" || secondsLeft === null) return;
    if (secondsLeft === 0) { stay(); return; }
    const timer = window.setTimeout(() => setSecondsLeft((left) => left === null ? null : left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, secondsLeft]);

  const position = (seat: number) => seat === mySeat ? "bottom-4 left-1/2 -translate-x-1/2" : seat === banker ? "top-3 left-1/2 -translate-x-1/2" : seat % 2 ? "left-3 top-1/2 -translate-y-1/2" : "right-3 top-1/2 -translate-y-1/2";
  return <section className="fixed inset-0 z-[100] min-h-[100dvh] overflow-hidden bg-[#041208] pt-[var(--app-safe-top)] text-white">
    <header className="relative z-20 flex h-14 items-center justify-between border-b border-amber-300/25 bg-slate-950/90 px-3 backdrop-blur"><button onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/10" aria-label="Back to arcade">←</button><div className="text-center"><h1 className="text-sm font-black text-amber-300">{language === "en" ? "ရှမ်းကိုးမီး · Shan Koe Mee" : "ရှမ်းကိုးမီး"}</h1><p className="text-[9px] font-bold uppercase tracking-widest text-emerald-200/70">Four-player traditional table · Round {round}</p></div><button onClick={() => setLanguage((value) => value === "en" ? "my" : "en")} className="rounded-lg border border-amber-300/30 px-2 py-1 text-[10px] font-black text-amber-200">{language === "en" ? "မြန်မာ" : "EN"}</button></header>
    <main className="relative mx-auto h-[calc(100dvh-3.5rem-var(--app-safe-top))] max-w-4xl p-3"><div className="relative h-full overflow-hidden rounded-[42px] border-[7px] border-[#251406] bg-[radial-gradient(circle_at_center,#168144_0%,#0b542c_58%,#042d17_100%)] shadow-[inset_0_0_90px_rgba(0,0,0,.85)]"><div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-2xl font-black tracking-[.35em] text-white/[.055]">SHAN KOE MEE<br/><span className="text-xs">4 PLAYER TABLE</span></div>
      {orderedSeats.map((seat) => <div key={seat.seat} className={`absolute z-10 flex flex-col items-center ${position(seat.seat)}`}><div className={`mb-1 rounded-full px-2 py-1 text-[10px] font-black ${seat.seat === banker ? "bg-amber-400 text-slate-950" : "bg-slate-950/85 text-white"}`}>{seat.seat === banker ? "👑 Banker · " : ""}{seat.seat === mySeat ? "You" : seat.name} · {chips[seat.seat] ?? 1000}</div><div className="flex -space-x-2">{hands[seat.seat].length ? hands[seat.seat].map((card, index) => <PlayingCard key={`${card.rank}-${card.suit}-${index}`} card={card} hidden={seat.seat !== mySeat && !revealed} />) : <><PlayingCard hidden /><PlayingCard hidden /></>}</div>{(seat.seat === mySeat || revealed) && hands[seat.seat].length > 0 && <span className="mt-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold text-amber-100">{label(hands[seat.seat])}</span>}</div>)}
      <div className="absolute left-1/2 top-1/2 z-10 w-[min(88%,360px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-amber-200/25 bg-slate-950/85 p-4 text-center shadow-2xl"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ccff00]">Traditional table</p><p className="mt-2 text-sm font-bold text-white">{message}</p>{secondsLeft !== null && <p className="mt-2 text-xs font-black text-amber-300">Auto action in {secondsLeft}s</p>}{phase === "banker" && <div className="mt-4 grid grid-cols-4 gap-2">{orderedSeats.map((seat) => <div key={seat.seat} className="text-center"><PlayingCard card={bankerDraw[seat.seat]} /><span className="mt-1 block text-[9px]">{seat.seat === mySeat ? "You" : seat.name}</span></div>)}</div>}{phase === "betting" && <><div className="mt-4 flex justify-center gap-2">{[50,100,300].map((amount) => <button key={amount} onClick={() => setBet(amount)} className={`rounded-full px-4 py-2 text-xs font-black ${bet === amount ? "bg-[#ccff00] text-black" : "bg-white/10 text-white"}`}>{amount}</button>)}</div><button onClick={deal} className="mt-4 w-full rounded-2xl bg-amber-400 py-3 text-sm font-black text-slate-950">Deal cards</button></>}{phase === "choice" && <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={draw} className="rounded-2xl bg-[#ccff00] py-3 text-sm font-black text-black">Draw card</button><button onClick={stay} className="rounded-2xl bg-white/10 py-3 text-sm font-black">Stay</button></div>}{phase === "result" && <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={nextRound} className="rounded-2xl bg-[#ccff00] py-3 text-sm font-black text-black">Next round</button><button onClick={onPlayAgain ?? onClose} className="rounded-2xl bg-white/10 py-3 text-sm font-black">Exit table</button></div>}</div>
    </div></main>
  </section>;
}
