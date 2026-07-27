import { supabase } from "./supabaseClient";

interface GameEntryParams {
  gameTitle: string;
  entryFee: number;
  opponentName?: string;
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
 * Updates an existing match record when a game finishes.
 * If matchId is missing or record update fails, creates a direct match entry fallback so matches are never lost.
 */
export async function recordMatchResult(
  matchId: string | null | undefined,
  result: "Win" | "Loss" | "Draw",
  pointsEarned: number = 0,
  gameTitle: string = "Arcade Match",
  opponentName: string = "Online Opponent"
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. If a valid matchId is present, try updating existing row
    if (matchId) {
      const { data, error } = await supabase
        .from("match_history")
        .update({
          result,
          points_change: pointsEarned,
        })
        .eq("id", matchId)
        .select();

      // If update succeeded and touched a row, exit
      if (!error && data && data.length > 0) {
        return;
      }
    }

    // 🛡️ 2. Fallback Insert: Create a fresh match history record if matchId didn't exist or UPDATE failed
    const { error: insertError } = await supabase
      .from("match_history")
      .insert({
        user_id: user.id,
        game_title: gameTitle,
        opponent_name: opponentName,
        result: result,
        points_change: pointsEarned,
      });

    if (insertError) {
      console.error("Failed to insert fallback match history:", insertError.message);
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