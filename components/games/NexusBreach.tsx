"use client";

import { useState, useEffect } from "react";

type PenaltyTheme = 'Standard' | 'Drink' | 'Truth' | 'Dare';
const PENALTY_THEMES: PenaltyTheme[] = ['Standard', 'Drink', 'Truth', 'Dare'];

export default function NexusBreach({ onClose }: { onClose?: () => void }) {
  const [trapIndex, setTrapIndex] = useState<number>(0);
  const [clearedIndexes, setClearedIndexes] = useState<number[]>([]);
  const [gameStatus, setGameStatus] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [penaltyTheme, setPenaltyTheme] = useState<PenaltyTheme>('Drink'); 
  const [showPenalty, setShowPenalty] = useState(false); 
  
  const [isApp, setIsApp] = useState(true); 

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsApp(urlParams.get('app') === 'true');
    initGame();
  }, []);

  const initGame = () => {
    setTrapIndex(Math.floor(Math.random() * 16));
    setClearedIndexes([]);
    setGameStatus('playing');
    setShowPenalty(false);
  };

  const cycleTheme = () => {
    setPenaltyTheme(prev => PENALTY_THEMES[(PENALTY_THEMES.indexOf(prev) + 1) % PENALTY_THEMES.length]);
  };

  const handleBoxClick = (index: number) => {
    if (gameStatus !== 'playing' || clearedIndexes.includes(index)) return;

    if (index === trapIndex) {
      setGameStatus('gameover');
      setShowPenalty(true); 
    } else {
      setClearedIndexes([...clearedIndexes, index]);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center w-full bg-slate-50 dark:bg-[#09090b] font-sans text-slate-900 dark:text-white overscroll-none selection:bg-transparent transition-colors duration-300">
      
      <style>{`
        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      {/* 1. TOP HEADER */}
      <header className="shrink-0 w-full bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 z-20 shadow-sm" style={{ paddingTop: 'max(env(safe-area-inset-top), 1rem)' }}>
        <div className="px-6 py-4 flex justify-between items-center">
          <button onClick={onClose} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-500 hover:opacity-70 transition-opacity active:scale-95">
            <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span> Exit
          </button>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">Nexus Breach</span>
          <div className="w-16"></div>
        </div>
      </header>

      {/* 2. HUD & PENALTY THEME SELECTOR */}
      <div className="w-full px-6 flex flex-col gap-4 max-w-sm mx-auto mt-6 shrink-0">
        
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-1">Nodes Recovered</span>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-500">security</span>
              <span className="text-2xl font-black">{clearedIndexes.length} <span className="text-sm text-slate-400 dark:text-zinc-600">/ 15</span></span>
            </div>
          </div>
          
          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-1">System Status</span>
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
              gameStatus === 'playing' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
              'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse'
            }`}>
              {gameStatus === 'playing' ? 'Active' : 'Breached'}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-white/5 p-3 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 dark:text-zinc-500 text-sm">skull</span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Penalty Mode:</span>
          </div>
          <button 
            onClick={cycleTheme} 
            className="text-[11px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 px-3 py-1.5 rounded-lg active:scale-95 transition-transform flex items-center gap-1.5"
          >
            {penaltyTheme} {penaltyTheme === 'Drink' ? '🥃' : penaltyTheme === 'Truth' ? '🤫' : penaltyTheme === 'Dare' ? '🎯' : '💥'}
          </button>
        </div>

      </div>

      {/* 3. THE GAME GRID */}
      <div className="flex-1 w-full flex items-center justify-center px-6 min-h-0 py-4">
        <div className="grid grid-cols-4 grid-rows-4 gap-3 w-full max-w-[340px] aspect-square relative z-10">
          {Array.from({ length: 16 }).map((_, i) => {
            const isCleared = clearedIndexes.includes(i);
            const isTrap = i === trapIndex;
            const revealTrap = gameStatus === 'gameover' && isTrap;
            const revealSafe = gameStatus === 'gameover' && !isTrap && !isCleared;

            return (
              <button
                key={i}
                onClick={() => handleBoxClick(i)}
                disabled={gameStatus !== 'playing' || isCleared}
                className={`relative w-full h-full rounded-2xl flex items-center justify-center transition-all duration-300 overflow-hidden animate-pop-in ${
                  gameStatus === 'playing' && !isCleared ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default"
                } ${
                  revealTrap 
                    ? "bg-red-500/20 border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)] z-20" 
                    : isCleared || revealSafe
                    ? "bg-slate-200/50 dark:bg-zinc-900/50 border border-slate-300 dark:border-white/5 shadow-[inset_0_5px_15px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_5px_15px_rgba(0,0,0,0.5)]"
                    : "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-[#1e1e24] dark:to-[#121214] border border-blue-200 dark:border-white/10 shadow-[0_10px_20px_rgba(0,0,0,0.05),_inset_0_-2px_5px_rgba(0,0,0,0.05)] dark:shadow-[0_10px_20px_rgba(0,0,0,0.4),_inset_0_-2px_5px_rgba(0,0,0,0.5)] hover:border-blue-400 dark:hover:border-blue-500/50"
                }`}
                style={{ animationDelay: `${i * 0.02}s` }}
              >
                {!isCleared && !revealTrap && !revealSafe && (
                  <span className="material-symbols-outlined text-blue-400/50 dark:text-blue-500/30 absolute text-[40px]" style={{ fontVariationSettings: "'FILL' 0" }}>hexagon</span>
                )}
                {!isCleared && !revealTrap && !revealSafe && (
                  <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 opacity-70 text-lg">auto_awesome</span>
                )}
                {isCleared && (
                  <div className="w-3 h-3 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pop-in" />
                )}
                {revealTrap && (
                  <span className="material-symbols-outlined text-3xl text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. BOTTOM ACTION BAR / RESTART PANEL */}
      <div className="w-full px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 shrink-0 flex flex-col items-center justify-center relative z-50">
        <div className="w-full h-14 flex items-center justify-center">
          {gameStatus === 'playing' ? (
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 font-medium tracking-widest uppercase text-center animate-fade-in">
              15 safe nodes. 1 corrupted trap.<br/>Push your luck.
            </p>
          ) : (
            <div className="w-full max-w-[280px] h-full animate-pop-in">
              <button 
                onClick={initGame}
                className="w-full h-full font-black rounded-2xl tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95 bg-red-600 text-white shadow-red-600/30 hover:bg-red-500"
              >
                <span className="material-symbols-outlined text-xl">refresh</span>
                REBOOT SYSTEM
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. DRAMATIC PENALTY POPUP MODAL */}
      {showPenalty && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-slate-900/80 dark:bg-black/80 backdrop-blur-md p-6 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border-2 border-red-500 rounded-[2rem] p-8 max-w-sm w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.3)] relative overflow-hidden animate-pop-in">
            <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
            <button 
              onClick={() => setShowPenalty(false)} 
              className="absolute top-4 right-4 text-red-400 hover:text-red-200 bg-red-500/10 w-8 h-8 rounded-full flex items-center justify-center transition-colors z-20"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>

            <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-200 dark:border-red-500/20 relative z-10">
              <span className="material-symbols-outlined text-4xl text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            </div>
            
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mb-2 relative z-10">
              SYSTEM BREACHED
            </h2>
            
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 p-6 rounded-2xl mb-8 mt-6 shadow-inner relative z-10">
              <span className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-3 block">
                Penalty Required
              </span>
              <p className="text-xl font-black text-slate-800 dark:text-red-100">
                {penaltyTheme === 'Drink' && "Take a shot! 🥃"}
                {penaltyTheme === 'Truth' && "Reveal a Truth! 🤫"}
                {penaltyTheme === 'Dare' && "Complete a Dare! 🎯"}
                {penaltyTheme === 'Standard' && "Node corrupted. You lose. 💥"}
              </p>
            </div>

            <button 
              onClick={() => setShowPenalty(false)} 
              className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl tracking-widest transition-transform active:scale-95 shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 relative z-10"
            >
              ACCEPT PENALTY
            </button>
          </div>
        </div>
      )}

    </div>
  );
}