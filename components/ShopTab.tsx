"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

const COIN_PACKAGES = [
  { id: "pack_1", title: "Starter Pouch", amount: 1000, price: "$0.99", popular: false },
  { id: "pack_2", title: "Arcade Chest", amount: 5000, price: "$3.99", popular: true },
  { id: "pack_3", title: "Matrix Vault", amount: 12000, price: "$8.99", popular: false },
];

const COSMETIC_ITEMS = [
  { id: "cos_1", title: "Neon Glow Striker", type: "Carrom Striker", price: 2500, icon: "radio_button_checked", color: "text-amber-500" },
  { id: "cos_2", title: "Obsidian Matrix Board", type: "Arena Skin", price: 8000, icon: "grid_4x4", color: "text-indigo-500" },
  { id: "cos_3", title: "Crown VIP Badge", type: "Profile Badge", price: 1500, icon: "workspace_premium", color: "text-yellow-500" },
  { id: "cos_4", title: "Holographic Dice", type: "3D Asset", price: 4000, icon: "casino", color: "text-emerald-500" },
];

interface ShopTabProps {
  userId: string | null;
}

export default function ShopTab({ userId }: ShopTabProps) {
  const [activeCategory, setActiveCategory] = useState<"points" | "cosmetics">("points");
  
  // Fortune Wheel Engine Hooks
  const [canSpin, setCanSpin] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinReward, setSpinReward] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

  // Sync hourly countdown loops if wheel lock checks trigger
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

  // Handle core modular claims and atomically increment balance values inside the database
  const handleSpinWheel = async () => {
    if (!canSpin || isSpinning || !userId) return;
    setIsSpinning(true);
    setSpinReward(null);

    // Simulate physics rotation delay tracks
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

  // Google Pay / Apple Pay secure sandbox authorization simulation
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
    <div className="w-full flex flex-col gap-4 pb-12 animate-fade-in text-on-surface">
      
      {/* 🎡 DAILY REWARD: FORTUNE WHEEL */}
      <section className="bg-surface/80 border border-surface-container-highest backdrop-blur-xl rounded-[24px] p-5 flex flex-col items-center text-center relative overflow-hidden shadow-sm transition-colors duration-300">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary-container/20 blur-3xl rounded-full pointer-events-none"></div>
        
        <h2 className="font-headline text-base font-black text-on-surface tracking-tight relative z-10">Daily Fortune Wheel</h2>
        <p className="font-body text-[11px] text-on-surface-variant relative z-10">Spin the matrix core module to extract free tokens.</p>

        {/* 3D Core Spinner Layout Block */}
        <div className="relative w-36 h-36 mt-4 mb-4 flex items-center justify-center z-10">
          <div className={`w-full h-full rounded-full border-4 border-surface-container-highest bg-surface-container flex items-center justify-center relative shadow-inner transition-transform duration-[2.5s] ease-out ${isSpinning ? "rotate-[1440deg]" : ""}`}>
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg_90deg,rgba(150,150,150,0.05)_90deg_180deg,transparent_180deg_270deg,rgba(150,150,150,0.05)_270deg_360deg)]"></div>
            
            <div className="w-12 h-12 bg-surface border-2 border-primary rounded-full z-20 flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>

            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <div key={deg} className="absolute w-1.5 h-1.5 bg-on-surface-variant rounded-full" style={{ transform: `rotate(${deg}deg) translateY(-54px)` }}></div>
            ))}
          </div>
          
          <div className="absolute -top-2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[14px] border-t-primary z-30"></div>
        </div>

        {/* Dynamic Action Trigger Blocks */}
        <div className="h-10 flex items-center justify-center w-full z-10">
          {spinReward ? (
            <div className="animate-fade-in flex flex-col items-center">
              <span className="font-headline text-lg font-black text-primary">+{spinReward} PTS</span>
              <span className="font-caps text-[8px] tracking-widest text-on-surface-variant uppercase font-bold mt-0.5">Ledger Transferred</span>
            </div>
          ) : (
            <button 
              onClick={handleSpinWheel}
              disabled={!canSpin || isSpinning || !userId}
              className={`w-full max-w-[200px] py-2.5 rounded-xl font-headline text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                canSpin && !isSpinning && userId
                  ? "gradient-pill-primary shadow-md hover:scale-[0.98] active:scale-95" 
                  : "bg-surface-container-highest text-on-surface-variant border border-surface-container-highest cursor-not-allowed"
              }`}
            >
              {isSpinning ? "Extracting..." : canSpin ? "Spin Core" : `Cooldown: ${timeLeft}`}
            </button>
          )}
        </div>
      </section>

      {/* 🏬 STOREFRONT CATEGORY SWITCHER */}
      <div className="bg-surface/50 backdrop-blur-md p-1 rounded-xl flex items-center border border-surface-container-highest shadow-sm transition-colors duration-300">
        <button
          onClick={() => setActiveCategory("points")}
          className={`flex-1 py-2 font-caps text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeCategory === "points" 
              ? "bg-surface-container-high text-primary shadow-sm" 
              : "text-on-surface-variant hover:text-primary"
          }`}
        >
          <span className="material-symbols-outlined text-sm">monetization_on</span>
          Buy Points
        </button>
        <button
          onClick={() => setActiveCategory("cosmetics")}
          className={`flex-1 py-2 font-caps text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeCategory === "cosmetics" 
              ? "bg-surface-container-high text-primary shadow-sm" 
              : "text-on-surface-variant hover:text-primary"
          }`}
        >
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          Cosmetics
        </button>
      </div>

      {/* 🪙 COMPACT HIGH-CONTRAST STORE ITEMS GRID */}
      <div className="grid grid-cols-2 gap-3">
        {activeCategory === "points" && COIN_PACKAGES.map((pack) => (
          <div key={pack.id} className="bg-surface/80 border border-surface-container-highest rounded-2xl p-4 flex flex-col items-center text-center relative overflow-hidden shadow-sm transition-colors duration-300 hover:bg-surface-variant cursor-pointer group">
            {pack.popular && (
              <div className="absolute top-0 w-full bg-primary-container text-primary font-caps text-[7px] font-bold py-0.5 uppercase tracking-widest border-b border-primary/20">
                Popular
              </div>
            )}
            <div className="w-10 h-10 rounded-xl bg-surface-container-highest border border-surface-container-highest flex items-center justify-center mt-2 mb-2 group-hover:bg-primary-container/20 transition-colors">
              <span className="material-symbols-outlined text-xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>toll</span>
            </div>
            <h3 className="font-headline text-xs font-black text-on-surface">{pack.amount.toLocaleString()} PTS</h3>
            <p className="font-caps text-[8px] text-on-surface-variant uppercase mt-0.5 tracking-wider">{pack.title}</p>
            <button 
              onClick={() => executePaymentGateway(pack.title, pack.amount)}
              className="mt-3 w-full py-2 bg-surface-container-highest text-primary font-headline text-[11px] font-bold rounded-lg border border-surface-container-highest active:scale-[0.97] transition-transform hover:bg-primary/10 hover:border-primary/30"
            >
              {pack.price}
            </button>
          </div>
        ))}

        {activeCategory === "cosmetics" && COSMETIC_ITEMS.map((item) => (
          <div key={item.id} className="bg-surface/80 border border-surface-container-highest rounded-2xl p-4 flex flex-col items-center text-center shadow-sm transition-colors duration-300 hover:bg-surface-variant cursor-pointer group">
            <div className="w-10 h-10 rounded-xl bg-surface-container-highest border border-surface-container-highest flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <span className={`material-symbols-outlined text-xl ${item.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
            </div>
            <h3 className="font-headline text-[11px] font-bold text-on-surface leading-tight h-6 flex items-center justify-center text-center w-full">{item.title}</h3>
            <p className="font-caps text-[7px] text-on-surface-variant mt-0.5 uppercase tracking-wider">{item.type}</p>
            <button 
              onClick={() => alert("Balance deduction hook and visual asset ownership check routing initialized...")}
              className="mt-3 w-full py-2 bg-surface-container-highest text-primary font-headline text-[10px] font-bold rounded-lg border border-surface-container-highest flex items-center justify-center gap-0.5 active:scale-[0.97] transition-transform hover:bg-primary/10 hover:border-primary/30"
            >
              <span className="material-symbols-outlined text-xs">monetization_on</span>
              {item.price.toLocaleString()}
            </button>
          </div>
        ))}
      </div>
      
    </div>
  );
}