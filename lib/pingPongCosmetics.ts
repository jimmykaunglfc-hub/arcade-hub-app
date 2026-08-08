"use client";

import { supabase } from "@/lib/supabaseClient";

/**
 * The asset data understood by the Ping Pong renderer. A Store Management
 * upload only needs `image_url`; the three directional URLs are optional
 * enhancements for artists who export dedicated left/centre/right sprites.
 */
export interface PingPongRacketSkin {
  id: string;
  name: string;
  imageUrl: string;
  centerImageUrl?: string | null;
  leftImageUrl?: string | null;
  rightImageUrl?: string | null;
}

type StoreItem = Record<string, unknown>;

const asText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return {};
};

/**
 * Supports the current Store Management `store_items` columns plus common
 * metadata names. This avoids a fragile dependency on a single admin schema.
 */
export const isPingPongRacketStoreItem = (item: StoreItem): boolean => {
  const modifiers = asRecord(item.modifiers ?? item.metadata);
  const searchable = [
    item.name,
    item.title,
    item.description,
    item.game_category,
    item.game_key,
    item.cosmetic_type,
    item.type,
    modifiers.game_category,
    modifiers.gameKey,
    modifiers.cosmetic_type,
    modifiers.type,
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();

  const isRacket = /racket|paddle/.test(searchable);
  const isPingPong = /ping[ -]?pong|table[ -]?tennis/.test(searchable);

  // A racket/paddle upload is treated as a Ping Pong skin even if older Store
  // Management records do not yet contain a game_category field.
  return isRacket && (isPingPong || !item.game_category);
};

export const toPingPongRacketSkin = (
  item: StoreItem
): PingPongRacketSkin | null => {
  const modifiers = asRecord(item.modifiers ?? item.metadata);
  const centerImageUrl =
    asText(modifiers.center_image_url) ||
    asText(modifiers.centerImageUrl) ||
    asText(item.center_image_url) ||
    asText(item.image_url);
  if (!centerImageUrl) return null;

  const firstDirectionalUrl =
    asText(item.image_url) || asText(modifiers.image_url) || centerImageUrl;

  return {
    id: asText(item.id) || centerImageUrl,
    name: asText(item.name) || asText(item.title) || "Racket skin",
    imageUrl: firstDirectionalUrl,
    centerImageUrl,
    leftImageUrl:
      asText(modifiers.left_image_url) ||
      asText(modifiers.leftImageUrl) ||
      asText(item.left_image_url) ||
      null,
    rightImageUrl:
      asText(modifiers.right_image_url) ||
      asText(modifiers.rightImageUrl) ||
      asText(item.right_image_url) ||
      null,
  };
};

/** Fetches the one equipped Ping Pong racket from the existing store tables. */
export async function getEquippedPingPongRacketSkin(
  userId: string
): Promise<PingPongRacketSkin | null> {
  const { data: inventory, error: inventoryError } = await supabase
    .from("user_inventory")
    .select("cosmetic_id, is_equipped")
    .eq("user_id", userId)
    .eq("is_equipped", true);

  if (inventoryError || !inventory?.length) return null;
  const cosmeticIds = inventory
    .map((entry) => String(entry.cosmetic_id ?? ""))
    .filter(Boolean);
  if (!cosmeticIds.length) return null;

  const { data: storeItems, error: storeError } = await supabase
    .from("store_items")
    .select("*")
    .in("id", cosmeticIds);

  if (storeError || !storeItems?.length) return null;
  const selected = (storeItems as StoreItem[]).find(
    isPingPongRacketStoreItem
  );
  return selected ? toPingPongRacketSkin(selected) : null;
}

