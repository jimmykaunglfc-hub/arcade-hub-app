"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface HomeTabProps {
  currentPoints: number;
  userId: string | null;
  onPlay: (url: string) => void;
}

export default function HomeTab({ currentPoints, userId, onPlay }: HomeTabProps) {
  const [username, setUsername] = useState<string>("Player");

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

  return (
    <div className="w-full pb-6 animate-fade-in">
      
      {/* 🏆 HERO CARD: CURRENT SEASON */}
      <section 
        className="w-full bg-primary text-on-primary rounded-[24px] p-6 shadow-sm transition-all duration-300"
        style={{ backgroundColor: 'var(--primary)', color: 'var(--on-primary)' }}
      >
        <div className="flex items-center gap-1.5 mb-2 opacity-80">
          <span className="material-symbols-outlined text-sm">emoji_events</span>
          <span className="font-caps text-[10px] font-bold uppercase tracking-widest">
            Current Season
          </span>
        </div>
        
        <h1 className="font-headline text-3xl font-black leading-tight tracking-tight">
          Diamond II
        </h1>
        <p className="font-body text-xs font-medium text-on-primary opacity-80 mt-1">
          Top 4% of players globally
        </p>

        {/* Stats Row */}
        {/* FIXED: Replaced border-on-primary/10 with standard black/10 since on-primary is dark */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-black/10">
          <div className="flex flex-col items-start">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">Win Rate</span>
            <span className="font-headline text-lg font-black mt-0.5">64.2%</span>
          </div>
          
          <div className="w-px h-8 bg-black/10"></div>
          
          <div className="flex flex-col items-center">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">KDA</span>
            <span className="font-headline text-lg font-black mt-0.5">3.8</span>
          </div>
          
          <div className="w-px h-8 bg-black/10"></div>
          
          <div className="flex flex-col items-end">
            <span className="font-caps text-[9px] font-bold opacity-60 uppercase tracking-widest">Hours</span>
            <span className="font-headline text-lg font-black mt-0.5">142</span>
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
            onClick={() => onPlay("native://snooker")}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm"
          >
            {/* Solid Lime Circle with Dark Icon */}
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-on-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">Play</span>
          </button>

          <button 
            onClick={() => alert("Spin wheel logic routing...")}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm"
          >
            {/* FIXED: Replaced bg-secondary/20 with semantic bg-secondary-container */}
            <div className="w-14 h-14 rounded-full bg-secondary-container flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-secondary text-[24px]">casino</span>
            </div>
            <span className="font-headline text-sm font-bold text-on-surface">Spin</span>
          </button>

          <button 
            onClick={() => alert("Detailed stats routing...")}
            className="bg-surface border border-surface-container-highest rounded-[24px] p-4 flex flex-col items-center justify-center gap-3 hover:bg-surface-variant transition-colors active:scale-95 shadow-sm"
          >
            {/* FIXED: Replaced bg-blue-500/20 with a solid container fallback to prevent opacity breaking */}
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
          <button className="font-headline text-xs font-bold text-primary hover:opacity-80 transition-opacity">
            See All
          </button>
        </div>
        
        <div className="flex flex-col gap-3">
          
          <button className="w-full bg-surface border border-surface-container-highest rounded-[20px] p-4 flex items-center justify-between hover:bg-surface-variant transition-colors active:scale-[0.98] shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[14px] bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[22px]">emoji_events</span>
              </div>
              <div className="text-left">
                <h3 className="font-headline text-sm font-bold text-on-surface leading-tight">Ranked Match</h3>
                <p className="font-body text-[11px] text-on-surface-variant mt-0.5">Victory • +24 LP</p>
              </div>
            </div>
            <div className="flex flex-col items-end justify-center gap-1">
              <span className="font-body text-[10px] text-on-surface-variant">2h ago</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">chevron_right</span>
            </div>
          </button>

          <button className="w-full bg-surface border border-surface-container-highest rounded-[20px] p-4 flex items-center justify-between hover:bg-surface-variant transition-colors active:scale-[0.98] shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[14px] bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[22px]">emoji_events</span>
              </div>
              <div className="text-left">
                <h3 className="font-headline text-sm font-bold text-on-surface leading-tight">Grandmaster Chess</h3>
                <p className="font-body text-[11px] text-on-surface-variant mt-0.5">Victory • +15 Gems</p>
              </div>
            </div>
            <div className="flex flex-col items-end justify-center gap-1">
              <span className="font-body text-[10px] text-on-surface-variant">5h ago</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">chevron_right</span>
            </div>
          </button>

          <button className="w-full bg-surface border border-surface-container-highest rounded-[20px] p-4 flex items-center justify-between hover:bg-surface-variant transition-colors active:scale-[0.98] shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[14px] bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-[22px]">emoji_events</span>
              </div>
              <div className="text-left">
                <h3 className="font-headline text-sm font-bold text-on-surface leading-tight">Pro Table Tennis</h3>
                <p className="font-body text-[11px] text-on-surface-variant mt-0.5">Defeat • -8 LP</p>
              </div>
            </div>
            <div className="flex flex-col items-end justify-center gap-1">
              <span className="font-body text-[10px] text-on-surface-variant">1d ago</span>
              <span className="material-symbols-outlined text-on-surface-variant text-sm">chevron_right</span>
            </div>
          </button>

        </div>
      </section>

    </div>
  );
}