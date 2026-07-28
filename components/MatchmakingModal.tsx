"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

interface MatchmakingModalProps {
  gameKey: string;
  gameName: string;
  userId: string;
  onMatchFound: (matchData: { matchId: string; opponent: { name: string; isBot: boolean } }) => void;
  onCancel: () => void;
}

export default function MatchmakingModal({
  gameKey,
  gameName,
  userId,
  onMatchFound,
  onCancel
}: MatchmakingModalProps) {
  const [timer, setTimer] = useState(15); // 15-second matchmaking window
  const [statusText, setStatusText] = useState("Searching for online players...");
  const queueIdRef = useRef<string | null>(null);

  const cancelQueue = async () => {
    if (queueIdRef.current) {
      await supabase
        .from("matchmaking_queue")
        .update({ status: "cancelled" })
        .eq("id", queueIdRef.current);
    }
  };

  const triggerBotFallback = async () => {
    setStatusText("No player found. Pairing with Joe Yoke Bot...");
    await cancelQueue();

    setTimeout(() => {
      onMatchFound({
        matchId: `bot_match_${Date.now()}`,
        opponent: {
          name: "Joe Yoke Bot",
          isBot: true
        }
      });
    }, 1200);
  };

  const fetchOpponentProfileAndStart = async (matchId: string, opponentId: string, isBot: boolean) => {
    const { data } = await supabase.from("profiles").select("username").eq("id", opponentId).single();
    onMatchFound({
      matchId,
      opponent: {
        name: data?.username || "Challenger",
        isBot: false
      }
    });
  };

  useEffect(() => {
    let countdownInterval: NodeJS.Timeout;
    let realtimeChannel: any;

    const startMatchmaking = async () => {
      // 1. Call RPC function
      const { data, error } = await supabase.rpc("join_matchmaking", { p_game_key: gameKey });

      if (error || !data) {
        setStatusText("Matchmaking error. Trying bot mode...");
        triggerBotFallback(); 
        return;
      }

      // 2. Immediate human match found!
      if (data.status === "matched") {
        fetchOpponentProfileAndStart(data.match_id, data.opponent_id, false);
        return;
      }

      // 3. Waiting in queue: Subscribe to Realtime update on our queue row
      queueIdRef.current = data.queue_id;

      realtimeChannel = supabase.channel(`matchmaking_${data.queue_id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "matchmaking_queue",
            filter: `id=eq.${data.queue_id}`
          },
          (payload: any) => {
            if (payload.new.status === "matched") {
              fetchOpponentProfileAndStart(payload.new.match_id, payload.new.opponent_id, false);
            }
          }
        )
        .subscribe();

      // 4. Start Countdown
      countdownInterval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
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
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
      cancelQueue();
    };
  }, [gameKey]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-surface rounded-[24px] p-6 border border-surface-container-highest shadow-2xl text-center flex flex-col items-center">
        
        {/* Animated Radar Pulse */}
        <div className="relative w-20 h-20 flex items-center justify-center my-4">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
          <div className="w-16 h-16 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xl shadow-lg relative z-10">
            {timer}s
          </div>
        </div>

        <h2 className="font-headline text-lg font-bold text-on-surface mb-1">
          {gameName}
        </h2>
        <p className="font-body text-xs text-on-surface-variant mb-6">
          {statusText}
        </p>

        <button
          onClick={onCancel}
          className="w-full bg-surface-container-highest text-on-surface font-headline text-sm font-bold py-3 rounded-full hover:bg-surface-variant active:scale-95 transition-all"
        >
          Cancel Matchmaking
        </button>
      </div>
    </div>
  );
}