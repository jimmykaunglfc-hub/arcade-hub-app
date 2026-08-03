"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabaseClient";

interface GamesTabProps {
  currentPoints: number;
  userId: string | null;
  onPlay: (url: string, matchId?: string, opponent?: { name: string; isBot: boolean }) => void;
  onPointsUpdated?: () => void; 
  rewardClaimed?: boolean; 
  setRewardClaimed?: (status: boolean) => void;
  onGameDetailsChange?: (open: boolean) => void;
}

// 🎮 LOCAL FALLBACK GAMES (Guarantees cards render if Supabase DB is empty or loading)
const DEFAULT_GAMES = [
  { id: "uno", title: "Uno", category: "Card", entry_fee: 0, rating: "4.9", icon: "style" },
  { id: "carrom", title: "Carrom", category: "Board", entry_fee: 0, rating: "4.8", icon: "sports_esports" },
  { id: "chess", title: "Chess", category: "Strategy", entry_fee: 0, rating: "4.9", icon: "workspace_premium" },
  { id: "checkers", title: "Checkers", category: "Strategy", entry_fee: 0, rating: "4.7", icon: "grid_4x4" },
  { id: "snooker", title: "Snooker", category: "Sports", entry_fee: 0, rating: "4.8", icon: "sports_bar" },
  { id: "pool", title: "8-Ball Pool", category: "Sports", entry_fee: 0, rating: "4.9", icon: "sports_score" },
  { id: "tictactoe", title: "Tic Tac Toe", category: "Strategy", entry_fee: 0, rating: "4.8", icon: "grid_3x3" },
  { id: "biometric_override", title: "Biometric Override", category: "Puzzle", entry_fee: 0, rating: "5.0", icon: "fingerprint" },
  { id: "cup_pong", title: "Cup Pong", category: "Sports", entry_fee: 0, rating: "4.8", icon: "sports_baseball" },
  { id: "four_in_a_row", title: "Four in a Row", category: "Strategy", entry_fee: 0, rating: "4.8", icon: "view_column" },
  { id: "bingo", title: "Bingo", category: "Arcade", entry_fee: 0, rating: "4.7", icon: "casino" },
  { id: "ping_pong", title: "Ping Pong", category: "Sports", entry_fee: 0, rating: "4.9", icon: "table_restaurant" },
];

