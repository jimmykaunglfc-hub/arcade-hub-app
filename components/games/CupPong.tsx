"use client";

import React, {
 useCallback,
 useEffect,
 useRef,
 useState,
} from "react";

interface CupPongProps {
 onClose?: () => void;
 onResult?: (result: "Win" | "Loss" | "Draw") => void;
}
type GameMode = "single" | "two";
type LiquidType = "beer" | "cola";

interface Cup {
 id: number;
 x: number;
 y: number;
 active: boolean;
 wobble: number;
 liquidWave: number;
}

interface Ball {
 x: number;
 y: number;
 height: number;
 vx: number;
 vy: number;
 verticalVelocity: number;
 flying: boolean;
 sinking: boolean;
 sinkProgress: number;
 resetting: boolean;
 bounceCount: number;
}

interface DragState {
 active: boolean;
 startX: number;
 startY: number;
 currentX: number;
 currentY: number;
}

interface SplashParticle {
 x: number;
 y: number;
 vx: number;
 vy: number;
 gravity: number;
 radius: number;
 life: number;
 maxLife: number;
}

interface LiquidRipple {
 x: number;
 y: number;
 radiusX: number;
 radiusY: number;
 life: number;
 maxLife: number;
}

const WIDTH = 400;
const HEIGHT = 800;

const BALL_START_X = WIDTH / 2;
const BALL_START_Y = 645;

const CUP_CENTER_X = WIDTH / 2;
const CUP_START_Y = 126;

const CUP_HORIZONTAL_SPACING = 56;
const CUP_VERTICAL_SPACING = 48;

const STARTING_BALLS = 10;
const STARTING_RERACKS = 2;
const TWO_PLAYER_SHOTS_PER_TURN = 3;

const clamp = (
 value: number,
 minimum: number,
 maximum: number
) => Math.max(minimum, Math.min(maximum, value));

const getPerspectiveScale = (y: number) =>
 clamp(0.48 + (y / HEIGHT) * 0.52, 0.38, 1.05);

const createBall = (): Ball => ({
 x: BALL_START_X,
 y: BALL_START_Y,
 height: 0,
 vx: 0,
 vy: 0,
 verticalVelocity: 0,
 flying: false,
 sinking: false,
 sinkProgress: 0,
 resetting: false,
 bounceCount: 0,
});

const createCups = (): Cup[] => {
 const cups: Cup[] = [];
 let id = 0;

 for (let row = 0; row < 4; row += 1) {
   const cupsInRow = 4 - row;

   const rowStartX =
     CUP_CENTER_X -
     ((cupsInRow - 1) * CUP_HORIZONTAL_SPACING) / 2;

   for (let column = 0; column < cupsInRow; column += 1) {
     cups.push({
       id,
       x: rowStartX + column * CUP_HORIZONTAL_SPACING,
       y: CUP_START_Y + row * CUP_VERTICAL_SPACING,
       active: true,
       wobble: 0,
       liquidWave: 0,
     });

     id += 1;
   }
 }

 return cups;
};

