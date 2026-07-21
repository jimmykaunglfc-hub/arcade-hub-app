"use client";

import { useState, useEffect } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../../lib/supabaseClient";

interface ChessGameProps {
  onClose: () => void;
  preloadedMatchId?: string | null;
}

export default function ChessGame({ onClose, preloadedMatchId }: ChessGameProps) {
  // 🎮 LOBBY & VIEW STATES
  const [view, setView] = useState<"menu" | "host" | "play">(preloadedMatchId ? "play" : "menu");
  const [matchId, setMatchId] = useState<string | null>(preloadedMatchId || null);
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);

  // ♟️ CHESS ENGINE STATES
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [status, setStatus] = useState("White to move");
  
  // 🎨 PREMIUM UI: Move Highlighting
  const [moveSquares, setMoveSquares] = useState({});
  const [optionSquares, setOptionSquares] = useState({});
  // strictly type the source square as a chess.js Square
  const [sourceSquare, setSourceSquare] = useState<Square | null>(null);

  // 🌐 ONLINE MULTIPLAYER STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 🎭 REACTIONS
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [oppReaction, setOppReaction] = useState<string | null>(null);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  // 1. Fetch Local User Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setMyUserId(session.user.id);
      }
    });
  }, []);

  // 2. Initialize Multiplayer Sync & Presence 
  useEffect(() => {
    if (!matchId || !myUserId) return;

    const matchChannel = supabase.channel(`chess_match_${matchId}`, {
      config: { 
        broadcast: { self: false },
        presence: { key: myUserId }
      },
    });

    matchChannel
      .on("broadcast", { event: "board_update" }, (payload) => {
        const updatedGame = new Chess(payload.payload.fen);
        setGame(updatedGame);
        setFen(updatedGame.fen());
        setMoveSquares({
          [payload.payload.lastMove.from]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
          [payload.payload.lastMove.to]: { backgroundColor: "rgba(255, 255, 0, 0.4)" }
        });
        updateGameStatus(updatedGame);
      })
      .on("broadcast", { event: "reaction" }, (payload) => {
        setOppReaction(payload.payload.emoji);
        setTimeout(() => setOppReaction(null), 3500); 
      })
      .on("presence", { event: "sync" }, () => {
        const state = matchChannel.presenceState();
        const users = Object.keys(state);
        
        const isConnected = users.length > 1;
        setOpponentConnected(isConnected);

        if (users.length > 0) {
          const sortedUsers = users.sort();
          setPlayerColor(sortedUsers[0] === myUserId ? "white" : "black");
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
  }, [matchId, myUserId]);

  // 3. Auto-Start Match when Opponent Joins Lobby
  useEffect(() => {
    if (view === "host" && opponentConnected) {
      setView("play");
    }
  }, [opponentConnected, view]);

  // 4. Handle Game Status 
  const updateGameStatus = (currentGame: Chess) => {
    if (currentGame.isGameOver()) {
      if (currentGame.isCheckmate()) setStatus(`Checkmate! ${currentGame.turn() === "w" ? "Black" : "White"} wins.`);
      else if (currentGame.isDraw()) setStatus("Draw!");
      else if (currentGame.isStalemate()) setStatus("Stalemate!");
      else setStatus("Game Over");
    } else {
      const turn = currentGame.turn() === "w" ? "White" : "Black";
      setStatus(currentGame.isCheck() ? `Check! ${turn} to move` : `${turn} to move`);
    }
  };

  // 5. Move Highlighting Logic (Fixed Typings)
  const getMoveOptions = (square: Square) => {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.map((move) => {
      const targetSquare = move.to as Square;
      const targetPiece = game.get(targetSquare);
      const sourcePiece = game.get(square);

      newSquares[targetSquare] = {
        background:
          targetPiece && sourcePiece && targetPiece.color !== sourcePiece.color
            ? "radial-gradient(circle, rgba(239, 68, 68, 0.8) 20%, transparent 25%)" // Capture
            : "radial-gradient(circle, rgba(99, 102, 241, 0.5) 25%, transparent 25%)", // Normal Move
        borderRadius: "50%",
      };
    });
    
    newSquares[square] = { background: "rgba(99, 102, 241, 0.4)" };
    setOptionSquares(newSquares);
    return true;
  };

  // 6. Execution Logic (Fixed Typings)
  const executeMove = (source: Square, target: Square, piecePromotion: string = "q") => {
    if (matchId && !opponentConnected) return false;
    
    const gameCopy = new Chess(game.fen());
    
    try {
      const move = gameCopy.move({
        from: source,
        to: target,
        promotion: piecePromotion, 
      });

      if (move === null) return false;

      setGame(gameCopy);
      setFen(gameCopy.fen());
      setSourceSquare(null);
      setOptionSquares({});
      setMoveSquares({
        [source]: { backgroundColor: "rgba(255, 255, 0, 0.4)" },
        [target]: { backgroundColor: "rgba(255, 255, 0, 0.4)" }
      });
      updateGameStatus(gameCopy);

      if (channel && matchId) {
        channel.send({
          type: "broadcast",
          event: "board_update",
          payload: { fen: gameCopy.fen(), lastMove: { from: source, to: target } },
        });
      }
      return true;
    } catch (e) {
      return false; 
    }
  };

  const onSquareClick = (square: string) => {
    const sq = square as Square;

    if (sourceSquare && (optionSquares as any)[sq]) {
      executeMove(sourceSquare, sq, "q");
      return;
    }

    const piece = game.get(sq);
    const isMyTurn = matchId ? ((playerColor === "white" && game.turn() === "w") || (playerColor === "black" && game.turn() === "b")) : true;

    if (piece && piece.color === game.turn() && isMyTurn) {
      setSourceSquare(sq);
      getMoveOptions(sq);
    } else {
      setSourceSquare(null);
      setOptionSquares({});
    }
  };

  const onDrop = (args: any, ...rest: any[]) => {
    const sourceSquare = (args?.sourceSquare || args) as Square;
    const targetSquare = (args?.targetSquare || rest[0]) as Square;
    const piece = args?.piece || rest[1];
    
    if (matchId) {
      const currentTurn = game.turn();
      const isMyTurn = (playerColor === "white" && currentTurn === "w") || (playerColor === "black" && currentTurn === "b");
      if (!isMyTurn) return false;
    }

    const promotion = piece && typeof piece === 'string' ? piece[1].toLowerCase() : "q";
    return executeMove(sourceSquare, targetSquare, promotion);
  };

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setStatus("White to move");
    setMoveSquares({});
    setOptionSquares({});
    
    if (channel && matchId) {
      channel.send({
        type: "broadcast",
        event: "board_update",
        payload: { fen: newGame.fen(), lastMove: { from: null, to: null } },
      });
    }
  };

  const handleSendReaction = (emoji: string) => {
    setShowReactionMenu(false);
    setMyReaction(emoji);
    setTimeout(() => setMyReaction(null), 3500);

    if (channel && matchId) {
      channel.send({
        type: "broadcast",
        event: "reaction",
        payload: { emoji },
      });
    }
  };

  // ============================================================================
  // ARENA LOBBY FUNCTIONS
  // ============================================================================
  const handleHostNetworkMatch = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMatchId(code);
    setView("host");
  };

  const handleJoinNetworkMatch = () => {
    if (joinInput.trim().length >= 4) {
      setMatchId(joinInput.trim().toUpperCase());
      setView("play");
    }
  };

  const handleCopyCode = () => {
    if (matchId) {
      navigator.clipboard.writeText(matchId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ============================================================================
  // VIEW 1: ARENA MENU
  // ============================================================================
  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white px-6">
        <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col items-center relative overflow-hidden">
          
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 border border-indigo-500/20 shadow-inner">
            <span className="material-symbols-outlined text-3xl text-indigo-400">psychology</span>
          </div>
          
          <h1 className="font-headline font-black text-2xl tracking-tight mb-1">Chess Arena</h1>
          <p className="font-caps text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-8 uppercase">Select Engagement Mode</p>

          <div className="w-full space-y-3">
            <button 
              onClick={handleHostNetworkMatch}
              className="w-full bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg">language</span>
                <span className="font-headline font-bold text-sm tracking-wide">HOST NETWORK MATCH</span>
              </div>
              <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </button>

            <button 
              onClick={() => { setMatchId(null); setView("play"); }}
              className="w-full bg-white/5 hover:bg-white/10 text-white rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-95 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-neutral-400">group</span>
                <span className="font-headline font-bold text-sm tracking-wide text-neutral-200">LOCAL PASS & PLAY</span>
              </div>
              <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </button>
          </div>

          <div className="w-full flex items-center gap-4 my-6 opacity-40">
            <div className="flex-1 h-px bg-white/20"></div>
            <span className="font-caps text-[9px] font-bold tracking-widest uppercase">Or Join Room</span>
            <div className="flex-1 h-px bg-white/20"></div>
          </div>

          <div className="w-full flex gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5">
            <input 
              type="text" 
              placeholder="CODE" 
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              className="flex-1 bg-transparent border-none text-center font-headline font-bold tracking-widest text-white placeholder-neutral-600 focus:outline-none uppercase"
              maxLength={8}
            />
            <button 
              onClick={handleJoinNetworkMatch}
              disabled={joinInput.length < 4}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-headline font-bold text-xs tracking-wider transition-all"
            >
              JOIN
            </button>
          </div>

          <button onClick={onClose} className="mt-8 flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-caps text-[10px] font-bold tracking-widest">
            <span className="material-symbols-outlined text-sm">logout</span>
            EXIT ARENA
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: HOST WAITING LOBBY
  // ============================================================================
  if (view === "host") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-body text-white">
        <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={() => { setView("menu"); setMatchId(null); }} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="text-center">
            <h2 className="font-headline font-black text-sm uppercase tracking-widest">Chess Matrix</h2>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="font-caps text-[9px] font-bold tracking-widest text-indigo-400">CONNECTING...</span>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400">
            <span className="material-symbols-outlined text-lg">face</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-8 shadow-2xl border border-white/5 flex flex-col items-center text-center">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h3 className="font-headline font-black text-xl tracking-tight mb-8">AWAITING OPPONENT</h3>
            <p className="font-caps text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-3 uppercase">Share This Room Code</p>
            <div className="w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-2 pl-6 mb-6">
              <span className="font-headline font-bold text-2xl tracking-[0.3em] text-indigo-300">{matchId}</span>
              <button onClick={handleCopyCode} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition-colors text-xs font-bold tracking-wider">
                <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
            <button onClick={() => { setView("menu"); setMatchId(null); }} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-2xl py-4 font-headline font-bold text-sm tracking-wide transition-all border border-white/5">
              CANCEL MATCH
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: LIVE PREMIUM BOARD
  // ============================================================================
  return (
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white">
      
      <div className="w-full max-w-[400px] flex items-start justify-between px-4 pt-safe absolute top-0 mt-4 z-10">
        <button onClick={() => matchId ? setView("menu") : onClose()} className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex flex-col items-center">
          <h2 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-indigo-400">
            {matchId ? "Live Arena" : "Local Play"}
          </h2>
          <span className="font-caps text-[9px] font-bold text-neutral-500 uppercase tracking-widest mt-0.5">{status}</span>
        </div>
        <button onClick={resetGame} className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
          <span className="material-symbols-outlined text-white">restart_alt</span>
        </button>
      </div>

      <div className="w-full max-w-[400px] flex flex-col gap-4 px-4 w-full">
        
        <div className="w-full bg-[#18181b] border border-white/5 rounded-2xl p-3 flex items-center justify-between relative shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
               <span className="material-symbols-outlined text-neutral-400">{matchId ? "person" : "robot_2"}</span>
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold">{matchId ? "Opponent" : "Player 2"}</h3>
              <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-500">
                {matchId ? (playerColor === "white" ? "Playing Black" : "Playing White") : "Local Co-op"}
              </p>
            </div>
          </div>
          
          {oppReaction && (
            <div className="absolute right-4 -bottom-4 z-20 animate-fade-in">
              <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-3 py-1.5 text-2xl animate-bounce">
                {oppReaction}
              </div>
            </div>
          )}
        </div>

        <div className="w-full p-2 bg-[#18181b] rounded-[24px] shadow-2xl border border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-indigo-500/5 blur-2xl"></div> 
          
          <div className="relative rounded-[16px] overflow-hidden border border-white/5">
            <Chessboard 
              options={{
                position: fen,
                onPieceDrop: onDrop,
                onSquareClick: onSquareClick,
                onPieceDragBegin: (args: any) => {
                  const square = (args?.sourceSquare || args?.square || args) as Square;
                  if (typeof square === 'string') {
                    setSourceSquare(square);
                    getMoveOptions(square);
                  }
                },
                boardOrientation: playerColor,
                customDarkSquareStyle: { backgroundColor: "#312e81" }, 
                customLightSquareStyle: { backgroundColor: "#c7d2fe" }, 
                customSquareStyles: {
                  ...moveSquares,
                  ...optionSquares,
                }
              } as any}
            />
          </div>
        </div>

        <div className="w-full bg-[#18181b] border border-white/5 rounded-2xl p-3 flex items-center justify-between relative shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
               <span className="material-symbols-outlined text-indigo-400">face</span>
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold">You</h3>
              <p className="text-[10px] font-bold tracking-widest uppercase text-indigo-400">
                 {matchId ? `Playing ${playerColor === "white" ? "White" : "Black"}` : "Player 1"}
              </p>
            </div>
          </div>

          {matchId && (
            <button 
              onClick={() => setShowReactionMenu(!showReactionMenu)}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center text-neutral-400 hover:text-white relative"
            >
              <span className="material-symbols-outlined text-lg">add_reaction</span>
              
              {myReaction && (
                <div className="absolute -top-12 right-0 z-20 animate-fade-in pointer-events-none">
                  <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-3 py-1.5 text-2xl animate-bounce">
                    {myReaction}
                  </div>
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {showReactionMenu && (
        <div className="absolute bottom-[110px] right-6 z-50 animate-fade-in">
          <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-2 flex gap-1">
            {["🔥", "🤯", "🥶", "😂", "😡"].map((emoji) => (
              <button 
                key={emoji} 
                onClick={() => handleSendReaction(emoji)}
                className="w-10 h-10 text-2xl hover:bg-white/10 rounded-xl transition-all hover:scale-110 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}