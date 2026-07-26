"use client";

import { supabase } from "./supabaseClient";

export interface CosmeticItem {
  id: string;
  name: string;
  gameId: "chess" | "checkers" | "carrom" | "liarsdice" | "global";
  category: "board" | "pieces" | "cup" | "avatar";
  currency: "points" | "gems";
  price: number;
  icon: string;
  previewClass?: string;
}

export const CATALOG_COSMETICS: CosmeticItem[] = [
  {
    id: "neon_glow_striker",
    name: "Neon Glow Striker",
    gameId: "carrom",
    category: "pieces",
    currency: "points",
    price: 2500,
    icon: "adjust",
  },
  {
    id: "obsidian_board",
    name: "Obsidian Board",
    gameId: "chess",
    category: "board",
    currency: "points",
    price: 8000,
    icon: "grid_4x4",
  },
  {
    id: "royal_jade_cup",
    name: "Royal Jade Cup",
    gameId: "liarsdice",
    category: "cup",
    currency: "points",
    price: 1500,
    icon: "casino",
  },
  {
    id: "cyber_checkers_board",
    name: "Cyber Matrix Board",
    gameId: "checkers",
    category: "board",
    currency: "points",
    price: 3000,
    icon: "crop_square",
  },
  {
    id: "gold_crown_pieces",
    name: "Gold Crown Set",
    gameId: "chess",
    category: "pieces",
    currency: "gems",
    price: 20,
    icon: "workspace_premium",
  },
];

export interface UserStoreData {
  points: number;
  gems: number;
  lastSpinTimestamp: number | null;
  ownedCosmetics: string[];
  equippedCosmetics: Record<string, string>; // e.g. { chess: "obsidian_board" }
}

const STORAGE_KEY = "joeyoke_user_store_v1";

const DEFAULT_STORE_DATA: UserStoreData = {
  points: 2000,
  gems: 45,
  lastSpinTimestamp: null,
  ownedCosmetics: [],
  equippedCosmetics: {},
};

export const storeManager = {
  // Load current economy state ( Supabase with LocalStorage fallback )
  getStoreData: (): UserStoreData => {
    if (typeof window === "undefined") return DEFAULT_STORE_DATA;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STORE_DATA));
        return DEFAULT_STORE_DATA;
      }
      return JSON.parse(raw);
    } catch {
      return DEFAULT_STORE_DATA;
    }
  },

  // Save updated state to local storage & Supabase
  saveStoreData: async (data: UserStoreData): Promise<void> => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await supabase.from("user_profiles").upsert({
          id: userData.user.id,
          points: data.points,
          gems: data.gems,
          last_spin_timestamp: data.lastSpinTimestamp,
          owned_cosmetics: data.ownedCosmetics,
          equipped_cosmetics: data.equippedCosmetics,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      // Gracefully handle offline or missing table state
    }
  },

  // Query what cosmetic is currently equipped for a specific game
  getEquippedCosmetic: (gameId: string): string | null => {
    const data = storeManager.getStoreData();
    return data.equippedCosmetics[gameId] || null;
  },
};