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

    return {
      success: true,
      updatedPoints,
      matchId: data.match_id,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Network Error" };
  }
}

/**
 * Optional helper to update a match status when game completes
 */
export async function recordMatchResult(
  matchId: string,
  result: "Win" | "Loss" | "Draw",
  pointsEarned: number = 0
) {
  try {
    const { error } = await supabase
      .from("matches")
      .update({
        result,
        points_changed: pointsEarned,
      })
      .eq("id", matchId);

    if (error) {
      console.error("Error updating match result:", error.message);
    }
  } catch (err) {
    console.error("Failed to record match result:", err);
  }
}