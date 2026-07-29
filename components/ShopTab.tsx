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
  const [dbCosmetics, setDbCosmetics] = useState<any[]>([]);
  const [userInventory, setUserInventory] = useState<any[]>([]);
  const [lastSpin, setLastSpin] = useState<number | null>(null);

  // Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [rewardModal, setRewardModal] = useState<{ title: string; desc: string } | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // 📡 FETCH LIVE STORE DATA
  const fetchStoreData = async () => {
    if (!userId) return;

    // 1. Fetch Cosmetics Catalog
    const { data: cosmetics } = await supabase.from("cosmetics").select("*");
    if (cosmetics) setDbCosmetics(cosmetics);

    // 2. Fetch User Inventory
    const { data: inventory } = await supabase
      .from("user_inventory")
      .select("*")
      .eq("user_id", userId);
    if (inventory) setUserInventory(inventory);

    // 3. Fetch Profile Last Spin
    const { data: profile } = await supabase
      .from("profiles")
      .select("last_spin")
      .eq("id", userId)
      .single();
    
    if (profile?.last_spin) {
      setLastSpin(new Date(profile.last_spin).getTime());
    }
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

    const winningIndex = Math.floor(Math.random() * WHEEL_SLOTS.length);
    const winningSlot = WHEEL_SLOTS[winningIndex];

    const slotAngle = 360 / WHEEL_SLOTS.length;
    const targetAngle = 360 * 5 + (360 - winningIndex * slotAngle);

    setWheelRotation(targetAngle);
    soundEngine.playSFX("dice_roll");

    setTimeout(async () => {
      setIsSpinning(false);
      soundEngine.playSFX("victory");

      // Update Database
      const now = new Date().toISOString();
      const columnToUpdate = winningSlot.type === "points" ? "points" : "gems";
      
      // Fetch current balance
      const { data: profile } = await supabase.from("profiles").select(columnToUpdate).eq("id", userId).single();
      
      // Safely access dynamic column property to avoid TS errors
      const currentBalance = profile ? Number((profile as any)[columnToUpdate]) : 0;
      const newBalance = currentBalance + winningSlot.value;

      await supabase
        .from("profiles")
        .update({ [columnToUpdate]: newBalance, last_spin: now })
        .eq("id", userId);

      setLastSpin(new Date(now).getTime());

      setRewardModal({
        title: "CORE EXTRACTION SUCCESS",
        desc: `You extracted +${winningSlot.value} ${winningSlot.type === "points" ? "PTS" : "GEMS"} from the Matrix Core!`,
      });
    }, 3500);
  };

  // 🛒 PURCHASE POINTS (MOCKED IAP)
  const handleBuyPoints = async (amount: number, priceLabel: string) => {
    if (!userId) return;
    
    soundEngine.playSFX("victory");
    
    const { data: profile } = await supabase.from("profiles").select("points").eq("id", userId).single();
    const newPoints = (profile?.points || 0) + amount;

    await supabase.from("profiles").update({ points: newPoints }).eq("id", userId);

    setRewardModal({
      title: "PURCHASE COMPLETE",
      desc: `Successfully added +${amount.toLocaleString()} PTS to your matrix account (${priceLabel}).`,
    });
  };

  // 🔄 CONVERT POINTS TO GEMS
  const handleConvertCurrency = async (pointsCost: number, gemsReward: number) => {
    if (!userId) return;

    const { data: success, error } = await supabase.rpc("convert_points_to_gems", {
      p_user_id: userId,
      p_points_cost: pointsCost,
      p_gems_reward: gemsReward
    });

    if (error || !success) {
      soundEngine.playSFX("defeat");
      setRewardModal({
        title: "INSUFFICIENT POINTS",
        desc: `You need ${pointsCost.toLocaleString()} PTS to synthesize ${gemsReward} GEMS.`,
      });
      return;
    }

    soundEngine.playSFX("victory");
    setRewardModal({
      title: "SYNTHESIS COMPLETE",
      desc: `Successfully converted ${pointsCost.toLocaleString()} PTS into ${gemsReward} GEMS.`,
    });
  };

  // 🛍️ BUY OR EQUIP COSMETIC ITEM
  const handleCosmeticAction = async (item: any) => {
    if (!userId) return;

    const inventoryItem = userInventory.find(inv => inv.cosmetic_id === item.id);
    const isOwned = !!inventoryItem;
    const isEquipped = inventoryItem?.is_equipped;

    if (isOwned) {
      // Toggle Equip/Unequip
      if (isEquipped) {
        await supabase.from("user_inventory").update({ is_equipped: false }).eq("id", inventoryItem.id);
      } else {
        await supabase.rpc("equip_cosmetic", {
          p_user_id: userId,
          p_cosmetic_id: item.id,
          p_category: item.game_category
        });
      }
      soundEngine.playSFX("move"); // Replaced "pop" with an existing valid sound
      fetchStoreData();
      return;
    }

    // Attempt Purchase
    const { data: success, error } = await supabase.rpc("buy_cosmetic", {
      p_user_id: userId,
      p_cosmetic_id: item.id,
      p_price: item.price_gems
    });

    if (error || !success) {
      soundEngine.playSFX("defeat");
      setRewardModal({
        title: "INSUFFICIENT GEMS",
        desc: `You need ${item.price_gems.toLocaleString()} GEMS to unlock ${item.name}.`,
      });
      return;
    }

    soundEngine.playSFX("victory");
    fetchStoreData();
    setRewardModal({
      title: "COSMETIC UNLOCKED!",
      desc: `${item.name} unlocked for ${item.game_category.toUpperCase()}.`,
    });
  };

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
              {WHEEL_SLOTS.map((slot, index) => {
                const angle = (360 / WHEEL_SLOTS.length) * index;
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

        {/* 3. TAB CONTENT: CURRENCY PACKS */}
        {activeTab === "currency" && (
          <div className="grid grid-cols-2 gap-4">
            {/* 1,000 PTS (IAP) */}
            <div className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
              <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-primary dark:text-[#CCFF00]">bolt</span>
              </div>
              <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">1,000</h3>
              <p className="text-[10px] font-bold text-primary dark:text-[#CCFF00] uppercase tracking-widest mb-6">PTS</p>
              <button
                onClick={() => handleBuyPoints(1000, "$0.99")}
                className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
              >
                $0.99
              </button>
            </div>

            {/* 5,000 PTS (IAP) */}
            <div className="bg-surface border-2 border-primary dark:border-[#CCFF00]/40 dark:bg-[#18181b] rounded-3xl p-5 flex flex-col items-center text-center shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 bg-primary dark:bg-[#CCFF00] text-on-primary dark:text-black font-headline font-black text-[9px] uppercase tracking-widest py-1">
                BEST VALUE
              </div>
              <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4 mt-3">
                <span className="material-symbols-outlined text-2xl text-primary dark:text-[#CCFF00]">bolt</span>
              </div>
              <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">5,000</h3>
              <p className="text-[10px] font-bold text-primary dark:text-[#CCFF00] uppercase tracking-widest mb-6">PTS</p>
              <button
                onClick={() => handleBuyPoints(5000, "$3.99")}
                className="w-full bg-primary dark:bg-[#CCFF00] text-on-primary dark:text-black font-headline font-black py-3 rounded-xl text-xs transition-transform active:scale-95 shadow-md"
              >
                $3.99
              </button>
            </div>

            {/* 100 GEMS (CONVERSION) */}
            <div className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
              <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-purple-400">diamond</span>
              </div>
              <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">100</h3>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-6">GEMS</p>
              <button
                onClick={() => handleConvertCurrency(10000, 100)}
                className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95 flex items-center justify-center gap-1"
              >
                10,000 <span className="material-symbols-outlined text-[14px] text-primary">bolt</span>
              </button>
            </div>

            {/* 500 GEMS (CONVERSION) */}
            <div className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
              <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-purple-400">diamond</span>
              </div>
              <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">500</h3>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-6">GEMS</p>
              <button
                onClick={() => handleConvertCurrency(45000, 500)}
                className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95 flex items-center justify-center gap-1"
              >
                45,000 <span className="material-symbols-outlined text-[14px] text-primary">bolt</span>
              </button>
            </div>
          </div>
        )}

        {/* 4. TAB CONTENT: GAME COSMETICS */}
        {activeTab === "cosmetics" && (
          <div className="grid grid-cols-2 gap-4">
            {dbCosmetics.length === 0 ? (
              <p className="col-span-2 text-center text-xs text-on-surface-variant mt-10">No cosmetics available in the database yet.</p>
            ) : (
              dbCosmetics.map((item) => {
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
                    <span className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant dark:text-neutral-500 mb-2">
                      {item.game_category}
                    </span>

                    <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-3">
                      <div className="w-8 h-8 rounded-full border-2 border-primary/50 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-on-surface dark:text-white mb-1 line-clamp-1">{item.name}</h3>

                    <div className="mb-5">
                      {isOwned ? (
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          UNLOCKED
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 justify-center text-xs font-black">
                          <span className="material-symbols-outlined text-xs text-purple-400">diamond</span>
                          <span className="text-purple-400">{item.price_gems.toLocaleString()}</span>
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