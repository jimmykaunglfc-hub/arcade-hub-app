"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import PublicProfileCardModal from "@/components/PublicProfileCardModal";
import { shareAchievement } from "@/lib/socialShare";

type Player = { id: string; username: string; avatar_url: string | null; points: number; gems: number };
const LEADERBOARD_CACHE_KEY = "joeyoke_global_leaderboard_v1";

const readCachedLeaderboard = (): Player[] => {
  if (typeof window === "undefined") return [];
  try {
    const cached = JSON.parse(sessionStorage.getItem(LEADERBOARD_CACHE_KEY) || "null") as { players?: Player[] } | null;
    return Array.isArray(cached?.players) ? cached.players : [];
  } catch { return []; }
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>(readCachedLeaderboard);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const shareRank = async (player: Player, rank: number) => {
    const status = await shareAchievement({ eyebrow: "Global leaderboard", title: `Global Rank #${rank}`, subtitle: `${player.username} is climbing the Joe Yoke leaderboard`, stat: `${Number(player.points || 0).toLocaleString()} points`, accent: "gold" });
    setShareMessage(status === "shared" ? "Rank card shared." : "Rank card downloaded and text copied.");
    window.setTimeout(() => setShareMessage(null), 3000);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("app_theme");
    document.documentElement.classList.toggle("dark", savedTheme !== "light");
    void supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id || null));
    void supabase.rpc("get_global_leaderboard")
      .then(({ data }) => {
        const nextPlayers = (data || []) as Player[];
        if (!nextPlayers.length) return;
        setPlayers(nextPlayers);
        sessionStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({ players: nextPlayers, savedAt: Date.now() }));
      });
  }, []);

  return <main className="h-[100dvh] overflow-hidden touch-pan-y bg-background px-4 text-on-background" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(3.5rem, env(safe-area-inset-bottom))", overscrollBehaviorX: "none" }}>
    <div className="mx-auto flex h-full max-w-xl min-h-0 flex-col">
      <header className="shrink-0 border-b border-surface-container-highest bg-background pb-4">
        <button onClick={() => router.back()} className="mb-4 text-sm font-bold text-primary">← Back</button>
        <h1 className="font-headline text-3xl font-black">Global Leaderboard</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Top 50 players by points</p>
        {shareMessage && <p className="mt-3 rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">{shareMessage}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 no-scrollbar">
      <div className="overflow-hidden rounded-[24px] border border-surface-container-highest bg-surface divide-y divide-surface-variant">
        {players.map((player, index) => <div key={player.id} className={`flex items-center gap-3 p-3 ${player.id === viewerId ? "bg-primary-container ring-1 ring-inset ring-primary" : ""}`}>
          <b className="w-8 text-center text-primary">#{index + 1}</b>
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-surface-container-highest bg-surface-container">
            <Image src={player.avatar_url || "/logo-dark.jpeg"} alt="" fill className="object-cover" unoptimized />
          </div>
          <div className="min-w-0 flex-1"><b className="block truncate text-sm">{player.username} {player.id === viewerId && <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-on-primary">YOU</span>}</b><span className="text-xs text-on-surface-variant">Profile ranking</span></div>
          <div className="text-right"><b className="block text-sm">{Number(player.points || 0).toLocaleString()} PTS</b><div className="mt-1 flex items-center justify-end gap-2"><button onClick={() => setViewingProfileId(player.id)} className="text-[10px] font-bold text-primary">View profile</button>{player.id === viewerId && <button onClick={() => void shareRank(player, index + 1)} className="text-[10px] font-bold text-primary">Share rank</button>}</div></div>
        </div>)}
        {!players.length && <p className="p-8 text-center text-sm text-on-surface-variant">Loading leaderboard…</p>}
      </div>
      </div>
      {viewingProfileId && <PublicProfileCardModal userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />}
    </div>
  </main>;
}
