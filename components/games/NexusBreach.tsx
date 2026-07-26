"use client";

import React, { useState, useEffect } from "react";
import { soundEngine } from "../../lib/soundManager";
import { storeManager } from "../../lib/storeManager";

type PenaltyTheme = "Standard" | "Drink" | "Truth" | "Dare";
const PENALTY_THEMES: PenaltyTheme[] = ["Standard", "Drink", "Truth", "Dare"];

export default function NexusBreach({ onClose }: { onClose?: () => void }) {
  // 🛍️ STORE COSMETICS ENGINE SYNC
  const equippedTheme = storeManager.getEquippedCosmetic("nexus_breach");
  const isNeonTheme = equippedTheme === "neon_matrix_breach" || true;

  const [trapIndex, setTrapIndex] = useState<number>(0);
  const [clearedIndexes, setClearedIndexes] = useState<number[]>([]);
  const [gameStatus, setGameStatus] = useState<"idle" | "playing" | "gameover">("idle");
  const [penaltyTheme, setPenaltyTheme] = useState<PenaltyTheme>("Drink");
  const [showPenalty, setShowPenalty] = useState(false);

  useEffect(() => {
    initGame();
  }, []);

  const initGame = () => {
    setTrapIndex(Math.floor(Math.random() * 16));
    setClearedIndexes([]);
    setGameStatus("playing");
    setShowPenalty(false);
  };

  const handleReboot = () => {
    soundEngine.playSFX("click");
    initGame();
  };

  const cycleTheme = () => {
    soundEngine.playSFX("click");
    setPenaltyTheme((prev) => PENALTY_THEMES[(PENALTY_THEMES.indexOf(prev) + 1) % PENALTY_THEMES.length]);
  };

  const handleBoxClick = (index: number) => {
    if (gameStatus !== "playing" || clearedIndexes.includes(index)) return;

    if (index === trapIndex) {
      soundEngine.playSFX("laser");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([200, 100, 300]);
      }
      setTimeout(() => soundEngine.playSFX("defeat"), 400);
      setGameStatus("gameover");
      setShowPenalty(true);
    } else {
      soundEngine.playSFX("card_flip");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(40);
      }
      setClearedIndexes((prev) => [...prev, index]);
    }
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (onClose) onClose();
  };

  const handleCloseModal = () => {
    soundEngine.playSFX("click");
    setShowPenalty(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center w-full bg-[#09090b] font-sans text-white overscroll-none selection:bg-transparent transition-colors duration-300 select-none">
      <style>{`
        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      {/* 1. TOP HEADER */}
      <header
        className="shrink-0 w-full bg-[#18181b]/90 backdrop-blur-xl border-b border-white/10 z-20 shadow-sm"
        style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)" }}
      >
        <div className="px-6 py-4 flex justify-between items-center">
          <button
            onClick={handleExit}
            className="flex items-center gap-1.5 text-xs font-headline font-bold text-neutral-400 hover:text-white transition-colors active:scale-95 uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span> Exit Arena
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#CCFF00]">
            Nexus Breach
          </span>
          <div className="w-16"></div>
        </div>
      </header>

      {/* 2. HUD & PENALTY THEME SELECTOR */}
      <div className="w-full px-6 flex flex-col gap-4 max-w-sm mx-auto mt-6 shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-black mb-1">
              Nodes Recovered
            </span>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400">security</span>
              <span className="text-2xl font-black">
                {clearedIndexes.length}{" "}
                <span className="text-sm text-neutral-500">/ 15</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-black mb-1">
              System Status
            </span>
            <span
              className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                gameStatus === "playing"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
              }`}
            >
              {gameStatus === "playing" ? "Active" : "Breached"}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center bg-[#18181b] border border-white/10 p-3 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-neutral-500 text-sm">skull</span>
            <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
              Penalty Mode:
            </span>
          </div>
          <button
            onClick={cycleTheme}
            className="text-[11px] font-black uppercase tracking-widest text-[#CCFF00] bg-[#CCFF00]/10 border border-[#CCFF00]/20 px-3 py-1.5 rounded-lg active:scale-95 transition-transform flex items-center gap-1.5"
          >
            {penaltyTheme}{" "}
            {penaltyTheme === "Drink"
              ? "🥃"
              : penaltyTheme === "Truth"
              ? "🤫"
              : penaltyTheme === "Dare"
              ? "🎯"
              : "💥"}
          </button>
        </div>
      </div>

      {/* 3. THE GAME GRID */}
      <div className="flex-1 w-full flex items-center justify-center px-6 min-h-0 py-4">
        <div className="grid grid-cols-4 grid-rows-4 gap-3 w-full max-w-[340px] aspect-square relative z-10">
          {Array.from({ length: 16 }).map((_, i) => {
            const isCleared = clearedIndexes.includes(i);
            const isTrap = i === trapIndex;
            const revealTrap = gameStatus === "gameover" && isTrap;
            const revealSafe = gameStatus === "gameover" && !isTrap && !isCleared;

            return (
              <button
                key={i}
                onClick={() => handleBoxClick(i)}
                disabled={gameStatus !== "playing" || isCleared}
                className={`relative w-full h-full rounded-2xl flex items-center justify-center transition-all duration-300 overflow-hidden animate-pop-in ${
                  gameStatus === "playing" && !isCleared
                    ? "hover:scale-105 active:scale-95 cursor-pointer"
                    : "cursor-default"
                } ${
                  revealTrap
                    ? "bg-rose-500/20 border-2 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.8)] z-20"
                    : isCleared || revealSafe
                    ? "bg-[#18181b]/50 border border-white/5 shadow-[inset_0_5px_15px_rgba(0,0,0,0.5)]"
                    : isNeonTheme
                    ? "bg-gradient-to-br from-[#18181b] to-black border border-white/10 hover:border-[#CCFF00]/50 shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                    : "bg-[#18181b] border border-white/10 shadow-md"
                }`}
                style={{ animationDelay: `${i * 0.02}s` }}
              >
                {!isCleared && !revealTrap && !revealSafe && (
                  <span className="material-symbols-outlined text-[#CCFF00]/20 absolute text-[40px]">
                    hexagon
                  </span>
                )}
                {!isCleared && !revealTrap && !revealSafe && (
                  <span className="material-symbols-outlined text-[#CCFF00] opacity-70 text-lg">
                    auto_awesome
                  </span>
                )}
                {isCleared && (
                  <div className="w-3 h-3 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pop-in" />
                )}
                {revealTrap && (
                  <span className="material-symbols-outlined text-3xl text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,1)] animate-pulse">
                    warning
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. BOTTOM ACTION BAR / RESTART PANEL */}
      <div className="w-full px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 shrink-0 flex flex-col items-center justify-center relative z-50">
        <div className="w-full h-14 flex items-center justify-center">
          {gameStatus === "playing" ? (
            <p className="text-[11px] text-neutral-500 font-medium tracking-widest uppercase text-center">
              15 safe nodes. 1 corrupted trap.<br />Push your luck.
            </p>
          ) : (
            <div className="w-full max-w-[280px] h-full animate-pop-in">
              <button
                onClick={handleReboot}
                className="w-full h-full font-headline font-black rounded-2xl tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95 bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 uppercase text-xs"
              >
                <span className="material-symbols-outlined text-xl">refresh</span>
                Reboot System
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. DRAMATIC PENALTY POPUP MODAL */}
      {showPenalty && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-fade-in">
          <div className="bg-[#18181b] border-2 border-rose-500 rounded-[2rem] p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(244,63,94,0.3)] relative overflow-hidden animate-pop-in">
            <div className="absolute inset-0 bg-rose-500/5 animate-pulse pointer-events-none" />
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-rose-400 hover:text-rose-200 bg-rose-500/10 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-20"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>

            <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20 relative z-10">
              <span className="material-symbols-outlined text-4xl text-rose-500">warning</span>
            </div>

            <h2 className="text-2xl font-headline font-black text-white tracking-tight mb-2 relative z-10 uppercase">
              System Breached
            </h2>

            <div className="bg-rose-500/10 border border-rose-500/30 p-6 rounded-2xl mb-8 mt-6 shadow-inner relative z-10">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-3 block">
                Penalty Required
              </span>
              <p className="text-xl font-black text-rose-100">
                {penaltyTheme === "Drink" && "Take a shot! 🥃"}
                {penaltyTheme === "Truth" && "Reveal a Truth! 🤫"}
                {penaltyTheme === "Dare" && "Complete a Dare! 🎯"}
                {penaltyTheme === "Standard" && "Node corrupted. You lose. 💥"}
              </p>
            </div>

            <button
              onClick={handleCloseModal}
              className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-headline font-black rounded-xl tracking-widest transition-transform active:scale-95 shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 relative z-10 uppercase text-xs"
            >
              Accept Penalty
            </button>
          </div>
        </div>
      )}
    </div>
  );
}