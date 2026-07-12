"use client";

import { useState } from "react";

// --- GAME CONSTANTS ---
const EMPTY = 0;
const P1 = 1; // Bottom Player (Primary Color)
const P2 = 2; // Top Player (Secondary Color)
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
  const [board, setBoard] = useState<number[][]>(INITIAL_BOARD);
  const [turn, setTurn] = useState<number>(P1);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [p1Captures, setP1Captures] = useState(0);
  const [p2Captures, setP2Captures] = useState(0);

  // --- CORE LOGIC: VALIDATE MOVES ---
  const getValidMoves = (r: number, c: number, piece: number, currentBoard: number[][]) => {
    const moves: { r: number; c: number; jump?: { r: number; c: number } }[] = [];
    const isKing = piece === P1_KING || piece === P2_KING;
    
    // P1 moves UP (-1), P2 moves DOWN (+1)
    const directions = [];
    if (piece === P1 || isKing) directions.push(-1);
    if (piece === P2 || isKing) directions.push(1);

    directions.forEach((dr) => {
      [-1, 1].forEach((dc) => {
        const nr = r + dr;
        const nc = c + dc;
        
        // Check bounds
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          // Normal Move
          if (currentBoard[nr][nc] === EMPTY) {
            moves.push({ r: nr, c: nc });
          } 
          // Jump Move (Capture)
          else {
            const isOpponent = 
              (piece === P1 || piece === P1_KING) ? (currentBoard[nr][nc] === P2 || currentBoard[nr][nc] === P2_KING) 
              : (currentBoard[nr][nc] === P1 || currentBoard[nr][nc] === P1_KING);
            
            if (isOpponent) {
              const jr = nr + dr;
              const jc = nc + dc;
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

  const validMoves = selected ? getValidMoves(selected.r, selected.c, board[selected.r][selected.c], board) : [];

  // --- INTERACTION HANDLERS ---
  const handleSquareClick = (r: number, c: number) => {
    const piece = board[r][c];

    // If clicking own piece, select it
    if ((turn === P1 && (piece === P1 || piece === P1_KING)) || 
        (turn === P2 && (piece === P2 || piece === P2_KING))) {
      setSelected({ r, c });
      return;
    }

    // If clicking an empty square while having a piece selected, try to move
    if (selected && piece === EMPTY) {
      const move = validMoves.find((m) => m.r === r && m.c === c);
      
      if (move) {
        const newBoard = board.map((row) => [...row]);
        let movingPiece = newBoard[selected.r][selected.c];

        // Process Move
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
  };

  // --- UI RENDER HELPERS ---
  const isPlayableSquare = (r: number, c: number) => (r + c) % 2 === 1;
  const isMoveTarget = (r: number, c: number) => validMoves.some((m) => m.r === r && m.c === c);

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden">
      
      {/* Top Header Layer */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-white/5 bg-surface/80 backdrop-blur-md">
        <button 
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-surface-variant/40 border border-white/5 flex items-center justify-center text-white active:scale-90 transition-all"
        >
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
      <div className="w-full max-w-md px-6 py-6 flex justify-between items-center">
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
          <div className="w-12 h-12 rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(192,193,255,0.3)]">
            <span className="text-primary font-black">P1</span>
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
                const isTarget = isMoveTarget(r, c);

                return (
                  <div 
                    key={`${r}-${c}`}
                    onClick={() => playable && handleSquareClick(r, c)}
                    className={`relative w-full h-full flex items-center justify-center transition-colors ${
                      playable ? "bg-surface-variant/40 hover:bg-surface-variant/60 cursor-pointer" : "bg-black/60"
                    } ${isSelected ? "ring-2 ring-inset ring-white bg-surface-variant" : ""} ${isTarget ? "bg-primary/20 cursor-pointer" : ""}`}
                  >
                    {/* Render Highlight Dot for Valid Moves */}
                    {isTarget && <div className="w-3 h-3 rounded-full bg-primary/60 animate-pulse"></div>}

                    {/* Render Pieces */}
                    {piece !== EMPTY && (
                      <div className={`w-[75%] h-[75%] rounded-full shadow-lg flex items-center justify-center border-[3px] transition-all duration-300 ${
                        piece === P1 || piece === P1_KING ? "bg-primary/20 border-primary shadow-[inset_0_0_10px_rgba(192,193,255,0.5)]" : ""
                      } ${
                        piece === P2 || piece === P2_KING ? "bg-secondary/20 border-secondary shadow-[inset_0_0_10px_rgba(74,225,118,0.5)]" : ""
                      } ${isSelected ? "scale-110" : ""}`}>
                        
                        {/* King Indicator */}
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