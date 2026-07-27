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
}: GameEntryParams): Promise<{ success: boolean; updatedPoints?: number; error?: string }> {
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

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return { success: true, updatedPoints: data.new_points };
  } catch (err: any) {
    return { success: false, error: err.message || "Network Error" };
  }
}