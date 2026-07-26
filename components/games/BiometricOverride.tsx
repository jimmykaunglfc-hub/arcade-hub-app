"use client";

import React, { useState, useEffect, useRef } from "react";
import { soundEngine } from "../../lib/soundManager";
import { storeManager } from "../../lib/storeManager";

// High-tech color palette for different fingers
const NODE_COLORS = [
  "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.8)]",
  "border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.8)]",
  "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]",
  "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.8)]",
  "border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.8)]",
  "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.8)]",
];

const INNER_COLORS = [
  "text-cyan-500",
  "text-pink-500",
  "text-emerald-500",
  "text-amber-500",
  "text-purple-500",
  "text-rose-500",
];

type TouchPoint = {
  id: number;
  x: number;
  y: number;
  colorIndex: number;
};

export default function BiometricOverride({ onClose }: { onClose?: () => void }) {
  const [touches, setTouches] = useState<TouchPoint[]>([]);
  const [phase, setPhase] = useState<"idle" | "scanning" | "selected">("idle");
  const [winnerId, setWinnerId] = useState<number | null>(null);

  // Store Manager Sync
  const equippedCosmetic = storeManager.getEquippedCosmetic("global");
  const isMatrixNeon = equippedCosmetic === "neon_glow_striker" || true;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevTouchLength = useRef<number>(0);
  const touchesRef = useRef<TouchPoint[]>([]);

  // Keep ref updated synchronously to prevent re-triggering timer on touch movement
  touchesRef.current = touches;

  // Multi-Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // If a winner is already selected, wait until all fingers leave to reset
    if (phase === "selected") return;

    const currentTouches = Array.from(e.touches).map((t, index) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      colorIndex: index % NODE_COLORS.length,
    }));

    // Play SFX when a new finger touches down
    if (currentTouches.length > prevTouchLength.current) {
      soundEngine.playSFX("click");
    }
    prevTouchLength.current = currentTouches.length;

    setTouches(currentTouches);

    // Game Logic: Start scanning if 2 or more fingers are on screen
    if (currentTouches.length >= 2 && phase === "idle") {
      setPhase("scanning");
      soundEngine.playSFX("dice_roll");

      // Trigger haptic feedback if available
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([50, 50, 50]);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (phase === "selected") return;

    const currentTouches = Array.from(e.touches).map((t, index) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      colorIndex: index % NODE_COLORS.length,
    }));

    setTouches(currentTouches);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (phase === "selected") {
      if (e.touches.length === 0) {
        setPhase("idle");
        setWinnerId(null);
        setTouches([]);
        prevTouchLength.current = 0;
      }
      return;
    }

    const currentTouches = Array.from(e.touches).map((t, index) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      colorIndex: index % NODE_COLORS.length,
    }));

    setTouches(currentTouches);
    prevTouchLength.current = currentTouches.length;

    // Cancel scan if someone lets go early
    if (currentTouches.length < 2) {
      if (phase === "scanning") {
        soundEngine.playSFX("defeat");
      }
      setPhase("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  // Timer Effect for Winner Lock-On (Only triggers when phase shifts to 'scanning')
  useEffect(() => {
    if (phase === "scanning") {
      timerRef.current = setTimeout(() => {
        const activeTouches = touchesRef.current;
        if (activeTouches.length >= 2) {
          const randomWinner = activeTouches[Math.floor(Math.random() * activeTouches.length)];
          setWinnerId(randomWinner.id);
          setPhase("selected");

          // Victory SFX + Lock-On Alert
          soundEngine.playSFX("victory");

          // Winning Haptic Feedback
          if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200]);
          }
        } else {
          setPhase("idle");
        }
      }, 1500);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (onClose) onClose();
  };

  return (
    <div
      className="fixed inset-0 flex flex-col items-center w-full h-full bg-[#09090b] font-sans text-white overscroll-none selection:bg-transparent transition-colors duration-300 touch-none z-[100] animate-fade-in select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <style>{`
        @keyframes pop-in {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        .animate-touch-pop { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      {/* 1. TOP HEADER */}
      <header
        className="absolute top-0 left-0 w-full z-50 px-6 pb-2 pointer-events-none"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1.5rem)" }}
      >
        <button
          onClick={handleExit}
          onTouchStart={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-headline font-bold text-neutral-400 hover:text-white transition-colors uppercase tracking-widest active:scale-95 pointer-events-auto"
        >
          <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span> Exit Arena
        </button>
      </header>

      {/* 2. HUD / STATUS INSTRUCTIONS */}
      <div
        className="w-full px-6 flex flex-col items-center justify-center pointer-events-none relative z-40"
        style={{ marginTop: "calc(max(env(safe-area-inset-top), 1.5rem) + 40px)" }}
      >
        <div className="bg-[#18181b]/90 border border-white/10 backdrop-blur-xl px-6 py-4 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-xs">
          <span
            className={`material-symbols-outlined text-[32px] mb-2 ${
              phase === "scanning"
                ? "text-[#CCFF00] animate-pulse"
                : phase === "selected"
                ? "text-rose-500"
                : "text-neutral-500"
            }`}
          >
            fingerprint
          </span>
          <h2 className="text-sm font-headline font-black uppercase tracking-widest mb-1 text-white">
            {phase === "idle"
              ? "Awaiting Inputs"
              : phase === "scanning"
              ? "Scanning Biometrics"
              : "Target Locked"}
          </h2>
          <p className="text-xs text-neutral-400 font-medium">
            {phase === "idle"
              ? "Everyone place one finger on the screen to begin."
              : phase === "scanning"
              ? "Hold steady..."
              : "Release all fingers to reset."}
          </p>
        </div>
      </div>

      {/* 3. MULTI-TOUCH RENDERING LAYER */}
      <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
        {/* Radar Sweep Animation during scanning */}
        {phase === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
            <div
              className="w-[150vw] h-[150vw] rounded-full border border-[#CCFF00]/20 animate-[spin_2s_linear_infinite]"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 70%, rgba(204, 255, 0, 0.15) 100%)",
              }}
            />
          </div>
        )}

        {/* Render Each Finger Node */}
        {touches.map((touch) => {
          const isWinner = winnerId === touch.id;
          const isLoser = phase === "selected" && !isWinner;

          if (isLoser) return null;

          return (
            <div
              key={touch.id}
              className="absolute pointer-events-none animate-touch-pop"
              style={{ left: touch.x, top: touch.y }}
            >
              {/* Outer Glowing Aura */}
              <div
                className={`absolute -inset-12 rounded-full border-2 opacity-60 
                ${
                  isWinner
                    ? "border-[#CCFF00] animate-[ping_1s_cubic-bezier(0,0,0.2,1)_infinite]"
                    : NODE_COLORS[touch.colorIndex]
                } 
                ${phase === "scanning" ? "animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]" : ""}`}
              />

              {/* Secondary Ring */}
              <div
                className={`absolute -inset-5 rounded-full border-[3px] 
                ${
                  isWinner
                    ? "border-[#CCFF00] shadow-[0_0_30px_rgba(204,255,0,0.9)] animate-pulse"
                    : NODE_COLORS[touch.colorIndex]
                }`}
              />

              {/* Core Finger Node */}
              <div
                className={`absolute -inset-8 rounded-full flex items-center justify-center backdrop-blur-md border-[4px]
                ${
                  isWinner
                    ? "bg-[#CCFF00]/20 border-[#CCFF00] shadow-[inset_0_0_20px_rgba(204,255,0,0.8)]"
                    : `bg-black/60 ${NODE_COLORS[touch.colorIndex]}`
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[28px] ${
                    isWinner ? "text-[#CCFF00]" : INNER_COLORS[touch.colorIndex]
                  }`}
                >
                  {isWinner ? "workspace_premium" : "radar"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}