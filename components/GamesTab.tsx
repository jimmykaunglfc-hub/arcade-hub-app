import { useState } from "react";
import Image from "next/image";

// 🛠️ DYNAMIC CONFIGURATION: Keeps your categories adjustable at any time!
const GAME_CATEGORIES = [
  {
    id: "strategy-cards",
    name: "Strategy & Mind Games",
    icon: "extension",
    games: [
      {
        id: "glitch-deck", // ⚠️ Must match this exact text string!
        title: "Glitch Deck",
        genre: "Cyberpunk • TCG",
        playersOnline: "1.4k",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDPlvQO6SLDrjZ1pmK6kLJEnsnrs7aKSTKqlqLfQHDl-OMO97S0w-zpqM-w0Awpe-wdkdnJi_lTYtMCuexKs7Yzxgre_HSRjzczg_xhlBTsfodl5tMCrA6UYKr7wKEbJJe4tbEK6QatAXDI07s7951P7-MPOVtzzMz5bbLZ0uWFaYa6zLg49qCGTCNLSKQL_ZErQhHvCxDPIE5tk23_7VVoP0QvGEaAMpm2V1OtqXUz3NYRbxN6ozUrUjtmv1SpVJud1dzla5FIg8w9", 
        url: "native://glitch-deck" // 👉 Tells our launcher engine to fire the React code instead of an iframe
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
  },
  {
    id: "strategy-cards",
    name: "Strategy & Mind Games",
    icon: "extension",
    games: [
      {
        id: "rune-masters",
        title: "Rune Masters",
        genre: "Strategy • TCG",
        playersOnline: "2.1k",
        image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDPlvQO6SLDrjZ1pmK6kLJEnsnrs7aKSTKqlqLfQHDl-OMO97S0w-zpqM-w0Awpe-wdkdnJi_lTYtMCuexKs7Yzxgre_HSRjzczg_xhlBTsfodl5tMCrA6UYKr7wKEbJJe4tbEK6QatAXDI07s7951P7-MPOVtzzMz5bbLZ0uWFaYa6zLg49qCGTCNLSKQL_ZErQhHvCxDPIE5tk23_7VVoP0QvGEaAMpm2V1OtqXUz3NYRbxN6ozUrUjtmv1SpVJud1dzla5FIg8w9",
        url: "https://html5.gamedistribution.com/a42b9d8df2e245a4a5bb86524a806954/"
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
  setRewardClaimed: any;
  onPlay: (url: string) => void;
}) {
  // 🕹️ FILTER STATE: Tracks which category ID is isolated (null means show all)
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const toggleFilter = (categoryId: string) => {
    setActiveFilter(activeFilter === categoryId ? null : categoryId);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* 🎁 Daily Reward Banner */}
      <section 
        className="relative overflow-hidden rounded-2xl p-4 bg-surface-variant flex items-center justify-between border border-white/10 shadow-lg animate-fade-in"
        style={{ boxShadow: rewardClaimed ? '0 0 30px rgba(74, 225, 118, 0.2)' : 'none' }}
      >
        <div className="flex items-center gap-4 z-10">
          <div className="w-12 h-12 bg-secondary/20 flex items-center justify-center rounded-xl border border-secondary/30">
            <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              card_giftcard
            </span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Daily Reward</h3>
            <p className="text-sm text-white font-medium mt-0.5">Claim +250 Credits!</p>
          </div>
        </div>
        <button
          onClick={() => setRewardClaimed(true)}
          disabled={rewardClaimed}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all z-10 ${
            rewardClaimed 
              ? 'bg-surface text-on-surface-variant opacity-50' 
              : 'bg-secondary text-on-secondary shadow-[0_0_15px_rgba(74,225,118,0.4)] active:scale-95'
          }`}
        >
          {rewardClaimed ? "CLAIMED" : "CLAIM"}
        </button>
      </section>

      {/* 🎯 Featured Game Card - Automatically fades out if a filter is active to save screen space */}
      <section className={`transition-all duration-500 origin-top ${activeFilter ? 'max-h-0 opacity-0 overflow-hidden pointer-events-none mb-0 scale-95' : 'max-h-[400px] opacity-100 mb-6'}`}>
        <div className="relative w-full h-[360px] rounded-[32px] overflow-hidden group shadow-2xl border border-white/5">
          <Image 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCDWi0vHBPdvrMvPsHSjIr4iGJaPgzsKFI5rkxmLiVWSV6c96FJfaN3qIpAORfJOEHz25UXVRs6rRAKS4DfAGSGnB65UjR-mxlovxsHu7zIPhMxrJEgQ-1exNCXgot5aPNdKufOQP3PgLef_aRzA_QucXho13idZG0TQtdrJUR3YQruGpLl-HGltKlMqC5YzV3opHuC5ed0tEnvW7CgOquChq5bJzp8kMB9-PhV9z3YAmEgnd5EI4us8zRxNna-19kQ5QJk5M3UpnkN" 
            alt="8-Ball Pool Pro" 
            fill 
            className="object-cover transition-transform duration-700 group-hover:scale-105" 
            unoptimized 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent z-10"></div>
          <div className="absolute bottom-0 left-0 w-full p-6 z-20 flex flex-col gap-4">
            <div className="space-y-1">
              <span className="bg-primary/20 text-primary px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border border-primary/20 backdrop-blur-md w-fit inline-block">
                Featured Game
              </span>
              <h2 className="text-3xl font-black text-white tracking-tight">8-Ball Pool Pro</h2>
            </div>
            <button 
              onClick={() => onPlay("https://html5.gamedistribution.com/f9c8f2b3e4a2434ab4146a4897ab3979/")}
              className="bg-primary text-on-primary w-full py-3.5 rounded-2xl text-sm font-extrabold shadow-[0_0_20px_rgba(192,193,255,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              Play Now
            </button>
          </div>
        </div>
      </section>

      {/* 🎰 DYNAMIC CATEGORIES GENERATOR */}
      {GAME_CATEGORIES.map((category) => {
        const isSelected = activeFilter === category.id;
        const isAnyFilterActive = activeFilter !== null;
        const showGrid = !isAnyFilterActive || isSelected;

        return (
          <section key={category.id} className="space-y-4">
            
            {/* 💳 CARD STYLE DISPLAY WITH INTERACTIVE TOGGLE */}
            <div 
              onClick={() => toggleFilter(category.id)}
              className={`p-3.5 rounded-2xl border flex items-center justify-between shadow-md cursor-pointer transition-all duration-300 active:scale-[0.99] select-none ${
                isSelected 
                  ? 'border-primary bg-gradient-to-r from-primary/20 via-surface-variant/40 to-surface-variant/10 shadow-[0_0_20px_rgba(192,193,255,0.15)] opacity-100' 
                  : isAnyFilterActive 
                    ? 'border-white/5 bg-surface-variant/10 opacity-30 scale-[0.98] hover:opacity-50'
                    : 'border-white/5 bg-gradient-to-r from-surface-variant/60 via-surface-variant/30 to-transparent hover:border-white/10 opacity-100'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Dynamic Icon Badge */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                  isSelected 
                    ? 'bg-primary/20 border-primary shadow-[0_0_10px_rgba(192,193,255,0.3)]' 
                    : 'bg-primary/10 border-primary/20'
                }`}>
                  <span className={`material-symbols-outlined transition-colors ${isSelected ? 'text-primary' : 'text-primary/70'} text-xl`}>
                    {category.icon}
                  </span>
                </div>
                {/* Category Text Information */}
                <div>
                  <h3 className="text-base font-black text-white tracking-tight">{category.name}</h3>
                  <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
                    {category.games.length} {category.games.length === 1 ? 'Game' : 'Games'} Live
                  </p>
                </div>
              </div>
              {/* Dynamic Status Icon Changer */}
              <span className={`material-symbols-outlined text-sm transition-all duration-300 ${
                isSelected ? 'text-primary rotate-90 font-bold' : 'text-on-surface-variant/40'
              }`}>
                {isSelected ? 'close' : 'chevron_right'}
              </span>
            </div>
            
            {/* 🕹️ SMOOTH COLLAPSIBLE GAMES GRID */}
            <div className={`grid grid-cols-2 gap-4 transition-all duration-500 ease-in-out origin-top overflow-hidden ${
              showGrid 
                ? 'max-h-[1000px] opacity-100 pt-1 scale-100 pointer-events-auto' 
                : 'max-h-0 opacity-0 pt-0 scale-95 pointer-events-none'
            }`}>
              {category.games.map((game) => (
                <div 
                  key={game.id} 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevents clicking the game from accidentally toggling the category card
                    onPlay(game.url);
                  }}
                  className="group cursor-pointer bg-surface-variant/15 rounded-2xl p-2 border border-white/5 active:scale-[0.98] transition-transform"
                >
                  <div className="relative aspect-[4/5] rounded-xl overflow-hidden mb-2.5">
                    <Image 
                      src={game.image} 
                      alt={game.title} 
                      fill 
                      className="object-cover transition-transform duration-500 group-hover:scale-105" 
                      unoptimized 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
                      <span className="text-[9px] text-secondary font-black flex items-center gap-1">
                        <span className="material-symbols-outlined text-[6px]" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                        {game.playersOnline}
                      </span>
                    </div>
                  </div>
                  <div className="px-1 pb-1">
                    <h4 className="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">{game.title}</h4>
                    <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{game.genre}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

    </div>
  );
}