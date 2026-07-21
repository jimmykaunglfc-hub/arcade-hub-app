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
  
  // 🌐 Online Multiplayer States
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 1. Fetch Local User Session (For Online Identity)
  useEffect(() => {
    if (preloadedMatchId) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setMyUserId(session.user.id);
        }
      });
    }
  }, [preloadedMatchId]);

  // 2. Initialize Multiplayer Sync & Presence
  useEffect(() => {
    if (!preloadedMatchId || !myUserId) return;

    const matchChannel = supabase.channel(`chess_match_${preloadedMatchId}`, {
      config: { 
        broadcast: { self: false },
        presence: { key: myUserId } // Track this specific user in the room
      },
    });

    matchChannel
      .on("broadcast", { event: "board_update" }, (payload) => {
        const updatedGame = new Chess(payload.payload.fen);
        setGame(updatedGame);
        setFen(updatedGame.fen());
        updateGameStatus(updatedGame);
      })
      .on("presence", { event: "sync" }, () => {
        const state = matchChannel.presenceState();
        const users = Object.keys(state);
        
        // If 2 people are in the room, the match is live
        setOpponentConnected(users.length > 1);

        // Deterministically assign color based on sorted User IDs 
        // (Alphabetically First ID = White, Second ID = Black)
        if (users.length > 0) {
          const sortedUsers = users.sort();
          if (sortedUsers[0] === myUserId) {
            setPlayerColor("white");
          } else {
            setPlayerColor("black");
          }
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await matchChannel.track({ online_at: new Date().toISOString() });
        }
      });

    setChannel(matchChannel);

    return () => {
      matchChannel.untrack();
      supabase.removeChannel(matchChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedMatchId, myUserId]); // Empty game dependency to prevent endless re-subscriptions

  // 3. Handle Game Status (Check, Checkmate, Draw)
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

  // 4. Piece Drop Handler with Network Rules
  const onDrop = (args: any, ...rest: any[]) => {
    const sourceSquare = args?.sourceSquare || args;
    const targetSquare = args?.targetSquare || rest[0];
    const piece = args?.piece || rest[1];

    // 🛑 ONLINE SECURITY: Prevent moving if opponent is missing or it's not your turn
    if (preloadedMatchId) {
      if (!opponentConnected) return false;
      
      const currentTurn = game.turn(); // 'w' or 'b'
      const isMyTurn = 
        (playerColor === "white" && currentTurn === "w") || 
        (playerColor === "black" && currentTurn === "b");
      
      if (!isMyTurn) return false;
    }

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

      // Broadcast valid move to opponent
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

  // 5. Reset Board
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
          
          {/* Real-time Connection Indicator */}
          {preloadedMatchId && (
            <p className={`text-xs mt-1 font-bold tracking-wide uppercase ${opponentConnected ? "text-emerald-400" : "text-amber-400 animate-pulse"}`}>
              {opponentConnected ? `Playing as ${playerColor}` : "Waiting for opponent..."}
            </p>
          )}
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
          // Cast to `any` safely bypasses restrictive TypeScript type definitions while allowing standard engine props
          options={{
            position: fen,
            onPieceDrop: onDrop,
            boardOrientation: playerColor 
          } as any}
        />
      </div>
    </div>
  );
}