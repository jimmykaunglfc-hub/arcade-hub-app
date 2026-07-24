"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

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

  // Dynamic States
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbGames, setDbGames] = useState<any[]>([]);
  const [featuredGame, setFeaturedGame] = useState<any>(null);
  const [, setLoading] = useState(true);

  // Helper for clean native routing slugs (e.g. "Snooker" -> "native://snooker")
  const formatGameSlug = (title: string) => {
    const slug = title
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `native://${slug}`;
  };

  // Fetch data from Control Core
  const fetchLiveArcadeData = async () => {
    setLoading(true);
    
    // 1. Fetch Categories
    const { data: catData } = await supabase
      .from("game_categories")
      .select("*")
      .order("name");
    if (catData) setDbCategories(catData);

    // 2. Fetch Active Games
    const { data: gameData } = await supabase
      .from("games")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    
    if (gameData) {
      setDbGames(gameData);
      
      // 3. FEATURED GAME LOGIC: Find manually featured game, OR fallback to the newest active game
      const manuallyFeatured = gameData.find((g: any) => g.is_featured);
      if (manuallyFeatured) {
        setFeaturedGame(manuallyFeatured);
      } else if (gameData.length > 0) {
        setFeaturedGame(gameData[0]); 
      }
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchLiveArcadeData();
  }, []);

  // Format data for UI grouping
  const formattedCategories = dbCategories.map(cat => {
    const catGames = dbGames.filter(g => g.category === cat.name).map(g => ({
      id: g.id,
      title: g.title,
      genre: g.description || "Arcade Game",
      playersOnline: g.entry_fee === 0 ? "Local Party" : "Live PvP", 
      bgImage: g.image_url,
      url: formatGameSlug(g.title),
      entry_fee: g.entry_fee
    }));
    
    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon_url, 
      games: catGames
    };
  }).filter(cat => cat.games.length > 0);

  const uncategorizedGames = dbGames.filter(g => !g.category || g.category === "Uncategorized");
  if (uncategorizedGames.length > 0) {
    formattedCategories.push({
      id: "uncategorized",
      name: "Uncategorized",
      icon: "sports_esports",
      games: uncategorizedGames.map(g => ({
        id: g.id,
        title: g.title,
        genre: g.description || "Arcade Game",
        playersOnline: g.entry_fee === 0 ? "Local Party" : "Live PvP",
        bgImage: g.image_url,
        url: formatGameSlug(g.title),
        entry_fee: g.entry_fee
      }))
    });
  }

  const displayedCategories = isolatedCategory 
    ? formattedCategories.filter(c => c.id === isolatedCategory) 
    : formattedCategories;

  // --- EARN POINTS LINKED TO LEDGER ---
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
      const prizeAmount = 250;

      // 1. Update Profile Balance
      await supabase.from("profiles")
        .update({
          points: startingPoints + prizeAmount,
          last_login_claim: new Date().toISOString()
        })
        .eq("id", userId);

      // 2. Log to Economy Transaction Ledger
      await supabase.from("transactions").insert({
        user_id: userId,
        amount: prizeAmount,
        transaction_type: "daily_reward",
        description: "Claimed daily entry matrix allowance multiplier rewards"
      });

      setRewardClaimed(true);
      alert(`Success! +${prizeAmount} credits successfully minted and signed to ledger.`);
    } catch (err) {
      console.error("Ledger communication error:", err);
    } finally {
      setClaiming(false);
    }
  };

  // --- SPEND POINTS LINKED TO LEDGER ---
  const executeLaunchEngine = async (url: string, entryFee: number = 0) => {
    if (currentPoints < entryFee && entryFee > 0) {
      alert("Matchmaking Halted: You have depleted your network credits. Spin the Shop core wheel or purchase a points voucher to resume online multiplayer matches.");
      return;
    }

    // If the game charges credits, dynamically process ledger entry before execution
    if (entryFee > 0 && userId) {
      try {
        // 1. Deduct cost from account balance
        const { error: profileError } = await supabase.from("profiles")
          .update({ points: currentPoints - entryFee })
          .eq("id", userId);

        if (profileError) throw profileError;

        // 2. Write receipt record into transaction history
        await supabase.from("transactions").insert({
          user_id: userId,
          amount: -entryFee,
          transaction_type: "match_fee",
          description: `Authorized arena connection payload for game route: ${url}`
        });

      } catch (err) {
        console.error("Economy connection ledger synchronization failed:", err);
        alert("Network Handshake Aborted: Security engine could not securely clear entry cost from ledger nodes.");
        return;
      }
    }

    onPlay(url);
  };

  return (
    <div className="space-y-4 w-full pb-6">
      
      {/* 🎁 REWARD MULTIPLIER HUD */}
      {!isolatedCategory && (
        <section className={`bg-surface/80 backdrop-blur-xl rounded-2xl p-3.5 flex items-center justify-between transition-all duration-300 ${rewardClaimed ? "opacity-50 border border-surface-container-highest" : "shadow-sm border border-primary/20"}`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 flex items-center justify-center rounded-xl border border-surface-container-highest transition-all ${rewardClaimed ? "bg-surface-container-highest text-on-surface-variant" : "bg-primary text-on-primary shadow-sm"}`}>
              <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>card_giftcard</span>
            </div>
            <div>
              <h3 className={`font-caps text-[9px] uppercase tracking-wider ${rewardClaimed ? "text-on-surface-variant" : "text-primary"}`}>Daily Multiplier</h3>
              <p className="font-headline text-xs font-bold tracking-tight mt-0.5 text-on-surface">{rewardClaimed ? "Credits Synced" : "Claim +250 Credits"}</p>
            </div>
          </div>
          
          <button
            onClick={handleDailyCheckIn}
            disabled={rewardClaimed || claiming}
            className={`h-8 px-3 rounded-lg font-headline text-[11px] font-bold uppercase tracking-wider transition-all ${rewardClaimed ? "bg-surface-container-highest text-on-surface-variant border border-surface-container-highest cursor-not-allowed" : "gradient-pill-primary shadow-md"}`}
          >
            {claiming ? "Syncing..." : rewardClaimed ? "Claimed" : "Claim"}
          </button>
        </section>
      )}

      {/* 🎯 DYNAMIC HERO HUB BANNER */}
      {!isolatedCategory && featuredGame && (
        <section className="relative w-full rounded-[20px] overflow-hidden bg-surface/80 border border-surface-container-highest backdrop-blur-xl min-h-[220px] flex items-center justify-between p-5 shadow-sm transition-colors duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-container/20 to-transparent pointer-events-none"></div>
          
          <div className="relative z-10 max-w-[210px] space-y-2">
            <span className="inline-flex items-center font-caps text-[8px] px-1.5 py-0.5 rounded bg-primary-container/30 text-primary font-bold uppercase tracking-widest border border-primary/10">
              Featured Arena
            </span>
            <h1 className="font-headline text-xl font-black text-on-surface leading-tight">
              {featuredGame.title}
            </h1>
            <p className="font-body text-[10px] text-on-surface-variant leading-snug line-clamp-2">
              {featuredGame.description || "Jump into the action and climb the community boards."}
            </p>
            <button 
              onClick={() => executeLaunchEngine(formatGameSlug(featuredGame.title), featuredGame.entry_fee)}
              className="gradient-pill-primary font-caps text-[9px] font-extrabold uppercase tracking-widest px-4 py-2 rounded-full shadow-md flex items-center justify-center gap-1 mt-2 transition-transform active:scale-95"
            >
              Play Now {featuredGame.entry_fee > 0 && `(${featuredGame.entry_fee} PTS)`}
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </button>
          </div>
          
          {/* True CSS Mask for a flawless seamless fade */}
          <div 
            className="absolute right-0 bottom-0 w-[55%] h-full pointer-events-none overflow-hidden rounded-r-[20px]"
            style={{ 
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)',
              maskImage: 'linear-gradient(to right, transparent 0%, black 40%)'
            }}
          >
            <img 
              alt="Featured Game Cover" 
              className="w-full h-full object-cover opacity-90 drop-shadow-2xl" 
              src={featuredGame.image_url}
            />
          </div>
        </section>
      )}

      {/* 🎰 ARCADE ROWS SCROLLER MODULE */}
      <div className="space-y-4">
        {displayedCategories.map((category) => (
          <section key={category.id} className="space-y-2">
            <div className="flex justify-between items-end px-1">
              <div className="flex items-center gap-2 text-on-surface">
                {isolatedCategory && (
                  <button 
                    onClick={() => setIsolatedCategory(null)} 
                    className="w-6 h-6 rounded-full bg-surface-container-highest flex items-center justify-center mr-0.5 text-on-surface hover:bg-surface-variant transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs">arrow_back_ios_new</span>
                  </button>
                )}
                {category.icon && category.icon.startsWith("http") ? (
                  <img src={category.icon} alt={category.name} className="w-5 h-5 object-contain opacity-80" />
                ) : (
                  <span className="material-symbols-outlined text-base opacity-70">{category.icon || "sports_esports"}</span>
                )}
                <h2 className="font-headline text-sm font-black tracking-tight">{category.name}</h2>
              </div>
              {!isolatedCategory && (
                <button 
                  onClick={() => setIsolatedCategory(category.id)} 
                  className="font-caps text-[9px] text-primary tracking-widest uppercase font-bold hover:opacity-80 transition-opacity"
                >
                  See All
                </button>
              )}
            </div>

            <div className={isolatedCategory ? "grid grid-cols-2 gap-3 animate-fade-in" : "flex gap-3 overflow-x-auto no-scrollbar pb-1 pr-4 snap-x"}>
              {category.games.map((game) => {
                const isOnlineGame = game.entry_fee > 0;
                const isLockedOut = currentPoints < game.entry_fee && isOnlineGame;

                return (
                  <div 
                    key={game.id} 
                    onClick={() => executeLaunchEngine(game.url, game.entry_fee)}
                    className={isolatedCategory 
                      ? "relative w-full h-[180px] rounded-[16px] overflow-hidden group cursor-pointer border border-surface-container-highest shadow-sm"
                      : "relative min-w-[210px] w-[58vw] md:min-w-[230px] h-[255px] rounded-[20px] overflow-hidden snap-start flex-shrink-0 group cursor-pointer border border-surface-container-highest shadow-sm"
                    }
                  >
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: `url('${game.bgImage}')` }}></div>
                    <div className="absolute inset-0 game-card-gradient"></div>
                    
                    <div className="absolute top-3 right-3 bg-black/40 border border-white/10 px-1.5 py-0.5 rounded-md backdrop-blur-sm z-20">
                      <span className="text-[8px] font-caps text-white font-bold flex items-center gap-1 uppercase tracking-wider">
                        <span className={`w-1 h-1 rounded-full ${isLockedOut ? "bg-red-500" : !isOnlineGame ? "bg-amber-400" : "bg-primary-container animate-pulse"}`}></span>
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