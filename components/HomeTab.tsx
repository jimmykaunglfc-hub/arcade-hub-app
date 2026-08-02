"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import DailyLoginCard from "./DailyLoginCard";

interface HomeTabProps {
  currentPoints: number;
  userId: string | null;
  onPlay: (url: string) => void;
  onNavigate: (tabId: string) => void;
  onPointsUpdated?: () => void;

  rankData?: {
    tier: string;
    percentile: number;
    globalRank?: number | null;
    winRate: number;
    gamesPlayed: number;
    playtime: string;
    badgeIconUrl?: string | null;
  } | null;

  matchHistory?: Array<{
    id: string;
    gameName: string;
    result: string;
    reward: string;
    timeAgo: string;
    isVictory: boolean;
    isDraw?: boolean;
    opponentName?: string;
  }>;
}

interface MatchRecord {
  id: string;
  gameName: string;
  result: string;
  reward: string;
  timeAgo: string;
  isVictory: boolean;
  isDraw: boolean;
  opponentName?: string;
}

const GAME_ICONS: Record<string, string> = {
  Chess: "workspace_premium",
  Carrom: "sports_esports",
  Snooker: "sports_bar",
  "Tic Tac Toe": "grid_3x3",
  Uno: "style",
  Checkers: "grid_4x4",
  "Liars Dice": "casino",
  "8-Ball Pool": "sports_score",
  "Biometric Override": "fingerprint",
};

