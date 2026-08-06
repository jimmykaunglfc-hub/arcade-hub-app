"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface WordBoxGameProps {
 onClose?: () => void;
}

// Balanced Scrabble/Boggle style letter distribution pools
// Weighted by frequency of use in English words
const VOWELS = "AAAAAEEEEEEEEIIIIIINOOOOOUUU";
const CONSONANTS = "BBCCDDDDDFFGGGHHJKLLLLMMNNNNNPPQRRRRRSSSSSTTTTTTVVWXYZ";

// Expanded fallback dictionary of common English words
const FALLBACK_DICTIONARY = new Set([
 // 3-Letter
 "ACT", "ADD", "AGE", "AGO", "AIR", "ALL", "AND", "ANY", "ARE", "ART", "ASK", "BAD", "BAG", "BAN", "BAT",
 "BED", "BIG", "BIT", "BOX", "BOY", "BUG", "BUS", "BUT", "BUY", "CAN", "CAR", "CAT", "COW", "CRY", "CUP",
 "CUT", "DAY", "DID", "DIG", "DOG", "DRY", "DUE", "EAR", "EAT", "EGG", "END", "EYE", "FAR", "FAT", "FEW",
 "FIX", "FLY", "FOR", "FUN", "GAP", "GAS", "GET", "GOD", "GOT", "GUN", "GUY", "GYM", "HAD", "HAS", "HAT",
 "HER", "HID", "HIM", "HIS", "HIT", "HOT", "HOW", "HUG", "ICE", "ILL", "INK", "ION", "ITS", "JOB", "JOY",
 "KEY", "KID", "LAB", "LAP", "LAW", "LAY", "LEG", "LET", "LIP", "LOG", "LOT", "LOW", "MAD", "MAP", "MAT",
 "MAY", "MEN", "MIX", "MOM", "MUD", "MUG", "NET", "NEW", "NOD", "NOT", "NOW", "NUT", "OFF", "OIL", "OLD",
 "ONE", "OUR", "OUT", "OWN", "PAN", "PAY", "PEN", "PET", "PIG", "PIN", "POP", "POT", "PRO", "PUT", "RAG",
 "RAT", "RAW", "RED", "RID", "RIP", "RUN", "SAD", "SAW", "SAY", "SEA", "SEE", "SET", "SHE", "SIN", "SIT",
 "SIX", "SKY", "SON", "SUN", "TAX", "TEA", "TEN", "THE", "TIE", "TIP", "TOE", "TOO", "TOP", "TOY", "TRY",
 "TWO", "USE", "VAN", "WAR", "WAS", "WAY", "WEB", "WHO", "WHY", "WIN", "YES", "YET", "YOU", "ZOO",
 // 4-Letter
 "ABLE", "ALSO", "AREA", "ARMY", "AWAY", "BABY", "BACK", "BALL", "BAND", "BANK", "BASE", "BEAR", "BEAT",
 "BEEN", "BELL", "BEST", "BILL", "BIRD", "BLOW", "BLUE", "BOAT", "BODY", "BOMB", "BOND", "BONE", "BOOK",
 "BORN", "BOSS", "BOTH", "BOWL", "BULK", "BURN", "BUSH", "BUSY", "CALL", "CALM", "CAME", "CAMP", "CARD",
 "CARE", "CASE", "CASH", "CAST", "CELL", "CENT", "CITY", "CLUB", "COAT", "COLD", "COME", "COOK", "COOL",
 "COPE", "CORE", "COST", "CREW", "CROP", "DARK", "DATA", "DATE", "DAWN", "DAYS", "DEAD", "DEAL", "DEAN",
 "DEAR", "DEBT", "DEEP", "DESK", "DIAL", "DIET", "DROP", "DUAL", "DUKE", "DUST", "DUTY", "EACH", "EARN",
 "EAST", "EASY", "EDGE", "ELSE", "EVEN", "EVER", "EVIL", "EXIT", "FACE", "FACT", "FAIL", "FAIR", "FALL",
 "FARM", "FAST", "FEAR", "FEEL", "FEET", "FELL", "FIND", "FINE", "FIRE", "FIRM", "FISH", "FIVE", "FLAT",
 "FLEW", "FLOW", "FOLD", "FOOD", "FOOT", "FORD", "FORM", "FORT", "FOUR", "FREE", "FROM", "FUEL", "FULL",
 "FUND", "GAIN", "GAME", "GATE", "GAVE", "GEAR", "GIFT", "GIRL", "GIVE", "GLAD", "GOAL", "GOES", "GOLD",
 "GOLF", "GOOD", "GREW", "GROW", "GULF", "HAIR", "HALF", "HALL", "HAND", "HANG", "HARD", "HARM", "HATE",
 "HAVE", "HEAD", "HEAR", "HEAT", "HELD", "HELP", "HERE", "HERO", "HIGH", "HILL", "HIRE", "HOLD", "HOLE",
 "HOLY", "HOME", "HOPE", "HOST", "HOUR", "HUGE", "HUNG", "HUNT", "HURT", "IDEA", "INCH", "INTO", "IRON",
 "ITEM", "JACK", "JANE", "JEAN", "JOHN", "JOIN", "JUMP", "JURY", "JUST", "KEEN", "KEEP", "KENT", "KEPT",
 "KICK", "KILL", "KIND", "KING", "KNEE", "KNEW", "KNOW", "LACK", "LADY", "LAID", "LAKE", "LAND", "LANE",
 "LAST", "LATE", "LEAD", "LEFT", "LESS", "LIFE", "LIFT", "LIKE", "LINE", "LINK", "LIST", "LIVE", "LOAD",
 "LOAN", "LOCK", "LOGO", "LONG", "LOOK", "LORD", "LOSE", "LOSS", "LOST", "LOVE", "LUCK", "MADE", "MAIL",
 "MAIN", "MAKE", "MALE", "MANY", "MARK", "MASS", "MATE", "MATH", "MEAL", "MEAN", "MEAT", "MEET", "MENU",
 "MERE", "MIKE", "MILE", "MILK", "MILL", "MIND", "MINE", "MISS", "MODE", "MOOD", "MOON", "MORE", "MOST",
 "MOVE", "MUCH", "MUST", "NAME", "NAVY", "NEAR", "NECK", "NEED", "NEWS", "NEXT", "NICE", "NINE", "NONE",
 "NOSE", "NOTE", "ONCE", "ONLY", "OPEN", "ORAL", "OVER", "PACE", "PAGE", "PAID", "PAIN", "PAIR", "PARK",
 "PART", "PASS", "PAST", "PATH", "PEAK", "PICK", "PIKE", "PINE", "PIPE", "PLAN", "PLAY", "PLUG", "PLUS",
 "POEM", "POET", "POLE", "POLL", "POOL", "POOR", "PORT", "POST", "PULL", "PURE", "PUSH", "RACE", "RAIL",
 "RAIN", "RATE", "READ", "REAL", "REAR", "RELY", "RENT", "REST", "RICE", "RICH", "RIDE", "RING", "RISE",
 "RISK", "ROAD", "ROCK", "ROLE", "ROLL", "ROOF", "ROOM", "ROOT", "ROSE", "RULE", "RUSH", "SAFE", "SAIL",
 "SALE", "SALT", "SAME", "SAND", "SAVE", "SEAT", "SEED", "SEEK", "SEEM", "SEEN", "SELL", "SEND", "SENT",
 "SETS", "SHOT", "SHOW", "SHUT", "SICK", "SIDE", "SIGN", "SITE", "SIZE", "SKIN", "SLIP", "SLOW", "SNOW",
 "SOAP", "SOFT", "SOIL", "SOLD", "SOLE", "SOME", "SONG", "SOON", "SORT", "SOUL", "SPOT", "STAR", "STAY",
 "STEP", "STOP", "SUCH", "SUIT", "SURE", "TAKE", "TALE", "TALK", "TALL", "TANK", "TAPE", "TASK", "TEAM",
 "TEAR", "TELL", "TEND", "TENT", "TERM", "TEST", "TEXT", "THAN", "THAT", "THEM", "THEN", "THEY", "THIN",
 "THIS", "THUS", "TIME", "TINY", "TOLD", "TONE", "TOOK", "TOOL", "TOUR", "TOWN", "TREE", "TRIP", "TRUE",
 "TUBE", "TURN", "TWIN", "TYPE", "UNIT", "UPON", "USED", "USER", "VARY", "VAST", "VERY", "VICE", "VIEW",
 "VOTE", "WAGE", "WAIT", "WAKE", "WALK", "WALL", "WANT", "WARD", "WARM", "WASH", "WAVE", "WAYS", "WEAK",
 "WEAR", "WEEK", "WELL", "WENT", "WERE", "WEST", "WHAT", "WHEN", "WHOM", "WIDE", "WIFE", "WILD", "WILL",
 "WIND", "WINE", "WING", "WIRE", "WISE", "WISH", "WITH", "WOOD", "WORD", "WORK", "WRAP", "YARD", "YEAR",
 "YOUR", "ZERO", "ZONE",
 // 5-Letter common
 "ABOUT", "ABOVE", "AFTER", "AGAIN", "ALONE", "APPLE", "BEGAN", "BEGIN", "BLACK", "BLOCK", "BLOOD", "BOARD",
 "BRAIN", "BREAD", "BREAK", "BROWN", "BUILD", "CARRY", "CATCH", "CHAIR", "CHART", "CHIEF", "CHILD", "CLASS",
 "CLEAR", "CLOSE", "COLOR", "COVER", "CROSS", "DANCE", "DEATH", "DEPTH", "DREAM", "DRIVE", "EARLY", "EARTH",
 "EIGHT", "EMPTY", "ENEMY", "ENJOY", "ENTER", "ERROR", "EVENT", "EVERY", "EXACT", "EXIST", "EXTRA", "FAITH",
 "FALSE", "FAULT", "FIELD", "FIGHT", "FINAL", "FIRST", "FLOOR", "FOCUS", "FORCE", "FRAME", "FRANK", "FRESH",
 "FRONT", "FRUIT", "GLASS", "GRAND", "GRANT", "GRASS", "GREAT", "GREEN", "GROUP", "GUARD", "GUESS", "GUEST",
 "GUIDE", "HAPPY", "HEART", "HEAVY", "HELLO", "HORSE", "HOTEL", "HOUSE", "HUMAN", "IMAGE", "INDEX", "INNER",
 "INPUT", "ISSUE", "JAPAN", "JOINT", "JUDGE", "JUICE", "KNOWN", "LABEL", "LARGE", "LATER", "LAUGH", "LAYER",
 "LEARN", "LEAVE", "LEGAL", "LEVEL", "LIGHT", "LIMIT", "LOCAL", "LOGIC", "LOOSE", "LOWER", "LUCKY", "MAGIC",
 "MAJOR", "MAKER", "MARCH", "MATCH", "MAYBE", "MAYOR", "METAL", "METER", "MINDS", "MINOR", "MINUS", "MIXED",
 "MODEL", "MONEY", "MONTH", "MORAL", "MOTOR", "MOUNT", "MOUSE", "MOUTH", "MUSIC", "NEEDS", "NEVER", "NIGHT",
 "NOISE", "NORTH", "NOVEL", "NURSE", "OCCUR", "OCEAN", "OFFER", "OFTEN", "ORDER", "OTHER", "OUGHT", "PAINT",
 "PANEL", "PAPER", "PARTY", "PEACE", "PHASE", "PHONE", "PHOTO", "PIECE", "PILOT", "PITCH", "PLACE", "PLAIN",
 "PLANE", "PLANT", "PLATE", "POINT", "POUND", "POWER", "PRESS", "PRICE", "PRIDE", "PRIME", "PRINT", "PRIOR",
 "PRIZE", "PROOF", "PROUD", "PROVE", "QUEEN", "QUICK", "QUIET", "QUITE", "RADIO", "RAISE", "RANGE", "RAPID",
 "RATIO", "REACH", "READY", "REFER", "RIGHT", "RIVAL", "RIVER", "ROBIN", "ROUGH", "ROUND", "ROUTE", "ROYAL",
 "RURAL", "SCALE", "SCENE", "SCOPE", "SCORE", "SENSE", "SERVE", "SEVEN", "SHALL", "SHAPE", "SHARE", "SHARP",
 "SHEET", "SHELL", "SHIFT", "SHIRT", "SHOCK", "SHOOT", "SHORT", "SHOUT", "SIGHT", "SINCE", "SKILL", "SLEEP",
 "SMALL", "SMART", "SMILE", "SMITH", "SMOKE", "SOLID", "SOLVE", "SORRY", "SOUND", "SOUTH", "SPACE", "SPARE",
 "SPEAK", "SPEED", "SPEND", "SPITE", "SPLIT", "SPORT", "SQUAD", "STAFF", "STAGE", "STAND", "START", "STATE",
 "STEAM", "STEEL", "STICK", "STILL", "STOCK", "STONE", "STORE", "STORM", "STORY", "STRIP", "STUDY", "STUFF",
 "STYLE", "SUGAR", "SUPER", "SWEET", "TABLE", "TASTE", "TEACH", "TEETH", "TEXAS", "THANK", "THEFT", "THEIR",
 "THEME", "THERE", "THESE", "THICK", "THING", "THINK", "THIRD", "THOSE", "THREE", "THROW", "TIGHT", "TITLE",
 "TODAY", "TOPIC", "TOTAL", "TOUCH", "TOUGH", "TOWER", "TRACK", "TRADE", "TRAIN", "TREAT", "TREND", "TRIAL",
 "TRIBE", "TRICK", "TRUST", "TRUTH", "UNCLE", "UNDER", "UNION", "UNITY", "UPPER", "UPSET", "URBAN", "USUAL",
 "VALID", "VALUE", "VIDEO", "VIRUS", "VISIT", "VITAL", "VOICE", "WASTE", "WATCH", "WATER", "WHEEL", "WHERE",
 "WHICH", "WHILE", "WHITE", "WHOLE", "WHOSE", "WOMAN", "WORDS", "WORLD", "WORRY", "WORSE", "WORST", "WORTH",
 "WOULD", "WOUND", "WRITE", "WRONG", "YIELD", "YOUNG", "YOUTH"
]);

