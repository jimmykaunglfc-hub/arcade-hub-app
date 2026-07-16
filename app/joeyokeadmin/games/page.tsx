"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function GameCatalogManager() {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGames = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: true });

    if (data) setGames(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchGames();
  }, []);

  const handleAdjustFee = async (gameId: string, currentFee: number, gameTitle: string) => {
    const feeStr = prompt(`Enter new entry fee for ${gameTitle} (Current: ${currentFee} PTS):`);
    if (!feeStr) return;
    
    const newFee = parseInt(feeStr, 10);
    if (isNaN(newFee) || newFee < 0) {
      alert("Invalid amount. Fee must be a positive number.");
      return;
    }

    const { error } = await supabase.from("games").update({ entry_fee: newFee }).eq("id", gameId);
    if (error) {
      alert("Error updating entry fee: " + error.message);
    } else {
      fetchGames(); // Refresh list
    }
  };

  const handleCycleStatus = async (gameId: string, currentStatus: string) => {
    // Cycle through: active -> maintenance -> hidden -> active
    const nextStatusMap: Record<string, string> = {
      'active': 'maintenance',
      'maintenance': 'hidden',
      'hidden': 'active'
    };
    
    const newStatus = nextStatusMap[currentStatus] || 'active';
    
    const { error } = await supabase.from("games").update({ status: newStatus }).eq("id", gameId);
    if (error) {
      alert("Error updating status: " + error.message);
    } else {
      fetchGames(); // Refresh list
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-neutral-900 dark:text-white">Game Catalog</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-white/60 mt-1">Control matchmaking entry fees and server availability dynamically.</p>
        </div>
        <button onClick={fetchGames} className="flex items-center gap-2 bg-neutral-100 dark:bg-white/10 px-4 py-2 rounded-lg border border-neutral-200 dark:border-white/5 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors w-fit">
          <span className="material-symbols-outlined text-sm">refresh</span> Refresh Catalog
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-xs font-bold text-neutral-400 tracking-widest uppercase animate-pulse">
            Loading Catalog Data...
          </div>
        ) : games.length === 0 ? (
          <div className="col-span-full py-12 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-white/10 rounded-2xl">
            No games found in the database.
          </div>
        ) : (
          games.map((game) => (
            <div key={game.id} className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-transform hover:-translate-y-1">
              {/* Game Header */}
              <div className="p-5 border-b border-neutral-200 dark:border-white/5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center p-2 shrink-0">
                  <img src={game.image_url} alt={game.title} className="w-full h-full object-contain drop-shadow-md" />
                </div>
                <div>
                  <h3 className="font-headline text-sm font-black text-neutral-900 dark:text-white">{game.title}</h3>
                  <p className="font-body text-[10px] text-neutral-500 dark:text-white/50 mt-1 line-clamp-2">{game.description}</p>
                </div>
              </div>

              {/* Game Metrics & Controls */}
              <div className="p-5 flex-1 flex flex-col justify-end space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Entry Cost</span>
                  <div className="flex items-center gap-2">
                    <span className="font-headline text-sm font-black text-amber-500">{game.entry_fee.toLocaleString()} PTS</span>
                    <button 
                      onClick={() => handleAdjustFee(game.id, game.entry_fee, game.title)}
                      className="p-1 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 rounded text-neutral-600 dark:text-white/60 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Network Status</span>
                  <button 
                    onClick={() => handleCycleStatus(game.id, game.status)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors ${
                      game.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20' :
                      game.status === 'maintenance' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20' :
                      'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      game.status === 'active' ? 'bg-emerald-500' :
                      game.status === 'maintenance' ? 'bg-amber-500' : 'bg-red-500'
                    }`}></span>
                    {game.status}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}