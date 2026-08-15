"use client";




import { tr } from "../../lib/i18n";
import { LocalizedText } from "../../lib/i18n";
import React, {
 useCallback,
 useEffect,
 useMemo,
 useRef,
 useState,
} from "react";

interface SudokuProps {
 onClose?: () => void;
}

type Difficulty = "easy" | "medium" | "hard";

interface Cell {
 value: number;
 solution: number;
 fixed: boolean;
 notes: number[];
}

type Board = Cell[][];

const SIZE = 9;
const BOX_SIZE = 3;

const DIFFICULTY_REMOVALS: Record<Difficulty, number> = {
 easy: 38,
 medium: 47,
 hard: 54,
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
 easy: "Easy",
 medium: "Medium",
 hard: "Hard",
};

const cloneNumberBoard = (board: number[][]) =>
 board.map((row) => [...row]);

const shuffle = <T,>(items: T[]) => {
 const result = [...items];

 for (let index = result.length - 1; index > 0; index -= 1) {
   const randomIndex = Math.floor(
     Math.random() * (index + 1)
   );

   [result[index], result[randomIndex]] = [
     result[randomIndex],
     result[index],
   ];
 }

 return result;
};

const isValidPlacement = (
 board: number[][],
 row: number,
 column: number,
 value: number
) => {
 for (let index = 0; index < SIZE; index += 1) {
   if (board[row][index] === value) {
     return false;
   }

   if (board[index][column] === value) {
     return false;
   }
 }

 const boxStartRow =
   Math.floor(row / BOX_SIZE) * BOX_SIZE;

 const boxStartColumn =
   Math.floor(column / BOX_SIZE) * BOX_SIZE;

 for (
   let boxRow = boxStartRow;
   boxRow < boxStartRow + BOX_SIZE;
   boxRow += 1
 ) {
   for (
     let boxColumn = boxStartColumn;
     boxColumn < boxStartColumn + BOX_SIZE;
     boxColumn += 1
   ) {
     if (board[boxRow][boxColumn] === value) {
       return false;
     }
   }
 }

 return true;
};

const fillBoard = (board: number[][]): boolean => {
 for (let row = 0; row < SIZE; row += 1) {
   for (let column = 0; column < SIZE; column += 1) {
     if (board[row][column] !== 0) {
       continue;
     }

     const candidates = shuffle([
       1, 2, 3, 4, 5, 6, 7, 8, 9,
     ]);

     for (const candidate of candidates) {
       if (
         isValidPlacement(
           board,
           row,
           column,
           candidate
         )
       ) {
         board[row][column] = candidate;

         if (fillBoard(board)) {
           return true;
         }

         board[row][column] = 0;
       }
     }

     return false;
   }
 }

 return true;
};

const countSolutions = (
 board: number[][],
 maximumSolutions = 2
) => {
 let solutionCount = 0;

 const solve = () => {
   if (solutionCount >= maximumSolutions) {
     return;
   }

   let selectedRow = -1;
   let selectedColumn = -1;
   let selectedCandidates: number[] = [];

   for (let row = 0; row < SIZE; row += 1) {
     for (
       let column = 0;
       column < SIZE;
       column += 1
     ) {
       if (board[row][column] !== 0) {
         continue;
       }

       const candidates: number[] = [];

       for (let value = 1; value <= 9; value += 1) {
         if (
           isValidPlacement(
             board,
             row,
             column,
             value
           )
         ) {
           candidates.push(value);
         }
       }

       if (candidates.length === 0) {
         return;
       }

       if (
         selectedRow === -1 ||
         candidates.length <
           selectedCandidates.length
       ) {
         selectedRow = row;
         selectedColumn = column;
         selectedCandidates = candidates;
       }
     }
   }

   if (selectedRow === -1) {
     solutionCount += 1;
     return;
   }

   for (const candidate of selectedCandidates) {
     board[selectedRow][selectedColumn] =
       candidate;

     solve();

     board[selectedRow][selectedColumn] = 0;

     if (solutionCount >= maximumSolutions) {
       return;
     }
   }
 };

 solve();

 return solutionCount;
};