const ROUND_SECONDS = 120;
const DICTIONARY_PREFIXES = (() => {
 const prefixes = new Set<string>();
 FALLBACK_DICTIONARY.forEach((word) => {
   for (let index = 1; index <= word.length; index += 1) prefixes.add(word.slice(0, index));
 });
 return prefixes;
})();

// Count only words that can actually be traced on this exact board. This keeps
// the target below the board's achievable score instead of using a fixed goal.
const getAchievableScore = (board: string[], size: number) => {
 const found = new Set<string>();
 const visit = (index: number, word: string, used: Set<number>) => {
   if (!DICTIONARY_PREFIXES.has(word)) return;
   if (word.length >= 3 && FALLBACK_DICTIONARY.has(word)) found.add(word);
   if (word.length === 7) return;
   const row = Math.floor(index / size); const col = index % size;
   for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
     const nextRow = row + dr; const nextCol = col + dc; const next = nextRow * size + nextCol;
     if ((dr || dc) && nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size && !used.has(next)) {
       const nextUsed = new Set(used); nextUsed.add(next); visit(next, word + board[next], nextUsed);
     }
   }
 };
 board.forEach((letter, index) => visit(index, letter, new Set([index])));
 return [...found].reduce((total, word) => total + word.length * 10, 0);
};

