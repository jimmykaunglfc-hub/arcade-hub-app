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
    const { data, error } = await supabase.rpc("join_game_match", {
      p_game_title: gameTitle,
      p_entry_fee: entryFee,
      p_opponent_name: opponentName,
    });

    if (error) {
      console.error("RPC Game Entry Error:", error.message);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      return { success: false, error: data?.error || "MATCH_ENTRY_FAILED" };
    }

    const updatedPoints = data.updatedPoints ?? data.new_points;
    let matchId = data.match_id;

    // 🛡️ Fallback: If RPC didn't return a match_id, insert directly from client
    if (!matchId) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: insertedMatch } = await supabase
          .from("match_history")
          .insert({
            user_id: userData.user.id,
            game_title: gameTitle,
            opponent_name: opponentName,
            result: "Played",
            points_change: -entryFee,
          })
          .select("id")
          .single();

        if (insertedMatch) {
          matchId = insertedMatch.id;
        }
      }
    }

    return {
      success: true,
      updatedPoints,
      matchId,
    };
  } catch (err: any) {
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