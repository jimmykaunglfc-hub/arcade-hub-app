"use client";

import { useState } from "react";

const GAME_CATEGORIES = [
  {
    id: "strategy-cards",
    name: "Strategy & Board Games",
    icon: "extension",
    games: [
      {
        id: "checkers-matrix",
        title: "Neon Checkers",
        genre: "Board • Network Live",
        playersOnline: "Live PvP",
        iconName: "grid_4x4",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuCvofxe0cbVXZqLn_t3gwLdy00XU5HvlgFkMeixWwCaLvlL9NvuJNcX9cDv0eliUrYMT6SNAVV7w9SCuKnukyCK9lYu9lAYPPvKwjK2sK8NG6d0BAu7f9PHvK30yA4diELAKHs5Nv4A7uRI68iPIlrPYIEStcCMyPWrdqIXtnAf64ND7knY9QShUI0gKz4OVyAAkmKPyPMGGRKbGuSowEuAuMxFrLaXWsHXEddOrNz3Z7zeNEE1b_IiLRwln8jsWh4Wr0OfzaZrs8g",
        url: "native://checkers" 
      },
      {
        id: "carrom-matrix",
        title: "Carrom Matrix",
        genre: "Physics • Board",
        playersOnline: "Live PvP",
        iconName: "radio_button_checked",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuCU6iWQ8wFtq2SwggNs8HUkZcHH9f0dGAwuO2iqBKx64uqGsvowSALLlJg2kt36RBZbgDfZcSdT73jAcUw8SiFAk78lIIDAciEdsFulLFcdNdVPAADMjvgvpMuAyASQT1fvELbg05gSgiJLsL-ZRa-usAmVaKqW42WiuxhCFjFw7LEHgUQDAmy-OEB6wlxKimr8aBkGSfvMOXLgfC6ivctbxrt5zI2HkQS5fPbZzQDPhf-pT4-toM2hS9msonjTOmaWxdDsl27kXtY",
        url: "native://carrom" 
      },
      {
        id: "glitch-deck",
        title: "Glitch Deck",
        genre: "Cyberpunk • TCG",
        playersOnline: "1.4k active",
        iconName: "style",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuAw9GGGfJjQcHurp11YuMunpWW8_UoiW5VBFcBpeW4ZXKttuG0efJ77pk7FtYip6uuNw1RPyxzQV9RuYvt2p7FxheRZJu1YhWAK5zBJ8TQ6vDNcOXv2lrEpvS2EPU4Nv8MXLm7x0y-BFF9BhHyT-6_j7LDaJMB5h9DmaJ9FUlUWj1PLVDOrKUAVexo1F1-BMDPoSvyfDm_KNZRhQp1lD-gjr1nmldpAZ_gDUoCp-Y75SSlwmzVVeQiUZhRIjlR7CKPJp-wfQOpvZw4",
        url: "native://glitch-deck"
      }
    ]
  },
  {
    id: "party-games",
    name: "Party Games",
    icon: "celebration",
    games: [
      {
        id: "nexus-breach",
        title: "Nexus Breach",
        genre: "Luck • Penalties",
        playersOnline: "Local Party",
        iconName: "hexagon",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuDikZ3MZE0aAqLwH11sD5yC2-nVFwwhEWYnY07L6UvxACZFNhJqqhTOyAU4vmHtTDn7x6OK6tYae7TftcTRzVIfaskLBdB5RirAuqhy4ewx3dL3uV6rHaGpyI0kVujWKsWnRiPJibix8CyA3iLfsGFGJFQFBU2McThKv_bhmR1NxoEyTrwlZOae_huSEtAlaUhdbxDFjnT_7oZ0wWjWgsTGFU6tnFvL79ObFcPwU3VhsS5G-jmppdW79ty_x9LS4L86qw72RVdUuTA",
        url: "native://nexus-breach" 
      },
      {
        id: "liars-dice",
        title: "Liar's Dice",
        genre: "Bluffing • Party",
        playersOnline: "Local Party",
        iconName: "casino",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuAK9-peJla1aHe6zB35cdYyNUhbHTQ7OTuWC8KFJHxTRzeWsF0JqXNwnb4FPrYuaQJo0_8Ofz6a71mZ5YAzLDp9w-4ubDt74H67Q8teuvldPznwH5LiAph0QfHncecYxOHRKMHMVwLMX39RoRk0EeAQN7Pz1gqzezTuD18OJLMWEji2N4iuSDgUDpOzHIySMsfvFjnl3zgd7Nda5an0LOAuUq9ju3p2KoOTZeVdevPYAkvP2HZQeJyHvPka-AFXat-zug7pgG8r2Pg",
        url: "native://liars-dice" 
      },
      {
        id: "neural-duel",
        title: "Neural Duel",
        genre: "Reflex • PvP",
        playersOnline: "Local Party",
        iconName: "bolt",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuAw9GGGfJjQcHurp11YuMunpWW8_UoiW5VBFcBpeW4ZXKttuG0efJ77pk7FtYip6uuNw1RPyxzQV9RuYvt2p7FxheRZJu1YhWAK5zBJ8TQ6vDNcOXv2lrEpvS2EPU4Nv8MXLm7x0y-BFF9BhHyT-6_j7LDaJMB5h9DmaJ9FUlUWj1PLVDOrKUAVexo1F1-BMDPoSvyfDm_KNZRhQp1lD-gjr1nmldpAZ_gDUoCp-Y75SSlwmzVVeQiUZhRIjlR7CKPJp-wfQOpvZw4",
        url: "native://neural-duel" 
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
  const [isolatedCategory, setIsolatedCategory] = useState<string | null>(null);

  const displayedCategories = isolatedCategory 
    ? GAME_CATEGORIES.filter(c => c.id === isolatedCategory)
    : GAME_CATEGORIES;

  return (
    <div className="space-y-4 w-full pb-6">
      
      {/* 🎁 REWARD MULTIPLIER HUD */}
      {!isolatedCategory && (
        <section 
          className={`glass-panel rounded-2xl p-3.5 flex items-center justify-between transition-all duration-300 ${
            rewardClaimed ? "opacity-50" : "shadow-[0_0_20px_rgba(195,244,0,0.05)] border-primary-container/20"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 transition-all ${
              rewardClaimed ? "bg-white/5 text-on-surface-variant" : "bg-primary-container text-neutral-950"
            }`}>
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>card_giftcard</span>
            </div>
            <div>
              <h3 className={`font-caps text-[9px] uppercase tracking-wider ${rewardClaimed ? "text-on-surface-variant" : "text-surface-tint"}`}>
                Daily Multiplier
              </h3>
              <p className="font-headline text-xs font-bold tracking-tight mt-0.5">
                {rewardClaimed ? "Credits Synced" : "Claim +250 Credits"}
              </p>
            </div>
          </div>
          
          <button
            onClick={() => setRewardClaimed(true)}
            disabled={rewardClaimed}
            className={`h-8 px-3 rounded-lg font-headline text-[11px] font-bold uppercase tracking-wider transition-all ${
              rewardClaimed ? "bg-white/5 text-on-surface-variant border border-white/10 cursor-not-allowed" : "gradient-pill-primary shadow-md"
            }`}
          >
            {rewardClaimed ? "Claimed" : "Claim"}
          </button>
        </section>
      )}

      {/* 🎯 HERO HUB BANNER */}
      {!isolatedCategory && (
        <section className="relative w-full rounded-[20px] overflow-hidden glass-panel min-h-[220px] flex items-center justify-between p-5 border-white/10">
          <div className="absolute inset-0 bg-gradient-to-r from-tertiary-container/10 to-transparent pointer-events-none"></div>
          <div className="relative z-10 max-w-[210px] space-y-2">
            <span className="inline-flex items-center font-caps text-[8px] px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-fixed font-bold uppercase tracking-widest border border-primary-container/10">
              Social Arcade
            </span>
            <h1 className="font-headline text-xl font-black text-white leading-tight">
              Play Together.<br/>Win Together.
            </h1>
            <p className="font-body text-[10px] text-on-surface-variant leading-snug">
              Challenge friends and climb the community boards.
            </p>
            <button 
              onClick={() => onPlay("native://carrom")}
              className="gradient-pill-primary font-caps text-[9px] font-extrabold uppercase tracking-widest px-4 py-2 rounded-full shadow-md flex items-center justify-center gap-1 mt-2"
            >
              Enter Arena
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </button>
          </div>
          
          <div className="absolute right-0 bottom-0 w-[50%] max-w-[240px] h-auto pointer-events-none">
            <img 
              alt="Mascot Asset" 
              className="w-full h-full object-contain object-bottom drop-shadow-2xl" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuClpYw7-JH_h-D07qCBzyUN4hRD47gznlsDFo8_-LJu1-SSvURw3TafvYea1IOoww68YC1v8DBtkJV7nLpq8C7bOXs4BRcISVP7k7DioFJXZ5HOLHlWB-K0_FHBu0Mxm7i6PBRcvur2qJdpDEcXHqsb0JOMb3wd-QJKG7g6ocrSfdQ6NK9qWJG_AzIoLJktnQh7j4x_iVzEFBomRDHsbxaSoaPK19SVIhu6jmwDbQr15FM2ZtGeJr23tDgq3C0feqDfgZGTGAG8-GY"
            />
          </div>
        </section>
      )}

      {/* 🎰 SCALED HORIZONTAL CHANNELS */}
      <div className="space-y-4">
        {displayedCategories.map((category) => (
          <section key={category.id} className="space-y-2">
            <div className="flex justify-between items-end px-1">
              <div className="flex items-center gap-2 text-white">
                {isolatedCategory && (
                  <button 
                    onClick={() => setIsolatedCategory(null)}
                    className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center mr-0.5 text-primary"
                  >
                    <span className="material-symbols-outlined text-xs">arrow_back_ios_new</span>
                  </button>
                )}
                <span className="material-symbols-outlined text-base opacity-70">{category.icon}</span>
                <h2 className="font-headline text-sm font-bold tracking-tight">{category.name}</h2>
              </div>
              
              {!isolatedCategory && (
                <button 
                  onClick={() => setIsolatedCategory(category.id)}
                  className="font-caps text-[9px] text-surface-tint tracking-widest uppercase font-bold"
                >
                  See All
                </button>
              )}
            </div>

            {isolatedCategory ? (
              <div className="grid grid-cols-2 gap-3 animate-fade-in">
                {category.games.map((game) => (
                  <div 
                    key={game.id} 
                    onClick={() => onPlay(game.url)}
                    className="relative w-full h-[180px] rounded-[16px] overflow-hidden glass-panel group cursor-pointer border border-white/5"
                  >
                    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${game.bgImage}')` }}></div>
                    <div className="absolute inset-0 game-card-gradient"></div>
                    <div className="absolute top-2 right-2 bg-black/40 border border-white/10 px-1.5 py-0.5 rounded-md backdrop-blur-sm z-20">
                      <span className="text-[7px] font-caps text-white font-bold flex items-center gap-1 uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${game.playersOnline.includes("Local") ? "bg-amber-400" : "bg-primary-container animate-pulse"}`}></span>
                        {game.playersOnline}
                      </span>
                    </div>
                    <div className="absolute bottom-0 w-full p-3 flex justify-between items-end z-20">
                      <div>
                        <h3 className="font-headline text-xs font-bold text-white truncate max-w-[100px]">{game.title}</h3>
                        <p className="font-caps text-[7px] text-on-surface-variant tracking-wider uppercase mt-0.5">{game.genre}</p>
                      </div>
                      <button className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-md">
                        <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 pr-4 snap-x">
                {category.games.map((game) => (
                  <div 
                    key={game.id} 
                    onClick={() => onPlay(game.url)}
                    className="relative min-w-[210px] w-[58vw] md:min-w-[230px] h-[255px] rounded-[20px] overflow-hidden snap-start glass-panel flex-shrink-0 group cursor-pointer border border-white/5"
                  >
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url('${game.bgImage}')` }}></div>
                    <div className="absolute inset-0 game-card-gradient"></div>
                    <div className="absolute top-3 right-3 bg-black/40 border border-white/10 px-1.5 py-0.5 rounded-md backdrop-blur-sm z-20">
                      <span className="text-[8px] font-caps text-white font-bold flex items-center gap-1 uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${game.playersOnline.includes("Local") ? "bg-amber-400" : "bg-primary-container animate-pulse"}`}></span>
                        {game.playersOnline}
                      </span>
                    </div>

                    <div className="absolute bottom-0 w-full p-4 flex justify-between items-end z-20">
                      <div className="max-w-[130px]">
                        <h3 className="font-headline text-xs font-black text-white truncate">{game.title}</h3>
                        <p className="font-caps text-[8px] text-on-surface-variant tracking-wider uppercase mt-0.5 truncate">{game.genre}</p>
                      </div>
                      <button className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white group-hover:bg-primary-container group-hover:text-neutral-950 transition-all shadow-md">
                        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

    </div>
  );
}