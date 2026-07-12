"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

// --- GAME CONSTANTS ---
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

export default function Checkers({ 
  onClose, 
  preloadedMatchId 
}: { 
  onClose: () => void;
  preloadedMatchId?: string | null;
}) {
  // --- MULTIPLAYER STATES ---
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online">(
    preloadedMatchId ? "join" : "menu"
  );
  const [matchId, setMatchId] = useState<string>("");
  const [joinCode, setJoinCode] = useState<string>("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<number>(P1);

  // --- ENGINE STATES ---
  const [board, setBoard] = useState<number[][]>(INITIAL_BOARD);
  const [turn, setTurn] = useState<number>(P1);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [p1Captures, setP1Captures] = useState(0);
  const [p2Captures, setP2Captures] = useState(0);
  const [winner, setWinner] = useState<number | null>(null);

  // 1. Fetch current user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null));
  }, []);

  // 2. Realtime WebSocket Listener
  useEffect(() => {
    if (playMode !== "online" && playMode !== "host") return;
    if (!matchId) return;

    const channel = supabase.channel(`match_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'checkers_matches', filter: `id=eq.${matchId}` }, (payload) => {
        const newData = payload.new;
        setBoard(newData.board);
        setTurn(newData.turn);
        setP1Captures(newData.p1_captures);
        setP2Captures(newData.p2_captures);
        setWinner(newData.winner);
        if (newData.status === 'playing' && playMode === "host") setPlayMode("online");
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId, playMode]);

  // --- MULTIPLAYER LOBBY HANDLERS ---
  const hostMatch = async () => {
    if (!myUserId) return alert("Must be logged in to play online.");
    const { data, error } = await supabase.from('checkers_matches').insert({
      p1_id: myUserId,
      board: INITIAL_BOARD
    }).select().single();

    if (data) {
      setMatchId(data.id);
      setMyPlayerRole(P1);
      setPlayMode("host");
    }
  };

  const joinMatch = async (overrideCode?: string) => {
    const codeToJoin = typeof overrideCode === 'string' ? overrideCode : joinCode;
    if (!myUserId || !codeToJoin) return;
    
    const { data, error } = await supabase.from('checkers_matches')
      .update({ p2_id: myUserId, status: 'playing' })
      .eq('id', codeToJoin).select().single();

    if (data) {
      setMatchId(data.id);
      setMyPlayerRole(P2);
      setBoard(data.board);
      setTurn(data.turn);
      setPlayMode("online");
    } else {
      alert("Invalid Room Code or Match Already Started.");
      setPlayMode("menu");
    }
  };

  // 3. Auto-Join interceptor (Triggers when entering from an Invite)
  useEffect(() => {
    if (preloadedMatchId && myUserId) {
      joinMatch(preloadedMatchId);
    }
  }, [preloadedMatchId, myUserId]);

  // --- CORE INTELLIGENCE ---
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

  // --- GAMEPLAY HANDLERS ---
  const handleSquareClick = async (r: number, c: number) => {
    if (winner || playMode === "menu" || playMode === "host" || playMode === "join") return;
    
    // 🌐 MULTIPLAYER LOCK: Prevent playing out of turn
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
        const newWinner = nextMoves.length === 0 ? turn : null;

        if (playMode === "online") {
          setBoard(newBoard); 
          setSelected(null);
          await supabase.from('checkers_matches').update({
            board: newBoard, turn: nextTurn, p1_captures: newP1Cap, p2_captures: newP2Cap, winner: newWinner
          }).eq('id', matchId);
        } else {
          setBoard(newBoard);
          setTurn(nextTurn);
          setP1Captures(newP1Cap);
          setP2Captures(newP2Cap);
          setWinner(newWinner);
          setSelected(null);
        }
      }
    }
  };

  // --- RENDERING VARS ---
  const isPlayableSquare = (r: number, c: number) => (r + c) % 2 === 1;
  const validMovesForSelected = selected ? getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board) : [];
  const activeMoveTargets = getAllValidMoves(turn, board).some(m => m.move.jump) ? validMovesForSelected.filter(m => m.jump) : validMovesForSelected;

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden">
      
      {/* 🎮 MAIN MENU LOBBY */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-gradient-to-b from-surface-variant/40 to-surface border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="material-symbols-outlined text-5xl text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]">grid_4x4</span>
              <h2 className="text-2xl font-black text-white tracking-tight">Neon Checkers</h2>
            </div>
            
            <div className="space-y-3">
              <button onClick={() => setPlayMode("local")} className="w-full h-12 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]">Pass & Play (Local)</button>
              <div className="h-px w-full bg-white/10 my-4"></div>
              <button onClick={hostMatch} className="w-full h-12 bg-blue-500/20 border border-blue-400 text-blue-400 font-black uppercase tracking-widest rounded-xl hover:bg-blue-500/30 transition-all active:scale-95">Host Online Room</button>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Paste Room Code..." 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
                />
                <button onClick={() => joinMatch()} className="px-4 bg-surface-variant text-white font-black text-xs uppercase rounded-xl hover:bg-white/10 transition-all active:scale-95 border border-white/10">Join</button>
              </div>
            </div>
            <button onClick={onClose} className="w-full text-xs text-on-surface-variant/60 font-bold uppercase tracking-widest mt-4">Exit Lobby</button>
          </div>
        </div>
      )}

      {/* ⏳ HOSTING / JOINING WAITING SCREEN */}
      {(playMode === "host" || playMode === "join") && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="space-y-6">
            <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>
              <h2 className="text-xl font-black text-white">
                {playMode === "join" ? "Connecting to Matrix..." : "Awaiting Opponent..."}
              </h2>
              {playMode === "host" && (
                <>
                  <p className="text-xs text-on-surface-variant mt-2 mb-4">Share this matrix code with your opponent:</p>
                  <div className="bg-black border border-blue-400/30 p-4 rounded-xl">
                    <code className="text-blue-400 font-mono text-sm break-all select-all">{matchId}</code>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => playMode === "host" ? setPlayMode("menu") : onClose()} className="px-6 py-3 bg-surface-variant text-white font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-white/10">Cancel</button>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-white/5 bg-surface/80 backdrop-blur-md">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-surface-variant/40 border border-white/5 flex items-center justify-center text-white active:scale-90 transition-all">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black uppercase tracking-widest text-white">Checkers Matrix</h1>
          <span className={`text-[10px] font-bold ${playMode === "online" ? "text-green-400 animate-pulse" : "text-primary"}`}>
            {playMode === "online" ? "● LIVE NETWORK CONNECTION" : "Local Pass & Play"}
          </span>
        </div>
        <div className="w-10 h-10"></div> 
      </div>

      {/* Scoreboard HUD */}
      {(playMode === "local" || playMode === "online") && (
        <>
          <div className="w-full max-w-md px-6 py-6 flex justify-between items-center relative">
            <div className={`flex flex-col items-center transition-all ${turn === P2 ? "scale-110 opacity-100" : "opacity-40"}`}>
              <div className="w-12 h-12 rounded-full border-2 border-secondary bg-secondary/20 flex items-center justify-center shadow-[0_0_15px_rgba(74,225,118,0.3)]">
                <span className="text-secondary font-black">P2</span>
              </div>
              <span className="text-[10px] font-bold mt-2">Captures: {p2Captures}</span>
            </div>
            
            <span className="text-xs font-black text-on-surface-variant uppercase tracking-widest bg-surface-variant/30 px-3 py-1 rounded-full border border-white/5">
              {playMode === "online" 
                ? (turn === myPlayerRole ? "YOUR TURN" : "OPPONENT'S TURN")
                : (turn === P1 ? "Player 1 Turn" : "Player 2 Turn")}
            </span>

            <div className={`flex flex-col items-center transition-all ${turn === P1 ? "scale-110 opacity-100" : "opacity-40"}`}>
              <div className="w-12 h-12 rounded-full border-2 border-blue-400 bg-blue-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(96,165,250,0.3)]">
                <span className="text-blue-400 font-black">P1</span>
              </div>
              <span className="text-[10px] font-bold mt-2">Captures: {p1Captures}</span>
            </div>
          </div>

          {/* 8x8 Board Container */}
          <div className="w-full max-w-md px-4 mt-2">
            <div className="w-full aspect-square bg-surface-variant/20 rounded-2xl border border-white/10 p-2 shadow-2xl">
              <div className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-xl overflow-hidden border border-white/5 bg-black">
                {board.map((row, r) => 
                  row.map((piece, c) => {
                    const playable = isPlayableSquare(r, c);
                    const isSelected = selected?.r === r && selected?.c === c;
                    const isTarget = activeMoveTargets.some((m) => m.r === r && m.c === c);
                    
                    return (
                      <div 
                        key={`${r}-${c}`}
                        onClick={() => playable && handleSquareClick(r, c)}
                        className={`relative w-full h-full flex items-center justify-center transition-colors ${
                          playable ? "bg-surface-variant/40 hover:bg-surface-variant/60 cursor-pointer" : "bg-black/60"
                        } ${isSelected ? "ring-2 ring-inset ring-white bg-surface-variant" : ""} ${isTarget ? "bg-blue-500/20 cursor-pointer" : ""}`}
                      >
                        {isTarget && <div className="w-3 h-3 rounded-full bg-blue-400/80 animate-pulse drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]"></div>}

                        {piece !== EMPTY && (
                          <div className={`w-[75%] h-[75%] rounded-full shadow-lg flex items-center justify-center border-[3px] transition-all duration-300 ${
                            piece === P1 || piece === P1_KING ? "bg-blue-500/20 border-blue-400 shadow-[inset_0_0_10px_rgba(96,165,250,0.5)]" : ""
                          } ${
                            piece === P2 || piece === P2_KING ? "bg-secondary/20 border-secondary shadow-[inset_0_0_10px_rgba(74,225,118,0.5)]" : ""
                          } ${isSelected ? "scale-110" : ""}`}>
                            {(piece === P1_KING || piece === P2_KING) && <span className="material-symbols-outlined text-[16px] text-white/80">star</span>}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}