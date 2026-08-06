"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Seat = { seat: number; name: string; avatar_url?: string | null; is_bot: boolean; ready: boolean };

export default function FourPlayerMatchLobby({ gameKey, gameName, userId, onStart, onCancel }: { gameKey: string; gameName: string; userId: string; onStart: (roomId: string) => void; onCancel: () => void }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seconds, setSeconds] = useState(45);
  const [entrySeconds, setEntrySeconds] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [entering, setEntering] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const alive = useRef(true);
  const dealt = useRef(false);
  const entryDeadline = useRef<number | null>(null);
  useEffect(() => {
    const preventPinch = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", preventPinch, { passive: false });
    return () => document.removeEventListener("gesturestart", preventPinch);
  }, []);
  useEffect(() => { void (async () => {
    const { data: profile } = await supabase.from("profiles").select("username, avatar_url").eq("id", userId).maybeSingle();
    const { data, error } = await supabase.rpc("join_four_player_queue", { p_game_key: gameKey, p_name: profile?.username || "Player", p_avatar_url: profile?.avatar_url || null });
    if (error || !data || !alive.current) return;
    if (gameKey === "monopoly") {
      const { error: fundingFailure } = await supabase.rpc("fund_monopoly_room", { p_room_id: data });
      if (fundingFailure) { if (alive.current) setFundingError(fundingFailure.message); return; }
    }
    setRoomId(data);
  })(); return () => { alive.current = false; }; }, [gameKey, userId]);
  useEffect(() => { if (!roomId) return; const refresh = async () => { const { data } = await supabase.rpc("get_matchmaking_room", { p_room_id: roomId }); if (!data || !alive.current) return; const players = data.players || []; const humans = players.filter((p: Seat) => !p.is_bot); const left = Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 1000)); if (left === 0 && data.status === "waiting" && humans.length >= 1) { await supabase.rpc("fill_expired_four_player_bots", { p_room_id: roomId }); if (!entryDeadline.current) entryDeadline.current = Date.now() + 15_000; }
    const allSeatsReady = players.length === 4 && players.every((player: Seat) => player.ready);
    // The second countdown is for *every* matched player to acknowledge the
    // room. It must remain visible when just one player is still missing.
    if (entryDeadline.current && !allSeatsReady) setEntrySeconds(Math.max(0, Math.ceil((entryDeadline.current - Date.now()) / 1000)));
    else setEntrySeconds(null);
    setSeats(players); setSeconds(left); setExpired(left === 0 && humans.length < 1);
    // Do not leave the client permanently disabled after it has acknowledged
    // Enter Match. The host owns the single start/deal action; everyone else
    // receives the room transition on the next refresh.
    if (allSeatsReady) setEntering(false);
    if (data.status === "starting" && data.host_id === userId && allSeatsReady && !dealt.current) {
      dealt.current = true;
      const rpc = gameKey === "big-two" ? "big_two_deal_room" : "start_four_player_room";
      const { error } = await supabase.rpc(rpc, { p_room_id: roomId });
      if (error) dealt.current = false;
    }
    if (data.status === "playing") onStart(roomId);
  }; void refresh(); const id = window.setInterval(refresh, 1000); return () => clearInterval(id); }, [gameKey, onStart, roomId, userId]);
  const enter = async () => {
    if (!roomId || entering) return;
    setEntering(true);
    const { error } = await supabase.rpc("set_matchmaking_seat_ready", { p_room_id: roomId, p_ready: true });
    if (error) setEntering(false);
  };
  const cancel = async () => {
    if (roomId && gameKey === "monopoly") await supabase.rpc("cancel_waiting_monopoly_room", { p_room_id: roomId });
    onCancel();
  };
  const matched = seats.length;
  if (fundingError) return <div className="fixed inset-0 z-[150] grid place-items-center bg-[#09090b] p-6 text-center text-white"><div><p className="font-bold">{fundingError}</p><button onClick={onCancel} className="mt-5 rounded-xl bg-white/10 px-5 py-3 font-bold">Back to arcade</button></div></div>;
  return <div className="fixed inset-0 z-[150] grid place-items-center overflow-hidden overscroll-none touch-none bg-[radial-gradient(circle_at_top,#1d4d3c_0%,#09090b_55%)] p-5 text-white"><div className="w-full max-w-md overflow-hidden rounded-[30px] border border-emerald-200/20 bg-[#101a1c] shadow-2xl"><div className="border-b border-white/10 bg-white/[.03] px-6 pb-5 pt-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[#ccff00]">Quick Match</p><h1 className="mt-1 text-3xl font-black">{gameName}</h1></div><div className="rounded-2xl border border-[#ccff00]/30 bg-[#ccff00]/10 px-3 py-2 text-right"><b className="block text-lg leading-none text-[#ccff00]">{entrySeconds ?? seconds}s</b><small className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">{entrySeconds === null ? "searching" : "enter match"}</small></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[#ccff00] transition-all" style={{ width: `${(matched / 4) * 100}%` }} /></div><p className="mt-3 text-sm text-slate-300">{entrySeconds !== null ? `Match ready — ${seats.filter((player) => !player.ready).length} player${seats.filter((player) => !player.ready).length === 1 ? "" : "s"} still need to enter. ${entrySeconds}s remaining.` : expired ? "No other players found yet." : `${matched} of 4 players matched — all players must enter.`}</p></div><div className="p-5"><div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(seat => { const player = seats.find(p => p.seat === seat); return <div key={seat} className={`min-h-24 rounded-2xl border p-3 ${player ? "border-emerald-300/25 bg-emerald-400/[.06]" : "border-dashed border-slate-600 bg-black/15"}`}>{player ? <><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border-2 border-[#ccff00] bg-[#ccff00] text-black">{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : player.name.slice(0,1)}</span><b className="mt-2 block truncate text-sm">{player.name}</b><small className={player.ready ? "font-bold text-[#ccff00]" : "text-slate-400"}>{player.ready ? "✓ Ready" : "Matched"}</small></> : <div className="grid h-full place-items-center text-center"><span className="text-xl text-slate-500">⌕</span><small className="mt-1 text-slate-500">Searching…</small></div>}</div>; })}</div><button disabled={!roomId || entering || expired || entrySeconds === 0} onClick={enter} className="mt-6 w-full rounded-2xl bg-[#ccff00] py-3.5 font-black text-black shadow-[0_8px_24px_rgba(204,255,0,.2)] disabled:opacity-40">{entering ? "Waiting for matched players…" : entrySeconds === 0 ? "Match window expired" : "Enter Match"}</button><button onClick={() => void cancel()} className="mt-2 w-full py-2 text-sm font-semibold text-slate-400">Cancel matchmaking</button></div></div></div>;
}
