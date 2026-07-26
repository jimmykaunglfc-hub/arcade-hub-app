"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Chess, Square } from "chess.js";
import { supabase } from "../../lib/supabaseClient";
import { soundEngine } from "../../lib/soundManager";
import { storeManager } from "../../lib/storeManager";

// 👇 Import the Bot Utility
import { getRandomBotOpponent } from "../../lib/botUtils";

interface ChessGameProps {
  onClose: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

// ♟️ HIGH-DEFINITION LICHESS CDN VECTORS (CORS-Safe, 100% Reliable Asset Delivery)
const PIECE_SVGS: Record<string, string> = {
  wp: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wP.svg",
  wn: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wN.svg",
  wb: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wB.svg",
  wr: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wR.svg",
  wq: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wQ.svg",
  wk: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/wK.svg",
  bp: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/bP.svg",
  bn: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/bN.svg",
  bb: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/bB.svg",
  br: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/bR.svg",
  bq: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/bQ.svg",
  bk: "https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/cburnett/bK.svg",
};

const PIECE_SYMBOLS: Record<string, string> = {
  p: "♙", n: "♘", b: "♗", r: "♖", q: "♕",
  P: "♟", N: "♞", B: "♝", R: "♜", Q: "♛",
};

export default function ChessGame({ onClose, preloadedMatchId, opponent }: ChessGameProps) {
  const boardRef = useRef<HTMLDivElement>(null);

  // 🛍️ STORE COSMETICS ENGINE SYNC
  const equippedBoard = storeManager.getEquippedCosmetic("chess");
  const isObsidianBoard = equippedBoard === "obsidian_board";

  // 1. Detect bot mode synchronously
  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  // 2. Initialize view and matchId immediately based on bot detection
  const [view, setView] = useState<"menu" | "host" | "play" | "searching" | "confirmed">(
    isBotMode || preloadedMatchId ? "play" : "menu"
  );
  
  // State to store generated bot profile
  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);

