import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// --- CORS Configuration ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Big Two Core Types & Constants ---
type Suit = 0 | 1 | 2 | 3;
type Card = { id: string; rank: number; suit: Suit };
type HandType = "single" | "pair" | "triple" | "straight" | "flush" | "full-house" | "four-kind" | "straight-flush";
type HandValue = { type: HandType; count: number; category: number; power: number; label: string };

const STRAIGHTS = [
  [11,12,0,1,2], [12,0,1,2,3], [0,1,2,3,4], [1,2,3,4,5], [2,3,4,5,6],
  [3,4,5,6,7], [4,5,6,7,8], [5,6,7,8,9], [6,7,8,9,10], [7,8,9,10,11],
];

// --- Big Two Engine Logic ---
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

// --- Smart Bot Brain ---
const getSmartBotPlay = (hand: Card[], previous: HandValue | null, mustContainThreeDiamond: boolean): Card[] | null => {
  const plays = legalPlays(hand, previous, mustContainThreeDiamond);
  if (plays.length === 0) return null;

  const counts = countsByRank(hand);
  const all5CardPlays = legalPlays(hand, null, false).filter(p => p.cards.length === 5);
  const safe5CardIds = new Set(all5CardPlays.flatMap(p => p.cards.map(c => c.id)));

  const scoredPlays = plays.map(({ cards, value }) => {
    let penalty = 0;
    if (cards.length < 5) {
      cards.forEach(card => {
        if (safe5CardIds.has(card.id)) penalty += 2000;
        const groupSize = counts[card.rank]?.length || 1;
        if (groupSize > cards.length) penalty += (groupSize - cards.length) * 500;
        if (previous && card.rank >= 8) penalty += card.rank * 50; 
      });
    }
    return { cards, value, penalty, score: value.power + penalty };
  });

  scoredPlays.sort((a, b) => a.score - b.score);
  const bestOption = scoredPlays[0];

  if (previous && bestOption.penalty >= 2000 && hand.length > 5) return null;
  if (previous && bestOption.penalty >= 500 && hand.length > 3) return null;

  if (!previous) {
    const fives = scoredPlays.filter(p => p.cards.length === 5);
    if (fives.length > 0) return fives[0].cards;
    const pairs = scoredPlays.filter(p => p.cards.length === 2 && p.penalty < 1000);
    if (pairs.length > 0) return pairs[0].cards;
  }

  return bestOption.cards;
};

// --- Edge Function Handler ---
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { roomId } = await req.json();
    if (!roomId) throw new Error('roomId is required');

    // Create a Supabase client with the Service Role Key to bypass RLS and act as the system
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch the match state
    const { data: matchData, error: matchError } = await supabase
      .from('big_two_match_state')
      .select('state, current_seat')
      .eq('room_id', roomId)
      .single();

    if (matchError || !matchData) throw new Error("Match not found");

    const state = matchData.state as any;
    const currentSeat = matchData.current_seat;

    // Check if the current seat is actually a bot (optional extra security check)
    // 2. Fetch the bot's hidden hand
    const { data: handData, error: handError } = await supabase
      .from('big_two_player_hands')
      .select('cards')
      .eq('room_id', roomId)
      .eq('seat', currentSeat)
      .single();

    if (handError || !handData) throw new Error("Bot hand not found");

    const botHand = handData.cards as Card[];
    
    // 3. Parse Table State
    const tableCards = (state.table_cards || []) as Card[];
    const tableValue = tableCards.length ? evaluate(tableCards) : null;
    const freeLead = Boolean(state.free_lead);
    const openingRequired = Boolean(state.opening_required);
    const previousValue = freeLead ? null : tableValue;

    // 4. Run the Smart Brain
    const smartCards = getSmartBotPlay(botHand, previousValue, openingRequired);

    // 5. Execute the move using the Postgres RPCs
    if (!smartCards) {
      // Pass Turn
      await supabase.rpc('big_two_pass', { p_room_id: roomId });
    } else {
      // Play Cards
      await supabase.rpc('big_two_play_cards', { p_room_id: roomId, p_cards: smartCards, p_force_seat: currentSeat });
      // NOTE: You may need to modify your SQL RPC 'big_two_play_cards' to accept an optional 'p_force_seat' 
      // parameter so the Edge Function can declare WHICH seat is playing the cards, 
      // instead of relying on auth.uid().
    }

    return new Response(JSON.stringify({ success: true, played: smartCards }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});