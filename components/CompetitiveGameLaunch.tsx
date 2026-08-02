"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { supabase } from "@/lib/supabaseClient";
import { processGameEntry, recordMatchResult } from "@/lib/matchManager";
import MatchmakingModal from "@/components/MatchmakingModal";

type Result = "Win" | "Loss" | "Draw";
type GameProps = { onClose?: () => void; onResult?: (result: Result) => void };

export default function CompetitiveGameLaunch({ gameKey, gameTitle, Game, onClose }: { gameKey: string; gameTitle: string; Game: ComponentType<GameProps>; onClose: () => void }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ name: string; isBot: boolean } | null>(null);
  const [status, setStatus] = useState("Preparing match…");
  const [matchError, setMatchError] = useState<string | null>(null);
  const entryFee = useRef(0);
  const reported = useRef(false);
  useEffect(() => { void (async () => {
    const [{ data: auth }, { data: game }] = await Promise.all([supabase.auth.getUser(), supabase.from("games").select("entry_fee").ilike("title", gameTitle).maybeSingle()]);
    entryFee.current = Number(game?.entry_fee ?? 0);
    if (!auth.user) { setStatus("Sign in to play online."); return; }
    setUserId(auth.user.id);
  })(); }, [gameTitle]);
  const startMatch = async (match: { opponent: { name: string; isBot: boolean } }) => {
    setStatus("Securing your match…");
    const entry = await processGameEntry({ gameTitle, entryFee: entryFee.current, opponentName: match.opponent.name });
    if (!entry.success) { setMatchError(entry.error === "INSUFFICIENT_POINTS" ? "Not enough points for this match." : entry.error || "Could not start match."); return; }
    setOpponent(match.opponent);
  };
  const reportResult = async (result: Result) => {
    if (reported.current) return;
    reported.current = true;
    await recordMatchResult({ game_id: gameKey, game_title: gameTitle, opponent_name: opponent?.name || "Arena Opponent", result, points_change: result === "Win" ? entryFee.current * 2 : 0 });
  };
  if (opponent) return <Game onClose={onClose} onResult={reportResult} />;
  if (matchError) return <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center text-on-background"><div><p className="font-bold">{matchError}</p><button onClick={onClose} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-on-primary">Back to arcade</button></div></div>;
  if (userId) return <MatchmakingModal gameKey={gameKey} gameName={gameTitle} userId={userId} onMatchFound={(match) => void startMatch(match)} onCancel={onClose} />;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center text-on-background"><div><p className="font-bold">{status}</p><button onClick={onClose} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-on-primary">Back to arcade</button></div></div>;
}
