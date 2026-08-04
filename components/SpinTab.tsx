"use client";

import { useEffect, useMemo, useState } from "react";
import { soundEngine } from "@/lib/soundManager";
import { supabase } from "@/lib/supabaseClient";
import JoeYokeLogo from "./JoeYokeLogo";

type WheelSlot = {
  id: string | number;
  label: string;
  type: "points" | "gems";
  value: number;
  color?: string | null;
};
type RewardRow = {
  id: string;
  label: string;
  reward_type: "points" | "gems";
  reward_value: number;
  wheel_color?: string | null;
};

const FALLBACK_SLOTS: WheelSlot[] = [
  { id: 1, label: "250 PTS", type: "points", value: 250, color: "#93df25" },
  { id: 2, label: "5 GEMS", type: "gems", value: 5, color: "#c33bd9" },
  { id: 3, label: "500 PTS", type: "points", value: 500, color: "#35a9dc" },
  { id: 4, label: "100 PTS", type: "points", value: 100, color: "#e83b58" },
  { id: 5, label: "10 GEMS", type: "gems", value: 10, color: "#f6bb22" },
  { id: 6, label: "1,000 PTS", type: "points", value: 1000, color: "#7b879b" },
];
const DEFAULT_COLORS = ["#93df25", "#c33bd9", "#35a9dc", "#e83b58", "#f6bb22", "#7b879b"];
export default function SpinTab({ userId, onBack, onWalletUpdated }: { userId?: string | null; onBack: () => void; onWalletUpdated?: () => void }) {
  const [slots, setSlots] = useState<WheelSlot[]>(FALLBACK_SLOTS);
  const [lastSpin, setLastSpin] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinCost, setSpinCost] = useState(20);
  const [spinCurrency, setSpinCurrency] = useState<"points" | "gems">("points");
  const [cooldownHours, setCooldownHours] = useState(24);
  const [spinRules, setSpinRules] = useState("One spin every 24 hours.");
  const [message, setMessage] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const [{ data: rewards }, { data: profile }, { data: config }] = await Promise.all([
        supabase.from("wheel_rewards").select("id, label, reward_type, reward_value, display_order, wheel_color").eq("is_active", true).order("display_order"),
        supabase.from("profiles").select("last_spin").eq("id", userId).maybeSingle(),
        supabase.from("platform_config").select("wheel_spin_cost, wheel_spin_currency, wheel_spin_cooldown_hours, wheel_spin_rules").eq("id", 1).maybeSingle(),
      ]);
      if (rewards?.length) setSlots((rewards as RewardRow[]).map((reward) => ({ id: reward.id, label: reward.label, type: reward.reward_type, value: reward.reward_value, color: reward.wheel_color })));
      setLastSpin(profile?.last_spin ? new Date(profile.last_spin).getTime() : null);
      if (config) {
        setSpinCost(Math.max(0, Number(config.wheel_spin_cost ?? 20)));
        setSpinCurrency(config.wheel_spin_currency === "gems" ? "gems" : "points");
        setCooldownHours(Math.max(0, Number(config.wheel_spin_cooldown_hours ?? 24)));
        setSpinRules(config.wheel_spin_rules?.trim() || "One spin every 24 hours.");
      }
    };
    void load();
  }, [userId]);

  useEffect(() => {
    const refresh = () => {
      const remaining = lastSpin ? cooldownHours * 60 * 60 * 1000 - (Date.now() - lastSpin) : 0;
      setCooldown(Math.max(0, remaining));
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownHours, lastSpin]);

  const wheelBackground = useMemo(() => {
    const angle = 360 / slots.length;
    return `conic-gradient(${slots.map((slot, index) => `${slot.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]} ${index * angle}deg ${(index + 1) * angle}deg`).join(", ")})`;
  }, [slots]);
  const costLabel = spinCost === 0 ? "Free spin" : `${spinCost.toLocaleString()} ${spinCurrency === "gems" ? "gems" : "points"}`;
  const formatCooldown = (ms: number) => {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const handleSpin = async () => {
    if (!userId || isSpinning || cooldown > 0) return;
    setIsSpinning(true);
    const { data: winner, error } = await supabase.rpc("spin_daily_wheel");
    if (error || !winner) {
      setIsSpinning(false);
      setMessage({ title: "Spin unavailable", body: error?.message || "The wheel is being configured right now." });
      return;
    }
    const winnerIndex = Math.max(0, slots.findIndex((slot) => String(slot.id) === String(winner.id)));
    const segment = 360 / slots.length;
    // The pointer is at 12 o'clock; land the center of the winning segment beneath it.
    const target = 360 * 5 + 270 - (winnerIndex * segment + segment / 2);
    setRotation(target);
    soundEngine.playSFX("dice_roll");
    window.setTimeout(() => {
      setIsSpinning(false);
      setLastSpin(new Date(winner.spun_at).getTime());
      soundEngine.playSFX("victory");
      onWalletUpdated?.();
      setMessage({ title: "You won!", body: `+${winner.value.toLocaleString()} ${winner.type === "gems" ? "gems" : "points"} added to your wallet.${spinCost ? ` ${spinCost.toLocaleString()} ${spinCurrency} was used for this spin.` : ""}` });
    }, 3500);
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-1 pb-7 pt-1 text-center select-none">
      <div className="flex items-center justify-between text-on-surface">
        <button onClick={onBack} aria-label="Back to home" className="-ml-2 grid h-10 w-10 place-items-center rounded-full active:scale-95">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h1 className="font-headline text-lg font-black">Spin &amp; Win</h1>
        <span className="w-8" />
      </div>

      <div className="mt-12">
        <h2 className="font-headline text-2xl font-black text-on-surface">Test Your Luck</h2>
        <p className="mx-auto mt-2 max-w-[270px] text-xs font-medium leading-relaxed text-on-surface-variant">Use your points to spin the wheel and win huge point multipliers or rare Gems!</p>
        <p className="mx-auto mt-3 max-w-[300px] text-[10px] font-bold leading-relaxed text-primary">{spinRules}</p>
      </div>

      <div className="relative mx-auto mt-9 h-64 w-64 sm:h-72 sm:w-72">
        <div className="absolute -top-3 left-1/2 z-30 -translate-x-1/2 border-x-[10px] border-t-[16px] border-x-transparent border-t-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.7)]" />
        <div className="absolute inset-0 rounded-full bg-surface-container-highest p-[6px] shadow-[0_12px_35px_rgba(0,0,0,0.45)]">
          <div className="relative h-full w-full overflow-hidden rounded-full transition-transform duration-[3500ms] [transition-timing-function:cubic-bezier(.12,.85,.2,1)]" style={{ background: wheelBackground, transform: `rotate(${rotation}deg)` }}>
            {slots.map((slot, index) => {
              const angle = 360 / slots.length;
              const midpoint = index * angle + angle / 2;
              return <div key={slot.id} className="absolute left-1/2 top-1/2 w-[76px] text-center" style={{ transform: `translate(-50%,-50%) rotate(${midpoint}deg) translateY(-82px) rotate(${-midpoint}deg)` }}><span className="block break-words text-[9px] font-black leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">{slot.label || `${slot.value} ${slot.type === "gems" ? "GEMS" : "PTS"}`}</span></div>;
            })}
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[5px] border-[#10192b] bg-[#1f2a40] p-1 shadow-lg"><JoeYokeLogo className="h-full w-full overflow-hidden rounded-full" /></div>
      </div>

      <div className="mt-auto pt-14">
        <p className="mb-3 text-[11px] font-bold text-on-surface-variant">{cooldown > 0 ? `Next spin in ${formatCooldown(cooldown)}` : costLabel}</p>
        <button onClick={handleSpin} disabled={isSpinning || cooldown > 0} className="mx-auto flex min-w-44 items-center justify-center gap-2 rounded-full bg-primary px-7 py-4 font-headline text-sm font-black text-on-primary shadow-[0_0_22px_rgba(168,238,0,.42)] transition active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-container-highest disabled:text-on-surface-variant disabled:shadow-none">
          <span>{isSpinning ? "Spinning…" : cooldown > 0 ? "Come back later" : `Spin for ${spinCost}`}</span>
          {!isSpinning && cooldown === 0 && <span className="material-symbols-outlined text-base">bolt</span>}
        </button>
      </div>

      {message && <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"><div className="w-full max-w-xs rounded-[28px] border border-white/10 bg-surface p-6 shadow-2xl"><span className="material-symbols-outlined text-4xl text-primary">auto_awesome</span><h3 className="mt-3 font-headline text-lg font-black text-on-surface">{message.title}</h3><p className="mt-2 text-xs leading-relaxed text-on-surface-variant">{message.body}</p><button onClick={() => setMessage(null)} className="mt-6 w-full rounded-2xl bg-primary py-3 text-xs font-black text-on-primary">Continue</button></div></div>}
    </div>
  );
}
