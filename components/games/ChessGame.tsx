"use client";

import { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../../lib/supabaseClient";

interface ChessGameProps {
  onClose: () => void;
  preloadedMatchId?: string | null;
}

export default function ChessGame({ onClose, preloadedMatchId }: ChessGameProps) {
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [status, setStatus] = useState("White to move");
  const [channel, setChannel] = useState<any>(null);

  // 1. Initialize Multiplayer Synchronization if Match ID exists
  useEffect(() => {
    if (!preloadedMatchId) return;

    const matchChannel = supabase.channel(`chess_match_${preloadedMatchId}`, {
      config: { broadcast: { self: false } },
    });

    matchChannel
      .on("broadcast", { event: "board_update" }, (payload) => {
        const updatedGame = new Chess(payload.payload.fen);
        setGame(updatedGame);
        setFen(updatedGame.fen());
        updateGameStatus(updatedGame);
      })
      .subscribe();

    setChannel(matchChannel);

    return () => {
      supabase.removeChannel(matchChannel);
    };
  }, [preloadedMatchId]);

  // 2. Handle Game Status (Check, Checkmate, Draw)
  const updateGameStatus = (currentGame: Chess) => {
    if (currentGame.isGameOver()) {
      if (currentGame.isCheckmate()) setStatus(`Checkmate! ${currentGame.turn() === "w" ? "Black" : "White"} wins!`);
      else if (currentGame.isDraw()) setStatus("Draw!");
      else if (currentGame.isStalemate()) setStatus("Stalemate!");
      else setStatus("Game Over");
    } else {
      const turn = currentGame.turn() === "w" ? "White" : "Black";
      setStatus(currentGame.isCheck() ? `Check! ${turn} to move` : `${turn} to move`);
    }
  };

  // 3. Piece Drop Handler
  const onDrop = (args: any, ...rest: any[]) => {
    // Safely extract coordinates for the v5 API architecture
    const sourceSquare = args?.sourceSquare || args;
    const targetSquare = args?.targetSquare || rest[0];
    const piece = args?.piece || rest[1];

    const gameCopy = new Chess(game.fen());
    
    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: piece && typeof piece === 'string' ? piece[1].toLowerCase() : "q", 
      });

      if (move === null) return false;

      // Update Local State
      setGame(gameCopy);
      setFen(gameCopy.fen());
      updateGameStatus(gameCopy);

      // Broadcast move to opponent if playing online
      if (channel && preloadedMatchId) {
        channel.send({
          type: "broadcast",
          event: "board_update",
          payload: { fen: gameCopy.fen() },
        });
      }

      return true;
    } catch (e) {
      return false; 
    }
  };

  // 4. Reset Board
  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setStatus("White to move");
    
    if (channel && preloadedMatchId) {
      channel.send({
        type: "broadcast",
        event: "board_update",
        payload: { fen: newGame.fen() },
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#121212] flex flex-col items-center justify-center font-body text-white">
      {/* Top Action Bar */}
      <div className="w-full max-w-[400px] flex justify-between items-center px-4 mb-8">
        <button 
          onClick={onClose} 
          className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors border border-white/10"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="text-center">
          <h2 className="font-headline font-bold text-xl uppercase tracking-widest text-indigo-400">
            {preloadedMatchId ? "Live Match" : "Local Pass & Play"}
          </h2>
          <p className="text-sm text-neutral-400 font-bold">{status}</p>
        </div>
        <button 
          onClick={resetGame} 
          className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors border border-white/10"
        >
          <span className="material-symbols-outlined">restart_alt</span>
        </button>
      </div>

      {/* Board Container */}
      <div className="w-full max-w-[400px] p-4 bg-surface/50 rounded-xl shadow-2xl border border-white/5">
        <Chessboard 
          // FIXED: Removed strictly unaccepted properties for a clean compile
          options={{
            position: fen,
            onPieceDrop: onDrop
          }}
        />
      </div>
    </div>
  );
}