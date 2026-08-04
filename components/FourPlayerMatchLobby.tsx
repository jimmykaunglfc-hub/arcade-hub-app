"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Seat = { seat: number; name: string; avatar_url?: string | null; is_bot: boolean; ready: boolean };

export default function FourPlayerMatchLobby({ gameKey, gameName, userId, onStart, onCancel }: { gameKey: string; gameName: string; userId: string; onStart: (roomId: string) => void; onCancel: () => void }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seconds, setSeconds] = useState(45);
  const [expired, setExpired] = useState(false);
  const [entering, setEntering] = useState(false);
  const alive = useRef(true);
  useEffect(() => { void (async () => {
    const { data: profile } = await supabase.from("profiles").select("username, avatar_url").eq("id", userId).maybeSingle();
    const { data, error } = await supabase.rpc("join_four_player_queue", { p_game_key: gameKey, p_name: profile?.username || "Player", p_avatar_url: profile?.avatar_url || null });
    if (error || !data || !alive.current) return;
    setRoomId(data);
  })(); return () => { alive.current = false; }; }, [gameKey, userId]);
  useEffect(() => { if (!roomId) return; const refresh = async () => { const { data } = await supabase.rpc("get_matchmaking_room", { p_room_id: roomId }); if (!data || !alive.current) return; setSeats(data.players || []); const left = Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 1000)); setSeconds(left); setExpired(left === 0 && (data.players || []).filter((p: Seat) => !p.is_bot).length < 2); if (data.status === "playing") onStart(roomId); }; void refresh(); const id = window.setInterval(refresh, 1000); return () => clearInterval(id); }, [onStart, roomId]);
  const enter = async () => { if (!roomId) return; setEntering(true); await supabase.rpc("set_matchmaking_seat_ready", { p_room_id: roomId, p_ready: true }); };
  return <div className="fixed inset-0 z-[150] grid place-items-center bg-[#09090b] p-5 text-white"><div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#18181b] p-6"><p className="text-xs font-black uppercase tracking-widest text-[#ccff00]">Quick Match</p><h1 className="mt-1 text-2xl font-black">{gameName}</h1><p className="mt-2 text-sm text-neutral-400">{expired ? "No other players found yet." : `Finding players… ${seconds}s remaining`}</p><div className="mt-6 grid grid-cols-2 gap-3">{[1,2,3,4].map(seat => { const player = seats.find(p => p.seat === seat); return <div key={seat} className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">{player ? <><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[#ccff00] text-black">{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : player.name.slice(0,1)}</span><span><b className="block text-sm">{player.name}</b><small className="text-[#ccff00]">{player.ready ? "Ready" : "Matched"}</small></span></> : <span className="text-sm text-neutral-500">Searching…</span>}</div>; })}</div><button disabled={!roomId || entering} onClick={enter} className="mt-6 w-full rounded-2xl bg-[#ccff00] py-3 font-black text-black">{entering ? "Waiting for matched players…" : "Enter Match"}</button>{expired && <button onClick={onCancel} className="mt-3 w-full py-2 text-sm text-neutral-400">Cancel</button>}</div></div>;
}
