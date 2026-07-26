"use client";

import React, { useState, useEffect } from "react";
import { soundEngine } from "@/lib/soundManager";
import {
  storeManager,
  CATALOG_COSMETICS,
  UserStoreData,
  CosmeticItem,
} from "@/lib/storeManager";

interface ShopTabProps {
  userId?: string | null;
}

// 🎡 WHEEL SLOTS DEFINITION
const WHEEL_SLOTS = [
  { id: 1, label: "250 PTS", type: "points" as const, value: 250, color: "#18181b" },
  { id: 2, label: "5 GEMS", type: "gems" as const, value: 5, color: "#27272a" },
  { id: 3, label: "500 PTS", type: "points" as const, value: 500, color: "#18181b" },
  { id: 4, label: "100 PTS", type: "points" as const, value: 100, color: "#27272a" },
  { id: 5, label: "10 GEMS", type: "gems" as const, value: 10, color: "#18181b" },
  { id: 6, label: "1,000 PTS", type: "points" as const, value: 1000, color: "#27272a" },
  { id: 7, label: "2 GEMS", type: "gems" as const, value: 2, color: "#18181b" },
  { id: 8, label: "750 PTS", type: "points" as const, value: 750, color: "#27272a" },
];

const COOLDOWN_24H_MS = 24 * 60 * 60 * 1000;

