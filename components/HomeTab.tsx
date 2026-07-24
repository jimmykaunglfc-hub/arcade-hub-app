"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
    <div className="space-y-5 w-full pb-6 animate-fade-in text-on-surface">
      
      {/* 🌌 HERO WELCOME BANNER */}
      <section className="relative w-full rounded-[24px] overflow-hidden bg-surface/80 border border-surface-container-highest backdrop-blur-xl p-6 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-1">
          <span className="font-caps text-[10px] text-primary font-bold uppercase tracking-widest">
            Welcome to the Arena
          </span>
          <h1 className="font-headline text-2xl font-black leading-tight">
            Ready to dominate, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              {username}?
            </span>
          </h1>
          <p className="font-body text-xs text-on-surface-variant mt-2 max-w-[240px]">
            Your network connection is stable. Choose an arena and start climbing the ranks.
          </p>
        </div>

        {/* Decorative Graphic Element */}
        <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-primary-container/30 rounded-full blur-2xl pointer-events-none" />
        <span className="absolute right-4 top-4 material-symbols-outlined text-5xl text-surface-container-highest opacity-50 rotate-12 pointer-events-none">
          sports_esports
        </span>
      </section>

      {/* 📊 QUICK STATS GRID */}
      <section className="grid grid-cols-2 gap-3">
        <div className="bg-surface/60 border border-surface-container-highest backdrop-blur-md rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
          <span className="material-symbols-outlined text-primary text-xl mb-1">account_balance_wallet</span>
          <span className="font-caps text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Network Balance</span>
          <span className="font-headline text-lg font-black">{currentPoints.toLocaleString()} <span className="text-[10px] text-on-surface-variant font-medium">PTS</span></span>
        </div>
        
        <div className="bg-surface/60 border border-surface-container-highest backdrop-blur-md rounded-2xl p-4 flex flex-col gap-1 shadow-sm">
          <span className="material-symbols-outlined text-secondary text-xl mb-1">military_tech</span>
          <span className="font-caps text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">Global Rank</span>
          <span className="font-headline text-lg font-black text-secondary">#42 <span className="text-[10px] text-on-surface-variant font-medium">/ 10k</span></span>
        </div>
      </section>

      {/* 🚀 QUICK LAUNCH (JUMP BACK IN) */}
      <section className="space-y-3">
        <h3 className="font-caps text-[10px] text-on-surface-variant font-bold uppercase tracking-widest px-1">
          Jump Back In
        </h3>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => onPlay("native://snooker")}
            className="w-full bg-surface/80 border border-surface-container-highest backdrop-blur-md rounded-2xl p-3 flex items-center justify-between hover:bg-surface-variant transition-colors shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                <span className="material-symbols-outlined text-xl">sports_bar</span>
              </div>
              <div className="text-left">
                <h4 className="font-headline text-sm font-bold">Snooker 3D</h4>
                <p className="font-body text-[10px] text-on-surface-variant">Multiplayer • 50 PTS</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-surface-container-highest">chevron_right</span>
          </button>

          <button 
            onClick={() => onPlay("native://chess")}
            className="w-full bg-surface/80 border border-surface-container-highest backdrop-blur-md rounded-2xl p-3 flex items-center justify-between hover:bg-surface-variant transition-colors shadow-sm active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500">
                <span className="material-symbols-outlined text-xl">psychology</span>
              </div>
              <div className="text-left">
                <h4 className="font-headline text-sm font-bold">Grandmaster Chess</h4>
                <p className="font-body text-[10px] text-on-surface-variant">Tactical • 0 PTS</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-surface-container-highest">chevron_right</span>
          </button>
        </div>
      </section>

    </div>
  );
}