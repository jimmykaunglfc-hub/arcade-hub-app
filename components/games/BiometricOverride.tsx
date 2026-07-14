"use client";

import { useState, useEffect, useRef } from "react";

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
  "text-cyan-500", "text-pink-500", "text-emerald-500", "text-amber-500", "text-purple-500", "text-rose-500"
];

type TouchPoint = {
  id: number;
  x: number;
  y: number;
  colorIndex: number;
};

export default function BiometricOverride({ onClose }: { onClose?: () => void }) {
  const [touches, setTouches] = useState<TouchPoint[]>([]);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'selected'>('idle');
  const [winnerId, setWinnerId] = useState<number | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Multi-Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // If a winner is already selected, wait until all fingers leave to reset
    if (phase === 'selected') return;

    const currentTouches = Array.from(e.touches).map((t, index) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      colorIndex: index % NODE_COLORS.length
    }));

    setTouches(currentTouches);

    // Game Logic: Start scanning if 2 or more fingers are on screen
    if (currentTouches.length >= 2) {
      if (phase === 'idle') {
        setPhase('scanning');
        // Trigger haptic feedback if available
        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([50, 50, 50]);
        }
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (phase === 'selected') return;
    
    const currentTouches = Array.from(e.touches).map((t, index) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      colorIndex: index % NODE_COLORS.length
    }));
    
    setTouches(currentTouches);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (phase === 'selected') {
      if (e.touches.length === 0) {
        setPhase('idle');
        setWinnerId(null);
        setTouches([]);
      }
      return;
    }

    const currentTouches = Array.from(e.touches).map((t, index) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      colorIndex: index % NODE_COLORS.length
    }));

    setTouches(currentTouches);

    // Cancel scan if someone lets go early
    if (currentTouches.length < 2) {
      setPhase('idle');
      if (timerRef.current) clearTimeout(timerRef.current);
    }
  };

  // Timer Effect
  useEffect(() => {
    if (phase === 'scanning') {
      timerRef.current = setTimeout(() => {
        // Pick a random winner from the current touches
        const randomWinner = touches[Math.floor(Math.random() * touches.length)];
        if (randomWinner) {
          setWinnerId(randomWinner.id);
          setPhase('selected');
          
          // Winning Haptic Feedback
          if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate([200, 100, 200]);
          }
        }
      }, 1500); // Fast, snappy gameplay
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, touches]);

  return (
    <div 
      className="fixed inset-0 flex flex-col items-center w-full h-full bg-slate-50 dark:bg-[#09090b] font-sans text-slate-900 dark:text-white overscroll-none selection:bg-transparent transition-colors duration-300 touch-none z-[100] animate-fade-in"
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
      
      {/* 1. TOP HEADER (Bulletproof Layout Fix) */}
      <header className="absolute top-0 left-0 w-full z-50 px-6 pb-2 pointer-events-none" style={{ paddingTop: 'max(env(safe-area-inset-top), 1.5rem)' }}>
        <button 
          onClick={onClose} 
          onTouchStart={(e) => e.stopPropagation()} // Prevents the exit tap from triggering a game node
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors uppercase tracking-widest active:scale-95 pointer-events-auto"
        >
          <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span> Exit
        </button>
      </header>

      {/* 2. HUD / STATUS INSTRUCTIONS */}
      <div className="w-full px-6 flex flex-col items-center justify-center pointer-events-none relative z-40" style={{ marginTop: 'calc(max(env(safe-area-inset-top), 1.5rem) + 40px)' }}>
        <div className="bg-white/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 backdrop-blur-xl px-6 py-4 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-xs">
          <span className={`material-symbols-outlined text-[32px] mb-2 ${phase === 'scanning' ? 'text-blue-500 animate-pulse' : phase === 'selected' ? 'text-red-500' : 'text-slate-400 dark:text-zinc-500'}`}>
            fingerprint
          </span>
          <h2 className="text-sm font-black uppercase tracking-widest mb-1">
            {phase === 'idle' ? 'Awaiting Inputs' : phase === 'scanning' ? 'Scanning Biometrics' : 'Target Locked'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            {phase === 'idle' ? 'Everyone place one finger on the screen to begin.' : 
             phase === 'scanning' ? 'Hold steady...' : 
             'Release all fingers to reset.'}
          </p>
        </div>
      </div>

      {/* 3. MULTI-TOUCH RENDERING LAYER */}
      <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
        
        {/* Subtle Background Radar Sweep during scanning */}
        {phase === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center animate-fade-in">
            <div className="w-[150vw] h-[150vw] rounded-full border border-blue-500/10 animate-[spin_2s_linear_infinite]" 
                 style={{ background: 'conic-gradient(from 0deg, transparent 70%, rgba(59, 130, 246, 0.15) 100%)' }} />
          </div>
        )}

        {/* Render Each Finger */}
        {touches.map((touch) => {
          const isWinner = winnerId === touch.id;
          const isLoser = phase === 'selected' && !isWinner;

          if (isLoser) return null; // Hide losers when winner is selected

          return (
            <div
              key={touch.id}
              className="absolute pointer-events-none animate-touch-pop"
              style={{ left: touch.x, top: touch.y }}
            >
              {/* Outer Ripple / Glowing Aura */}
              <div className={`absolute -inset-12 rounded-full border-2 opacity-50 
                ${isWinner ? 'border-red-500 animate-[ping_1s_cubic-bezier(0,0,0.2,1)_infinite]' : NODE_COLORS[touch.colorIndex]} 
                ${phase === 'scanning' ? 'animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]' : ''}`} 
              />
              
              {/* Secondary Ring */}
              <div className={`absolute -inset-5 rounded-full border-[3px] 
                ${isWinner ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)] animate-pulse' : NODE_COLORS[touch.colorIndex]}`} 
              />

              {/* Core Finger Node */}
              <div className={`absolute -inset-8 rounded-full flex items-center justify-center backdrop-blur-md border-[4px]
                ${isWinner ? 'bg-red-500/20 border-red-500 shadow-[inset_0_0_20px_rgba(239,68,68,0.8)]' : `bg-black/50 ${NODE_COLORS[touch.colorIndex]}`}`}
              >
                <span className={`material-symbols-outlined text-[28px] ${isWinner ? 'text-red-500' : INNER_COLORS[touch.colorIndex]}`}>
                  radar
                </span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}