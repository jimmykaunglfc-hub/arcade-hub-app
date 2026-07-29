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

    // 1. Attempt RPC call
    const { data, error } = await supabase.rpc("join_game_match", {
      p_game_title: gameTitle,
      p_entry_fee: Number(entryFee),
      p_opponent_name: cleanOpponentName,
    });

    if (!error && data && data.success) {
      return {
        success: true,
        updatedPoints: data.updatedPoints ?? data.new_points,
        matchId: data.match_id,
      };
    }

    if (error) {
      console.warn("RPC join_game_match warning, attempting client fallback:", error.message);
    }

    // 🛡️ 2. Fallback: Deduct points and record initial match directly via Client
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return { success: false, error: "UNAUTHORIZED" };
    }

    const userId = userData.user.id;

    // Fetch current user balance
    const { data: profile } = await supabase
      .from("profiles")
      .select("points")
      .eq("id", userId)
      .single();

    const currentPoints = profile?.points ?? 0;
    if (currentPoints < entryFee) {
      return { success: false, error: "INSUFFICIENT_POINTS" };
    }

    const newPoints = currentPoints - entryFee;

    // Deduct entry fee
    await supabase
      .from("profiles")
      .update({ points: newPoints })
      .eq("id", userId);

    // Create match entry
    const { data: insertedMatch, error: insertError } = await supabase
      .from("match_history")
      .insert({
        user_id: userId,
        game_title: gameTitle,
        opponent_name: cleanOpponentName,
        result: "Played",
        points_change: -entryFee,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Client fallback match insertion failed:", insertError.message);
    }

    return {
      success: true,
      updatedPoints: newPoints,
      matchId: insertedMatch?.id,
    };
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Award Points to the User's Profile if they won (points_change > 0)
    if (payload.points_change > 0) {
      // Attempt the secure RPC first
      const { error: rpcError } = await supabase.rpc("award_winner", {
        winner_id: user.id,
        reward: payload.points_change,
      });

      // 🛡️ Fallback: Update points directly via Client if RPC fails
      if (rpcError) {
        console.warn("RPC award_winner warning, attempting client fallback:", rpcError.message);

        const { data: profile } = await supabase
          .from("profiles")
          .select("points")
          .eq("id", user.id)
          .single();

        if (profile) {
          const newBalance = profile.points + payload.points_change;
          await supabase
            .from("profiles")
            .update({ points: newBalance })
            .eq("id", user.id);
        }
      }
    }

    // 2. Insert the visual match result into history
    const { error: insertError } = await supabase
      .from("match_history")
      .insert({
        user_id: user.id,
        game_id: payload.game_id,
        game_title: payload.game_title,
        opponent_name: payload.opponent_name,
        result: payload.result,
        points_change: payload.points_change,
      });

    if (insertError) {
      console.error("Failed to insert match history:", insertError.message);
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