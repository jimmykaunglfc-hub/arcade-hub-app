"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getRandomBotOpponent } from "../lib/botUtils";

interface MatchmakingModalProps {
  gameKey: string;
  gameName: string;
  userId: string;
  onMatchFound: (matchData: {
    matchId: string;
    opponent: {
      name: string;
      isBot: boolean;
      avatarIcon?: string;
      elo?: number;
    };
    role?: number;
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
  const [timer, setTimer] = useState(15); // 15-second matchmaking window
  const [statusText, setStatusText] = useState("Searching for online players...");
  const queueIdRef = useRef<string | null>(null);
  const isMatchedRef = useRef(false);

  const cancelQueue = async () => {
    if (queueIdRef.current && !isMatchedRef.current) {
      await supabase
        .from("matchmaking_queue")
        .update({ status: "cancelled" })
        .eq("id", queueIdRef.current);
    }
  };

  const triggerBotFallback = async () => {
    if (isMatchedRef.current) return;
    setStatusText("No online player found. Pairing with AI Opponent...");
    await cancelQueue();

    const botOpponent = getRandomBotOpponent();

    setTimeout(() => {
      if (isMatchedRef.current) return;
      isMatchedRef.current = true;
      onMatchFound({
        matchId: `bot_match_${Date.now()}`,
        opponent: botOpponent,
        role: 1, // Default user to Player 1 against bot
      });
    }, 1200);
  };

  const fetchOpponentProfileAndStart = async (
    matchId: string,
    opponentId: string,
    role: number = 1
  ) => {
    if (isMatchedRef.current) return;
    isMatchedRef.current = true;

    const { data } = await supabase
      .from("profiles")
      .select("username, points")
      .eq("id", opponentId)
      .single();

    onMatchFound({
      matchId,
      opponent: {
        name: data?.username || "Challenger",
        isBot: false,
        avatarIcon: "person",
        elo: data?.points ? Math.floor(data.points * 1.2) : 1200,
      },
      role,
    });
  };

  // Direct table check helper to catch missed Realtime broadcasts
  const checkQueueStatus = async (qId: string) => {
    if (isMatchedRef.current) return;

    const { data } = await supabase
      .from("matchmaking_queue")
      .select("status, match_id, opponent_id, player_role, role")
      .eq("id", qId)
      .maybeSingle();

    if (data && data.status === "matched" && !isMatchedRef.current) {
      fetchOpponentProfileAndStart(
        data.match_id,
        data.opponent_id,
        data.role || data.player_role || 2
      );
    }
  };

  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;
    let pollInterval: NodeJS.Timeout;
    let realtimeChannel: any;

    const startMatchmaking = async () => {
      // 1. Call Supabase RPC function to enter queue / find match
      const { data, error } = await supabase.rpc("join_matchmaking", {
        p_game_key: gameKey,
      });

      if (error || !data) {
        setStatusText("Matchmaking error. Trying bot mode...");
        triggerBotFallback();
        return;
      }

      // 2. Immediate human match found via RPC return!
      if (data.status === "matched") {
        fetchOpponentProfileAndStart(
          data.match_id,
          data.opponent_id,
          data.role || data.player_role || 1
        );
        return;
      }

      // 3. Waiting in queue: Record Queue ID
      queueIdRef.current = data.queue_id;

      // 4. Subscribe to Realtime updates on queue row
      realtimeChannel = supabase
        .channel(`matchmaking_${data.queue_id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "matchmaking_queue",
            filter: `id=eq.${data.queue_id}`,
          },
          (payload: any) => {
            if (payload.new.status === "matched") {
              fetchOpponentProfileAndStart(
                payload.new.match_id,
                payload.new.opponent_id,
                payload.new.role || payload.new.player_role || 2
              );
            }
          }
        )
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && queueIdRef.current) {
            // Immediate post-subscription double check (catches instant matches)
            checkQueueStatus(queueIdRef.current);
          }
        });

      // 5. Backup polling every 2.5s (safety net for missed WebSocket packets)
      pollInterval = setInterval(() => {
        if (queueIdRef.current) {
          checkQueueStatus(queueIdRef.current);
        }
      }, 2500);

      // 6. Start 15-Second Countdown
      countdownInterval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            clearInterval(pollInterval);
            triggerBotFallback();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    startMatchmaking();

    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
      if (pollInterval) clearInterval(pollInterval);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      cancelQueue();
    };
  }, [gameKey]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-[340px] bg-[#18181b] rounded-[32px] p-6 border border-white/10 shadow-2xl text-center flex flex-col items-center relative overflow-hidden">
        
        {/* Animated Neon Radar Pulse */}
        <div className="relative w-24 h-24 flex items-center justify-center my-4">
          <div className="absolute inset-0 rounded-full border border-[#CCFF00]/30 animate-ping" style={{ animationDuration: '2s' }}></div>
          <div className="absolute inset-3 rounded-full border border-[#CCFF00]/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
          
          <div className="w-16 h-16 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] flex items-center justify-center font-mono font-black text-2xl shadow-[0_0_20px_rgba(204,255,0,0.2)] relative z-10">
            {timer}s
          </div>
        </div>

        <h2 className="font-headline text-lg font-black text-white uppercase tracking-tight mb-1">
          {gameName}
        </h2>
        <p className="font-body text-xs font-semibold text-[#CCFF00] mb-6 animate-pulse">
          {statusText}
        </p>

        <button
          onClick={onCancel}
          className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 font-headline text-xs font-bold py-3.5 rounded-2xl uppercase tracking-wider active:scale-95 transition-all touch-manipulation"
        >
          Cancel Search
        </button>
      </div>
    </div>
  );
}