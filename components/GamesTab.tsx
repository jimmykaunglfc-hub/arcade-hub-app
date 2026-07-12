"use client";

import { useState } from "react";

// 🎮 DYNAMIC CONFIGURATION: 3D App Icon Styling Restored
const GAME_CATEGORIES = [
  {
    id: "strategy-cards",
    name: "Strategy & Mind Games",
    icon: "extension",
    games: [
      {
        id: "checkers-matrix",
        title: "Neon Checkers",
        genre: "Board • Network Live",
        playersOnline: "Live PvP",
        iconName: "grid_4x4",
        themeFrom: "from-blue-400",
        themeTo: "to-blue-600",
        shadow: "shadow-[0_8px_20px_rgba(59,130,246,0.3)]",
        url: "native://checkers" 
      },
      {
        id: "glitch-deck",
        title: "Glitch Deck",
        genre: "Cyberpunk • TCG",
        playersOnline: "1.4k active",
        iconName: "style",
        themeFrom: "from-purple-400",
        themeTo: "to-purple-600",
        shadow: "shadow-[0_8px_20px_rgba(168,85,247,0.3)]",
        url: "native://glitch-deck"
      },
      {
        id: "rune-masters",
        title: "Rune Masters",
        genre: "Strategy • TCG",
        playersOnline: "2.1k active",
        iconName: "auto_awesome",
        themeFrom: "from-amber-400",
        themeTo: "to-orange-500",
        shadow: "shadow-[0_8px_20px_rgba(245,158,11,0.3)]",
        url: "https://html5.gamedistribution.com/a42b9d8df2e245a4a5bb86524a806954/"
      }
    ]
  },
  {
    id: "action-racing",
    name: "Action & Racing",
    icon: "sports_motorsports",
    games: [
      {
        id: "neon-velocity",
        title: "Neon Velocity",
        genre: "Racing • Action",
        playersOnline: "4.2k active",
        iconName: "sports_esports",
        themeFrom: "from-rose-400",
        themeTo: "to-rose-600",
        shadow: "shadow-[0_8px_20px_rgba(244,63,94,0.3)]",
        url: "https://html5.gamedistribution.com/b5a5b54637ad4f7c80521e1cb04a23de/"
      },
      {
        id: "cyber-strike",
        title: "Cyber Rush",
        genre: "Sci-Fi • Runner",
        playersOnline: "1.8k active",
        iconName: "bolt",
        themeFrom: "from-cyan-400",
        themeTo: "to-cyan-600",
        shadow: "shadow-[0_8px_20px_rgba(34,211,238,0.3)]",
        url: "https://html5.gamedistribution.com/f255260a4f554032bfdf6f0813959b85/"
      }
    ]
  }
];