const createSolvedBoard = () => {
 const board = Array.from(
   { length: SIZE },
   () => Array(SIZE).fill(0)
 );

 fillBoard(board);

 return board;
};

const createPuzzle = (
 difficulty: Difficulty
): Board => {
 const solution = createSolvedBoard();
 const puzzle = cloneNumberBoard(solution);

 const cells = shuffle(
   Array.from(
     { length: SIZE * SIZE },
     (_, index) => index
   )
 );

 let removed = 0;
 const targetRemovals =
   DIFFICULTY_REMOVALS[difficulty];

 for (const cellIndex of cells) {
   if (removed >= targetRemovals) {
     break;
   }

   const row = Math.floor(cellIndex / SIZE);
   const column = cellIndex % SIZE;
   const previousValue = puzzle[row][column];

   puzzle[row][column] = 0;

   const testBoard = cloneNumberBoard(puzzle);
   const solutions = countSolutions(testBoard);

   if (solutions === 1) {
     removed += 1;
   } else {
     puzzle[row][column] = previousValue;
   }
 }

 return puzzle.map((row, rowIndex) =>
   row.map((value, columnIndex) => ({
     value,
     solution: solution[rowIndex][columnIndex],
     fixed: value !== 0,
     notes: [],
   }))
 );
};

const formatTime = (totalSeconds: number) => {
 const minutes = Math.floor(totalSeconds / 60);
 const seconds = totalSeconds % 60;

 return `${minutes.toString().padStart(2, "0")}:${seconds
   .toString()
   .padStart(2, "0")}`;
};

const isBoardComplete = (board: Board) =>
 board.every((row) =>
   row.every(
     (cell) =>
       cell.value !== 0 &&
       cell.value === cell.solution
   )
 );

const getCompletedCount = (
 board: Board,
 number: number
) =>
 board.reduce(
   (total, row) =>
     total +
     row.filter(
       (cell) =>
         cell.value === number &&
         cell.value === cell.solution
     ).length,
   0
 );

