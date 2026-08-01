"use client";

import { useState } from "react";
import { soundEngine } from "../../lib/soundManager";

// 🛍️ NEW: Live Database Cosmetic Hook
import { useEquippedCosmetic } from "../../lib/cosmeticsUtils";

type PenaltyTheme = "Standard" | "Drink" | "Truth" | "Dare";
const PENALTY_THEMES: PenaltyTheme[] = ["Standard", "Drink", "Truth", "Dare"];

type Card = {
  id: number;
  isGlitch: boolean;
  isFlipped: boolean;
};

export default function GlitchDeck({ onClose }: { onClose: () => void }) {
  // 🛍️ LIVE DATABASE COSMETICS ENGINE SYNC
  const { modifiers } = useEquippedCosmetic("glitch_deck");
  // If modifiers exist, the user has equipped a cosmetic deck theme
  const isNeonTheme = !!modifiers;

  const [playerCount, setPlayerCount] = useState<number>(4);
  const [cards, setCards] = useState<Card[]>([]);
  const [gameStatus, setGameStatus] = useState<"setup" | "playing" | "gameover">("setup");
  const [penaltyTheme, setPenaltyTheme] = useState<PenaltyTheme>("Drink");
  const [showPenalty, setShowPenalty] = useState(false);

  const cycleTheme = () => {
    soundEngine.playSFX("click");
    setPenaltyTheme((prev) => PENALTY_THEMES[(PENALTY_THEMES.indexOf(prev) + 1) % PENALTY_THEMES.length]);
  };

  const startGame = () => {
    soundEngine.playSFX("click");
    const newCards = Array.from({ length: playerCount }).map((_, i) => ({
      id: i,
      isGlitch: false,
      isFlipped: false,
    }));

    const glitchIndex = Math.floor(Math.random() * playerCount);
    newCards[glitchIndex].isGlitch = true;

    setCards(newCards);
    setGameStatus("playing");
    setShowPenalty(false);
  };

  const flipCard = (index: number) => {
    if (gameStatus !== "playing" || cards[index].isFlipped) return;

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    if (newCards[index].isGlitch) {
      soundEngine.playSFX("laser");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate([200, 100, 300]);
      }
      setTimeout(() => {
        soundEngine.playSFX("defeat");
        setGameStatus("gameover");
        setShowPenalty(true);
      }, 600);
    } else {
      soundEngine.playSFX("card_flip");
      if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center w-full overscroll-none text-white selection:bg-transparent select-none font-sans">
      
      {/* 🎮 TOP HEADER CONTROL BAR */}
      <header className="w-full min-h-14 h-auto pb-2 bg-[#18181b]/90 backdrop-blur-md flex items-center justify-between px-4 border-b border-white/10 pt-safe z-30">
        <button
          onClick={handleExit}
          className="flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-white transition-colors uppercase tracking-widest active:scale-95"
        >
          <span className="material-symbols-outlined text-sm">arrow_back_ios_new</span> Exit Arena
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-[#CCFF00]">
          GLITCH DECK v1.0
        </span>
        <div className="w-14"></div>
      </header>

      {/* ⚙️ PHASE A: CONFIGURATION & SETUP */}
      {gameStatus === "setup" && (
        <div className="flex flex-col items-center justify-center w-full max-w-sm px-6 flex-1 animate-fade-in">
          <div className="w-20 h-20 bg-[#CCFF00]/10 rounded-3xl flex items-center justify-center mb-6 border border-[#CCFF00]/20 shadow-[0_0_30px_rgba(204,255,0,0.15)]">
            <span className="material-symbols-outlined text-[#CCFF00] text-4xl">layers</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2 text-center tracking-tight font-headline">
            Glitch Deck
          </h1>
          <p className="text-xs text-neutral-400 text-center mb-8 leading-relaxed max-w-[280px]">
            Take turns tapping system nodes. Avoid drawing the corrupted glitch matrix.
          </p>

          {/* Player Adjustment Slider */}
          <div className="w-full bg-[#18181b] border border-white/10 p-5 rounded-2xl shadow-inner mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-neutral-400">
                <span className="material-symbols-outlined text-lg">group</span>
                <span className="font-bold text-xs uppercase tracking-wider">Total Nodes</span>
              </div>
              <span className="text-xl font-black text-[#CCFF00]">{playerCount}</span>
            </div>
            <input
              type="range"
              min="2"
              max="12"
              value={playerCount}
              onChange={(e) => {
                soundEngine.playSFX("click");
                setPlayerCount(parseInt(e.target.value));
              }}
              className="w-full h-1.5 bg-black rounded-lg appearance-none cursor-pointer accent-[#CCFF00] border border-white/5"
            />
          </div>

          {/* Penalty Toggle Component */}
          <div className="w-full flex justify-between items-center bg-[#18181b] border border-white/10 p-4 rounded-2xl mb-8">
            <div className="flex items-center gap-2 text-neutral-400">
              <span className="material-symbols-outlined text-lg">skull</span>
              <span className="text-xs font-bold uppercase tracking-wider">Breach Penalty:</span>
            </div>
            <button
              onClick={cycleTheme}
              className="text-[10px] font-black uppercase tracking-widest text-[#CCFF00] bg-[#CCFF00]/10 border border-[#CCFF00]/20 px-3 py-2 rounded-xl active:scale-95 transition-transform flex items-center gap-1.5"
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

          <button
            onClick={startGame}
            className="w-full py-4 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-headline font-black rounded-2xl tracking-widest transition-transform active:scale-95 shadow-[0_0_25px_rgba(204,255,0,0.25)] text-sm"
          >
            INITIALIZE MATRIX
          </button>
        </div>
      )}

      {/* 🕹️ PHASE B: ACTIVE BROADCAST PLAYING */}
      {gameStatus !== "setup" && (
        <div className="flex flex-col flex-1 w-full max-w-lg px-6 pt-6 transition-all duration-300">
          <div className="flex justify-between items-center mb-6">
            <div className="flex flex-col">
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-black mb-0.5">
                Secure Modules Left
              </span>
              <span className="text-xl font-black text-white">
                {cards.filter((c) => !c.isFlipped).length}{" "}
                <span className="text-xs font-medium text-neutral-500">/ {playerCount}</span>
              </span>
            </div>
            <button
              onClick={() => {
                soundEngine.playSFX("click");
                setGameStatus("setup");
              }}
              className="bg-[#18181b] border border-white/10 p-2.5 rounded-full shadow-md active:scale-95 transition-transform hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-white text-base block">refresh</span>
            </button>
          </div>

          {/* 🃏 Responsive 3D Tailwind Flip Engine */}
          <div className="flex-1 w-full flex items-center justify-center">
            <div
              className={`grid gap-3 w-full max-w-[340px] mx-auto ${
                playerCount <= 4
                  ? "grid-cols-2"
                  : playerCount <= 9
                  ? "grid-cols-3"
                  : "grid-cols-4"
              }`}
            >
              {cards.map((card, index) => (
                <div key={card.id} className="relative w-full aspect-[3/4] [perspective:1000px]">
                  <div
                    className={`w-full h-full relative duration-500 [transform-style:preserve-3d] cursor-pointer ${
                      card.isFlipped ? "[transform:rotateY(180deg)]" : ""
                    }`}
                    onClick={() => flipCard(index)}
                  >
                    {/* Facedown Side */}
                    <div
                      className={`absolute inset-0 [backface-visibility:hidden] rounded-xl border-2 shadow-lg flex items-center justify-center group transition-all ${
                        isNeonTheme
                          ? "bg-gradient-to-br from-[#18181b] to-black border-white/10 hover:border-[#CCFF00]/50"
                          : "bg-[#18181b] border-white/10"
                      }`}
                    >
                      <div className="absolute inset-1.5 border border-white/5 rounded-lg border-dashed" />
                      <span className="material-symbols-outlined text-white/20 group-hover:text-[#CCFF00]/60 transition-colors text-2xl">
                        layers
                      </span>
                    </div>

                    {/* Flipped/Revealed Side */}
                    <div
                      className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl border-2 shadow-xl flex flex-col items-center justify-center p-2 ${
                        card.isGlitch
                          ? "bg-gradient-to-br from-red-600/90 to-red-950 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                          : "bg-gradient-to-br from-emerald-600/80 to-emerald-950 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]"
                      }`}
                    >
                      {card.isGlitch ? (
                        <>
                          <span className="material-symbols-outlined text-white text-3xl mb-1 animate-pulse">
                            error
                          </span>
                          <span className="text-[9px] font-black tracking-widest text-white uppercase">
                            GLITCH
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-white text-3xl mb-1">
                            verified
                          </span>
                          <span className="text-[9px] font-black tracking-widest text-white uppercase">
                            SECURE
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-neutral-400 font-bold tracking-widest uppercase text-center mt-6 pb-8 animate-pulse">
            {gameStatus === "playing" ? "⚡ Access a node module ⚡" : "💀 Security breach detected 💀"}
          </p>
        </div>
      )}

      {/* ⚠️ PHASE C: RED INTERCEPT PENALTY SCREEN */}
      {showPenalty && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-fade-in">
          <div className="bg-[#18181b] border-2 border-red-500 rounded-[2.5rem] p-7 max-w-sm w-full text-center shadow-[0_0_50px_rgba(239,68,68,0.3)] relative overflow-hidden">
            <button
              onClick={() => {
                soundEngine.playSFX("click");
                setShowPenalty(false);
              }}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white bg-white/5 p-1.5 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-base block">close</span>
            </button>

            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <span className="material-symbols-outlined text-red-500 text-3xl">gavel</span>
            </div>

            <h2 className="text-xl font-black text-white tracking-tight mb-4 font-headline uppercase">
              System Breached
            </h2>

            <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-2xl mb-6 shadow-inner">
              <span className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-2 block">
                System Execution
              </span>
              <p className="text-lg font-black text-red-100">
                {penaltyTheme === "Drink" && "Take a shot! 🥃"}
                {penaltyTheme === "Truth" && "Reveal a Secret! 🤫"}
                {penaltyTheme === "Dare" && "Execute a Dare! 🎯"}
                {penaltyTheme === "Standard" && "Node compromised. You lose! 💥"}
              </p>
            </div>

            <button
              onClick={() => {
                soundEngine.playSFX("click");
                setShowPenalty(false);
                setGameStatus("setup");
              }}
              className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl tracking-widest transition-transform active:scale-95 shadow-md flex items-center justify-center gap-2 text-xs uppercase"
            >
              <span className="material-symbols-outlined text-sm">refresh</span> Reboot Deck
            </button>
          </div>
        </div>
      )}
    </div>
  );
}