"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getRandomBotOpponent } from "../lib/botUtils";

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
}

export default function MatchmakingModal({
  gameKey,
  gameName,
  userId,
  onMatchFound,
  onCancel,
}: MatchmakingModalProps) {
  const [searchTime, setSearchTime] = useState(0);
  const isCancelledRef = useRef(false);
  const activeUserRef = useRef<string | null>(null);

  const isValidUuid = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;
    isCancelledRef.current = false;

    // Timer UI
    const timer = setInterval(() => {
      if (isMounted) setSearchTime((prev) => prev + 1);
    }, 1000);

    const startHeartbeat = async () => {
      // 1. Resolve User ID
      let activeUserId = userId;
      if (!isValidUuid(activeUserId)) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) activeUserId = user.id;
      }
      if (!isValidUuid(activeUserId)) {
        if (isMounted) triggerBotFallback();
        return;
      }
      activeUserRef.current = activeUserId;

      // 2. Get Username for pairing
      let username = "Online Player";
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", activeUserId).single();
      if (profile?.username) username = profile.username;

      if (!isMounted) return;

      // 3. The Unified Heartbeat Poll (Runs every 1.5 seconds)
      pollInterval = setInterval(async () => {
        if (isCancelledRef.current || !isMounted) {
          clearInterval(pollInterval);
          return;
        }

        const { data, error } = await supabase.rpc("poll_matchmaking", {
          p_user_id: activeUserId,
          p_game_key: gameKey.trim().toLowerCase(), // Normalize game keys
          p_username: username
        });

        if (error) {
          console.error("Matchmaking error:", error);
          return; // Ignore transient network errors and try again next tick
        }

        if (data && data.matched && isMounted) {
          clearInterval(pollInterval);
          await finishMatchmaking({
            matchId: data.match_id,
            role: (data.role as 1 | 2),
            opponent: { name: data.opponent_name || "Online Player", isBot: false, avatarIcon: "person", elo: 1200 },
          });
        }
      }, 1500);

      // 4. 20-Second Timeout Fallback
      setTimeout(() => {
        if (!isCancelledRef.current && isMounted) {
          clearInterval(pollInterval);
          triggerBotFallback();
        }
      }, 20000);
    };

    startHeartbeat();

    return () => {
      isMounted = false;
      clearInterval(timer);
      if (pollInterval) clearInterval(pollInterval);
      cleanUpQueueTicket(); // Ensure ghost tickets die when closing modal
    };
  }, [gameKey, userId]);

  const cleanUpQueueTicket = async () => {
    if (activeUserRef.current) {
      await supabase.from("matchmaking_queue").delete().eq("user_id", activeUserRef.current);
    }
  };

  const triggerBotFallback = async () => {
    if (isCancelledRef.current) return;
    const botOpponent = getRandomBotOpponent();
    await finishMatchmaking({
      matchId: `bot_match_${Date.now()}`,
      role: 1,
      opponent: { name: botOpponent.name, isBot: true, avatarIcon: botOpponent.avatarIcon || "smart_toy", elo: 1200 },
    });
  };

  const finishMatchmaking = async (matchData: any) => {
    await cleanUpQueueTicket();
    if (!isCancelledRef.current) {
      onMatchFound(matchData);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in touch-none select-none font-sans text-white">
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
        <p className="text-xs text-neutral-400 font-medium mb-4">Searching for opponent...</p>

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