"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { getRecentMatches } from "../lib/matchManager";

interface Match {
  id: string;
  game_title: string;
  opponent_name: string;
  result: "Win" | "Loss" | "Draw";
  reward_points: number;
  created_at: string;
}

const GAME_ICONS: Record<string, string> = {
  Chess: "workspace_premium",
  Carrom: "sports_esports",
  Snooker: "sports_bar",
  "Tic Tac Toe": "grid_3x3",
  Uno: "style",
};

export default function RecentMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMatches = async () => {
    setLoading(true);
    const history = await getRecentMatches(5);
    setMatches(history);
    setLoading(false);
  };

  useEffect(() => {
    fetchMatches();

    // 📡 Real-time update: auto-refresh match list when a game finishes
    const channel = supabase
      .channel("realtime_match_history")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_history" },
        () => fetchMatches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-[#18181b] border border-white/5 rounded-3xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-white/10 rounded mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-white/5 rounded-2xl"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#18181b] border border-white/10 rounded-[28px] p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#CCFF00] text-xl">
            history
          </span>
          <h2 className="font-headline font-black text-sm uppercase tracking-wider text-white">
            Recent Matches
          </h2>
        </div>
        <span className="text-[10px] font-mono font-bold text-neutral-400">
          LAST {matches.length} GAMES
        </span>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-6 text-neutral-500 text-xs font-medium border border-dashed border-white/10 rounded-2xl">
          No matches played yet. Jump into an arena!
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {matches.map((match) => {
            const isWin = match.result === "Win";
            const isDraw = match.result === "Draw";

            return (
              <div
                key={match.id}
                className="flex items-center justify-between bg-[#09090b] border border-white/5 p-3 rounded-2xl hover:border-white/10 transition-colors"
              >
                {/* Left: Icon & Game Details */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-lg text-neutral-300">
                      {GAME_ICONS[match.game_title] || "sports_esports"}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-headline font-bold text-xs text-white leading-tight">
                      {match.game_title}
                    </h3>
                    <p className="text-[10px] text-neutral-400">
                      vs {match.opponent_name || "Opponent"}
                    </p>
                  </div>
                </div>

                {/* Right: Outcome Tag & Points */}
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      isWin
                        ? "bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/30"
                        : isDraw
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {match.result}
                  </span>

                  <span className="text-[10px] font-mono font-bold text-neutral-400">
                    {isWin
                      ? `+${match.reward_points} PTS`
                      : isDraw
                      ? "0 PTS"
                      : "LOSS"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}