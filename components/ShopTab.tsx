"use client";

import React, { useState, useEffect } from "react";
import { soundEngine } from "@/lib/soundManager";
import { supabase } from "@/lib/supabaseClient";

interface ShopTabProps {
  userId?: string | null;
}

const getCosmeticSlot = (item: any) => {
  const type = item?.cosmetic_type || "game_cosmetic";
  if (type !== "game_cosmetic") return type;
  // Game cosmetics are exclusive only within their own target game. Legacy
  // items without a target remain independent until an admin assigns one.
  return `game:${item?.game_target || item?.id || "unknown"}`;
};

export default function ShopTab({ userId }: ShopTabProps) {
  const [activeTab, setActiveTab] = useState<"currency" | "cosmetics">("currency");
  
  // Database States
  const [dbStoreItems, setDbStoreItems] = useState<any[]>([]);
  const [userInventory, setUserInventory] = useState<any[]>([]);
  const [rewardModal, setRewardModal] = useState<{ title: string; desc: string } | null>(null);

  // 📡 FETCH LIVE STORE DATA (From store_items & user_inventory)
  const fetchStoreData = async () => {
    if (!userId) return;

    // 1. Fetch All Active Store Items
    const { data: storeItems } = await supabase
      .from("store_items")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    
    if (storeItems) setDbStoreItems(storeItems);

    // 2. Fetch User Inventory
    const { data: inventory } = await supabase
      .from("user_inventory")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (inventory) {
      // Repair legacy records that were allowed to equip duplicates. Keep the
      // newest item in each cosmetic type and persist the correction.
      const itemsById = new Map((storeItems || []).map((item) => [item.id, item]));
      const seenTypes = new Set<string>();
      const duplicateIds = inventory
        .filter((entry) => entry.is_equipped)
        .filter((entry) => {
          const slot = getCosmeticSlot(itemsById.get(entry.cosmetic_id));
          if (seenTypes.has(slot)) return true;
          seenTypes.add(slot);
          return false;
        })
        .map((entry) => entry.id);
      if (duplicateIds.length) {
        const { error } = await supabase
          .from("user_inventory")
          .update({ is_equipped: false })
          .eq("user_id", userId)
          .in("id", duplicateIds);
        if (!error) {
          const duplicates = new Set(duplicateIds);
          setUserInventory(inventory.map((entry) => duplicates.has(entry.id) ? { ...entry, is_equipped: false } : entry));
        } else {
          setUserInventory(inventory);
        }
      } else {
        setUserInventory(inventory);
      }
    }

  };

  useEffect(() => {
    fetchStoreData();
  }, [userId]);

  // 🛒 PURCHASE CURRENCY PACKS (Mocked IAP/Conversion)
  const handleBuyCurrencyPack = async (item: any) => {
    if (!userId) return;
    
    soundEngine.playSFX("victory");
    
    setRewardModal({
      title: "PURCHASE COMPLETE",
      desc: `Successfully acquired ${item.name}. (Mocked Transaction)`,
    });
  };

  // 🛍️ BUY OR EQUIP COSMETIC ITEM
  const handleCosmeticAction = async (item: any) => {
    if (!userId) return;

    const inventoryItem = userInventory.find(inv => inv.cosmetic_id === item.id);
    const isOwned = !!inventoryItem;
    const isEquipped = inventoryItem?.is_equipped;

    if (isOwned) {
      if (isEquipped) {
        // Unequip this item directly
        await supabase
          .from("user_inventory")
          .update({ is_equipped: false })
          .eq("id", inventoryItem.id);
      } else {
        // Cosmetics occupy a type slot. A card background and an avatar border
        // may coexist, but a second item of the same type replaces the first.
        const cosmeticSlot = getCosmeticSlot(item);
        const sameTypeIds = dbStoreItems
          .filter((storeItem) => getCosmeticSlot(storeItem) === cosmeticSlot)
          .map((storeItem) => storeItem.id);
        const { error: unequipError } = await supabase
          .from("user_inventory")
          .update({ is_equipped: false })
          .eq("user_id", userId)
          .in("cosmetic_id", sameTypeIds);
        if (unequipError) {
          console.error("Unable to unequip matching cosmetic", unequipError);
          return;
        }
        await supabase
          .from("user_inventory")
          .update({ is_equipped: true })
          .eq("id", inventoryItem.id);
      }
      soundEngine.playSFX("move");
      fetchStoreData();
      return;
    }

    // Call the buy_cosmetic RPC function
    const { data: success, error } = await supabase.rpc("buy_cosmetic", {
      p_user_id: userId,
      p_cosmetic_id: item.id,
      p_price: item.price_points 
    });

    if (error) {
      console.error("Purchase Error:", error);
      soundEngine.playSFX("defeat");
      setRewardModal({
        title: "TRANSACTION FAILED",
        desc: `System Error: ${error.message}. Ensure your database RPC and Foreign Keys are updated.`,
      });
      return;
    }

    if (!success) {
      soundEngine.playSFX("defeat");
      setRewardModal({
        title: "INSUFFICIENT FUNDS",
        desc: `You need ${item.price_points.toLocaleString()} ${(item.price_currency || 'GEMS').toUpperCase()} to unlock ${item.name}.`,
      });
      return;
    }

    soundEngine.playSFX("victory");
    fetchStoreData();
    setRewardModal({
      title: "COSMETIC UNLOCKED!",
      desc: `${item.name} unlocked successfully.`,
    });
  };

  // Filter items for tabs
  const currencyItems = dbStoreItems.filter(item => item.category === "currency");
  const cosmeticItems = dbStoreItems.filter(item => item.category === "digital" || item.category === "physical");

  return (
    <>
      <div className="w-full max-w-md mx-auto flex flex-col font-sans pt-2 pb-6 select-none">
        {/* Persistent Store sub-navigation. The spacer keeps catalog cards from
            passing underneath the fixed control while the list scrolls. */}
        <div
          className="h-[52px]"
        >
        <div
          className="fixed left-1/2 z-[100] grid w-[calc(100%-40px)] max-w-md -translate-x-1/2 grid-cols-2 gap-3 rounded-2xl border border-surface-container-highest bg-surface p-1.5 shadow-lg dark:border-white/5 dark:bg-[#18181b]"
          style={{ top: "calc(90px + env(safe-area-inset-top))" }}
        >
          <button
            onClick={() => setActiveTab("currency")}
            className={`py-3 rounded-xl font-headline font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "currency"
                ? "bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black shadow-md"
                : "text-on-surface-variant dark:text-neutral-400 hover:text-white"
            }`}
          >
            Get Points
          </button>
          <button
            onClick={() => setActiveTab("cosmetics")}
            className={`py-3 rounded-xl font-headline font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "cosmetics"
                ? "bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black shadow-md"
                : "text-on-surface-variant dark:text-neutral-400 hover:text-white"
            }`}
          >
            Cosmetics
          </button>
        </div>
        </div>

        {/* Get Points: compact purchase cards matching the store reference. */}
        {activeTab === "currency" && (
          <div>
            <div className="mb-4 rounded-[20px] bg-gradient-to-r from-lime-500 to-emerald-500 p-5 text-black">
              <p className="font-headline text-sm font-black">Out of points?</p>
              <p className="mt-1 max-w-[250px] text-[11px] font-semibold leading-relaxed">Purchase more points to keep playing matches and spinning the wheel.</p>
            </div>
            <div className="space-y-3">
            {currencyItems.length === 0 ? (
              <p className="text-center text-xs text-on-surface-variant mt-10">No point packs available.</p>
            ) : (
              currencyItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-surface-container-highest bg-surface p-3.5 shadow-sm dark:border-white/5 dark:bg-[#111a2c]">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-container p-2 overflow-hidden">
                    {item.image_url && item.image_url !== "https://img.icons8.com/color/96/present.png" ? (
                       <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                    ) : (
                       <span className="material-symbols-outlined text-xl text-primary">bolt</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-left"><h3 className="font-headline text-sm font-black text-on-surface dark:text-white">{item.name}</h3><p className="truncate text-[10px] font-medium text-on-surface-variant">{item.description || "Points package"}</p></div>
                  <button
                    onClick={() => handleBuyCurrencyPack(item)}
                    className="shrink-0 rounded-xl bg-surface-container-highest px-4 py-2.5 text-xs font-black text-on-surface transition-colors active:scale-95 dark:bg-white dark:text-black"
                  >
                    {item.price_currency === 'fiat_usd' ? `$${Number(item.price_fiat).toFixed(2)}` : `${item.price_points.toLocaleString()} PTS`}
                  </button>
                </div>
              ))
            )}
            </div>
          </div>
        )}

        {/* 4. TAB CONTENT: GAME COSMETICS (Dynamic) */}
        {activeTab === "cosmetics" && (
          <div className="grid grid-cols-2 gap-4">
            {cosmeticItems.length === 0 ? (
              <p className="col-span-2 text-center text-xs text-on-surface-variant mt-10">No cosmetics available.</p>
            ) : (
              cosmeticItems.map((item) => {
                const inventoryItem = userInventory.find(inv => inv.cosmetic_id === item.id);
                const isOwned = !!inventoryItem;
                const isEquipped = inventoryItem?.is_equipped;

                return (
                  <div
                    key={item.id}
                    className={`bg-surface dark:bg-[#111a2c] border rounded-2xl p-3.5 flex flex-col items-center text-center shadow-lg relative overflow-hidden transition-all ${
                      isEquipped
                        ? "border-primary dark:border-[#CCFF00] shadow-[0_0_20px_rgba(204,255,0,0.15)]"
                        : "border-surface-container-highest dark:border-white/5"
                    }`}
                  >
                    <span className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant dark:text-neutral-500 mb-2 truncate max-w-full">
                      {item.sku}
                    </span>

                    <div className="w-full aspect-[1.45] bg-secondary-container/50 dark:bg-[#3c185a] rounded-xl flex items-center justify-center mb-3 overflow-hidden p-2">
                      {item.image_url && item.image_url !== "https://img.icons8.com/color/96/present.png" ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-8 h-8 rounded-full border-2 border-primary/50 flex items-center justify-center">
                          <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                        </div>
                      )}
                    </div>

                    <h3 className="font-bold text-sm text-on-surface dark:text-white mb-1 line-clamp-1">{item.name}</h3>

                    <div className="mb-5">
                      {isOwned ? (
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          UNLOCKED
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 justify-center text-xs font-black">
                          {item.price_currency === 'gems' ? (
                            <span className="material-symbols-outlined text-xs text-purple-400">diamond</span>
                          ) : (
                            <span className="material-symbols-outlined text-xs text-primary dark:text-[#CCFF00]">bolt</span>
                          )}
                          <span className={item.price_currency === 'gems' ? "text-purple-400" : "text-primary dark:text-[#CCFF00]"}>
                            {item.price_points.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleCosmeticAction(item)}
                      className={`w-full py-3 rounded-xl font-headline font-black text-xs uppercase tracking-wider transition-all active:scale-95 ${
                        isEquipped
                          ? "bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black shadow-md"
                          : isOwned
                          ? "bg-surface-container-highest text-on-surface dark:bg-white/10 dark:text-white"
                          : "bg-surface-container-highest text-on-surface dark:bg-[#27272a] dark:text-white"
                      }`}
                    >
                      {isEquipped ? "EQUIPPED ✓" : isOwned ? "EQUIP" : "UNLOCK"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 5. UNBOUNDED FULL-SCREEN MODAL */}
      {rewardModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-xs bg-surface dark:bg-[#18181b] border border-surface-container-highest dark:border-white/10 rounded-[32px] p-6 text-center shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 dark:bg-[#CCFF00]/10 border border-primary/30 dark:border-[#CCFF00]/30 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-primary dark:text-[#CCFF00]">auto_awesome</span>
            </div>

            <h3 className="font-headline font-black text-base text-on-surface dark:text-white tracking-tight mb-2 uppercase">
              {rewardModal.title}
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-neutral-400 font-medium leading-relaxed mb-6">
              {rewardModal.desc}
            </p>

            <button
              onClick={() => {
                setRewardModal(null);
                fetchStoreData();
              }}
              className="w-full py-3.5 bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black font-headline font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              ACCEPT
            </button>
          </div>
        </div>
      )}
    </>
  );
}
