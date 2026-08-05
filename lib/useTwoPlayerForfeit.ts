"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Applies one consistent grace period to legacy two-player realtime games.
 * It is intentionally driven by the game's existing Supabase Presence state:
 * a player must have joined once before a missing opponent can be forfeited.
 * This avoids awarding a win while a host is still merely waiting for someone
 * to join a private room.
 */
export function useTwoPlayerForfeit({
  enabled,
  opponentConnected,
  onForfeit,
  graceSeconds = 30,
}: {
  enabled: boolean;
  opponentConnected: boolean;
  onForfeit: () => void;
  graceSeconds?: number;
}) {
  const sawOpponentRef = useRef(false);
  const forfeitedRef = useRef(false);
  const onForfeitRef = useRef(onForfeit);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  useEffect(() => {
    onForfeitRef.current = onForfeit;
  }, [onForfeit]);

  useEffect(() => {
    if (!enabled) {
      sawOpponentRef.current = false;
      forfeitedRef.current = false;
      setSecondsRemaining(null);
      return;
    }
    if (opponentConnected) {
      sawOpponentRef.current = true;
      setSecondsRemaining(null);
      return;
    }
    if (!sawOpponentRef.current || forfeitedRef.current) return;

    setSecondsRemaining(graceSeconds);
    const deadline = Date.now() + graceSeconds * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        forfeitedRef.current = true;
        window.clearInterval(timer);
        onForfeitRef.current();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [enabled, graceSeconds, opponentConnected]);

  return secondsRemaining;
}
