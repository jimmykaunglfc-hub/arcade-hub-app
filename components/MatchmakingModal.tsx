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
  const queueTicketIdRef = useRef<string | null>(null);
  const isCancelledRef = useRef(false);

  const isValidUuid = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  useEffect(() => {
    isCancelledRef.current = false;

    const timer = setInterval(() => {
      setSearchTime((prev) => prev + 1);
    }, 1000);

    const initMatchmaking = async () => {
      let activeUserId = userId;
      if (!isValidUuid(activeUserId)) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) activeUserId = user.id;
      }

      if (!isValidUuid(activeUserId)) {
        triggerBotFallback();
        return;
      }

      try {
        // 1. Check if join_matchmaking RPC exists for instant pairing
        const { data: rpcData, error: rpcError } = await supabase.rpc("join_matchmaking", {
          p_game_key: gameKey,
          p_user_id: activeUserId,
        });

        if (!rpcError && rpcData && rpcData.matched) {
          let oppName = "Online Player";
          if (rpcData.opponent_id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", rpcData.opponent_id)
              .maybeSingle();
            if (prof?.username) oppName = prof.username;
          }

          cleanupAndFinish({
            matchId: rpcData.match_id || `match_${Date.now()}`,
            role: (rpcData.role as 1 | 2) || 2,
            opponent: {
              name: oppName,
              isBot: false,
              avatarIcon: "person",
              elo: 1200,
            },
          });
          return;
        }

        // 2. Direct insert into matchmaking_queue
        const { data: queueData, error: queueError } = await supabase
          .from("matchmaking_queue")
          .insert({
            user_id: activeUserId,
            game_key: gameKey,
            status: "waiting",
          })
          .select("id")
          .single();

        if (queueError || !queueData) {
          triggerBotFallback();
          return;
        }

        const ticketId = queueData.id;
        queueTicketIdRef.current = ticketId;

        // 3. Realtime Postgres Changes Subscription
        const channel = supabase
          .channel(`queue_${ticketId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "matchmaking_queue",
              filter: `id=eq.${ticketId}`,
            },
            async (payload) => {
              const updatedRow = payload.new;
              if (updatedRow.status === "matched" && !isCancelledRef.current) {
                await handleMatchedTicket(updatedRow, activeUserId);
              }
            }
          )
          .subscribe();

        // 4. Safe Polling (Uses SELECT * to prevent 400 Bad Request errors)
        const pollInterval = setInterval(async () => {
          if (isCancelledRef.current || !queueTicketIdRef.current) {
            clearInterval(pollInterval);
            return;
          }

          const { data, error } = await supabase
            .from("matchmaking_queue")
            .select("*")
            .eq("id", ticketId)
            .maybeSingle();

          if (!error && data && data.status === "matched") {
            clearInterval(pollInterval);
            supabase.removeChannel(channel);
            await handleMatchedTicket(data, activeUserId);
          }
        }, 1500);

        // 5. Timeout safeguard (15 seconds)
        setTimeout(() => {
          if (!isCancelledRef.current && queueTicketIdRef.current) {
            clearInterval(pollInterval);
            supabase.removeChannel(channel);
            triggerBotFallback();
          }
        }, 15000);

      } catch (err) {
        console.error("Matchmaking error:", err);
        triggerBotFallback();
      }
    };

    initMatchmaking();

    return () => {
      isCancelledRef.current = true;
      clearInterval(timer);
      cleanUpQueueTicket();
    };
  }, [gameKey, userId]);

  const handleMatchedTicket = async (ticketData: any, currentUserId: string) => {
    let oppName = "Online Player";
    const opponentId = ticketData.opponent_id || ticketData.matched_user_id;

    if (opponentId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", opponentId)
        .maybeSingle();
      if (prof?.username) oppName = prof.username;
    }

    cleanupAndFinish({
      matchId: ticketData.match_id || `match_${Date.now()}`,
      role: ticketData.user_id === currentUserId ? 1 : 2,
      opponent: {
        name: oppName,
        isBot: false,
        avatarIcon: "person",
        elo: 1200,
      },
    });
  };

  const cleanUpQueueTicket = async () => {
    if (queueTicketIdRef.current) {
      const idToRemove = queueTicketIdRef.current;
      queueTicketIdRef.current = null;
      await supabase.from("matchmaking_queue").delete().eq("id", idToRemove);
    }
  };

  const triggerBotFallback = () => {
    if (isCancelledRef.current) return;
    const botOpponent = getRandomBotOpponent();
    cleanupAndFinish({
      matchId: `bot_match_${Date.now()}`,
      role: 1,
      opponent: {
        name: botOpponent.name,
        isBot: true,
        avatarIcon: botOpponent.avatarIcon || "smart_toy",
        elo: botOpponent.elo || 1200,
      },
    });
  };

  const cleanupAndFinish = async (matchData: {
    matchId: string;
    role: 1 | 2;
    opponent: { name: string; isBot: boolean; avatarIcon?: string; elo?: number };
  }) => {
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