"use client";



import { tr } from "../../lib/i18n";
import { LocalizedText } from "../../lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import PublicProfileCardModal from "@/components/PublicProfileCardModal";
import { shareAchievement } from "@/lib/socialShare";

type Player = { id: string; username: string; avatar_url: string | null; xp: number; gems: number; card_background_url?: string | null; avatar_frame_url?: string | null };
const LEADERBOARD_CACHE_KEY = "joeyoke_global_leaderboard_xp_v2";
const PAGE_SIZE = 10;

const readCachedLeaderboard = (): Player[] => {
  if (typeof window === "undefined") return [];
  try {
    const cached = JSON.parse(sessionStorage.getItem(LEADERBOARD_CACHE_KEY) || "null") as { players?: Player[] } | null;
    return Array.isArray(cached?.players) ? cached.players.slice(0, PAGE_SIZE) : [];
  } catch { return []; }
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>(readCachedLeaderboard);
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(players.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(async (offset: number) => {
    const { data, error } = await supabase.rpc("get_global_leaderboard_page", {
      p_offset: offset,
      p_limit: PAGE_SIZE,
    });
    if (error) throw error;
    const basePlayers = (data || []) as Player[];
    const cards = await Promise.all(
      basePlayers.map((player) =>
        supabase.rpc("get_public_profile_card", { target_user_id: player.id }).maybeSingle()
      )
    );
    return basePlayers.map((player, index) => {
      const card = cards[index]?.data as {
        card_background_url?: string | null;
        avatar_frame_url?: string | null;
      } | null;
      return {
        ...player,
        card_background_url: card?.card_background_url || null,
        avatar_frame_url: card?.avatar_frame_url || null,
      };
    });
  }, []);

  const shareRank = async (player: Player, rank: number) => {
    const status = await shareAchievement({ eyebrow: "Global leaderboard", title: `Global Rank #${rank}`, subtitle: `${player.username} is climbing the Joe Yoke leaderboard`, stat: `${Number(player.xp || 0).toLocaleString()} XP`, accent: "gold" });
    setShareMessage(status === "shared" ? "Rank card shared." : "Rank card downloaded and text copied.");
    window.setTimeout(() => setShareMessage(null), 3000);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("app_theme");
    document.documentElement.classList.toggle("dark", savedTheme !== "light");
    void supabase.auth.getUser().then(({ data }) => setViewerId(data.user?.id || null));
    let cancelled = false;
    void fetchPage(0)
      .then((nextPlayers) => {
        if (cancelled) return;
        setPlayers(nextPlayers);
        setHasMore(nextPlayers.length === PAGE_SIZE);
        sessionStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({ players: nextPlayers, savedAt: Date.now() }));
      })
      .catch(() => {
        if (!cancelled) setHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const nextPlayers = await fetchPage(players.length);
      setPlayers((current) => {
        const knownIds = new Set(current.map((player) => player.id));
        return [...current, ...nextPlayers.filter((player) => !knownIds.has(player.id))];
      });
      setHasMore(nextPlayers.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchPage, hasMore, isLoading, players.length]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list || list.scrollHeight - list.scrollTop - list.clientHeight > 240) return;
    void loadMore();
  };

  const podium = players.slice(0, 3);
  const remaining = players.slice(3);

  return <main className="h-[100dvh] overflow-hidden touch-pan-y bg-background px-4 text-on-background" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(3.5rem, env(safe-area-inset-bottom))", overscrollBehaviorX: "none" }}>
    <div className="mx-auto flex h-full max-w-xl min-h-0 flex-col">
      <header className="shrink-0 border-b border-surface-container-highest bg-background pb-4">
        <button onClick={() => router.back()} className="mb-4 text-sm font-bold text-primary"><LocalizedText id="UI_0004" fallback="← Back" /></button>
        <h1 className="font-headline text-3xl font-black"><LocalizedText id="UI_0005" fallback="Global Leaderboard" /></h1>
        <p className="mt-1 text-sm text-on-surface-variant"><LocalizedText id="UI_0006" fallback="Top 50 players by XP" /></p>
        {shareMessage && <p className="mt-3 rounded-lg bg-primary-container px-3 py-2 text-xs font-bold text-on-primary-container">{shareMessage}</p>}
      </header>
      <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 no-scrollbar">
      {podium.length > 0 && <section className="mb-4 grid grid-cols-2 gap-3">
        {podium[0] && <PodiumCard player={podium[0]} rank={1} featured viewerId={viewerId} onView={setViewingProfileId} onShare={shareRank} />}
        {podium.slice(1).map((player, index) => <PodiumCard key={player.id} player={player} rank={index + 2} viewerId={viewerId} onView={setViewingProfileId} onShare={shareRank} />)}
      </section>}
      <div className="overflow-hidden rounded-[24px] border border-surface-container-highest bg-surface divide-y divide-surface-variant">
        {remaining.map((player, offset) => { const index = offset + 3; return <div key={player.id} className={`flex items-center gap-3 p-3 ${player.id === viewerId ? "bg-primary-container ring-1 ring-inset ring-primary" : ""}`}>
          <b className="w-8 text-center text-primary">#{index + 1}</b>
          <Avatar player={player} size="h-12 w-12" />
          <div className="min-w-0 flex-1"><b className="block truncate text-sm">{player.username} {player.id === viewerId && <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-on-primary"><LocalizedText id="UI_0008" fallback={tr("UI_0008", "YOU")} /></span>}</b><span className="text-xs text-on-surface-variant"><LocalizedText id="UI_0007" fallback="Profile ranking" /></span></div>
          <div className="text-right"><b className="block text-sm">{Number(player.xp || 0).toLocaleString()} <LocalizedText id="UI_0011" fallback="XP" /></b><div className="mt-1 flex items-center justify-end gap-2"><button onClick={() => setViewingProfileId(player.id)} className="text-[10px] font-bold text-primary"><LocalizedText id="UI_0010" fallback="View profile" /></button>{player.id === viewerId && <button onClick={() => void shareRank(player, index + 1)} aria-label={tr("UI_0009", "Share my rank")} className="grid h-6 w-6 place-items-center rounded-md text-primary hover:bg-primary-container"><span className="material-symbols-outlined text-base">share</span></button>}</div></div>
        </div>})}
        {isLoading && <p className="p-8 text-center text-sm text-on-surface-variant"><LocalizedText id="UI_0012" fallback={tr("UI_0012", "Loading leaderboard…")} /></p>}
      </div>
      {isLoadingMore && <p className="py-3 text-center text-xs font-bold text-on-surface-variant"><LocalizedText id="UI_0013" fallback={tr("UI_0013", "Loading 10 more players…")} /></p>}
      </div>
      {viewingProfileId && <PublicProfileCardModal userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />}
    </div>
  </main>;
}

function Avatar({ player, size }: { player: Player; size: string }) { return <div className={`relative shrink-0 ${size} overflow-visible rounded-full border-2 border-primary bg-surface-container`}><div className="absolute inset-1 overflow-hidden rounded-full"><Image src={player.avatar_url || "/logo-dark.jpeg"} alt="" fill className="object-cover" unoptimized /></div>{player.avatar_frame_url && <Image src={player.avatar_frame_url} alt="" fill className="pointer-events-none absolute inset-0 scale-[1.18] object-contain" unoptimized />}</div>; }

function PodiumCard({ player, rank, featured = false, viewerId, onView, onShare }: { player: Player; rank: number; featured?: boolean; viewerId: string | null; onView: (id: string) => void; onShare: (player: Player, rank: number) => Promise<void> }) {
  const labels = ["", "1st place", "2nd place", "3rd place"];
  const hasBackground = Boolean(player.card_background_url);
  return <div className={`${featured ? "col-span-2" : ""} relative overflow-hidden rounded-[24px] border border-surface-container-highest bg-surface p-4 text-center shadow-sm ${player.id === viewerId ? "border-primary ring-2 ring-inset ring-primary" : ""}`} style={hasBackground ? { backgroundImage: `linear-gradient(rgb(10 15 25 / .44), rgb(10 15 25 / .68)), url(${player.card_background_url})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}><span className="relative inline-flex rounded-full bg-primary-container px-2 py-1 text-[10px] font-black uppercase text-primary">♕ {labels[rank]}</span><div className="relative mx-auto mt-3 w-max"><Avatar player={player} size={featured ? "h-20 w-20" : "h-14 w-14"} /></div><b className={`relative mt-2 block truncate text-sm ${hasBackground ? "text-white" : ""}`}>{player.username}{player.id === viewerId && <span className="ml-1 text-[9px] text-primary"><LocalizedText id="UI_0008" fallback={tr("UI_0008", "YOU")} /></span>}</b><small className={`relative block text-xs ${hasBackground ? "text-white/80" : "text-on-surface-variant"}`}><LocalizedText id="UI_0007" fallback="Profile ranking" /></small><b className="relative mt-2 inline-block rounded-lg bg-primary-container px-2 py-1 text-sm text-primary">{Number(player.xp || 0).toLocaleString()} <LocalizedText id="UI_0011" fallback="XP" /></b><div className="relative mt-2 flex justify-center gap-2"><button onClick={() => onView(player.id)} className="text-[10px] font-bold text-primary"><LocalizedText id="UI_0010" fallback="View profile" /></button>{player.id === viewerId && <button onClick={() => void onShare(player, rank)} aria-label={tr("UI_0009", "Share my rank")} className="text-primary"><span className="material-symbols-outlined text-base">share</span></button>}</div></div>;
}
