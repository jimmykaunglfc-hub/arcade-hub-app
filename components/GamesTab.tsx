"use client";

import { useState } from "react";
import Image from "next/image";

// 🎮 DYNAMIC CONFIGURATION: Clean registry matching your production game servers
const GAME_CATEGORIES = [
  {
    id: "strategy-cards",
    name: "Strategy & Mind Games",
    icon: "extension",
    games: [
      {
        id: "glitch-deck",
        title: "Glitch Deck",
        genre: "Cyberpunk • TCG",
        playersOnline: "1.4k",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDPlvQO6SLDrjZ1pmK6kLJEnsnrs7aKSTKqlqLfQHDl-OMO97S0w-zpqM-w0Awpe-wdkdnJi_lTYtMCuexKs7Yzxgre_HSRjzczg_xhlBTsfodl5tMCrA6UYKr7wKEbJJe4tbEK6QatAXDI07s7951P7-MPOVtzzMz5bbLZ0uWFaYa6zLg49qCGTCNLSKQL_ZErQhHvCxDPIE5tk23_7VVoP0QvGEaAMpm2V1OtqXUz3NYRbxN6ozUrUjtmv1SpVJud1dzla5FIg8w9", 
        url: "native://glitch-deck"
      },
      {
        id: "checkers-matrix",
        title: "Neon Checkers",
        genre: "Board • Local PvP",
        playersOnline: "Local",
        image: "https://images.unsplash.com/photo-1610893563969-1c9f4d2f0eb3?q=80&w=400&auto=format&fit=crop", 
        url: "native://checkers" // This exact string triggers your interceptor
      },
      {
        id: "rune-masters",
        title: "Rune Masters",
        genre: "Strategy • TCG",
        playersOnline: "2.1k",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDPlvQO6SLDrjZ1pmK6kLJEnsnrs7aKSTKqlqLfQHDl-OMO97S0w-zpqM-w0Awpe-wdkdnJi_lTYtMCuexKs7Yzxgre_HSRjzczg_xhlBTsfodl5tMCrA6UYKr7wKEbJJe4tbEK6QatAXDI07s7951P7-MPOVtzzMz5bbLZ0uWFaYa6zLg49qCGTCNLSKQL_ZErQhHvCxDPIE5tk23_7VVoP0QvGEaAMpm2V1OtqXUz3NYRbxN6ozUrUjtmv1SpVJud1dzla5FIg8w9",
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
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuB-omzcpqP_nX1IVJuhTGouka2MtB2NRr-ZWjxmzqhKf0pPrt-t2BXpHBK5LBkuZaFbz-qAX9KlCcPrHUR7rDVD6c27UfI67olPWNil2ImUUGW5iOqoFYy_cU39bCMCUZ9EhuRnS9VH2MBH5ssat1v23rNe5Ciw0evZuxJ34lzsn0cR35AaJQ5VQmPiJuMNKPzvlFdSEeAt-wdnoCwCB6VmC1D1TmfO3D7XpSvCIuDYDkMx1WdYjwPBQvGuLOMLn5WHS9OzvYX4Bhv4",
        url: "https://html5.gamedistribution.com/b5a5b54637ad4f7c80521e1cb04a23de/"
      },
      {
        id: "cyber-strike",
        title: "Cyber Rush",
        genre: "Sci-Fi • Runner",
        playersOnline: "1.8k",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCDWi0vHBPdvrMvPsHSjIr4iGJaPgzsKFI5rkxmLiVWSV6c96FJfaN3qIpAORfJOEHz25UXVRs6rRAKS4DfAGSGnB65UjR-mxlovxsHu7zIPhMxrJEgQ-1exNCXgot5aPNdKufOQP3PgLef_aRzA_QucXho13idZG0TQtdrJUR3YQruGpLl-HGltKlMqC5YzV3opHuC5ed0tEnvW7CgOquChq5bJzp8kMB9-PhV9z3YAmEgnd5EI4us8zRxNna-19kQ5QJk5M3UpnkN",
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

      {/* 🎯 ULTRA-PREMIUM FEATURED CONSOLE VIEW */}
      <section className={`transition-all duration-500 ease-in-out origin-top ${
        activeFilter ? "max-h-0 opacity-0 overflow-hidden mb-0 scale-95 pointer-events-none" : "max-h-[420px] opacity-100"
      }`}>
        <div className="relative w-full h-[320px] rounded-[2rem] overflow-hidden group shadow-2xl border border-white/5 bg-surface-variant/20">
          <Image 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCDWi0vHBPdvrMvPsHSjIr4iGJaPgzsKFI5rkxmLiVWSV6c96FJfaN3qIpAORfJOEHz25UXVRs6rRAKS4DfAGSGnB65UjR-mxlovxsHu7zIPhMxrJEgQ-1exNCXgot5aPNdKufOQP3PgLef_aRzA_QucXho13idZG0TQtdrJUR3YQruGpLl-HGltKlMqC5YzV3opHuC5ed0tEnvW7CgOquChq5bJzp8kMB9-PhV9z3YAmEgnd5EI4us8zRxNna-19kQ5QJk5M3UpnkN" 
            alt="8-Ball Pool Pro" 
            fill 
            className="object-cover opacity-85 transition-transform duration-700 group-hover:scale-103" 
            unoptimized 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent z-10"></div>
          
          <div className="absolute bottom-0 left-0 w-full p-6 z-20 flex flex-col gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest border border-primary/30 backdrop-blur-md">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                Featured Classic
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight">8-Ball Pool Pro</h2>
            </div>
            
            <button 
              onClick={() => onPlay("https://html5.gamedistribution.com/f9c8f2b3e4a2434ab4146a4897ab3979/")}
              className="bg-primary text-on-primary w-full h-12 rounded-xl text-xs font-black tracking-widest uppercase shadow-[0_4px_20px_rgba(192,193,255,0.2)] hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-sm font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              Initialize Match Engine
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay(game.url);
                    }}
                    className="group cursor-pointer bg-gradient-to-b from-surface-variant/30 to-surface rounded-2xl p-2 border border-white/5 hover:border-primary/30 active:scale-[0.98] transition-all duration-300 shadow-md flex flex-col justify-between"
                  >
                    <div className="relative aspect-[4/5] rounded-xl overflow-hidden mb-2 shadow-inner">
                      <Image 
                        src={game.image} 
                        alt={game.title} 
                        fill 
                        className="object-cover transition-transform duration-500 group-hover:scale-103" 
                        unoptimized 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                      
                      <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10">
                        <span className="text-[8px] text-secondary font-black flex items-center gap-1 uppercase tracking-wider">
                          <span className="w-1 h-1 rounded-full bg-secondary animate-pulse"></span>
                          {game.playersOnline}
                        </span>
                      </div>
                    </div>
                    
                    <div className="px-1.5 pb-1 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        <h4 className="text-xs font-black text-white group-hover:text-primary transition-colors truncate tracking-tight">
                          {game.title}
                        </h4>
                        <p className="text-[9px] text-on-surface-variant/60 font-medium truncate mt-0.5">
                          {game.genre}
                        </p>
                      </div>
                      <span className="material-symbols-outlined text-sm text-on-surface-variant/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                        arrow_forward
                      </span>
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