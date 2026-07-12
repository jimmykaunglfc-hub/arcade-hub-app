"use client";

import { useState, useEffect } from "react";

// --- GAME CONSTANTS ---
const EMPTY = 0;
const P1 = 1; // Blue (Bottom)
const P2 = 2; // Green (Top)
const P1_KING = 3;
const P2_KING = 4;

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

export default function Checkers({ onClose }: { onClose: () => void }) {
  // --- UI STATES ---
  const [gameStarted, setGameStarted] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);

  // --- ENGINE STATES ---
  const [board, setBoard] = useState<number[][]>(INITIAL_BOARD);
  const [turn, setTurn] = useState<number>(P1);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [p1Captures, setP1Captures] = useState(0);
  const [p2Captures, setP2Captures] = useState(0);

  // --- CORE INTELLIGENCE: MOVE GENERATOR ---
  const getValidMovesForPiece = (r: number, c: number, piece: number, currentBoard: number[][]) => {
    const moves: { r: number; c: number; jump?: { r: number; c: number } }[] = [];
    if (piece === EMPTY) return moves;

    const isKing = piece === P1_KING || piece === P2_KING;
    const directions = [];
    if (piece === P1 || isKing) directions.push(-1); // UP
    if (piece === P2 || isKing) directions.push(1);  // DOWN

    directions.forEach((dr) => {
      [-1, 1].forEach((dc) => {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          // Normal Move
          if (currentBoard[nr][nc] === EMPTY) {
            moves.push({ r: nr, c: nc });
          } 
          // Jump Move
          else {
            const isOpponent = 
              (piece === P1 || piece === P1_KING) ? (currentBoard[nr][nc] === P2 || currentBoard[nr][nc] === P2_KING) 
              : (currentBoard[nr][nc] === P1 || currentBoard[nr][nc] === P1_KING);
            
            if (isOpponent) {
              const jr = nr + dr, jc = nc + dc;
              if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && currentBoard[jr][jc] === EMPTY) {
                moves.push({ r: jr, c: jc, jump: { r: nr, c: nc } });
              }
            }
          }
        }
      });
    });
    return moves;
  };

  // --- GLOBAL BOARD SCANNER ---
  const getAllValidMoves = (playerToMove: number, currentBoard: number[][]) => {
    const allMoves: { from: { r: number; c: number }; move: any }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = currentBoard[r][c];
        if ((playerToMove === P1 && (piece === P1 || piece === P1_KING)) || 
            (playerToMove === P2 && (piece === P2 || piece === P2_KING))) {
          const pieceMoves = getValidMovesForPiece(r, c, piece, currentBoard);
          pieceMoves.forEach(move => allMoves.push({ from: { r, c }, move }));
        }
      }
    }
    return allMoves;
  };

  // --- WIN CONDITION LISTENER ---
  useEffect(() => {
    if (!gameStarted || winner) return;
    const availableMoves = getAllValidMoves(turn, board);
    if (availableMoves.length === 0) {
      setWinner(turn === P1 ? P2 : P1); // If turn player has no moves, other player wins
    }
  }, [turn, board, gameStarted, winner]);

  // --- GAMEPLAY HANDLERS ---
  const handleSquareClick = (r: number, c: number) => {
    if (winner || !gameStarted) return;
    const piece = board[r][c];

    // AI RULE: Forced Jumps Check
    const allPlayerMoves = getAllValidMoves(turn, board);
    const mandatoryJumps = allPlayerMoves.filter(m => m.move.jump);
    const hasMandatoryJump = mandatoryJumps.length > 0;

    // Selection Phase
    if ((turn === P1 && (piece === P1 || piece === P1_KING)) || 
        (turn === P2 && (piece === P2 || piece === P2_KING))) {
      
      // If a jump is available anywhere on the board, restrict selection to pieces that CAN jump
      if (hasMandatoryJump) {
        const canThisPieceJump = mandatoryJumps.some(m => m.from.r === r && m.from.c === c);
        if (!canThisPieceJump) return; // Ignore click if piece can't fulfill mandatory jump
      }
      setSelected({ r, c });
      return;
    }

    // Execution Phase
    if (selected && piece === EMPTY) {
      const pieceMoves = getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board);
      // Filter available moves for this specific piece to enforce jump if one exists for IT
      const allowedMoves = hasMandatoryJump ? pieceMoves.filter(m => m.jump) : pieceMoves;
      const move = allowedMoves.find((m) => m.r === r && m.c === c);
      
      if (move) {
        const newBoard = board.map((row) => [...row]);
        let movingPiece = newBoard[selected.r][selected.c];

        newBoard[selected.r][selected.c] = EMPTY;
        newBoard[r][c] = movingPiece;

        // Process Capture
        if (move.jump) {
          newBoard[move.jump.r][move.jump.c] = EMPTY;
          if (turn === P1) setP1Captures((prev) => prev + 1);
          else setP2Captures((prev) => prev + 1);
        }

        // Process King Promotion
        if (turn === P1 && r === 0) newBoard[r][c] = P1_KING;
        if (turn === P2 && r === 7) newBoard[r][c] = P2_KING;

        setBoard(newBoard);
        setSelected(null);
        setTurn(turn === P1 ? P2 : P1);
      }
    }
  };

  const resetGame = () => {
    setBoard(INITIAL_BOARD);
    setTurn(P1);
    setSelected(null);
    setP1Captures(0);
    setP2Captures(0);
    setWinner(null);
    setGameStarted(false);
  };

  // --- UI RENDERING ---
  const isPlayableSquare = (r: number, c: number) => (r + c) % 2 === 1;
  const validMovesForSelected = selected ? getValidMovesForPiece(selected.r, selected.c, board[selected.r][selected.c], board) : [];
  
  // Highlight mandatory jump targets if forced
  const allPlayerMoves = getAllValidMoves(turn, board);
  const hasMandatoryJump = allPlayerMoves.some(m => m.move.jump);
  const activeMoveTargets = hasMandatoryJump 
    ? validMovesForSelected.filter(m => m.jump) 
    : validMovesForSelected;

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden">
      
      {/* 📜 RULEBOOK OVERLAY */}
      {!gameStarted && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-gradient-to-b from-surface-variant/40 to-surface border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="material-symbols-outlined text-5xl text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]">grid_4x4</span>
              <h2 className="text-2xl font-black text-white tracking-tight">Neon Checkers</h2>
              <p className="text-[10px] text-primary uppercase tracking-widest font-bold">Standard League Rules</p>
            </div>
            
            <ul className="space-y-4 text-xs text-on-surface-variant/80 font-medium">
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-sm text-primary">looks_one</span>
                Pieces move exactly 1 step diagonally forward.
              </li>
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-sm text-secondary">warning</span>
                <span className="text-white font-bold">Captures are mandatory.</span> If you can jump an opponent, you must take it.
              </li>
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-sm text-amber-400">star</span>
                Reach the opponent's back row to crown a King, allowing backward movement.
              </li>
              <li className="flex items-start gap-3">
                <span className="material-symbols-outlined text-sm text-red-400">block</span>
                Win by capturing all enemy pieces or blocking them from making a legal move.
              </li>
            </ul>

            <button 
              onClick={() => setGameStarted(true)}
              className="w-full h-12 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-colors active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              Acknowledge & Start
            </button>
          </div>
        </div>
      )}

      {/* 🏆 WINNER ANNOUNCEMENT OVERLAY */}
      {winner && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="text-center space-y-4 mb-8">
            <span className="material-symbols-outlined text-6xl text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)] animate-bounce">emoji_events</span>
            <h2 className="text-4xl font-black text-white tracking-tight">
              PLAYER {winner} WINS
            </h2>
            <p className="text-sm text-on-surface-variant/80 font-medium">
              Opponent matrix completely neutralized.
            </p>
          </div>
          <div className="flex gap-4">
            <button onClick={resetGame} className="px-6 py-3 bg-white text-black font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all">Play Again</button>
            <button onClick={onClose} className="px-6 py-3 bg-surface-variant text-white font-black uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-white/10">Exit Lobby</button>
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
          <span className="text-[10px] text-primary font-bold">Local Pass & Play</span>
        </div>
        <button onClick={resetGame} className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors">
          <span className="material-symbols-outlined text-lg">refresh</span>
        </button>
      </div>

      {/* Scoreboard HUD */}
      <div className="w-full max-w-md px-6 py-6 flex justify-between items-center relative">
        <div className={`flex flex-col items-center transition-all ${turn === P2 ? "scale-110 opacity-100" : "opacity-40"}`}>
          <div className="w-12 h-12 rounded-full border-2 border-secondary bg-secondary/20 flex items-center justify-center shadow-[0_0_15px_rgba(74,225,118,0.3)]">
            <span className="text-secondary font-black">P2</span>
          </div>
          <span className="text-[10px] font-bold mt-2">Captures: {p2Captures}</span>
        </div>
        
        <span className="text-xs font-black text-on-surface-variant uppercase tracking-widest bg-surface-variant/30 px-3 py-1 rounded-full border border-white/5">
          {turn === P1 ? "Player 1 Turn" : "Player 2 Turn"}
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
                
                // Highlight pieces that are FORCED to jump
                const isForcedPiece = hasMandatoryJump && turn === (piece === P1 || piece === P1_KING ? P1 : P2) && 
                  getAllValidMoves(turn, board).some(m => m.move.jump && m.from.r === r && m.from.c === c);

                return (
                  <div 
                    key={`${r}-${c}`}
                    onClick={() => playable && handleSquareClick(r, c)}
                    className={`relative w-full h-full flex items-center justify-center transition-colors ${
                      playable ? "bg-surface-variant/40 hover:bg-surface-variant/60 cursor-pointer" : "bg-black/60"
                    } ${isSelected ? "ring-2 ring-inset ring-white bg-surface-variant" : ""} ${isTarget ? "bg-blue-500/20 cursor-pointer" : ""}`}
                  >
                    {/* Render Highlight Dot for Valid Moves */}
                    {isTarget && <div className="w-3 h-3 rounded-full bg-blue-400/80 animate-pulse drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]"></div>}

                    {/* Render Pieces */}
                    {piece !== EMPTY && (
                      <div className={`w-[75%] h-[75%] rounded-full shadow-lg flex items-center justify-center border-[3px] transition-all duration-300 ${
                        piece === P1 || piece === P1_KING ? "bg-blue-500/20 border-blue-400 shadow-[inset_0_0_10px_rgba(96,165,250,0.5)]" : ""
                      } ${
                        piece === P2 || piece === P2_KING ? "bg-secondary/20 border-secondary shadow-[inset_0_0_10px_rgba(74,225,118,0.5)]" : ""
                      } ${isSelected ? "scale-110" : ""} ${isForcedPiece && !isSelected ? "animate-pulse ring-2 ring-red-500" : ""}`}>
                        
                        {(piece === P1_KING || piece === P2_KING) && (
                          <span className="material-symbols-outlined text-[16px] text-white/80">star</span>
                        )}
                        
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
  );
}