export default function GamesTab({ 
  rewardClaimed, 
  setRewardClaimed,
  onPlay 
}: { 
  rewardClaimed: boolean; 
  setRewardClaimed: (claimed: boolean) => void;
  onPlay: (url: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const toggleFilter = (categoryId: string) => {
    setActiveFilter(activeFilter === categoryId ? null : categoryId);
  };

  return (
    <div className="space-y-6 animate-fade-in w-full pb-12 text-neutral-900 dark:text-neutral-100">
      
      {/* 🎁 REWARD HUD */}
      <section 
        className={`bg-white dark:bg-neutral-900 border rounded-2xl p-4 flex items-center justify-between shadow-sm transition-all duration-300 ${
          rewardClaimed 
            ? "border-neutral-200 dark:border-neutral-900 opacity-60" 
            : "border-indigo-100 dark:border-indigo-950 bg-gradient-to-r from-indigo-50/50 to-transparent dark:from-indigo-950/20 shadow-[0_4px_15px_rgba(79,70,229,0.05)]"
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${
            rewardClaimed 
              ? "bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-900 text-neutral-400" 
              : "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
          }`}>
            <span className="material-symbols-outlined text-lg">card_giftcard</span>
          </div>
          <div>
            <h3 className={`text-[10px] font-bold tracking-wider uppercase ${rewardClaimed ? "text-neutral-400" : "text-indigo-600 dark:text-indigo-400"}`}>
              Daily Multiplier
            </h3>
            <p className="text-xs font-black tracking-tight mt-0.5">
              {rewardClaimed ? "Credits Synced Successfully" : "Claim +250 Network Credits"}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setRewardClaimed(true)}
          disabled={rewardClaimed}
          className={`h-8 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
            rewardClaimed 
              ? "bg-transparent text-neutral-400 border-neutral-200 dark:border-neutral-800 cursor-not-allowed" 
              : "bg-neutral-900 dark:bg-white text-white dark:text-black border-transparent hover:opacity-90 active:scale-95 shadow-md"
          }`}
        >
          {rewardClaimed ? "Claimed" : "Claim"}
        </button>
      </section>

      {/* 🎯 FEATURED 3D CARD VIEW */}
      <section className={`transition-all duration-500 ease-in-out origin-top ${
        activeFilter ? "max-h-0 opacity-0 overflow-hidden mb-0 scale-95 pointer-events-none" : "max-h-[360px] opacity-100"
      }`}>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-900 rounded-[2rem] p-5 shadow-sm transition-colors flex flex-col gap-4 relative overflow-hidden group">
          
          {/* Featured Image Box with 3D Icon */}
          <div className="relative w-full aspect-[16/9] bg-neutral-100 dark:bg-neutral-950 rounded-2xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-center overflow-hidden">
            {/* Glowing Aura */}
            <div className="absolute inset-0 bg-blue-500/10 dark:bg-blue-500/20 blur-3xl rounded-full scale-150 transition-opacity duration-500" />
            
            {/* 3D App Icon */}
            <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-blue-400 to-blue-600 shadow-[0_10px_30px_rgba(59,130,246,0.4)] flex items-center justify-center relative z-10 transform group-hover:scale-105 transition-transform duration-500 border border-white/20">
              <span className="material-symbols-outlined text-5xl text-white drop-shadow-md" style={{ fontVariationSettings: "'FILL' 1" }}>
                grid_4x4
              </span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 relative z-10">
            <div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold uppercase tracking-wider border border-indigo-100 dark:border-indigo-900/50">
                Featured Live Title
              </span>
              <h2 className="text-lg font-black tracking-tight mt-2 text-neutral-900 dark:text-white">Neon Checkers</h2>
            </div>
            
            <button 
              onClick={() => onPlay("native://checkers")}
              className="bg-neutral-900 dark:bg-white text-white dark:text-black w-full h-11 rounded-xl text-xs font-bold tracking-wider uppercase hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-1 shadow-md"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              Launch Engine
            </button>
          </div>
        </div>
      </section>

      {/* 🎰 ORGANIZED CATEGORIES MODULE */}
      <div className="space-y-3">
        {GAME_CATEGORIES.map((category) => {
          const isSelected = activeFilter === category.id;
          const isAnyFilterActive = activeFilter !== null;
          const showGrid = !isAnyFilterActive || isSelected;

          return (
            <section key={category.id} className="space-y-2.5 transition-all duration-300">
              
              <div 
                onClick={() => toggleFilter(category.id)}
                className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer select-none transition-all ${
                  isSelected 
                    ? "border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm opacity-100" 
                    : isAnyFilterActive 
                      ? "border-neutral-200 dark:border-neutral-900 bg-transparent opacity-40 scale-[0.99]"
                      : "border-neutral-200 dark:border-neutral-900 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-800 opacity-100 shadow-sm"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                    isSelected ? "bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" : "bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-500"
                  }`}>
                    <span className="material-symbols-outlined text-base">{category.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-xs font-black tracking-tight">{category.name}</h3>
                    <p className="text-[9px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-wider mt-0.5">
                      {category.games.length} {category.games.length === 1 ? "Module" : "Modules"} Configured
                    </p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-sm transition-transform duration-300 ${
                  isSelected ? "text-indigo-600 dark:text-indigo-400 rotate-90" : "text-neutral-400"
                }`}>
                  {isSelected ? "close" : "chevron_right"}
                </span>
              </div>
              
              <div className={`grid grid-cols-2 gap-3 transition-all duration-300 ease-in-out origin-top overflow-hidden ${
                showGrid 
                  ? "max-h-[800px] opacity-100 pt-0.5 scale-100 pointer-events-auto" 
                  : "max-h-0 opacity-0 pt-0 scale-95 pointer-events-none"
              }`}>
                {category.games.map((game) => (
                  <div 
                    key={game.id} 
                    className="group bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-900 overflow-hidden transition-all flex flex-col shadow-sm hover:shadow-md"
                  >
                    {/* 🌟 3D ICON SHOWCASE HEADER */}
                    <div className="relative h-28 w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-100 dark:border-neutral-900/60 overflow-hidden">
                      
                      {/* Dynamic Background Glow */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${game.themeFrom} ${game.themeTo} opacity-[0.08] dark:opacity-[0.15] blur-2xl scale-150`} />
                      
                      {/* 3D App Icon Box */}
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${game.themeFrom} ${game.themeTo} ${game.shadow} flex items-center justify-center relative z-10 transform group-hover:scale-110 transition-transform duration-500 border border-white/20`}>
                        <span className="material-symbols-outlined text-3xl text-white drop-shadow-md" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {game.iconName}
                        </span>
                      </div>
                      
                      <div className="absolute top-2 right-2 bg-white/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-800 px-1.5 py-0.5 rounded-md backdrop-blur-sm shadow-sm z-20">
                        <span className="text-[8px] text-neutral-600 dark:text-neutral-300 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                          <span className={`w-1 h-1 rounded-full ${game.playersOnline === "Local" ? "bg-neutral-400" : "bg-emerald-500 animate-pulse"}`}></span>
                          {game.playersOnline}
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-3 flex flex-col flex-1 justify-between gap-3 bg-white dark:bg-neutral-900">
                      <div>
                        <h4 className="text-xs font-black tracking-tight truncate text-neutral-900 dark:text-white">
                          {game.title}
                        </h4>
                        <p className="text-[9px] text-neutral-500 dark:text-neutral-400 font-bold tracking-wider uppercase mt-0.5 truncate">
                          {game.genre}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlay(game.url);
                        }}
                        className="w-full py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-900 dark:hover:bg-white text-neutral-800 dark:text-neutral-200 hover:text-white dark:hover:text-black font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors active:scale-95"
                      >
                        Play Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

    </div>
  );
}