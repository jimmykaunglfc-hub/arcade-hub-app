"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { soundEngine } from "../../lib/soundManager";
import { storeManager } from "../../lib/storeManager";

// 🤖 Import Bot Utility for Opponents
import { getRandomBotOpponent } from "../../lib/botUtils";

interface TicTacToeProps {
  onClose?: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

type Player = "X" | "O";
type GameMode = "pvp" | "ai_medium" | "ai_unbeatable";
type BoardState = (Player | null)[];

const WINNING_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]              // Diagonals
];

export default function TicTacToeGame({ onClose, preloadedMatchId, opponent }: TicTacToeProps) {
  // 🛍️ STORE COSMETICS ENGINE SYNC
  const equippedCosmetic = storeManager.getEquippedCosmetic("tictactoe");
  const isCyberMarks = equippedCosmetic === "cyber_neon_marks" || true;

  // 💰 DYNAMIC POINTS & ENTRY FEE SYSTEM
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [entryFee, setEntryFee] = useState<number>(100);
  const [showNoPointsModal, setShowNoPointsModal] = useState(false);

  // 1. Detect bot mode synchronously
  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  // 2. Initialize View State
  const [view, setView] = useState<"menu" | "host" | "play" | "searching" | "confirmed">(
    isBotMode || preloadedMatchId ? "play" : "menu"
  );
  
  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);
  const [matchId, setMatchId] = useState<string | null>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : null)
  );

  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 🌐 MULTIPLAYER NETWORK STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerSymbol, setMyPlayerSymbol] = useState<Player>("X");
  const [opponentConnected, setOpponentConnected] = useState(false);

  // 🎮 GAME STATES
  const [gameMode, setGameMode] = useState<GameMode>("pvp");
  const [board, setBoard] = useState<BoardState>(Array(9).fill(null));
  const [turn, setTurn] = useState<Player>("X");
  const [winner, setWinner] = useState<Player | "draw" | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [scores, setScores] = useState({ X: 0, O: 0, ties: 0 });

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // 📥 FETCH USER PROFILE BALANCE & TIC TAC TOE ENTRY FEE FROM DATABASE
  useEffect(() => {
    const fetchGameData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setMyUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("points")
          .eq("id", user.id)
          .single();
        if (profile) setUserPoints(profile.points ?? 0);
      }

      // Fetch dynamic entry cost from `games` table
      const { data: gameData } = await supabase
        .from("games")
        .select("entry_fee")
        .ilike("title", "Tic Tac Toe")
        .single();

      if (gameData && typeof gameData.entry_fee === "number") {
        setEntryFee(gameData.entry_fee);
      }
    };

    fetchGameData();
  }, []);

  // 🔒 CHECK POINTS AND DEDUCT ENTRY FEE
  const checkPointsAndDeduct = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from("profiles")
      .select("points")
      .eq("id", user.id)
      .single();

    const currentPoints = profile?.points ?? 0;
    setUserPoints(currentPoints);

    if (currentPoints < entryFee) {
      soundEngine.playSFX("defeat");
      setShowNoPointsModal(true);
      return false;
    }

    // Deduct entry fee
    const { error } = await supabase
      .from("profiles")
      .update({ points: currentPoints - entryFee })
      .eq("id", user.id);

    if (error) {
      console.error("Error deducting entry fee:", error.message);
      return false;
    }

    setUserPoints(currentPoints - entryFee);
    return true;
  };

  // 🤝 SAFE RULE PARSER & BOT HANDLER
  useEffect(() => {
    if (isBotMode && localOpponent?.name) {
      showToast(`Playing against ${localOpponent.name}`);
    }
  }, [isBotMode, localOpponent]);

  // 📡 SUPABASE REALTIME SYNC HUB
  useEffect(() => {
    if (!matchId || !myUserId || localOpponent?.isBot || view === "searching" || view === "confirmed") return;

    const matchChannel = supabase.channel(`tictactoe_match_${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
    });

    matchChannel
      .on("broadcast", { event: "board_update" }, (payload) => {
        const { board: newBoard, turn: nextTurn, winner: winState, winningLine: line, scores: newScores } = payload.payload;
        if (newBoard) setBoard(newBoard);
        if (nextTurn) setTurn(nextTurn);
        
        if (winState !== undefined) {
          setWinner(winState);
          if (winState === "draw") {
            soundEngine.playSFX("defeat");
          } else if (winState) {
            soundEngine.playSFX(winState === myPlayerSymbol ? "victory" : "defeat");
          }
        } else if (newBoard) {
          soundEngine.playSFX("move");
        }

        if (line !== undefined) setWinningLine(line);
        if (newScores) setScores(newScores);
      })
      .on("presence", { event: "sync" }, () => {
        const state = matchChannel.presenceState();
        const users = Object.keys(state);
        setOpponentConnected(users.length > 1);
        if (users.length > 0) {
          setMyPlayerSymbol(users.sort()[0] === myUserId ? "X" : "O");
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
  }, [matchId, myUserId, localOpponent, view, myPlayerSymbol]);

  useEffect(() => {
    if (view === "host" && opponentConnected) {
      setGameMode("pvp");
      setView("play");
    }
  }, [opponentConnected, view]);

  // 🧮 GAME LOGIC HELPER FUNCTIONS
  const checkWinner = (currentBoard: BoardState) => {
    for (const combo of WINNING_COMBINATIONS) {
      const [a, b, c] = combo;
      if (
        currentBoard[a] &&
        currentBoard[a] === currentBoard[b] &&
        currentBoard[a] === currentBoard[c]
      ) {
        return { winner: currentBoard[a] as Player, line: combo };
      }
    }
    if (currentBoard.every((cell) => cell !== null)) {
      return { winner: "draw" as const, line: null };
    }
    return null;
  };

  const minimax = (
    newBoard: BoardState,
    depth: number,
    isMaximizing: boolean
  ): { score: number; index?: number } => {
    const result = checkWinner(newBoard);
    if (result?.winner === "O") return { score: 10 - depth };
    if (result?.winner === "X") return { score: depth - 10 };
    if (result?.winner === "draw") return { score: 0 };

    const emptyIndices = newBoard
      .map((val, idx) => (val === null ? idx : null))
      .filter((val): val is number => val !== null);

    if (isMaximizing) {
      let bestScore = -Infinity;
      let bestMove = emptyIndices[0];
      for (const idx of emptyIndices) {
        newBoard[idx] = "O";
        const sim = minimax(newBoard, depth + 1, false);
        newBoard[idx] = null;
        if (sim.score > bestScore) {
          bestScore = sim.score;
          bestMove = idx;
        }
      }
      return { score: bestScore, index: bestMove };
    } else {
      let bestScore = Infinity;
      let bestMove = emptyIndices[0];
      for (const idx of emptyIndices) {
        newBoard[idx] = "X";
        const sim = minimax(newBoard, depth + 1, true);
        newBoard[idx] = null;
        if (sim.score < bestScore) {
          bestScore = sim.score;
          bestMove = idx;
        }
      }
      return { score: bestScore, index: bestMove };
    }
  };

  const getMediumAIMove = (currentBoard: BoardState, emptyIndices: number[]): number => {
    for (const idx of emptyIndices) {
      const tempBoard = [...currentBoard];
      tempBoard[idx] = "O";
      if (checkWinner(tempBoard)?.winner === "O") return idx;
    }

    for (const idx of emptyIndices) {
      const tempBoard = [...currentBoard];
      tempBoard[idx] = "X";
      if (checkWinner(tempBoard)?.winner === "X") return idx;
    }

    if (Math.random() < 0.7) {
      if (emptyIndices.includes(4)) return 4;
      const corners = [0, 2, 6, 8].filter((c) => emptyIndices.includes(c));
      if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
    }

    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  };

  const makeMove = useCallback((index: number, player: Player) => {
    if (board[index] !== null || winner !== null) return;

    const nextBoard = [...board];
    nextBoard[index] = player;
    setBoard(nextBoard);

    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(30);
    }

    const gameResult = checkWinner(nextBoard);
    let nextTurn: Player = player === "X" ? "O" : "X";
    
    let newWinner: Player | "draw" | null = winner; 
    let newWinningLine: number[] | null = winningLine;
    let newScores = { ...scores };

    if (gameResult) {
      newWinner = gameResult.winner;
      newWinningLine = gameResult.line;
      setWinner(newWinner);
      setWinningLine(newWinningLine);

      if (gameResult.winner === "draw") {
        newScores = { ...newScores, ties: newScores.ties + 1 };
        soundEngine.playSFX("defeat");
        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([100, 50, 100]);
        }
      } else {
        const winPlayer = gameResult.winner as Player;
        newScores = { ...newScores, [winPlayer]: newScores[winPlayer] + 1 };
        
        const isBotOpponent = localOpponent?.isBot || matchId?.startsWith("bot_") || gameMode !== "pvp";
        if (matchId && !isBotOpponent) {
          soundEngine.playSFX(winPlayer === myPlayerSymbol ? "victory" : "defeat");
        } else {
          soundEngine.playSFX("victory");
        }

        if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate([200, 100, 200]);
        }
      }
      setScores(newScores);
    } else {
      soundEngine.playSFX("move");
      setTurn(nextTurn);
    }

    if (channel && matchId && !localOpponent?.isBot && !preloadedMatchId?.startsWith("bot_")) {
      channel.send({
        type: "broadcast",
        event: "board_update",
        payload: {
          board: nextBoard,
          turn: nextTurn,
          winner: newWinner,
          winningLine: newWinningLine,
          scores: newScores,
        },
      });
    }
  }, [board, winner, winningLine, scores, channel, matchId, localOpponent, preloadedMatchId, myPlayerSymbol, gameMode]);

  // 🤖 BOT / AI MOVE TRIGGER
  useEffect(() => {
    const isBotMatch = localOpponent?.isBot || matchId?.startsWith("bot_") || gameMode !== "pvp";
    if (turn === "O" && !winner && view === "play" && isBotMatch) {
      const thinkingDelay = Math.floor(Math.random() * 800) + 800;

      const timer = setTimeout(() => {
        const emptyIndices = board
          .map((val, idx) => (val === null ? idx : null))
          .filter((val): val is number => val !== null);

        if (emptyIndices.length === 0) return;

        let moveIndex: number;
        if (gameMode === "ai_medium") {
          moveIndex = getMediumAIMove(board, emptyIndices);
        } else {
          const result = minimax([...board], 0, true);
          moveIndex = result.index ?? emptyIndices[0];
        }

        makeMove(moveIndex, "O");
      }, thinkingDelay);

      return () => clearTimeout(timer);
    }
  }, [turn, winner, view, gameMode, board, makeMove, localOpponent, matchId]);

  const startNewGame = (mode: GameMode, forcedOpponent?: any) => {
    soundEngine.playSFX("click");
    setGameMode(mode);
    setWinningLine(null);
    setWinner(null);
    setBoard(Array(9).fill(null));
    setTurn("X");
    if (forcedOpponent) setLocalOpponent(forcedOpponent);
    setView("play");
  };

  const resetBoard = () => {
    soundEngine.playSFX("click");
    setWinningLine(null);
    setWinner(null);
    setBoard(Array(9).fill(null));
    setTurn("X");
    if (channel && matchId && !localOpponent?.isBot) {
      channel.send({
        type: "broadcast",
        event: "board_update",
        payload: {
          board: Array(9).fill(null),
          turn: "X",
          winner: null,
          winningLine: null,
          scores: scores,
        },
      });
    }
  };

  const handleExit = () => {
    soundEngine.playSFX("click");
    if (matchId) setMatchId(null);
    if (onClose) {
      onClose();
    } else {
      setView("menu");
    }
  };

  const hostMatch = async () => {
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    setMatchId(Math.random().toString(36).substring(2, 8).toUpperCase());
    setView("host");
  };

  const joinMatch = async () => {
    if (joinInput.length < 4) return;
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    setMatchId(joinInput.trim().toUpperCase());
    setView("play");
  };

  const startOnlineMatchmaking = async () => {
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

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
    showToast(`Playing against ${localOpponent?.name || 'Bot'}`);
    startNewGame("ai_unbeatable", localOpponent);
  };

  const isBotOpponent = localOpponent?.isBot || matchId?.startsWith("bot_") || gameMode !== "pvp";

  // LOBBY / MENU VIEW
  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-sans text-white px-6 animate-fade-in select-none">
        
        {/* 🚫 INSUFFICIENT POINTS MODAL */}
        {showNoPointsModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-6 animate-fade-in touch-none">
            <div className="bg-[#18181b] border border-rose-500/30 rounded-[28px] p-6 w-full max-w-[340px] shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl text-rose-400">monetization_on</span>
              </div>

              <h3 className="font-headline font-black text-xl text-white uppercase tracking-tight mb-1">
                Insufficient Points
              </h3>
              
              <p className="text-xs text-neutral-400 font-medium leading-relaxed mb-4">
                You need <span className="text-[#CCFF00] font-bold">{entryFee} PTS</span> to play an online Tic-Tac-Toe match.
              </p>

              <div className="w-full bg-[#09090b] border border-white/10 rounded-2xl p-3 mb-6 flex justify-between items-center">
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Your Balance</span>
                <span className="text-sm font-black font-mono text-rose-400">
                  {userPoints ?? 0} PTS
                </span>
              </div>

              <div className="w-full space-y-2">
                <button
                  onClick={() => {
                    soundEngine.playSFX("click");
                    handleExit();
                  }}
                  className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-headline font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">shopping_cart</span>
                  Visit Store / Buy Points
                </button>

                <button
                  onClick={() => setShowNoPointsModal(false)}
                  className="w-full bg-white/5 hover:bg-white/10 text-neutral-400 font-headline font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all border border-white/5"
                >
                  Dismiss
                </button>
              </div>

              <p className="text-[9px] text-neutral-500 mt-4">
                💡 Tip: Claim free daily login rewards or earn points in local practice!
              </p>
            </div>
          </div>
        )}

        <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
          
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-2xl text-[#CCFF00]">grid_3x3</span>
            </div>
            <div>
              <h1 className="font-headline font-black text-xl tracking-tight text-white">Tic-Tac-Toe</h1>
              <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
            </div>
          </div>

          <button onClick={startOnlineMatchmaking} className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 bg-[#CCFF00]/10 rounded-xl flex items-center justify-center text-[#CCFF00]">
                <span className="material-symbols-outlined text-xl">search</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="bg-[#CCFF00]/10 text-[#CCFF00] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                  {entryFee} PTS
                </span>
                <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                  <span className="material-symbols-outlined text-sm font-black">arrow_forward</span>
                </div>
              </div>
            </div>
            <h3 className="font-headline font-black text-lg text-white mb-1 group-hover:text-[#CCFF00] transition-colors">Find Online Match</h3>
            <p className="text-xs text-neutral-400 font-medium leading-relaxed">Ranked & casual global<br/>matchmaking</p>
          </button>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <button onClick={hostMatch} className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
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

            <button onClick={() => startNewGame("pvp")} className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
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
              onClick={joinMatch}
              disabled={joinInput.length < 4}
              className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5"
            >
              Join
            </button>
          </div>

          <button onClick={handleExit} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase">
            <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
          </button>
        </div>
      </div>
    );
  }

  // SEARCHING & CONFIRMED SCREENS
  if (view === "searching") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-sans select-none">
        <div className="relative w-32 h-32 flex items-center justify-center mb-8">
          <div className="absolute inset-0 border border-[#CCFF00]/30 rounded-full animate-ping" style={{ animationDuration: "2s" }}></div>
          <div className="absolute inset-4 border border-[#CCFF00]/20 rounded-full animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }}></div>
          <div className="absolute inset-8 border border-[#CCFF00]/10 rounded-full animate-ping" style={{ animationDuration: "2s", animationDelay: "1s" }}></div>
          <div className="w-16 h-16 bg-[#CCFF00]/10 rounded-full flex items-center justify-center border border-[#CCFF00]/20 relative z-10">
            <span className="material-symbols-outlined text-3xl text-[#CCFF00]">search</span>
          </div>
        </div>
        <h2 className="font-headline font-black text-2xl text-white mb-2 uppercase">Locating Opponent</h2>
        <p className="text-sm text-[#CCFF00] font-bold mb-12 animate-pulse">Searching global matchmaking pool...</p>
        <button onClick={() => { soundEngine.playSFX("click"); setView("menu"); }} className="bg-[#18181b] text-white px-8 py-3 rounded-full font-headline font-bold text-sm border border-white/10 hover:bg-white/10 transition-colors active:scale-95 uppercase">
          Abort Search
        </button>
      </div>
    );
  }

  if (view === "confirmed") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in font-sans select-none">
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

  // HOST WAITING VIEW
  if (view === "host") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-sans text-white select-none">
        <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={handleExit} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="text-center">
            <h2 className="font-headline font-black text-sm uppercase tracking-widest">Tic-Tac-Toe Room</h2>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#CCFF00] animate-pulse"></span>
              <span className="text-[9px] font-bold tracking-widest text-[#CCFF00] uppercase">CONNECTING...</span>
            </div>
          </div>
          <div className="w-10 h-10"></div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-8 shadow-2xl border border-white/5 flex flex-col items-center text-center">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-[#CCFF00]/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#CCFF00] rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h3 className="font-headline font-black text-xl tracking-tight mb-8 uppercase">AWAITING OPPONENT</h3>
            <p className="text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-3 uppercase">Share This Room Code</p>
            
            <div className="w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-2 pl-6 mb-6">
              <span className="font-headline font-bold text-2xl tracking-[0.3em] text-[#CCFF00]">{matchId}</span>
              <button
                onClick={() => { soundEngine.playSFX("click"); navigator.clipboard.writeText(matchId!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition-colors text-xs font-bold tracking-wider uppercase"
              >
                <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>

            <button onClick={handleExit} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-2xl py-4 font-headline font-bold text-sm tracking-wide transition-all border border-white/5 uppercase">
              CANCEL MATCH
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MAIN GAMEPLAY ARENA
  return (
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors text-white select-none">
      
      {toast && (
        <div className="absolute top-20 z-[300] bg-[#CCFF00] text-black px-6 py-2.5 rounded-2xl font-headline font-bold text-xs shadow-2xl animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header Bar */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-white/10 bg-[#18181b]/80 backdrop-blur-md shrink-0">
        <button onClick={handleExit} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-300 active:scale-90 transition-all shadow-sm hover:bg-white/10">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
        
        <div className="text-center">
          <h1 className="text-sm font-black uppercase tracking-widest text-white">Tic-Tac-Toe Matrix</h1>
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#CCFF00] block mt-0.5">
            {isBotOpponent ? (localOpponent?.name || "Joe Yoke Bot") : matchId ? "Live Network" : "Pass & Play"}
          </span>
        </div>

        <button onClick={resetBoard} className="bg-white/5 hover:bg-white/10 text-[10px] font-black tracking-wider text-white px-3 py-2 rounded-xl border border-white/10 transition-colors shadow-sm active:scale-95 uppercase">
          RESET
        </button>
      </div>

      {/* Score HUD */}
      <div className="w-full max-w-md px-6 pt-6 shrink-0 flex flex-col items-center gap-3">
        <div className="grid grid-cols-3 gap-3 w-full text-center">
          <div className="bg-[#18181b] p-3 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
              {matchId ? (myPlayerSymbol === "X" ? "You (X)" : "Opponent (X)") : "Player X"}
            </span>
            <span className="text-2xl font-black text-cyan-400">{scores.X}</span>
          </div>

          <div className="bg-[#18181b] p-3 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Ties</span>
            <span className="text-2xl font-black text-neutral-300">{scores.ties}</span>
          </div>

          <div className="bg-[#18181b] p-3 rounded-2xl border border-white/5 flex flex-col items-center">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-1">
              {isBotOpponent ? (localOpponent?.name || "Bot (O)") : matchId ? (myPlayerSymbol === "O" ? "You (O)" : "Opponent (O)") : "Player O"}
            </span>
            <span className="text-2xl font-black text-rose-400">{scores.O}</span>
          </div>
        </div>

        <div className="h-6 flex items-center justify-center">
          {!winner && (
            <span className="text-xs font-bold tracking-widest uppercase text-neutral-400">
              Turn: <span className={turn === "X" ? "text-cyan-400 font-black" : "text-rose-400 font-black"}>{turn}</span>
            </span>
          )}
        </div>
      </div>

      {/* 3x3 Grid Board Area */}
      <div className="flex-1 w-full max-w-md flex items-center justify-center px-6 pb-12">
        <div className={`grid grid-cols-3 gap-3.5 w-full aspect-square bg-[#18181b] p-3.5 rounded-[32px] border shadow-2xl transition-all duration-300 ${
          isCyberMarks ? "border-[#CCFF00]/40 shadow-[0_0_30px_rgba(204,255,0,0.15)]" : "border-white/10"
        }`}>
          {board.map((cell, index) => {
            const isWinningCell = winningLine?.includes(index);
            const isMyTurn = matchId ? (turn === myPlayerSymbol) : true;

            return (
              <button
                key={index}
                disabled={cell !== null || winner !== null || (turn === "O" && isBotOpponent) || !isMyTurn}
                onClick={() => makeMove(index, turn)}
                className={`
                  w-full h-full aspect-square flex items-center justify-center rounded-2xl text-5xl font-black transition-all duration-200 select-none
                  ${
                    isWinningCell
                      ? "bg-[#CCFF00] text-black scale-105 shadow-[0_0_25px_rgba(204,255,0,0.8)] z-10"
                      : cell
                      ? "bg-[#09090b] border border-white/5 cursor-default"
                      : "bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 active:scale-95 cursor-pointer"
                  }
                  ${cell === "X" ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]"}
                `}
              >
                <span className="leading-none">{cell ?? ""}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Game Over Popup */}
      {winner && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-[200]">
          <div className="bg-[#18181b] border border-white/10 p-8 rounded-[32px] shadow-2xl text-center max-w-xs w-full flex flex-col items-center gap-6">
            
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-[#CCFF00]/10 border border-[#CCFF00]/30 flex items-center justify-center text-3xl mb-1 text-[#CCFF00]">
                {winner === "draw" ? "🤝" : "🏆"}
              </div>
              <span className="text-[10px] font-black text-neutral-400 tracking-[0.2em] uppercase">
                Match Result
              </span>
              <h2 className="text-2xl font-headline font-black tracking-tight text-white uppercase">
                {winner === "draw" ? "IT'S A TIE!" : `PLAYER ${winner} WINS!`}
              </h2>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={resetBoard}
                className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black py-3.5 rounded-2xl font-headline font-black text-xs uppercase tracking-wider transition-transform active:scale-95 shadow-lg shadow-[#CCFF00]/20"
              >
                Play Again
              </button>
              <button
                onClick={handleExit}
                className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/5 py-3.5 rounded-2xl font-headline font-bold text-xs uppercase tracking-wider transition-colors active:scale-95"
              >
                Main Menu
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}