"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Seat = { seat: number; name: string; avatar_url?: string | null; is_bot: boolean; ready: boolean };
type LobbyMode = "menu" | "online" | "host" | "room";

export default function FourPlayerMatchLobby({ gameKey, gameName, userId, onStart, onCancel, preloadedRoomId }: { gameKey: string; gameName: string; userId: string; onStart: (roomId: string) => void; onCancel: () => void; preloadedRoomId?: string | null }) {
  const [roomId, setRoomId] = useState<string | null>(preloadedRoomId || null);
  const [roomCode, setRoomCode] = useState("");
  const [hostCode, setHostCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [mode, setMode] = useState<LobbyMode>(preloadedRoomId ? "room" : "menu");
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seconds, setSeconds] = useState(45);
  const [entrySeconds, setEntrySeconds] = useState<number | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const dealt = useRef(false);
  const entryDeadline = useRef<number | null>(null);

  useEffect(() => () => { alive.current = false; }, []);

  const profilePayload = async () => {
    const { data } = await supabase.from("profiles").select("username,avatar_url").eq("id", userId).maybeSingle();
    return { p_name: data?.username || "Player", p_avatar_url: data?.avatar_url || null };
  };

  const beginOnline = async () => {
    setError(null);
    const profile = await profilePayload();
    const { data, error: queueError } = await supabase.rpc("join_four_player_queue", { p_game_key: gameKey, ...profile });
    if (queueError || !data) { setError(queueError?.message || "Could not join matchmaking."); return; }
    if (gameKey === "monopoly") {
      const { error: fundingError } = await supabase.rpc("fund_monopoly_room", { p_room_id: data });
      if (fundingError) { setError(fundingError.message); return; }
    }
    setMode("online");
    setRoomId(data);
  };

  const hostRoom = async () => {
    setError(null);
    const profile = await profilePayload();
    const { data, error: hostError } = await supabase.rpc("create_four_player_host_room", { p_game_key: gameKey, ...profile });
    if (hostError || !data?.room_id) { setError(hostError?.message || "Could not create the room."); return; }
    if (gameKey === "monopoly") {
      const { error: fundingError } = await supabase.rpc("fund_monopoly_room", { p_room_id: data.room_id });
      if (fundingError) { setError(fundingError.message); return; }
    }
    setHostCode(data.room_code || "");
    setMode("host");
    setRoomId(data.room_id);
  };

  const joinHostRoom = async () => {
    setError(null);
    const profile = await profilePayload();
    const { data, error: joinError } = await supabase.rpc("join_four_player_host_room_by_code", { p_room_code: roomCode, ...profile });
    if (joinError || !data?.room_id) { setError(joinError?.message || "Could not join that room."); return; }
    if (gameKey !== data.game_key) { setError("That code belongs to a different game."); return; }
    if (gameKey === "monopoly") {
      const { error: fundingError } = await supabase.rpc("fund_monopoly_room", { p_room_id: data.room_id });
      if (fundingError) { setError(fundingError.message); return; }
    }
    setMode("room");
    setRoomId(data.room_id);
  };

  const copyHostCode = async () => {
    if (!hostCode) return;
    try {
      await navigator.clipboard.writeText(hostCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      setError("Could not copy the room code. Please select it manually.");
    }
  };

  useEffect(() => {
    if (!roomId) return;
    const refresh = async () => {
      const { data } = await supabase.rpc("get_matchmaking_room", { p_room_id: roomId });
      if (!data || !alive.current) return;
      const players = (data.players || []) as Seat[];
      const isQuickMatch = mode === "online";
      const left = Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 1000));
      if (isQuickMatch && left === 0 && data.status === "waiting" && players.some((player) => !player.is_bot)) {
        await supabase.rpc("fill_expired_four_player_bots", { p_room_id: roomId });
        if (!entryDeadline.current) entryDeadline.current = Date.now() + 15_000;
      }
      const allSeatsReady = players.length === 4 && players.every((player) => player.ready);
      if (entryDeadline.current && !allSeatsReady) setEntrySeconds(Math.max(0, Math.ceil((entryDeadline.current - Date.now()) / 1000)));
      else setEntrySeconds(null);
      setSeats(players);
      setSeconds(left);
      if (allSeatsReady) setEntering(false);
      if (data.status === "starting" && data.host_id === userId && allSeatsReady && !dealt.current) {
        dealt.current = true;
        const rpc = gameKey === "big-two" ? "big_two_deal_room" : "start_four_player_room";
        const { error: startError } = await supabase.rpc(rpc, { p_room_id: roomId });
        if (startError) { dealt.current = false; setError(startError.message); }
      }
      if (data.status === "playing") onStart(roomId);
    };
    void refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [gameKey, mode, onStart, roomId, userId]);

  const enter = async () => {
    if (!roomId || entering) return;
    setEntering(true);
    const { error: readyError } = await supabase.rpc("set_matchmaking_seat_ready", { p_room_id: roomId, p_ready: true });
    if (readyError) { setEntering(false); setError(readyError.message); }
  };

  if (mode === "menu") return <div className="fixed inset-0 z-[150] grid place-items-center overflow-hidden bg-[#09090b] p-5 text-white"><div className="w-full max-w-md rounded-[30px] border border-white/10 bg-[#18181b] p-6 shadow-2xl"><div className="mb-6 flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-[#38bdf8]">♟</span><div><h1 className="text-2xl font-black">{gameName}</h1><p className="text-xs text-neutral-400">Select engagement mode</p></div></div><button onClick={() => void beginOnline()} className="w-full rounded-[24px] border border-white/10 bg-[#09090b] p-5 text-left"><div className="mb-6 flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ccff00]/10 text-xl text-[#ccff00]">⌕</span><span className="rounded-full bg-[#ccff00]/10 px-2 py-1 text-[9px] font-black uppercase text-[#ccff00]">Online</span></div><b className="block text-xl">Find Online Match</b><small className="mt-1 block text-neutral-400">Match up to four players worldwide</small></button><button onClick={() => void hostRoom()} className="mt-4 w-full rounded-[24px] border border-teal-400/20 bg-[#09090b] p-5 text-left"><div className="mb-6 flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-400/10 text-xl text-teal-300">▣</span><span className="rounded-full bg-teal-400/10 px-2 py-1 text-[9px] font-black uppercase text-teal-300">Private</span></div><b className="block text-xl">Host Play</b><small className="mt-1 block text-neutral-400">Create a room code and invite up to 3 friends</small></button><div className="mt-4 flex gap-2"><input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ENTER ROOM CODE" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#09090b] px-4 py-3 text-sm font-bold tracking-wider outline-none"/><button onClick={() => void joinHostRoom()} disabled={roomCode.length < 4} className="rounded-2xl bg-white/10 px-5 text-xs font-black disabled:opacity-40">JOIN</button></div>{error && <p className="mt-4 text-center text-xs font-bold text-rose-400">{error}</p>}<button onClick={onCancel} className="mt-5 w-full text-xs font-bold uppercase tracking-wider text-neutral-400">Exit arena</button></div></div>;

  const isHost = mode === "host";
  const matched = seats.length;
  return <div className="fixed inset-0 z-[150] grid place-items-center overflow-hidden overscroll-none touch-none bg-[radial-gradient(circle_at_top,#1d4d3c_0%,#09090b_55%)] p-5 text-white"><div className="w-full max-w-md overflow-hidden rounded-[30px] border border-emerald-200/20 bg-[#101a1c] shadow-2xl"><div className="border-b border-white/10 bg-white/[.03] px-6 pb-5 pt-6"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[#ccff00]">{isHost ? "Private Room" : "Quick Match"}</p><h1 className="mt-1 text-3xl font-black">{gameName}</h1></div>{!isHost && <div className="rounded-2xl border border-[#ccff00]/30 bg-[#ccff00]/10 px-3 py-2 text-right"><b className="block text-lg leading-none text-[#ccff00]">{entrySeconds ?? seconds}s</b><small className="text-[9px] font-bold uppercase tracking-wider text-emerald-100">{entrySeconds === null ? "searching" : "enter match"}</small></div>}</div>{isHost && <div className="mt-4 rounded-2xl border border-teal-300/20 bg-teal-400/10 px-4 py-3"><span className="block text-[9px] font-black uppercase tracking-widest text-teal-200">Share this room code</span><div className="mt-1 flex items-center justify-between gap-3"><b className="min-w-0 font-mono text-3xl tracking-[.2em] text-[#ccff00]">{hostCode}</b><button type="button" onClick={() => void copyHostCode()} className="shrink-0 rounded-xl border border-[#ccff00]/35 bg-[#ccff00]/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#ccff00] active:scale-95">{codeCopied ? "Copied ✓" : "Copy"}</button></div><small className="mt-1 block text-xs text-teal-50/75">Invite up to three friends from Chat, or let them enter this code.</small></div>}<div className="mt-5 h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[#ccff00] transition-all" style={{ width: `${(matched / 4) * 100}%` }} /></div><p className="mt-3 text-sm text-slate-300">{matched} of 4 players joined — accepted invitations enter this same room.</p></div><div className="p-5"><div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(seat => { const player = seats.find(p => p.seat === seat); return <div key={seat} className={`min-h-24 rounded-2xl border p-3 ${player ? "border-emerald-300/25 bg-emerald-400/[.06]" : "border-dashed border-slate-600 bg-black/15"}`}>{player ? <><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border-2 border-[#ccff00] bg-[#ccff00] text-black">{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : player.name.slice(0,1)}</span><b className="mt-2 block truncate text-sm">{player.name}</b><small className={player.ready ? "font-bold text-[#ccff00]" : "text-slate-400"}>{player.ready ? "✓ Ready" : "Matched"}</small></> : <div className="grid h-full place-items-center text-center"><span className="text-xl text-slate-500">⌕</span><small className="mt-1 text-slate-500">Waiting…</small></div>}</div>; })}</div>{!isHost && <button disabled={!roomId || entering || entrySeconds === 0} onClick={() => void enter()} className="mt-6 w-full rounded-2xl bg-[#ccff00] py-3.5 font-black text-black disabled:opacity-40">{entering ? "Waiting for players…" : "Enter Match"}</button>}{error && <p className="mt-4 text-center text-xs font-bold text-rose-400">{error}</p>}<button onClick={onCancel} className="mt-3 w-full py-2 text-sm font-semibold text-slate-400">Leave lobby</button></div></div></div>;
}
