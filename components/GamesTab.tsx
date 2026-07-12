"use client";

import { useState } from "react";

// 🎮 DYNAMIC CONFIGURATION: Neon UI Asset Registry
const GAME_CATEGORIES = [
  {
    id: "strategy-cards",
    name: "Strategy & Mind Games",
    icon: "extension",
    games: [
      {
        id: "checkers-matrix",
        title: "Neon Checkers",
        genre: "Board • Local PvP",
        playersOnline: "Local",
        iconName: "grid_4x4", // Material Symbol Name
        iconColor: "text-blue-400", // Glow Color
        bgGradient: "from-blue-500/20 to-transparent",
        url: "native://checkers" 
      },
      {
        id: "glitch-deck",
        title: "Glitch Deck",
        genre: "Cyberpunk • TCG",
        playersOnline: "1.4k",
        iconName: "style",
        iconColor: "text-purple-400",
        bgGradient: "from-purple-500/20 to-transparent",
        url: "native://glitch-deck"
      },
      {
        id: "rune-masters",
        title: "Rune Masters",
        genre: "Strategy • TCG",
        playersOnline: "2.1k",
        iconName: "auto_awesome",
        iconColor: "text-amber-400",
        bgGradient: "from-amber-500/20 to-transparent",
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
        playersOnline: "4.2k",
        iconName: "sports_esports",
        iconColor: "text-rose-400",
        bgGradient: "from-rose-500/20 to-transparent",
        url: "https://html5.gamedistribution.com/b5a5b54637ad4f7c80521e1cb04a23de/"
      },
      {
        id: "cyber-strike",
        title: "Cyber Rush",
        genre: "Sci-Fi • Runner",
        playersOnline: "1.8k",
        iconName: "bolt",
        iconColor: "text-cyan-400",
        bgGradient: "from-cyan-500/20 to-transparent",
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
    <div className="space-y-6 animate-fade-in w-full pb-8">
      
      {/* 🎁 PREMIUM REWARD ACCELERATOR BANNER */}
      <section 
        className={`relative overflow-hidden rounded-2xl border p-4 flex items-center justify-between shadow-xl transition-all duration-500 bg-gradient-to-r ${
          rewardClaimed 
            ? "from-surface-variant/20 to-surface border-white/5 opacity-60" 
            : "from-secondary/15 via-surface-variant/40 to-surface border-secondary/30 shadow-[0_8px_32px_rgba(74,225,118,0.08)]"
        }`}
      >
        <div className="flex items-center gap-4 z-10">
          <div className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-all ${
            rewardClaimed 
              ? "bg-black/20 border-white/5 text-on-surface-variant/40" 
              : "bg-secondary/10 border-secondary/30 text-secondary"
          }`}>
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              card_giftcard
            </span>
          </div>
          <div>
            <h3 className={`text-[10px] font-black tracking-widest uppercase ${rewardClaimed ? "text-on-surface-variant/40" : "text-secondary"}`}>
              Daily Multiplier
            </h3>
            <p className="text-sm font-bold text-white tracking-tight mt-0.5">
              {rewardClaimed ? "Credits Synced Successfully" : "Claim +250 Network Credits!"}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setRewardClaimed(true)}
          disabled={rewardClaimed}
          className={`h-9 px-5 rounded-xl text-xs font-black tracking-wider uppercase transition-all z-10 border ${
            rewardClaimed 
              ? "bg-black/40 text-on-surface-variant/30 border-white/5 cursor-not-allowed" 
              : "bg-secondary text-on-secondary border-secondary shadow-md hover:brightness-110 active:scale-95"
          }`}
        >
          {rewardClaimed ? "CLAIMED" : "CLAIM"}
        </button>
      </section>

      {/* 🎯 ULTRA-PREMIUM FEATURED CONSOLE VIEW (NEON EDITION) */}
      <section className={`transition-all duration-500 ease-in-out origin-top ${
        activeFilter ? "max-h-0 opacity-0 overflow-hidden mb-0 scale-95 pointer-events-none" : "max-h-[340px] opacity-100"
      }`}>
        <div className="relative w-full h-[280px] rounded-[2rem] overflow-hidden group shadow-2xl border border-white/5 bg-gradient-to-b from-blue-500/20 to-surface">
          
          {/* Glowing Background Icon */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 mt-[-40px]">
            <span 
              className="material-symbols-outlined text-[160px] text-blue-400 group-hover:scale-110 transition-transform duration-700" 
              style={{ fontVariationSettings: "'FILL' 1", filter: 'drop-shadow(0 0 40px currentColor)' }}
            >
              grid_4x4
            </span>
          </div>
          
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent z-10"></div>
          
          <div className="absolute bottom-0 left-0 w-full p-6 z-20 flex flex-col gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/30 backdrop-blur-md">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                Featured Local Game
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">Neon Checkers</h2>
            </div>
            
            <button 
              onClick={() => onPlay("native://checkers")}
              className="bg-white text-black w-full h-12 rounded-xl text-xs font-black tracking-widest uppercase shadow-[0_4px_20px_rgba(255,255,255,0.15)] hover:bg-gray-100 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              Play Now
            </button>
          </div>
        </div>
      </section>

      {/* 🎰 DYNAMIC GENRE MATRIX SECTIONS */}
      <div className="space-y-4">
        {GAME_CATEGORIES.map((category) => {
          const isSelected = activeFilter === category.id;
          const isAnyFilterActive = activeFilter !== null;
          const showGrid = !isAnyFilterActive || isSelected;

          return (
            <section key={category.id} className="space-y-3 transition-all duration-300">
              
              {/* INTERACTIVE HEADER DECK */}
              <div 
                onClick={() => toggleFilter(category.id)}
                className={`p-3 rounded-xl border flex items-center justify-between shadow-sm cursor-pointer transition-all duration-300 select-none ${
                  isSelected 
                    ? "border-primary/40 bg-primary/5 shadow-[0_4px_20px_rgba(192,193,255,0.05)] opacity-100" 
                    : isAnyFilterActive 
                      ? "border-white/5 bg-transparent opacity-20 scale-[0.99] hover:opacity-40"
                      : "border-white/5 bg-surface-variant/20 hover:border-white/10 opacity-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                    isSelected ? "bg-primary/20 border-primary/40 text-primary" : "bg-black/30 border-white/5 text-primary/70"
                  }`}>
                    <span className="material-symbols-outlined text-lg">{category.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white tracking-tight">{category.name}</h3>
                    <p className="text-[9px] text-on-surface-variant/50 font-extrabold uppercase tracking-wider mt-0.5">
                      {category.games.length} {category.games.length === 1 ? "Module" : "Modules"} Online
                    </p>
                  </div>
                </div>
                <span className={`material-symbols-outlined text-sm transition-transform duration-300 ${
                  isSelected ? "text-primary rotate-90 font-bold" : "text-on-surface-variant/40"
                }`}>
                  {isSelected ? "close" : "chevron_right"}
                </span>
              </div>
              
              {/* COLLAPSIBLE PREMIUM GRID LAYER */}
              <div className={`grid grid-cols-2 gap-3 transition-all duration-500 ease-in-out origin-top overflow-hidden ${
                showGrid 
                  ? "max-h-[800px] opacity-100 pt-0.5 scale-100 pointer-events-auto" 
                  : "max-h-0 opacity-0 pt-0 scale-95 pointer-events-none"
              }`}>
                {category.games.map((game) => (
                  <div 
                    key={game.id} 
                    className="group bg-surface-variant/20 rounded-[1.25rem] border border-white/5 overflow-hidden hover:border-white/15 transition-all flex flex-col shadow-lg"
                  >
                    {/* Top Visual Half (Neon Icon + Gradient) */}
                    <div className={`relative h-28 w-full flex items-center justify-center bg-gradient-to-b ${game.bgGradient}`}>
                      <span 
                        className={`material-symbols-outlined text-[48px] ${game.iconColor} transition-transform duration-500 group-hover:scale-110`}
                        style={{ fontVariationSettings: "'FILL' 1", filter: 'drop-shadow(0 0 15px currentColor)' }}
                      >
                        {game.iconName}
                      </span>
                      
                      {/* Status Badge */}
                      <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/5">
                        <span className="text-[8px] text-white/80 font-bold flex items-center gap-1 uppercase tracking-wider">
                          <span className={`w-1 h-1 rounded-full animate-pulse bg-current ${game.iconColor}`}></span>
                          {game.playersOnline}
                        </span>
                      </div>
                    </div>
                    
                    {/* Bottom Content Half */}
                    <div className="p-3 flex flex-col flex-1 justify-between gap-3 bg-surface-variant/30">
                      <div>
                        <h4 className="text-xs font-black text-white group-hover:text-primary transition-colors truncate tracking-tight">
                          {game.title}
                        </h4>
                        <p className="text-[9px] text-on-surface-variant/60 font-medium truncate mt-0.5">
                          {game.genre}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlay(game.url);
                        }}
                        className="w-full py-2 bg-white text-black text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-transform"
                      >
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
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