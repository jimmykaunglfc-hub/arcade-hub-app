"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";

// 👇 NEW: Import the Bot Utility
import { getRandomBotOpponent } from "../../lib/botUtils";

const EMPTY = 0, P1 = 1, P2 = 2, P1_KING = 3, P2_KING = 4;
const INITIAL_BOARD = [
  [EMPTY, P2, EMPTY, P2, EMPTY, P2, EMPTY, P2],
  [P2, EMPTY, P2, EMPTY, P2, EMPTY, P2, EMPTY],
  [EMPTY, P2, EMPTY, P2, EMPTY, P2, EMPTY, P2],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY],
  [P1, EMPTY, P1, EMPTY, P1, EMPTY, P1, EMPTY],
  [EMPTY, P1, EMPTY, P1, EMPTY, P1, EMPTY, P1],
  [P1, EMPTY, P1, EMPTY, P1, EMPTY, P1, EMPTY],
];

// Emoji Arsenal
const EMOJIS = ["👍", "😂", "🔥", "😡", "😭", "🤯"];

interface CheckersProps {
  onClose: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

export default function Checkers({ 
  onClose, 
  preloadedMatchId,
  opponent
}: CheckersProps) {

  // 1. Detect bot mode synchronously
  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  // 2. Direct state initialization based on detection
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online" | "bot" | "searching" | "confirmed">(
    isBotMode ? "bot" : preloadedMatchId ? "join" : "menu"
  );
  
