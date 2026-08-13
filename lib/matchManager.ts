// lib/matchManager.ts
import { supabase } from "./supabaseClient";

interface GameEntryParams {
  gameTitle: string;
  entryFee: number;
  opponentName?: string;
}

interface MatchResultPayload {
  game_id: string;
  game_title: string;
  opponent_name: string;
  result: string;
  points_change: number;
  duration_seconds?: number;
}

const matchTimerKey = (gameTitle: string) => `joeyoke_match_started_${gameTitle.toLowerCase()}`;
const activeStakeKey = (gameTitle: string) => `joeyoke_competitive_stake_${gameTitle.toLowerCase()}`;
const activeTournamentMatchKey = "joeyoke_active_tournament_match";

const gameKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function beginMatchTimer(gameTitle: string) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(matchTimerKey(gameTitle), String(Date.now()));
  }
}

function getMatchDuration(gameTitle: string) {
  if (typeof window === "undefined") return 0;
  const startedAt = Number(window.sessionStorage.getItem(matchTimerKey(gameTitle)) ?? 0);
  window.sessionStorage.removeItem(matchTimerKey(gameTitle));
  return startedAt > 0 ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
}

/**
 * Handles entry fees and creates an initial match record when a user enters a game.
 */
export async function processGameEntry({
  gameTitle,
  entryFee,
  opponentName = "Online Opponent",
}: GameEntryParams): Promise<{
  success: boolean;
  updatedPoints?: number;
  matchId?: string;
  error?: string;
}> {
  try {
    const cleanOpponentName = opponentName || "Online Opponent";
    const existingStakeId = typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(activeStakeKey(gameTitle));

    if (existingStakeId) {
      beginMatchTimer(gameTitle);
      return { success: true, matchId: existingStakeId };
    }

    const { data, error } = await supabase.rpc("enter_competitive_match", {
      p_game_title: gameTitle,
      p_entry_fee: Number(entryFee),
      p_opponent_name: cleanOpponentName,
    });

    if (!error && data?.success) {
      const stakeId = data.stake_id || data.match_id;
      if (stakeId && typeof window !== "undefined") {
        window.sessionStorage.setItem(activeStakeKey(gameTitle), stakeId);
      }
      beginMatchTimer(gameTitle);
      return {
        success: true,
        updatedPoints: data.updatedPoints ?? data.new_points,
        matchId: stakeId,
      };
    }

    return { success: false, error: error?.message || "Could not secure the match stake." };
  } catch (err: any) {
    console.error("Match entry error:", err);
    return { success: false, error: err.message || "Network Error" };
  }
}

/**
 * Inserts a completed match record into the database and awards points if the user won.
 */
export async function recordMatchResult(payload: MatchResultPayload) {
  try {
    const tournamentMatch = typeof window === "undefined"
      ? null
      : (() => {
          try {
            return JSON.parse(window.sessionStorage.getItem(activeTournamentMatchKey) || "null") as { id?: string; game?: string } | null;
          } catch {
            return null;
          }
        })();

    if (tournamentMatch?.id && tournamentMatch.game && gameKey(tournamentMatch.game) === gameKey(payload.game_title)) {
      const { error } = await supabase.rpc("settle_my_tournament_match", {
        target_match: tournamentMatch.id,
        my_result: payload.result,
      });
      if (error) {
        console.error("Failed to settle tournament match:", error.message);
        return;
      }
      window.sessionStorage.removeItem(activeTournamentMatchKey);
      return;
    }

    const durationSeconds = payload.duration_seconds ?? getMatchDuration(payload.game_title);
    const stakeId = typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(activeStakeKey(payload.game_title));

    if (!stakeId) return;

    const { error } = await supabase.rpc("settle_competitive_match", {
      p_stake_id: stakeId,
      p_result: payload.result,
      p_game_id: payload.game_id,
      p_duration_seconds: durationSeconds,
    });

    if (error) {
      console.error("Failed to settle competitive match:", error.message);
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(activeStakeKey(payload.game_title));
    }
  } catch (err) {
    console.error("Failed to record match result:", err);
  }
}

/**
 * Fetches recent match history for the logged-in user
 */
export async function getRecentMatches(limit = 10) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("match_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching match history:", error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error("Failed to fetch recent matches:", err);
    return [];
  }
}
