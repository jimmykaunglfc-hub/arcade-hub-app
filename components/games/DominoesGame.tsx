"use client";

import React, {
 useCallback,
 useEffect,
 useMemo,
 useRef,
 useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";

interface DominoesProps {
 onClose?: () => void;
 roomId?: string;
 seat?: 1 | 2;
}

type Player = "you" | "computer";
type BoardSide = "left" | "right";
type Direction = "left" | "right" | "up" | "down";

interface Domino {
 id: string;
 left: number;
 right: number;
}

interface PlayedDomino extends Domino {
 reversed: boolean;
 playedSide: BoardSide | "start";
}

interface Point {
 x: number;
 y: number;
}

interface TablePlacement {
 domino: Domino;
 x: number;
 y: number;
 rotation: number;
 renderedWidth: number;
 renderedHeight: number;
 order: number;
}

interface TableLayout {
 placements: TablePlacement[];
 width: number;
 height: number;
}

const MAX_PIP = 6;
const STARTING_HAND_SIZE = 7;

const TILE_LENGTH = 68;
const TILE_THICKNESS = 36;
const TABLE_PADDING = 36;
const S_HORIZONTAL_LIMIT = 144;

const PIP_POSITIONS: Record<number, number[]> = {
 0: [],
 1: [4],
 2: [0, 8],
 3: [0, 4, 8],
 4: [0, 2, 6, 8],
 5: [0, 2, 4, 6, 8],
 6: [0, 2, 3, 5, 6, 8],
};

const createDominoSet = (): Domino[] => {
 const dominoes: Domino[] = [];

 for (let left = 0; left <= MAX_PIP; left += 1) {
   for (let right = left; right <= MAX_PIP; right += 1) {
     dominoes.push({
       id: `${left}-${right}`,
       left,
       right,
     });
   }
 }

 return dominoes;
};

const shuffle = <T,>(items: T[]) => {
 const result = [...items];

 for (
   let index = result.length - 1;
   index > 0;
   index -= 1
 ) {
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

const getPipTotal = (hand: Domino[]) =>
 hand.reduce(
   (total, domino) =>
     total + domino.left + domino.right,
   0
 );

const getHighestDouble = (hand: Domino[]) =>
 [...hand]
   .filter(
     (domino) => domino.left === domino.right
   )
   .sort(
     (first, second) =>
       second.left - first.left
   )[0];

const getHighestDomino = (hand: Domino[]) =>
 [...hand].sort((first, second) => {
   const firstValue =
     first.left + first.right;

   const secondValue =
     second.left + second.right;

   return secondValue - firstValue;
 })[0];

const getDisplayedDomino = (
 domino: PlayedDomino
): Domino => {
 if (!domino.reversed) {
   return {
     id: domino.id,
     left: domino.left,
     right: domino.right,
   };
 }

 return {
   id: domino.id,
   left: domino.right,
   right: domino.left,
 };
};

const canPlayDomino = (
 domino: Domino,
 leftEnd: number | null,
 rightEnd: number | null
) => {
 if (leftEnd === null || rightEnd === null) {
   return true;
 }

 return (
   domino.left === leftEnd ||
   domino.right === leftEnd ||
   domino.left === rightEnd ||
   domino.right === rightEnd
 );
};

const canPlayOnSide = (
 domino: Domino,
 side: BoardSide,
 leftEnd: number | null,
 rightEnd: number | null
) => {
 if (leftEnd === null || rightEnd === null) {
   return true;
 }

 const target =
   side === "left" ? leftEnd : rightEnd;

 return (
   domino.left === target ||
   domino.right === target
 );
};

const getBoardEnds = (
 board: PlayedDomino[]
): {
 leftEnd: number | null;
 rightEnd: number | null;
} => {
 if (board.length === 0) {
   return {
     leftEnd: null,
     rightEnd: null,
   };
 }

 return {
   leftEnd: getDisplayedDomino(board[0]).left,
   rightEnd: getDisplayedDomino(
     board[board.length - 1]
   ).right,
 };
};

const isValidBoardChain = (
 board: PlayedDomino[]
) =>
 board.every((domino, index) => {
   if (index === 0) {
     return true;
   }

   const previous = getDisplayedDomino(
     board[index - 1]
   );
   const current = getDisplayedDomino(domino);

   return previous.right === current.left;
 });

const getDirectionVector = (
 direction: Direction
): Point => {
 switch (direction) {
   case "left":
     return {
       x: -1,
       y: 0,
     };

   case "up":
     return {
       x: 0,
       y: -1,
     };

   case "down":
     return {
       x: 0,
       y: 1,
     };

   case "right":
   default:
     return {
       x: 1,
       y: 0,
     };
 }
};

const getDirectionRotation = (
 direction: Direction
) => {
 switch (direction) {
   case "left":
     return 180;

   case "up":
     return -90;

   case "down":
     return 90;

   case "right":
   default:
     return 0;
 }
};

const getTileGeometry = (
 domino: Domino,
 direction: Direction
) => {
 const isDouble =
   domino.left === domino.right;

 const horizontalPath =
   direction === "left" ||
   direction === "right";

 if (isDouble) {
   /*
    * Doubles are always portrait, including on vertical chain sections.
    * The physical tile remains exactly 68 × 36 and is only rotated.
    */
   return {
     distanceAlongPath: horizontalPath
       ? TILE_THICKNESS
       : TILE_LENGTH,
     renderedWidth: TILE_THICKNESS,
     renderedHeight: TILE_LENGTH,
     rotation: 90,
   };
 }

 return {
   distanceAlongPath: TILE_LENGTH,
   renderedWidth: horizontalPath
     ? TILE_LENGTH
     : TILE_THICKNESS,
   renderedHeight: horizontalPath
     ? TILE_THICKNESS
     : TILE_LENGTH,
   rotation: getDirectionRotation(direction),
 };
};

function DominoHalf({
 value,
 compact = false,
}: {
 value: number;
 compact?: boolean;
}) {
 const visiblePips =
   PIP_POSITIONS[value] ?? [];

 return (
   <div className="grid h-full min-h-0 flex-1 grid-cols-3 grid-rows-3 place-items-center p-[3px]">
     {Array.from(
       { length: 9 },
       (_, index) => (
         <span
           key={index}
           className={`rounded-full ${
             visiblePips.includes(index)
               ? "bg-slate-950"
               : "bg-transparent"
           } ${
             compact
               ? "h-[5px] w-[5px]"
               : "h-[7px] w-[7px]"
           }`}
         />
       )
     )}
   </div>
 );
}

function DominoFace({
 domino,
 vertical = false,
 compact = false,
}: {
 domino: Domino;
 vertical?: boolean;
 compact?: boolean;
}) {
 return (
   <div
     className={`h-full w-full ${
       vertical
         ? "flex flex-col"
         : "flex flex-row"
     }`}
   >
     <DominoHalf
       value={domino.left}
       compact={compact}
     />

     <div
       className={
         vertical
           ? "h-[2px] w-full shrink-0 bg-slate-900"
           : "h-full w-[2px] shrink-0 bg-slate-900"
       }
     />

     <DominoHalf
       value={domino.right}
       compact={compact}
     />
   </div>
 );
}

function HiddenDomino() {
 return (
   <div className="h-[54px] w-[30px] shrink-0 rounded-md border-2 border-violet-300/70 bg-gradient-to-br from-indigo-600 to-violet-950 p-1 shadow-md">
     <div className="flex h-full items-center justify-center rounded border border-white/25 bg-indigo-800">
       <span className="text-[10px] text-white/45">
         ◆
       </span>
     </div>
   </div>
 );
}

function HandDomino({
 domino,
 playable,
 selected,
 disabled,
 onClick,
}: {
 domino: Domino;
 playable: boolean;
 selected: boolean;
 disabled: boolean;
 onClick: () => void;
}) {
 return (
   <div className="relative flex shrink-0 flex-col items-center py-1">
     <button
       type="button"
       onClick={onClick}
       disabled={disabled}
       aria-label={`${domino.left}-${domino.right}${playable ? ", playable" : ""}`}
       className={`h-[68px] w-[36px] shrink-0 overflow-hidden rounded-[7px] border-2 bg-gradient-to-br from-white to-stone-200 shadow-md transition ${
         selected
           ? "-translate-y-2 border-yellow-300 ring-4 ring-yellow-300/70"
           : playable
             ? "-translate-y-1 border-emerald-400 shadow-[0_0_20px_rgba(5,150,105,1)] ring-4 ring-emerald-300/70"
             : "border-stone-400"
       } ${
         disabled && !playable
           ? "cursor-default opacity-40 grayscale-[40%]"
           : "active:scale-95"
       }`}
     >
       <DominoFace
         domino={domino}
         vertical
         compact
       />
     </button>
   </div>
 );
}

function PreviewDomino({
 domino,
}: {
 domino: Domino;
}) {
 const isDouble =
   domino.left === domino.right;

 return (
   <div
     className="overflow-hidden rounded-lg border-2 border-stone-400 bg-gradient-to-br from-white to-stone-200 shadow-md"
     style={{
       width: isDouble
         ? TILE_THICKNESS
         : TILE_LENGTH,
       height: isDouble
         ? TILE_LENGTH
         : TILE_THICKNESS,
     }}
   >
     <DominoFace
       domino={domino}
       vertical={isDouble}
       compact
     />
   </div>
 );
}

function PositionedDomino({
 placement,
}: {
 placement: TablePlacement;
}) {
 return (
   <div
     className="absolute h-[36px] w-[68px] overflow-hidden rounded-[7px] border-2 border-slate-400 bg-gradient-to-br from-white to-stone-200 shadow-[0_3px_8px_rgba(0,0,0,0.24)]"
     style={{
       // The physical board tile is always 68 × 36. Rotation changes only
       // its direction; it never scales or stretches the domino.
       width: TILE_LENGTH,
       height: TILE_THICKNESS,
       left: placement.x,
       top: placement.y,
       transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
       transformOrigin: "center",
       zIndex: placement.order + 1,
     }}
   >
     <DominoFace
       domino={placement.domino}
       compact
     />
   </div>
 );
}

const createSPlacements = (
 dominoes: Domino[]
): TablePlacement[] => {
 const placements: TablePlacement[] = [];
 let connector: Point = { x: 0, y: 0 };
 let horizontalDirection: "left" | "right" = "right";
 let turnColumnX: number | null = null;

 dominoes.forEach((domino, index) => {
   if (turnColumnX !== null) {
     const center = {
       x: turnColumnX,
       y: connector.y + TILE_LENGTH / 2,
     };

     placements.push({
       domino,
       ...center,
       rotation: 90,
       renderedWidth: TILE_THICKNESS,
       renderedHeight: TILE_LENGTH,
       order: index,
     });

     horizontalDirection =
       horizontalDirection === "right" ? "left" : "right";

     const nextVector = getDirectionVector(horizontalDirection);

     connector = {
       x:
         center.x +
         nextVector.x * (TILE_THICKNESS / 2),
       y: center.y + TILE_LENGTH / 4,
     };
     turnColumnX = null;
     return;
   }

   const horizontalGeometry = getTileGeometry(
     domino,
     horizontalDirection
   );
   const horizontalVector = getDirectionVector(
     horizontalDirection
   );
   const proposedEnd =
     connector.x +
     horizontalVector.x *
       horizontalGeometry.distanceAlongPath;
   const needsTurn =
     index > 0 &&
     (proposedEnd > S_HORIZONTAL_LIMIT ||
       proposedEnd < -S_HORIZONTAL_LIMIT);

   if (index === 0) {
     const center = {
       x:
         -S_HORIZONTAL_LIMIT +
         horizontalGeometry.renderedWidth / 2,
       y: 0,
     };

     placements.push({
       domino,
       ...center,
       rotation: horizontalGeometry.rotation,
       renderedWidth: horizontalGeometry.renderedWidth,
       renderedHeight: horizontalGeometry.renderedHeight,
       order: index,
     });

     connector = {
       x:
         center.x +
         horizontalVector.x *
           (horizontalGeometry.distanceAlongPath / 2),
       y: center.y,
     };
     return;
   }

   if (needsTurn) {
     const center = {
       x:
         connector.x +
         horizontalVector.x *
           (TILE_THICKNESS / 2),
       y:
         connector.y + TILE_LENGTH / 4,
     };

     placements.push({
       domino,
       ...center,
       rotation: 90,
       renderedWidth: TILE_THICKNESS,
       renderedHeight: TILE_LENGTH,
       order: index,
     });

     // Continue downward with one more tile before reversing the row. Two
     // aligned portrait tiles provide enough clearance for portrait doubles.
     connector = {
       x: center.x,
       y: center.y + TILE_LENGTH / 2,
     };
     turnColumnX = center.x;
     return;
   }

   const center = {
     x:
       connector.x +
       horizontalVector.x *
         (horizontalGeometry.distanceAlongPath / 2),
     y: connector.y,
   };

   placements.push({
     domino,
     ...center,
     rotation: horizontalGeometry.rotation,
     renderedWidth: horizontalGeometry.renderedWidth,
     renderedHeight: horizontalGeometry.renderedHeight,
     order: index,
   });

   connector = {
     x:
       center.x +
       horizontalVector.x *
         (horizontalGeometry.distanceAlongPath / 2),
     y: center.y,
   };
 });

 return placements;
};

const createTableLayout = (
 board: PlayedDomino[]
): TableLayout => {
 if (board.length === 0) {
   return {
     placements: [],
     width: 420,
     height: 360,
   };
 }

 const placements = createSPlacements(
   board.map(getDisplayedDomino)
 );

 let minimumX =
   Number.POSITIVE_INFINITY;

 let maximumX =
   Number.NEGATIVE_INFINITY;

 let minimumY =
   Number.POSITIVE_INFINITY;

 let maximumY =
   Number.NEGATIVE_INFINITY;

 placements.forEach((placement) => {
   minimumX = Math.min(
     minimumX,
     placement.x -
       placement.renderedWidth / 2
   );

   maximumX = Math.max(
     maximumX,
     placement.x +
       placement.renderedWidth / 2
   );

   minimumY = Math.min(
     minimumY,
     placement.y -
       placement.renderedHeight / 2
   );

   maximumY = Math.max(
     maximumY,
     placement.y +
       placement.renderedHeight / 2
   );
 });

 const offsetX =
   -minimumX + TABLE_PADDING;

 const offsetY =
   -minimumY + TABLE_PADDING;

 return {
   placements: placements.map(
     (placement) => ({
       ...placement,
       x: placement.x + offsetX,
       y: placement.y + offsetY,
     })
   ),

   width: Math.max(
     420,
     maximumX -
       minimumX +
       TABLE_PADDING * 2
   ),

   height: Math.max(
     360,
     maximumY -
       minimumY +
       TABLE_PADDING * 2
   ),
 };
};

function RealDominoTable({
 board,
}: {
 board: PlayedDomino[];
}) {
 const layout = useMemo(
   () => createTableLayout(board),
   [board]
 );

 if (board.length === 0) {
   return (
     <div className="flex h-full min-h-40 flex-col items-center justify-center text-center text-emerald-950/50">
       <div className="text-6xl">
         🁣
       </div>

       <p className="mt-2 text-sm font-black">
         Play the first domino
       </p>
     </div>
   );
 }

 return (
   <div className="h-full min-h-0 overflow-auto overscroll-contain">
     <div
       className="flex min-h-full min-w-full items-start justify-center"
       style={{
         height: layout.height,
       }}
     >
       <div
         className="relative shrink-0"
         style={{
           width: layout.width,
           height: layout.height,
         }}
       >
         {layout.placements.map(
           (placement, index) => (
             <PositionedDomino
               key={`${placement.domino.id}-${index}`}
               placement={placement}
             />
           )
         )}
       </div>
     </div>
   </div>
 );
}

export default function Dominoes({
 onClose,
 roomId,
 seat = 1,
}: DominoesProps) {
 const [yourHand, setYourHand] =
   useState<Domino[]>([]);

 const [
   computerHand,
   setComputerHand,
 ] = useState<Domino[]>([]);

 const [drawPile, setDrawPile] =
   useState<Domino[]>([]);

 const [board, setBoard] =
   useState<PlayedDomino[]>([]);
 const boardRef = useRef<PlayedDomino[]>([]);
 const [roomVersion, setRoomVersion] = useState(1);
 const [onlineError, setOnlineError] = useState<string | null>(null);
 const [opponentName, setOpponentName] = useState("Opponent");

 useEffect(() => {
   if (!roomId) return;
   const load = async () => {
     const [{ data: auth }, { data: players }] = await Promise.all([
       supabase.auth.getUser(),
       supabase.from("matchmaking_room_players").select("seat,display_name,user_id").eq("room_id", roomId).is("left_at", null),
     ]);
     const mine = (players || []).find((player) => player.user_id === auth.user?.id);
     const actualSeat = mine?.seat === 1 || mine?.seat === 2 ? mine.seat : seat;
     const [{ data: state, error: stateError }, { data: hand, error: handError }] = await Promise.all([
       supabase.from("two_player_game_state").select("state,current_seat,version,status").eq("room_id", roomId).maybeSingle(),
       supabase.from("dominoes_match_hands").select("hand").eq("room_id", roomId).eq("seat", actualSeat).maybeSingle(),
     ]);
     const opponent = (players || []).find((player) => player.seat !== actualSeat);
     if (opponent?.display_name) setOpponentName(opponent.display_name);
     if (state) {
       setBoard((state.state?.board || []) as PlayedDomino[]);
       setDrawPile((state.state?.draw_pile || []) as Domino[]);
       setCurrentPlayer(state.current_seat === actualSeat ? "you" : "computer");
       setRoomVersion(state.version);
       const winnerSeat = Number(state.state?.winner_seat || 0);
       if (state.status === "completed") {
         setGameOver(true);
         setWinner(winnerSeat ? (winnerSeat === actualSeat ? "you" : "computer") : "draw");
         setMessage(winnerSeat ? `${winnerSeat === actualSeat ? "You" : opponent?.display_name || "Opponent"} win${winnerSeat === actualSeat ? "" : "s"}.` : "Blocked game — draw.");
       } else {
         setGameOver(false);
         setWinner(null);
       }
     }
     if (hand?.hand) setYourHand(hand.hand as Domino[]);
     if (stateError || handError) setOnlineError(stateError?.message || handError?.message || "Unable to synchronize the match.");
   };
   void load();
   const poll = window.setInterval(load, 1500);
   const channel = supabase.channel(`dominoes-${roomId}`).on("postgres_changes", { event: "*", schema: "public", table: "two_player_game_state", filter: `room_id=eq.${roomId}` }, load).on("postgres_changes", { event: "*", schema: "public", table: "dominoes_match_hands", filter: `room_id=eq.${roomId}` }, load).subscribe();
   return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
 }, [roomId, seat]);

 const [
   currentPlayer,
   setCurrentPlayer,
 ] = useState<Player>("you");

 const [
   selectedDominoId,
   setSelectedDominoId,
 ] = useState<string | null>(null);

 const [message, setMessage] = useState(
   "Select a domino to begin."
 );

 const [showRules, setShowRules] =
   useState(false);

 const [
   showSidePicker,
   setShowSidePicker,
 ] = useState(false);

 const [gameOver, setGameOver] =
   useState(false);

 useEffect(() => {
   if (!roomId || currentPlayer !== "computer" || gameOver) return;
   const timer = window.setTimeout(() => { void supabase.rpc("resolve_dominoes_bot_turn", { p_room_id: roomId }); }, 1400);
   return () => window.clearTimeout(timer);
 }, [currentPlayer, gameOver, roomId, roomVersion]);

 const [winner, setWinner] = useState<
   Player | "draw" | null
 >(null);

 const [
   consecutivePasses,
   setConsecutivePasses,
 ] = useState(0);

 const leftEnd = useMemo(() => {
   if (board.length === 0) {
     return null;
   }

   return getDisplayedDomino(
     board[0]
   ).left;
 }, [board]);

 const rightEnd = useMemo(() => {
   if (board.length === 0) {
     return null;
   }

   return getDisplayedDomino(
     board[board.length - 1]
   ).right;
 }, [board]);

 const selectedDomino = useMemo(
   () =>
     yourHand.find(
       (domino) =>
         domino.id ===
         selectedDominoId
     ) ?? null,
   [selectedDominoId, yourHand]
 );

 const playableYourDominoes =
   useMemo(
     () =>
       yourHand.filter((domino) =>
         canPlayDomino(
           domino,
           leftEnd,
           rightEnd
         )
       ),
     [
       leftEnd,
       rightEnd,
       yourHand,
     ]
   );

 const finishBlockedGame =
   useCallback(
     (
       nextYourHand: Domino[],
       nextComputerHand: Domino[]
     ) => {
       const yourPips =
         getPipTotal(nextYourHand);

       const computerPips =
         getPipTotal(
           nextComputerHand
         );

       setGameOver(true);

       if (yourPips < computerPips) {
         setWinner("you");

         setMessage(
           `You win with ${yourPips} pips against ${computerPips}.`
         );
       } else if (
         computerPips < yourPips
       ) {
         setWinner("computer");

         setMessage(
           `Computer wins with ${computerPips} pips against ${yourPips}.`
         );
       } else {
         setWinner("draw");

         setMessage(
           `The game is tied at ${yourPips} pips each.`
         );
       }
     },
     []
   );

 const startNewGame =
   useCallback(() => {
     const shuffledSet = shuffle(
       createDominoSet()
     );

     const nextYourHand =
       shuffledSet.slice(
         0,
         STARTING_HAND_SIZE
       );

     const nextComputerHand =
       shuffledSet.slice(
         STARTING_HAND_SIZE,
         STARTING_HAND_SIZE * 2
       );

     const nextDrawPile =
       shuffledSet.slice(
         STARTING_HAND_SIZE * 2
       );

     const yourDouble =
       getHighestDouble(
         nextYourHand
       );

     const computerDouble =
       getHighestDouble(
         nextComputerHand
       );

     let startingPlayer: Player =
       "you";

     if (
       computerDouble &&
       (!yourDouble ||
         computerDouble.left >
           yourDouble.left)
     ) {
       startingPlayer = "computer";
     } else if (
       !yourDouble &&
       !computerDouble
     ) {
       const yourHighest =
         getHighestDomino(
           nextYourHand
         );

       const computerHighest =
         getHighestDomino(
           nextComputerHand
         );

       if (
         computerHighest.left +
           computerHighest.right >
         yourHighest.left +
           yourHighest.right
       ) {
         startingPlayer =
           "computer";
       }
     }

     setYourHand(nextYourHand);
     setComputerHand(
       nextComputerHand
     );
     setDrawPile(nextDrawPile);
     boardRef.current = [];
     setBoard([]);

     setCurrentPlayer(
       startingPlayer
     );

     setSelectedDominoId(null);
     setShowSidePicker(false);
     setConsecutivePasses(0);
     setGameOver(false);
     setWinner(null);

     setMessage(
       startingPlayer === "you"
         ? "Your turn. Choose a matching domino."
         : "Computer starts the game."
     );
   }, []);

 useEffect(() => {
   // Online rooms are dealt by the server. Never overwrite their shared
   // opening hand with a locally generated game after the state loads.
   if (!roomId) startNewGame();
 }, [roomId, startNewGame]);

 const placeDomino = useCallback(
   (
     domino: Domino,
     side: BoardSide,
     player: Player
   ) => {
     if (roomId && player === "you") {
       void supabase.rpc("dominoes_play", { p_room_id: roomId, p_tile_id: domino.id, p_side: boardRef.current.length === 0 ? "start" : side, p_expected_version: roomVersion }).then(({ error }) => { if (error) setOnlineError(error.message); });
       setShowSidePicker(false);
       setSelectedDominoId(null);
       return true;
     }
     if (gameOver) {
       return false;
     }

     const currentBoard = boardRef.current;
     const currentEnds = getBoardEnds(currentBoard);

     let reversed = false;

     let playedSide:
       | BoardSide
       | "start" = side;

     if (currentBoard.length === 0) {
       reversed = false;
       playedSide = "start";
     } else if (side === "left") {
       if (
         domino.right === currentEnds.leftEnd
       ) {
         reversed = false;
       } else if (
         domino.left === currentEnds.leftEnd
       ) {
         reversed = true;
       } else {
         return false;
       }
     } else {
       if (
         domino.left === currentEnds.rightEnd
       ) {
         reversed = false;
       } else if (
         domino.right === currentEnds.rightEnd
       ) {
         reversed = true;
       } else {
         return false;
       }
     }

     const playedDomino: PlayedDomino = {
       ...domino,
       reversed,
       playedSide,
     };

     const nextBoard =
       currentBoard.length === 0
         ? [playedDomino]
         : side === "left"
           ? [playedDomino, ...currentBoard]
           : [...currentBoard, playedDomino];

     if (!isValidBoardChain(nextBoard)) {
       setMessage(
         `That domino must match the ${side} open end.`
       );
       return false;
     }

     boardRef.current = nextBoard;
     setBoard(nextBoard);

     setConsecutivePasses(0);

     if (player === "you") {
       const nextHand =
         yourHand.filter(
           (item) =>
             item.id !== domino.id
         );

       setYourHand(nextHand);
       setSelectedDominoId(null);
       setShowSidePicker(false);

       if (nextHand.length === 0) {
         setWinner("you");
         setGameOver(true);
         setMessage(
           "You played every domino!"
         );

         return true;
       }

       setCurrentPlayer(
         "computer"
       );

       setMessage(
         "Computer is thinking..."
       );
     } else {
       const nextHand =
         computerHand.filter(
           (item) =>
             item.id !== domino.id
         );

       setComputerHand(nextHand);

       if (nextHand.length === 0) {
         setWinner("computer");
         setGameOver(true);
         setMessage(
           "Computer played every domino."
         );

         return true;
       }

       setCurrentPlayer("you");

       setMessage(
         "Your turn. Choose a matching domino."
       );
     }

     return true;
   },
   [
     computerHand,
     gameOver,
     yourHand,
   ]
 );

 const handleYourDominoClick = (
   domino: Domino
 ) => {
   if (
     currentPlayer !== "you" ||
     gameOver
   ) {
     return;
   }

   if (
     !canPlayDomino(
       domino,
       leftEnd,
       rightEnd
     )
   ) {
     setMessage(
       "That domino does not match either open end."
     );

     return;
   }

   setSelectedDominoId(domino.id);

   if (board.length === 0) {
     placeDomino(
       domino,
       "right",
       "you"
     );

     return;
   }

   const canUseLeft =
     canPlayOnSide(
       domino,
       "left",
       leftEnd,
       rightEnd
     );

   const canUseRight =
     canPlayOnSide(
       domino,
       "right",
       leftEnd,
       rightEnd
     );

   if (canUseLeft && canUseRight) {
     setShowSidePicker(true);

     setMessage(
       "Choose which open end to connect."
     );
   } else if (canUseLeft) {
     placeDomino(
       domino,
       "left",
       "you"
     );
   } else {
     placeDomino(
       domino,
       "right",
       "you"
     );
   }
 };

 const drawDomino = () => {
   if (roomId) {
     if (currentPlayer === "you" && !gameOver) void supabase.rpc("dominoes_draw_or_pass", { p_room_id: roomId, p_expected_version: roomVersion }).then(({ error }) => { if (error) setOnlineError(error.message); });
     return;
   }
   if (
     currentPlayer !== "you" ||
     gameOver
   ) {
     return;
   }

   if (
     playableYourDominoes.length >
     0
   ) {
     setMessage(
       "Choose one of your matching dominoes."
     );

     return;
   }

   if (drawPile.length === 0) {
     const nextPasses =
       consecutivePasses + 1;

     setConsecutivePasses(
       nextPasses
     );

     if (nextPasses >= 2) {
       finishBlockedGame(
         yourHand,
         computerHand
       );

       return;
     }

     setCurrentPlayer(
       "computer"
     );

     setMessage(
       "The pile is empty. You pass."
     );

     return;
   }

   const [
     drawnDomino,
     ...remainingPile
   ] = drawPile;

   setYourHand((currentHand) => [
     ...currentHand,
     drawnDomino,
   ]);

   setDrawPile(remainingPile);

   if (
     canPlayDomino(
       drawnDomino,
       leftEnd,
       rightEnd
     )
   ) {
     setMessage(
       "You drew a playable domino."
     );
   } else {
     setMessage(
       "No match. Draw again."
     );
   }
 };

 useEffect(() => {
   if (
     roomId ||
     currentPlayer !==
       "computer" ||
     gameOver
   ) {
     return;
   }

   const timer =
     window.setTimeout(() => {
       const playable =
         computerHand.filter(
           (domino) =>
             canPlayDomino(
               domino,
               leftEnd,
               rightEnd
             )
         );

       if (playable.length > 0) {
         const chosenDomino = [
           ...playable,
         ].sort(
           (first, second) =>
             second.left +
             second.right -
             (first.left +
               first.right)
         )[0];

         const canUseLeft =
           canPlayOnSide(
             chosenDomino,
             "left",
             leftEnd,
             rightEnd
           );

         const canUseRight =
           canPlayOnSide(
             chosenDomino,
             "right",
             leftEnd,
             rightEnd
           );

         let chosenSide: BoardSide =
           canUseRight
             ? "right"
             : "left";

         if (
           canUseLeft &&
           canUseRight
         ) {
           chosenSide =
             Math.random() > 0.5
               ? "left"
               : "right";
         }

         placeDomino(
           chosenDomino,
           chosenSide,
           "computer"
         );

         return;
       }

       if (drawPile.length > 0) {
         const [
           drawnDomino,
           ...remainingPile
         ] = drawPile;

         setDrawPile(
           remainingPile
         );

         setComputerHand(
           (currentHand) => [
             ...currentHand,
             drawnDomino,
           ]
         );

         setMessage(
           "Computer draws a domino."
         );

         return;
       }

       const nextPasses =
         consecutivePasses + 1;

       setConsecutivePasses(
         nextPasses
       );

       if (nextPasses >= 2) {
         finishBlockedGame(
           yourHand,
           computerHand
         );

         return;
       }

       setCurrentPlayer("you");

       setMessage(
         "Computer passes. Your turn."
       );
     }, 700);

   return () => {
     window.clearTimeout(timer);
   };
 }, [
   computerHand,
   consecutivePasses,
   currentPlayer,
   drawPile,
   finishBlockedGame,
   gameOver,
   leftEnd,
   placeDomino,
   roomId,
   rightEnd,
   yourHand,
 ]);

 const hasPlayableDomino =
   playableYourDominoes.length > 0;
 const needsDraw =
   currentPlayer === "you" &&
   !gameOver &&
   !hasPlayableDomino;

 return (
   <div className="fixed inset-0 flex min-h-0 flex-col overflow-hidden overscroll-none bg-gradient-to-b from-lime-300 via-lime-200 to-orange-300 text-slate-950 select-none touch-none">
     <header className="flex shrink-0 items-center justify-between border-b border-lime-700/20 bg-lime-100/90 px-3 py-2 shadow-sm">
       <div className="flex items-center gap-2">
         {onClose && (
           <button
             type="button"
             onClick={onClose}
             aria-label="Back to Arcade Hub"
             className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-400/30 bg-slate-900/85 text-white shadow-sm transition active:scale-95"
           >
             <svg
               aria-hidden="true"
               viewBox="0 0 24 24"
               fill="none"
               stroke="currentColor"
               strokeWidth="2"
               strokeLinecap="round"
               strokeLinejoin="round"
               className="h-5 w-5"
             >
               <path d="M19 12H5" />
               <path d="m12 19-7-7 7-7" />
             </svg>
           </button>
         )}

         <div>
           <h1 className="text-lg font-black">
             Dominoes
           </h1>

           <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
             Double-Six Draw
           </p>
         </div>
       </div>

       <div className="flex gap-2">
         <button
           type="button"
           onClick={startNewGame}
           className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-black shadow-sm active:scale-95"
         >
           New
         </button>

         <button
           type="button"
           onClick={() => setShowRules(true)}
           aria-label="How to play Dominoes"
           className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00] bg-slate-900 text-[#ccff00] shadow-[0_0_12px_rgba(204,255,0,0.2)] active:scale-95"
         >
           <span
             aria-hidden="true"
             className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none"
           >
             ?
           </span>
         </button>
       </div>
     </header>

     {onlineError && (
       <button onClick={() => setOnlineError(null)} className="mx-3 mt-2 rounded-xl bg-red-700/90 px-3 py-2 text-left text-xs font-bold text-white shadow">
         {onlineError}
       </button>
     )}

     <section className="shrink-0 px-3 py-2">
       <div className="flex items-center justify-between rounded-2xl border border-emerald-800/20 bg-white/65 px-3 py-2 shadow-sm">
         <div className="min-w-[58px]">
           <span className="block text-[9px] font-black uppercase text-slate-500">
             {roomId ? opponentName : "Computer"}
           </span>

           <span className="text-xl font-black">
             {computerHand.length}
           </span>

           <span className="ml-1 text-xs font-bold text-slate-500">
             tiles
           </span>
         </div>

         <div className="flex min-w-0 flex-1 justify-center gap-1 overflow-hidden px-2">
           {computerHand
             .slice(0, 7)
             .map((domino) => (
               <HiddenDomino
                 key={domino.id}
               />
             ))}
         </div>

         <div className="min-w-[48px] text-right">
           <span className="block text-[9px] font-black uppercase text-slate-500">
             Pile
           </span>

           <span className="text-xl font-black text-amber-600">
             {drawPile.length}
           </span>
         </div>
       </div>
     </section>

     <main className="min-h-0 flex-1 px-3 pb-2">
       <div className="flex h-full min-h-0 flex-col rounded-[26px] border-4 border-amber-700/50 bg-lime-400/65 p-2 shadow-xl">
         <div
           className={`mx-auto mb-2 shrink-0 rounded-full px-5 py-1 text-center text-xs font-black ${
             currentPlayer === "you"
               ? "bg-emerald-300 text-emerald-950"
               : "bg-white/80 text-slate-700"
           }`}
         >
           {currentPlayer === "you"
             ? "Your turn"
             : `${roomId ? opponentName : "Computer"}'s turn`}
         </div>

         <div className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-lime-200/65">
           <RealDominoTable
             board={board}
           />
         </div>

         <div className="mt-2 shrink-0 rounded-2xl bg-emerald-900/90 px-3 py-2 text-center text-xs font-bold text-white">
           {message}
         </div>
       </div>
     </main>

     <section className="h-[205px] shrink-0 border-t border-orange-500/30 bg-orange-300 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-8px_20px_rgba(0,0,0,0.12)]">
       <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col">
         <div className="flex shrink-0 items-center justify-between">
           <div>
             <span className="block text-[9px] font-black uppercase text-orange-950/55">
               Your hand
             </span>

             <span className="text-base font-black">
               {yourHand.length} tiles
             </span>
           </div>

           <div className="relative flex justify-center">
             {needsDraw && (
               <div className="pointer-events-none absolute -top-11 z-30 flex flex-col items-center animate-bounce">
                 <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-400 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-2xl">
                   Tap to Draw
                 </span>

                 <span className="text-lg font-black leading-none text-amber-300 drop-shadow-lg">
                   👇
                 </span>
               </div>
             )}

             <button
               type="button"
               onClick={drawDomino}
               disabled={!needsDraw}
               aria-label={
                 drawPile.length > 0
                   ? `Draw a domino. ${drawPile.length} remaining.`
                   : "Pass your turn"
               }
               className={`min-w-[104px] rounded-xl border-2 px-4 py-2.5 text-xs font-black transition active:scale-95 disabled:cursor-default ${
                 needsDraw
                   ? "border-white bg-amber-400 text-amber-950 shadow-[0_0_0_4px_rgba(251,191,36,0.3),0_0_20px_rgba(245,158,11,0.9)] ring-2 ring-amber-700/50 animate-pulse"
                   : "border-amber-500/30 bg-amber-300/55 text-amber-950/45 shadow-sm"
               }`}
             >
               {drawPile.length > 0
                 ? `Draw (${drawPile.length})`
                 : "Pass"}
             </button>
           </div>
         </div>

         <div className="flex min-h-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden px-1">
           {yourHand.map((domino) => {
             const playable =
               currentPlayer === "you" &&
               canPlayDomino(
                 domino,
                 leftEnd,
                 rightEnd
               );

             return (
               <HandDomino
                 key={domino.id}
                 domino={domino}
                 selected={
                   domino.id ===
                   selectedDominoId
                 }
                 playable={playable}
                 disabled={
                   currentPlayer !== "you" ||
                   gameOver ||
                   !playable
                 }
                 onClick={() =>
                   handleYourDominoClick(
                     domino
                   )
                 }
               />
             );
           })}
         </div>
       </div>
     </section>

     {showSidePicker &&
       selectedDomino && (
         <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
           <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
             <h2 className="text-2xl font-black">
               Choose an End
             </h2>

             <p className="mt-2 text-sm text-slate-500">
               This domino matches both open sides.
             </p>

             <div className="mt-5 flex justify-center">
               <PreviewDomino
                 domino={selectedDomino}
               />
             </div>

             <div className="mt-6 grid grid-cols-2 gap-3">
               <button
                 type="button"
                 onClick={() =>
                   placeDomino(
                     selectedDomino,
                     "left",
                     "you"
                   )
                 }
                 className="rounded-2xl bg-blue-600 py-3 font-black text-white"
               >
                 Connect Left
               </button>

               <button
                 type="button"
                 onClick={() =>
                   placeDomino(
                     selectedDomino,
                     "right",
                     "you"
                   )
                 }
                 className="rounded-2xl bg-rose-600 py-3 font-black text-white"
               >
                 Connect Right
               </button>
             </div>

             <button
               type="button"
               onClick={() => {
                 setShowSidePicker(false);
                 setSelectedDominoId(null);
               }}
               className="mt-3 w-full rounded-2xl bg-slate-100 py-3 font-bold"
             >
               Cancel
             </button>
           </div>
         </div>
       )}

     {showRules && (
       <div className="fixed inset-x-0 bottom-20 top-14 z-[250] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
         <div
           role="dialog"
           aria-modal="true"
           aria-labelledby="dominoes-how-to-play-title"
           className="max-h-[92%] w-full max-w-md overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-[#ccff00] bg-gradient-to-b from-slate-900 to-slate-950 p-5 text-white shadow-[0_0_35px_rgba(204,255,0,0.18)]"
         >
           <div className="flex items-start justify-between gap-3">
             <div className="flex items-center gap-3">
               <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] text-2xl font-black text-[#ccff00]">
                 ?
               </div>

               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">
                   Dominoes
                 </p>
                 <h2
                   id="dominoes-how-to-play-title"
                   className="text-2xl font-black"
                 >
                   How to Play
                 </h2>
               </div>
             </div>

             <button
               type="button"
               onClick={() => setShowRules(false)}
               aria-label="Close how to play"
               className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-500 bg-slate-800 text-2xl font-black text-slate-200 transition hover:border-[#ccff00] hover:text-[#ccff00] active:scale-95"
             >
               ×
             </button>
           </div>

           <div className="mt-5 space-y-3">
             {[
               ["🎲", "1. Start with seven", "You and the computer each receive seven dominoes."],
               ["🔗", "2. Match an open end", "Play a tile whose number matches the left or right end of the chain."],
               ["↔️", "3. Choose either side", "Select a playable domino, then choose the highlighted end where you want to place it."],
               ["↕️", "4. Doubles stand upright", "Double dominoes stay the same size and are always shown in portrait position."],
               ["📥", "5. Draw when blocked", "If no tile matches, draw from the pile. Pass only when the pile is empty."],
               ["🏆", "6. Empty your hand", "The first player with no dominoes wins. If blocked, the lowest remaining pip total wins."],
             ].map(([icon, title, description]) => (
               <div
                 key={title}
                 className="flex gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-3.5"
               >
                 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xl">
                   {icon}
                 </div>
                 <div>
                   <h3 className="font-black text-amber-300">
                     {title}
                   </h3>
                   <p className="mt-1 text-sm leading-5 text-slate-300">
                     {description}
                   </p>
                 </div>
               </div>
             ))}
           </div>

           <button
             type="button"
             onClick={() => setShowRules(false)}
             className="mt-5 w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 py-3.5 font-black uppercase tracking-wide text-slate-950 shadow-[0_5px_0_#c56b00] transition active:translate-y-1 active:shadow-none"
           >
             Got It — Let&apos;s Play
           </button>
         </div>
       </div>
     )}

     {gameOver && (
       <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-md">
         <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
           <div className="text-6xl">
             {winner === "you"
               ? "🏆"
               : winner === "draw"
                 ? "🤝"
                 : "🤖"}
           </div>

           <h2 className="mt-4 text-3xl font-black">
             {winner === "you"
               ? "You Win!"
               : winner === "computer"
                 ? `${roomId ? opponentName : "Computer"} Wins`
                 : "Draw Game"}
           </h2>

           <p className="mt-2 text-sm text-slate-500">
             {message}
           </p>

           <div className="mt-5 grid grid-cols-2 gap-3">
             <div className="rounded-2xl bg-emerald-100 p-3">
               <span className="block text-[9px] font-black uppercase text-emerald-700">
                 Your pips
               </span>

               <span className="text-2xl font-black">
                 {getPipTotal(yourHand)}
               </span>
             </div>

             <div className="rounded-2xl bg-amber-100 p-3">
               <span className="block text-[9px] font-black uppercase text-amber-700">
                 {roomId ? `${opponentName} pips` : "Computer pips"}
               </span>

               <span className="text-2xl font-black">
                 {getPipTotal(
                   computerHand
                 )}
               </span>
             </div>
           </div>

           <button
             type="button"
             onClick={startNewGame}
             className="mt-6 w-full rounded-2xl bg-emerald-500 py-3 font-black text-white"
           >
             Play Again
           </button>
         </div>
       </div>
     )}
   </div>
 );
}