  // 👇 NEW: State to store generated bot profile
  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);

  const [matchId, setMatchId] = useState<string>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : "")
  );

  const [roomCode, setRoomCode] = useState<string>(""); 
  const [joinCode, setJoinCode] = useState<string>("");
  const [copied, setCopied] = useState(false); 
  
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<number>(P1);
  const [board, setBoard] = useState<number[][]>(INITIAL_BOARD);
  const [turn, setTurn] = useState<number>(P1);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  
  // 🏆 Series & Game Stats
  const [p1Captures, setP1Captures] = useState(0);
  const [p2Captures, setP2Captures] = useState(0);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [winner, setWinner] = useState<number | null>(null);

  // 🤩 Live Emojis
  const [floatingEmojis, setFloatingEmojis] = useState<{id: number, emoji: string, role: number}[]>([]);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  // 🎉 Celebration Confetti Generator
  const confettiPieces = useMemo(() => {
    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'];
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animDuration: `${2 + Math.random() * 3}s`,
      animDelay: `${Math.random() * 1.5}s`,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null));
  }, []);

  // 📡 REAL-TIME SYNCHRONIZATION
  useEffect(() => {
    if (playMode !== "online" && playMode !== "host") return;
    if (!matchId) return;

    const channel = supabase.channel(`match_${matchId}`, {
      config: { broadcast: { self: true } }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'checkers_matches', filter: `id=eq.${matchId}` }, (payload) => {
      const newData = payload.new;
      setBoard(newData.board);
      setTurn(newData.turn);
      setP1Captures(newData.p1_captures);
      setP2Captures(newData.p2_captures);
      setP1Score(newData.p1_score);
      setP2Score(newData.p2_score);
      setWinner(newData.winner);
      if (newData.status === 'playing' && playMode === "host") setPlayMode("online");
    })
    .on('broadcast', { event: 'emoji' }, (payload) => {
      const { emoji, role } = payload.payload;
      const newEmoji = { id: Date.now() + Math.random(), emoji, role };
      setFloatingEmojis((prev) => [...prev, newEmoji]);
      setTimeout(() => {
        setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id));
      }, 2500);
    })
    .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId, playMode]);

  // 🤖 LOCAL JOE YOKE BOT ENGINE
  useEffect(() => {
    if (playMode === "bot" && turn === P2 && !winner) {
      // 🧠 Human-like thinking delay calculation (1.5s to 3.5s)
      const thinkingDelay = Math.floor(Math.random() * 2000) + 1500;
      
      const botActionDelay = setTimeout(() => {
        // 1. Get all valid moves for P2
        const allP2Moves = getAllValidMoves(P2, board);
        
        if (allP2Moves.length === 0) {
          // No moves available, P1 wins
          setWinner(P1);
          setP1Score(prev => prev + 1);
          return;
        }

        // 2. Filter for mandatory jumps if any exist
        const jumpMoves = allP2Moves.filter(m => m.move.jump);
        const validMoves = jumpMoves.length > 0 ? jumpMoves : allP2Moves;

        // 3. Select a random move for human-like unpredictability
        const selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        
        // 4. Execute the move
        const newBoard = board.map(row => [...row]);
        let movingPiece = newBoard[selectedMove.from.r][selectedMove.from.c];
        newBoard[selectedMove.from.r][selectedMove.from.c] = EMPTY;
        newBoard[selectedMove.move.r][selectedMove.move.c] = movingPiece;

        let newP2Cap = p2Captures;
        if (selectedMove.move.jump) {
          newBoard[selectedMove.move.jump.r][selectedMove.move.jump.c] = EMPTY;
          newP2Cap++;
        }

        // King promotion
        if (selectedMove.move.r === 7) newBoard[selectedMove.move.r][selectedMove.move.c] = P2_KING;

        const nextTurn = P1;
        const nextMoves = getAllValidMoves(nextTurn, newBoard);
        
        let newWinner = null;
        let newP2Score = p2Score;
        
        if (nextMoves.length === 0) {
          newWinner = P2; 
          newP2Score++;
        }

        setBoard(newBoard);
        setTurn(nextTurn);
        setP2Captures(newP2Cap);
        setWinner(newWinner);
        setP2Score(newP2Score);
        
        // 🎭 25% chance the bot reacts with an emote after playing
        if (Math.random() <= 0.25) {
          const reactionDelay = Math.floor(Math.random() * 1000) + 800;
          setTimeout(() => {
            const randomEmote = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            const newEmoji = { id: Date.now() + Math.random(), emoji: randomEmote, role: P2 };
            setFloatingEmojis((prev) => [...prev, newEmoji]);
            // Clear emote bubble after 2.5 seconds
            setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
          }, reactionDelay);
        }

      }, thinkingDelay); // Human thinking delay

      return () => clearTimeout(botActionDelay);
    }
  }, [turn, playMode, winner, board, p2Captures, p2Score]);

  const hostMatch = async () => {
    if (!myUserId) return alert("Must be logged in to play online.");
    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data } = await supabase.from('checkers_matches').insert({
      p1_id: myUserId, board: INITIAL_BOARD, room_code: generatedCode
    }).select().single();

    if (data) {
      setMatchId(data.id); setRoomCode(generatedCode); setMyPlayerRole(P1); setPlayMode("host");
    }
  };

  const joinMatch = async (overrideCode?: string) => {
    const codeToJoin = typeof overrideCode === 'string' ? overrideCode : joinCode.toUpperCase();
    if (!myUserId || !codeToJoin) return;
    const { data, error } = await supabase.from('checkers_matches')
      .update({ p2_id: myUserId, status: 'playing' }).eq('room_code', codeToJoin).select().single();

    if (data && !error) {
      setMatchId(data.id); setMyPlayerRole(P2); setBoard(data.board); setTurn(data.turn); setPlayMode("online");
    } else {
      alert("Invalid Room Code or Match Already Occupied."); setPlayMode("menu");
    }
  };

  // --- NEW FAKE MATCHMAKING FLOW FOR BOT INTEGRATION ---
  const startOnlineMatchmaking = () => {
    setPlayMode("searching");
    setTimeout(() => {
      // If the user hasn't cancelled the search, transition to confirmed and assign bot
      setPlayMode(prev => {
        if (prev === "searching") {
          setLocalOpponent(getRandomBotOpponent());
          return "confirmed";
        }
        return prev;
      });
    }, 2800); // Wait ~3s for radar animation
  };

  const enterBotMatch = () => {
    setMatchId(`bot_match_${Date.now()}`);
    setMyPlayerRole(P1);
    setPlayMode("bot");
  };

  // 🤝 SAFE RULE PARSER & BOT HANDLER
  useEffect(() => {
    if (isBotMode) return; // Handled by synchronous initialization
    
    if (preloadedMatchId && myUserId) {
      joinDirectlyByUUID(preloadedMatchId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedMatchId, myUserId, isBotMode]);

  const joinDirectlyByUUID = async (uuid: string) => {
    if (uuid.startsWith("bot_")) return;

    const { data: match } = await supabase.from('checkers_matches').select('*').eq('id', uuid).maybeSingle();
    if (!match) return setPlayMode("menu");

    if (match.p1_id === myUserId) {
      setMatchId(match.id); setRoomCode(match.room_code || ""); setMyPlayerRole(P1); 
      setBoard(match.board); setTurn(match.turn); setP1Score(match.p1_score); setP2Score(match.p2_score);
      setWinner(match.winner); setPlayMode(match.status === 'playing' ? "online" : "host");
    } else {
      const { data: updatedMatch } = await supabase.from('checkers_matches')
        .update({ p2_id: myUserId, status: 'playing' }).eq('id', uuid).select().single();
      if (updatedMatch) {
        setMatchId(updatedMatch.id); setRoomCode(updatedMatch.room_code || ""); setMyPlayerRole(P2); 
        setBoard(updatedMatch.board); setTurn(updatedMatch.turn); setP1Score(updatedMatch.p1_score); setP2Score(updatedMatch.p2_score);
        setWinner(updatedMatch.winner); setPlayMode("online");
      }
    }
  };

  const getValidMovesForPiece = (r: number, c: number, piece: number, currentBoard: number[][]) => {
    const moves: { r: number; c: number; jump?: { r: number; c: number } }[] = [];
    if (piece === EMPTY) return moves;
    const isKing = piece === P1_KING || piece === P2_KING;
    const directions = [];
    if (piece === P1 || isKing) directions.push(-1);
    if (piece === P2 || isKing) directions.push(1);

    directions.forEach((dr) => {
      [-1, 1].forEach((dc) => {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          if (currentBoard[nr][nc] === EMPTY) moves.push({ r: nr, c: nc });
          else {
            const isOpponent = (piece === P1 || piece === P1_KING) ? (currentBoard[nr][nc] === P2 || currentBoard[nr][nc] === P2_KING) : (currentBoard[nr][nc] === P1 || currentBoard[nr][nc] === P1_KING);
            if (isOpponent) {
              const jr = nr + dr, jc = nc + dc;
              if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && currentBoard[jr][jc] === EMPTY) moves.push({ r: jr, c: jc, jump: { r: nr, c: nc } });
            }
          }
        }
      });
    });
    return moves;
  };

  const getAllValidMoves = (playerToMove: number, currentBoard: number[][]) => {
    const allMoves: { from: { r: number; c: number }; move: any }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if ((playerToMove === P1 && (piece === P1 || piece === P1_KING)) || (playerToMove === P2 && (piece === P2 || piece === P2_KING))) {
          getValidMovesForPiece(r, c, piece, currentBoard).forEach(move => allMoves.push({ from: { r, c }, move }));
        }
      }
    }
    return allMoves;
  };

  const handleSquareClick = async (r: number, c: number) => {
    if (winner || playMode === "menu" || playMode === "searching" || playMode === "confirmed" || playMode === "host" || playMode === "join") return;
    if (playMode === "online" && turn !== myPlayerRole) return;
    if (playMode === "bot" && turn === P2) return; // Disallow human moving bot pieces

    const piece = board[r][c];
    const allPlayerMoves = getAllValidMoves(turn, board);
    const hasMandatoryJump = allPlayerMoves.some(m => m.move.jump);

    if ((turn === P1 && (piece === P1 || piece === P1_KING)) || (turn === P2 && (piece === P2 || piece === P2_KING))) {
      if (hasMandatoryJump && !allPlayerMoves.some(m => m.move.jump && m.from.r === r && m.from.c === c)) return;
      setSelected({ r, c });
      return;
    }

    if (selected && piece === EMPTY) {
      const pieceMoves = getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board);
      const allowedMoves = hasMandatoryJump ? pieceMoves.filter(m => m.jump) : pieceMoves;
      const move = allowedMoves.find((m) => m.r === r && m.c === c);
      
      if (move) {
        const newBoard = board.map((row) => [...row]);
        let movingPiece = newBoard[selected.r][selected.c];
        newBoard[selected.r][selected.c] = EMPTY;
        newBoard[r][c] = movingPiece;

        let newP1Cap = p1Captures, newP2Cap = p2Captures;
        if (move.jump) {
          newBoard[move.jump.r][move.jump.c] = EMPTY;
          if (turn === P1) newP1Cap++; else newP2Cap++;
        }

        if (turn === P1 && r === 0) newBoard[r][c] = P1_KING;
        if (turn === P2 && r === 7) newBoard[r][c] = P2_KING;

        const nextTurn = turn === P1 ? P2 : P1;
        const nextMoves = getAllValidMoves(nextTurn, newBoard);
        
        let newWinner = null;
        let newP1Score = p1Score;
        let newP2Score = p2Score;
        
        if (nextMoves.length === 0) {
          newWinner = turn; 
          if (turn === P1) newP1Score++; else newP2Score++;
        }

        if (playMode === "online") {
          setBoard(newBoard); setSelected(null);
          await supabase.from('checkers_matches').update({
            board: newBoard, turn: nextTurn, p1_captures: newP1Cap, p2_captures: newP2Cap, 
            winner: newWinner, p1_score: newP1Score, p2_score: newP2Score
          }).eq('id', matchId);
        } else {
          setBoard(newBoard); setTurn(nextTurn); setP1Captures(newP1Cap); setP2Captures(newP2Cap);
          setWinner(newWinner); setP1Score(newP1Score); setP2Score(newP2Score); setSelected(null);
        }
      }
    }
  };

  const handleRematch = async () => {
    const nextStartingTurn = winner === P1 ? P2 : P1;
    if (playMode === "online") {
      await supabase.from('checkers_matches').update({
        board: INITIAL_BOARD, turn: nextStartingTurn, winner: null, p1_captures: 0, p2_captures: 0
      }).eq('id', matchId);
    } else {
      setBoard(INITIAL_BOARD); setTurn(nextStartingTurn); setWinner(null); setP1Captures(0); setP2Captures(0);
    }
  };

  const sendEmoji = async (emoji: string) => {
    setShowEmojiMenu(false);
    if (playMode === "online") {
      supabase.channel(`match_${matchId}`).send({
        type: 'broadcast', event: 'emoji', payload: { emoji, role: myPlayerRole }
      });
    } else {
      const newEmoji = { id: Date.now(), emoji, role: turn };
      setFloatingEmojis(prev => [...prev, newEmoji]);
      setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id)), 2500);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPlayableSquare = (r: number, c: number) => (r + c) % 2 === 1;
  const viewIndices = [0, 1, 2, 3, 4, 5, 6, 7];
  
  // 🧭 FIXED: Board ONLY flips in Online Mode when you are Player 2. Local mode stays locked!
  const shouldFlipBoard = playMode === "online" && myPlayerRole === P2;
  
  const validMovesForSelected = selected ? getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board) : [];
  const activeMoveTargets = getAllValidMoves(turn, board).some(m => m.move.jump) ? validMovesForSelected.filter(m => m.jump) : validMovesForSelected;
  
  const isBotOpponent = opponent?.isBot || localOpponent?.isBot || playMode === "bot";

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-[#09090b] flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors">
      
      {/* 🎊 INLINE STYLES FOR CELEBRATION CONFETTI */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg) scale(0.8); opacity: 0; }
        }
      `}</style>

      {/* =========================================
          LOBBY MENU: MODERN DARK ARENA HUB
          ========================================= */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-[#09090b] flex items-center justify-center p-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-2xl text-neutral-300">grid_4x4</span>
              </div>
              <div>
                <h1 className="font-headline font-black text-xl tracking-tight text-white">Checkers Arena</h1>
                <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
              </div>
            </div>

            {/* Online Match Button (CCFF00 Theme) */}
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

            {/* Private & Offline Match Buttons */}
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

              <button onClick={() => setPlayMode("local")} className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]">
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

            {/* 👇 IMPLEMENTED: Join Room Input flex fix for mobile */}
            <div className="flex items-center gap-2 w-full mb-6">
              <div className="relative flex-1 min-w-0 flex items-center bg-[#09090b] border border-white/10 rounded-2xl p-1.5">
                <div className="pl-3 pr-2 text-neutral-500 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">vpn_key</span>
                </div>
                <input
                  type="text"
                  placeholder="ENTER ROOM CODE..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 bg-transparent text-sm font-headline font-bold text-white placeholder-neutral-600 focus:outline-none uppercase tracking-widest"
                  maxLength={6}
                />
              </div>
              <button
                onClick={() => joinMatch()}
                disabled={joinCode.length < 6}
                className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5"
              >
                Join
              </button>
            </div>

            <button onClick={onClose} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase">
              <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
            </button>

          </div>
        </div>
      )}

      {/* 📡 LOCATING OPPONENT SCREEN */}
      {playMode === "searching" && (
        <div className="absolute inset-0 z-[60] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in">
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
          <button onClick={() => setPlayMode("menu")} className="bg-[#18181b] text-white px-8 py-3 rounded-full font-headline font-bold text-sm border border-white/10 hover:bg-white/10 transition-colors active:scale-95">
            Abort Search
          </button>
        </div>
      )}

      {/* 🤝 MATCH CONFIRMED SCREEN */}
      {playMode === "confirmed" && (
        <div className="absolute inset-0 z-[60] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in">
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
            
            {/* 👇 IMPLEMENTED: Use bot human avatar icon */}
            <div className="w-20 h-20 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center rotate-[5deg] shadow-2xl overflow-hidden relative z-10">
              <span className="material-symbols-outlined text-4xl text-indigo-400">
                {localOpponent?.avatarIcon || "person"}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase mb-1">Opposing Player</p>
          {/* 👇 IMPLEMENTED: Use human-like generated Bot Name */}
          <h2 className="font-headline font-black text-3xl text-white mb-2">{localOpponent?.name || "Player 2"}</h2>
          <p className="text-sm text-neutral-400 flex items-center gap-2 mb-12">
            <span className="w-2 h-2 rounded-full bg-[#CCFF00]"></span> Ranked • {localOpponent?.elo || 1200} ELO
          </p>

          <button onClick={enterBotMatch} className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)]">
            Enter Match <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}

      {/* --- IN-GAME ARENA --- */}
      {playMode !== "menu" && playMode !== "searching" && playMode !== "confirmed" && (
        <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-30 shrink-0">
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 active:scale-90 transition-all shadow-sm">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="text-center">
            <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Checkers Matrix</h1>
            <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 mt-0.5 ${playMode === "online" || playMode === "bot" ? "text-emerald-500" : playMode === "host" || playMode === "join" ? "text-amber-500" : "text-neutral-400"}`}>
              {(playMode === "online" || playMode === "host" || playMode === "join" || playMode === "bot") && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>}
              {playMode === "online" ? "Live Network" : playMode === "bot" ? "Bot Match" : playMode === "host" || playMode === "join" ? "Connecting..." : "Local Mode"}
            </span>
          </div>
          
          <div className="relative">
            <button onClick={() => setShowEmojiMenu(!showEmojiMenu)} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 active:scale-90 transition-all shadow-sm">
              <span className="material-symbols-outlined text-lg">add_reaction</span>
            </button>
            
            {showEmojiMenu && (
              <div className="absolute top-12 right-0 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-2 rounded-2xl shadow-xl flex gap-1 z-50">
                {EMOJIS.map(em => (
                  <button key={em} onClick={() => sendEmoji(em)} className="text-xl hover:scale-125 transition-transform p-1">{em}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- HOSTING / JOINING WAITING SCREEN --- */}
      {(playMode === "host" || playMode === "join") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 relative">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-8 w-full shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/10 dark:bg-amber-500/20 blur-3xl rounded-full pointer-events-none"></div>
            <div className="w-16 h-16 rounded-full border-[3px] border-amber-100 dark:border-amber-900/30 border-t-amber-500 dark:border-t-amber-500 animate-spin mb-6 relative z-10"></div>
            <h2 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight uppercase relative z-10">
              {playMode === "join" ? "Syncing Matrix..." : "Awaiting Opponent"}
            </h2>
            
            {playMode === "host" && (
              <div className="mt-8 w-full relative z-10">
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2">Share This Room Code</p>
                <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2.5 rounded-2xl flex items-center justify-between shadow-inner">
                  <span className="text-amber-600 dark:text-amber-400 font-mono text-2xl font-black tracking-[0.25em] pl-4 pt-1">{roomCode}</span>
                  <button 
                    onClick={handleCopyCode}
                    className={`h-11 px-5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                      copied 
                        ? "bg-emerald-500 text-white" 
                        : "bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:scale-[1.02] active:scale-95"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <button onClick={() => playMode === "host" ? setPlayMode("menu") : onClose()} className="w-full mt-8 py-3.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 relative z-10">
              Cancel Match
            </button>
          </div>
        </div>
      )}

      {(playMode === "local" || playMode === "online" || playMode === "bot") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col justify-start min-h-0 relative z-10">
          
          {/* Scoreboard HUD */}
          <div className="px-6 py-4 flex justify-between items-center shrink-0">
            <div className={`flex flex-col items-center transition-all duration-300 ${turn === P2 ? "scale-105 opacity-100" : "opacity-60 grayscale"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-black text-[#5c3a21] dark:text-[#cfaa75]">{p2Score}</span>
                <span className="text-[8px] text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Wins</span>
              </div>
              
              <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center shadow-md bg-[#4d2f1d] border-[#362114] text-white relative`}>
                {isBotOpponent ? (
                  <span className="material-symbols-outlined text-[20px]">{localOpponent?.avatarIcon || "person"}</span>
                ) : (
                  <span className="font-black text-sm">P2</span>
                )}
                {isBotOpponent && (
                  <span className="absolute -bottom-2 bg-indigo-500 text-white text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-wider shadow-sm">BOT</span>
                )}
              </div>
              
              <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 mt-2 uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
                Cap: {p2Captures}
              </span>
            </div>
            
            <div className="text-center px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full shadow-sm">
              <span className="text-[10px] font-black text-neutral-900 dark:text-white uppercase tracking-widest">
                {playMode === "online" || playMode === "bot" 
                  ? (turn === myPlayerRole ? "Your Turn" : "Opponent's Turn") 
                  : (turn === P1 ? "Player 1 Turn" : "Player 2 Turn")}
              </span>
            </div>

            <div className={`flex flex-col items-center transition-all duration-300 ${turn === P1 ? "scale-105 opacity-100" : "opacity-60 grayscale"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[8px] text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Wins</span>
                <span className="text-xs font-black text-[#f3ead3] dark:text-white">{p1Score}</span>
              </div>
              <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center shadow-md bg-[#f3ead3] border-[#dccfb4] text-[#8a7f6b]`}>
                <span className="font-black text-sm">P1</span>
              </div>
              <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 mt-2 uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
                Cap: {p1Captures}
              </span>
            </div>
          </div>

          {/* Flexible Board Container */}
          <div className="flex-1 w-full flex items-center justify-center px-4 pb-6 min-h-0 relative">
            
            {/* FLOATING EMOJI LAYER */}
            {floatingEmojis.map((em) => {
              const isMine = em.role === myPlayerRole;
              return (
                <div key={em.id} className={`absolute z-40 text-4xl animate-float-up pointer-events-none ${
                  isMine ? "right-10 bottom-10" : "left-10 top-10"
                }`}>
                  {em.emoji}
                </div>
              );
            })}

            {/* 🎉 VICTORY CELEBRATION DIALOG */}
            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in overflow-hidden">
                
                {/* Darken Background */}
                <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-md rounded-[2.5rem]"></div>
                
                {/* 🎊 RENDER CONFETTI PARTICLES */}
                {confettiPieces.map(p => (
                  <div key={p.id} className="absolute top-0 z-[60] pointer-events-none" style={{
                    left: p.left,
                    width: '6px',
                    height: '14px',
                    backgroundColor: p.color,
                    borderRadius: '4px',
                    animation: `confetti-fall ${p.animDuration} linear ${p.animDelay} infinite`,
                  }} />
                ))}

                <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full shadow-[0_20px_40px_rgba(0,0,0,0.2)] flex flex-col items-center text-center z-50">
                  <div className="absolute inset-0 bg-gradient-to-t from-[#CCFF00]/10 to-transparent rounded-3xl pointer-events-none"></div>

                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#CCFF00] to-green-500 text-black flex items-center justify-center mb-5 shadow-[0_4px_20px_rgba(204,255,0,0.4)] border-4 border-[#CCFF00] dark:border-green-900 animate-bounce">
                    <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                  </div>
                  
                  <h3 className="text-[10px] font-black text-[#CCFF00] tracking-widest uppercase mb-1">
                    Match Concluded
                  </h3>
                  <h2 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight uppercase">
                    Congratulations!
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mt-3">
                    {playMode === "online" || playMode === "bot"
                      ? (winner === myPlayerRole ? "You outsmarted your opponent and claimed victory." : "Your opponent won this round.")
                      : `Player ${winner} has completely dominated the board.`}
                  </p>
                  
                  <div className="w-full flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-sm">Exit Arena</button>
                    <button onClick={handleRematch} className="flex-1 py-3.5 bg-[#CCFF00] text-black font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(204,255,0,0.3)] hover:bg-[#b3e600]">Play Again</button>
                  </div>
                </div>
              </div>
            )}

            {/* CLASSIC WOODEN BOARD FRAME */}
            <div className="w-full max-h-full aspect-square bg-[#e6c48f] rounded-[1.5rem] p-3 shadow-[0_15px_35px_rgba(0,0,0,0.3)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.8)] border border-[#cfaa75] relative">
              <div className={`w-full h-full grid grid-cols-8 grid-rows-8 border-4 border-[#333] shadow-[inset_0_0_20px_rgba(0,0,0,0.4)] transition-transform duration-500 ${
                shouldFlipBoard ? "rotate-180" : "rotate-0"
              }`}>
                {viewIndices.map((r) => 
                  viewIndices.map((c) => {
                    const playable = isPlayableSquare(r, c);
                    
                    const squareClass = playable 
                      ? "bg-[#1a1a1a] shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)] cursor-pointer" 
                      : "bg-[#e6c48f]";
                    
                    const isSelected = selected?.r === r && selected?.c === c;
                    const isTarget = activeMoveTargets.some((m) => m.r === r && m.c === c);
                    const piece = board[r][c];
                    
                    // 🪵 PREMIUM WOODEN PIECE STYLING
                    let pieceOuter = "";
                    let pieceRing = "";
                    let pieceCenter = "";
                    let starColor = "";
                    
                    if (piece === P1 || piece === P1_KING) {
                      pieceOuter = "bg-[#f3ead3] shadow-[0_4px_6px_rgba(0,0,0,0.5)]";
                      pieceRing = "border-[#dccfb4]";
                      pieceCenter = "bg-[#dccfb4]";
                      starColor = "text-[#bdae93]";
                    } else if (piece === P2 || piece === P2_KING) {
                      pieceOuter = "bg-[#4d2f1d] shadow-[0_4px_6px_rgba(0,0,0,0.6)]";
                      pieceRing = "border-[#362114]";
                      pieceCenter = "bg-[#362114]";
                      starColor = "text-[#24160d]";
                    }

                    return (
                      <div 
                        key={`${r}-${c}`}
                        onClick={() => playable && handleSquareClick(r, c)}
                        className={`relative w-full h-full flex items-center justify-center transition-colors ${squareClass} ${isSelected ? "ring-inset ring-2 ring-[#4f46e5] bg-indigo-900/40" : ""} ${isTarget ? "bg-[#CCFF00]/30" : ""}`}
                      >
                        {isTarget && <div className="w-3 h-3 rounded-full bg-[#CCFF00] shadow-[0_0_10px_rgba(204,255,0,0.8)] animate-pulse"></div>}

                        {piece !== EMPTY && (
                          <div className={`w-[85%] h-[85%] rounded-full flex items-center justify-center transition-all duration-300 ${pieceOuter} ${shouldFlipBoard ? "rotate-180" : "rotate-0"} ${isSelected ? "scale-110 ring-4 ring-[#4f46e5]" : ""}`}>
                             <div className={`w-[75%] h-[75%] rounded-full border-[1.5px] flex items-center justify-center ${pieceRing}`}>
                                 <div className={`w-[50%] h-[50%] rounded-full border-[1.5px] flex items-center justify-center ${pieceRing}`}>
                                     {(piece === P1_KING || piece === P2_KING) 
                                         ? <span className={`material-symbols-outlined text-[20px] drop-shadow-sm ${starColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>star</span> 
                                         : <div className={`w-[30%] h-[30%] rounded-full ${pieceCenter}`}></div>}
                                 </div>
                             </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}