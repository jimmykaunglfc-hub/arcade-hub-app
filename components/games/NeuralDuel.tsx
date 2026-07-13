"use client";

import { useState, useEffect, useRef } from "react";

type PenaltyTheme = 'Standard' | 'Drink' | 'Truth' | 'Dare';
const PENALTY_THEMES: PenaltyTheme[] = ['Standard', 'Drink', 'Truth', 'Dare'];

type Player = 'p1' | 'p2';

export default function NeuralDuel({ onClose }: { onClose?: () => void }) {
  const [gameStatus, setGameStatus] = useState<'idle' | 'standby' | 'execute' | 'gameover'>('idle');
  const [winner, setWinner] = useState<Player | null>(null);
  const [loser, setLoser] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<'reflex' | 'early-tap' | null>(null);
  
  const [penaltyTheme, setPenaltyTheme] = useState<PenaltyTheme>('Drink');

  const executeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const clearTimers = () => {
    if (executeTimerRef.current) clearTimeout(executeTimerRef.current);
  };

  const cycleTheme = () => {
    if (gameStatus !== 'idle' && gameStatus !== 'gameover') return;
    setPenaltyTheme(prev => PENALTY_THEMES[(PENALTY_THEMES.indexOf(prev) + 1) % PENALTY_THEMES.length]);
  };

  const startDuel = () => {
    clearTimers();
    setWinner(null);
    setLoser(null);
    setWinReason(null);
    setGameStatus('standby');

    // Random delay between 2 and 6 seconds before the flash
    const delay = Math.floor(Math.random() * 4000) + 2000;
    
    executeTimerRef.current = setTimeout(() => {
      setGameStatus('execute');
      // Execute Haptic Flash
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100]);
      }
    }, delay);
  };

  const handleTap = (player: Player) => {
    if (gameStatus === 'idle' || gameStatus === 'gameover') return;

    if (gameStatus === 'standby') {
      // Early tap penalty! Short Circuit.
      clearTimers();
      setLoser(player);
      setWinner(player === 'p1' ? 'p2' : 'p1');
      setWinReason('early-tap');
      setGameStatus('gameover');
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([300, 100, 300]);
      }
    } else if (gameStatus === 'execute') {
      // Clean reflex win!
      setWinner(player);
      setLoser(player === 'p1' ? 'p2' : 'p1');
      setWinReason('reflex');
      setGameStatus('gameover');
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col w-full bg-zinc-950 font-sans text-white overscroll-none selection:bg-transparent touch-none animate-fade-in">
      
      {/* 1. PLAYER 2 ZONE (TOP HALF - ROTATED 180 DEG) */}
      <div 
        className={`flex-1 relative border-b-2 flex items-center justify-center transition-colors duration-200 
          ${gameStatus === 'execute' ? 'bg-emerald-500 border-emerald-400' : 'bg-rose-950/40 border-rose-500/50 hover:bg-rose-900/50'}
        `}
        onPointerDown={() => handleTap('p2')}
      >
        <div className="rotate-180 flex flex-col items-center justify-center w-full h-full p-6 text-center pointer-events-none">
          {gameStatus === 'idle' && (
            <div className="opacity-50 flex flex-col items-center">
              <span className="material-symbols-outlined text-[48px] mb-2 text-rose-500">swords</span>
              <p className="font-black tracking-widest uppercase text-rose-500">Player 2 Area</p>
            </div>
          )}
          {gameStatus === 'standby' && (
            <p className="text-3xl font-black tracking-widest text-zinc-500 animate-pulse">STANDBY...</p>
          )}
          {gameStatus === 'execute' && (
            <p className="text-5xl font-black tracking-widest text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] scale-110">EXECUTE!</p>
          )}
          {gameStatus === 'gameover' && winner === 'p2' && (
            <p className="text-4xl font-black tracking-widest text-emerald-400 drop-shadow-md flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span> WINNER
            </p>
          )}
          {gameStatus === 'gameover' && loser === 'p2' && (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>skull</span>
              <p className="text-2xl font-black tracking-widest">{winReason === 'early-tap' ? 'SHORT CIRCUIT!' : 'TOO SLOW!'}</p>
              <p className="text-xs font-bold uppercase mt-2 opacity-80">Penalty: {penaltyTheme}</p>
            </div>
          )}
        </div>
      </div>

      {/* 2. CENTER CONTROL PUCK */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex flex-col items-center justify-center">
        {/* Core Button */}
        <button 
          onClick={gameStatus === 'idle' || gameStatus === 'gameover' ? startDuel : undefined}
          className={`w-24 h-24 rounded-full border-4 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all active:scale-95
            ${gameStatus === 'idle' || gameStatus === 'gameover' ? 'bg-zinc-900 border-zinc-700 hover:border-white' : 'bg-black border-zinc-900 pointer-events-none'}
          `}
        >
          {gameStatus === 'idle' ? (
            <span className="font-black text-[10px] tracking-widest uppercase text-white leading-tight text-center">Start<br/>Duel</span>
          ) : gameStatus === 'gameover' ? (
            <span className="material-symbols-outlined text-[32px] text-white">refresh</span>
          ) : (
            <div className="w-4 h-4 bg-red-500 rounded-full animate-ping" />
          )}
        </button>

        {/* Penalty Theme Toggle (Only active when idle/gameover) */}
        {(gameStatus === 'idle' || gameStatus === 'gameover') && (
          <button 
            onClick={cycleTheme}
            className="absolute top-[120%] bg-zinc-900 border border-zinc-700 text-[9px] font-black uppercase tracking-widest text-zinc-400 px-3 py-1.5 rounded-full active:scale-95"
          >
            Mode: {penaltyTheme}
          </button>
        )}

        {/* Exit Button (Left Side) */}
        {(gameStatus === 'idle' || gameStatus === 'gameover') && (
          <button 
            onClick={onClose} 
            className="absolute right-[140%] bg-zinc-900 border border-zinc-700 p-2 w-10 h-10 flex items-center justify-center rounded-full active:scale-95 hover:bg-zinc-800 transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-zinc-400">arrow_back_ios_new</span>
          </button>
        )}
      </div>

      {/* 3. PLAYER 1 ZONE (BOTTOM HALF) */}
      <div 
        className={`flex-1 relative border-t-2 flex items-center justify-center transition-colors duration-200
          ${gameStatus === 'execute' ? 'bg-emerald-500 border-emerald-400' : 'bg-cyan-950/40 border-cyan-500/50 hover:bg-cyan-900/50'}
        `}
        onPointerDown={() => handleTap('p1')}
      >
        <div className="flex flex-col items-center justify-center w-full h-full p-6 text-center pointer-events-none">
          {gameStatus === 'idle' && (
            <div className="opacity-50 flex flex-col items-center">
              <span className="material-symbols-outlined text-[48px] mb-2 text-cyan-500">swords</span>
              <p className="font-black tracking-widest uppercase text-cyan-500">Player 1 Area</p>
            </div>
          )}
          {gameStatus === 'standby' && (
            <p className="text-3xl font-black tracking-widest text-zinc-500 animate-pulse">STANDBY...</p>
          )}
          {gameStatus === 'execute' && (
            <p className="text-5xl font-black tracking-widest text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] scale-110">EXECUTE!</p>
          )}
          {gameStatus === 'gameover' && winner === 'p1' && (
            <p className="text-4xl font-black tracking-widest text-emerald-400 drop-shadow-md flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span> WINNER
            </p>
          )}
          {gameStatus === 'gameover' && loser === 'p1' && (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <span className="material-symbols-outlined text-[40px]" style={{ fontVariationSettings: "'FILL' 1" }}>skull</span>
              <p className="text-2xl font-black tracking-widest">{winReason === 'early-tap' ? 'SHORT CIRCUIT!' : 'TOO SLOW!'}</p>
              <p className="text-xs font-bold uppercase mt-2 opacity-80">Penalty: {penaltyTheme}</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}