export default function GamesTab({ 
  currentPoints, 
  userId, 
  onPlay,
  onPointsUpdated,
  rewardClaimed,
  setRewardClaimed
  ,onGameDetailsChange
}: GamesTabProps) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  
  // Dynamic States
  const [dbCategories, setDbCategories] = useState<any[]>([]);
  const [dbGames, setDbGames] = useState<any[]>([]);
  const [, setLoading] = useState(true);
  const [ratingGame, setRatingGame] = useState<any | null>(null);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [selectedGame, setSelectedGame] = useState<any | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Helper for clean native routing slugs (e.g. "Tic Tac Toe" -> "native://tic-tac-toe")
  const formatGameSlug = (title: string) => {
    const slug = title
      .toLowerCase()
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `native://${slug}`;
  };
  // Catalog titles can differ only by punctuation (for example, “8 Ball Pool”
  // vs “8-Ball Pool”). Treat these as the same native game when merging the
  // backend catalog with the offline fallback.
  const catalogKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Fetch data from Control Core
  const fetchLiveArcadeData = async () => {
    setLoading(true);
    
    try {
      // 1. Fetch Categories
      const { data: catData } = await supabase
        .from("game_categories")
        .select("*")
        .order("name");
      if (catData && catData.length > 0) setDbCategories(catData);

      // 2. Fetch Active Games
      const { data: gameData } = await supabase.rpc("get_game_catalog");
      
      const activeGames = (gameData || []).filter((game: any) => game.status === "active");
      if (activeGames.length > 0) {
        const knownTitles = new Set(activeGames.map((game: any) => catalogKey(String(game.title))));
        setDbGames([...activeGames, ...DEFAULT_GAMES.filter((game) => !knownTitles.has(catalogKey(game.title)))]);
      } else {
        setDbGames(DEFAULT_GAMES);
      }
    } catch (e) {
      console.error("Failed to load arcade games from Supabase:", e);
      setDbGames(DEFAULT_GAMES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveArcadeData();
  }, []);

  // Cards open a detail page first; matchmaking starts only from Play.
  const handleGameClick = (game: any) => {
    setSelectedGame(game);
    onGameDetailsChange?.(true);
    if (userId) void supabase.from("game_favorites").select("game_id").eq("user_id", userId).eq("game_id", String(game.id)).maybeSingle().then(({ data }) => setIsFavorite(Boolean(data)));
  };

  const toggleFavorite = async () => {
    if (!selectedGame || !userId) return;
    const gameId = String(selectedGame.id);
    if (isFavorite) await supabase.from("game_favorites").delete().eq("user_id", userId).eq("game_id", gameId);
    else await supabase.from("game_favorites").insert({ user_id: userId, game_id: gameId });
    setIsFavorite(!isFavorite);
  };

  const saveRating = async (rating: number) => {
    if (!ratingGame?.id || !userId) return;
    setRatingSaving(true);
    const { error } = await supabase.from("game_ratings").upsert({ game_id: ratingGame.id, user_id: userId, rating, updated_at: new Date().toISOString() });
    setRatingSaving(false);
    if (error) return console.error("Unable to save rating:", error.message);
    setRatingGame(null);
    void fetchLiveArcadeData();
  };

  // Use DB games if fetched, otherwise use local fallback games
  const activeGamesList = dbGames.length > 0 ? dbGames : DEFAULT_GAMES;

  // Filter games based on selected category pill
  const filteredGames = activeCategory === "All" 
    ? activeGamesList 
    : activeGamesList.filter(g => g.category === activeCategory);

  if (selectedGame) {
    const entryFee = Number(selectedGame.entry_fee || 0);
    return <div className="fixed inset-0 z-[100002] overflow-y-auto bg-background px-5 pb-8 pt-[calc(18px+env(safe-area-inset-top))] text-on-surface"><header className="flex items-center gap-3 border-b border-surface-container-highest pb-4"><button onClick={() => { setSelectedGame(null); onGameDetailsChange?.(false); }} className="grid h-10 w-10 place-items-center rounded-full"><span className="material-symbols-outlined">arrow_back</span></button><h1 className="font-headline text-lg font-black">{selectedGame.title}</h1></header><section className="relative mt-6 h-64 overflow-hidden rounded-[26px] bg-surface-container-high p-6"><div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: selectedGame.image_url ? `url('${selectedGame.image_url}')` : undefined }} /><div className="absolute inset-0 bg-gradient-to-t from-white/35 via-transparent to-transparent dark:from-black/55" /><div className="absolute inset-x-6 bottom-6"><h2 className="font-headline text-3xl font-black text-black dark:text-white">{selectedGame.title}</h2><div className="mt-2 flex gap-2"><span className="rounded-lg bg-white/70 px-3 py-1 text-xs font-bold text-black backdrop-blur-sm dark:bg-black/35 dark:text-white">{selectedGame.category || "Arcade"}</span><span className="rounded-lg bg-white/70 px-3 py-1 text-xs font-bold text-black backdrop-blur-sm dark:bg-black/35 dark:text-white">★ {selectedGame.average_rating ? Number(selectedGame.average_rating).toFixed(1) : selectedGame.rating || "New"}</span></div></div></section><div className="mt-5 flex gap-3"><button onClick={() => onPlay(formatGameSlug(selectedGame.title))} className="flex-1 rounded-2xl bg-primary py-4 font-headline text-sm font-black text-on-primary shadow-[0_0_20px_rgba(168,238,0,.28)]"><span className="material-symbols-outlined mr-2 align-middle">play_arrow</span>Play{entryFee ? ` (-${entryFee.toLocaleString()} Pts)` : ""}</button><button onClick={() => void toggleFavorite()} aria-label="Save game" className={`grid h-14 w-14 place-items-center rounded-2xl ${isFavorite ? "bg-primary text-on-primary" : "bg-surface-container-high"}`}><span className="material-symbols-outlined" style={{ fontVariationSettings: isFavorite ? "'FILL' 1" : undefined }}>star</span></button></div><section className="mt-8"><h3 className="font-headline text-lg font-black">About this game</h3><p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{selectedGame.description || `${selectedGame.title} is ready to play in the Joe Yoke arcade. Challenge friends or start a match when you are ready.`}</p><div className="mt-6 grid grid-cols-2 gap-4"><div className="rounded-2xl border border-surface-container-highest bg-surface p-4"><span className="material-symbols-outlined text-primary">groups</span><p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Active players</p><b className="mt-1 block text-lg">Online</b></div><div className="rounded-2xl border border-surface-container-highest bg-surface p-4"><span className="material-symbols-outlined text-secondary">shield</span><p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Category</p><b className="mt-1 block text-lg">{selectedGame.category || "Arcade"}</b></div></div></section></div>;
  }

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
                onClick={() => handleGameClick(game)}
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
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                      {game.icon || "sports_esports"}
                    </span>
                  )}
                  
                  {isPremium && (
                    <div className="absolute top-2 right-2 bg-primary-container text-primary px-2 py-1 rounded-full flex items-center gap-1 shadow-sm border border-primary/10">
                      <span className="material-symbols-outlined text-primary text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                      <span className="font-bold text-[9px] uppercase tracking-wider">{game.entry_fee.toLocaleString()} PTS</span>
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
                    <button onClick={(event) => { event.stopPropagation(); setRatingGame(game); }} className="flex items-center gap-0.5 shrink-0" aria-label={`Rate ${game.title}`}>
                      <span className="material-symbols-outlined text-amber-500 text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="text-on-surface font-bold text-[11px]">{game.average_rating ? Number(game.average_rating).toFixed(1) : "New"}</span>
                    </button>
                  </div>
                  {game.catalog_label && <span className="mt-2 inline-flex rounded-full bg-primary-container px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">{game.catalog_label}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {ratingGame && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/70 p-5 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={`Rate ${ratingGame.title}`} className="w-full max-w-xs rounded-3xl bg-surface p-6 text-center shadow-2xl">
            <h2 className="font-headline text-lg font-black">Rate {ratingGame.title}</h2>
            <p className="mt-2 text-xs text-on-surface-variant">Your rating helps players discover great games.</p>
            <div className="mt-6 flex justify-center gap-2">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} disabled={ratingSaving} onClick={() => void saveRating(rating)} className="material-symbols-outlined text-3xl text-amber-500">star</button>)}</div>
            <button onClick={() => setRatingGame(null)} className="mt-6 text-xs font-bold text-primary">Cancel</button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
