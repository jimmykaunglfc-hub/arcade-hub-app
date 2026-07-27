import { supabase } from "./supabaseClient";

interface GameEntryParams {
  gameTitle: string;
  entryFee: number;
  opponentName?: string;
}

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
      console.warn("RPC join_game_match failed, executing client fallback:", error.message);
    }

    // 🛡️ 2. Fallback execution: Deduct points and record match directly via Client
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

    // Deduct points
    await supabase
      .from("profiles")
      .update({ points: newPoints })
      .eq("id", userId);

    // Create match entry
    const { data: insertedMatch } = await supabase
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
 * Updates a match record when a game finishes
 */
export async function recordMatchResult(
  matchId: string,
  result: "Win" | "Loss" | "Draw",
  pointsEarned: number = 0
) {
  try {
    const { error } = await supabase
      .from("match_history")
      .update({
        result,
        points_change: pointsEarned,
      })
      .eq("id", matchId);

    if (error) {
      console.error("Error updating match result:", error.message);
    }
  } catch (err) {
    console.error("Failed to record match result:", err);
  }
}

/**
 * Fetches recent match history for the logged-in user
 */
export async function getRecentMatches(limit = 5) {
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