export default function CupPong({
 onClose, onResult,
}: CupPongProps) {
 const canvasRef = useRef<HTMLCanvasElement | null>(null);

 const cupsRef = useRef<Cup[]>(createCups());
 const ballRef = useRef<Ball>(createBall());

 const splashParticlesRef = useRef<SplashParticle[]>([]);
 const ripplesRef = useRef<LiquidRipple[]>([]);

 const dragRef = useRef<DragState>({
   active: false,
   startX: 0,
   startY: 0,
   currentX: 0,
   currentY: 0,
 });

 const gameModeRef = useRef<GameMode>("single");
 const liquidTypeRef = useRef<LiquidType>("cola");

 const scoreRef = useRef(0);
 const playerScoresRef = useRef<[number, number]>([0, 0]);

 const ballsLeftRef = useRef(STARTING_BALLS);
 const shotsThisTurnRef = useRef(0);
 const hitsThisTurnRef = useRef(0);
 const currentPlayerRef = useRef<0 | 1>(0);
 const reracksLeftRef = useRef(STARTING_RERACKS);
 const gameOverRef = useRef(false);
 const resultReportedRef = useRef(false);

 const timersRef = useRef<number[]>([]);

 const [gameMode, setGameMode] =
   useState<GameMode>("single");

 const [liquidType, setLiquidType] =
   useState<LiquidType>("cola");

 const [showModePicker, setShowModePicker] =
   useState(true);

 const [score, setScore] = useState(0);

 const [playerScores, setPlayerScores] =
   useState<[number, number]>([0, 0]);

 const [ballsLeft, setBallsLeft] =
   useState(STARTING_BALLS);

 const [shotsThisTurn, setShotsThisTurn] =
   useState(0);

 const [currentPlayer, setCurrentPlayer] =
   useState<0 | 1>(0);

 const [reracksLeft, setReracksLeft] =
   useState(STARTING_RERACKS);

 const [power, setPower] = useState(0);
 const [showRules, setShowRules] = useState(false);

 const [showBallsBack, setShowBallsBack] =
   useState(false);

 const [showTurnBanner, setShowTurnBanner] =
   useState(false);

 const [gameOver, setGameOver] = useState(false);
 const [won, setWon] = useState(false);

 const [winnerText, setWinnerText] =
   useState("");

 useEffect(() => {
   if (!gameOver || resultReportedRef.current) return;
   resultReportedRef.current = true;
   const result = gameMode === "two"
     ? winnerText === "The game is a draw!" ? "Draw" : winnerText === "Player 1 wins!" ? "Win" : "Loss"
     : won ? "Win" : "Loss";
   onResult?.(result);
 }, [gameMode, gameOver, onResult, winnerText, won]);

 const addTimer = useCallback(
   (callback: () => void, delay: number) => {
     const timerId = window.setTimeout(() => {
       timersRef.current = timersRef.current.filter(
         (id) => id !== timerId
       );

       callback();
     }, delay);

     timersRef.current.push(timerId);
   },
   []
 );

 const clearTimers = useCallback(() => {
   timersRef.current.forEach((timerId) => {
     window.clearTimeout(timerId);
   });

   timersRef.current = [];
 }, []);

 const resetBall = useCallback(() => {
   ballRef.current = createBall();

   dragRef.current = {
     active: false,
     startX: 0,
     startY: 0,
     currentX: 0,
     currentY: 0,
   };

   setPower(0);
 }, []);

 const createLiquidSplash = useCallback(
   (cup: Cup) => {
     cup.liquidWave = 20;
     cup.wobble = 12;

     const particleCount =
       liquidTypeRef.current === "cola" ? 18 : 15;

     for (let index = 0; index < particleCount; index += 1) {
       const angle =
         Math.PI +
         Math.random() * Math.PI;

       const speed =
         1.2 + Math.random() * 3.4;

       splashParticlesRef.current.push({
         x: cup.x + (Math.random() - 0.5) * 8,
         y: cup.y,
         vx:
           Math.cos(angle) * speed +
           (Math.random() - 0.5) * 1.5,
         vy: -2.5 - Math.random() * 4.5,
         gravity: 0.19 + Math.random() * 0.08,
         radius: 1.2 + Math.random() * 2.2,
         life: 1,
         maxLife: 1,
       });
     }

     ripplesRef.current.push({
       x: cup.x,
       y: cup.y + 1,
       radiusX: 3,
       radiusY: 1,
       life: 1,
       maxLife: 1,
     });

     addTimer(() => {
       ripplesRef.current.push({
         x: cup.x,
         y: cup.y + 1,
         radiusX: 4,
         radiusY: 1.5,
         life: 1,
         maxLife: 1,
       });
     }, 110);
   },
   [addTimer]
 );

 const finishSinglePlayerGame = useCallback(
   (didWin: boolean) => {
     gameOverRef.current = true;

     setWon(didWin);
     setWinnerText(
       didWin
         ? "You cleared every cup!"
         : "You ran out of balls."
     );
     setGameOver(true);
   },
   []
 );

 const finishTwoPlayerGame = useCallback(() => {
   gameOverRef.current = true;

   const [playerOneScore, playerTwoScore] =
     playerScoresRef.current;

   if (playerOneScore > playerTwoScore) {
     setWinnerText("Player 1 wins!");
   } else if (playerTwoScore > playerOneScore) {
     setWinnerText("Player 2 wins!");
   } else {
     setWinnerText("The game is a draw!");
   }

   setWon(true);
   setGameOver(true);
 }, []);

 const switchPlayer = useCallback(() => {
   const nextPlayer: 0 | 1 =
     currentPlayerRef.current === 0 ? 1 : 0;

   currentPlayerRef.current = nextPlayer;
   shotsThisTurnRef.current = 0;
   hitsThisTurnRef.current = 0;

   setCurrentPlayer(nextPlayer);
   setShotsThisTurn(0);
   setShowTurnBanner(true);

   addTimer(() => {
     setShowTurnBanner(false);
   }, 1500);
 }, [addTimer]);

 const processSinglePlayerShot = useCallback(
   (madeShot: boolean) => {
     ballsLeftRef.current -= 1;
     shotsThisTurnRef.current += 1;

     if (madeShot) {
       hitsThisTurnRef.current += 1;
     }

     if (shotsThisTurnRef.current >= 2) {
       if (hitsThisTurnRef.current >= 2) {
         ballsLeftRef.current += 2;

         setShowBallsBack(true);

         addTimer(() => {
           setShowBallsBack(false);
         }, 2200);
       }

       shotsThisTurnRef.current = 0;
       hitsThisTurnRef.current = 0;
     }

     ballsLeftRef.current = Math.max(
       0,
       ballsLeftRef.current
     );

     setBallsLeft(ballsLeftRef.current);

     const activeCupCount = cupsRef.current.filter(
       (cup) => cup.active
     ).length;

     const cupsRemaining = madeShot
       ? activeCupCount - 1
       : activeCupCount;

     if (cupsRemaining <= 0) {
       finishSinglePlayerGame(true);
       return;
     }

     if (ballsLeftRef.current <= 0) {
       finishSinglePlayerGame(false);
     }
   },
   [addTimer, finishSinglePlayerGame]
 );

 const processTwoPlayerShot = useCallback(
   (madeShot: boolean) => {
     const player = currentPlayerRef.current;

     if (madeShot) {
       const nextScores: [number, number] = [
         playerScoresRef.current[0],
         playerScoresRef.current[1],
       ];

       nextScores[player] += 1;

       playerScoresRef.current = nextScores;
       setPlayerScores(nextScores);
     }

     shotsThisTurnRef.current += 1;
     setShotsThisTurn(shotsThisTurnRef.current);

     const activeCupCount = cupsRef.current.filter(
       (cup) => cup.active
     ).length;

     const cupsRemaining = madeShot
       ? activeCupCount - 1
       : activeCupCount;

     if (cupsRemaining <= 0) {
       finishTwoPlayerGame();
       return;
     }

     if (
       shotsThisTurnRef.current >=
       TWO_PLAYER_SHOTS_PER_TURN
     ) {
       switchPlayer();
     }
   },
   [finishTwoPlayerGame, switchPlayer]
 );

 const processShot = useCallback(
   (madeShot: boolean) => {
     if (gameOverRef.current) {
       return;
     }

     if (gameModeRef.current === "two") {
       processTwoPlayerShot(madeShot);
     } else {
       processSinglePlayerShot(madeShot);
     }
   },
   [
     processSinglePlayerShot,
     processTwoPlayerShot,
   ]
 );

 const resetGameValues = useCallback(
   (mode: GameMode) => {
     clearTimers();

     gameModeRef.current = mode;

     cupsRef.current = createCups();
     ballRef.current = createBall();
     splashParticlesRef.current = [];
     ripplesRef.current = [];

     dragRef.current = {
       active: false,
       startX: 0,
       startY: 0,
       currentX: 0,
       currentY: 0,
     };

     scoreRef.current = 0;
     playerScoresRef.current = [0, 0];
     ballsLeftRef.current = STARTING_BALLS;
     shotsThisTurnRef.current = 0;
     hitsThisTurnRef.current = 0;
     currentPlayerRef.current = 0;
     reracksLeftRef.current = STARTING_RERACKS;
     gameOverRef.current = false;
     resultReportedRef.current = false;

     setGameMode(mode);
     setScore(0);
     setPlayerScores([0, 0]);
     setBallsLeft(STARTING_BALLS);
     setShotsThisTurn(0);
     setCurrentPlayer(0);
     setReracksLeft(STARTING_RERACKS);
     setPower(0);

     setShowBallsBack(false);
     setShowTurnBanner(false);
     setGameOver(false);
     setWon(false);
     setWinnerText("");
   },
   [clearTimers]
 );

 const startGame = useCallback(
   (mode: GameMode) => {
     resetGameValues(mode);
     setShowModePicker(false);
   },
   [resetGameValues]
 );

 const restartGame = useCallback(() => {
   resetGameValues(gameModeRef.current);
 }, [resetGameValues]);

 const changeMode = useCallback(() => {
   resetGameValues("single");
   setShowModePicker(true);
 }, [resetGameValues]);

 const changeLiquid = useCallback(
   (nextLiquid: LiquidType) => {
     liquidTypeRef.current = nextLiquid;
     setLiquidType(nextLiquid);
   },
   []
 );

 const handleRerack = useCallback(() => {
   if (
     reracksLeftRef.current <= 0 ||
     ballRef.current.flying ||
     ballRef.current.resetting ||
     gameOverRef.current
   ) {
     return;
   }

   const activeCups = cupsRef.current.filter(
     (cup) => cup.active
   );

   const count = activeCups.length;

   if (count <= 1 || count >= 10) {
     return;
   }

   const formations: Record<number, number[]> = {
     9: [4, 3, 2],
     8: [3, 3, 2],
     7: [3, 2, 2],
     6: [3, 2, 1],
     5: [3, 2],
     4: [2, 1, 1],
     3: [2, 1],
     2: [2],
   };

   const formation = formations[count];

   if (!formation) {
     return;
   }

   let cupIndex = 0;

   formation.forEach((cupsInRow, rowIndex) => {
     const rowStartX =
       CUP_CENTER_X -
       ((cupsInRow - 1) * CUP_HORIZONTAL_SPACING) / 2;

     for (
       let column = 0;
       column < cupsInRow;
       column += 1
     ) {
       const cup = activeCups[cupIndex];

       if (cup) {
         cup.x =
           rowStartX +
           column * CUP_HORIZONTAL_SPACING;

         cup.y =
           CUP_START_Y +
           rowIndex * CUP_VERTICAL_SPACING;
       }

       cupIndex += 1;
     }
   });

   const nextReracks = reracksLeftRef.current - 1;

   reracksLeftRef.current = nextReracks;
   setReracksLeft(nextReracks);
 }, []);

 useEffect(() => {
   const canvas = canvasRef.current;

   if (!canvas) {
     return;
   }

   const context = canvas.getContext("2d");

   if (!context) {
     return;
   }

   let animationFrameId = 0;
   let previousTime = performance.now();

   const drawBackground = () => {
     const background = context.createLinearGradient(
       0,
       0,
       0,
       HEIGHT
     );

     background.addColorStop(0, "#43281f");
     background.addColorStop(0.5, "#2f1b16");
     background.addColorStop(1, "#160d0a");

     context.fillStyle = background;
     context.fillRect(0, 0, WIDTH, HEIGHT);

     context.strokeStyle =
       "rgba(255,255,255,0.035)";
     context.lineWidth = 1;

     for (let x = 0; x <= WIDTH; x += 50) {
       context.beginPath();
       context.moveTo(x, 0);
       context.lineTo(x, HEIGHT);
       context.stroke();
     }
   };

   const drawTable = () => {
     const topY = 112;
     const bottomY = HEIGHT + 12;

     const farLeft = 20;
     const farRight = WIDTH - 20;
     const nearLeft = -48;
     const nearRight = WIDTH + 48;

     context.save();

     context.shadowColor = "rgba(0,0,0,0.65)";
     context.shadowBlur = 18;
     context.shadowOffsetY = 8;

     const tableGradient =
       context.createLinearGradient(
         0,
         topY,
         0,
         bottomY
       );

     tableGradient.addColorStop(0, "#047b3a");
     tableGradient.addColorStop(0.38, "#079b4b");
     tableGradient.addColorStop(0.72, "#08b85a");
     tableGradient.addColorStop(1, "#05c866");

     context.fillStyle = tableGradient;

     context.beginPath();
     context.moveTo(farLeft, topY);
     context.lineTo(farRight, topY);
     context.lineTo(nearRight, bottomY);
     context.lineTo(nearLeft, bottomY);
     context.closePath();
     context.fill();

     context.restore();

     context.strokeStyle = "#f8fafc";
     context.lineWidth = 5;

     context.beginPath();
     context.moveTo(farLeft, topY);
     context.lineTo(farRight, topY);
     context.stroke();

     context.beginPath();
     context.moveTo(farLeft, topY);
     context.lineTo(nearLeft, bottomY);
     context.stroke();

     context.beginPath();
     context.moveTo(farRight, topY);
     context.lineTo(nearRight, bottomY);
     context.stroke();

     context.strokeStyle =
       "rgba(255,255,255,0.88)";
     context.lineWidth = 3;

     context.beginPath();
     context.moveTo(WIDTH / 2, topY);
     context.lineTo(WIDTH / 2, bottomY);
     context.stroke();

     context.save();
     context.beginPath();
     context.moveTo(farLeft, topY);
     context.lineTo(farRight, topY);
     context.lineTo(nearRight, bottomY);
     context.lineTo(nearLeft, bottomY);
     context.closePath();
     context.clip();

     for (let y = topY + 28; y < bottomY; y += 34) {
       const depth = (y - topY) / (bottomY - topY);
       context.strokeStyle = `rgba(255,255,255,${0.018 + depth * 0.018})`;
       context.lineWidth = 1;
       context.beginPath();
       context.moveTo(-30, y);
       context.lineTo(WIDTH + 30, y);
       context.stroke();
     }

     context.restore();
   };

   const getCupMeasurements = (cup: Cup) => {
     const rowProgress = clamp(
       (cup.y - CUP_START_Y) /
         (CUP_VERTICAL_SPACING * 3),
       0,
       1
     );

     const perspective =
       0.76 + rowProgress * 0.16;

     return {
       rowProgress,
       perspective,
       topRadiusX: 34 * perspective,
       topRadiusY: 11 * perspective,
       bottomRadius: 20 * perspective,
       cupHeight: 53 * perspective,
     };
   };

   const getBallRenderRadius = (ball: Ball) => {
     const distanceScale = getPerspectiveScale(ball.y);
     const heightScale = 1 + ball.height * 0.0012;

     return clamp(
       17 * distanceScale * heightScale,
       6,
       19
     );
   };

   const drawCup = (cup: Cup) => {
     if (!cup.active) {
       return;
     }

     const {
       perspective,
       topRadiusX,
       topRadiusY,
       bottomRadius,
       cupHeight,
     } = getCupMeasurements(cup);

     context.save();

     if (cup.wobble > 0) {
       const rotation =
         Math.sin(cup.wobble * 0.8) * 0.035;

       context.translate(cup.x, cup.y);
       context.rotate(rotation);
       context.translate(-cup.x, -cup.y);
     }

     /*
      * Grounding shadows. The ambient shadow stretches slightly away from
      * the cup, while the tight contact shadow touches the base. Keeping
      * these attached removes the old floating-cup appearance.
      */
     context.shadowColor = "transparent";
     context.shadowBlur = 0;
     context.shadowOffsetX = 0;
     context.shadowOffsetY = 0;
     context.fillStyle = "rgba(0,35,20,0.2)";
     context.beginPath();
     context.ellipse(
       cup.x + bottomRadius * 0.4,
       cup.y + cupHeight + 2,
       bottomRadius * 1.65,
       topRadiusY * 0.36,
       0,
       0,
       Math.PI * 2
     );
     context.fill();

     context.fillStyle = "rgba(0,20,12,0.48)";
     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y + cupHeight + 0.8,
       bottomRadius * 1.08,
       topRadiusY * 0.2,
       0,
       0,
       Math.PI * 2
     );
     context.fill();

     const bodyGradient =
       context.createLinearGradient(
         cup.x - topRadiusX,
         cup.y,
         cup.x + topRadiusX,
         cup.y
       );

     bodyGradient.addColorStop(0, "#720811");
     bodyGradient.addColorStop(0.11, "#a90e1b");
     bodyGradient.addColorStop(0.31, "#d32734");
     bodyGradient.addColorStop(0.5, "#e8424d");
     bodyGradient.addColorStop(0.69, "#cf2632");
     bodyGradient.addColorStop(0.9, "#9c0e19");
     bodyGradient.addColorStop(1, "#62060d");

     context.fillStyle = bodyGradient;

     context.beginPath();
     context.moveTo(cup.x - topRadiusX, cup.y);
     context.bezierCurveTo(
       cup.x - topRadiusX * 0.96,
       cup.y + cupHeight * 0.25,
       cup.x - bottomRadius * 1.18,
       cup.y + cupHeight * 0.78,
       cup.x - bottomRadius,
       cup.y + cupHeight
     );

     context.quadraticCurveTo(
       cup.x,
       cup.y + cupHeight + 3,
       cup.x + bottomRadius,
       cup.y + cupHeight
     );

     context.bezierCurveTo(
       cup.x + bottomRadius * 1.18,
       cup.y + cupHeight * 0.78,
       cup.x + topRadiusX * 0.96,
       cup.y + cupHeight * 0.25,
       cup.x + topRadiusX,
       cup.y
     );
     context.closePath();
     context.fill();

     /* Soft vertical falloff gives the plastic body real depth. */
     const bodyDepthGradient = context.createLinearGradient(
       0,
       cup.y,
       0,
       cup.y + cupHeight
     );
     bodyDepthGradient.addColorStop(0, "rgba(255,255,255,0.08)");
     bodyDepthGradient.addColorStop(0.35, "rgba(255,255,255,0)");
     bodyDepthGradient.addColorStop(0.78, "rgba(76,0,9,0.08)");
     bodyDepthGradient.addColorStop(1, "rgba(55,0,7,0.24)");
     context.fillStyle = bodyDepthGradient;
     context.beginPath();
     context.moveTo(cup.x - topRadiusX, cup.y);
     context.lineTo(cup.x - bottomRadius, cup.y + cupHeight);
     context.quadraticCurveTo(
       cup.x,
       cup.y + cupHeight + 3,
       cup.x + bottomRadius,
       cup.y + cupHeight
     );
     context.lineTo(cup.x + topRadiusX, cup.y);
     context.closePath();
     context.fill();

     /* Rounded bottom edge sitting directly on the contact shadow. */
     const baseGradient = context.createLinearGradient(
       cup.x - bottomRadius,
       0,
       cup.x + bottomRadius,
       0
     );
     baseGradient.addColorStop(0, "#780611");
     baseGradient.addColorStop(0.42, "#d31426");
     baseGradient.addColorStop(0.72, "#b7091a");
     baseGradient.addColorStop(1, "#65040d");
     context.fillStyle = baseGradient;
     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y + cupHeight,
       bottomRadius,
       Math.max(1.1, topRadiusY * 0.18),
       0,
       0,
       Math.PI
     );
     context.fill();

     const lowerShade = context.createLinearGradient(
       0,
       cup.y + cupHeight * 0.7,
       0,
       cup.y + cupHeight
     );
     lowerShade.addColorStop(0, "rgba(100,0,10,0)");
     lowerShade.addColorStop(1, "rgba(75,0,8,0.28)");
     context.fillStyle = lowerShade;
     context.beginPath();
     context.moveTo(cup.x - topRadiusX * 0.7, cup.y + cupHeight * 0.7);
     context.lineTo(cup.x - bottomRadius, cup.y + cupHeight);
     context.quadraticCurveTo(cup.x, cup.y + cupHeight + 3, cup.x + bottomRadius, cup.y + cupHeight);
     context.lineTo(cup.x + topRadiusX * 0.7, cup.y + cupHeight * 0.7);
     context.closePath();
     context.fill();

     /* Raised plastic reinforcement rings from the reference cup. */
     [0.46, 0.53, 0.82].forEach((ratio) => {
       const bandY = cup.y + cupHeight * ratio;
       const bandHalfWidth = topRadiusX - (topRadiusX - bottomRadius) * ratio;

       context.strokeStyle = "rgba(76,0,10,0.18)";
       context.lineWidth = Math.max(0.9, 1.35 * perspective);
       context.beginPath();
       context.moveTo(cup.x - bandHalfWidth, bandY);
       context.quadraticCurveTo(cup.x, bandY + 2, cup.x + bandHalfWidth, bandY);
       context.stroke();

       context.strokeStyle = "rgba(255,118,127,0.2)";
       context.lineWidth = Math.max(0.5, 0.7 * perspective);
       context.beginPath();
       context.moveTo(cup.x - bandHalfWidth, bandY - 1.5);
       context.quadraticCurveTo(cup.x, bandY + 0.5, cup.x + bandHalfWidth, bandY - 1.5);
       context.stroke();
     });

     /* Strong glossy reflection, narrowing toward the base. */
     const shineGradient = context.createLinearGradient(
       cup.x + topRadiusX * 0.12,
       cup.y,
       cup.x + topRadiusX * 0.72,
       cup.y
     );
     shineGradient.addColorStop(0, "rgba(255,255,255,0.02)");
     shineGradient.addColorStop(0.5, "rgba(255,235,238,0.28)");
     shineGradient.addColorStop(1, "rgba(255,255,255,0.05)");
     context.fillStyle = shineGradient;

     context.beginPath();
     context.moveTo(
       cup.x + topRadiusX * 0.38,
       cup.y + 4
     );
     context.lineTo(
       cup.x + bottomRadius * 0.15,
       cup.y + cupHeight - 4
     );
     context.lineTo(
       cup.x + bottomRadius * 0.31,
       cup.y + cupHeight - 4
     );
     context.lineTo(
       cup.x + topRadiusX * 0.58,
       cup.y + 5
     );
     context.closePath();
     context.fill();

     /* Red collar directly beneath the rolled white rim. */
     context.strokeStyle = "rgba(117,4,20,0.78)";
     context.lineWidth = Math.max(2.4, 3.4 * perspective);
     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y + topRadiusY * 0.45,
       topRadiusX * 0.98,
       topRadiusY * 0.72,
       0,
       0,
       Math.PI
     );
     context.stroke();

     /*
      * Thick white rim.
      */
     context.shadowColor = "rgba(37,8,10,0.42)";
     context.shadowBlur = 5;
     context.shadowOffsetY = 1.5;

     const rimGradient = context.createLinearGradient(
       0,
       cup.y - topRadiusY,
       0,
       cup.y + topRadiusY
     );
     rimGradient.addColorStop(0, "#ffffff");
     rimGradient.addColorStop(0.45, "#f7f2e8");
     rimGradient.addColorStop(1, "#cfc7b9");
     context.fillStyle = rimGradient;

     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y,
       topRadiusX,
       topRadiusY,
       0,
       0,
       Math.PI * 2
     );
     context.fill();

     context.strokeStyle = "rgba(255,255,255,0.96)";
     context.lineWidth = Math.max(1, 1.35 * perspective);
     context.stroke();

     context.shadowColor = "transparent";

     context.strokeStyle = "rgba(255,255,255,0.72)";
     context.lineWidth = Math.max(1, 1.3 * perspective);
     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y - 0.3,
       topRadiusX * 0.96,
       topRadiusY * 0.92,
       0,
       Math.PI * 1.05,
       Math.PI * 1.95
     );
     context.stroke();

     /*
      * Dark inner wall under the rim.
      */
     const innerWallGradient = context.createLinearGradient(
       0,
       cup.y - topRadiusY,
       0,
       cup.y + topRadiusY
     );
     innerWallGradient.addColorStop(0, "#681a25");
     innerWallGradient.addColorStop(0.55, "#8b2730");
     innerWallGradient.addColorStop(1, "#431017");
     context.fillStyle = innerWallGradient;

     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y + 1,
       topRadiusX * 0.91,
       topRadiusY * 0.8,
       0,
       0,
       Math.PI * 2
     );
     context.fill();

     /*
      * Liquid surface.
      */
     const waveAmount =
       cup.liquidWave > 0
         ? Math.sin(cup.liquidWave * 0.9) *
           cup.liquidWave *
           0.025
         : 0;

     const liquidRadiusX =
       topRadiusX * 0.82;

     const liquidRadiusY =
       topRadiusY * (0.5 + waveAmount * 0.05);

     if (liquidTypeRef.current === "beer") {
       const beerGradient =
         context.createRadialGradient(
           cup.x - liquidRadiusX * 0.35,
           cup.y - liquidRadiusY * 0.25,
           1,
           cup.x,
           cup.y + 1,
           liquidRadiusX
         );

       beerGradient.addColorStop(
         0,
         "rgba(255,221,111,0.98)"
       );
       beerGradient.addColorStop(
         0.35,
         "rgba(245,169,35,0.98)"
       );
       beerGradient.addColorStop(
         0.75,
         "rgba(190,103,13,0.98)"
       );
       beerGradient.addColorStop(
         1,
         "rgba(101,48,5,0.99)"
       );

       context.fillStyle = beerGradient;
     } else {
       const colaGradient =
         context.createRadialGradient(
           cup.x - liquidRadiusX * 0.25,
           cup.y - liquidRadiusY * 0.2,
           1,
           cup.x,
           cup.y + 1,
           liquidRadiusX
         );

       colaGradient.addColorStop(0, "#b76e2e");
       colaGradient.addColorStop(0.28, "#6b2c12");
       colaGradient.addColorStop(0.68, "#321007");
       colaGradient.addColorStop(1, "#120503");

       context.fillStyle = colaGradient;
     }

     context.beginPath();
     context.ellipse(
       cup.x,
       cup.y + 1.6,
       liquidRadiusX,
       liquidRadiusY,
       waveAmount,
       0,
       Math.PI * 2
     );
     context.fill();

     /*
      * Liquid highlight.
      */
     context.strokeStyle =
       liquidTypeRef.current === "beer"
         ? "rgba(255,238,178,0.78)"
         : "rgba(255,200,135,0.34)";

     context.lineWidth = 1.2;

     context.beginPath();
     context.ellipse(
       cup.x - liquidRadiusX * 0.12,
       cup.y + 0.5,
       liquidRadiusX * 0.64,
       liquidRadiusY * 0.48,
       waveAmount,
       Math.PI * 1.08,
       Math.PI * 1.78
     );
     context.stroke();

     if (liquidTypeRef.current === "beer") {
       context.strokeStyle = "rgba(255,245,210,0.78)";
       context.lineWidth = 2.1;
       context.beginPath();
       context.ellipse(
         cup.x,
         cup.y + 1.2,
         liquidRadiusX * 0.96,
         liquidRadiusY * 0.9,
         waveAmount,
         0,
         Math.PI * 2
       );
       context.stroke();

       context.fillStyle = "rgba(255,244,205,0.72)";
       const foamBubbles = [
         [-0.52, -0.08, 1.2],
         [-0.25, 0.1, 0.9],
         [0.04, -0.12, 1.05],
         [0.31, 0.07, 0.8],
         [0.53, -0.04, 1.15],
       ];
       foamBubbles.forEach(([offsetX, offsetY, radius]) => {
         context.beginPath();
         context.arc(
           cup.x + liquidRadiusX * offsetX,
           cup.y + 1 + liquidRadiusY * offsetY,
           radius,
           0,
           Math.PI * 2
         );
         context.fill();
       });
     }

     /*
      * Cola bubbles.
      */
     if (liquidTypeRef.current === "cola") {
       context.fillStyle =
         "rgba(255,210,150,0.4)";

       const bubblePositions = [
         [-0.4, -0.05, 1.1],
         [0.22, 0.1, 0.8],
         [0.48, -0.04, 0.65],
       ];

       bubblePositions.forEach(
         ([offsetX, offsetY, radius]) => {
           context.beginPath();
           context.arc(
             cup.x + liquidRadiusX * offsetX,
             cup.y +
               1 +
               liquidRadiusY * offsetY,
             radius,
             0,
             Math.PI * 2
           );
           context.fill();
         }
       );
     }

     context.restore();
   };

   const drawCups = () => {
     [...cupsRef.current]
       .sort(
         (firstCup, secondCup) =>
           firstCup.y - secondCup.y
       )
       .forEach(drawCup);
   };

   const drawRipples = () => {
     ripplesRef.current.forEach((ripple) => {
       const alpha = clamp(ripple.life, 0, 1);

       context.strokeStyle =
         liquidTypeRef.current === "beer"
           ? `rgba(255,220,120,${alpha * 0.78})`
           : `rgba(255,194,120,${alpha * 0.55})`;

       context.lineWidth = 1.5;

       context.beginPath();
       context.ellipse(
         ripple.x,
         ripple.y,
         ripple.radiusX,
         ripple.radiusY,
         0,
         0,
         Math.PI * 2
       );
       context.stroke();
     });
   };

   const drawSplashParticles = () => {
     splashParticlesRef.current.forEach(
       (particle) => {
         const alpha = clamp(
           particle.life / particle.maxLife,
           0,
           1
         );

         if (liquidTypeRef.current === "beer") {
           context.fillStyle = `rgba(232,153,35,${
             alpha * 0.9
           })`;
         } else {
           context.fillStyle = `rgba(116,53,20,${
             alpha * 0.95
           })`;
         }

         context.beginPath();
         context.arc(
           particle.x,
           particle.y,
           particle.radius,
           0,
           Math.PI * 2
         );
         context.fill();

         context.fillStyle = `rgba(255,255,255,${
           alpha * 0.45
         })`;

         context.beginPath();
         context.arc(
           particle.x - particle.radius * 0.25,
           particle.y - particle.radius * 0.25,
           particle.radius * 0.28,
           0,
           Math.PI * 2
         );
         context.fill();
       }
     );
   };

   const drawBall = () => {
     const ball = ballRef.current;

     if (ball.sinking && ball.sinkProgress >= 1) {
       return;
     }

     context.save();

     if (ball.sinking) {
       context.globalAlpha = clamp(
         1 - ball.sinkProgress * 0.92,
         0,
         1
       );
     }

     const radius = getBallRenderRadius(ball);

     const renderY =
       ball.y -
       ball.height +
       (ball.sinking ? ball.sinkProgress * 8 : 0);

     if (!ball.sinking) {
       const shadowScale = clamp(
         1 - ball.height / 200,
         0.14,
         1
       );

       context.fillStyle =
         "rgba(0,0,0,0.3)";

       context.beginPath();
       context.ellipse(
         ball.x + 2,
         ball.y + 9,
         radius * 0.92 * shadowScale,
         radius * 0.34 * shadowScale,
         0,
         0,
         Math.PI * 2
       );
       context.fill();
     }

     const ballGradient =
       context.createRadialGradient(
         ball.x - radius * 0.38,
         renderY - radius * 0.4,
         radius * 0.08,
         ball.x,
         renderY,
         radius
       );

     if (ball.sinking) {
       if (liquidTypeRef.current === "beer") {
         ballGradient.addColorStop(0, "#fffbea");
         ballGradient.addColorStop(0.48, "#f7d98a");
         ballGradient.addColorStop(1, "#a55a0b");
       } else {
         ballGradient.addColorStop(0, "#f8eadf");
         ballGradient.addColorStop(0.5, "#c9a48a");
         ballGradient.addColorStop(1, "#59301e");
       }
     } else {
       ballGradient.addColorStop(0, "#ffffff");
       ballGradient.addColorStop(0.52, "#ffffff");
       ballGradient.addColorStop(0.82, "#edf1f5");
       ballGradient.addColorStop(1, "#aeb8c2");
     }

     context.fillStyle = ballGradient;

     context.beginPath();
     context.arc(
       ball.x,
       renderY,
       ball.sinking
         ? radius * (0.82 - ball.sinkProgress * 0.42)
         : radius,
       0,
       Math.PI * 2
     );
     context.fill();

     context.strokeStyle =
       "rgba(15,23,42,0.18)";
     context.lineWidth = 1.2;
     context.stroke();

     context.restore();
   };

   const drawAimGuide = () => {
     const drag = dragRef.current;
     const ball = ballRef.current;

     if (
       !drag.active ||
       ball.flying ||
       gameOverRef.current
     ) {
       return;
     }

     const dx =
       drag.currentX - drag.startX;

     const dy =
       drag.currentY - drag.startY;

     if (dy >= 0) {
       return;
     }

     const strength = clamp(
       Math.hypot(dx, dy) / 190,
       0,
       1
     );

     for (let step = 1; step <= 16; step += 1) {
       const t = step / 16;

       const projectedX =
         ball.x + dx * 0.48 * t;

       const projectedY =
         ball.y +
         dy * 0.75 * t -
         Math.sin(t * Math.PI) *
           72 *
           strength;

       const perspective =
         getPerspectiveScale(projectedY);

       const dotRadius = Math.max(
         1.2,
         (5 - t * 3.3) * perspective
       );

       context.fillStyle = `rgba(255,255,255,${
         0.88 - t * 0.62
       })`;

       context.beginPath();
       context.arc(
         projectedX,
         projectedY,
         dotRadius,
         0,
         Math.PI * 2
       );
       context.fill();
     }
   };

   const completeMiss = () => {
     const ball = ballRef.current;

     if (ball.resetting) {
       return;
     }

     ball.resetting = true;
     ball.flying = false;

     processShot(false);

     addTimer(() => {
       if (!gameOverRef.current) {
         resetBall();
       }
     }, 500);
   };

   const updateLiquidEffects = (delta: number) => {
     cupsRef.current.forEach((cup) => {
       if (cup.wobble > 0) {
         cup.wobble = Math.max(
           0,
           cup.wobble - delta
         );
       }

       if (cup.liquidWave > 0) {
         cup.liquidWave = Math.max(
           0,
           cup.liquidWave - delta
         );
       }
     });

     splashParticlesRef.current =
       splashParticlesRef.current
         .map((particle) => ({
           ...particle,
           x: particle.x + particle.vx * delta,
           y: particle.y + particle.vy * delta,
           vy:
             particle.vy +
             particle.gravity * delta,
           vx: particle.vx * Math.pow(0.985, delta),
           life:
             particle.life -
             0.028 * delta,
         }))
         .filter((particle) => particle.life > 0);

     ripplesRef.current =
       ripplesRef.current
         .map((ripple) => ({
           ...ripple,
           radiusX:
             ripple.radiusX + 0.75 * delta,
           radiusY:
             ripple.radiusY + 0.22 * delta,
           life:
             ripple.life -
             0.045 * delta,
         }))
         .filter((ripple) => ripple.life > 0);
   };

   const updatePhysics = (delta: number) => {
     const ball = ballRef.current;

     updateLiquidEffects(delta);

     if (ball.sinking) {
       ball.sinkProgress = Math.min(
         1,
         ball.sinkProgress + 0.075 * delta
       );
       ball.height = Math.max(
         0,
         2 * (1 - ball.sinkProgress)
       );
       return;
     }

     if (
       !ball.flying ||
       ball.resetting ||
       gameOverRef.current
     ) {
       return;
     }

     ball.x += ball.vx * delta;
     ball.y += ball.vy * delta;

     ball.height +=
       ball.verticalVelocity * delta;

     ball.verticalVelocity -= 0.62 * delta;

     const airDrag = Math.pow(
       ball.height > 0 ? 0.992 : 0.98,
       delta
     );

     ball.vx *= airDrag;
     ball.vy *= airDrag;

     if (
       ball.verticalVelocity < 0 &&
       ball.height <= 43 &&
       ball.height >= 1
     ) {
       for (const cup of cupsRef.current) {
         if (!cup.active) {
           continue;
         }

         const {
           topRadiusX,
           topRadiusY,
         } = getCupMeasurements(cup);

         const ballRadius =
           getBallRenderRadius(ball);

         const deltaX = ball.x - cup.x;
         const deltaY = ball.y - cup.y;

         /*
          * Use the visible ball and elliptical rim sizes for collision.
          * A centered ball fits through the inner opening; only its edge
          * touching the raised rim produces a bounce.
          */
         const openingRadiusX = Math.max(
           4,
           topRadiusX * 0.79 - ballRadius * 0.45
         );
         const openingRadiusY = Math.max(
           3,
           topRadiusY * 0.68 - ballRadius * 0.16
         );

         const insideOpening =
           (deltaX * deltaX) /
             (openingRadiusX * openingRadiusX) +
             (deltaY * deltaY) /
               (openingRadiusY * openingRadiusY) <=
           1;

         if (insideOpening) {
           ball.sinking = true;
           ball.sinkProgress = 0;
           ball.resetting = true;

           ball.vx = 0;
           ball.vy = 0;
           ball.verticalVelocity = 0;

           ball.x = cup.x;
           ball.y = cup.y + 2;
           ball.height = 2;

           createLiquidSplash(cup);

           scoreRef.current += 1;
           setScore(scoreRef.current);

           processShot(true);

           addTimer(() => {
             cup.active = false;

             if (!gameOverRef.current) {
               resetBall();
             }
           }, 460);

           return;
         }

         const contactRadiusX =
           topRadiusX + ballRadius * 0.72;
         const contactRadiusY =
           topRadiusY + ballRadius * 0.5;

         const touchesRim =
           (deltaX * deltaX) /
             (contactRadiusX * contactRadiusX) +
             (deltaY * deltaY) /
               (contactRadiusY * contactRadiusY) <=
           1;

         if (touchesRim) {
           const distance = Math.hypot(
             deltaX,
             deltaY
           );
           const safeDistance = Math.max(
             distance,
             0.01
           );

           const normalX =
             deltaX / safeDistance;

           const normalY =
             deltaY / safeDistance;

           const speed = Math.max(
             1.8,
             Math.hypot(ball.vx, ball.vy) * 0.48
           );

           ball.vx =
             normalX * speed + ball.vx * 0.12;

           ball.vy =
             normalY * speed + ball.vy * 0.12;

           ball.verticalVelocity =
             Math.abs(ball.verticalVelocity) *
               0.42 +
             1.3;

           ball.height = 43;
           ball.bounceCount += 1;
           cup.wobble = 9;
           cup.liquidWave = 10;

           ripplesRef.current.push({
             x: cup.x,
             y: cup.y + 1,
             radiusX: 3,
             radiusY: 1,
             life: 0.8,
             maxLife: 0.8,
           });

           break;
         }
       }
     }

     if (
       ball.height <= 0 &&
       ball.verticalVelocity < 0
     ) {
       ball.height = 0;

       ball.verticalVelocity =
         Math.abs(ball.verticalVelocity) * 0.42;

       ball.vx *= 0.8;
       ball.vy *= 0.8;
       ball.bounceCount += 1;

       const groundSpeed = Math.hypot(
         ball.vx,
         ball.vy
       );

       if (
         ball.verticalVelocity < 0.75 &&
         groundSpeed < 0.55
       ) {
         completeMiss();
         return;
       }
     }

     const fullyOutside =
       ball.x < -80 ||
       ball.x > WIDTH + 80 ||
       ball.y < -120 ||
       ball.y > HEIGHT + 120 ||
       ball.height < -100;

     if (fullyOutside) {
       completeMiss();
     }
   };

   const gameLoop = (currentTime: number) => {
     const elapsed =
       currentTime - previousTime;

     previousTime = currentTime;

     const delta = Math.min(
       elapsed / 16.67,
       2
     );

     updatePhysics(delta);

     drawBackground();
     drawTable();
     drawCups();
     drawRipples();
     drawBall();
     drawSplashParticles();
     drawAimGuide();

     animationFrameId =
       window.requestAnimationFrame(gameLoop);
   };

   animationFrameId =
     window.requestAnimationFrame(gameLoop);

   return () => {
     window.cancelAnimationFrame(
       animationFrameId
     );
   };
 }, [
   addTimer,
   createLiquidSplash,
   processShot,
   resetBall,
 ]);

 useEffect(() => {
   return () => {
     clearTimers();
   };
 }, [clearTimers]);

 const getPointerPosition = (
   event: React.PointerEvent<HTMLCanvasElement>
 ) => {
   const canvas = canvasRef.current;

   if (!canvas) {
     return null;
   }

   const rect = canvas.getBoundingClientRect();

   return {
     x:
       (event.clientX - rect.left) *
       (canvas.width / rect.width),

     y:
       (event.clientY - rect.top) *
       (canvas.height / rect.height),
   };
 };

 const handlePointerDown = (
   event: React.PointerEvent<HTMLCanvasElement>
 ) => {
   if (
     showModePicker ||
     ballRef.current.flying ||
     ballRef.current.resetting ||
     gameOverRef.current
   ) {
     return;
   }

   const point = getPointerPosition(event);

   if (!point) {
     return;
   }

   event.currentTarget.setPointerCapture(
     event.pointerId
   );

   dragRef.current = {
     active: true,
     startX: point.x,
     startY: point.y,
     currentX: point.x,
     currentY: point.y,
   };

   setPower(0);
 };

 const handlePointerMove = (
   event: React.PointerEvent<HTMLCanvasElement>
 ) => {
   if (!dragRef.current.active) {
     return;
   }

   const point = getPointerPosition(event);

   if (!point) {
     return;
   }

   dragRef.current.currentX = point.x;
   dragRef.current.currentY = point.y;

   const dx =
     point.x - dragRef.current.startX;

   const dy =
     point.y - dragRef.current.startY;

   setPower(
     clamp(
       Math.hypot(dx, dy) / 190,
       0,
       1
     )
   );
 };

 const handlePointerUp = (
   event: React.PointerEvent<HTMLCanvasElement>
 ) => {
   if (!dragRef.current.active) {
     return;
   }

   const point = getPointerPosition(event);

   if (point) {
     dragRef.current.currentX = point.x;
     dragRef.current.currentY = point.y;
   }

   dragRef.current.active = false;

   if (
     event.currentTarget.hasPointerCapture(
       event.pointerId
     )
   ) {
     event.currentTarget.releasePointerCapture(
       event.pointerId
     );
   }

   const drag = dragRef.current;

   const dx =
     drag.currentX - drag.startX;

   const dy =
     drag.currentY - drag.startY;

   const dragDistance = Math.hypot(dx, dy);

   if (dy > -24 || dragDistance < 30) {
     setPower(0);
     return;
   }

   const normalizedPower = clamp(
     dragDistance / 190,
     0.2,
     1
   );

   const ball = ballRef.current;

   ball.vx = clamp(dx * 0.085, -11, 11);
   ball.vy = clamp(dy * 0.088, -20, -5);

   ball.verticalVelocity =
     8.5 + normalizedPower * 12;

   ball.flying = true;
   ball.sinking = false;
   ball.sinkProgress = 0;
   ball.resetting = false;
   ball.bounceCount = 0;

   setPower(0);
 };

 const handlePointerCancel = (
   event: React.PointerEvent<HTMLCanvasElement>
 ) => {
   dragRef.current.active = false;
   setPower(0);

   if (
     event.currentTarget.hasPointerCapture(
       event.pointerId
     )
   ) {
     event.currentTarget.releasePointerCapture(
       event.pointerId
     );
   }
 };

 const activeCupCount = cupsRef.current.filter(
   (cup) => cup.active
 ).length;

 const canRerack =
   reracksLeft > 0 &&
   activeCupCount < 10 &&
   activeCupCount > 1 &&
   !ballRef.current.flying &&
   !ballRef.current.resetting &&
   !gameOver;

 const twoPlayerShotsRemaining =
   TWO_PLAYER_SHOTS_PER_TURN - shotsThisTurn;

 return (
   <div className="absolute inset-0 overflow-hidden bg-black text-white select-none touch-none">
     <canvas
       ref={canvasRef}
       width={WIDTH}
       height={HEIGHT}
       onPointerDown={handlePointerDown}
       onPointerMove={handlePointerMove}
       onPointerUp={handlePointerUp}
       onPointerCancel={handlePointerCancel}
       className="absolute inset-0 block h-full w-full"
       style={{
         touchAction: "none",
       }}
     />

     <div className="pointer-events-none absolute inset-0 z-10 mx-auto flex h-full w-full max-w-md flex-col px-3 pb-3 pt-3">
       <div className="pointer-events-auto flex items-center justify-between">
         <div className="flex gap-2">
           {onClose && (
             <div className="flex w-9 justify-start">
               <button
                 type="button"
                 onClick={onClose}
                 aria-label="Back to Arcade Hub"
                 className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white backdrop-blur-lg"
               >
                 <svg
                   aria-hidden="true"
                   viewBox="0 0 24 24"
                   fill="none"
                   stroke="currentColor"
                   strokeWidth="2.2"
                   strokeLinecap="round"
                   strokeLinejoin="round"
                   className="h-4 w-4 shrink-0"
                 >
                   <path d="M19 12H5" />
                   <path d="m12 19-7-7 7-7" />
                 </svg>
               </button>
             </div>
           )}

           <button
             type="button"
             onClick={changeMode}
             className="rounded-full border border-white/20 bg-black/65 px-3 py-2 text-xs font-bold text-white backdrop-blur-lg"
           >
             Mode
           </button>
         </div>

         <div className="flex items-center gap-2">
           <button
             type="button"
             onClick={restartGame}
             className="rounded-full border border-white/20 bg-black/65 px-4 py-2 text-xs font-bold text-white backdrop-blur-lg"
           >
             Restart
           </button>

           <button
             type="button"
             onClick={() => setShowRules(true)}
             aria-label="How to play Cup Pong"
             className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_14px_rgba(204,255,0,0.12)] backdrop-blur-lg transition-colors hover:bg-[#ccff00]/20"
           >
             <span
               aria-hidden="true"
               className="flex h-5 w-5 items-center justify-center rounded-full border border-[#ccff00] text-xs font-black leading-none"
             >
               ?
             </span>
           </button>
         </div>
       </div>

       {gameMode === "single" ? (
         <div className="pointer-events-auto mt-2 rounded-2xl border border-white/15 bg-black/70 px-4 py-2.5 shadow-xl backdrop-blur-xl">
           <div className="grid grid-cols-3 items-center text-center">
             <div>
               <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55">
                 Cups
               </span>

               <span className="block text-xl font-black">
                 {score}/10
               </span>
             </div>

             <div>
               <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55">
                 Balls
               </span>

               <span className="block text-xl font-black text-emerald-400">
                 {ballsLeft}
               </span>
             </div>

             <button
               type="button"
               disabled={!canRerack}
               onClick={handleRerack}
               className={`rounded-xl px-3 py-2 text-[10px] font-bold ${
                 canRerack
                   ? "bg-red-500 text-white active:scale-95"
                   : "bg-white/10 text-white/30"
               }`}
             >
               Re-rack · {reracksLeft}
             </button>
           </div>
         </div>
       ) : (
         <div className="pointer-events-auto mt-2 rounded-2xl border border-white/15 bg-black/75 px-3 py-2.5 shadow-xl backdrop-blur-xl">
           <div className="grid grid-cols-4 items-center text-center">
             <div
               className={`rounded-xl py-1.5 ${
                 currentPlayer === 0
                   ? "bg-blue-500/25"
                   : ""
               }`}
             >
               <span className="block text-[8px] font-bold uppercase text-white/50">
                 Player 1
               </span>

               <span className="text-lg font-black text-blue-300">
                 {playerScores[0]}
               </span>
             </div>

             <div
               className={`rounded-xl py-1.5 ${
                 currentPlayer === 1
                   ? "bg-red-500/25"
                   : ""
               }`}
             >
               <span className="block text-[8px] font-bold uppercase text-white/50">
                 Player 2
               </span>

               <span className="text-lg font-black text-red-300">
                 {playerScores[1]}
               </span>
             </div>

             <div>
               <span className="block text-[8px] font-bold uppercase text-white/50">
                 Turn balls
               </span>

               <span className="text-lg font-black text-emerald-400">
                 {twoPlayerShotsRemaining}
               </span>
             </div>

             <button
               type="button"
               disabled={!canRerack}
               onClick={handleRerack}
               className={`rounded-xl px-2 py-2 text-[9px] font-bold ${
                 canRerack
                   ? "bg-amber-400 text-black"
                   : "bg-white/10 text-white/30"
               }`}
             >
               Re-rack · {reracksLeft}
             </button>
           </div>
         </div>
       )}

       {showBallsBack && (
         <div className="mx-auto mt-3 rounded-full bg-amber-400 px-4 py-2 text-xs font-black text-black shadow-lg">
           🔥 Balls back — two extra shots
         </div>
       )}

       {showTurnBanner && gameMode === "two" && (
         <div className="mx-auto mt-3 rounded-full bg-blue-500 px-5 py-2 text-xs font-black text-white shadow-lg">
           Player {currentPlayer + 1}&apos;s turn
         </div>
       )}

       <div className="mt-auto">
         <div className="rounded-2xl border border-white/15 bg-black/70 px-4 py-3 backdrop-blur-xl">
           <div className="mb-2 flex items-center justify-between">
             <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
               Shot power
             </span>

             <span className="text-xs font-bold text-white/80">
               {Math.round(power * 100)}%
             </span>
           </div>

           <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
             <div
               className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500"
               style={{
                 width: `${power * 100}%`,
               }}
             />
           </div>
         </div>

         <p className="pt-2 text-center text-xs font-semibold text-white/70">
           Drag upward and release to throw
         </p>
       </div>
     </div>

     {showModePicker && (
       <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-5 backdrop-blur-md">
         <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950 p-6 text-center shadow-2xl">
           <button
             type="button"
             onClick={() => setShowModePicker(false)}
             aria-label="Close mode selection"
             className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl font-black leading-none text-white transition-colors hover:bg-white/20"
           >
             ×
           </button>

           <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15">
             <div className="relative h-14 w-12">
               <div className="absolute left-1/2 top-1 h-4 w-12 -translate-x-1/2 rounded-[50%] bg-white" />

               <div className="absolute left-1/2 top-3 h-11 w-9 -translate-x-1/2 rounded-b-xl bg-gradient-to-r from-red-700 via-red-500 to-red-700" />

               <div
                 className={`absolute left-1/2 top-2 h-2.5 w-9 -translate-x-1/2 rounded-[50%] ${
                   liquidType === "beer"
                     ? "bg-amber-400"
                     : "bg-amber-950"
                 }`}
               />
             </div>
           </div>

           <h2 className="mt-3 text-3xl font-black">
             Cup Pong
           </h2>

           <p className="mt-2 text-sm text-white/55">
             Select your drink and game mode.
           </p>

           <div className="mt-5 grid grid-cols-2 gap-3">
             <button
               type="button"
               onClick={() => changeLiquid("beer")}
               className={`rounded-2xl border px-4 py-3 text-left transition ${
                 liquidType === "beer"
                   ? "border-amber-300 bg-amber-500/25"
                   : "border-white/10 bg-white/5"
               }`}
             >
               <span className="block font-black text-amber-300">
                 Beer
               </span>

               <span className="text-xs text-white/50">
                 Golden beer with foam
               </span>
             </button>

             <button
               type="button"
               onClick={() => changeLiquid("cola")}
               className={`rounded-2xl border px-4 py-3 text-left transition ${
                 liquidType === "cola"
                   ? "border-amber-500 bg-amber-950/50"
                   : "border-white/10 bg-white/5"
               }`}
             >
               <span className="block font-black text-amber-300">
                 Cola
               </span>

               <span className="text-xs text-white/50">
                 Dark fizzy liquid
               </span>
             </button>
           </div>

           <div className="mt-4 grid gap-3">
             <button
               type="button"
               onClick={() => startGame("single")}
               className="rounded-2xl bg-emerald-500 px-5 py-4 text-left text-white"
             >
               <span className="block text-lg font-black">
                 1 Player
               </span>

               <span className="text-xs text-white/75">
                 Clear all cups before the balls run out.
               </span>
             </button>

             <button
               type="button"
               onClick={() => startGame("two")}
               className="rounded-2xl bg-blue-500 px-5 py-4 text-left text-white"
             >
               <span className="block text-lg font-black">
                 2 Players
               </span>

               <span className="text-xs text-white/75">
                 Each player throws three balls per turn.
               </span>
             </button>
           </div>
         </div>
       </div>
     )}

     {showRules && (
       <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-5 backdrop-blur-md">
         <div
           role="dialog"
           aria-modal="true"
           aria-labelledby="cup-pong-how-to-play-title"
           className="max-h-[92%] w-full max-w-sm overflow-y-auto rounded-3xl border-2 border-[#ccff00]/70 bg-gradient-to-b from-slate-900 to-zinc-950 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.75)]"
         >
           <div className="mb-5 flex items-start justify-between gap-4">
             <div className="flex items-center gap-3">
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#ccff00] bg-[#ccff00]/10 text-2xl font-black text-[#ccff00] shadow-[0_0_18px_rgba(204,255,0,0.22)]">
                 ?
               </div>
               <div>
                 <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ccff00]">
                   Cup Pong
                 </p>
                 <h2
                   id="cup-pong-how-to-play-title"
                   className="text-2xl font-black text-white"
                 >
                   How to Play
                 </h2>
               </div>
             </div>

             <button
               type="button"
               onClick={() => setShowRules(false)}
               aria-label="Close how to play"
               className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-black text-slate-200 transition-colors hover:bg-slate-700"
             >
               ×
             </button>
           </div>

           <div className="space-y-3">
             {[
               ["👆", "Aim and throw", "Drag upward toward the cup you want, then release to throw the ball."],
               ["🥤", "Sink the ball", "Land the ball inside a cup to score and remove that cup from the table."],
               ["🎯", "Clear the rack", "In 1 Player mode, clear all 10 cups before you run out of balls."],
               ["🔥", "Earn balls back", "Sink both shots in a two-shot set to receive two bonus balls."],
               ["👥", "Play with a friend", "In 2 Players mode, each player throws 3 balls per turn. Most points wins."],
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
             onClick={() => setShowRules(false)}
             className="mt-5 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 py-3.5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg transition-all active:scale-[0.98]"
           >
             Got It — Let&apos;s Play
           </button>
         </div>
       </div>
     )}

     {gameOver && (
       <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-5 backdrop-blur-md">
         <div className="w-full max-w-sm rounded-3xl bg-zinc-950 p-7 text-center shadow-2xl">
           <div className="text-6xl">
             {won ? "🏆" : "🥤"}
           </div>

           <h2 className="mt-4 text-3xl font-black">
             {gameMode === "two"
               ? winnerText
               : won
                 ? "Table Cleared"
                 : "Out of Balls"}
           </h2>

           {gameMode === "two" ? (
             <div className="mt-4 grid grid-cols-2 gap-3">
               <div className="rounded-2xl bg-blue-500/15 p-3">
                 <span className="block text-xs text-white/50">
                   Player 1
                 </span>

                 <span className="text-2xl font-black text-blue-300">
                   {playerScores[0]}
                 </span>
               </div>

               <div className="rounded-2xl bg-red-500/15 p-3">
                 <span className="block text-xs text-white/50">
                   Player 2
                 </span>

                 <span className="text-2xl font-black text-red-300">
                   {playerScores[1]}
                 </span>
               </div>
             </div>
           ) : (
             <p className="mt-2 text-sm text-white/55">
               {winnerText}
             </p>
           )}

           <button
             type="button"
             onClick={restartGame}
             className="mt-6 w-full rounded-2xl bg-red-500 py-3 font-black text-white"
           >
             Play Again
           </button>

           <button
             type="button"
             onClick={changeMode}
             className="mt-3 w-full rounded-2xl bg-white/10 py-3 font-bold text-white"
           >
             Change Mode
           </button>
         </div>
       </div>
     )}
   </div>
 );
}
