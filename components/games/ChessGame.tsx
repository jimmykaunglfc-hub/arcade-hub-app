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
  // 🎮 LOBBY & VIEW STATES
  // Auto-skip to 'play' if launched from a chat invite
  const [view, setView] = useState<"menu" | "host" | "play">(preloadedMatchId ? "play" : "menu");
  const [matchId, setMatchId] = useState<string | null>(preloadedMatchId || null);
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);

  // ♟️ CHESS ENGINE STATES
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [status, setStatus] = useState("White to move");
  
  // 🌐 ONLINE MULTIPLAYER STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 1. Fetch Local User Session (For Online Identity)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setMyUserId(session.user.id);
      }
    });
  }, []);

  // 2. Initialize Multiplayer Sync & Presence (Triggers when Match ID exists)
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
        updateGameStatus(updatedGame);
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

  // 4. Handle Game Status (Check, Checkmate, Draw)
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

  // 5. Piece Drop Handler with Network Rules
  const onDrop = (args: any, ...rest: any[]) => {
    const sourceSquare = args?.sourceSquare || args;
    const targetSquare = args?.targetSquare || rest[0];
    const piece = args?.piece || rest[1];

    if (matchId) {
      if (!opponentConnected) return false;
      const currentTurn = game.turn();
      const isMyTurn = (playerColor === "white" && currentTurn === "w") || (playerColor === "black" && currentTurn === "b");
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

      setGame(gameCopy);
      setFen(gameCopy.fen());
      updateGameStatus(gameCopy);

      if (channel && matchId) {
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

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setStatus("White to move");
    if (channel && matchId) {
      channel.send({
        type: "broadcast",
        event: "board_update",
        payload: { fen: newGame.fen() },
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

  const handleLocalPassAndPlay = () => {
    setMatchId(null);
    setView("play");
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
              onClick={handleLocalPassAndPlay}
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
        {/* Header */}
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

        {/* Core Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-8 shadow-2xl border border-white/5 flex flex-col items-center text-center">
            
            {/* Custom Spinner */}
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
  // VIEW 3: LIVE BOARD
  // ============================================================================
  return (
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white">
      {/* Top Action Bar */}
      <div className="w-full max-w-[400px] flex justify-between items-center px-4 mb-8">
        <button 
          onClick={() => matchId ? setView("menu") : onClose()} 
          className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="text-center">
          <h2 className="font-headline font-bold text-xl uppercase tracking-widest text-indigo-400">
            {matchId ? "Live Match" : "Local Pass & Play"}
          </h2>
          <p className="text-sm text-neutral-400 font-bold">{status}</p>
          
          {matchId && (
            <p className={`text-xs mt-1 font-bold tracking-wide uppercase ${opponentConnected ? "text-emerald-400" : "text-amber-400 animate-pulse"}`}>
              {opponentConnected ? `Playing as ${playerColor}` : "Waiting for opponent..."}
            </p>
          )}
        </div>
        <button 
          onClick={resetGame} 
          className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10"
        >
          <span className="material-symbols-outlined">restart_alt</span>
        </button>
      </div>

      {/* Board Container */}
      <div className="w-full max-w-[400px] p-4 bg-white/5 rounded-3xl shadow-2xl border border-white/10">
        <Chessboard 
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