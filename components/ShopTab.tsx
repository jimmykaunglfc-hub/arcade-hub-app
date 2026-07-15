"use client";

import { useState, useEffect } from "react";

// Mock Data for the Shop
const COIN_PACKAGES = [
  { id: "pack_1", title: "Starter Pouch", amount: 1000, price: "$0.99", popular: false },
  { id: "pack_2", title: "Arcade Chest", amount: 5000, price: "$3.99", popular: true },
  { id: "pack_3", title: "Matrix Vault", amount: 12000, price: "$8.99", popular: false },
];

const COSMETIC_ITEMS = [
  { id: "cos_1", title: "Neon Glow Striker", type: "Carrom Striker", price: 2500, icon: "radio_button_checked", color: "text-tertiary-container" },
  { id: "cos_2", title: "Obsidian Matrix Board", type: "Arena Skin", price: 8000, icon: "grid_4x4", color: "text-purple-400" },
  { id: "cos_3", title: "Crown VIP Badge", type: "Profile Badge", price: 1500, icon: "workspace_premium", color: "text-amber-400" },
  { id: "cos_4", title: "Holographic Dice", type: "3D Asset", price: 4000, icon: "casino", color: "text-emerald-400" },
];

export default function ShopTab() {
  const [activeCategory, setActiveCategory] = useState<"points" | "cosmetics">("points");
  
  // Fortune Wheel State
  const [canSpin, setCanSpin] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinReward, setSpinReward] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("00:00:00");

  // Simulate a countdown timer if the wheel is on cooldown
  useEffect(() => {
    if (canSpin) return;
    
    // Hardcoded 1 hour cooldown simulation
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

  const handleSpinWheel = () => {
    if (!canSpin || isSpinning) return;
    setIsSpinning(true);
    setSpinReward(null);

    // Simulate network delay and wheel spinning animation
    setTimeout(() => {
      const rewards = [50, 100, 250, 500, 1000];
      const randomReward = rewards[Math.floor(Math.random() * rewards.length)];
      setSpinReward(randomReward);
      setIsSpinning(false);
      setCanSpin(false);
      // TODO: Update actual Supabase user balance here
    }, 2500);
  };

  const handlePurchase = (itemName: string, cost: string | number) => {
    // TODO: Connect to Stripe/Apple/Google IAP or deduct from DB balance
    alert(`Initiating purchase for ${itemName} (${cost})`);
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-12 animate-fade-in text-on-background">
      
      {/* 🎡 DAILY REWARD: FORTUNE WHEEL */}
      <section className="glass-panel rounded-3xl p-6 flex flex-col items-center text-center relative overflow-hidden border border-white/10 shadow-lg">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-primary-container/10 blur-3xl rounded-full pointer-events-none"></div>
        
        <h2 className="font-headline text-lg font-extrabold text-primary mb-1 relative z-10">Daily Network Supply</h2>
        <p className="font-body text-xs text-on-surface-variant relative z-10">Spin the matrix core to claim free arena points.</p>

        {/* 3D Wheel Placeholder Graphic */}
        <div className="relative w-48 h-48 mt-6 mb-8 flex items-center justify-center z-10">
          <div className={`w-full h-full rounded-full border-8 border-surface-container-high bg-surface-container flex items-center justify-center shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] relative transition-transform duration-[2.5s] ease-out ${isSpinning ? "rotate-[1440deg]" : ""}`}>
            {/* Wheel Segments Simulation */}
            <div className="absolute inset-0 rounded-full border border-white/5 bg-[conic-gradient(from_0deg,transparent_0deg_45deg,rgba(195,244,0,0.1)_45deg_90deg,transparent_90deg_135deg,rgba(125,244,255,0.1)_135deg_180deg,transparent_180deg_225deg,rgba(195,244,0,0.1)_225deg_270deg,transparent_270deg_315deg,rgba(125,244,255,0.1)_315deg_360deg)]"></div>
            
            <div className="w-16 h-16 bg-surface border-4 border-primary-container rounded-full z-20 flex items-center justify-center shadow-[0_0_20px_rgba(195,244,0,0.4)]">
              <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            </div>

            {/* Pegs */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <div key={deg} className="absolute w-2 h-2 bg-secondary rounded-full" style={{ transform: `rotate(${deg}deg) translateY(-22px)` }}></div>
            ))}
          </div>
          
          {/* Wheel Pointer */}
          <div className="absolute -top-3 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-primary-container drop-shadow-md z-30"></div>
        </div>

        {/* Spin Action & Results */}
        <div className="h-14 flex items-center justify-center w-full z-10">
          {spinReward ? (
            <div className="animate-fade-in flex flex-col items-center">
              <span className="font-headline text-2xl font-extrabold text-primary-container">+{spinReward} PTS</span>
              <span className="font-caps text-[9px] text-surface-tint tracking-widest uppercase">Transferred to Wallet</span>
            </div>
          ) : (
            <button 
              onClick={handleSpinWheel}
              disabled={!canSpin || isSpinning}
              className={`w-full max-w-[240px] py-4 rounded-full font-headline text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                canSpin && !isSpinning
                  ? "gradient-pill-primary hover:scale-95 active:scale-90 shadow-[0_0_20px_rgba(195,244,0,0.3)]" 
                  : "bg-surface-container-high text-on-surface-variant border border-white/10 cursor-not-allowed"
              }`}
            >
              {isSpinning ? "Extracting..." : canSpin ? "Spin Core Module" : `Spin after ${timeLeft}`}
            </button>
          )}
        </div>
      </section>

      {/* 🏬 STOREFRONT TOGGLE */}
      <div className="bg-surface-container/50 backdrop-blur-md p-1.5 rounded-xl flex items-center shadow-sm border border-white/5">
        <button
          onClick={() => setActiveCategory("points")}
          className={`flex-1 py-3 font-caps text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
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
          className={`flex-1 py-3 font-caps text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
            activeCategory === "cosmetics" 
              ? "bg-surface-container-high text-primary shadow-sm" 
              : "text-on-surface-variant hover:text-primary"
          }`}
        >
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          Cosmetics
        </button>
      </div>

      {/* 🪙 STORE ITEMS GRID */}
      <div className="grid grid-cols-2 gap-4">
        {activeCategory === "points" && COIN_PACKAGES.map((pack) => (
          <div key={pack.id} className="glass-panel border border-white/10 rounded-3xl p-5 flex flex-col items-center text-center relative overflow-hidden group hover:bg-white/5 transition-colors">
            {pack.popular && (
              <div className="absolute top-0 w-full bg-primary-container text-on-primary-container font-caps text-[8px] font-bold py-1 uppercase tracking-widest">
                Most Popular
              </div>
            )}
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-surface-tint/20 to-primary-container/5 border border-primary-container/30 flex items-center justify-center mt-4 mb-3 shadow-inner ${pack.popular ? 'scale-110' : ''}`}>
              <span className="material-symbols-outlined text-3xl text-surface-tint" style={{ fontVariationSettings: "'FILL' 1" }}>toll</span>
            </div>
            <h3 className="font-headline text-sm font-extrabold text-primary">{pack.amount.toLocaleString()} PTS</h3>
            <p className="font-caps text-[9px] text-on-surface-variant mt-1 uppercase tracking-wider">{pack.title}</p>
            <button 
              onClick={() => handlePurchase(pack.title, pack.price)}
              className="mt-4 w-full py-2.5 bg-white/10 hover:bg-white/20 text-primary font-headline text-xs font-bold rounded-xl transition-colors border border-white/5"
            >
              {pack.price}
            </button>
          </div>
        ))}

        {activeCategory === "cosmetics" && COSMETIC_ITEMS.map((item) => (
          <div key={item.id} className="glass-panel border border-white/10 rounded-3xl p-5 flex flex-col items-center text-center relative hover:bg-white/5 transition-colors">
            <div className={`w-14 h-14 rounded-2xl bg-surface-container border border-white/10 flex items-center justify-center mb-3 shadow-inner`}>
              <span className={`material-symbols-outlined text-3xl ${item.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
            </div>
            <h3 className="font-headline text-xs font-extrabold text-primary leading-tight h-8 flex items-center">{item.title}</h3>
            <p className="font-caps text-[8px] text-on-surface-variant mt-1 uppercase tracking-wider">{item.type}</p>
            <button 
              onClick={() => handlePurchase(item.title, item.price)}
              className="mt-4 w-full py-2.5 bg-white/10 hover:bg-white/20 text-primary font-headline text-xs font-bold rounded-xl transition-colors border border-white/5 flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-sm text-secondary">monetization_on</span>
              {item.price.toLocaleString()}
            </button>
          </div>
        ))}
      </div>
      
    </div>
  );
}