export const WordBoxGame: React.FC<WordBoxGameProps> = ({ onClose }) => {
 const [appState, setAppState] = useState<"menu" | "playing">("menu");
 const [gridSize, setGridSize] = useState<number>(4);
 const [board, setBoard] = useState<string[]>([]);
  // State for rendering
 const [path, setPath] = useState<number[]>([]);
 const [foundWords, setFoundWords] = useState<{word: string, points: number}[]>([]);
 const [score, setScore] = useState(0);
 const [targetScore, setTargetScore] = useState(0);
 const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
 const [gameOver, setGameOver] = useState(false);
 const [toast, setToast] = useState<{ message: string; color: string } | null>(null);
 const [isChecking, setIsChecking] = useState(false);
 const [showHowToPlay, setShowHowToPlay] = useState(false);

 // Refs for ultra-smooth drag tracking (bypasses React render lag)
 const isDragging = useRef(false);
 const pathRef = useRef<number[]>([]);
 const boardRef = useRef<HTMLDivElement>(null);
 const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
 const foundWordsRef = useRef<string[]>([]); // To prevent duplicate rapid swipes

 // ENHANCED ACCESSIBLE BOARD GENERATION
 const startNewGame = (size: number) => {
   setGridSize(size);
   const totalTiles = size * size;
  
   // Generate initial board with 42% Vowels, 58% Consonants
   const newBoard = Array.from({ length: totalTiles }).map(() => {
     const isVowel = Math.random() < 0.42;
     const pool = isVowel ? VOWELS : CONSONANTS;
     return pool[Math.floor(Math.random() * pool.length)];
   });

   // Ensure a minimum floor count of vowels so board is guaranteed playable
   const minVowels = Math.max(3, Math.floor(totalTiles * 0.35));
   let currentVowelCount = newBoard.filter(letter => "AEIOU".includes(letter)).length;

   while (currentVowelCount < minVowels) {
     const randomIndex = Math.floor(Math.random() * totalTiles);
     if (!"AEIOU".includes(newBoard[randomIndex])) {
       newBoard[randomIndex] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
       currentVowelCount++;
     }
   }

   const achievableScore = getAchievableScore(newBoard, size);
   setBoard(newBoard);
   setFoundWords([]);
   foundWordsRef.current = [];
   setScore(0);
   setTargetScore(Math.max(0, Math.floor(achievableScore * 0.75 / 10) * 10));
   setTimeLeft(ROUND_SECONDS);
   setGameOver(false);
   setPath([]);
   pathRef.current = [];
   isDragging.current = false;
   setAppState("playing");
 };

 useEffect(() => {
   if (appState !== "playing" || gameOver || showHowToPlay) return;
   const timer = window.setInterval(() => setTimeLeft((current) => {
     if (current <= 1) { setGameOver(true); return 0; }
     return current - 1;
   }), 1000);
   return () => window.clearInterval(timer);
 }, [appState, gameOver, showHowToPlay]);

 const showToast = useCallback((message: string, color: "emerald" | "rose" | "amber") => {
   setToast({ message, color });
   setTimeout(() => setToast(null), 1500);
 }, []);

 const getTileCenter = (index: number) => {
   const tile = tileRefs.current[index];
   if (!tile || !boardRef.current) return { x: 0, y: 0 };
  
   const boardRect = boardRef.current.getBoundingClientRect();
   const tileRect = tile.getBoundingClientRect();
  
   return {
     x: tileRect.left - boardRect.left + tileRect.width / 2,
     y: tileRect.top - boardRect.top + tileRect.height / 2,
   };
 };

 const handlePointerDown = (index: number, e: React.PointerEvent) => {
   (e.target as HTMLElement).releasePointerCapture(e.pointerId);
   isDragging.current = true;
   pathRef.current = [index];
   setPath([index]);
 };

 const handlePointerMove = useCallback((e: PointerEvent | TouchEvent) => {
   if (!isDragging.current || appState !== "playing") return;

   let clientX, clientY;
   if ("touches" in e) {
     clientX = e.touches[0].clientX;
     clientY = e.touches[0].clientY;
   } else {
     clientX = e.clientX;
     clientY = e.clientY;
   }

   const element = document.elementFromPoint(clientX, clientY) as HTMLElement;
   const target = element?.closest('[data-tile-index]');
  
   if (target) {
     const index = parseInt(target.getAttribute("data-tile-index")!);
     const currentPath = pathRef.current;
     const lastIndex = currentPath[currentPath.length - 1];

     // Allow backtracking (Undo last move)
     if (currentPath.length > 1 && index === currentPath[currentPath.length - 2]) {
       pathRef.current = currentPath.slice(0, -1);
       setPath([...pathRef.current]);
       return;
     }

     // Check valid adjacent move
     if (index !== lastIndex && !currentPath.includes(index)) {
       const r1 = Math.floor(lastIndex / gridSize);
       const c1 = lastIndex % gridSize;
       const r2 = Math.floor(index / gridSize);
       const c2 = index % gridSize;

       if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) {
         if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(10);
         }
         pathRef.current = [...currentPath, index];
         setPath([...pathRef.current]);
       }
     }
   }
 }, [appState, gridSize]);

 // Online Dictionary Check
 const checkWordOnline = async (word: string): Promise<boolean> => {
   try {
     const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
     return response.ok;
   } catch (e) {
     console.warn("API Error, falling back to local dictionary", e);
     return FALLBACK_DICTIONARY.has(word);
   }
 };

 const handlePointerUp = useCallback(async () => {
   if (!isDragging.current || gameOver) return;
   isDragging.current = false;
  
   const currentPath = [...pathRef.current]; // Clone for async safety
  
   // Immediately clear the visual path so the user can keep playing
   pathRef.current = [];
   setPath([]);
  
   if (currentPath.length >= 3) {
     const word = currentPath.map(idx => board[idx]).join("");
    
     // Prevent checking if already found
     if (foundWordsRef.current.includes(word)) {
       showToast(`ALREADY FOUND: ${word}`, "amber");
       return;
     }

     setIsChecking(true);
     const isValid = await checkWordOnline(word);
     setIsChecking(false);

     // Make sure it wasn't found while we were awaiting the API
     if (isValid && !foundWordsRef.current.includes(word)) {
       foundWordsRef.current.push(word);
       const points = word.length * 10;
      
       setFoundWords(prev => [{word, points}, ...prev]);
       setScore(prev => {
         const next = prev + points;
         if (targetScore > 0 && next >= targetScore) setGameOver(true);
         return next;
       });
       showToast(`${word} +${points}!`, "emerald");
     } else if (!isValid) {
       showToast("NOT IN DICTIONARY", "rose");
     }
   } else if (currentPath.length > 0) {
     showToast("TOO SHORT", "rose");
   }
 }, [board, gameOver, showToast, targetScore]);

 // Attach global listeners for smooth dragging
 useEffect(() => {
   const handleTouchMove = (e: TouchEvent) => {
     if (isDragging.current && e.cancelable) e.preventDefault(); // Stop page scroll
     handlePointerMove(e);
   };

   window.addEventListener("pointermove", handlePointerMove);
   window.addEventListener("touchmove", handleTouchMove, { passive: false });
   window.addEventListener("pointerup", handlePointerUp);
   window.addEventListener("touchend", handlePointerUp);
   window.addEventListener("pointercancel", handlePointerUp);

   return () => {
     window.removeEventListener("pointermove", handlePointerMove);
     window.removeEventListener("touchmove", handleTouchMove);
     window.removeEventListener("pointerup", handlePointerUp);
     window.removeEventListener("touchend", handlePointerUp);
     window.removeEventListener("pointercancel", handlePointerUp);
   };
 }, [handlePointerMove, handlePointerUp]);

 const currentWord = path.map(index => board[index]).join("");

 const handleBack = () => {
   if (onClose) {
     onClose();
     return;
   }

   setAppState("menu");
 };

 return (
   <div className="fixed inset-0 flex flex-col w-full h-full bg-[#0f172a] text-white font-sans overflow-hidden z-[100] touch-none select-none pt-14">
     {/* HOW TO PLAY MODAL */}
     {showHowToPlay && (
       <div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-md">
         <div
           role="dialog"
           aria-modal="true"
           aria-labelledby="word-box-how-to-play-title"
           className="max-h-[92%] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border-2 border-[#ccff00]/70 bg-gradient-to-b from-slate-900 to-[#0d1527] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.75)]"
         >
           <div className="mb-5 flex items-start justify-between gap-4">
             <div className="flex items-center gap-3">
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] bg-[#ccff00]/10 text-2xl font-black text-[#ccff00] shadow-[0_0_18px_rgba(204,255,0,0.22)]">
                 ?
               </div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">
                   Word Box
                 </p>
                 <h2
                   id="word-box-how-to-play-title"
                   className="text-2xl font-black text-white"
                 >
                   How to Play
                 </h2>
               </div>
             </div>

             <button
               type="button"
               onClick={() => setShowHowToPlay(false)}
               aria-label="Close how to play"
               className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-black text-slate-200 transition-colors hover:bg-slate-700"
             >
               ×
             </button>
           </div>

           <div className="space-y-3">
             {[
               ["🔠", "Choose a grid", "Select a 3×3, 4×4, 5×5, or 6×6 letter board. Larger boards offer more paths."],
               ["👆", "Drag through letters", "Start on any tile and drag through adjacent horizontal, vertical, or diagonal tiles."],
               ["↩️", "Build one path", "A tile cannot be reused in the same word. Drag back to the previous tile to undo one step."],
               ["📖", "Make a valid word", "Words need at least 3 letters and must be accepted by the dictionary."],
               ["⭐", "Score points", "Every unique valid word earns 10 points for each letter. Duplicate words do not score again."],
               ["🔀", "Shuffle carefully", "Shuffle creates a new letter board and resets your found words and score."],
             ].map(([icon, title, description], index) => (
               <div
                 key={title}
                 className="flex gap-3 rounded-2xl border border-slate-700/80 bg-slate-800/65 p-3"
               >
                 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950/70 text-lg">
                   {icon}
                 </div>
                 <div>
                   <p className="text-sm font-black text-amber-300">
                     {index + 1}. {title}
                   </p>
                   <p className="mt-0.5 text-xs leading-5 text-slate-300">
                     {description}
                   </p>
                 </div>
               </div>
             ))}
           </div>

           <button
             type="button"
             onClick={() => setShowHowToPlay(false)}
             className="mt-5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition-all active:scale-[0.98]"
           >
             Got It — Let&apos;s Play
           </button>
         </div>
       </div>
     )}
    
     {appState === "menu" ? (
       /* MENU SCREEN */
       <div className="flex-1 w-full bg-slate-900 flex flex-col items-center justify-center p-6 relative">
        
         {/* BACK BUTTON IN MENU */}
         <button
           type="button"
           onClick={handleBack}
           aria-label="Back to Arcade Hub"
           className="absolute left-6 top-6 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition-colors hover:text-amber-300"
         >
           <svg
             aria-hidden="true"
             viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             strokeWidth="2.2"
             strokeLinecap="round"
             strokeLinejoin="round"
             className="h-4 w-4"
           >
             <path d="M19 12H5" />
             <path d="m12 19-7-7 7-7" />
           </svg>
         </button>

         <div className="text-center mb-10">
           <h1 className="text-5xl font-black text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)] mb-2 tracking-tight">WORDBOX</h1>
           <p className="text-slate-400 font-bold tracking-widest uppercase text-sm">Select Grid Size</p>
         </div>
        
         <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
           {[3, 4, 5, 6].map(size => (
             <button
               key={size}
               onClick={() => startNewGame(size)}
               className="bg-slate-800 border-2 border-slate-700 text-white py-6 rounded-2xl shadow-xl hover:border-amber-500 hover:scale-105 active:scale-95 transition-all flex flex-col items-center justify-center"
             >
               <span className="text-3xl font-black text-amber-400">{size}x{size}</span>
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Grid</span>
             </button>
           ))}
         </div>
       </div>
     ) : (
       /* PLAYING SCREEN */
       <div className="flex-1 w-full flex flex-col bg-slate-900 relative">
        
         {/* GAME CONTROLS & INFO BAR */}
         <div className="w-full shrink-0 z-10 border-b border-slate-800 bg-[#0f172a] px-3 py-2.5">
           {/* Single row: Back, score information, Shuffle, and Help */}
           <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
             <button
               type="button"
               onClick={handleBack}
               aria-label="Back to Arcade Hub"
               className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white transition-colors hover:text-amber-300"
             >
               <svg
                 aria-hidden="true"
                 viewBox="0 0 24 24"
                 fill="none"
                 stroke="currentColor"
                 strokeWidth="2.2"
                 strokeLinecap="round"
                 strokeLinejoin="round"
                 className="h-4 w-4"
               >
                 <path d="M19 12H5" />
                 <path d="m12 19-7-7 7-7" />
               </svg>
             </button>

             <div className="flex min-w-0 items-center justify-center gap-3">
               <div className="flex min-w-[48px] flex-col items-center">
                 <span className="whitespace-nowrap text-[8px] font-bold uppercase tracking-wider text-slate-400">
                   Words Found
                 </span>
                 <span className="text-lg font-black leading-none text-white">
                   {foundWords.length}
                 </span>
               </div>

               <div className="h-8 w-px bg-slate-700" />

               <div className="flex min-w-[48px] flex-col items-center">
                 <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Target</span>
                 <span className="text-lg font-black leading-none text-emerald-400">{targetScore}</span>
               </div>

               <div className="h-8 w-px bg-slate-700" />

               <div className="flex min-w-[36px] flex-col items-center">
                 <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Time</span>
                 <span className={`text-lg font-black leading-none ${timeLeft <= 15 ? "text-rose-400" : "text-white"}`}>{timeLeft}s</span>
               </div>

               <div className="flex min-w-[38px] flex-col items-center">
                 <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                   Score
                 </span>
                 <span className="text-lg font-black leading-none text-amber-400">
                   {score}
                 </span>
               </div>

               {isChecking && (
                 <span
                   aria-label="Checking word"
                   className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400"
                 />
               )}
             </div>

             <div className="flex items-center gap-2">
               <button
                 onClick={() => startNewGame(gridSize)}
                 className="bg-slate-800 hover:bg-slate-700 text-[10px] font-black tracking-wider text-slate-200 px-3 py-1.5 rounded-md border border-slate-700 transition-colors shadow-sm"
               >
                 SHUFFLE
               </button>

               <button
                 type="button"
                 onClick={() => setShowHowToPlay(true)}
                 aria-label="How to play Word Box"
                 className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_14px_rgba(204,255,0,0.16)] transition-colors hover:bg-[#ccff00]/20"
               >
                 <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none">
                   ?
                 </span>
               </button>
             </div>
           </div>
         </div>

         {/* CURRENT WORD DISPLAY */}
         {gameOver && (
           <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/85 p-6 backdrop-blur-sm">
             <div className="w-full max-w-sm rounded-3xl border border-amber-300/50 bg-slate-900 p-6 text-center shadow-2xl">
               <p className="text-5xl">{score >= targetScore && targetScore > 0 ? "🏆" : "⏱️"}</p>
               <h2 className="mt-3 text-2xl font-black">{score >= targetScore && targetScore > 0 ? "You win!" : "Round over"}</h2>
               <p className="mt-2 text-sm text-slate-300">Score {score} / {targetScore}</p>
               <button onClick={() => startNewGame(gridSize)} className="mt-5 w-full rounded-xl bg-amber-400 py-3 font-black text-slate-950">Play Again</button>
               <button onClick={handleBack} className="mt-3 w-full rounded-xl border border-slate-600 py-3 font-black text-white">Exit</button>
             </div>
           </div>
         )}
         <div className="w-full h-16 shrink-0 flex items-center justify-center relative z-10 px-4 mt-4">
           {toast ? (
              <div className={`text-lg font-black tracking-widest uppercase px-6 py-2 rounded-lg shadow-lg border-2 ${
                toast.color === "emerald" ? "bg-emerald-900/50 border-emerald-500 text-emerald-400" :
                toast.color === "rose" ? "bg-rose-900/50 border-rose-500 text-rose-400" : "bg-amber-900/50 border-amber-500 text-amber-400"
              } animate-in zoom-in duration-200`}>
                {toast.message}
              </div>
           ) : (
              <div className="flex items-center justify-center min-h-[44px] min-w-[200px] bg-slate-800 border-2 border-slate-700 px-6 py-2 rounded-lg shadow-inner">
                {currentWord.length === 0 ? (
                  <span className="text-slate-500 font-bold uppercase tracking-widest text-sm">Drag to connect</span>
                ) : (
                  <span className="text-3xl font-black text-amber-400 uppercase tracking-widest">
                    {currentWord}
                  </span>
                )}
              </div>
           )}
         </div>

         {/* INTERACTIVE GRID AREA */}
         <div className="flex-1 w-full flex items-center justify-center p-4 relative z-10">
           <div
             ref={boardRef}
             className={`grid gap-2 w-full max-w-[400px] aspect-square relative`}
             style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
           >
            
             {/* SVG LAYER FOR MESH BACKGROUND LINES */}
             <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
               {(() => {
                 const lines = [];
                 for (let r = 0; r < gridSize; r++) {
                   for (let c = 0; c < gridSize; c++) {
                     const x1 = (c + 0.5) * (100 / gridSize);
                     const y1 = (r + 0.5) * (100 / gridSize);
                     // Horizontal right
                     if (c < gridSize - 1) lines.push({ x1, y1, x2: (c + 1.5) * (100 / gridSize), y2: y1 });
                     // Vertical down
                     if (r < gridSize - 1) lines.push({ x1, y1, x2: x1, y2: (r + 1.5) * (100 / gridSize) });
                     // Diagonal down-right
                     if (r < gridSize - 1 && c < gridSize - 1) lines.push({ x1, y1, x2: (c + 1.5) * (100 / gridSize), y2: (r + 1.5) * (100 / gridSize) });
                     // Diagonal down-left
                     if (r < gridSize - 1 && c > 0) lines.push({ x1, y1, x2: (c - 0.5) * (100 / gridSize), y2: (r + 1.5) * (100 / gridSize) });
                   }
                 }
                 return lines.map((line, i) => (
                   <line
                     key={i}
                     x1={`${line.x1}%`} y1={`${line.y1}%`}
                     x2={`${line.x2}%`} y2={`${line.y2}%`}
                     stroke="rgba(255,255,255,0.15)"
                     strokeWidth="2"
                     strokeLinecap="round"
                   />
                 ));
               })()}
             </svg>

             {/* SVG LAYER FOR ACTIVE CONNECTING DRAG LINE */}
             <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible">
               {path.length > 1 && (
                 <polyline
                   points={path.map(idx => `${getTileCenter(idx).x},${getTileCenter(idx).y}`).join(" ")}
                   fill="none"
                   stroke="#fbbf24" // Amber-400
                   strokeWidth="12"
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   className="drop-shadow-[0_0_10px_rgba(245,158,11,0.8)] opacity-70"
                 />
               )}
             </svg>

             {/* HTML TILES */}
             {board.map((letter, index) => {
               const isSelected = path.includes(index);
               const isLast = path[path.length - 1] === index;
              
               let tileClass = "bg-slate-800 text-slate-300 border-slate-700";
               if (isSelected) {
                  tileClass = "bg-amber-500 border-amber-400 text-slate-900 scale-105 shadow-[0_0_15px_rgba(245,158,11,0.6)] z-30";
               }
               if (isLast) {
                  tileClass = "bg-amber-400 border-amber-300 text-slate-900 scale-110 shadow-[0_0_20px_rgba(245,158,11,0.9)] z-30";
               }

               const textSize = gridSize <= 4 ? "text-4xl" : "text-3xl";

               return (
                 <div
                   key={index}
                   ref={el => { tileRefs.current[index] = el; }}
                   data-tile-index={index}
                   onPointerDown={(e) => handlePointerDown(index, e)}
                   className={`
                     relative flex items-center justify-center w-full h-full rounded-xl border-b-4
                     ${textSize} font-black uppercase transition-all duration-100 cursor-pointer touch-none select-none
                     ${tileClass}
                   `}
                 >
                   {/* Inner text with pointer-events-none so raycasting hits the outer div perfectly */}
                   <span className="pointer-events-none drop-shadow-sm">{letter}</span>
                 </div>
               );
             })}
           </div>
         </div>

         {/* FOUND WORDS LIST */}
         <div className="h-[180px] w-full bg-[#1e293b] border-t border-slate-800 shrink-0 p-4 pb-12 overflow-y-auto shadow-[0_-10px_20px_rgba(0,0,0,0.5)] z-20">
           {foundWords.length === 0 ? (
             <div className="w-full flex justify-center pt-2">
               <span className="text-xs font-bold uppercase tracking-widest text-slate-500 text-center leading-loose">
                 Swipe across tiles to connect<br/>words of 3 or more letters
               </span>
             </div>
           ) : (
             <div className="flex flex-wrap gap-2 content-start pb-4">
               {foundWords.map((fw, i) => (
                 <div key={i} className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-md flex items-center gap-2 shadow-sm">
                   <span className="text-white font-bold text-sm tracking-wider uppercase">{fw.word}</span>
                   <span className="text-amber-400 bg-[#0f172a] px-1.5 py-0.5 rounded font-black text-[10px]">{fw.points}</span>
                 </div>
               ))}
             </div>
           )}
         </div>

       </div>
     )}
   </div>
 );
};

export default WordBoxGame;
