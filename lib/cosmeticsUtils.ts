// lib/cosmeticsUtils.ts
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

/**
 * A custom React hook that fetches the currently equipped cosmetic and its modifiers
 * for one exact game key (e.g., 'carrom', 'chess').
 */
export function useEquippedCosmetic(gameCategory: string) {
  const [modifiers, setModifiers] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCosmetic() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch the equipped item from the user's inventory joined with the cosmetics catalog
      const { data, error } = await supabase
        .from("user_inventory")
        .select(`
          is_equipped,
          cosmetics (
            cosmetic_type,
            game_target,
            modifiers,
            image_url
          )
        `)
        .eq("user_id", user.id)
        .eq("is_equipped", true)
        .eq("cosmetics.cosmetic_type", "game_cosmetic")
        .eq("cosmetics.game_target", gameCategory)
        .single();

      if (!error && data?.cosmetics) {
        // @ts-ignore - Supabase join typing workaround
        setModifiers(data.cosmetics.modifiers);
        // @ts-ignore
        setImageUrl(data.cosmetics.image_url);
      }
    }

    fetchCosmetic();
  }, [gameCategory]);

  return { modifiers, imageUrl };
}
