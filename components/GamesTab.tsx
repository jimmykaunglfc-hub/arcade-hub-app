"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

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

interface GamesTabProps {
  rewardClaimed: boolean;
  setRewardClaimed: (status: boolean) => void;
  currentPoints: number;
  userId: string | null;
  onPlay: (url: string) => void;
}

export default function GamesTab({ 
  rewardClaimed, 
  setRewardClaimed, 
  currentPoints, 
  userId, 
  onPlay 
}: GamesTabProps) {
  const [isolatedCategory, setIsolatedCategory] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const displayedCategories = isolatedCategory 
    ? GAME_CATEGORIES.filter(c => c.id === isolatedCategory) 
    : GAME_CATEGORIES;

  // Handles real database updates for daily checking pipeline
  const handleDailyCheckIn = async () => {
    if (rewardClaimed || !userId || claiming) return;
    setClaiming(true);

    try {
      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .single();
        
      const startingPoints = currentProfile?.points ?? 0;

      await supabase.from("profiles")
        .update({
          points: startingPoints + 250,
          last_login_claim: new Date().toISOString()
        })
        .eq("id", userId);

      setRewardClaimed(true);
    } catch (err) {
      console.error("Ledger communication error:", err);
    } finally {
      setClaiming(false);
    }
  };

  const executeLaunchEngine = (url: string) => {
    // Check if player has run out of tokens before allowing access into online rooms
    const isLocalGame = url.includes("nexus-breach") || url.includes("liars-dice") || url.includes("neural-duel");
    if (currentPoints <= 0 && !isLocalGame) {
      alert("Matchmaking Halted: You have depleted your network credits. Spin the Shop core wheel or purchase a points voucher to resume online multiplayer matches.");
      return;
    }
    onPlay(url);
  };

  return (
    <div className="space-y-4 w-full pb-6">
      
      {/* 🎁 REWARD MULTIPLIER HUD */}
      {!isolatedCategory && (
        <section className={`bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl rounded-2xl p-3.5 flex items-center justify-between transition-all duration-300 ${rewardClaimed ? "opacity-50" : "shadow-sm border-indigo-500/20"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center rounded-xl border border-neutral-200 dark:border-white/10 transition-all ${rewardClaimed ? "bg-neutral-100 dark:bg-white/5 text-neutral-400" : "bg-indigo-600 dark:bg-primary-container text-white dark:text-neutral-950 shadow-sm"}`}>
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>card_giftcard</span>
            </div>
            <div>
              <h3 className={`font-caps text-[9px] uppercase tracking-wider ${rewardClaimed ? "text-neutral-400" : "text-indigo-600 dark:text-surface-tint"}`}>Daily Multiplier</h3>
              <p className="font-headline text-xs font-bold tracking-tight mt-0.5 text-neutral-900 dark:text-white">{rewardClaimed ? "Credits Synced" : "Claim +250 Credits"}</p>
            </div>
          </div>
          
          <button
            onClick={handleDailyCheckIn}
            disabled={rewardClaimed || claiming}
            className={`h-8 px-3 rounded-lg font-headline text-[11px] font-bold uppercase tracking-wider transition-all ${rewardClaimed ? "bg-neutral-100 dark:bg-white/5 text-neutral-400 border border-neutral-200 dark:border-white/10 cursor-not-allowed" : "gradient-pill-primary shadow-md"}`}
          >
            {claiming ? "Syncing..." : rewardClaimed ? "Claimed" : "Claim"}
          </button>
        </section>
      )}

      {/* 🎯 HERO HUB BANNER */}
      {!isolatedCategory && (
        <section className="relative w-full rounded-[20px] overflow-hidden bg-white/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 backdrop-blur-xl min-h-[220px] flex items-center justify-between p-5 shadow-sm transition-colors duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 dark:from-tertiary-container/10 to-transparent pointer-events-none"></div>
          <div className="relative z-10 max-w-[210px] space-y-2">
            <span className="inline-flex items-center font-caps text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/10 dark:bg-primary-container/20 text-indigo-600 dark:text-primary-fixed font-bold uppercase tracking-widest border border-indigo-500/10 dark:border-primary-container/10">Social Arcade</span>
            <h1 className="font-headline text-xl font-black text-[#091428] dark:text-white leading-tight">Play Together.<br/>Win Together.</h1>
            <p className="font-body text-[10px] text-neutral-500 dark:text-on-surface-variant leading-snug">Challenge friends and climb the community boards.</p>
            <button 
              onClick={() => executeLaunchEngine("native://carrom")}
              className="gradient-pill-primary font-caps text-[9px] font-make font-extrabold uppercase tracking-widest px-4 py-2 rounded-full shadow-md flex items-center justify-center gap-1 mt-2"
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

      {/* 🎰 ARCADE ROWS SCROLLER MODULE */}
      <div className="space-y-4">
        {displayedCategories.map((category) => (
          <section key={category.id} className="space-y-2">
            <div className="flex justify-between items-end px-1">
              <div className="flex items-center gap-2 text-[#091428] dark:text-white">
                {isolatedCategory && (
                  <button 
                    onClick={() => setIsolatedCategory(null)} 
                    className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-white/10 flex items-center justify-center mr-0.5 text-[#091428] dark:text-primary"
                  >
                    <span className="material-symbols-outlined text-xs">arrow_back_ios_new</span>
                  </button>
                )}
                <span className="material-symbols-outlined text-base opacity-70">{category.icon}</span>
                <h2 className="font-headline text-sm font-black tracking-tight">{category.name}</h2>
              </div>
              {!isolatedCategory && (
                <button 
                  onClick={() => setIsolatedCategory(category.id)} 
                  className="font-caps text-[9px] text-indigo-600 dark:text-surface-tint tracking-widest uppercase font-bold"
                >
                  See All
                </button>
              )}
            </div>

            <div className={isolatedCategory ? "grid grid-cols-2 gap-3 animate-fade-in" : "flex gap-3 overflow-x-auto no-scrollbar pb-1 pr-4 snap-x"}>
              {category.games.map((game) => {
                const isOnlineGame = !game.playersOnline.includes("Local");
                const isLockedOut = currentPoints <= 0 && isOnlineGame;

                return (
                  <div 
                    key={game.id} 
                    onClick={() => executeLaunchEngine(game.url)}
                    className={isolatedCategory 
                      ? "relative w-full h-[180px] rounded-[16px] overflow-hidden group cursor-pointer border border-neutral-200 dark:border-white/5 shadow-sm"
                      : "relative min-w-[210px] w-[58vw] md:min-w-[230px] h-[255px] rounded-[20px] overflow-hidden snap-start flex-shrink-0 group cursor-pointer border border-neutral-200 dark:border-white/5 shadow-sm"
                    }
                  >
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url('${game.bgImage}')` }}></div>
                    <div className="absolute inset-0 game-card-gradient"></div>
                    
                    {/* Status badge track system overlay */}
                    <div className="absolute top-3 right-3 bg-black/40 border border-white/10 px-1.5 py-0.5 rounded-md backdrop-blur-sm z-20">
                      <span className="text-[8px] font-caps text-white font-bold flex items-center gap-1 uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${isLockedOut ? "bg-red-500" : game.playersOnline.includes("Local") ? "bg-amber-400" : "bg-primary-container animate-pulse"}`}></span>
                        {isLockedOut ? "CREDITS EXP" : game.playersOnline}
                      </span>
                    </div>

                    <div className="absolute bottom-0 w-full p-4 flex justify-between items-end z-20">
                      <div className="max-w-[130px]">
                        <h3 className="font-headline text-xs font-black text-white truncate">{game.title}</h3>
                        <p className="font-caps text-[8px] text-neutral-300 tracking-wider uppercase mt-0.5 truncate">{game.genre}</p>
                      </div>
                      <button className={`w-9 h-9 rounded-full border border-white/20 flex items-center justify-center text-white transition-all shadow-md ${isLockedOut ? "bg-red-500/20 text-red-400" : "bg-white/10 backdrop-blur-md group-hover:bg-primary-container group-hover:text-neutral-950"}`}>
                        <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{isLockedOut ? "lock" : "play_arrow"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

    </div>
  );
}