export default function ShopTab({ userId }: ShopTabProps) {
  const [storeData, setStoreData] = useState<UserStoreData>(storeManager.getStoreData());
  const [activeTab, setActiveTab] = useState<"currency" | "cosmetics">("currency");
  
  // Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [rewardModal, setRewardModal] = useState<{ title: string; desc: string } | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Load and sync store data on mount
  useEffect(() => {
    const loaded = storeManager.getStoreData();
    setStoreData(loaded);
  }, [userId]);

  // ⏱️ 24-HOUR COOLDOWN TIMER ENGINE
  useEffect(() => {
    const checkCooldown = () => {
      if (!storeData.lastSpinTimestamp) {
        setCooldownRemaining(0);
        return;
      }
      const elapsed = Date.now() - storeData.lastSpinTimestamp;
      const remaining = COOLDOWN_24H_MS - elapsed;
      setCooldownRemaining(remaining > 0 ? remaining : 0);
    };

    checkCooldown();
    const timer = setInterval(checkCooldown, 1000);
    return () => clearInterval(timer);
  }, [storeData.lastSpinTimestamp]);

  const formatCooldown = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 🔊 TAB SWITCH SFX HANDLER
  const handleTabSwitch = (targetTab: "currency" | "cosmetics") => {
    if (activeTab !== targetTab) {
      soundEngine.playSFX("click");
      setActiveTab(targetTab);
    }
  };

  // 🎡 SPIN THE WHEEL MECHANIC
  const handleSpinCore = async () => {
    if (isSpinning || cooldownRemaining > 0) {
      soundEngine.playSFX("defeat");
      return;
    }

    soundEngine.playSFX("click");
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

      const updatedPoints = storeData.points + (winningSlot.type === "points" ? winningSlot.value : 0);
      const updatedGems = storeData.gems + (winningSlot.type === "gems" ? winningSlot.value : 0);
      const now = Date.now();

      const newData: UserStoreData = {
        ...storeData,
        points: updatedPoints,
        gems: updatedGems,
        lastSpinTimestamp: now,
      };

      setStoreData(newData);
      await storeManager.saveStoreData(newData);

      setRewardModal({
        title: "CORE EXTRACTION SUCCESS",
        desc: `You extracted +${winningSlot.value} ${winningSlot.type === "points" ? "PTS" : "GEMS"} from the Matrix Core!`,
      });
    }, 3500);
  };

  // 🛒 PURCHASE CURRENCY PACK
  const handleBuyCurrency = async (type: "points" | "gems", amount: number, priceLabel: string) => {
    soundEngine.playSFX("click");
    
    setTimeout(async () => {
      soundEngine.playSFX("victory");
      const newData: UserStoreData = {
        ...storeData,
        points: storeData.points + (type === "points" ? amount : 0),
        gems: storeData.gems + (type === "gems" ? amount : 0),
      };
      setStoreData(newData);
      await storeManager.saveStoreData(newData);

      setRewardModal({
        title: "PURCHASE COMPLETE",
        desc: `Successfully added +${amount.toLocaleString()} ${type === "points" ? "PTS" : "GEMS"} to your matrix account (${priceLabel}).`,
      });
    }, 400);
  };

  // 🛍️ BUY OR EQUIP COSMETIC ITEM
  const handleCosmeticAction = async (item: CosmeticItem) => {
    const isOwned = storeData.ownedCosmetics.includes(item.id);
    const isEquipped = storeData.equippedCosmetics[item.gameId] === item.id;

    if (isEquipped) {
      soundEngine.playSFX("click");
      const updatedEquipped = { ...storeData.equippedCosmetics };
      delete updatedEquipped[item.gameId];

      const newData = { ...storeData, equippedCosmetics: updatedEquipped };
      setStoreData(newData);
      await storeManager.saveStoreData(newData);
      return;
    }

    if (isOwned) {
      soundEngine.playSFX("click");
      const updatedEquipped = {
        ...storeData.equippedCosmetics,
        [item.gameId]: item.id,
      };

      const newData = { ...storeData, equippedCosmetics: updatedEquipped };
      setStoreData(newData);
      await storeManager.saveStoreData(newData);
      return;
    }

    const currentBalance = item.currency === "points" ? storeData.points : storeData.gems;
    if (currentBalance < item.price) {
      soundEngine.playSFX("defeat");
      setRewardModal({
        title: "INSUFFICIENT FUNDS",
        desc: `You need ${item.price.toLocaleString()} ${item.currency === "points" ? "PTS" : "GEMS"} to unlock ${item.name}.`,
      });
      return;
    }

    soundEngine.playSFX("victory");
    const newPoints = item.currency === "points" ? storeData.points - item.price : storeData.points;
    const newGems = item.currency === "gems" ? storeData.gems - item.price : storeData.gems;
    const newOwned = [...storeData.ownedCosmetics, item.id];
    const newEquipped = { ...storeData.equippedCosmetics, [item.gameId]: item.id };

    const newData: UserStoreData = {
      ...storeData,
      points: newPoints,
      gems: newGems,
      ownedCosmetics: newOwned,
      equippedCosmetics: newEquipped,
    };

    setStoreData(newData);
    await storeManager.saveStoreData(newData);

    setRewardModal({
      title: "COSMETIC UNLOCKED!",
      desc: `${item.name} unlocked and equipped for ${item.gameId.toUpperCase()}.`,
    });
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col font-sans pt-2 pb-6 select-none animate-fade-in">
      
      {/* 1. DAILY FORTUNE WHEEL CARD */}
      <div className="w-full bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/10 rounded-[28px] p-5 mb-6 shadow-xl flex flex-col items-center text-center relative overflow-hidden">
        <h2 className="font-headline font-black text-lg text-on-surface dark:text-white mb-1">
          Daily Fortune Wheel
        </h2>
        <p className="text-xs text-on-surface-variant dark:text-neutral-400 font-medium max-w-[260px] mb-5">
          Spin the matrix core module to extract free tokens.
        </p>

        {/* ROTATING WHEEL GRAPHIC */}
        <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
          {/* Top Indicator Arrow */}
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
                  <span className="text-[9px] font-black text-neutral-300 uppercase tracking-tighter">
                    {slot.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Core Center Emblem */}
          <div className="absolute inset-0 m-auto w-14 h-14 bg-background dark:bg-[#09090b] border-2 border-primary dark:border-[#CCFF00] rounded-full flex items-center justify-center shadow-lg z-20">
            <span className="material-symbols-outlined text-xl text-primary dark:text-[#CCFF00] animate-pulse">
              bolt
            </span>
          </div>
        </div>

        {/* SPIN ACTION BUTTON */}
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
          onClick={() => handleTabSwitch("currency")}
          className={`py-3 rounded-xl font-headline font-bold text-xs uppercase tracking-wider transition-all ${
            activeTab === "currency"
              ? "bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black shadow-md"
              : "text-on-surface-variant dark:text-neutral-400 hover:text-white"
          }`}
        >
          Currency
        </button>
        <button
          onClick={() => handleTabSwitch("cosmetics")}
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
        <div className="grid grid-cols-2 gap-4 animate-fade-in">
          {/* 1,000 PTS */}
          <div className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
            <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-primary dark:text-[#CCFF00]">bolt</span>
            </div>
            <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">1,000</h3>
            <p className="text-[10px] font-bold text-primary dark:text-[#CCFF00] uppercase tracking-widest mb-6">PTS</p>
            <button
              onClick={() => handleBuyCurrency("points", 1000, "$0.99")}
              className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
            >
              $0.99
            </button>
          </div>

          {/* 5,000 PTS (BEST VALUE) */}
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
              onClick={() => handleBuyCurrency("points", 5000, "$3.99")}
              className="w-full bg-primary dark:bg-[#CCFF00] text-on-primary dark:text-black font-headline font-black py-3 rounded-xl text-xs transition-transform active:scale-95 shadow-md"
            >
              $3.99
            </button>
          </div>

          {/* 100 GEMS */}
          <div className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
            <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-purple-400">diamond</span>
            </div>
            <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">100</h3>
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-6">GEMS</p>
            <button
              onClick={() => handleBuyCurrency("gems", 100, "$1.99")}
              className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
            >
              $1.99
            </button>
          </div>

          {/* 500 GEMS */}
          <div className="bg-surface border border-surface-container-highest dark:bg-[#18181b] dark:border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
            <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-2xl text-purple-400">diamond</span>
            </div>
            <h3 className="font-headline font-black text-xl text-on-surface dark:text-white">500</h3>
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-6">GEMS</p>
            <button
              onClick={() => handleBuyCurrency("gems", 500, "$6.99")}
              className="w-full bg-surface-container-highest hover:opacity-90 dark:bg-[#27272a] text-on-surface dark:text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
            >
              $6.99
            </button>
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT: GAME COSMETICS */}
      {activeTab === "cosmetics" && (
        <div className="grid grid-cols-2 gap-4 animate-fade-in">
          {CATALOG_COSMETICS.map((item) => {
            const isOwned = storeData.ownedCosmetics.includes(item.id);
            const isEquipped = storeData.equippedCosmetics[item.gameId] === item.id;

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
                  {item.gameId}
                </span>

                <div className="w-14 h-14 bg-surface-container-highest dark:bg-[#27272a] rounded-2xl flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-2xl text-on-surface dark:text-white">
                    {item.icon}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-on-surface dark:text-white mb-1 line-clamp-1">{item.name}</h3>

                <div className="mb-5">
                  {isOwned ? (
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      UNLOCKED
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 justify-center text-xs font-black">
                      <span className="material-symbols-outlined text-xs text-primary dark:text-[#CCFF00]">
                        {item.currency === "points" ? "bolt" : "diamond"}
                      </span>
                      <span className={item.currency === "points" ? "text-primary dark:text-[#CCFF00]" : "text-purple-400"}>
                        {item.price.toLocaleString()}
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
          })}
        </div>
      )}

      {/* 5. REWARD / TRANSACTION CONFIRMATION MODAL */}
      {rewardModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
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
                soundEngine.playSFX("click");
                setRewardModal(null);
              }}
              className="w-full py-3.5 bg-primary text-on-primary dark:bg-[#CCFF00] dark:text-black font-headline font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              ACCEPT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}