  const [matchId, setMatchId] = useState<string | null>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : null)
  );
  
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ♟️ CHESS ENGINE STATES
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [isCheck, setIsCheck] = useState(false);
  const [gameOver, setGameOver] = useState<{
    isOver: boolean;
    winner: string | null;
    reason: string;
  }>({ isOver: false, winner: null, reason: "" });

  // 🎨 SELECTION & HIGHLIGHT STATES
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  // 🤏 DRAG STATE
  const [dragSquare, setDragSquare] = useState<Square | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  // 🌐 MULTIPLAYER STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 🎭 REACTIONS
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [oppReaction, setOppReaction] = useState<string | null>(null);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setMyUserId(session.user.id);
    });
  }, []);

  // 🤝 SAFE RULE PARSER & BOT HANDLER
  useEffect(() => {
    if (isBotMode && localOpponent?.name) {
      showToast(`Playing against ${localOpponent.name}`);
    }
  }, [isBotMode, localOpponent]);

  // 📡 Supabase Sync (Only active for human network matches)
  useEffect(() => {
    if (!matchId || !myUserId || localOpponent?.isBot || view === "searching" || view === "confirmed") return;

    const matchChannel = supabase.channel(`chess_match_${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
    });

    matchChannel
      .on("broadcast", { event: "board_update" }, (payload) => {
        const updatedGame = new Chess(payload.payload.fen);
        setGame(updatedGame);
        setFen(updatedGame.fen());
        setLastMove(payload.payload.lastMove);
        updateGameStatus(updatedGame);

        if (updatedGame.isCheckmate()) {
          const isWinner = (playerColor === "white" && updatedGame.turn() === "b") || (playerColor === "black" && updatedGame.turn() === "w");
          soundEngine.playSFX(isWinner ? "victory" : "defeat");
        } else {
          soundEngine.playSFX("move");
        }
      })
      .on("broadcast", { event: "reaction" }, (payload) => {
        soundEngine.playSFX("beep");
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
  }, [matchId, myUserId, localOpponent, view, playerColor]);

  // 🤖 LOCAL JOE YOKE BOT ENGINE (Greedy Logic)
  useEffect(() => {
    const isBotMatch = localOpponent?.isBot || opponent?.isBot || matchId?.startsWith("bot_");
    
    // The Bot acts when it is Black's turn and the game isn't over
    if (isBotMatch && view === "play" && game.turn() === "b" && !gameOver.isOver) {
      
      const thinkingDelay = Math.floor(Math.random() * 2000) + 1500;
      
      const botTimer = setTimeout(() => {
        const moves = game.moves({ verbose: true });
        if (moves.length === 0) return;

        // Simple Greedy AI: Prioritize captures to mimic an aggressive bot
        const captures = moves.filter(m => m.captured);
        const moveList = captures.length > 0 ? captures : moves;
        
        // Add random element for unpredictability
        const randomMove = moveList[Math.floor(Math.random() * moveList.length)];

        makeMove(randomMove.from as Square, randomMove.to as Square);
        
        // 25% chance the bot reacts with an emote after playing
        if (Math.random() <= 0.25) {
          const reactionDelay = Math.floor(Math.random() * 1000) + 800;
          setTimeout(() => {
            const EMOJIS = ["🔥", "🤯", "🥶", "😂", "😡"];
            const randomEmote = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            soundEngine.playSFX("beep");
            setOppReaction(randomEmote);
            setTimeout(() => setOppReaction(null), 3500);
          }, reactionDelay);
        }

      }, thinkingDelay);

      return () => clearTimeout(botTimer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, game, gameOver, opponent, localOpponent, view, matchId]);

  useEffect(() => {
    if (view === "host" && opponentConnected) setView("play");
  }, [opponentConnected, view]);

  const updateGameStatus = (currentGame: Chess) => {
    setIsCheck(currentGame.isCheck());
    if (currentGame.isGameOver()) {
      let reason = "Game Over";
      let winner = null;
      if (currentGame.isCheckmate()) {
        winner = currentGame.turn() === "w" ? "Black" : "White";
        reason = "by Checkmate";
      } else if (currentGame.isDraw()) reason = "by Draw";
      else if (currentGame.isStalemate()) reason = "by Stalemate";
      setGameOver({ isOver: true, winner, reason });
    } else {
      setGameOver({ isOver: false, winner: null, reason: "" });
    }
  };

  const capturedPieces = useMemo(() => {
    const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    game.board().forEach((row) =>
      row.forEach((piece) => {
        if (piece) counts[piece.color][piece.type as keyof typeof counts.w]++;
      })
    );

    const starting = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const wCaptured = [];
    const bCaptured = [];

    for (const type of ["q", "r", "b", "n", "p"] as const) {
      for (let i = 0; i < starting[type] - counts.w[type]; i++) wCaptured.push(PIECE_SYMBOLS[type.toUpperCase()]);
      for (let i = 0; i < starting[type] - counts.b[type]; i++) bCaptured.push(PIECE_SYMBOLS[type]);
    }
    return { wCaptured, bCaptured };
  }, [fen, game]);

  const currentTurnColor = game.turn() === "w" ? "white" : "black";
  
  const isBotMatchNow = localOpponent?.isBot || opponent?.isBot || matchId?.startsWith("bot_");
  const displayOrientation = matchId && !isBotMatchNow ? playerColor : "white";

  // Execute Move Engine
  const makeMove = (source: Square, target: Square): boolean => {
    if (gameOver.isOver) return false;
    
    const isBotMatch = localOpponent?.isBot || opponent?.isBot || matchId?.startsWith("bot_");

    if (matchId && !isBotMatch && !opponentConnected) {
      showToast("Waiting for opponent to connect!");
      return false;
    }

    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;

      // Play appropriate sound effect based on move result
      if (gameCopy.isCheckmate()) {
        const isWinner = matchId && !isBotMatch
          ? (playerColor === "white" && gameCopy.turn() === "b") || (playerColor === "black" && gameCopy.turn() === "w")
          : gameCopy.turn() === "b";
        soundEngine.playSFX(isWinner ? "victory" : "defeat");
      } else if (move.captured) {
        soundEngine.playSFX("capture");
      } else {
        soundEngine.playSFX("move");
      }

      setGame(gameCopy);
      setFen(gameCopy.fen());
      setSelectedSquare(null);
      setLegalMoves([]);
      setLastMove({ from: source, to: target });
      updateGameStatus(gameCopy);

      if (channel && matchId && !isBotMatch) {
        channel.send({
          type: "broadcast",
          event: "board_update",
          payload: { fen: gameCopy.fen(), lastMove: { from: source, to: target } },
        });
      }
      return true;
    } catch {
      return false;
    }
  };

  const getSquareFromCoords = (clientX: number, clientY: number): Square | null => {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

    const colIndex = Math.floor((x / rect.width) * 8);
    const rowIndex = Math.floor((y / rect.height) * 8);

    const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

    const file = displayOrientation === "white" ? files[colIndex] : files[7 - colIndex];
    const rank = displayOrientation === "white" ? ranks[rowIndex] : ranks[7 - rowIndex];

    return `${file}${rank}` as Square;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (gameOver.isOver) return;
    const sq = getSquareFromCoords(e.clientX, e.clientY);
    if (!sq) return;

    const isBotMatch = localOpponent?.isBot || opponent?.isBot || matchId?.startsWith("bot_");
    const isMyTurn = matchId
      ? isBotMatch
        ? game.turn() === "w" 
        : (playerColor === "white" && game.turn() === "w") || (playerColor === "black" && game.turn() === "b")
      : true;

    if (selectedSquare && legalMoves.includes(sq)) {
      makeMove(selectedSquare, sq);
      return;
    }

    const piece = game.get(sq);
    if (piece && piece.color === game.turn() && isMyTurn) {
      soundEngine.playSFX("click");
      setSelectedSquare(sq);
      const moves = game.moves({ square: sq, verbose: true }).map((m) => m.to as Square);
      setLegalMoves(moves);

      setDragSquare(sq);
      setDragPos({ x: e.clientX, y: e.clientY });
    } else {
      setSelectedSquare(null);
      setLegalMoves([]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragSquare) {
      setDragPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragSquare) {
      const targetSq = getSquareFromCoords(e.clientX, e.clientY);
      if (targetSq && targetSq !== dragSquare && legalMoves.includes(targetSq)) {
        makeMove(dragSquare, targetSq);
      }
      setDragSquare(null);
      setDragPos(null);
    }
  };

  const resetGame = () => {
    soundEngine.playSFX("click");
    const newGame = new Chess();
    setGame(newGame);
    setFen(newGame.fen());
    setIsCheck(false);
    setGameOver({ isOver: false, winner: null, reason: "" });
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
    if (channel && matchId && !localOpponent?.isBot && !opponent?.isBot && !matchId?.startsWith("bot_")) {
      channel.send({
        type: "broadcast",
        event: "board_update",
        payload: { fen: newGame.fen(), lastMove: { from: null, to: null } },
      });
    }
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (matchId) setMatchId(null);
    setView("menu");
  };

  const startOnlineMatchmaking = () => {
    soundEngine.playSFX("click");
    setView("searching");
    setTimeout(() => {
      setView(prev => {
        if (prev === "searching") {
          setLocalOpponent(getRandomBotOpponent());
          return "confirmed";
        }
        return prev;
      });
    }, 2800);
  };

  const enterBotMatch = () => {
    soundEngine.playSFX("click");
    setMatchId(`bot_match_${Date.now()}`);
    setPlayerColor("white");
    setView("play");
    showToast(`Playing against ${localOpponent?.name || 'Bot'}`);
  };

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

  const boardFiles = displayOrientation === "white" ? files : [...files].reverse();
  const boardRanks = displayOrientation === "white" ? ranks : [...ranks].reverse();

  // LOBBY MENU
  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white px-6 animate-fade-in">
        <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
          
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-2xl text-neutral-300">workspace_premium</span>
            </div>
            <div>
              <h1 className="font-headline font-black text-xl tracking-tight text-white">Chess Arena</h1>
              <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
            </div>
          </div>

          <button onClick={startOnlineMatchmaking} className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-[#CCFF00]/10 rounded-xl flex items-center justify-center text-[#CCFF00]">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="bg-[#CCFF00]/10 text-[#CCFF00] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Popular</span>
                <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                  <span className="material-symbols-outlined text-sm font-black">arrow_forward</span>
                </div>
              </div>
            </div>
            <h3 className="font-headline font-black text-lg text-white mb-1 group-hover:text-[#CCFF00] transition-colors">Find Online Match</h3>
            <p className="text-xs text-neutral-400 font-medium leading-relaxed">Ranked & casual global<br/>matchmaking</p>
          </button>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={() => { soundEngine.playSFX("click"); setMatchId(Math.random().toString(36).substring(2, 8).toUpperCase()); setView("host"); }} className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
              <div className="flex justify-between items-start w-full">
                <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-400">
                  <span className="material-symbols-outlined text-lg">dns</span>
                </div>
                <span className="bg-teal-500/10 text-teal-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Private</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-sm text-white mb-0.5">Host Match</h3>
                <p className="text-[10px] text-neutral-400 font-medium">Create room code</p>
              </div>
            </button>

            <button onClick={() => { soundEngine.playSFX("click"); setMatchId(null); setView("play"); }} className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
              <div className="flex justify-between items-start w-full">
                <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400">
                  <span className="material-symbols-outlined text-lg">sports_esports</span>
                </div>
                <span className="bg-pink-500/10 text-pink-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Offline</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-sm text-white mb-0.5">Pass & Play</h3>
                <p className="text-[10px] text-neutral-400 font-medium">Local device</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full mb-6">
            <div className="relative flex-1 min-w-0 flex items-center bg-[#09090b] border border-white/10 rounded-2xl p-1.5">
              <div className="pl-3 pr-2 text-neutral-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">vpn_key</span>
              </div>
              <input
                type="text"
                placeholder="ENTER ROOM CODE..."
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                className="flex-1 min-w-0 bg-transparent text-sm font-headline font-bold text-white placeholder-neutral-600 focus:outline-none uppercase tracking-widest"
                maxLength={6}
              />
            </div>
            <button
              onClick={() => { if (joinInput.length >= 4) { soundEngine.playSFX("click"); setMatchId(joinInput.trim().toUpperCase()); setView("play"); } }}
              disabled={joinInput.length < 4}
              className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5"
            >
              Join
            </button>
          </div>

          <button onClick={() => { soundEngine.playSFX("click"); onClose(); }} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase">
            <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
          </button>

        </div>
      </div>
    );
  }

  // LOCATING OPPONENT SCREEN
  if (view === "searching") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-body">
        <div className="relative w-32 h-32 flex items-center justify-center mb-8">
          <div className="absolute inset-0 border border-[#CCFF00]/30 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
          <div className="absolute inset-4 border border-[#CCFF00]/20 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
          <div className="absolute inset-8 border border-[#CCFF00]/10 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }}></div>
          <div className="w-16 h-16 bg-[#CCFF00]/10 rounded-full flex items-center justify-center border border-[#CCFF00]/20 relative z-10">
            <span className="material-symbols-outlined text-3xl text-[#CCFF00]">search</span>
          </div>
        </div>
        <h2 className="font-headline font-black text-2xl text-white mb-2">Locating Opponent</h2>
        <p className="text-sm text-[#CCFF00] font-bold mb-12 animate-pulse">Searching global matchmaking pool...</p>
        <button onClick={() => { soundEngine.playSFX("click"); setView("menu"); }} className="bg-[#18181b] text-white px-8 py-3 rounded-full font-headline font-bold text-sm border border-white/10 hover:bg-white/10 transition-colors active:scale-95">
          Abort Search
        </button>
      </div>
    );
  }

  // MATCH CONFIRMED SCREEN
  if (view === "confirmed") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-body">
        <div className="bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] px-4 py-1.5 rounded-full font-headline font-black text-xs tracking-widest mb-10 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">auto_awesome</span> MATCH CONFIRMED
        </div>
        
        <div className="flex items-center gap-6 mb-8 relative">
          <div className="w-20 h-20 bg-[#18181b] rounded-2xl border border-white/10 flex items-center justify-center rotate-[-5deg] shadow-2xl relative z-10">
            <span className="material-symbols-outlined text-4xl text-white opacity-50">person</span>
          </div>
          
          <div className="absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#CCFF00] flex items-center justify-center z-20 shadow-[0_0_20px_rgba(204,255,0,0.4)]">
            <span className="material-symbols-outlined text-black text-sm font-black">close</span>
          </div>
          
          <div className="w-20 h-20 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center rotate-[5deg] shadow-2xl overflow-hidden relative z-10">
            <span className="material-symbols-outlined text-4xl text-indigo-400">
              {localOpponent?.avatarIcon || "person"}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase mb-1">Opposing Player</p>
        <h2 className="font-headline font-black text-3xl text-white mb-2">{localOpponent?.name || "Player 2"}</h2>
        <p className="text-sm text-neutral-400 flex items-center gap-2 mb-12">
          <span className="w-2 h-2 rounded-full bg-[#CCFF00]"></span> Ranked • {localOpponent?.elo || 1200} ELO
        </p>

        <button onClick={enterBotMatch} className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)]">
          Enter Match <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    );
  }

  // HOST WAITING SCREEN
  if (view === "host") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-body text-white">
        <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={handleExit} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="text-center">
            <h2 className="font-headline font-black text-sm uppercase tracking-widest">Chess Matrix</h2>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <span className="font-caps text-[9px] font-bold tracking-widest text-indigo-400">CONNECTING...</span>
            </div>
          </div>
          <div className="w-10 h-10"></div>
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
              <button
                onClick={() => { soundEngine.playSFX("click"); navigator.clipboard.writeText(matchId!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition-colors text-xs font-bold tracking-wider"
              >
                <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
            <button onClick={handleExit} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-2xl py-4 font-headline font-bold text-sm tracking-wide transition-all border border-white/5">
              CANCEL MATCH
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN GAME BOARD
  const isBotOpponent = localOpponent?.isBot || opponent?.isBot || matchId?.startsWith("bot_");

  return (
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white select-none">
      {toast && (
        <div className="absolute top-24 z-[300] bg-red-500/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-headline font-bold text-sm shadow-2xl animate-fade-in border border-red-400">
          {toast}
        </div>
      )}

      {gameOver.isOver && (
        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-[340px] bg-[#18181b] border border-white/10 rounded-[32px] p-8 flex flex-col items-center text-center shadow-2xl">
            <div className="w-20 h-20 bg-gradient-to-br from-[#CCFF00] to-green-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-[#CCFF00]/20">
              <span className="material-symbols-outlined text-4xl text-black">{gameOver.winner ? "emoji_events" : "handshake"}</span>
            </div>
            <h2 className="font-headline font-black text-3xl mb-1 uppercase tracking-tight">{gameOver.winner ? `${gameOver.winner} Wins!` : "It's a Draw!"}</h2>
            <p className="font-caps text-[10px] font-bold text-neutral-400 tracking-[0.2em] uppercase mb-8">{gameOver.reason}</p>
            <button onClick={resetGame} className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black rounded-xl py-4 font-headline font-bold text-sm tracking-widest shadow-lg shadow-[#CCFF00]/20 transition-transform active:scale-95 mb-3">
              PLAY AGAIN
            </button>
            <button onClick={matchId ? handleExit : onClose} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-xl py-4 font-headline font-bold text-sm tracking-widest border border-white/5 transition-colors">
              EXIT ARENA
            </button>
          </div>
        </div>
      )}

      {/* Floating Dragged Piece Preview */}
      {dragSquare && dragPos && (
        <div
          className="fixed z-[500] pointer-events-none w-12 h-12 -translate-x-1/2 -translate-y-1/2 transition-none"
          style={{ left: `${dragPos.x}px`, top: `${dragPos.y}px` }}
        >
          {(() => {
            const p = game.get(dragSquare);
            if (!p) return null;
            const key = `${p.color}${p.type}`;
            return <img src={PIECE_SVGS[key]} alt="" className="w-full h-full drop-shadow-2xl scale-125" />;
          })()}
        </div>
      )}

      {/* Header */}
      <div className="w-full max-w-[400px] flex items-start justify-between px-4 pt-safe absolute top-0 mt-4 z-10">
        <button onClick={matchId ? handleExit : onClose} className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
          <span className="material-symbols-outlined text-white">arrow_back</span>
        </button>
        <div className="flex flex-col items-center">
          <h2 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-[#CCFF00]">
            {isBotOpponent ? "Bot Match" : matchId ? "Live Arena" : "Local Play"}
          </h2>
          <span className={`font-caps text-[9px] font-bold uppercase tracking-widest mt-0.5 ${matchId && !isBotOpponent && !opponentConnected ? "text-amber-400 animate-pulse" : isCheck ? "text-red-400 animate-pulse" : "text-neutral-500"}`}>
            {matchId && !isBotOpponent && !opponentConnected ? "WAITING FOR OPPONENT" : isCheck ? "⚠️ CHECK ⚠️" : `${currentTurnColor} to move`}
          </span>
        </div>
        <button onClick={resetGame} className="w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-white/10 transition-colors border border-white/10">
          <span className="material-symbols-outlined text-white">restart_alt</span>
        </button>
      </div>

      <div className="w-full max-w-[400px] flex flex-col gap-4 px-4 pt-16">
        {/* Opponent Card */}
        <div className={`w-full bg-[#18181b] border rounded-2xl p-3 flex flex-col relative transition-all duration-300 shadow-lg ${currentTurnColor === "black" ? "border-[#CCFF00] shadow-[0_0_15px_rgba(204,255,0,0.2)]" : "border-white/5"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 relative">
                <span className="material-symbols-outlined text-neutral-400">
                  {isBotOpponent ? (localOpponent?.avatarIcon || "person") : matchId ? "person" : "robot_2"}
                </span>
                {isBotOpponent && (
                  <span className="absolute -bottom-2 bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider shadow-sm">BOT</span>
                )}
              </div>
              <div>
                <h3 className="font-headline text-sm font-bold">
                  {isBotOpponent ? (localOpponent?.name || "Bot") : matchId ? (opponentConnected ? "Opponent" : "Awaiting Opponent...") : "Player 2 (Black)"}
                </h3>
                <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-500">
                  {matchId ? `Playing ${playerColor === "white" ? "Black" : "White"}` : (game.turn() === "b" ? "To Move" : "Waiting...")}
                </p>
              </div>
            </div>
            {oppReaction && (
              <div className="absolute right-4 -bottom-4 z-20 animate-fade-in">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-3 py-1.5 text-2xl animate-bounce">{oppReaction}</div>
              </div>
            )}
          </div>
          <div className="w-full flex flex-wrap gap-1 mt-2 min-h-[20px] text-lg opacity-70 px-1">
            {(matchId ? (playerColor === "white" ? capturedPieces.wCaptured : capturedPieces.bCaptured) : capturedPieces.wCaptured).map((p, i) => (
              <span key={i} className="leading-none text-white">{p}</span>
            ))}
          </div>
        </div>

        {/* NATIVE MOBILE POINTER CHESSBOARD GRID (COSMETICS INTEGRATED) */}
        <div className={`w-full p-2 rounded-[24px] shadow-2xl border transition-all duration-300 relative overflow-hidden ${
          isObsidianBoard 
            ? "bg-[#0b0813] border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.25)]" 
            : "bg-[#18181b] border-white/10"
        }`}>
          <div
            ref={boardRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`w-full aspect-square grid grid-cols-8 grid-rows-8 rounded-[16px] overflow-hidden border touch-none relative select-none ${
              isObsidianBoard ? "border-purple-500/30" : "border-white/5"
            }`}
          >
            {boardRanks.map((rank, rIdx) =>
              boardFiles.map((file, fIdx) => {
                const sq = `${file}${rank}` as Square;
                const isDark = (rIdx + fIdx) % 2 === 1;
                const piece = game.get(sq);

                const isSelected = selectedSquare === sq;
                const isLegalMove = legalMoves.includes(sq);
                const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
                const isKingInCheck = isCheck && piece?.type === "k" && piece?.color === game.turn();

                const pieceKey = piece ? `${piece.color}${piece.type}` : null;

                const darkSquareBg = isObsidianBoard ? "bg-[#1a0e2e]" : "bg-[#312e81]";
                const lightSquareBg = isObsidianBoard ? "bg-[#2d1b4d]" : "bg-[#c7d2fe]";

                return (
                  <div
                    key={sq}
                    className={`relative flex items-center justify-center transition-colors duration-150 ${
                      isDark ? darkSquareBg : lightSquareBg
                    }`}
                  >
                    {/* Last Move Highlight */}
                    {isLastMove && (
                      <div className={`absolute inset-0 pointer-events-none ${
                        isObsidianBoard ? "bg-purple-500/40" : "bg-[#CCFF00]/40"
                      }`} />
                    )}

                    {/* Selected Highlight */}
                    {isSelected && (
                      <div className={`absolute inset-0 shadow-[inset_0_0_12px_rgba(255,255,255,0.5)] pointer-events-none ${
                        isObsidianBoard ? "bg-purple-400/60" : "bg-[#CCFF00]/60"
                      }`} />
                    )}

                    {/* Check Highlight */}
                    {isKingInCheck && <div className="absolute inset-0 bg-red-500/80 animate-pulse pointer-events-none" />}

                    {/* Render Chess Piece */}
                    {pieceKey && (
                      <img
                        src={PIECE_SVGS[pieceKey]}
                        alt=""
                        className={`w-full h-full p-1 transition-opacity pointer-events-none ${
                          dragSquare === sq ? "opacity-30" : "opacity-100"
                        }`}
                      />
                    )}

                    {/* Legal Move Indicators */}
                    {isLegalMove && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {piece ? (
                          <div className="w-full h-full border-4 border-red-500/80 rounded-full animate-pulse" />
                        ) : (
                          <div className={`w-3.5 h-3.5 rounded-full ${
                            isObsidianBoard 
                              ? "bg-purple-400 shadow-lg shadow-purple-500/50" 
                              : "bg-[#CCFF00] shadow-lg shadow-[#CCFF00]/50"
                          }`} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Player Card */}
        <div className={`w-full bg-[#18181b] border rounded-2xl p-3 flex flex-col relative transition-all duration-300 shadow-lg ${currentTurnColor === "white" ? "border-[#CCFF00] shadow-[0_0_15px_rgba(204,255,0,0.2)]" : "border-white/5"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/20 border border-[#CCFF00]/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[#CCFF00]">face</span>
              </div>
              <div>
                <h3 className="font-headline text-sm font-bold">Player 1 (White)</h3>
                <p className="text-[10px] font-bold tracking-widest uppercase text-[#CCFF00]">
                  {matchId ? `Playing ${playerColor === "white" ? "White" : "Black"}` : (game.turn() === "w" ? "To Move" : "Waiting...")}
                </p>
              </div>
            </div>
            {matchId && !isBotOpponent && (
              <button
                onClick={() => { soundEngine.playSFX("click"); setShowReactionMenu(!showReactionMenu); }}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center text-neutral-400 hover:text-white relative"
              >
                <span className="material-symbols-outlined text-lg">add_reaction</span>
                {myReaction && (
                  <div className="absolute -top-12 right-0 z-20 animate-fade-in pointer-events-none">
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-full px-3 py-1.5 text-2xl animate-bounce">{myReaction}</div>
                  </div>
                )}
              </button>
            )}
          </div>
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
              <button
                key={emoji}
                onClick={() => {
                  soundEngine.playSFX("click");
                  setShowReactionMenu(false);
                  setMyReaction(emoji);
                  setTimeout(() => setMyReaction(null), 3500);
                  if (channel && matchId) channel.send({ type: "broadcast", event: "reaction", payload: { emoji } });
                }}
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