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
  const [mode, setMode] = useState<"menu" | "online" | "host" | "local">("menu");
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
  const startLocal = () => {
    reported.current = true; // pass-and-play and host sessions do not award online currency.
    setOpponent({ name: mode === "host" ? "Guest Player" : "Player 2", isBot: false });
  };
  const reportResult = async (result: Result) => {
    if (reported.current) return;
    reported.current = true;
    await recordMatchResult({ game_id: gameKey, game_title: gameTitle, opponent_name: opponent?.name || "Arena Opponent", result, points_change: result === "Win" ? entryFee.current * 2 : 0 });
  };
  if (opponent) return <Game onClose={onClose} onResult={reportResult} />;
  if (matchError) return <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center text-on-background"><div><p className="font-bold">{matchError}</p><button onClick={onClose} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-on-primary">Back to arcade</button></div></div>;
  if (mode === "online" && userId) return <MatchmakingModal gameKey={gameKey} gameName={gameTitle} userId={userId} fallbackAfterMs={20000} onMatchFound={(match) => void startMatch(match)} onCancel={() => setMode("menu")} />;
  if (mode === "host") return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#09090b] p-6 text-center text-white"><div className="w-full max-w-sm rounded-[32px] border border-white/10 bg-[#18181b] p-7"><p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Share this room code</p><p className="my-5 font-mono text-4xl font-black tracking-[0.2em] text-[#CCFF00]">{gameKey.slice(0, 3).toUpperCase()}-{String(Date.now()).slice(-4)}</p><p className="text-xs text-neutral-400">Host mode is ready for players on this device.</p><button onClick={startLocal} className="mt-6 w-full rounded-2xl bg-[#CCFF00] py-3 text-xs font-black uppercase tracking-wider text-black">Start host game</button><button onClick={() => setMode("menu")} className="mt-4 text-xs font-bold text-neutral-400">Back</button></div></div>;
  if (mode === "local") return <Game onClose={onClose} onResult={() => undefined} />;
  if (mode === "menu") return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#09090b] px-6 text-white"><div className="w-full max-w-[360px] overflow-hidden rounded-[32px] border border-white/5 bg-[#18181b] p-6 shadow-2xl"><div className="mb-8 flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><span className="material-symbols-outlined text-2xl text-neutral-300">sports_esports</span></div><div><h1 className="font-headline text-xl font-black">{gameTitle}</h1><p className="mt-0.5 text-xs font-medium text-neutral-400">Select engagement mode</p></div></div><button onClick={() => userId ? setMode("online") : setStatus("Sign in to play online.")} className="mb-4 w-full rounded-[24px] border border-white/10 bg-[#09090b] p-5 text-left transition hover:border-[#CCFF00]/50"><h3 className="font-headline text-lg font-black">Find Online Match</h3><p className="mt-1 text-xs text-neutral-400">Global matchmaking · bot after 20 seconds</p></button><div className="grid grid-cols-2 gap-4"><button onClick={() => setMode("host")} className="min-h-[130px] rounded-[24px] border border-white/10 bg-[#09090b] p-4 text-left"><h3 className="font-headline text-sm font-bold">Host Play</h3><p className="mt-1 text-[10px] text-neutral-400">Create room code</p></button><button onClick={() => setMode("local")} className="min-h-[130px] rounded-[24px] border border-white/10 bg-[#09090b] p-4 text-left"><h3 className="font-headline text-sm font-bold">Pass & Play</h3><p className="mt-1 text-[10px] text-neutral-400">Local device</p></button></div><button onClick={onClose} className="mt-6 w-full text-[10px] font-bold tracking-widest text-neutral-500">EXIT ARENA</button></div></div>;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center text-on-background"><div><p className="font-bold">{status}</p><button onClick={onClose} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-on-primary">Back to arcade</button></div></div>;
}
