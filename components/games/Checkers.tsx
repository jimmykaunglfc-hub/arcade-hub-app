"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

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

export default function Checkers({ 
  onClose, 
  preloadedMatchId 
}: { 
  onClose: () => void;
  preloadedMatchId?: string | null;
}) {
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online">(
    preloadedMatchId ? "join" : "menu"
  );
  
  const [matchId, setMatchId] = useState<string>("");
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

  useEffect(() => { if (preloadedMatchId && myUserId) joinDirectlyByUUID(preloadedMatchId); }, [preloadedMatchId, myUserId]);

  const joinDirectlyByUUID = async (uuid: string) => {
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
    if (winner || playMode === "menu" || playMode === "host" || playMode === "join") return;
    if (playMode === "online" && turn !== myPlayerRole) return;

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
  
  // 🧭 P2 Reverse Setup FIX: In local mode, board spins for each player's turn automatically!
  const shouldFlipBoard = playMode === "local" ? turn === P2 : myPlayerRole === P2;
  const validMovesForSelected = selected ? getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board) : [];
  const activeMoveTargets = getAllValidMoves(turn, board).some(m => m.move.jump) ? validMovesForSelected.filter(m => m.jump) : validMovesForSelected;


  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors">
      
      {/* =========================================
          LOBBY MENU: PREMIUM ARENA HUB
          ========================================= */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-neutral-100/90 dark:bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 rounded-[2.5rem] p-6 w-full max-w-sm shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full pointer-events-none"></div>

            <div className="text-center pt-2 relative z-10">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/40 dark:to-indigo-800/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-200/50 dark:border-indigo-700/50 mb-3 shadow-[0_8px_16px_rgba(79,70,229,0.15)]">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>grid_4x4</span>
              </div>
              <h2 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">Checkers Arena</h2>
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mt-1">Select Engagement Mode</p>
            </div>
            
            <div className="space-y-3 relative z-10">
              <button onClick={hostMatch} className="group w-full h-14 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white flex items-center justify-between px-5 rounded-2xl hover:opacity-90 transition-all active:scale-[0.98] shadow-[0_8px_20px_rgba(79,70,229,0.25)] border border-indigo-400/50 dark:border-indigo-400/20">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-indigo-100">language</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-white">Host Network Match</span>
                </div>
                <span className="material-symbols-outlined text-indigo-200 group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>

              <button onClick={() => setPlayMode("local")} className="group w-full h-14 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between px-5 rounded-2xl border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-[0.98] shadow-sm text-neutral-800 dark:text-neutral-200">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500">group</span>
                  <span className="font-bold text-xs uppercase tracking-wider">Local Pass & Play</span>
                </div>
                <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>
            </div>

            <div className="flex items-center gap-3 relative z-10">
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800"></div>
              <span className="text-[9px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">Or Join Room</span>
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800"></div>
            </div>
            
            <div className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded-[1.25rem] border border-neutral-200 dark:border-neutral-800 flex items-center shadow-inner relative z-10">
              <input type="text" maxLength={6} placeholder="CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} className="flex-1 bg-transparent text-center text-lg font-black tracking-[0.3em] placeholder-neutral-300 dark:placeholder-neutral-700 text-neutral-900 dark:text-white focus:outline-none uppercase"/>
              <button onClick={() => joinMatch()} disabled={joinCode.length < 6} className={`h-11 px-6 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm ${joinCode.length === 6 ? "bg-neutral-900 dark:bg-white text-white dark:text-black hover:scale-[1.02] active:scale-95 cursor-pointer" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed border border-transparent"}`}>Join</button>
            </div>

            <div className="pt-2 relative z-10">
              <button onClick={onClose} className="w-full flex items-center justify-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest hover:text-neutral-900 dark:hover:text-white transition-colors py-2">
                <span className="material-symbols-outlined text-sm">exit_to_app</span>
                Exit Arena
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- IN-GAME ARENA --- */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-30 shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 active:scale-90 transition-all shadow-sm">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Checkers Matrix</h1>
          <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 mt-0.5 ${playMode === "online" ? "text-emerald-500" : playMode === "host" || playMode === "join" ? "text-indigo-500" : "text-neutral-400"}`}>
            {(playMode === "online" || playMode === "host" || playMode === "join") && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>}
            {playMode === "online" ? "Live Network" : playMode === "host" || playMode === "join" ? "Connecting..." : "Local Mode"}
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

      {/* --- HOSTING / JOINING WAITING SCREEN --- */}
      {(playMode === "host" || playMode === "join") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 relative">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-8 w-full shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/10 dark:bg-indigo-500/20 blur-3xl rounded-full pointer-events-none"></div>
            <div className="w-16 h-16 rounded-full border-[3px] border-indigo-100 dark:border-indigo-900/30 border-t-indigo-600 dark:border-t-indigo-500 animate-spin mb-6 relative z-10"></div>
            <h2 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight uppercase relative z-10">
              {playMode === "join" ? "Syncing Matrix..." : "Awaiting Opponent"}
            </h2>
            
            {playMode === "host" && (
              <div className="mt-8 w-full relative z-10">
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2">Share This Room Code</p>
                <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2.5 rounded-2xl flex items-center justify-between shadow-inner">
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono text-2xl font-black tracking-[0.25em] pl-4 pt-1">{roomCode}</span>
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

      {(playMode === "local" || playMode === "online") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col justify-start min-h-0 relative">
          
          {/* Scoreboard HUD */}
          <div className="px-6 py-4 flex justify-between items-center shrink-0">
            <div className={`flex flex-col items-center transition-all duration-300 ${turn === (shouldFlipBoard ? P1 : P2) ? "scale-105 opacity-100" : "opacity-60 grayscale"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-xs font-black text-[#5c3a21] dark:text-[#cfaa75]">{shouldFlipBoard ? p1Score : p2Score}</span>
                <span className="text-[8px] text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Wins</span>
              </div>
              <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center shadow-md bg-[#4d2f1d] border-[#362114] text-white`}>
                <span className="font-black text-sm">{shouldFlipBoard ? "P1" : "P2"}</span>
              </div>
              <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 mt-2 uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
                Cap: {shouldFlipBoard ? p1Captures : p2Captures}
              </span>
            </div>
            
            <div className="text-center px-4 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-full shadow-sm">
              <span className="text-[10px] font-black text-neutral-900 dark:text-white uppercase tracking-widest">
                {playMode === "online" ? (turn === myPlayerRole ? "Your Turn" : "Opponent's Turn") : (turn === P1 ? "Player 1 Turn" : "Player 2 Turn")}
              </span>
            </div>

            <div className={`flex flex-col items-center transition-all duration-300 ${turn === (shouldFlipBoard ? P2 : P1) ? "scale-105 opacity-100" : "opacity-60 grayscale"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[8px] text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Wins</span>
                <span className="text-xs font-black text-[#f3ead3] dark:text-white">{shouldFlipBoard ? p2Score : p1Score}</span>
              </div>
              <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center shadow-md bg-[#f3ead3] border-[#dccfb4] text-[#8a7f6b]`}>
                <span className="font-black text-sm">{shouldFlipBoard ? "P2" : "P1"}</span>
              </div>
              <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 mt-2 uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
                Cap: {shouldFlipBoard ? p2Captures : p1Captures}
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

            {/* VICTORY DIALOG */}
            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
                <div className="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-md rounded-[2.5rem]"></div>
                <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full shadow-2xl flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 border border-indigo-100 dark:border-indigo-800 shadow-[0_4px_15px_rgba(79,70,229,0.15)]">
                    <span className="material-symbols-outlined text-4xl">emoji_events</span>
                  </div>
                  <h2 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight uppercase">
                    {playMode === "online" 
                      ? (winner === myPlayerRole ? "You Win!" : "Opponent Wins!")
                      : `Player ${winner} Wins!`}
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-2">
                    {winner === P1 ? "Player 1" : "Player 2"} trapped all pieces.
                  </p>
                  
                  <div className="w-full flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-sm">Exit</button>
                    <button onClick={handleRematch} className="flex-1 py-3 bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-md">Play Next Round</button>
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
                    // Logic fix: No actualR/actualC coordinate manipulation here. 
                    // The CSS "rotate-180" on the container handles the flip natively!
                    const playable = isPlayableSquare(r, c);
                    
                    // High Contrast Checkers Squares
                    const squareClass = playable 
                      ? "bg-[#1a1a1a] shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)] cursor-pointer" 
                      : "bg-[#e6c48f]"; // Matches the frame
                    
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
                        className={`relative w-full h-full flex items-center justify-center transition-colors ${squareClass} ${isSelected ? "ring-inset ring-2 ring-[#4f46e5] bg-indigo-900/40" : ""} ${isTarget ? "bg-indigo-500/30" : ""}`}
                      >
                        {/* Glowing move target indicator */}
                        {isTarget && <div className="w-3 h-3 rounded-full bg-[#4f46e5] shadow-[0_0_10px_rgba(79,70,229,0.8)] animate-pulse"></div>}

                        {/* Rendering the carved piece */}
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