export default function Sudoku({
 onClose,
}: SudokuProps) {
 const [difficulty, setDifficulty] =
   useState<Difficulty>("easy");

 const [board, setBoard] = useState<Board>(() =>
   createPuzzle("easy")
 );

 const [selectedCell, setSelectedCell] = useState<{
   row: number;
   column: number;
 } | null>(null);

 const [notesMode, setNotesMode] = useState(false);
 const [seconds, setSeconds] = useState(0);
 const [mistakes, setMistakes] = useState(0);
 const [hintsUsed, setHintsUsed] = useState(0);

 const [paused, setPaused] = useState(false);
 const [completed, setCompleted] = useState(false);

 const [showNewGameMenu, setShowNewGameMenu] =
   useState(false);

 const [showRules, setShowRules] = useState(false);

 const completedRef = useRef(false);

 const startNewGame = useCallback(
   (nextDifficulty: Difficulty) => {
     completedRef.current = false;

     setDifficulty(nextDifficulty);
     setBoard(createPuzzle(nextDifficulty));
     setSelectedCell(null);
     setNotesMode(false);
     setSeconds(0);
     setMistakes(0);
     setHintsUsed(0);
     setPaused(false);
     setCompleted(false);
     setShowNewGameMenu(false);
   },
   []
 );

 useEffect(() => {
   if (paused || completed) {
     return;
   }

   const timer = window.setInterval(() => {
     setSeconds((currentSeconds) => currentSeconds + 1);
   }, 1000);

   return () => {
     window.clearInterval(timer);
   };
 }, [completed, paused]);

 useEffect(() => {
   if (
     !completedRef.current &&
     isBoardComplete(board)
   ) {
     completedRef.current = true;
     setCompleted(true);
     setPaused(false);
   }
 }, [board]);

 const selectedValue = useMemo(() => {
   if (!selectedCell) {
     return 0;
   }

   return board[selectedCell.row][selectedCell.column]
     .value;
 }, [board, selectedCell]);

 const updateCell = useCallback(
   (
     row: number,
     column: number,
     updater: (cell: Cell) => Cell
   ) => {
     setBoard((currentBoard) =>
       currentBoard.map((currentRow, rowIndex) =>
         currentRow.map((cell, columnIndex) =>
           rowIndex === row &&
           columnIndex === column
             ? updater(cell)
             : cell
         )
       )
     );
   },
   []
 );

 const removeNumberFromRelatedNotes = useCallback(
   (
     sourceRow: number,
     sourceColumn: number,
     number: number
   ) => {
     setBoard((currentBoard) =>
       currentBoard.map((row, rowIndex) =>
         row.map((cell, columnIndex) => {
           const sameRow = rowIndex === sourceRow;
           const sameColumn =
             columnIndex === sourceColumn;

           const sameBox =
             Math.floor(rowIndex / BOX_SIZE) ===
               Math.floor(sourceRow / BOX_SIZE) &&
             Math.floor(columnIndex / BOX_SIZE) ===
               Math.floor(sourceColumn / BOX_SIZE);

           if (
             !sameRow &&
             !sameColumn &&
             !sameBox
           ) {
             return cell;
           }

           if (!cell.notes.includes(number)) {
             return cell;
           }

           return {
             ...cell,
             notes: cell.notes.filter(
               (note) => note !== number
             ),
           };
         })
       )
     );
   },
   []
 );

 const enterNumber = useCallback(
   (number: number) => {
     if (
       !selectedCell ||
       paused ||
       completed
     ) {
       return;
     }

     const { row, column } = selectedCell;
     const cell = board[row][column];

     if (cell.fixed) {
       return;
     }

     if (notesMode) {
       if (cell.value !== 0) {
         return;
       }

       updateCell(row, column, (currentCell) => {
         const alreadyAdded =
           currentCell.notes.includes(number);

         return {
           ...currentCell,
           notes: alreadyAdded
             ? currentCell.notes.filter(
                 (note) => note !== number
               )
             : [...currentCell.notes, number].sort(),
         };
       });

       return;
     }

     if (
       cell.value === number &&
       cell.notes.length === 0
     ) {
       return;
     }

     if (number !== cell.solution) {
       setMistakes(
         (currentMistakes) =>
           currentMistakes + 1
       );
     }

     updateCell(row, column, (currentCell) => ({
       ...currentCell,
       value: number,
       notes: [],
     }));

     if (number === cell.solution) {
       removeNumberFromRelatedNotes(
         row,
         column,
         number
       );
     }
   },
   [
     board,
     completed,
     notesMode,
     paused,
     removeNumberFromRelatedNotes,
     selectedCell,
     updateCell,
   ]
 );

 const eraseSelectedCell = useCallback(() => {
   if (
     !selectedCell ||
     paused ||
     completed
   ) {
     return;
   }

   const { row, column } = selectedCell;
   const cell = board[row][column];

   if (cell.fixed) {
     return;
   }

   updateCell(row, column, (currentCell) => ({
     ...currentCell,
     value: 0,
     notes: [],
   }));
 }, [
   board,
   completed,
   paused,
   selectedCell,
   updateCell,
 ]);

 const revealHint = useCallback(() => {
   if (paused || completed) {
     return;
   }

   const availableCells: Array<{
     row: number;
     column: number;
   }> = [];

   board.forEach((row, rowIndex) => {
     row.forEach((cell, columnIndex) => {
       if (
         !cell.fixed &&
         cell.value !== cell.solution
       ) {
         availableCells.push({
           row: rowIndex,
           column: columnIndex,
         });
       }
     });
   });

   if (availableCells.length === 0) {
     return;
   }

   const randomCell =
     availableCells[
       Math.floor(
         Math.random() * availableCells.length
       )
     ];

   const solution =
     board[randomCell.row][randomCell.column]
       .solution;

   updateCell(
     randomCell.row,
     randomCell.column,
     (cell) => ({
       ...cell,
       value: solution,
       notes: [],
     })
   );

   removeNumberFromRelatedNotes(
     randomCell.row,
     randomCell.column,
     solution
   );

   setSelectedCell(randomCell);
   setHintsUsed(
     (currentHints) => currentHints + 1
   );
 }, [
   board,
   completed,
   paused,
   removeNumberFromRelatedNotes,
   updateCell,
 ]);

 const cellClassName = (
   row: number,
   column: number,
   cell: Cell
 ) => {
   const isSelected =
     selectedCell?.row === row &&
     selectedCell?.column === column;

   const sameRow =
     selectedCell?.row === row;

   const sameColumn =
     selectedCell?.column === column;

   const sameBox =
     selectedCell !== null &&
     Math.floor(selectedCell.row / BOX_SIZE) ===
       Math.floor(row / BOX_SIZE) &&
     Math.floor(selectedCell.column / BOX_SIZE) ===
       Math.floor(column / BOX_SIZE);

   const matchingValue =
     selectedValue !== 0 &&
     cell.value === selectedValue;

   const incorrect =
     !cell.fixed &&
     cell.value !== 0 &&
     cell.value !== cell.solution;

   let backgroundClass = "bg-[#fffdf5]";

   if (sameRow || sameColumn || sameBox) {
     backgroundClass = "bg-cyan-50";
   }

   if (matchingValue) {
     backgroundClass = "bg-amber-100";
   }

   if (incorrect) {
     backgroundClass = "bg-red-100";
   }

   if (isSelected) {
     backgroundClass =
       incorrect ? "bg-red-200" : "bg-cyan-300";
   }

   const rightBorder =
     column === 2 || column === 5
       ? "border-r-[3px] border-r-slate-900"
       : column < 8
         ? "border-r border-r-slate-300/80"
         : "";

   const bottomBorder =
     row === 2 || row === 5
       ? "border-b-[3px] border-b-slate-900"
       : row < 8
         ? "border-b border-b-slate-300/80"
         : "";

   return [
     "relative flex aspect-square items-center justify-center overflow-hidden",
     "transition-colors",
     backgroundClass,
     rightBorder,
     bottomBorder,
   ].join(" ");
 };

 return (
  <div className="fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden overscroll-none touch-none bg-[radial-gradient(circle_at_top,#164e63_0%,#0f172a_48%,#020617_100%)] text-white select-none">
     <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 bg-slate-950/65 px-3 pb-2 pt-[var(--app-safe-top)] shadow-lg backdrop-blur">
       <div className="justify-self-start">
         {onClose && (
           <button
             type="button"
             onClick={onClose}
             className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-400/30 bg-slate-900/85 text-white shadow-sm transition active:scale-95"
             aria-label={tr("UI_0373", "Back to Arcade Hub")}
           >
             <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
               <path d="M19 12H5" />
               <path d="m12 19-7-7 7-7" />
             </svg>
           </button>
         )}
       </div>

       <div className="text-center">
         <h1 className="text-xl font-black tracking-wide text-amber-300"><LocalizedText id="UI_1487" fallback="Sudoku" /></h1>

         <button type="button" onClick={() => setShowNewGameMenu(true)} className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-200/75">
           {DIFFICULTY_LABELS[difficulty]} ▾
         </button>
       </div>

       <div className="flex items-center justify-self-end gap-2">
         <button type="button" onClick={() => setPaused(true)} disabled={completed} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-400/30 bg-slate-900/85 text-sm font-black text-white transition active:scale-95 disabled:opacity-40" aria-label={tr("UI_1389", "Pause game")}>Ⅱ</button>
         <button type="button" onClick={() => setShowRules(true)} aria-label={tr("UI_1390", "How to play Sudoku")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00] bg-slate-900 text-[#ccff00] shadow-[0_0_12px_rgba(204,255,0,0.25)] active:scale-95">
           <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black">?</span>
         </button>
       </div>
     </header>

     <main className="min-h-0 flex-1 overflow-hidden px-3 py-3">
       <div className="mx-auto flex w-full max-w-md flex-col">
         <div className="mb-3 grid grid-cols-4 gap-2">
           <div className="rounded-xl border border-white/10 bg-slate-900/70 px-2 py-2 text-center shadow-lg">
             <span className="block text-[9px] font-bold uppercase tracking-wider text-cyan-200/55">
               <LocalizedText id="UI_1391" fallback="Level" /></span>

             <span className="text-sm font-black">
               {DIFFICULTY_LABELS[difficulty]}
             </span>
           </div>

           <div className="rounded-xl border border-white/10 bg-slate-900/70 px-2 py-2 text-center shadow-lg">
             <span className="block text-[9px] font-bold uppercase tracking-wider text-cyan-200/55">
               <LocalizedText id="UI_1392" fallback="Time" /></span>

             <span className="text-sm font-black">
               {formatTime(seconds)}
             </span>
           </div>

           <div className="rounded-xl border border-white/10 bg-slate-900/70 px-2 py-2 text-center shadow-lg">
             <span className="block text-[9px] font-bold uppercase tracking-wider text-cyan-200/55">
               <LocalizedText id="UI_1393" fallback="Mistakes" /></span>

             <span
               className={`text-sm font-black ${
                 mistakes > 0
                   ? "text-red-500"
                   : ""
               }`}
             >
               {mistakes}
             </span>
           </div>

           <div className="rounded-xl border border-white/10 bg-slate-900/70 px-2 py-2 text-center shadow-lg">
             <span className="block text-[9px] font-bold uppercase tracking-wider text-cyan-200/55">
               <LocalizedText id="UI_1394" fallback="Hints" /></span>

             <span className="text-sm font-black">
               {hintsUsed}
             </span>
           </div>
         </div>

         <div className="overflow-hidden rounded-2xl border-[5px] border-slate-950 bg-slate-950 shadow-[0_16px_35px_rgba(0,0,0,0.5),0_0_22px_rgba(34,211,238,0.16)] ring-2 ring-cyan-300/25">
           <div className="grid grid-cols-9 bg-[#fffdf5]">
             {board.map((row, rowIndex) =>
               row.map((cell, columnIndex) => (
                 <button
                   key={`${rowIndex}-${columnIndex}`}
                   type="button"
                   onClick={() => {
                     if (!paused && !completed) {
                       setSelectedCell({
                         row: rowIndex,
                         column: columnIndex,
                       });
                     }
                   }}
                   className={cellClassName(
                     rowIndex,
                     columnIndex,
                     cell
                   )}
                 >
                   {cell.value !== 0 ? (
                     <span
                       className={`text-[clamp(1rem,5vw,1.5rem)] font-black ${
                         cell.fixed
                           ? "text-slate-950"
                           : cell.value ===
                               cell.solution
                             ? "text-cyan-700"
                             : "text-red-500"
                       }`}
                     >
                       {cell.value}
                     </span>
                   ) : (
                     <div className="grid h-full w-full grid-cols-3 grid-rows-3">
                       {Array.from(
                         { length: 9 },
                         (_, index) => index + 1
                       ).map((note) => (
                         <span
                           key={note}
                           className="flex items-center justify-center text-[clamp(0.35rem,1.6vw,0.55rem)] font-bold text-cyan-800/65"
                         >
                           {cell.notes.includes(note)
                             ? note
                             : ""}
                         </span>
                       ))}
                     </div>
                   )}
                 </button>
               ))
             )}
           </div>
         </div>

         <div className="mt-4 grid grid-cols-4 gap-2">
           <button
             type="button"
             onClick={eraseSelectedCell}
             disabled={
               paused ||
               completed ||
               !selectedCell
             }
             className="rounded-2xl border border-white/10 bg-slate-900/80 px-2 py-3 text-white shadow-lg transition active:scale-95 disabled:opacity-40"
           >
             <span className="block text-xl">⌫</span>
             <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
               <LocalizedText id="UI_1395" fallback="Erase" /></span>
           </button>

           <button
             type="button"
             onClick={() =>
               setNotesMode(
                 (currentMode) => !currentMode
               )
             }
             disabled={paused || completed}
             className={`rounded-2xl px-2 py-3 shadow-sm transition active:scale-95 disabled:opacity-40 ${
               notesMode
                 ? "bg-cyan-500 text-slate-950 ring-2 ring-cyan-200"
                 : "border border-white/10 bg-slate-900/80 text-white"
             }`}
           >
             <span className="block text-xl">✎</span>
             <span
               className={`text-[10px] font-black uppercase tracking-wider ${
                 notesMode
                   ? "text-cyan-950"
                   : "text-slate-400"
               }`}
             >
               <LocalizedText id="UI_1396" fallback="Notes" />{notesMode ? tr("UI_1398", "On") : tr("UI_1397", "Off")}
             </span>
           </button>

           <button
             type="button"
             onClick={revealHint}
             disabled={paused || completed}
             className="rounded-2xl border border-white/10 bg-slate-900/80 px-2 py-3 text-white shadow-lg transition active:scale-95 disabled:opacity-40"
           >
             <span className="block text-xl">💡</span>
             <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
               <LocalizedText id="UI_1399" fallback="Hint" /></span>
           </button>

           <button
             type="button"
             onClick={() =>
               setShowNewGameMenu(true)
             }
             className="rounded-2xl border border-white/10 bg-slate-900/80 px-2 py-3 text-white shadow-lg transition active:scale-95"
           >
             <span className="block text-xl">↻</span>
             <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
               <LocalizedText id="UI_1468" fallback="New" /></span>
           </button>
         </div>

         <div className="mt-4 grid grid-cols-9 gap-1.5 pb-2">
           {Array.from(
             { length: 9 },
             (_, index) => index + 1
           ).map((number) => {
             const completedCount =
               getCompletedCount(board, number);

             const numberComplete =
               completedCount >= 9;

             return (
               <button
                 key={number}
                 type="button"
                 onClick={() => enterNumber(number)}
                 disabled={
                   paused ||
                   completed ||
                   numberComplete
                 }
                 className={`aspect-[0.72] rounded-xl text-xl font-black shadow-sm transition active:scale-90 disabled:opacity-25 ${
                   selectedValue === number
                     ? "bg-amber-400 text-slate-950 ring-2 ring-amber-200"
                     : "border border-cyan-300/20 bg-slate-900/85 text-cyan-300"
                 }`}
               >
                 {number}
               </button>
             );
           })}
         </div>
       </div>
     </main>

     {showRules && (
       <div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
         <div role="dialog" aria-modal="true" aria-labelledby="sudoku-how-to-play-title" className="max-h-[92%] w-full max-w-md overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-[#ccff00] bg-gradient-to-b from-slate-900 to-slate-950 p-5 text-white shadow-[0_0_35px_rgba(204,255,0,0.18)]">
           <div className="flex items-start justify-between gap-3">
             <div className="flex items-center gap-3">
               <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] text-2xl font-black text-[#ccff00]">?</div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]"><LocalizedText id="UI_1487" fallback={tr("UI_1487", "Sudoku")} /></p>
                 <h2 id="sudoku-how-to-play-title" className="text-2xl font-black"><LocalizedText id="UI_0394" fallback={tr("UI_0394", "How to Play")} /></h2>
               </div>
             </div>
             <button type="button" onClick={() => setShowRules(false)} aria-label={tr("UI_0446", "Close how to play")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-500 bg-slate-800 text-2xl font-black text-slate-200 transition hover:border-[#ccff00] hover:text-[#ccff00] active:scale-95">×</button>
           </div>

           <div className="mt-5 space-y-3">
             {[
               ["🔢", tr("UI_1400", "1. Fill every square"), "Complete the grid using the numbers 1 through 9."],
               ["↔️", tr("UI_1401", "2. Avoid repeats"), tr("UI_1402", "Each row, column, and outlined 3×3 box must contain every number once.")],
               ["👆", tr("UI_1403", "3. Enter a number"), tr("UI_1404", "Select an empty square, then tap a number below the board. Blue numbers are your entries.")],
               ["✎", tr("UI_1405", "4. Use Notes"), tr("UI_1406", "Turn Notes on to add or remove small candidate numbers without committing an answer.")],
               ["💡", tr("UI_1407", "5. Ask for a hint"), tr("UI_1408", "Hint completes one unfinished or incorrect square and adds to your hint count.")],
               ["🏆", tr("UI_1409", "6. Complete the puzzle"), tr("UI_1410", "Wrong answers appear red and increase Mistakes. Correct every square to finish the puzzle.")],
             ].map(([icon, title, description]) => (
               <div key={title} className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-3.5">
                 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xl">{icon}</div>
                 <div>
                   <h3 className="font-black text-amber-300">{title}</h3>
                   <p className="mt-1 text-sm leading-5 text-slate-300">{description}</p>
                 </div>
               </div>
             ))}
           </div>

           <button type="button" onClick={() => setShowRules(false)} className="mt-5 w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 py-3.5 font-black uppercase tracking-wide text-slate-950 shadow-[0_5px_0_#c56b00] transition active:translate-y-1 active:shadow-none">
             <LocalizedText id="UI_0393" fallback={tr("UI_0393", "Got It — Let&apos;s Play")} /></button>
         </div>
       </div>
     )}

     {paused && !completed && (
       <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-md">
         <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
           <div className="text-6xl">⏸️</div>

           <h2 className="mt-4 text-3xl font-black">
             <LocalizedText id="UI_1411" fallback={tr("UI_1411", "Game Paused")} /></h2>

           <p className="mt-2 text-sm text-slate-500">
             <LocalizedText id="UI_1369" fallback={tr("UI_1369", "Your progress and timer are paused.")} /></p>

           <button
             type="button"
             onClick={() => setPaused(false)}
             className="mt-6 w-full rounded-2xl bg-blue-600 py-3 font-black text-white transition active:scale-[0.98]"
           >
             <LocalizedText id="UI_1370" fallback={tr("UI_1370", "Resume Game")} /></button>
         </div>
       </div>
     )}

     {showNewGameMenu && (
       <div className="fixed inset-x-0 bottom-20 top-14 z-[240] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
         <div role="dialog" aria-modal="true" aria-labelledby="new-sudoku-title" className="w-full max-w-sm rounded-[2rem] border-2 border-[#ccff00] bg-gradient-to-b from-slate-900 to-slate-950 p-5 text-white shadow-[0_0_35px_rgba(204,255,0,0.18)]">
           <div className="flex items-start justify-between gap-3">
             <div className="flex items-center gap-3">
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-2xl text-slate-950 shadow-lg">▦</div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ccff00]"><LocalizedText id="UI_1371" fallback={tr("UI_1371", "Choose a level")} /></p>
                 <h2 id="new-sudoku-title" className="text-2xl font-black"><LocalizedText id="UI_1372" fallback={tr("UI_1372", "New Sudoku")} /></h2>
               </div>
             </div>

             <button type="button" onClick={() => setShowNewGameMenu(false)} aria-label={tr("UI_1373", "Close new game menu")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-500 bg-slate-800 text-2xl font-black text-slate-200 transition hover:border-[#ccff00] hover:text-[#ccff00] active:scale-95">×</button>
           </div>

           <p className="mt-4 text-sm text-slate-300">
             <LocalizedText id="UI_1374" fallback={tr("UI_1374", "Select the challenge that feels right for you.")} /></p>

           <div className="mt-5 grid gap-3">
             {(
               [
                 "easy",
                 "medium",
                 "hard",
               ] as Difficulty[]
             ).map((level) => (
               <button
                 key={level}
                 type="button"
                 onClick={() =>
                   startNewGame(level)
                 }
                 className={`group flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left shadow-lg transition active:scale-[0.98] ${
                   level === difficulty
                     ? "border-amber-300 bg-amber-400/15 ring-2 ring-amber-300/20"
                     : "border-slate-700 bg-slate-800/90 hover:border-cyan-400"
                 }`}
               >
                 <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl font-black ${level === "easy" ? "bg-emerald-500/20 text-emerald-300" : level === "medium" ? "bg-amber-500/20 text-amber-300" : "bg-rose-500/20 text-rose-300"}`}>
                   {level === "easy" ? "●" : level === "medium" ? "◆" : "★"}
                 </span>

                 <span className="min-w-0 flex-1">
                   <span className={`block text-lg font-black ${level === difficulty ? "text-amber-300" : "text-white"}`}>{DIFFICULTY_LABELS[level]}</span>
                   <span className="mt-0.5 block text-xs leading-4 text-slate-400">
                     {level === "easy" && tr("UI_1378", "More clues for a relaxed puzzle.")}
                     {level === "medium" && tr("UI_1379", "Fewer clues and more deduction.")}
                     {level === "hard" && tr("UI_1380", "Minimal clues for expert solvers.")}
                   </span>
                 </span>

                 <span className={`text-xl ${level === difficulty ? "text-amber-300" : "text-slate-600"}`}>›</span>
               </button>
             ))}
           </div>

           <button
             type="button"
             onClick={() =>
               setShowNewGameMenu(false)
             }
             className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-800 py-3 font-black text-slate-300 transition active:scale-[0.98]"
           >
             <LocalizedText id="UI_0094" fallback={tr("UI_0094", "Cancel")} /></button>
         </div>
       </div>
     )}

     {completed && (
       <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-md">
         <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
           <div className="text-6xl">🏆</div>

           <h2 className="mt-4 text-3xl font-black">
             <LocalizedText id="UI_1381" fallback={tr("UI_1381", "Puzzle Complete")} /></h2>

           <p className="mt-2 text-sm text-slate-500">
             <LocalizedText id="UI_1382" fallback={tr("UI_1382", "You completed the")} />{" "}
             {DIFFICULTY_LABELS[
               difficulty
             ].toLowerCase()}{" "}
             puzzle.
           </p>

           <div className="mt-5 grid grid-cols-3 gap-3">
             <div className="rounded-2xl bg-slate-100 p-3">
               <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                 <LocalizedText id="UI_1392" fallback={tr("UI_1392", "Time")} /></span>

               <span className="font-black">
                 {formatTime(seconds)}
               </span>
             </div>

             <div className="rounded-2xl bg-slate-100 p-3">
               <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                 <LocalizedText id="UI_1393" fallback={tr("UI_1393", "Mistakes")} /></span>

               <span className="font-black">
                 {mistakes}
               </span>
             </div>

             <div className="rounded-2xl bg-slate-100 p-3">
               <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                 <LocalizedText id="UI_1394" fallback={tr("UI_1394", "Hints")} /></span>

               <span className="font-black">
                 {hintsUsed}
               </span>
             </div>
           </div>

           <button
             type="button"
             onClick={() =>
               startNewGame(difficulty)
             }
             className="mt-6 w-full rounded-2xl bg-blue-600 py-3 font-black text-white transition active:scale-[0.98]"
           >
             <LocalizedText id="UI_1384" fallback={tr("UI_1384", "Play Another Puzzle")} /></button>

           <button
             type="button"
             onClick={() =>
               setShowNewGameMenu(true)
             }
             className="mt-3 w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-700"
           >
             <LocalizedText id="UI_1385" fallback={tr("UI_1385", "Change Difficulty")} /></button>
         </div>
       </div>
     )}
   </div>
 );
}
