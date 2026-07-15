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
        id: "rune-masters",
        title: "Rune Masters",
        genre: "Strategy • TCG",
        playersOnline: "2.1k active",
        iconName: "auto_awesome",
        bgImage: "https://lh3.googleusercontent.com/aida-public/AB6AXuAw9GGGfJjQcHurp11YuMunpWW8_UoiW5VBFcBpeW4ZXKttuG0efJ77pk7FtYip6uuNw1RPyxzQV9RuYvt2p7FxheRZJu1YhWAK5zBJ8TQ6vDNcOXv2lrEpvS2EPU4Nv8MXLm7x0y-BFF9BhHyT-6_j7LDaJMB5h9DmaJ9FUlUWj1PLVDOrKUAVexo1F1-BMDPoSvyfDm_KNZRhQp1lD-gjr1nmldpAZ_gDUoCp-Y75SSlwmzVVeQiUZhRIjlR7CKPJp-wfQOpvZw4",
        url: "https://html5.gamedistribution.com/a42b9d8df2e245a4a5bb86524a806954/"
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
  // Active Filter state manages isolated category views via "SEE ALL"
  const [isolatedCategory, setIsolatedCategory] = useState<string | null>(null);

  const displayedCategories = isolatedCategory 
    ? GAME_CATEGORIES.filter(c => c.id === isolatedCategory)
    : GAME_CATEGORIES;

  return (
    <div className="space-y-section-margin w-full pb-12">
      
      {/* 🎁 REWARD HUD */}
      {!isolatedCategory && (
        <section 
          className={`glass-panel rounded-2xl p-4 flex items-center justify-between transition-all duration-300 ${
            rewardClaimed ? "opacity-50" : "shadow-[0_0_20px_rgba(195,244,0,0.1)] border-primary-container/25"
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className={`w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 transition-all ${
              rewardClaimed 
                ? "bg-white/5 text-on-surface-variant" 
                : "bg-primary-container text-neutral-950 shadow-[0_0_15px_rgba(195,244,0,0.3)]"
            }`}>
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>card_giftcard</span>
            </div>
            <div>
              <h3 className={`font-caps text-[10px] uppercase tracking-wider ${rewardClaimed ? "text-on-surface-variant" : "text-surface-tint"}`}>
                Daily Multiplier
              </h3>
              <p className="font-headline text-sm font-bold tracking-tight mt-0.5">
                {rewardClaimed ? "Credits Synced" : "Claim +250 Network Credits"}
              </p>
            </div>
          </div>
          
          <button
            onClick={() => setRewardClaimed(true)}
            disabled={rewardClaimed}
            className={`h-9 px-4 rounded-xl font-headline text-xs font-bold uppercase tracking-wider transition-all ${
              rewardClaimed 
                ? "bg-white/5 text-on-surface-variant border border-white/10 cursor-not-allowed" 
                : "gradient-pill-primary hover:scale-95 active:scale-90 shadow-lg"
            }`}
          >
            {rewardClaimed ? "Claimed" : "Claim"}
          </button>
        </section>
      )}

      {/* 🎯 HERO HERO BANNER */}
      {!isolatedCategory && (
        <section className="relative w-full rounded-[24px] overflow-hidden glass-panel min-h-[300px] flex items-center justify-between p-6 md:p-10 border-white/10">
          <div className="absolute inset-0 bg-gradient-to-r from-tertiary-container/10 to-transparent pointer-events-none"></div>
          <div className="relative z-10 max-w-sm space-y-3">
            <span className="inline-flex items-center font-caps text-[9px] px-2 py-0.5 rounded-md bg-primary-container/20 text-primary-fixed font-bold uppercase tracking-widest border border-primary-container/20">
              Social Arcade Arena
            </span>
            <h1 className="font-headline text-3xl font-extrabold text-white leading-tight">
              Play Together.<br/>Win Together.
            </h1>
            <p className="font-body text-xs text-on-surface-variant leading-relaxed">
              Challenge your friends to instant-play matchmaking and climb the global community boards.
            </p>
            <button 
              onClick={() => onPlay("native://carrom")}
              className="gradient-pill-primary font-headline text-xs font-extrabold uppercase tracking-wider px-6 py-3 rounded-full shadow-[0_0_20px_rgba(195,244,0,0.3)] hover:scale-95 transition-transform active:scale-90 flex items-center justify-center gap-2 mt-4"
          >
              Enter Arena
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </button>
          </div>
          
          <div className="absolute right-0 bottom-0 w-[55%] max-w-[340px] h-auto pointer-events-none">
            <img 
              alt="3D Character Mascot" 
              className="w-full h-full object-contain object-bottom drop-shadow-2xl" 
              src="/assets/raccoon-placeholder.png"
              onError={(e) => {
                // Secure handling in case static PWA configuration delays locally
                e.currentTarget.src = "https://lh3.googleusercontent.com/aida-public/AB6AXuClpYw7-JH_h-D07qCBzyUN4hRD47gznlsDFo8_-LJu1-SSvURw3TafvYea1IOoww68YC1v8DBtkJV7nLpq8C7bOXs4BRcISVP7k7DioFJXZ5HOLHlWB-K0_FHBu0Mxm7i6PBRcvur2qJdpDEcXHqsb0JOMb3wd-QJKG7g6ocrSfdQ6NK9qWJG_AzIoLJktnQh7j4x_iVzEFBomRDHsbxaSoaPK19SVIhu6jmwDbQr15FM2ZtGeJr23tDgq3C0feqDfgZGTGAG8-GY";
              }}
            />
          </div>
        </section>
      )}

      {/* 🎰 DYNAMIC HORIZONTAL ROLL VS GRID EXPANSION */}
      <div className="space-y-element-gap">
        {displayedCategories.map((category) => (
          <section key={category.id} className="space-y-3">
            <div className="flex justify-between items-end px-2">
              <div className="flex items-center gap-2 text-white">
                {isolatedCategory && (
                  <button 
                    onClick={() => setIsolatedCategory(null)}
                    className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center mr-1 text-primary active:scale-90 transition-transform"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span>
                  </button>
                )}
                <span className="material-symbols-outlined text-lg opacity-80">{category.icon}</span>
                <h2 className="font-headline text-base font-extrabold tracking-tight">{category.name}</h2>
              </div>
              
              {!isolatedCategory && (
                <button 
                  onClick={() => setIsolatedCategory(category.id)}
                  className="font-caps text-[10px] text-surface-tint tracking-widest hover:opacity-80 transition-opacity uppercase font-bold"
                >
                  See All
                </button>
              )}
            </div>

            {isolatedCategory ? (
              /* Expanded High-Fidelity Layout Grid System */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                {category.games.map((game) => (
                  <div 
                    key={game.id} 
                    onClick={() => onPlay(game.url)}
                    className="relative w-full h-[220px] rounded-[24px] overflow-hidden glass-panel group cursor-pointer border border-white/5"
                  >
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url('${game.bgImage}')` }}></div>
                    <div className="absolute inset-0 game-card-gradient"></div>
                    <div className="absolute top-4 right-4 glass-panel border-white/10 px-2 py-1 rounded-lg backdrop-blur-md z-20">
                      <span className="text-[9px] font-caps text-white font-bold flex items-center gap-1.5 uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${game.playersOnline.includes("Local") ? "bg-amber-400" : "bg-primary-container animate-pulse"}`}></span>
                        {game.playersOnline}
                      </span>
                    </div>
                    <div className="absolute bottom-0 w-full p-5 flex justify-between items-end z-20">
                      <div>
                        <h3 className="font-headline text-base font-extrabold text-white">{game.title}</h3>
                        <p className="font-caps text-[9px] text-on-surface-variant tracking-wider uppercase mt-0.5">{game.genre}</p>
                      </div>
                      <button className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white group-hover:bg-primary-container group-hover:text-neutral-950 transition-all shadow-md">
                        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Standard Horizontal Navigation Strip */
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 pr-10 snap-x">
                {category.games.map((game) => (
                  <div 
                    key={game.id} 
                    onClick={() => onPlay(game.url)}
                    className="relative min-w-[280px] w-[75vw] md:min-w-[300px] h-[340px] rounded-[24px] overflow-hidden snap-start glass-panel flex-shrink-0 group cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url('${game.bgImage}')` }}></div>
                    <div className="absolute inset-0 game-card-gradient"></div>
                    <div className="absolute top-4 right-4 glass-panel border-white/10 px-2 py-1 rounded-lg backdrop-blur-md z-20">
                      <span className="text-[9px] font-caps text-white font-bold flex items-center gap-1.5 uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${game.playersOnline.includes("Local") ? "bg-amber-400" : "bg-primary-container animate-pulse"}`}></span>
                        {game.playersOnline}
                      </span>
                    </div>
                    <div className="absolute bottom-0 w-full p-5 flex justify-between items-end z-20">
                      <div>
                        <h3 className="font-headline text-base font-extrabold text-white">{game.title}</h3>
                        <p className="font-caps text-[9px] text-on-surface-variant tracking-wider uppercase mt-0.5">{game.genre}</p>
                      </div>
                      <button className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white group-hover:bg-primary-container group-hover:text-neutral-950 transition-all shadow-md group-hover:scale-105">
                        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
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