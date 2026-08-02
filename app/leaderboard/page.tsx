"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import PublicProfileCardModal from "@/components/PublicProfileCardModal";

type Player = { id: string; username: string; avatar_url: string | null; points: number; gems: number };

export default function LeaderboardPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from("profiles").select("id, username, avatar_url, points, gems").order("points", { ascending: false }).limit(50)
      .then(({ data }) => setPlayers((data || []) as Player[]));
  }, []);

  return <main className="min-h-[100dvh] bg-background px-4 pb-8 text-on-background" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
    <div className="mx-auto max-w-xl">
      <button onClick={() => router.back()} className="mb-5 text-sm font-bold text-primary">← Back</button>
      <h1 className="font-headline text-3xl font-black">Global Leaderboard</h1>
      <p className="mt-1 text-sm text-on-surface-variant">Top 50 players by points</p>
      <div className="mt-5 overflow-hidden rounded-[24px] border border-surface-container-highest bg-surface divide-y divide-surface-variant">
        {players.map((player, index) => <div key={player.id} className="flex items-center gap-3 p-3">
          <b className="w-8 text-center text-primary">#{index + 1}</b>
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-surface-container-highest bg-surface-container">
            <Image src={player.avatar_url || "/logo-dark.jpeg"} alt="" fill className="object-cover" unoptimized />
          </div>
          <div className="min-w-0 flex-1"><b className="block truncate text-sm">{player.username}</b><span className="text-xs text-on-surface-variant">Profile ranking</span></div>
          <div className="text-right"><b className="block text-sm">{Number(player.points || 0).toLocaleString()} PTS</b><button onClick={() => setViewingProfileId(player.id)} className="mt-1 text-[10px] font-bold text-primary">View profile</button></div>
        </div>)}
        {!players.length && <p className="p-8 text-center text-sm text-on-surface-variant">Loading leaderboard…</p>}
      </div>
      {viewingProfileId && <PublicProfileCardModal userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />}
    </div>
  </main>;
}