// Helper to format timestamps dynamically
function formatTimeAgo(isoString: string): string {
  if (!isoString) return "Just now";
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function TournamentMetric({
  icon,
  iconTone = "points",
  label,
  value,
}: {
  icon: string;
  iconTone?: "points" | "gem";
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`material-symbols-outlined rounded-full p-1.5 text-base ${
          iconTone === "gem"
            ? "bg-secondary-container text-secondary"
            : "bg-primary-container text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <b className="block whitespace-nowrap text-[11px] text-on-surface">
          {value}
        </b>
        <small className="text-[10px] text-on-surface-variant">{label}</small>
      </span>
    </div>
  );
}

export default function HomeTab({
  currentPoints,
  userId,
  onPlay,
  onNavigate,
  onPointsUpdated,
  rankData = null,
  matchHistory = [],
}: HomeTabProps) {
  // Mount state for safely using Portals in Next.js/SSR
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const [username, setUsername] = useState<string>("Player");
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);
  const [dbMatches, setDbMatches] = useState<MatchRecord[]>([]);
  const [activeTournament, setActiveTournament] = useState<any | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadTournament = async () => {
      const { data } = await supabase
        .from("tournaments")
        .select("*")
        .in("status", ["active", "upcoming"])
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (!data) return;
      setActiveTournament(data);
    };
    void loadTournament();
  }, [userId]);

  // Category State
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [showAllGames, setShowAllGames] = useState(false);

  // 1. FETCH USER PROFILE & RECENT MATCH HISTORY FROM SUPABASE
  const fetchUserDataAndMatches = useCallback(async () => {
    try {
      const activeUserId =
        userId || (await supabase.auth.getUser()).data.user?.id;
      if (!activeUserId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", activeUserId)
        .single();

      if (profile?.username) {
        setUsername(profile.username);
      }

      const { data: matches, error } = await supabase
        .from("match_history")
        .select("*")
        .eq("user_id", activeUserId)
        .order("created_at", { ascending: false })
        .limit(50); // Fetch a good chunk for accurate stats

      if (matches && !error) {
        const formatted: MatchRecord[] = matches.map((m: any) => {
          const pts = m.points_change ?? m.points_changed ?? 0;
          const resStr = (m.result || "Played").trim().toLowerCase();

          const isWin = resStr === "win" || resStr === "victory";
          const isDraw = resStr === "draw";
          const isLoss = resStr === "loss" || resStr === "defeat";

          let displayResult = "Played";
          if (isWin) displayResult = "Victory";
          else if (isLoss) displayResult = "Defeat";
          else if (isDraw) displayResult = "Draw";

          return {
            id: m.id,
            gameName: m.game_title || "Arcade Match",
            result: displayResult,
            reward: pts > 0 ? `+${pts} PTS` : `${pts} PTS`,
            timeAgo: formatTimeAgo(m.created_at),
            isVictory: isWin,
            isDraw: isDraw,
            opponentName: m.opponent_name || null,
          };
        });
        setDbMatches(formatted);
      }
    } catch (err) {
      console.error("Error fetching home tab data:", err);
    }
  }, [userId]);

  // 2. REALTIME SUBSCRIPTION FOR POINTS & MATCH UPDATES
  useEffect(() => {
    let profileChannel: any;
    let matchesChannel: any;

    const setupSubscriptions = async () => {
      const activeUserId =
        userId || (await supabase.auth.getUser()).data.user?.id;

      fetchUserDataAndMatches();

      if (!activeUserId) return;

      profileChannel = supabase
        .channel(`home_profile_${activeUserId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${activeUserId}`,
          },
          () => {
            if (onPointsUpdated) onPointsUpdated();
          }
        )
        .subscribe();

      matchesChannel = supabase
        .channel(`home_matches_${activeUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "match_history",
            filter: `user_id=eq.${activeUserId}`,
          },
          () => {
            fetchUserDataAndMatches();
          }
        )
        .subscribe();
    };

    setupSubscriptions();

    return () => {
      if (profileChannel) supabase.removeChannel(profileChannel);
      if (matchesChannel) supabase.removeChannel(matchesChannel);
    };
  }, [userId, fetchUserDataAndMatches, onPointsUpdated]);

  const getRankIcon = (tier: string) => {
    if (!tier || tier === "Unranked") return "help_center";
    if (tier.includes("Bronze")) return "shield";
    if (tier.includes("Silver")) return "workspace_premium";
    if (tier.includes("Gold")) return "emoji_events";
    if (tier.includes("Platinum")) return "stars";
    if (tier.includes("Diamond")) return "diamond";
    if (tier.includes("Master")) return "local_fire_department";
    return "emoji_events";
  };

  const currentTier = rankData?.tier || "Unranked";
  const currentRankIcon = getRankIcon(currentTier);

  const activeMatchList: MatchRecord[] =
    dbMatches.length > 0
      ? dbMatches
      : matchHistory.map((m) => ({
          id: m.id,
          gameName: m.gameName,
          result: m.result,
          reward: m.reward,
          timeAgo: m.timeAgo,
          isVictory: m.isVictory,
          isDraw: m.isDraw ?? false,
          opponentName: m.opponentName,
        }));

  // 🧮 3. DYNAMIC STATS CALCULATION
  const stats = useMemo(() => {
    const total = activeMatchList.length;
    const wins = activeMatchList.filter((m) => m.isVictory).length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const gameCounts = activeMatchList.reduce((acc, m) => {
      acc[m.gameName] = (acc[m.gameName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const favorite =
      Object.keys(gameCounts).length > 0
        ? Object.keys(gameCounts).reduce((a, b) =>
            gameCounts[a] > gameCounts[b] ? a : b
          )
        : "None";

    return { total, wins, winRate, favorite };
  }, [activeMatchList]);

  // 📂 4. GROUP RECENT MATCHES BY GAME
  const groupedMatches = useMemo(() => {
    const groups: Record<string, MatchRecord[]> = {};
    activeMatchList.forEach((match) => {
      if (!groups[match.gameName]) groups[match.gameName] = [];
      groups[match.gameName].push(match);
    });
    // Convert to array and keep chronological order
    return Object.entries(groups);
  }, [activeMatchList]);

  const displayedGroups = showAllGames
    ? groupedMatches
    : groupedMatches.slice(0, 5);

  return (
    <div className="w-full pb-6 animate-fade-in relative">
      {/* 🎁 DYNAMIC DAILY LOGIN BANNER */}
      <div className="mb-5">
        <DailyLoginCard userId={userId} onClaimSuccess={onPointsUpdated} />
      </div>

      {activeTournament && (
        <section className="mb-5 overflow-hidden rounded-[24px] border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-surface p-5 shadow-sm">
          {activeTournament.card_image_url && (
            <img
              src={activeTournament.card_image_url}
              alt=""
              className="-mx-5 -mt-5 mb-4 aspect-[16/7] w-[calc(100%+2.5rem)] max-w-none bg-surface-container object-cover object-center"
            />
          )}
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                {activeTournament.status} tournament
              </span>
              <h2 className="mt-1 font-headline text-lg font-black text-on-surface">
                {activeTournament.title}
              </h2>
            </div>
            <span className="material-symbols-outlined text-amber-500">
              emoji_events
            </span>
          </div>
          <button
            onClick={() =>
              router.replace(`/tournaments/${activeTournament.id}`)
            }
            className="mt-4 w-full rounded-xl bg-primary py-3 text-xs font-black text-on-primary"
          >
            View tournament
          </button>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-left">
            <TournamentMetric
              icon="group"
              label="Players"
              value={`${
                activeTournament.current_slots ??
                activeTournament.registered_count ??
                0
              }/${activeTournament.max_slots ?? activeTournament.max_players}`}
            />
            <TournamentMetric
              icon={
                activeTournament.prize_currency === "gems" ? "diamond" : "bolt"
              }
              iconTone={
                activeTournament.prize_currency === "gems" ? "gem" : "points"
              }
              label="Prize"
              value={`${activeTournament.prize_pool?.toLocaleString()} ${
                activeTournament.prize_currency === "gems" ? "GEMS" : "PTS"
              }`}
            />
            <TournamentMetric
              icon={
                activeTournament.entry_fee_currency === "gems"
                  ? "diamond"
                  : "bolt"
              }
              iconTone={
                activeTournament.entry_fee_currency === "gems"
                  ? "gem"
                  : "points"
              }
              label="Entry"
              value={
                activeTournament.entry_fee > 0
                  ? `${activeTournament.entry_fee.toLocaleString()} ${
                      activeTournament.entry_fee_currency === "points"
                        ? "PTS"
                        : "GEMS"
                    }`
                  : "Free"
              }
            />
          </div>
        </section>
      )}

      {/* 🏆 HERO CARD: CURRENT SEASON */}
      <section
        className="w-full bg-primary text-on-primary rounded-[24px] p-6 shadow-sm transition-all duration-300"
        style={{
          backgroundColor: "var(--primary)",
          color: "var(--on-primary)",
        }}
      >
        <div className="flex items-center gap-8">
          <div className="flex items-center justify-center shrink-0">
            {rankData?.badgeIconUrl ? (
              <img
                src={rankData.badgeIconUrl}
                alt={`${currentTier} rank badge`}
                className="h-[76px] w-[76px] object-contain drop-shadow-md"
              />
            ) : (
              <span
                className="material-symbols-outlined text-[88px] drop-shadow-md opacity-90"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {currentRankIcon}
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <div className="opacity-80 mb-1">
              <span className="font-caps text-[10px] font-bold uppercase tracking-widest">
                Current Season
              </span>
            </div>
            <h1 className="font-headline text-3xl font-black leading-tight tracking-tight">
              {currentTier}
            </h1>
            <p className="font-body text-xs font-medium text-on-primary opacity-80 mt-1">
              {rankData?.percentile
                ? `Global rank #${rankData.globalRank ?? "—"} · Top ${rankData.percentile}%`
                : "Complete a match to enter the global ranking"}
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-black/10">
          <div className="flex flex-col items-start">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">
              Win Rate
            </span>
            <span className="font-headline text-lg font-black mt-0.5">
              {rankData?.winRate ? `${rankData.winRate}%` : `${stats.winRate}%`}
            </span>
          </div>
          <div className="w-px h-8 bg-black/10"></div>
          <div className="flex flex-col items-center">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">
              Matches
            </span>
            <span className="font-headline text-lg font-black mt-0.5">
              {rankData?.gamesPlayed ?? 0}
            </span>
          </div>
          <div className="w-px h-8 bg-black/10"></div>
          <div className="flex flex-col items-end">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">
              Play time
            </span>
            <span className="font-headline text-lg font-black mt-0.5">
              {rankData?.playtime || "0m"}
            </span>
          </div>
        </div>
      </section>

      {/* ⚡ ACTIONS GRID */}
      <section className="mt-8">
        <h2 className="font-headline text-lg font-bold text-on-surface mb-3 tracking-wide">
          Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onNavigate("explore")}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm touch-manipulation"
          >
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <span
                className="material-symbols-outlined text-on-primary text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                play_arrow
              </span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">
              Play
            </span>
          </button>

          <button
            onClick={() => onNavigate("store")}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm touch-manipulation"
          >
            <div className="w-14 h-14 rounded-full bg-secondary-container flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-secondary text-[24px]">
                donut_large
              </span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">
              Spin
            </span>
          </button>

          <button
            onClick={() => setShowStatsModal(true)}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm touch-manipulation"
          >
            <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-blue-500 text-[24px]">
                polyline
              </span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">
              Stats
            </span>
          </button>
        </div>
      </section>

      {/* 🕒 CATEGORIZED RECENT MATCHES */}
      <section className="mt-8">
        {/* VIEW A: DETAILED MATCH LIST FOR ONE GAME */}
        {selectedGame ? (
          <div className="w-full animate-fade-in">
            <div className="flex items-center justify-between mb-4 mt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedGame(null)}
                  className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center border border-surface-container-highest hover:bg-surface-container-high transition-all"
                >
                  <span className="material-symbols-outlined text-on-surface text-sm">
                    arrow_back
                  </span>
                </button>
                <h2 className="text-xl font-headline font-black text-on-surface">
                  {selectedGame} History
                </h2>
              </div>
              <span className="text-xs text-on-surface-variant font-bold">
                {groupedMatches.find((g) => g[0] === selectedGame)?.[1].length}{" "}
                Plays
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {groupedMatches
                .find((g) => g[0] === selectedGame)?.[1]
                .map((match, i) => (
                  <div
                    key={match.id || i}
                    className="bg-surface border border-surface-container-highest rounded-2xl p-4 flex items-center justify-between shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                          match.isVictory
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : match.isDraw
                            ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">
                          {match.isVictory
                            ? "emoji_events"
                            : match.isDraw
                            ? "balance"
                            : "close"}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-on-surface mb-0.5">
                          vs {match.opponentName || "Unknown"}
                        </h4>
                        <p className="text-[11px] text-on-surface-variant font-medium">
                          <span
                            className={
                              match.isVictory
                                ? "text-emerald-400"
                                : match.isDraw
                                ? "text-amber-400"
                                : "text-rose-400"
                            }
                          >
                            {match.result}
                          </span>
                          <span className="mx-1.5">•</span>
                          {match.reward}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-on-surface-variant font-medium">
                      {match.timeAgo}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          /* VIEW B: HOME PAGE (GROUPED CARDS) */
          <div className="w-full">
            <div className="flex justify-between items-end mb-3 px-1">
              <h2 className="font-headline text-lg font-bold text-on-surface tracking-wide">
                Recent Matches
              </h2>
              {groupedMatches.length > 5 && (
                <button
                  onClick={() => setShowAllGames(!showAllGames)}
                  className="font-headline text-xs font-bold text-primary hover:opacity-80 transition-opacity uppercase tracking-wider"
                >
                  {showAllGames ? "Show Less" : "See All"}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {groupedMatches.length === 0 ? (
                <div className="w-full bg-surface border border-surface-container-highest rounded-[20px] p-8 flex flex-col items-center text-center shadow-sm">
                  <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-[32px] text-on-surface-variant">
                      sports_esports
                    </span>
                  </div>
                  <h3 className="font-headline text-base font-bold text-on-surface mb-1">
                    No Matches Yet
                  </h3>
                  <p className="font-body text-xs text-on-surface-variant mb-5">
                    Jump into the arcade to start building your legacy.
                  </p>
                  <button
                    onClick={() => onNavigate("explore")}
                    className="bg-primary text-on-primary font-headline text-sm font-bold px-6 py-2.5 rounded-full hover:opacity-90 active:scale-95 transition-all shadow-sm touch-manipulation"
                  >
                    Find a Game
                  </button>
                </div>
              ) : (
                displayedGroups.map(([gameTitle, gameMatches], i) => {
                  const latestMatch = gameMatches[0];
                  const gameWins = gameMatches.filter(
                    (m) => m.isVictory
                  ).length;
                  const iconName = GAME_ICONS[gameTitle] || "sports_esports";

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedGame(gameTitle)}
                      className="w-full bg-surface hover:bg-surface-variant border border-surface-container-highest rounded-[20px] p-4 flex items-center justify-between transition-all group text-left active:scale-[0.98] shadow-sm touch-manipulation"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-surface-container-high rounded-[14px] flex items-center justify-center border border-surface-container-highest group-hover:scale-105 transition-transform shrink-0">
                          <span className="material-symbols-outlined text-xl text-primary">
                            {iconName}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-headline font-bold text-base text-on-surface mb-0.5">
                            {gameTitle}
                          </h3>
                          <p className="text-[11px] text-on-surface-variant font-medium flex items-center gap-1.5">
                            {gameMatches.length} Matches
                            <span className="w-1 h-1 rounded-full bg-on-surface-variant opacity-50"></span>
                            {gameWins} Wins
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-on-surface-variant font-medium">
                          Last: {latestMatch.timeAgo}
                        </span>
                        <div className="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:bg-surface-variant group-hover:text-on-surface transition-all">
                          <span className="material-symbols-outlined text-sm">
                            chevron_right
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      {/* 📊 PROFESSIONAL STATS MODAL OVERLAY (USING REACT PORTAL) */}
      {showStatsModal &&
        isMounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in touch-none"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100dvh",
            }}
          >
            <div className="bg-surface border border-surface-container-highest rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl relative text-on-surface">
              {/* Close Button */}
              <button
                onClick={() => setShowStatsModal(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>

              {/* Header */}
              <div className="flex flex-col items-center mb-6 pt-4">
                <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-3">
                  <span className="material-symbols-outlined text-blue-400 text-3xl">
                    query_stats
                  </span>
                </div>
                <h2 className="font-headline font-black text-xl text-on-surface uppercase tracking-tight">
                  Player Statistics
                </h2>
                <p className="text-xs text-on-surface-variant font-medium mt-1">
                  Lifetime gameplay record
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-surface-container border border-surface-container-highest rounded-2xl p-4 flex flex-col items-center text-center shadow-inner">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">
                    Win Rate
                  </span>
                  <span className="text-2xl font-black text-[#CCFF00]">
                    {stats.winRate}%
                  </span>
                </div>
                <div className="bg-surface-container border border-surface-container-highest rounded-2xl p-4 flex flex-col items-center text-center shadow-inner">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">
                    Matches
                  </span>
                  <span className="text-2xl font-black text-on-surface">
                    {stats.total}
                  </span>
                </div>
                <div className="bg-surface-container border border-surface-container-highest rounded-2xl p-4 flex flex-col items-center text-center shadow-inner">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">
                    Victories
                  </span>
                  <span className="text-xl font-black text-blue-400">
                    {stats.wins}
                  </span>
                </div>
                <div className="bg-surface-container border border-surface-container-highest rounded-2xl p-4 flex flex-col items-center text-center justify-center shadow-inner">
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mb-1">
                    Top Game
                  </span>
                  <span className="text-sm font-bold text-on-surface truncate w-full">
                    {stats.favorite}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowStatsModal(false)}
                className="w-full py-3.5 bg-surface-container-high hover:bg-surface-variant text-on-surface font-headline font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-surface-container-highest active:scale-95 touch-manipulation"
              >
                Close Dashboard
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
