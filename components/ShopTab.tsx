"use client";

import React, { useState, useEffect } from "react";
import { soundEngine } from "@/lib/soundManager";
import { supabase } from "@/lib/supabaseClient";

interface ShopTabProps {
  userId?: string | null;
}

// 🎡 WHEEL SLOTS DEFINITION
const WHEEL_SLOTS = [
  { id: 1, label: "250 PTS", type: "points" as const, value: 250 },
  { id: 2, label: "5 GEMS", type: "gems" as const, value: 5 },
  { id: 3, label: "500 PTS", type: "points" as const, value: 500 },
  { id: 4, label: "100 PTS", type: "points" as const, value: 100 },
  { id: 5, label: "10 GEMS", type: "gems" as const, value: 10 },
  { id: 6, label: "1,000 PTS", type: "points" as const, value: 1000 },
  { id: 7, label: "2 GEMS", type: "gems" as const, value: 2 },
  { id: 8, label: "750 PTS", type: "points" as const, value: 750 },
];

const COOLDOWN_24H_MS = 24 * 60 * 60 * 1000;

export default function ShopTab({ userId }: ShopTabProps) {
  const [activeTab, setActiveTab] = useState<"currency" | "cosmetics">("currency");
  
  // Database States
  const [dbStoreItems, setDbStoreItems] = useState<any[]>([]);
  const [userInventory, setUserInventory] = useState<any[]>([]);
  const [lastSpin, setLastSpin] = useState<number | null>(null);
  const [wheelSlots, setWheelSlots] = useState(WHEEL_SLOTS);

  // Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [rewardModal, setRewardModal] = useState<{ title: string; desc: string } | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

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
          const type = itemsById.get(entry.cosmetic_id)?.cosmetic_type || "game_cosmetic";
          if (seenTypes.has(type)) return true;
          seenTypes.add(type);
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

    // 3. Fetch Profile Last Spin and the admin-managed wheel display.
    const [{ data: profile }, { data: rewards }] = await Promise.all([
      supabase
      .from("profiles")
      .select("last_spin")
      .eq("id", userId)
      .single(),
      supabase
        .from("wheel_rewards")
        .select("id, label, reward_type, reward_value, display_order")
        .eq("is_active", true)
        .order("display_order"),
    ]);
    
    if (profile?.last_spin) {
      setLastSpin(new Date(profile.last_spin).getTime());
    }
    if (rewards?.length) setWheelSlots(rewards.map((reward: any) => ({ id: reward.id, label: reward.label, type: reward.reward_type, value: reward.reward_value })));
  };

  useEffect(() => {
    fetchStoreData();
  }, [userId]);

  // ⏱️ 24-HOUR COOLDOWN TIMER ENGINE
  useEffect(() => {
    const checkCooldown = () => {
      if (!lastSpin) {
        setCooldownRemaining(0);
        return;
      }
      const elapsed = Date.now() - lastSpin;
      const remaining = COOLDOWN_24H_MS - elapsed;
      setCooldownRemaining(remaining > 0 ? remaining : 0);
    };

    checkCooldown();
    const timer = setInterval(checkCooldown, 1000);
    return () => clearInterval(timer);
  }, [lastSpin]);

  const formatCooldown = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 🎡 SPIN THE WHEEL MECHANIC
  const handleSpinCore = async () => {
    if (isSpinning || cooldownRemaining > 0 || !userId) return;

    setIsSpinning(true);

    const { data: winningSlot, error } = await supabase.rpc("spin_daily_wheel");
    if (error || !winningSlot) {
      setIsSpinning(false);
      setRewardModal({ title: "WHEEL UNAVAILABLE", desc: error?.message || "The wheel is being configured by the team." });
      return;
    }
    const winningIndex = Math.max(0, wheelSlots.findIndex(slot => String(slot.id) === String(winningSlot.id)));

    const slotAngle = 360 / wheelSlots.length;
    const targetAngle = 360 * 5 + (360 - winningIndex * slotAngle);

    setWheelRotation(targetAngle);
    soundEngine.playSFX("dice_roll");

    setTimeout(async () => {
      setIsSpinning(false);
      soundEngine.playSFX("victory");

      setLastSpin(new Date(winningSlot.spun_at).getTime());

      setRewardModal({
        title: "CORE EXTRACTION SUCCESS",
        desc: `You extracted +${winningSlot.value} ${winningSlot.type === "points" ? "PTS" : "GEMS"} from the Matrix Core!`,
      });
    }, 3500);
  };

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
        const cosmeticType = item.cosmetic_type || "game_cosmetic";
        const sameTypeIds = dbStoreItems
          .filter((storeItem) => (storeItem.cosmetic_type || "game_cosmetic") === cosmeticType)
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
        
        {/* 1. DAILY FORTUNE WHEEL CARD */}
        <div className="w-full bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/10 rounded-[28px] p-5 mb-6 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
          <h2 className="font-headline font-black text-lg text-on-surface dark:text-white mb-1">
            Daily Fortune Wheel
          </h2>
          <p className="text-xs text-on-surface-variant dark:text-neutral-400 font-medium max-w-[260px] mb-5">
            Spin the matrix core module to extract free tokens.
          </p>

          <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
            <div className="absolute -top-2 z-30 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-primary dark:border-t-[#CCFF00] drop-shadow-[0_2px_8px_rgba(204,255,0,0.8)]" />

            <div
              className="w-full h-full rounded-full border-4 border-surface-container-highest dark:border-[#27272a] relative overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] transition-transform duration-[3500ms] cubic-bezier(0.15,0.95,0.3,1)"
              style={{ transform: `rotate(${wheelRotation}deg)` }}
            >
              {wheelSlots.map((slot, index) => {
                const angle = (360 / wheelSlots.length) * index;
                return (
                  <div
                    key={slot.id}
                    className="absolute w-full h-full top-0 left-0 flex justify-center pt-2"
                    style={{
                      transform: `rotate(${angle}deg)`,
                      transformOrigin: "50% 50%",
                    }}
                  >
                    <span className="text-[9px] font-black text-on-surface dark:text-neutral-300 uppercase tracking-tighter">
                      {slot.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="absolute inset-0 m-auto w-14 h-14 bg-background dark:bg-[#09090b] border-2 border-primary dark:border-[#CCFF00] rounded-full flex items-center justify-center shadow-lg z-20">
              <span className="material-symbols-outlined text-xl text-primary dark:text-[#CCFF00] animate-pulse">
                bolt
              </span>
            </div>
          </div>

          <button
            onClick={handleSpinCore}
            disabled={isSpinning || cooldownRemaining > 0}
            className={`w-full py-4 rounded-2xl font-headline font-black text-sm tracking-wider uppercase transition-all shadow-lg active:scale-95 ${
              cooldownRemaining > 0
                ? "bg-surface-container-highest text-on-surface-variant cursor-not-allowed border border-white/5"
                : "bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black shadow-[0_0_20px_rgba(204,255,0,0.25)]"
            }`}
          >
            {isSpinning
              ? "EXTRACTING CORE..."
              : cooldownRemaining > 0
              ? `COOLDOWN: ${formatCooldown(cooldownRemaining)}`
              : "SPIN CORE"}
          </button>
        </div>

        {/* 2. STORE CATEGORY TABS */}
        <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-2xl mb-6">
          <button
            onClick={() => setActiveTab("currency")}
            className={`py-3 rounded-xl font-headline font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "currency"
                ? "bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black shadow-md"
                : "text-on-surface-variant dark:text-neutral-400 hover:text-white"
            }`}
          >
            Currency
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

        {/* 3. TAB CONTENT: CURRENCY PACKS (Dynamic) */}
        {activeTab === "currency" && (
          <div className="grid grid-cols-2 gap-4">
            {currencyItems.length === 0 ? (
              <p className="col-span-2 text-center text-xs text-on-surface-variant mt-10">No currency packs available.</p>
            ) : (
              currencyItems.map((item) => (
                <div key={item.id} className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
                  <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4 p-2 overflow-hidden">
                    {item.image_url && item.image_url !== "https://img.icons8.com/color/96/present.png" ? (
                       <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                    ) : (
                       <span className="material-symbols-outlined text-2xl text-primary dark:text-[#CCFF00]">bolt</span>
                    )}
                  </div>
                  <h3 className="font-headline font-black text-xl text-on-surface dark:text-white line-clamp-1">{item.name}</h3>
                  <p className="text-[10px] font-bold text-primary dark:text-[#CCFF00] uppercase tracking-widest mb-6 truncate max-w-full">
                    {item.description || "PACK"}
                  </p>
                  <button
                    onClick={() => handleBuyCurrencyPack(item)}
                    className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
                  >
                    {item.price_currency === 'fiat_usd' ? `$${Number(item.price_fiat).toFixed(2)}` : `${item.price_points.toLocaleString()} PTS`}
                  </button>
                </div>
              ))
            )}
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
                    className={`bg-surface dark:bg-[#18181b] border rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden transition-all ${
                      isEquipped
                        ? "border-primary dark:border-[#CCFF00] shadow-[0_0_20px_rgba(204,255,0,0.15)]"
                        : "border-surface-container-highest dark:border-white/5"
                    }`}
                  >
                    <span className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant dark:text-neutral-500 mb-2 truncate max-w-full">
                      {item.sku}
                    </span>

                    <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-3 overflow-hidden p-1">
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
