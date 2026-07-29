"use client";

import { useState, useEffect, useRef } from "react";
import { soundEngine } from "../../lib/soundManager";

// 🛍️ NEW: Live Database Cosmetic Hook
import { useEquippedCosmetic } from "../../lib/cosmeticsUtils";

type PenaltyTheme = "Standard" | "Drink" | "Truth" | "Dare";
const PENALTY_THEMES: PenaltyTheme[] = ["Standard", "Drink", "Truth", "Dare"];

type Player = "p1" | "p2";

export default function NeuralDuel({ onClose }: { onClose?: () => void }) {
  // 🛍️ LIVE DATABASE COSMETICS ENGINE SYNC
  const { modifiers } = useEquippedCosmetic("neural_duel");
  // If modifiers exist, the user has equipped a cosmetic theme for Neural Duel
  const isNeonTheme = !!modifiers;

  const [gameStatus, setGameStatus] = useState<"idle" | "standby" | "execute" | "gameover">("idle");
  const [winner, setWinner] = useState<Player | null>(null);
  const [loser, setLoser] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<"reflex" | "early-tap" | null>(null);

  const [penaltyTheme, setPenaltyTheme] = useState<PenaltyTheme>("Drink");

  const executeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const clearTimers = () => {
    if (executeTimerRef.current) clearTimeout(executeTimerRef.current);
  };

  const cycleTheme = () => {
    if (gameStatus !== "idle" && gameStatus !== "gameover") return;
    soundEngine.playSFX("click");
    setPenaltyTheme((prev) => PENALTY_THEMES[(PENALTY_THEMES.indexOf(prev) + 1) % PENALTY_THEMES.length]);
  };

  const startDuel = () => {
    soundEngine.playSFX("click");
    clearTimers();
    setWinner(null);
    setLoser(null);
    setWinReason(null);
    setGameStatus("standby");

    // Random delay between 2 and 6 seconds before the flash
    const delay = Math.floor(Math.random() * 4000) + 2000;

    executeTimerRef.current = setTimeout(() => {
      setGameStatus("execute");
      soundEngine.playSFX("laser");
      // Execute Haptic Flash
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100]);
      }
    }, delay);
  };

  const handleTap = (player: Player) => {
    if (gameStatus === "idle" || gameStatus === "gameover") return;

    if (gameStatus === "standby") {
      // Early tap penalty! Short Circuit.
      clearTimers();
      setLoser(player);
      setWinner(player === "p1" ? "p2" : "p1");
      setWinReason("early-tap");
      setGameStatus("gameover");
      soundEngine.playSFX("defeat");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([300, 100, 300]);
      }
    } else if (gameStatus === "execute") {
      // Clean reflex win!
      setWinner(player);
      setLoser(player === "p1" ? "p2" : "p1");
      setWinReason("reflex");
      setGameStatus("gameover");
      soundEngine.playSFX("victory");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col w-full bg-[#09090b] font-sans text-white overscroll-none selection:bg-transparent touch-none animate-fade-in select-none">
      
      {/* 1. PLAYER 2 ZONE (TOP HALF - ROTATED 180 DEG) */}
      <div
        className={`flex-1 relative border-b-2 flex items-center justify-center transition-colors duration-200 cursor-pointer 
          ${
            gameStatus === "execute"
              ? isNeonTheme
                ? "bg-[#CCFF00] border-[#CCFF00]"
                : "bg-emerald-500 border-emerald-400"
              : "bg-rose-950/30 border-rose-500/30 active:bg-rose-900/50"
          }
        `}
        onPointerDown={() => handleTap("p2")}
      >
        <div className="rotate-180 flex flex-col items-center justify-center w-full h-full p-6 text-center pointer-events-none">
          {gameStatus === "idle" && (
            <div className="opacity-50 flex flex-col items-center">
              <span className="material-symbols-outlined text-[48px] mb-2 text-rose-500">
                swords
              </span>
              <p className="font-headline font-black tracking-widest uppercase text-rose-500 text-sm">
                Player 2 Zone
              </p>
            </div>
          )}
          {gameStatus === "standby" && (
            <p className="text-3xl font-headline font-black tracking-widest text-neutral-500 animate-pulse uppercase">
              Standby...
            </p>
          )}
          {gameStatus === "execute" && (
            <p
              className={`text-5xl font-headline font-black tracking-widest ${
                isNeonTheme ? "text-black" : "text-white"
              } drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] scale-110 uppercase`}
            >
              EXECUTE!
            </p>
          )}
          {gameStatus === "gameover" && winner === "p2" && (
            <p className="text-4xl font-headline font-black tracking-widest text-[#CCFF00] drop-shadow-md flex flex-col items-center gap-2 uppercase">
              <span className="material-symbols-outlined text-[40px]">bolt</span> WINNER
            </p>
          )}
          {gameStatus === "gameover" && loser === "p2" && (
            <div className="flex flex-col items-center gap-2 text-rose-500">
              <span className="material-symbols-outlined text-[40px]">skull</span>
              <p className="text-2xl font-headline font-black tracking-widest uppercase">
                {winReason === "early-tap" ? "SHORT CIRCUIT!" : "TOO SLOW!"}
              </p>
              <p className="text-xs font-bold uppercase mt-1 opacity-80">
                Penalty: {penaltyTheme}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. CENTER CONTROL PUCK */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center">
        {/* Core Button */}
        <button
          onClick={gameStatus === "idle" || gameStatus === "gameover" ? startDuel : undefined}
          className={`w-24 h-24 rounded-full border-4 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.9)] backdrop-blur-md transition-all active:scale-95
            ${
              gameStatus === "idle" || gameStatus === "gameover"
                ? "bg-[#18181b] border-white/20 hover:border-[#CCFF00]"
                : "bg-black border-neutral-800 pointer-events-none"
            }
          `}
        >
          {gameStatus === "idle" ? (
            <span className="font-headline font-black text-[11px] tracking-widest uppercase text-white leading-tight text-center">
              Start<br />Duel
            </span>
          ) : gameStatus === "gameover" ? (
            <span className="material-symbols-outlined text-[32px] text-white">refresh</span>
          ) : (
            <div className="w-4 h-4 bg-rose-500 rounded-full animate-ping" />
          )}
        </button>

        {/* Penalty Theme Toggle (Only active when idle/gameover) */}
        {(gameStatus === "idle" || gameStatus === "gameover") && (
          <button
            onClick={cycleTheme}
            className="absolute top-[125%] bg-[#18181b] border border-white/10 text-[9px] font-black uppercase tracking-widest text-neutral-400 hover:text-white px-3 py-1.5 rounded-full active:scale-95 whitespace-nowrap shadow-lg"
          >
            Mode: {penaltyTheme}
          </button>
        )}

        {/* Exit Button (Left Side) */}
        {(gameStatus === "idle" || gameStatus === "gameover") && (
          <button
            onClick={handleExit}
            className="absolute right-[140%] bg-[#18181b] border border-white/10 p-2 w-10 h-10 flex items-center justify-center rounded-full active:scale-95 hover:bg-white/10 transition-colors shadow-lg"
          >
            <span className="material-symbols-outlined text-sm text-neutral-400">
              arrow_back_ios_new
            </span>
          </button>
        )}
      </div>

      {/* 3. PLAYER 1 ZONE (BOTTOM HALF) */}
      <div
        className={`flex-1 relative border-t-2 flex items-center justify-center transition-colors duration-200 cursor-pointer
          ${
            gameStatus === "execute"
              ? isNeonTheme
                ? "bg-[#CCFF00] border-[#CCFF00]"
                : "bg-emerald-500 border-emerald-400"
              : "bg-cyan-950/30 border-cyan-500/30 active:bg-cyan-900/50"
          }
        `}
        onPointerDown={() => handleTap("p1")}
      >
        <div className="flex flex-col items-center justify-center w-full h-full p-6 text-center pointer-events-none">
          {gameStatus === "idle" && (
            <div className="opacity-50 flex flex-col items-center">
              <span className="material-symbols-outlined text-[48px] mb-2 text-cyan-500">
                swords
              </span>
              <p className="font-headline font-black tracking-widest uppercase text-cyan-500 text-sm">
                Player 1 Zone
              </p>
            </div>
          )}
          {gameStatus === "standby" && (
            <p className="text-3xl font-headline font-black tracking-widest text-neutral-500 animate-pulse uppercase">
              Standby...
            </p>
          )}
          {gameStatus === "execute" && (
            <p
              className={`text-5xl font-headline font-black tracking-widest ${
                isNeonTheme ? "text-black" : "text-white"
              } drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] scale-110 uppercase`}
            >
              EXECUTE!
            </p>
          )}
          {gameStatus === "gameover" && winner === "p1" && (
            <p className="text-4xl font-headline font-black tracking-widest text-[#CCFF00] drop-shadow-md flex flex-col items-center gap-2 uppercase">
              <span className="material-symbols-outlined text-[40px]">bolt</span> WINNER
            </p>
          )}
          {gameStatus === "gameover" && loser === "p1" && (
            <div className="flex flex-col items-center gap-2 text-rose-500">
              <span className="material-symbols-outlined text-[40px]">skull</span>
              <p className="text-2xl font-headline font-black tracking-widest uppercase">
                {winReason === "early-tap" ? "SHORT CIRCUIT!" : "TOO SLOW!"}
              </p>
              <p className="text-xs font-bold uppercase mt-1 opacity-80">
                Penalty: {penaltyTheme}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}