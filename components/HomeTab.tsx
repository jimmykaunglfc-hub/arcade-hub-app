"use client";

import { useEffect, useState } from "react";
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
    winRate: number;
    kda: string; 
    hoursPlayed: number;
  } | null;

  matchHistory?: Array<{
    id: string;
    gameName: string;
    result: string;
    reward: string;
    timeAgo: string;
    isVictory: boolean;
  }>;
}

export default function HomeTab({ 
  currentPoints, 
  userId, 
  onPlay, 
  onNavigate, 
  onPointsUpdated,
  rankData = null, 
  matchHistory = [] 
}: HomeTabProps) {
  const [username, setUsername] = useState<string>("Player");
  const [showStatsModal, setShowStatsModal] = useState<boolean>(false);

  useEffect(() => {
    if (!userId) return;
    const fetchUser = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .single();
      if (data?.username) setUsername(data.username);
    };
    fetchUser();
  }, [userId]);

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

  return (
    <div className="w-full pb-6 animate-fade-in relative">
      
      {/* 🎁 DYNAMIC DAILY LOGIN BANNER */}
      <div className="mb-5">
        <DailyLoginCard userId={userId} onClaimSuccess={onPointsUpdated} />
      </div>

      {/* 🏆 HERO CARD: CURRENT SEASON */}
      <section 
        className="w-full bg-primary text-on-primary rounded-[24px] p-6 shadow-sm transition-all duration-300"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)' }}
      >
        <div className="flex items-center gap-8">
          
          {/* LEFT: Rank Badge */}
          <div className="flex items-center justify-center shrink-0">
            <span 
              className="material-symbols-outlined text-[88px] drop-shadow-md opacity-90" 
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {currentRankIcon}
            </span>
          </div>

          {/* RIGHT: Rank Details */}
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
              {rankData?.percentile ? `Top ${rankData.percentile}% of players globally` : "Play matches to get ranked"}
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-black/10">
          <div className="flex flex-col items-start">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">Win Rate</span>
            <span className="font-headline text-lg font-black mt-0.5">
              {rankData?.winRate ? `${rankData.winRate}%` : "0%"}
            </span>
          </div>
          
          <div className="w-px h-8 bg-black/10"></div>
          
          <div className="flex flex-col items-center">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">KDA</span>
            <span className="font-headline text-lg font-black mt-0.5">
              {rankData?.kda || "0.0"}
            </span>
          </div>
          
          <div className="w-px h-8 bg-black/10"></div>
          
          <div className="flex flex-col items-end">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">Hours</span>
            <span className="font-headline text-lg font-black mt-0.5">
              {rankData?.hoursPlayed || "0"}
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
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-on-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">Play</span>
          </button>

          <button 
            onClick={() => onNavigate("store")}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-secondary-container flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-secondary text-[24px]">casino</span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">Spin</span>
          </button>

          <button 
            onClick={() => setShowStatsModal(true)}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-surface-container-highest flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-blue-500 text-[24px]">polyline</span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">Stats</span>
          </button>
        </div>
      </section>

      {/* 🕒 RECENT MATCHES LIST */}
      <section className="mt-8">
        <div className="flex justify-between items-end mb-3 px-1">
          <h2 className="font-headline text-lg font-bold text-on-surface tracking-wide">
            Recent Matches
          </h2>
          {matchHistory.length > 0 && (
            <button className="font-headline text-xs font-bold text-primary hover:opacity-80 transition-opacity">
              See All
            </button>
          )}
        </div>
        
        <div className="flex flex-col gap-3">
          {matchHistory.length === 0 ? (
            <div className="w-full bg-surface border border-surface-container-highest rounded-[20px] p-8 flex flex-col items-center text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant">sports_esports</span>
              </div>
              <h3 className="font-headline text-base font-bold text-on-surface mb-1">No Matches Yet</h3>
              <p className="font-body text-xs text-on-surface-variant mb-5">
                Jump into the arcade to start building your legacy and climbing the ranks.
              </p>
              <button 
                onClick={() => onNavigate("explore")}
                className="bg-primary text-on-primary font-headline text-sm font-bold px-6 py-2.5 rounded-full hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                Find a Game
              </button>
            </div>
          ) : (
            matchHistory.map((match) => (
              <button key={match.id} className="w-full bg-surface border border-surface-container-highest rounded-[20px] p-4 flex items-center justify-between hover:bg-surface-variant transition-colors active:scale-[0.98] shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${match.isVictory ? 'bg-primary-container text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined text-[22px]">emoji_events</span>
                  </div>
                  <div className="text-left">
                    <h3 className="font-headline text-sm font-bold text-on-surface leading-tight">{match.gameName}</h3>
                    <p className="font-body text-[11px] text-on-surface-variant mt-0.5">{match.result} • {match.reward}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center gap-1">
                  <span className="font-body text-[10px] text-on-surface-variant">{match.timeAgo}</span>
                  <span className="material-symbols-outlined text-on-surface-variant text-sm">chevron_right</span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* 📊 STATS MODAL OVERLAY */}
      {showStatsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm bg-surface rounded-[24px] p-6 shadow-2xl animate-fade-in border border-surface-container-highest relative">
            <button 
              onClick={() => setShowStatsModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-highest text-on-surface hover:bg-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            <div className="flex flex-col items-center text-center mt-2 mb-6">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[32px] text-blue-500">polyline</span>
              </div>
              <h2 className="font-headline text-xl font-bold text-on-surface">Player Statistics</h2>
              <p className="font-body text-sm text-on-surface-variant">Lifetime gameplay record</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-4 bg-background rounded-[16px] border border-surface-container-highest">
                <span className="font-body text-sm text-on-surface-variant">Total Points</span>
                <span className="font-headline text-base font-bold text-on-surface">{currentPoints.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-background rounded-[16px] border border-surface-container-highest">
                <span className="font-body text-sm text-on-surface-variant">Win Rate</span>
                <span className="font-headline text-base font-bold text-on-surface">{rankData?.winRate ? `${rankData.winRate}%` : "N/A"}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-background rounded-[16px] border border-surface-container-highest">
                <span className="font-body text-sm text-on-surface-variant">Current Rank</span>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {currentRankIcon}
                  </span>
                  <span className="font-headline text-base font-bold text-primary">{currentTier}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}