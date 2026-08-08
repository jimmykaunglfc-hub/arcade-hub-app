"use client";

import UnoGame from "./games/UnoGame";
import Carrom from "./games/Carrom";
import ChessGame from "./games/ChessGame";
import Checkers from "./games/Checkers";
import SnookerGame from "./games/SnookerGame";
import TicTacToeGame from "./games/TicTacToeGame";
import BiometricOverride from "./games/BiometricOverride";
import PoolGame from "./games/PoolGame";
import MiniFighter from "./games/MiniFighter";

interface GamePlayerProps {
  gameUrl: string;
  onClose: () => void;
  matchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

export default function GamePlayer({ 
  gameUrl, 
  onClose,
  matchId,
  opponent
}: GamePlayerProps) {
  // Check if this is an internal native React game
  const isNative = gameUrl.startsWith("native://");
  const nativeSlug = isNative ? gameUrl.replace("native://", "").toLowerCase() : "";

  // 🎮 1. ROUTE TO NATIVE REACT GAMES
  if (isNative) {
    switch (nativeSlug) {
      case "uno":
        return (
          <UnoGame 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "carrom":
        return (
          <Carrom 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "chess":
        return (
          <ChessGame 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "checkers":
        return (
          <Checkers 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "snooker":
        return (
          <SnookerGame 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "8-ball-pool":
      case "pool":
        return (
          <PoolGame 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "tictactoe":
      case "tic-tac-toe":
        return (
          <TicTacToeGame 
            onClose={onClose} 
            preloadedMatchId={matchId} 
            opponent={opponent} 
          />
        );
      case "biometric-override":
        return (
          <BiometricOverride 
            onClose={onClose} 
          />
        );
      case "mini-fighter":
      case "minifighter":
        return (
          <MiniFighter onClose={onClose} preloadedMatchId={matchId} opponent={opponent} />
        );
      default:
        // Fallback if slug is not matched
        return (
          <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 text-white font-headline">
            <h2 className="text-xl font-bold mb-2">Game Not Found</h2>
            <p className="text-sm text-neutral-400 mb-6">Unable to launch game slug: {nativeSlug}</p>
            <button 
              onClick={onClose}
              className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider transition-all"
            >
              Back to Arcade
            </button>
          </div>
        );
    }
  }

  // 🌐 2. FALLBACK FOR EXTERNAL IFRAME GAMES
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
      {/* 🎮 Game Header Bar */}
      <div className="h-auto min-h-12 pb-2 bg-surface/90 backdrop-blur-md flex items-center justify-between px-4 border-b border-white/10 pt-safe">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
          <span className="text-xs font-bold text-white tracking-widest uppercase">Playing</span>
        </div>
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center border border-white/10 active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-white text-sm font-bold">close</span>
        </button>
      </div>

      {/* 🕹️ The Game Iframe */}
      <div className="flex-1 w-full bg-black">
        <iframe 
          src={gameUrl}
          className="w-full h-full border-0"
          title="Game Player"
          allow="fullscreen; autoplay; gamepad"
        />
      </div>
    </div>
  );
}
