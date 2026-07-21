"use client";

import { useState, useEffect, useMemo } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../../lib/supabaseClient";

interface ChessGameProps {
  onClose: () => void;
  preloadedMatchId?: string | null;
}

// 🛡️ Helper to map pieces to Unicode symbols for the graveyard
const PIECE_SYMBOLS: Record<string, string> = {
  p: "♙", n: "♘", b: "♗", r: "♖", q: "♕",
  P: "♟", N: "♞", B: "♝", R: "♜", Q: "♛"
};

export default function ChessGame({ onClose, preloadedMatchId }: ChessGameProps) {
  // 🎮 VIEW STATES
  const [view, setView] = useState<"menu" | "host" | "play">(preloadedMatchId ? "play" : "menu");
  const [matchId, setMatchId] = useState<string | null>(preloadedMatchId || null);
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);

  // ♟️ ENGINE STATES
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [isCheck, setIsCheck] = useState(false);
  const [gameOver, setGameOver] = useState<{ isOver: boolean; winner: string | null; reason: string }>({ isOver: false, winner: null, reason: "" });
  
  // 🎨 UI & HIGHLIGHT STATES
  const [moveSquares, setMoveSquares] = useState({});
  const [optionSquares, setOptionSquares] = useState({});
  const [sourceSquare, setSourceSquare] = useState<Square | null>(null);

  // 🌐 MULTIPLAYER STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 🎭 REACTIONS
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [oppReaction, setOppReaction] = useState<string | null>(null);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  // 1. Init Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setMyUserId(session.user.id);
    });
  }, []);

  // 2. Network Sync
  useEffect(() => {
    if (!matchId || !myUserId) return;

    const matchChannel = supabase.channel(`chess_match_${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
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
        setOpponentConnected(users.length > 1);
        if (users.length > 0) {
          setPlayerColor(users.sort()[0] === myUserId ? "white" : "black");
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await matchChannel.track({ online_at: new Date().toISOString() });
      });

    setChannel(matchChannel);
    return () => { matchChannel.untrack(); supabase.removeChannel(matchChannel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, myUserId]);

  useEffect(() => { if (view === "host" && opponentConnected) setView("play"); }, [opponentConnected, view]);

  // 3. Status & Game Over Logic
  const updateGameStatus = (currentGame: Chess) => {
    setIsCheck(currentGame.isCheck());
    
    if (currentGame.isGameOver()) {
      let reason = "Game Over";
      let winner = null;

      if (currentGame.isCheckmate()) {
        winner = currentGame.turn() === "w" ? "Black" : "White";
        reason = "by Checkmate";
      } else if (currentGame.isDraw()) {
        reason = "by Draw";
      } else if (currentGame.isStalemate()) {
        reason = "by Stalemate";
      }

      setGameOver({ isOver: true, winner, reason });
    } else {
      setGameOver({ isOver: false, winner: null, reason: "" });
    }
  };

  // 4. Calculate Captured Pieces (The Graveyard)
  const capturedPieces = useMemo(() => {
    const counts = { w: { p:0, n:0, b:0, r:0, q:0 }, b: { p:0, n:0, b:0, r:0, q:0 } };
    game.board().forEach(row => row.forEach(piece => {
      if (piece) counts[piece.color][piece.type as keyof typeof counts.w]++;
    }));
    
    const starting = { p:8, n:2, b:2, r:2, q:1 };
    const wCaptured = []; // White pieces captured by Black
    const bCaptured = []; // Black pieces captured by White

    for (const type of ['q', 'r', 'b', 'n', 'p'] as const) {
      for (let i = 0; i < starting[type] - counts.w[type]; i++) wCaptured.push(PIECE_SYMBOLS[type.toUpperCase()]);
      for (let i = 0; i < starting[type] - counts.b[type]; i++) bCaptured.push(PIECE_SYMBOLS[type]);
    }
    return { wCaptured, bCaptured };
  }, [fen]);

  // 5. Highlight Move Options (Target Dots)
  const getMoveOptions = (square: Square) => {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.forEach((move) => {
      const targetSquare = move.to as Square;
      // Is it a capture?
      if (game.get(targetSquare)) {
        newSquares[targetSquare] = {
          background: "radial-gradient(circle, rgba(239, 68, 68, 0.8) 25%, transparent 25%)",
          borderRadius: "50%",
        };
      } else {
        newSquares[targetSquare] = {
          background: "radial-gradient(circle, rgba(255, 255, 255, 0.35) 20%, transparent 20%)",
          borderRadius: "50%",
        };
      }
    });
    
    newSquares[square] = { background: "rgba(99, 102, 241, 0.5)" }; // Source highlight
    setOptionSquares(newSquares);
    return true;
  };

  // 6. Execution Logic
  const executeMove = (source: Square, target: Square, piecePromotion: string = "q") => {
    if (gameOver.isOver || (matchId && !opponentConnected)) return false;
    
    const gameCopy = new Chess(game.fen());
    
    try {
      const move = gameCopy.move({ from: source, to: target, promotion: piecePromotion });
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
    if (gameOver.isOver) return;
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
    if (gameOver.isOver) return false;
    const sourceSquare = (args?.sourceSquare || args) as Square;
    const targetSquare = (args?.targetSquare || rest[0]) as Square;
    const piece = args?.piece || rest[1];
    
    if (matchId) {
      const isMyTurn = (playerColor === "white" && game.turn() === "w") || (playerColor === "black" && game.turn() === "b");
      if (!isMyTurn) return false;
    }

    const promotion = piece && typeof piece === 'string' ? piece[1].toLowerCase() : "q";
    return executeMove(sourceSquare, targetSquare, promotion);
  };

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setIsCheck(false);
    setGameOver({ isOver: false, winner: null, reason: "" });
    setMoveSquares({});
    setOptionSquares({});
    
    if (channel && matchId) {
      channel.send({ type: "broadcast", event: "board_update", payload: { fen: newGame.fen(), lastMove: { from: null, to: null } } });
    }
  };

  const handleSendReaction = (emoji: string) => {
    setShowReactionMenu(false);
    setMyReaction(emoji);
    setTimeout(() => setMyReaction(null), 3500);
    if (channel && matchId) channel.send({ type: "broadcast", event: "reaction", payload: { emoji } });
  };

  // Turn detection for neon borders
  const currentTurnColor = game.turn() === "w" ? "white" : "black";
  const myTurnActive = matchId ? playerColor === currentTurnColor : true;
  const oppTurnActive = matchId ? playerColor !== currentTurnColor : true;

  // King Check Highlighting Logic
  const checkSquares: any = {};
  if (isCheck) {
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === game.turn()) {
          const file = String.fromCharCode(97 + c);
          const rank = 8 - r;
          checkSquares[`${file}${rank}`] = { 
            background: "radial-gradient(circle, rgba(255, 0, 0, 0.8) 0%, rgba(255, 0, 0, 0.4) 100%)",
            boxShadow: "inset 0 0 15px rgba(255, 0, 0, 0.8)"
          };
        }
      }
    }
  }

  // ============================================================================
  // MENUS
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
            <button onClick={() => { setMatchId(Math.random().toString(36).substring(2, 8).toUpperCase()); setView("host"); }} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
              <div className="flex items-center gap-3"><span className="material-symbols-outlined text-lg">language</span><span className="font-headline font-bold text-sm tracking-wide">HOST NETWORK MATCH</span></div>
              <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </button>
            <button onClick={() => { setMatchId(null); setView("play"); }} className="w-full bg-white/5 hover:bg-white/10 text-white rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-95 border border-white/5">
              <div className="flex items-center gap-3"><span className="material-symbols-outlined text-lg text-neutral-400">group</span><span className="font-headline font-bold text-sm tracking-wide text-neutral-200">LOCAL PASS & PLAY</span></div>
              <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </button>
          </div>
          <div className="w-full flex items-center gap-4 my-6 opacity-40">
            <div className="flex-1 h-px bg-white/20"></div><span className="font-caps text-[9px] font-bold tracking-widest uppercase">Or Join Room</span><div className="flex-1 h-px bg-white/20"></div>
          </div>
          <div className="w-full flex gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5">
            <input type="text" placeholder="CODE" value={joinInput} onChange={(e) => setJoinInput(e.target.value)} className="flex-1 bg-transparent border-none text-center font-headline font-bold tracking-widest text-white placeholder-neutral-600 focus:outline-none uppercase" maxLength={8} />
            <button onClick={() => { if(joinInput.length >= 4) { setMatchId(joinInput.trim().toUpperCase()); setView("play"); } }} disabled={joinInput.length < 4} className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-headline font-bold text-xs tracking-wider transition-all">JOIN</button>
          </div>
          <button onClick={onClose} className="mt-8 flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-caps text-[10px] font-bold tracking-widest">
            <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
          </button>
        </div>
      </div>
    );
  }

  if (view === "host") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-body text-white">
        <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={() => { setView("menu"); setMatchId(null); }} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"><span className="material-symbols-outlined text-lg">close</span></button>
          <div className="text-center">
            <h2 className="font-headline font-black text-sm uppercase tracking-widest">Chess Matrix</h2>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span><span className="font-caps text-[9px] font-bold tracking-widest text-indigo-400">CONNECTING...</span>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400"><span className="material-symbols-outlined text-lg">face</span></button>
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
              <button onClick={() => { navigator.clipboard.writeText(matchId!); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition-colors text-xs font-bold tracking-wider"><span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>{copied ? "COPIED" : "COPY"}</button>
            </div>
            <button onClick={() => { setView("menu"); setMatchId(null); }} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-2xl py-4 font-headline font-bold text-sm tracking-wide transition-all border border-white/5">CANCEL MATCH</button>
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
      
      {/* 🏆 GAME OVER MODAL OVERLAY */}
      {gameOver.isOver && (
        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-[340px] bg-[#18181b] border border-white/10 rounded-[32px] p-8 flex flex-col items-center text-center shadow-2xl">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20">
              <span className="material-symbols-outlined text-4xl text-white">
                {gameOver.winner ? "emoji_events" : "handshake"}
              </span>
            </div>
            <h2 className="font-headline font-black text-3xl mb-1 uppercase tracking-tight">
              {gameOver.winner ? `${gameOver.winner} Wins!` : "It's a Draw!"}
            </h2>
            <p className="font-caps text-[10px] font-bold text-neutral-400 tracking-[0.2em] uppercase mb-8">
              {gameOver.reason}
            </p>
            
            <button onClick={resetGame} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl py-4 font-headline font-bold text-sm tracking-widest shadow-lg shadow-indigo-500/20 transition-transform active:scale-95 mb-3">
              PLAY AGAIN
            </button>
            <button onClick={() => matchId ? setView("menu") : onClose()} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl py-4 font-headline font-bold text-sm tracking-widest border border-white/5 transition-colors">
              EXIT ARENA
            </button>
          </div>
        </div>
      )}

      {/* HEADER TOP BAR */}
      <div className="w-full max-w-[400px] flex items-start justify-between px-4 pt-safe absolute top-0 mt-4 z-10">
        <button onClick={() => matchId ? setView("menu") : onClose()} className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex flex-col items-center">
          <h2 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-indigo-400">
            {matchId ? "Live Arena" : "Local Play"}
          </h2>
          <span className={`font-caps text-[9px] font-bold uppercase tracking-widest mt-0.5 ${isCheck ? "text-red-400 animate-pulse" : "text-neutral-500"}`}>
            {isCheck ? "⚠️ CHECK ⚠️" : `${currentTurnColor} to move`}
          </span>
        </div>
        <button onClick={resetGame} className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
          <span className="material-symbols-outlined text-white">restart_alt</span>
        </button>
      </div>

      <div className="w-full max-w-[400px] flex flex-col gap-4 px-4 w-full pt-10">
        
        {/* OPPONENT INFO PLATE (Top) */}
        <div className={`w-full bg-[#18181b] border rounded-2xl p-3 flex flex-col relative transition-all duration-300 shadow-lg ${
          (matchId && !oppTurnActive) || (!matchId && currentTurnColor === "white") 
            ? "border-white/5" 
            : "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
        }`}>
          <div className="flex items-center justify-between">
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
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-3 py-1.5 text-2xl animate-bounce">{oppReaction}</div>
              </div>
            )}
          </div>
          
          {/* Opponent Graveyard */}
          <div className="w-full flex flex-wrap gap-1 mt-2 min-h-[20px] text-lg opacity-70 px-1">
            {(matchId ? (playerColor === "white" ? capturedPieces.wCaptured : capturedPieces.bCaptured) : capturedPieces.wCaptured).map((p, i) => (
              <span key={i} className="leading-none text-white">{p}</span>
            ))}
          </div>
        </div>

        {/* CHESS BOARD WRAPPER */}
        <div className="w-full p-2 bg-[#18181b] rounded-[24px] shadow-2xl border border-white/10 relative overflow-hidden pointer-events-auto">
          <div className="absolute inset-0 bg-indigo-500/5 blur-2xl"></div> 
          
          <div className="relative rounded-[16px] overflow-hidden border border-white/5">
            <Chessboard 
              options={{
                position: fen,
                onPieceDrop: onDrop,
                onSquareClick: onSquareClick,
                onPieceDragBegin: (args: any) => {
                  if (gameOver.isOver) return;
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
                  ...checkSquares // Injects red glow if King is in check!
                }
              } as any}
            />
          </div>
        </div>

        {/* PLAYER INFO PLATE (Bottom) */}
        <div className={`w-full bg-[#18181b] border rounded-2xl p-3 flex flex-col relative transition-all duration-300 shadow-lg ${
          myTurnActive 
            ? "border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]" 
            : "border-white/5"
        }`}>
          <div className="flex items-center justify-between">
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
              <button onClick={() => setShowReactionMenu(!showReactionMenu)} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center text-neutral-400 hover:text-white relative">
                <span className="material-symbols-outlined text-lg">add_reaction</span>
                {myReaction && (
                  <div className="absolute -top-12 right-0 z-20 animate-fade-in pointer-events-none">
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-3 py-1.5 text-2xl animate-bounce">{myReaction}</div>
                  </div>
                )}
              </button>
            )}
          </div>
          
          {/* Player Graveyard */}
          <div className="w-full flex flex-wrap gap-1 mt-2 min-h-[20px] text-lg opacity-70 px-1">
            {(matchId ? (playerColor === "white" ? capturedPieces.bCaptured : capturedPieces.wCaptured) : capturedPieces.bCaptured).map((p, i) => (
              <span key={i} className="leading-none text-white">{p}</span>
            ))}
          </div>
        </div>
      </div>

      {showReactionMenu && (
        <div className="absolute bottom-[130px] right-6 z-50 animate-fade-in">
          <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-2 flex gap-1">
            {["🔥", "🤯", "🥶", "😂", "😡"].map((emoji) => (
              <button key={emoji} onClick={() => handleSendReaction(emoji)} className="w-10 h-10 text-2xl hover:bg-white/10 rounded-xl transition-all hover:scale-110 active:scale-90">{emoji}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}