"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const COIN_PACKAGES = [
  { id: "pack_1", title: "Starter Pouch", amount: 1000, price: "$0.99", popular: false, type: "points" },
  { id: "pack_2", title: "Arcade Chest", amount: 5000, price: "$3.99", popular: true, type: "points" },
  { id: "pack_3", title: "Matrix Vault", amount: 12000, price: "$8.99", popular: false, type: "points" },
  { id: "pack_4", title: "Gem Handful", amount: 50, price: "$4.99", popular: false, type: "gems" },
];

const COSMETIC_ITEMS = [
  { id: "cos_1", title: "Neon Glow Striker", type: "Carrom", price: 2500, icon: "radio_button_checked", color: "text-[#9DFF00]" },
  { id: "cos_2", title: "Obsidian Board", type: "Chess", price: 8000, icon: "grid_4x4", color: "text-white" },
  { id: "cos_3", title: "Crown Badge", type: "Profile", price: 1500, icon: "workspace_premium", color: "text-[#B259FF]" },
  { id: "cos_4", title: "Holographic Dice", type: "3D Asset", price: 4000, icon: "casino", color: "text-[#3B82F6]" },
];

interface ShopTabProps {
  userId: string | null;
}

export default function ShopTab({ userId }: ShopTabProps) {
  const [activeCategory, setActiveCategory] = useState<"currency" | "cosmetics">("currency");
  
  // Fortune Wheel Engine Hooks
  const [canSpin, setCanSpin] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinReward, setSpinReward] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

  useEffect(() => {
    if (canSpin) return;
    
    let seconds = 3600; 
    const interval = setInterval(() => {
      seconds -= 1;
      const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
      const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
      const s = (seconds % 60).toString().padStart(2, '0');
      setTimeLeft(`${h}:${m}:${s}`);
      
      if (seconds <= 0) {
        setCanSpin(true);
        setSpinReward(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [canSpin]);

  const handleSpinWheel = async () => {
    if (!canSpin || isSpinning || !userId) return;
    setIsSpinning(true);
    setSpinReward(null);

    setTimeout(async () => {
      const rewards = [50, 100, 250, 500, 1000];
      const randomReward = rewards[Math.floor(Math.random() * rewards.length)];

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("points")
          .eq("id", userId)
          .single();
          
        const startingPoints = profile?.points ?? 0;

        await supabase
          .from("profiles")
          .update({ points: startingPoints + randomReward })
          .eq("id", userId);
        
        setSpinReward(randomReward);
        setCanSpin(false);
      } catch (err) {
        console.error("Atomic transaction ledger fail:", err);
      } finally {
        setIsSpinning(false);
      }
    }, 2500);
  };

  const executePaymentGateway = async (packTitle: string, pointAmount: number) => {
    if (!userId) return;
    
    const tokenVerification = window.confirm(
      `Joe Yoke Secure Billing Center:\n\nAuthorize mock payment gateway layer via Apple Pay / Google Pay for "${packTitle}"?`
    );
    if (!tokenVerification) return;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("points")
        .eq("id", userId)
        .single();
        
      const startingPoints = profile?.points ?? 0;

      await supabase
        .from("profiles")
        .update({ points: startingPoints + pointAmount })
        .eq("id", userId);
        
      alert(`Payment Authorized: ${pointAmount.toLocaleString()} Credits appended to user account node.`);
    } catch (err) {
      console.error("Gateway runtime token map failure:", err);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12 animate-fade-in">
      
      {/* 🎡 DAILY REWARD: FORTUNE WHEEL (SOLID STYLING) */}
      <section className="bg-surface rounded-[24px] p-6 flex flex-col items-center text-center relative overflow-hidden">
        <h2 className="font-headline text-lg font-black text-white tracking-wide">Daily Fortune Wheel</h2>
        <p className="font-body text-xs text-on-surface-variant mt-1">Spin the matrix core module to extract free tokens.</p>

        {/* 3D Core Spinner Layout Block */}
        <div className="relative w-40 h-40 mt-6 mb-6 flex items-center justify-center">
          <div className={`w-full h-full rounded-full border-4 border-surface-variant bg-background flex items-center justify-center relative transition-transform duration-[2.5s] ease-out ${isSpinning ? "rotate-[1440deg]" : ""}`}>
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg_90deg,rgba(157,255,0,0.05)_90deg_180deg,transparent_180deg_270deg,rgba(157,255,0,0.05)_270deg_360deg)]"></div>
            
            <div className="w-14 h-14 bg-surface-variant border-2 border-primary rounded-full z-20 flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>

            {/* Wheel Pegs */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <div key={deg} className="absolute w-2 h-2 bg-on-surface-variant rounded-full" style={{ transform: `rotate(${deg}deg) translateY(-64px)` }}></div>
            ))}
          </div>
          
          {/* Wheel Pointer */}
          <div className="absolute -top-3 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-primary z-30 drop-shadow-md"></div>
        </div>

        {/* Dynamic Action Trigger Blocks */}
        <div className="h-12 flex items-center justify-center w-full">
          {spinReward ? (
            <div className="animate-fade-in flex flex-col items-center bg-primary-container px-6 py-2 rounded-xl border border-primary/20">
              <span className="font-headline text-xl font-black text-primary">+{spinReward} PTS</span>
              <span className="font-caps text-[9px] tracking-widest text-primary uppercase font-bold mt-0.5">Transferred</span>
            </div>
          ) : (
            <button 
              onClick={handleSpinWheel}
              disabled={!canSpin || isSpinning || !userId}
              className={`w-full max-w-[220px] py-3 rounded-full font-headline text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                canSpin && !isSpinning && userId
                  ? "bg-primary text-black hover:bg-[#a6ff1a] active:scale-95" 
                  : "bg-surface-variant text-on-surface-variant cursor-not-allowed"
              }`}
            >
              {isSpinning ? "Extracting..." : canSpin ? "Spin Core" : `Ready in ${timeLeft}`}
            </button>
          )}
        </div>
      </section>

      {/* 🏬 STOREFRONT CATEGORY SWITCHER */}
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setActiveCategory("currency")}
          className={`px-6 py-2.5 rounded-full font-headline text-[13px] font-bold whitespace-nowrap transition-all ${
            activeCategory === "currency" 
              ? "bg-primary text-black" 
              : "bg-surface text-on-surface-variant hover:text-white"
          }`}
        >
          Currency
        </button>
        <button
          onClick={() => setActiveCategory("cosmetics")}
          className={`px-6 py-2.5 rounded-full font-headline text-[13px] font-bold whitespace-nowrap transition-all ${
            activeCategory === "cosmetics" 
              ? "bg-primary text-black" 
              : "bg-surface text-on-surface-variant hover:text-white"
          }`}
        >
          Cosmetics
        </button>
      </div>

      {/* 🪙 HIGH-CONTRAST STORE ITEMS GRID */}
      <div className="grid grid-cols-2 gap-4">
        {activeCategory === "currency" && COIN_PACKAGES.map((pack) => {
          const isGems = pack.type === "gems";
          return (
            <div key={pack.id} className="bg-surface rounded-[24px] p-4 flex flex-col items-center text-center relative hover:bg-surface-variant transition-colors cursor-pointer group border border-transparent hover:border-surface-container-highest active:scale-[0.98]">
              {pack.popular && (
                <div className="absolute top-0 w-full bg-primary text-black font-caps text-[9px] font-extrabold py-1 rounded-t-[24px] uppercase tracking-widest">
                  Best Value
                </div>
              )}
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mt-4 mb-3 transition-transform group-hover:scale-105 ${isGems ? 'bg-[#271533]' : 'bg-[#182816]'}`}>
                <span className={`material-symbols-outlined text-3xl ${isGems ? 'text-secondary' : 'text-primary'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isGems ? 'diamond' : 'bolt'}
                </span>
              </div>
              <h3 className="font-headline text-lg font-black text-white">{pack.amount.toLocaleString()}</h3>
              <p className={`font-caps text-[9px] uppercase mt-0.5 tracking-wider font-bold ${isGems ? 'text-secondary' : 'text-primary'}`}>
                {isGems ? 'Gems' : 'PTS'}
              </p>
              <button 
                onClick={() => executePaymentGateway(pack.title, pack.amount)}
                className="mt-4 w-full py-2.5 bg-background text-white font-headline text-xs font-bold rounded-xl active:scale-[0.97] transition-colors hover:bg-surface-container-highest"
              >
                {pack.price}
              </button>
            </div>
          );
        })}

        {activeCategory === "cosmetics" && COSMETIC_ITEMS.map((item) => (
          <div key={item.id} className="bg-surface rounded-[24px] p-4 flex flex-col items-center text-center hover:bg-surface-variant transition-colors cursor-pointer group active:scale-[0.98]">
            <div className="w-14 h-14 rounded-[16px] bg-background flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <span className={`material-symbols-outlined text-2xl ${item.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
            </div>
            <h3 className="font-headline text-sm font-bold text-white leading-tight h-10 flex items-center justify-center text-center w-full">{item.title}</h3>
            <p className="font-caps text-[9px] text-on-surface-variant mt-1 uppercase tracking-wider">{item.type}</p>
            <button 
              onClick={() => alert("Balance deduction hook and visual asset ownership check routing initialized...")}
              className="mt-4 w-full py-2.5 bg-background text-primary font-headline text-xs font-bold rounded-xl flex items-center justify-center gap-1 active:scale-[0.97] transition-colors hover:bg-surface-container-highest"
            >
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              {item.price.toLocaleString()}
            </button>
          </div>
        ))}
      </div>
      
    </div>
  );
}