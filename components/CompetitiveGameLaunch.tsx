"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { supabase } from "@/lib/supabaseClient";
import { processGameEntry, recordMatchResult } from "@/lib/matchManager";
import MatchmakingModal from "@/components/MatchmakingModal";
import GameEngagementMenu from "@/components/GameEngagementMenu";

type Result = "Win" | "Loss" | "Draw";
type GameProps = { onClose?: () => void; onResult?: (result: Result) => void; localMode?: boolean; roomId?: string; seat?: 1 | 2 };

export default function CompetitiveGameLaunch({ gameKey, gameTitle, Game, onClose, preloadedRoomId }: { gameKey: string; gameTitle: string; Game: ComponentType<GameProps>; onClose: () => void; preloadedRoomId?: string | null }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ name: string; isBot: boolean } | null>(null);
  const [mode, setMode] = useState<"menu" | "online" | "host" | "local">("menu");
  const [status, setStatus] = useState("Preparing match…");
  const [matchError, setMatchError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<{ id: string; seat: 1 | 2 } | null>(null);
  const entryFee = useRef(0);
  const reported = useRef(false);
  useEffect(() => { void (async () => {
    const [{ data: auth }, { data: game }] = await Promise.all([supabase.auth.getUser(), supabase.from("games").select("entry_fee").ilike("title", gameTitle).maybeSingle()]);
    entryFee.current = Number(game?.entry_fee ?? 0);
    if (!auth.user) { setStatus("Sign in to play online."); return; }
    setUserId(auth.user.id);
  })(); }, [gameTitle]);
  useEffect(() => { void (async () => {
    if (!preloadedRoomId || gameKey !== "bingo") return;
    const [{ data: auth }, { data: players }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("matchmaking_room_players").select("seat,display_name,is_bot,user_id").eq("room_id", preloadedRoomId).is("left_at", null),
    ]);
    const mine = (players || []).find((player: any) => player.user_id === auth.user?.id);
    if (!mine) { setMatchError("This Bingo invitation is no longer available."); return; }
    const other = (players || []).find((player: any) => player.seat !== mine.seat);
    setRoom({ id: preloadedRoomId, seat: mine.seat as 1 | 2 });
    setOpponent({ name: other?.display_name || "Online Player", isBot: Boolean(other?.is_bot) });
  })(); }, [preloadedRoomId, gameKey]);
  useEffect(() => {
    if (gameKey !== "bingo" || !room || opponent) return;
    let mounted = true;
    const watchForGuest = async () => {
      const { data: players } = await supabase
        .from("matchmaking_room_players")
        .select("seat,display_name,is_bot")
        .eq("room_id", room.id)
        .is("left_at", null);
      if (!mounted || (players || []).length !== 2) return;
      const other = (players || []).find((player: any) => player.seat !== room.seat);
      if (other) setOpponent({ name: other.display_name || "Online Player", isBot: Boolean(other.is_bot) });
    };
    void watchForGuest();
    const timer = window.setInterval(watchForGuest, 1500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [gameKey, opponent, room]);
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
  const joinRoom = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc("join_two_player_room", { p_code: roomCode, p_name: auth.user?.email?.split("@")[0] || "Player 2" });
    if (error) { setMatchError(error.message); return; }
    if (data.game_key !== gameKey) { setMatchError("That room belongs to a different game."); return; }
    if (gameKey === "bingo") {
      const { error: initError } = await supabase.rpc("initialize_bingo_match", { p_room_id: data.room_id });
      if (initError) { setMatchError(initError.message); return; }
    }
    setRoom({ id: data.room_id, seat: data.seat as 1 | 2 });
    setOpponent({ name: "Online Player", isBot: false });
  };
  const reportResult = async (result: Result) => {
    if (reported.current) return;
    reported.current = true;
    await recordMatchResult({ game_id: gameKey, game_title: gameTitle, opponent_name: opponent?.name || "Arena Opponent", result, points_change: result === "Win" ? entryFee.current * 2 : 0 });
  };
  if (opponent) return <Game onClose={onClose} onResult={reportResult} roomId={room?.id} seat={room?.seat} />;
  if (matchError) return <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center text-on-background"><div><p className="font-bold">{matchError}</p><button onClick={onClose} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-on-primary">Back to arcade</button></div></div>;
  if (mode === "online" && userId) return <MatchmakingModal gameKey={gameKey} gameName={gameTitle} userId={userId} fallbackAfterMs={45000} roomBacked={gameKey === "bingo"} onMatchFound={(match) => { if (gameKey === "bingo") setRoom({ id: match.matchId, seat: match.role }); void startMatch(match); }} onCancel={() => setMode("menu")} />;
  if (mode === "host") return <div className="fixed inset-0 z-[100] grid place-items-center bg-[#09090b] p-6 text-center text-white"><div className="w-full max-w-sm rounded-[32px] border border-white/10 bg-[#18181b] p-7"><p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Create a private room</p><button onClick={async()=>{const {data:{user}}=await supabase.auth.getUser(); const {data,error}=await supabase.rpc("create_two_player_room",{p_game_key:gameKey,p_name:user?.email?.split("@")[0]||"Player 1",p_state:{}}); if(error){setMatchError(error.message);return;} if(gameKey==="four-in-a-row") await supabase.rpc("create_four_in_a_row_state",{p_room_id:data.room_id}); setRoom({id:data.room_id,seat:1});setRoomCode(data.room_code);}} className="mt-6 w-full rounded-2xl bg-[#CCFF00] py-3 text-xs font-black uppercase text-black">Create room</button>{roomCode&&<><p className="mt-6 text-xs font-bold uppercase text-neutral-400">Share this room code</p><p className="my-3 font-mono text-4xl font-black tracking-[.2em] text-[#CCFF00]">{roomCode}</p>{gameKey === "bingo" ? <p className="rounded-2xl bg-white/5 py-3 text-xs font-black uppercase text-neutral-300">Waiting for the other player…</p> : <button onClick={()=>setOpponent({name:"Online Player",isBot:false})} className="w-full rounded-2xl bg-white py-3 text-xs font-black uppercase text-black">Enter room</button>}</>}<button onClick={() => setMode("menu")} className="mt-4 text-xs font-bold text-neutral-400">Back</button></div></div>;
  if (mode === "local") return <Game onClose={onClose} onResult={() => undefined} localMode />;
  if (mode === "menu") return <GameEngagementMenu gameName={gameTitle} entryFee={entryFee.current} onOnline={() => userId ? setMode("online") : setStatus("Sign in to play online.")} onHost={() => setMode("host")} onLocal={() => setMode("local")} showLocal={gameKey !== "bingo"} onExit={onClose} roomCode={roomCode} setRoomCode={setRoomCode} onJoin={() => void joinRoom()} />;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-background p-6 text-center text-on-background"><div><p className="font-bold">{status}</p><button onClick={onClose} className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-black text-on-primary">Back to arcade</button></div></div>;
}
