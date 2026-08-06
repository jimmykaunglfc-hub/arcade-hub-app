"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

interface MatchmakingModalProps {
  gameKey: string;
  gameName: string;
  userId: string;
  onMatchFound: (matchData: {
    matchId: string;
    role: 1 | 2;
    opponent: { name: string; isBot: boolean; avatarIcon?: string; elo?: number };
  }) => void;
  onCancel: () => void;
  fallbackAfterMs?: number;
}

type FoundMatch = {
  matchId: string;
  role: 1 | 2;
  opponent: { name: string; isBot: boolean; avatarIcon?: string; elo?: number };
};

export default function MatchmakingModal({
  gameKey,
  gameName,
  userId,
  onMatchFound,
  onCancel,
  fallbackAfterMs = 45000,
}: MatchmakingModalProps) {
  const [searchTime, setSearchTime] = useState(0);
  const isCancelledRef = useRef(false);
  const activeUserRef = useRef<string | null>(null);

  const isValidUuid = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const finishMatchmaking = async (matchData: FoundMatch) => {
    if (!isCancelledRef.current) onMatchFound(matchData);
  };

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;
    isCancelledRef.current = false;

    const timer = setInterval(() => {
      if (isMounted) setSearchTime((prev) => prev + 1);
    }, 1000);

    const startHeartbeat = async () => {
      let activeUserId = userId;
      if (!isValidUuid(activeUserId)) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) activeUserId = user.id;
      }
      if (!isValidUuid(activeUserId)) return;
      activeUserRef.current = activeUserId;

      let username = "Online Player";
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", activeUserId).single();
      if (profile?.username) username = profile.username;

      if (!isMounted) return;

      // THE FIX: Wipe all previous ghost matches and old tickets before we do anything else!
      await supabase.rpc("reset_matchmaking", { p_user_id: activeUserId });

      const checkMatch = async () => {
        if (isCancelledRef.current || !isMounted) return;

        const { data, error } = await supabase.rpc("poll_matchmaking", {
          p_user_id: activeUserId,
          p_game_key: gameKey.trim().toLowerCase(),
          p_username: username
        });

        if (error) {
          console.error("Matchmaking error:", error);
          return;
        }

        if (data && data.matched && isMounted) {
          clearInterval(pollInterval);
          await finishMatchmaking({
            matchId: data.match_id,
            role: (data.role as 1 | 2),
            opponent: { name: data.opponent_name || "Online Player", isBot: false, avatarIcon: "person", elo: 1200 },
          });
        }
      };

      // FIRE INSTANTLY: Check for a new match
      await checkMatch();

      // Loop every 1.5 seconds after the first immediate check
      pollInterval = setInterval(checkMatch, 1500);

      // Ranked search only ever returns a real player. Keep polling after the
      // initial window instead of silently replacing the opponent with a bot.
      setTimeout(() => {
        if (!isCancelledRef.current && isMounted) return;
      }, fallbackAfterMs);
    };

    startHeartbeat();

    return () => {
      isMounted = false;
      clearInterval(timer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [fallbackAfterMs, gameKey, userId]);

  // Use the new SQL function to cleanly wipe everything if they cancel
  const cleanUpQueueTicket = async () => {
    if (activeUserRef.current) {
      await supabase.rpc("reset_matchmaking", { p_user_id: activeUserRef.current });
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center px-6 animate-fade-in touch-none select-none font-sans text-white" style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div className="bg-[#18181b] border border-white/10 rounded-[32px] p-8 max-w-[340px] w-full flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
        <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#CCFF00]/20 animate-ping"></div>
          <div className="absolute inset-2 rounded-full border border-[#CCFF00]/40 animate-pulse"></div>
          <div className="w-16 h-16 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00] flex items-center justify-center shadow-[0_0_20px_rgba(204,255,0,0.3)]">
            <span className="material-symbols-outlined text-3xl text-[#CCFF00] animate-spin">
              radar
            </span>
          </div>
        </div>

        <h3 className="font-headline font-black text-xl text-white uppercase tracking-tight mb-1">
          {gameName}
        </h3>
        <p className="text-xs text-neutral-400 font-medium mb-4">Searching for an online player...</p>

        <div className="bg-[#09090b] border border-white/10 px-4 py-1.5 rounded-full mb-8 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#CCFF00] animate-pulse"></span>
          <span className="font-mono text-xs font-bold text-neutral-300">
            00:{searchTime < 10 ? `0${searchTime}` : searchTime}
          </span>
        </div>

        <button
          onClick={async () => {
            isCancelledRef.current = true;
            await cleanUpQueueTicket();
            onCancel();
          }}
          className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 font-headline font-bold text-xs uppercase tracking-wider py-3.5 rounded-2xl transition-all border border-white/5 active:scale-95 touch-manipulation"
        >
          Cancel Search
        </button>
      </div>
    </div>
  );
}
