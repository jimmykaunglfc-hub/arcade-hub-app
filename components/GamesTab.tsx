"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

interface GamesTabProps {
  rewardClaimed: boolean; // Kept for prop signature compatibility
  setRewardClaimed: (status: boolean) => void;
  currentPoints: number;
  userId: string | null;
  onPlay: (url: string) => void;
}

export default function GamesTab({ 
  currentPoints, 
  userId, 
  onPlay 
}: GamesTabProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  
  // Dynamic States
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbGames, setDbGames] = useState<any[]>([]);
  const [, setLoading] = useState(true);

  // Helper for clean native routing slugs
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
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchLiveArcadeData();
  }, []);

  // --- SPEND POINTS LINKED TO LEDGER ---
  const executeLaunchEngine = async (url: string, entryFee: number = 0) => {
    if (currentPoints < entryFee && entryFee > 0) {
      alert("Matchmaking Halted: You have depleted your network credits. Visit the Store to resume online matches.");
      return;
    }

    if (entryFee > 0 && userId) {
      try {
        const { error: profileError } = await supabase.from("profiles")
          .update({ points: currentPoints - entryFee })
          .eq("id", userId);

        if (profileError) throw profileError;

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

  // Filter games based on selected category pill
  const filteredGames = activeCategory === "All" 
    ? dbGames 
    : dbGames.filter(g => g.category === activeCategory);

  return (
    <div className="w-full pb-6 animate-fade-in text-on-surface">
      
      {/* 🏷️ HORIZONTAL CATEGORY PILLS */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-6 -mx-5 px-5">
        <button
          onClick={() => setActiveCategory("All")}
          className={`px-6 py-2.5 rounded-full font-headline text-[13px] font-bold whitespace-nowrap transition-all shadow-sm ${
            activeCategory === "All" 
              ? "bg-primary text-on-primary" 
              : "bg-surface text-on-surface-variant hover:text-on-surface border border-surface-container-highest"
          }`}
        >
          All
        </button>
        {dbCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.name)}
            className={`px-5 py-2.5 rounded-full font-headline text-[13px] font-bold whitespace-nowrap transition-all shadow-sm ${
              activeCategory === cat.name 
                ? "bg-primary text-on-primary" 
                : "bg-surface text-on-surface-variant hover:text-on-surface border border-surface-container-highest"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* 🎮 TRENDING GAMES GRID */}
      <div className="space-y-4">
        <h2 className="font-headline text-xl font-bold text-on-surface tracking-wide">
          Trending Games
        </h2>
        
        <div className="grid grid-cols-2 gap-4">
          {filteredGames.map((game) => {
            const isPremium = game.entry_fee > 0;

            return (
              <div 
                key={game.id} 
                onClick={() => executeLaunchEngine(formatGameSlug(game.title), game.entry_fee)}
                className="bg-surface border border-surface-container-highest rounded-[24px] p-3 flex flex-col gap-3 cursor-pointer hover:bg-surface-variant active:scale-[0.97] transition-all shadow-sm"
              >
                {/* Image Placeholder / Banner */}
                <div className="relative w-full aspect-square rounded-[16px] overflow-hidden bg-surface-container-high flex items-center justify-center">
                  {game.image_url ? (
                    <div 
                      className="absolute inset-0 bg-cover bg-center" 
                      style={{ backgroundImage: `url('${game.image_url}')` }}
                    />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">sports_esports</span>
                  )}
                  
                  {isPremium && (
                    <div className="absolute top-2 right-2 bg-secondary-container text-secondary px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-secondary/10">
                      <span className="material-symbols-outlined text-secondary text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
                      <span className="font-bold text-[9px] uppercase tracking-wider">Gems</span>
                    </div>
                  )}
                </div>

                {/* Game Information */}
                <div className="px-1 pb-1">
                  <h3 className="font-headline text-sm font-bold text-on-surface truncate">{game.title}</h3>
                  <div className="flex justify-between items-center mt-1">
                    <span className="font-body text-[11px] text-on-surface-variant truncate pr-2">
                      {game.category || "Arcade"}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <span className="material-symbols-outlined text-amber-500 text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="text-on-surface font-bold text-[11px]">4.8</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}