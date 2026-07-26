// lib/matchUtils.ts
import { supabase } from "./supabaseClient";

export async function recordMatchHistory({
  userId,
  gameTitle,
  opponentName,
  result,
  pointsChange,
}: {
  userId: string;
  gameTitle: string;
  opponentName: string;
  result: "win" | "loss" | "draw" | "playing";
  pointsChange: number;
}) {
  try {
    await supabase.from("match_history").insert({
      user_id: userId,
      game_title: gameTitle,
      opponent_name: opponentName,
      result: result,
      points_change: pointsChange,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to record match history:", err);
  }
}