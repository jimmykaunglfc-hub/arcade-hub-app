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
  const validMovesForSelected = selected ? getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board) : [];
  const activeMoveTargets = getAllValidMoves(turn, board).some(m => m.move.jump) ? validMovesForSelected.filter(m => m.jump) : validMovesForSelected;

  const viewIndices = [0, 1, 2, 3, 4, 5, 6, 7];
  const shouldFlipBoard = playMode === "online" && myPlayerRole === P2;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors">
      
      {/* --- LOBBY WAITING SCREENS --- */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-neutral-100/90 dark:bg-neutral-950/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2rem] p-8 w-full max-w-sm shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-800 mb-4 shadow-[0_4px_10px_rgba(79,70,229,0.1)]">
                <span className="material-symbols-outlined text-4xl">grid_4x4</span>
              </div>
              <h2 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight">Checkers Arena</h2>
            </div>
            
            <div className="space-y-3">
              <button onClick={() => setPlayMode("local")} className="w-full h-12 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all active:scale-95 shadow-sm border border-neutral-200 dark:border-neutral-700">Local Pass & Play</button>
              <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 my-4"></div>
              <button onClick={hostMatch} className="w-full h-12 bg-indigo-600 text-white font-bold uppercase tracking-wider rounded-xl hover:bg-indigo-700 transition-all active:scale-95 shadow-md">Host Network Match</button>
              
              <div className="flex gap-2">
                <input 
                  type="text" maxLength={6} placeholder="6-Digit Code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 text-xs font-black tracking-widest text-neutral-900 dark:text-white focus:outline-none focus:border-indigo-500 uppercase transition-colors"
                />
                <button onClick={() => joinMatch()} className="px-5 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-xs uppercase rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-sm">Join</button>
              </div>
            </div>
            <button onClick={onClose} className="w-full text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest mt-4">Exit Arena</button>
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
          <span className={`text-[9px] font-bold uppercase tracking-widest ${playMode === "online" ? "text-emerald-500 animate-pulse" : playMode === "host" || playMode === "join" ? "text-indigo-500 animate-pulse" : "text-neutral-400"}`}>
            {playMode === "online" ? "● Live Network" : playMode === "host" || playMode === "join" ? "Connecting..." : "Local Mode"}
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
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-100 dark:border-indigo-900/30 border-t-indigo-600 dark:border-t-indigo-500 animate-spin mb-6"></div>
            <h2 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight uppercase">
              {playMode === "join" ? "Connecting..." : "Awaiting Opponent"}
            </h2>
            
            {playMode === "host" && (
              <div className="mt-6 w-full">
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2">Share Room Code</p>
                <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-3 rounded-2xl flex items-center justify-between">
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono text-2xl font-black tracking-[0.2em] pl-4">{roomCode}</span>
                  <button 
                    onClick={handleCopyCode}
                    className={`h-10 px-4 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                      copied ? "bg-emerald-500 text-white" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            
            <button onClick={() => playMode === "host" ? setPlayMode("menu") : onClose()} className="w-full mt-8 py-3.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-sm">
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
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{shouldFlipBoard ? p1Score : p2Score}</span>
                <span className="text-[8px] text-neutral-500 dark:text-neutral-400 uppercase tracking-widest">Wins</span>
              </div>
              <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center shadow-md bg-white dark:bg-neutral-900 ${
                shouldFlipBoard ? "border-indigo-500 text-indigo-500" : "border-emerald-500 text-emerald-500"
              }`}>
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
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{shouldFlipBoard ? p2Score : p1Score}</span>
              </div>
              <div className={`w-12 h-12 rounded-full border-[3px] flex items-center justify-center shadow-md bg-white dark:bg-neutral-900 ${
                shouldFlipBoard ? "border-emerald-500 text-emerald-500" : "border-indigo-500 text-indigo-500"
              }`}>
                <span className="font-black text-sm">{shouldFlipBoard ? "P2" : "P1"}</span>
              </div>
              <span className="text-[9px] font-bold text-neutral-500 dark:text-neutral-400 mt-2 uppercase tracking-wider bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700">
                Cap: {shouldFlipBoard ? p2Captures : p1Captures}
              </span>
            </div>
          </div>

          {/* 8x8 Flexible Board Container */}
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

            {/* CASINO-GRADE BOARD FRAME */}
            <div className="w-full max-h-full aspect-square bg-gradient-to-b from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 rounded-3xl p-2 shadow-[0_15px_35px_rgba(0,0,0,0.2)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.6)] border border-white/60 dark:border-white/10 relative">
              <div className={`w-full h-full grid grid-cols-8 grid-rows-8 rounded-2xl overflow-hidden border-4 border-neutral-800 dark:border-black bg-neutral-800 dark:bg-black shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] transition-transform duration-500 ${
                shouldFlipBoard ? "rotate-180" : "rotate-0"
              }`}>
                {viewIndices.map((r) => 
                  viewIndices.map((c) => {
                    const actualR = shouldFlipBoard ? 7 - r : r;
                    const actualC = shouldFlipBoard ? 7 - c : c;
                    
                    const playable = isPlayableSquare(actualR, actualC);
                    
                    // High Contrast Premium Squares
                    const squareClass = playable 
                      ? "bg-neutral-800 dark:bg-neutral-900 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] cursor-pointer" 
                      : "bg-neutral-300 dark:bg-neutral-200";
                    
                    const isSelected = selected?.r === actualR && selected?.c === actualC;
                    const isTarget = activeMoveTargets.some((m) => m.r === actualR && m.c === actualC);
                    const piece = board[actualR][actualC];
                    
                    // 🎲 3D TACTILE POKER CHIP RENDERING
                    let chipOuter = "";
                    let chipInner = "";
                    
                    if (piece === P1 || piece === P1_KING) {
                      chipOuter = "bg-gradient-to-b from-indigo-400 to-indigo-800 shadow-[0_5px_10px_rgba(0,0,0,0.5),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-4px_4px_rgba(0,0,0,0.4)] ring-1 ring-indigo-900";
                      chipInner = "border-[2px] border-indigo-900/60 bg-gradient-to-br from-indigo-500 to-indigo-900 shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)]";
                    } else if (piece === P2 || piece === P2_KING) {
                      chipOuter = "bg-gradient-to-b from-emerald-400 to-emerald-800 shadow-[0_5px_10px_rgba(0,0,0,0.5),inset_0_2px_2px_rgba(255,255,255,0.4),inset_0_-4px_4px_rgba(0,0,0,0.4)] ring-1 ring-emerald-900";
                      chipInner = "border-[2px] border-emerald-900/60 bg-gradient-to-br from-emerald-500 to-emerald-900 shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)]";
                    }

                    return (
                      <div 
                        key={`${r}-${c}`}
                        onClick={() => playable && handleSquareClick(actualR, actualC)}
                        className={`relative w-full h-full flex items-center justify-center transition-colors ${squareClass} ${isSelected ? "ring-inset ring-2 ring-indigo-400 bg-indigo-900/40" : ""} ${isTarget ? "bg-indigo-500/30" : ""}`}
                      >
                        {isTarget && <div className="w-3 h-3 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)] animate-pulse"></div>}

                        {piece !== EMPTY && (
                          <div className={`w-[85%] h-[85%] rounded-full flex items-center justify-center transition-all duration-300 ${chipOuter} ${shouldFlipBoard ? "rotate-180" : "rotate-0"} ${isSelected ? "scale-110 ring-4 ring-white dark:ring-neutral-900" : ""}`}>
                            
                            {/* Inner Core of the Poker Chip */}
                            <div className={`w-[70%] h-[70%] rounded-full flex items-center justify-center ${chipInner}`}>
                                {(piece === P1_KING || piece === P2_KING) && <span className="material-symbols-outlined text-[18px] text-white/90 drop-shadow-md" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>}
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