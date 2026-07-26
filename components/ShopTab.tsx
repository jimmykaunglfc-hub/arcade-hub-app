"use client";

import React, { useState, useEffect, useRef } from "react";
import { soundEngine } from "@/lib/soundManager";
import {
  storeManager,
  CATALOG_COSMETICS,
  UserStoreData,
  CosmeticItem,
} from "@/lib/storeManager";

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

export default function StorePage() {
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
  }, []);

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

  // 🎡 SPIN THE WHEEL MECHANIC
  const handleSpinCore = async () => {
    if (isSpinning || cooldownRemaining > 0) {
      soundEngine.playSFX("defeat");
      return;
    }

    soundEngine.playSFX("click");
    setIsSpinning(true);

    // Pick a winning segment randomly
    const winningIndex = Math.floor(Math.random() * WHEEL_SLOTS.length);
    const winningSlot = WHEEL_SLOTS[winningIndex];

    // Compute rotation angle (Full spins + slot slice offset)
    const slotAngle = 360 / WHEEL_SLOTS.length;
    const targetAngle = 360 * 5 + (360 - winningIndex * slotAngle);

    setWheelRotation(targetAngle);
    soundEngine.playSFX("dice_roll");

    // Wait for wheel rotation transition to complete (3.5 seconds)
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
    
    // Simulate payment response success
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
      // Unequip item
      soundEngine.playSFX("click");
      const updatedEquipped = { ...storeData.equippedCosmetics };
      delete updatedEquipped[item.gameId];

      const newData = { ...storeData, equippedCosmetics: updatedEquipped };
      setStoreData(newData);
      await storeManager.saveStoreData(newData);
      return;
    }

    if (isOwned) {
      // Equip item
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

    // Purchase check
    const currentBalance = item.currency === "points" ? storeData.points : storeData.gems;
    if (currentBalance < item.price) {
      soundEngine.playSFX("defeat");
      setRewardModal({
        title: "INSUFFICIENT FUNDS",
        desc: `You need ${item.price.toLocaleString()} ${item.currency === "points" ? "PTS" : "GEMS"} to unlock ${item.name}.`,
      });
      return;
    }

    // Deduct and unlock item
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
    <div className="w-full max-w-md mx-auto min-h-screen bg-[#09090b] text-white flex flex-col font-sans pb-24 select-none animate-fade-in">
      
      {/* 1. TOP STATUS HEADER */}
      <header className="w-full px-6 pt-safe pt-4 pb-3 flex items-center justify-between border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 shadow-inner">
            <span className="font-black text-sm text-[#CCFF00]">JY</span>
          </div>
          <div>
            <h1 className="font-black text-sm text-white leading-none">Joe Yoke</h1>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Matrix Store</span>
          </div>
        </div>

        {/* Currency Badges */}
        <div className="flex items-center gap-2">
          <div className="bg-[#18181b] border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="material-symbols-outlined text-sm text-[#CCFF00]">bolt</span>
            <span className="font-mono font-black text-xs text-white">{storeData.points.toLocaleString()}</span>
          </div>

          <div className="bg-[#18181b] border border-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="material-symbols-outlined text-sm text-purple-400">diamond</span>
            <span className="font-mono font-black text-xs text-white">{storeData.gems.toLocaleString()}</span>
          </div>
        </div>
      </header>

      <div className="px-5 pt-4 flex-1">
        
        {/* 2. DAILY FORTUNE WHEEL CARD */}
        <div className="w-full bg-[#18181b] border border-white/10 rounded-[28px] p-5 mb-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
          <h2 className="font-black text-lg text-white mb-1">Daily Fortune Wheel</h2>
          <p className="text-xs text-neutral-400 font-medium max-w-[260px] mb-5">
            Spin the matrix core module to extract free tokens.
          </p>

          {/* ROTATING WHEEL GRAPHIC */}
          <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
            {/* Top Indicator Arrow */}
            <div className="absolute -top-2 z-30 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-[#CCFF00] drop-shadow-[0_2px_8px_rgba(204,255,0,0.8)]" />

            <div
              className="w-full h-full rounded-full border-4 border-[#27272a] relative overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] transition-transform duration-[3500ms] cubic-bezier(0.15,0.95,0.3,1)"
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
            <div className="absolute inset-0 m-auto w-14 h-14 bg-[#09090b] border-2 border-[#CCFF00] rounded-full flex items-center justify-center shadow-lg z-20">
              <span className="material-symbols-outlined text-xl text-[#CCFF00] animate-pulse">
                bolt
              </span>
            </div>
          </div>

          {/* SPIN ACTION BUTTON */}
          <button
            onClick={handleSpinCore}
            disabled={isSpinning || cooldownRemaining > 0}
            className={`w-full py-4 rounded-2xl font-black text-sm tracking-wider uppercase transition-all shadow-lg active:scale-95 ${
              cooldownRemaining > 0
                ? "bg-[#27272a] text-neutral-500 cursor-not-allowed border border-white/5"
                : "bg-[#CCFF00] hover:bg-[#b3e600] text-black shadow-[0_0_20px_rgba(204,255,0,0.25)]"
            }`}
          >
            {isSpinning
              ? "EXTRACTING CORE..."
              : cooldownRemaining > 0
              ? `COOLDOWN: ${formatCooldown(cooldownRemaining)}`
              : "SPIN CORE"}
          </button>
        </div>

        {/* 3. STORE CATEGORY TABS */}
        <div className="grid grid-cols-2 gap-3 p-1.5 bg-[#18181b] border border-white/5 rounded-2xl mb-6">
          <button
            onClick={() => { soundEngine.playSFX("click"); setActiveTab("currency"); }}
            className={`py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "currency"
                ? "bg-[#CCFF00] text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Currency
          </button>
          <button
            onClick={() => { soundEngine.playSFX("click"); setActiveTab("cosmetics"); }}
            className={`py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "cosmetics"
                ? "bg-[#CCFF00] text-black shadow-md"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Cosmetics
          </button>
        </div>

        {/* 4. TAB CONTENT: CURRENCY PACKS */}
        {activeTab === "currency" && (
          <div className="grid grid-cols-2 gap-4 animate-fade-in">
            {/* 1,000 PTS */}
            <div className="bg-[#18181b] border border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
              <div className="w-14 h-14 bg-[#27272a] rounded-2xl flex items-center justify-center mb-4 border border-white/5">
                <span className="material-symbols-outlined text-2xl text-[#CCFF00]">bolt</span>
              </div>
              <h3 className="font-black text-xl text-white">1,000</h3>
              <p className="text-[10px] font-bold text-[#CCFF00] uppercase tracking-widest mb-6">PTS</p>
              <button
                onClick={() => handleBuyCurrency("points", 1000, "$0.99")}
                className="w-full bg-[#27272a] hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
              >
                $0.99
              </button>
            </div>

            {/* 5,000 PTS (BEST VALUE) */}
            <div className="bg-[#18181b] border-2 border-[#CCFF00]/40 rounded-3xl p-5 flex flex-col items-center text-center shadow-xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 bg-[#CCFF00] text-black font-black text-[9px] uppercase tracking-widest py-1">
                BEST VALUE
              </div>
              <div className="w-14 h-14 bg-[#27272a] rounded-2xl flex items-center justify-center mb-4 mt-3 border border-white/5">
                <span className="material-symbols-outlined text-2xl text-[#CCFF00]">bolt</span>
              </div>
              <h3 className="font-black text-xl text-white">5,000</h3>
              <p className="text-[10px] font-bold text-[#CCFF00] uppercase tracking-widest mb-6">PTS</p>
              <button
                onClick={() => handleBuyCurrency("points", 5000, "$3.99")}
                className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-black py-3 rounded-xl text-xs transition-transform active:scale-95 shadow-[0_0_15px_rgba(204,255,0,0.2)]"
              >
                $3.99
              </button>
            </div>

            {/* 100 GEMS */}
            <div className="bg-[#18181b] border border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
              <div className="w-14 h-14 bg-[#27272a] rounded-2xl flex items-center justify-center mb-4 border border-white/5">
                <span className="material-symbols-outlined text-2xl text-purple-400">diamond</span>
              </div>
              <h3 className="font-black text-xl text-white">100</h3>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-6">GEMS</p>
              <button
                onClick={() => handleBuyCurrency("gems", 100, "$1.99")}
                className="w-full bg-[#27272a] hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
              >
                $1.99
              </button>
            </div>

            {/* 500 GEMS */}
            <div className="bg-[#18181b] border border-white/5 rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
              <div className="w-14 h-14 bg-[#27272a] rounded-2xl flex items-center justify-center mb-4 border border-white/5">
                <span className="material-symbols-outlined text-2xl text-purple-400">diamond</span>
              </div>
              <h3 className="font-black text-xl text-white">500</h3>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-6">GEMS</p>
              <button
                onClick={() => handleBuyCurrency("gems", 500, "$6.99")}
                className="w-full bg-[#27272a] hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl text-xs transition-colors active:scale-95"
              >
                $6.99
              </button>
            </div>
          </div>
        )}

        {/* 5. TAB CONTENT: GAME COSMETICS */}
        {activeTab === "cosmetics" && (
          <div className="grid grid-cols-2 gap-4 animate-fade-in">
            {CATALOG_COSMETICS.map((item) => {
              const isOwned = storeData.ownedCosmetics.includes(item.id);
              const isEquipped = storeData.equippedCosmetics[item.gameId] === item.id;

              return (
                <div
                  key={item.id}
                  className={`bg-[#18181b] border rounded-3xl p-5 flex flex-col items-center text-center shadow-lg relative overflow-hidden transition-all ${
                    isEquipped
                      ? "border-[#CCFF00] shadow-[0_0_20px_rgba(204,255,0,0.15)]"
                      : "border-white/5"
                  }`}
                >
                  {/* Category Tag */}
                  <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500 mb-2">
                    {item.gameId}
                  </span>

                  <div className="w-14 h-14 bg-[#27272a] rounded-2xl flex items-center justify-center mb-3 border border-white/5">
                    <span className="material-symbols-outlined text-2xl text-white">
                      {item.icon}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-white mb-1 line-clamp-1">{item.name}</h3>

                  <div className="mb-5">
                    {isOwned ? (
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        UNLOCKED
                      </span>
                    ) : (
                      <div className="flex items-center gap-1 justify-center text-xs font-black">
                        <span className="material-symbols-outlined text-xs text-[#CCFF00]">
                          {item.currency === "points" ? "bolt" : "diamond"}
                        </span>
                        <span className={item.currency === "points" ? "text-[#CCFF00]" : "text-purple-400"}>
                          {item.price.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ACTION BUTTON */}
                  <button
                    onClick={() => handleCosmeticAction(item)}
                    className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 ${
                      isEquipped
                        ? "bg-[#CCFF00] text-black shadow-md"
                        : isOwned
                        ? "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                        : "bg-[#27272a] hover:bg-white/10 text-white border border-white/10"
                    }`}
                  >
                    {isEquipped ? "EQUIPPED ✓" : isOwned ? "EQUIP" : "UNLOCK"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. REWARD / TRANSACTION CONFIRMATION MODAL */}
      {rewardModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-xs bg-[#18181b] border border-white/10 rounded-[32px] p-6 text-center shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-[#CCFF00]">auto_awesome</span>
            </div>

            <h3 className="font-black text-base text-white tracking-tight mb-2 uppercase">
              {rewardModal.title}
            </h3>
            <p className="text-xs text-neutral-400 font-medium leading-relaxed mb-6">
              {rewardModal.desc}
            </p>

            <button
              onClick={() => {
                soundEngine.playSFX("click");
                setRewardModal(null);
              }}
              className="w-full py-3.5 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg active:scale-95 transition-transform"
            >
              ACCEPT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}