"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  closestEllipseApproach,
  CUP_PONG_AIR_RETENTION,
  CUP_PONG_GRAVITY,
  CUP_PONG_MAX_PHYSICS_STEP,
  getCupContactSettlement,
  getOffTableFallVelocity,
  getCupPongLaunchVelocity,
  getPerspectiveTableBounds,
  getTableBounce,
  reflectVelocity,
  stepOffTableFlight,
  sweepPointIntoEllipse,
} from "@/lib/cupPongPhysics";

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
  homeX: number;
  homeY: number;
  velocityX: number;
  velocityY: number;
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
  falling: boolean;
  fallVelocityX: number;
  fallVelocityY: number;
  floorBounces: number;
  resetting: boolean;
  bounceCount: number;
  rotation: number;
  spinVelocity: number;
  rimCooldown: number;
  cupContactCount: number;
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
  cupId: number;
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
const BALL_START_Y = 650;

const CUP_CENTER_X = WIDTH / 2;
const CUP_START_Y = 158;

const CUP_HORIZONTAL_SPACING = 55;
const CUP_VERTICAL_SPACING = 48;

// Standard folding beer-pong table: 8 ft long × 2 ft wide, with 29 in used
// as the default leg height within the usual 27.5–30 in adjustable range.
const TABLE_TOP_Y = 118;
const TABLE_NEAR_Y = 730;
// Below the canvas: the reset logic retains its off-table landing state
// without drawing a made-up floor or underside in the tabletop-only view.
const FLOOR_Y = HEIGHT + 36;
const TABLE_FAR_LEFT = 78;
const TABLE_FAR_RIGHT = WIDTH - 78;
const TABLE_NEAR_LEFT = -24;
const TABLE_NEAR_RIGHT = WIDTH + 24;

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
  falling: false,
  fallVelocityX: 0,
  fallVelocityY: 0,
  floorBounces: 0,
  resetting: false,
  bounceCount: 0,
  rotation: 0,
  spinVelocity: 0,
  rimCooldown: 0,
  cupContactCount: 0,
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
      const x =
        rowStartX + column * CUP_HORIZONTAL_SPACING;
      const y = CUP_START_Y + row * CUP_VERTICAL_SPACING;

      cups.push({
        id,
        x,
        y,
        homeX: x,
        homeY: y,
        velocityX: 0,
        velocityY: 0,
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
  onClose,
  onResult,
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
  const [isShotActive, setIsShotActive] =
    useState(false);
  const [showRules, setShowRules] = useState(false);

  const [showBallsBack, setShowBallsBack] =
    useState(false);

  const [showTurnBanner, setShowTurnBanner] =
    useState(false);

  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const [winnerText, setWinnerText] =
    useState("");

  // Keep the new game engine connected to the arcade's match and rewards
  // system. The UI uses Player 1 as the local player in two-player mode.
  useEffect(() => {
    if (!gameOver || resultReportedRef.current) return;
    resultReportedRef.current = true;

    const result = gameMode === "two"
      ? winnerText === "The game is a draw!"
        ? "Draw"
        : winnerText === "Player 1 wins!"
          ? "Win"
          : "Loss"
      : won
        ? "Win"
        : "Loss";
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
    setIsShotActive(false);
  }, []);

  const createLiquidSplash = useCallback(
    (cup: Cup) => {
      cup.liquidWave = 20;
      cup.wobble = 12;

      const particleCount =
        liquidTypeRef.current === "cola" ? 34 : 30;

      for (let index = 0; index < particleCount; index += 1) {
        const angle = Math.random() * Math.PI * 2;

        const speed =
          1.3 + Math.random() * 4.1;

        splashParticlesRef.current.push({
          x: cup.x + (Math.random() - 0.5) * 12,
          y: cup.y - 0.5,
          vx:
            Math.cos(angle) * speed +
            (Math.random() - 0.5) * 1.2,
          vy: -4.1 - Math.random() * 5.8,
          gravity: 0.17 + Math.random() * 0.08,
          radius: 1.3 + Math.random() * 2.5,
          life: 1,
          maxLife: 1,
        });
      }

      // A few tall crown jets make the entry readable even at mobile scale.
      for (let jet = 0; jet < 6; jet += 1) {
        const horizontal = (jet - 2.5) * 0.72;
        splashParticlesRef.current.push({
          x: cup.x + horizontal * 2.2,
          y: cup.y,
          vx: horizontal,
          vy: -7.8 - (jet % 2) * 1.4,
          gravity: 0.2,
          radius: 2.1 + (jet % 2) * 0.6,
          life: 1.15,
          maxLife: 1.15,
        });
      }

      ripplesRef.current.push({
        cupId: cup.id,
        x: cup.x,
        y: cup.y + 1,
        radiusX: 3,
        radiusY: 1,
        life: 1,
        maxLife: 1,
      });

      addTimer(() => {
        ripplesRef.current.push({
          cupId: cup.id,
          x: cup.x,
          y: cup.y + 1,
          radiusX: 4,
          radiusY: 1.5,
          life: 1,
          maxLife: 1,
        });
      }, 90);

      addTimer(() => {
        ripplesRef.current.push({
          cupId: cup.id,
          x: cup.x,
          y: cup.y + 1,
          radiusX: 5,
          radiusY: 1.8,
          life: 0.86,
          maxLife: 0.86,
        });
      }, 175);
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
      setIsShotActive(false);

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
          cup.homeX =
            rowStartX +
            column * CUP_HORIZONTAL_SPACING;

          cup.homeY =
            CUP_START_Y +
            rowIndex * CUP_VERTICAL_SPACING;
          cup.x = cup.homeX;
          cup.y = cup.homeY;
          cup.velocityX = 0;
          cup.velocityY = 0;
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
    const partyCupImage = new Image();
    partyCupImage.src = "/cup-pong-party-cup.png";
    const colaCupImage = new Image();
    colaCupImage.src = "/cup-pong-cola-cup.png";
    const ballImage = new Image();
    ballImage.src = "/cup-pong-ball.png";

    const drawBackground = () => {
      const background = context.createLinearGradient(
        0,
        0,
        0,
        HEIGHT
      );

      background.addColorStop(0, "#152c3a");
      background.addColorStop(0.22, "#254b5d");
      background.addColorStop(0.225, "#213f4d");
      background.addColorStop(1, "#0f2632");

      context.fillStyle = background;
      context.fillRect(0, 0, WIDTH, HEIGHT);

      // A diffused ceiling fixture grounds the table in a real indoor room.
      const wallGlow = context.createRadialGradient(
        WIDTH / 2,
        64,
        10,
        WIDTH / 2,
        64,
        270
      );
      wallGlow.addColorStop(0, "rgba(210,241,250,0.28)");
      wallGlow.addColorStop(0.42, "rgba(143,205,220,0.07)");
      wallGlow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = wallGlow;
      context.fillRect(0, 0, WIDTH, 260);

      [62, 338].forEach((x) => {
        const y = 68;
        const glow = context.createRadialGradient(x, y, 1, x, y, 42);
        glow.addColorStop(0, "rgba(225,248,255,0.2)");
        glow.addColorStop(0.18, "rgba(190,229,238,0.07)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, 32, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "rgba(236,252,255,0.52)";
        context.beginPath();
        context.arc(x, y, 2.2, 0, Math.PI * 2);
        context.fill();
      });

      context.strokeStyle = "rgba(205,235,242,0.045)";
      context.lineWidth = 1;

      for (let y = 18; y < 174; y += 26) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(WIDTH, y);
        context.stroke();
      }

      // Wall baseboard and a subtly reflective concrete floor.
      context.fillStyle = "rgba(6,20,28,0.46)";
      context.fillRect(0, 174, WIDTH, 11);

      const floorLight = context.createRadialGradient(
        WIDTH / 2,
        370,
        12,
        WIDTH / 2,
        520,
        360
      );
      floorLight.addColorStop(0, "rgba(87,142,157,0.13)");
      floorLight.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = floorLight;
      context.fillRect(0, 180, WIDTH, HEIGHT - 180);

      context.strokeStyle = "rgba(178,216,225,0.035)";
      for (let y = 250; y < HEIGHT; y += 76) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(WIDTH, y);
        context.stroke();
      }
    };

    const drawTable = () => {
      const topY = TABLE_TOP_Y;
      const bottomY = TABLE_NEAR_Y;

      const farLeft = TABLE_FAR_LEFT;
      const farRight = TABLE_FAR_RIGHT;
      const nearLeft = TABLE_NEAR_LEFT;
      const nearRight = TABLE_NEAR_RIGHT;

      // Floor shadow and folding frame sit below the laminate top.
      context.save();
      context.filter = "blur(13px)";
      context.fillStyle = "rgba(0,6,10,0.44)";
      context.beginPath();
      context.ellipse(WIDTH / 2, 753, 190, 31, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.strokeStyle = "#182126";
      context.lineWidth = 8;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(54, bottomY + 9);
      context.lineTo(91, HEIGHT + 5);
      context.moveTo(WIDTH - 54, bottomY + 9);
      context.lineTo(WIDTH - 91, HEIGHT + 5);
      context.stroke();

      context.strokeStyle = "rgba(161,181,188,0.35)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(52, bottomY + 9);
      context.lineTo(89, HEIGHT + 5);
      context.moveTo(WIDTH - 52, bottomY + 9);
      context.lineTo(WIDTH - 89, HEIGHT + 5);
      context.stroke();

      const apronGradient = context.createLinearGradient(0, bottomY, 0, bottomY + 22);
      apronGradient.addColorStop(0, "#5c6970");
      apronGradient.addColorStop(0.18, "#29363d");
      apronGradient.addColorStop(1, "#111a1f");
      context.fillStyle = apronGradient;
      context.beginPath();
      context.moveTo(nearLeft, bottomY);
      context.lineTo(nearRight, bottomY);
      context.lineTo(nearRight - 8, bottomY + 21);
      context.lineTo(nearLeft + 8, bottomY + 21);
      context.closePath();
      context.fill();

      context.save();
      context.shadowColor = "rgba(0,8,14,0.5)";
      context.shadowBlur = 18;
      context.shadowOffsetY = 8;
      const tableGradient = context.createLinearGradient(0, topY, 0, bottomY);
      tableGradient.addColorStop(0, "#164f62");
      tableGradient.addColorStop(0.2, "#0c647c");
      tableGradient.addColorStop(0.62, "#07546c");
      tableGradient.addColorStop(1, "#06394c");
      context.fillStyle = tableGradient;
      context.beginPath();
      context.moveTo(farLeft, topY);
      context.lineTo(farRight, topY);
      context.lineTo(nearRight, bottomY);
      context.lineTo(nearLeft, bottomY);
      context.closePath();
      context.fill();
      context.restore();

      // Long perspective grain follows the laminate instead of reading as
      // horizontal waves painted over a flat rectangle.

      // Target end marking: a quiet visual anchor behind the rack that makes
      // it immediately clear which end of the tabletop the player is aiming
      // toward.
      context.strokeStyle = "rgba(214,243,247,0.12)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(farLeft + 12, topY + 46);
      context.lineTo(farRight - 12, topY + 46);
      context.stroke();

      // Four equal 2-foot sections reflect the folding construction of a
      // regulation 8 × 2 ft table and reinforce its long, narrow shape.
      [0.5].forEach((depth) => {
        const seamY = topY + (bottomY - topY) * depth;
        const seamLeft =
          farLeft + (nearLeft - farLeft) * depth;
        const seamRight =
          farRight + (nearRight - farRight) * depth;

        context.strokeStyle = "rgba(3,23,31,0.52)";
        context.lineWidth = 2.2;
        context.beginPath();
        context.moveTo(seamLeft, seamY);
        context.lineTo(seamRight, seamY);
        context.stroke();

        context.strokeStyle = "rgba(215,244,248,0.13)";
        context.lineWidth = 0.9;
        context.beginPath();
        context.moveTo(seamLeft, seamY + 2);
        context.lineTo(seamRight, seamY + 2);
        context.stroke();
      });

      context.save();
      context.beginPath();
      context.moveTo(farLeft, topY);
      context.lineTo(farRight, topY);
      context.lineTo(nearRight, bottomY);
      context.lineTo(nearLeft, bottomY);
      context.closePath();
      context.clip();

      for (let x = -10; x <= WIDTH + 10; x += 15) {
        context.strokeStyle = "rgba(205,244,250,0.025)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(WIDTH / 2 + (x - WIDTH / 2) * 0.52, topY);
        context.lineTo(x, bottomY);
        context.stroke();
      }

      const tableLight = context.createLinearGradient(0, 0, WIDTH, 0);
      tableLight.addColorStop(0, "rgba(0,0,0,0.14)");
      tableLight.addColorStop(0.28, "rgba(130,216,231,0.08)");
      tableLight.addColorStop(0.5, "rgba(196,239,246,0.12)");
      tableLight.addColorStop(0.72, "rgba(86,180,200,0.05)");
      tableLight.addColorStop(1, "rgba(0,0,0,0.18)");
      context.fillStyle = tableLight;
      context.fillRect(nearLeft, topY, nearRight - nearLeft, bottomY - topY);

      context.restore();

      // Brushed aluminium rails are polygons, so their visible thickness
      // grows naturally toward the camera.
      const railGradient = context.createLinearGradient(0, topY, 0, bottomY);
      railGradient.addColorStop(0, "#d4dde0");
      railGradient.addColorStop(0.38, "#89999f");
      railGradient.addColorStop(0.68, "#f0f4f4");
      railGradient.addColorStop(1, "#71838a");
      context.fillStyle = railGradient;

      context.beginPath();
      context.moveTo(farLeft - 3, topY - 2);
      context.lineTo(farLeft + 4, topY + 2);
      context.lineTo(nearLeft + 7, bottomY + 2);
      context.lineTo(nearLeft - 5, bottomY + 7);
      context.closePath();
      context.fill();

      context.beginPath();
      context.moveTo(farRight + 3, topY - 2);
      context.lineTo(farRight - 4, topY + 2);
      context.lineTo(nearRight - 7, bottomY + 2);
      context.lineTo(nearRight + 5, bottomY + 7);
      context.closePath();
      context.fill();

      const farRail = context.createLinearGradient(0, topY - 5, 0, topY + 7);
      farRail.addColorStop(0, "#f6f9f9");
      farRail.addColorStop(0.42, "#aebbc0");
      farRail.addColorStop(1, "#586970");
      context.fillStyle = farRail;
      context.beginPath();
      context.moveTo(farLeft - 3, topY - 4);
      context.lineTo(farRight + 3, topY - 4);
      context.lineTo(farRight - 3, topY + 5);
      context.lineTo(farLeft + 3, topY + 5);
      context.closePath();
      context.fill();

      const nearRail = context.createLinearGradient(0, bottomY - 4, 0, bottomY + 10);
      nearRail.addColorStop(0, "#f7faf9");
      nearRail.addColorStop(0.32, "#a9b8bd");
      nearRail.addColorStop(1, "#53656c");
      context.fillStyle = nearRail;
      context.beginPath();
      context.moveTo(nearLeft - 5, bottomY - 3);
      context.lineTo(nearRight + 5, bottomY - 3);
      context.lineTo(nearRight - 3, bottomY + 9);
      context.lineTo(nearLeft + 3, bottomY + 9);
      context.closePath();
      context.fill();
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
        topRadiusX: 31 * perspective,
        topRadiusY: 10 * perspective,
        bottomRadius: 16.5 * perspective,
        cupHeight: 57 * perspective,
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
       * Project each shadow away from the overhead light at the far-center
       * of the room. The old fixed right offset made every cup appear lit
       * from a different direction and produced a flat horizontal smudge.
       */
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;

      const lightX = WIDTH / 2;
      const lightY = 64;
      const cupBaseY = cup.y + cupHeight;
      const lightToCupX = cup.x - lightX;
      const lightToCupY = cupBaseY - lightY;
      const lightDistance = Math.max(1, Math.hypot(lightToCupX, lightToCupY));
      const shadowDirectionX = lightToCupX / lightDistance;
      const shadowDirectionY = lightToCupY / lightDistance;
      const castLength = cupHeight * (0.38 + perspective * 0.08);
      const castRadiusX = castLength * 0.72;
      const castRadiusY = bottomRadius * 0.38;
      const castCenterX = cup.x + shadowDirectionX * castRadiusX * 0.72;
      const castCenterY = cupBaseY + shadowDirectionY * castRadiusX * 0.72;
      const castAngle = Math.atan2(shadowDirectionY, shadowDirectionX);

      context.save();
      context.translate(castCenterX, castCenterY);
      context.rotate(castAngle);
      const castShadow = context.createLinearGradient(
        -castRadiusX,
        0,
        castRadiusX,
        0
      );
      castShadow.addColorStop(0, "rgba(1,25,35,0.38)");
      castShadow.addColorStop(0.24, "rgba(1,28,39,0.31)");
      castShadow.addColorStop(0.72, "rgba(1,31,43,0.12)");
      castShadow.addColorStop(1, "rgba(1,34,46,0)");
      context.fillStyle = castShadow;
      context.beginPath();
      context.ellipse(
        0,
        0,
        castRadiusX,
        castRadiusY,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();

      // A compact ambient-occlusion shadow anchors the plastic base while
      // remaining independent of the longer directional cast shadow.
      const contactShadow = context.createRadialGradient(
        cup.x,
        cupBaseY + 0.8,
        0,
        cup.x,
        cupBaseY + 0.8,
        bottomRadius * 1.18
      );
      contactShadow.addColorStop(0, "rgba(0,20,28,0.56)");
      contactShadow.addColorStop(0.64, "rgba(0,28,38,0.36)");
      contactShadow.addColorStop(1, "rgba(0,34,45,0)");
      context.fillStyle = contactShadow;
      context.beginPath();
      context.ellipse(
        cup.x + shadowDirectionX * 0.7,
        cupBaseY + 0.8,
        bottomRadius * 1.18,
        Math.max(1.2, topRadiusY * 0.24),
        0,
        0,
        Math.PI * 2
      );
      context.fill();

      const cupImage = liquidTypeRef.current === "cola"
        ? colaCupImage
        : partyCupImage;

      if (cupImage.complete && cupImage.naturalWidth > 0) {
        // The source has transparent padding. Crop tightly around the real
        // photographed cup and align its opening with the collision ellipse.
        const imageHeight = cupHeight / 0.79;
        const imageWidth = topRadiusX * 2.1;
        const imageY = cup.y - imageHeight * 0.21;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(
          cupImage,
          204,
          108,
          622,
          824,
          cup.x - imageWidth / 2,
          imageY,
          imageWidth,
          imageHeight
        );

        const waveAmount = cup.liquidWave > 0
          ? Math.sin(cup.liquidWave * 0.9) * cup.liquidWave * 0.025
          : 0;
        const liquidRadiusX = topRadiusX * 0.72;
        const liquidRadiusY = topRadiusY * (0.47 + waveAmount * 0.035);

        context.strokeStyle = liquidTypeRef.current === "beer"
          ? "rgba(255,240,186,0.34)"
          : "rgba(218,134,84,0.18)";
        context.lineWidth = 0.8;
        context.beginPath();
        context.ellipse(
          cup.x - liquidRadiusX * 0.08,
          cup.y + 0.4,
          liquidRadiusX * 0.5,
          Math.max(0.8, liquidRadiusY * 0.25),
          waveAmount,
          Math.PI * 1.12,
          Math.PI * 1.7
        );
        context.stroke();

        const splashEnergy = clamp(cup.liquidWave / 20, 0, 1);
        if (splashEnergy > 0) {
          context.strokeStyle = liquidTypeRef.current === "beer"
            ? `rgba(255,224,132,${0.8 * splashEnergy})`
            : `rgba(187,89,42,${0.72 * splashEnergy})`;
          context.lineWidth = 1 + splashEnergy;
          for (let peak = 0; peak < 5; peak += 1) {
            const offset = (peak - 2) * liquidRadiusX * 0.2;
            const height = (3 + (peak % 2) * 3) * splashEnergy;
            context.beginPath();
            context.moveTo(cup.x + offset - 2, cup.y + 1.4);
            context.quadraticCurveTo(
              cup.x + offset,
              cup.y - height,
              cup.x + offset + 2,
              cup.y + 1.4
            );
            context.stroke();
          }
        }

        // Re-emphasise the photographed rolled lip at small game scales.
        context.strokeStyle = "rgba(255,250,245,0.68)";
        context.lineWidth = Math.max(0.8, perspective * 1.15);
        context.beginPath();
        context.ellipse(
          cup.x,
          cup.y,
          topRadiusX * 0.98,
          topRadiusY * 0.94,
          0,
          Math.PI * 1.03,
          Math.PI * 1.97
        );
        context.stroke();

        context.restore();
        return;
      }

      const bodyGradient =
        context.createLinearGradient(
          cup.x - topRadiusX,
          cup.y,
          cup.x + topRadiusX,
          cup.y
        );

      bodyGradient.addColorStop(0, "#7f111a");
      bodyGradient.addColorStop(0.12, "#b51d29");
      bodyGradient.addColorStop(0.34, "#dc3140");
      bodyGradient.addColorStop(0.52, "#cf2837");
      bodyGradient.addColorStop(0.72, "#b91d2b");
      bodyGradient.addColorStop(0.9, "#86101a");
      bodyGradient.addColorStop(1, "#5f0a12");

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
      bodyDepthGradient.addColorStop(0, "rgba(255,255,255,0.05)");
      bodyDepthGradient.addColorStop(0.35, "rgba(255,255,255,0)");
      bodyDepthGradient.addColorStop(0.78, "rgba(130,0,16,0.08)");
      bodyDepthGradient.addColorStop(1, "rgba(116,0,14,0.24)");
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
      baseGradient.addColorStop(0, "#711019");
      baseGradient.addColorStop(0.42, "#c92332");
      baseGradient.addColorStop(0.72, "#a71524");
      baseGradient.addColorStop(1, "#5c0911");
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

      /* Molded reinforcement rings found on a real red party cup. */
      [0.18, 0.28, 0.68, 0.83].forEach((ratio) => {
        const bandY = cup.y + cupHeight * ratio;
        const bandHalfWidth = topRadiusX - (topRadiusX - bottomRadius) * ratio;

        context.strokeStyle = "rgba(78,0,10,0.3)";
        context.lineWidth = Math.max(0.8, 1.15 * perspective);
        context.beginPath();
        context.moveTo(cup.x - bandHalfWidth, bandY);
        context.quadraticCurveTo(cup.x, bandY + 2, cup.x + bandHalfWidth, bandY);
        context.stroke();

        context.strokeStyle = "rgba(255,183,188,0.18)";
        context.lineWidth = Math.max(0.45, 0.6 * perspective);
        context.beginPath();
        context.moveTo(cup.x - bandHalfWidth, bandY - 1.5);
        context.quadraticCurveTo(cup.x, bandY + 0.5, cup.x + bandHalfWidth, bandY - 1.5);
        context.stroke();
      });

      /* Broad plastic facets catch light differently across the cup body. */
      context.fillStyle = "rgba(255,133,143,0.1)";
      context.beginPath();
      context.moveTo(cup.x - topRadiusX * 0.48, cup.y + 5);
      context.lineTo(cup.x - bottomRadius * 0.34, cup.y + cupHeight - 5);
      context.lineTo(cup.x - bottomRadius * 0.05, cup.y + cupHeight - 5);
      context.lineTo(cup.x - topRadiusX * 0.14, cup.y + 5);
      context.closePath();
      context.fill();

      context.fillStyle = "rgba(70,0,8,0.12)";
      context.beginPath();
      context.moveTo(cup.x + topRadiusX * 0.66, cup.y + 4);
      context.lineTo(cup.x + bottomRadius * 0.58, cup.y + cupHeight - 4);
      context.lineTo(cup.x + bottomRadius * 0.84, cup.y + cupHeight - 5);
      context.lineTo(cup.x + topRadiusX * 0.92, cup.y + 4);
      context.closePath();
      context.fill();

      /* Narrow glossy reflection, tapering toward the base. */
      const shineGradient = context.createLinearGradient(
        cup.x + topRadiusX * 0.12,
        cup.y,
        cup.x + topRadiusX * 0.72,
        cup.y
      );
      shineGradient.addColorStop(0, "rgba(255,255,255,0.02)");
      shineGradient.addColorStop(0.5, "rgba(255,235,238,0.16)");
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
      context.strokeStyle = "rgba(170,20,32,0.72)";
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
      rimGradient.addColorStop(0.45, "#f4eff1");
      rimGradient.addColorStop(1, "#cfc7cd");
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
      innerWallGradient.addColorStop(0, "#fffefe");
      innerWallGradient.addColorStop(0.52, "#eee7ea");
      innerWallGradient.addColorStop(1, "#cfc2c8");
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
        topRadiusY * (0.43 + waveAmount * 0.035);

      // Resting liquid should be a thin, matte plane. Gradients and bubbles
      // add fake depth, which is what made the surface read as jelly.
      context.fillStyle =
        liquidTypeRef.current === "beer"
          ? "#e3a12b"
          : "#2b0b04";

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

      // A short, low-contrast reflection gives the flat surface a little
      // light without turning it into a glossy dome.
      context.strokeStyle =
        liquidTypeRef.current === "beer"
          ? "rgba(255,241,181,0.28)"
          : "rgba(220,125,72,0.1)";

      context.lineWidth = 0.85;

      context.beginPath();
      context.ellipse(
        cup.x - liquidRadiusX * 0.12,
        cup.y + 0.5,
        liquidRadiusX * 0.48,
        liquidRadiusY * 0.28,
        waveAmount,
        Math.PI * 1.16,
        Math.PI * 1.55
      );
      context.stroke();

      // A scored shot briefly turns the otherwise still surface into a
      // crown-shaped impact. The rim is redrawn below, so this stays tucked
      // inside the cup instead of looking like an effect floating on top.
      const splashEnergy = clamp(cup.liquidWave / 20, 0, 1);
      if (splashEnergy > 0) {
        const splashColor =
          liquidTypeRef.current === "beer"
            ? "rgba(255,229,143,"
            : "rgba(232,137,73,";

        context.save();
        context.beginPath();
        context.ellipse(
          cup.x,
          cup.y + 1.4,
          liquidRadiusX * 0.98,
          Math.max(2, liquidRadiusY * 1.25),
          0,
          0,
          Math.PI * 2
        );
        context.clip();

        context.strokeStyle = `${splashColor}${0.44 * splashEnergy})`;
        context.lineWidth = 1.35 + splashEnergy * 0.8;
        for (let ring = 0; ring < 3; ring += 1) {
          const progress = ring / 3;
          context.beginPath();
          context.ellipse(
            cup.x,
            cup.y + 1.4,
            liquidRadiusX * (0.2 + progress * 0.54),
            Math.max(1, liquidRadiusY * (0.2 + progress * 0.54)),
            waveAmount,
            0,
            Math.PI * 2
          );
          context.stroke();
        }
        context.restore();

        context.strokeStyle = `${splashColor}${0.82 * splashEnergy})`;
        context.lineWidth = 1.15 + splashEnergy * 0.9;
        for (let peak = 0; peak < 5; peak += 1) {
          const offset = (peak - 2) * liquidRadiusX * 0.2;
          const height = (3 + (peak % 2) * 3) * splashEnergy;
          context.beginPath();
          context.moveTo(cup.x + offset - 3, cup.y + 1.5);
          context.quadraticCurveTo(
            cup.x + offset,
            cup.y - height,
            cup.x + offset + 3,
            cup.y + 1.5
          );
          context.stroke();
        }
      }

      // The front half of the rolled rim sits above the liquid. Drawing it
      // last gives the opening thickness and lets a sinking ball disappear
      // convincingly into the cup.
      context.strokeStyle = "rgba(255,250,239,0.9)";
      context.lineWidth = Math.max(1.5, 2.3 * perspective);
      context.beginPath();
      context.ellipse(
        cup.x,
        cup.y,
        topRadiusX * 0.98,
        topRadiusY * 0.95,
        0,
        0.04,
        Math.PI - 0.04
      );
      context.stroke();

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

    const drawFrontRimsOverBall = () => {
      const ball = ballRef.current;

      if (ball.sinking || ball.height > 26) {
        return;
      }

      const ballRadius = getBallRenderRadius(ball);
      const renderY = ball.y - ball.height;

      cupsRef.current.forEach((cup) => {
        if (!cup.active) {
          return;
        }

        const { perspective, topRadiusX, topRadiusY } =
          getCupMeasurements(cup);
        const overlapsRim =
          Math.abs(ball.x - cup.x) <= topRadiusX + ballRadius * 0.6 &&
          renderY >= cup.y - topRadiusY - ballRadius * 0.2 &&
          renderY <= cup.y + topRadiusY + ballRadius * 0.35;

        if (!overlapsRim) {
          return;
        }

        // The front lip must sit over a low ball at the opening. Without
        // this final pass, the ball is always painted on top of the cup and
        // appears to float across the rim.
        context.save();
        context.strokeStyle = "rgba(255,250,239,0.94)";
        context.lineWidth = Math.max(1.5, 2.3 * perspective);
        context.beginPath();
        context.ellipse(
          cup.x,
          cup.y,
          topRadiusX * 0.98,
          topRadiusY * 0.95,
          0,
          0.04,
          Math.PI - 0.04
        );
        context.stroke();
        context.restore();
      });
    };

    const shouldDrawBallBehindCups = () => {
      const ball = ballRef.current;

      if (ball.sinking) {
        return true;
      }

      if (ball.falling) {
        return true;
      }

      if (!ball.flying || ball.height > 34) {
        return false;
      }

      const ballRadius = getBallRenderRadius(ball);
      const renderY = ball.y - ball.height;

      return cupsRef.current.some((cup) => {
        if (!cup.active) {
          return false;
        }

        const { topRadiusX, topRadiusY } =
          getCupMeasurements(cup);
        const deltaX = ball.x - cup.x;
        const deltaY = renderY - cup.y;
        const occlusionRadiusX = topRadiusX + ballRadius * 0.48;
        const occlusionRadiusY = topRadiusY + ballRadius * 0.32;

        return (
          (deltaX * deltaX) /
            (occlusionRadiusX * occlusionRadiusX) +
            (deltaY * deltaY) /
              (occlusionRadiusY * occlusionRadiusY) <=
          1
        );
      });
    };

    const drawRipples = () => {
      ripplesRef.current.forEach((ripple) => {
        const alpha = clamp(ripple.life, 0, 1);
        const cup = cupsRef.current.find(
          (candidate) => candidate.id === ripple.cupId
        );

        if (!cup || !cup.active) {
          return;
        }

        const { topRadiusX, topRadiusY } = getCupMeasurements(cup);

        context.save();
        context.beginPath();
        context.ellipse(
          cup.x,
          cup.y + 1.4,
          topRadiusX * 0.82,
          topRadiusY * 0.54,
          0,
          0,
          Math.PI * 2
        );
        context.clip();
        context.strokeStyle =
          liquidTypeRef.current === "beer"
            ? `rgba(255,229,143,${alpha * 0.78})`
            : `rgba(255,194,120,${alpha * 0.55})`;

        context.lineWidth = 1.2 + alpha * 0.8;

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
        context.restore();
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
            context.fillStyle = `rgba(244,181,48,${
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

      if (
        (ball.sinking && ball.sinkProgress >= 1) ||
        (ball.resetting && !ball.sinking)
      ) {
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

      if (!ball.sinking && !ball.falling) {
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

      const visibleRadius = ball.sinking
        ? radius * (0.82 - ball.sinkProgress * 0.42)
        : radius;

      context.save();
      context.beginPath();
      context.arc(
        ball.x,
        renderY,
        visibleRadius,
        0,
        Math.PI * 2
      );
      context.clip();
      if (ballImage.complete && ballImage.naturalWidth > 0) {
        context.drawImage(
          ballImage,
          ball.x - visibleRadius,
          renderY - visibleRadius,
          visibleRadius * 2,
          visibleRadius * 2
        );
      } else {
        context.fillStyle = "#f6f7f7";
        context.fillRect(
          ball.x - visibleRadius,
          renderY - visibleRadius,
          visibleRadius * 2,
          visibleRadius * 2
        );
      }

      if (ball.sinking) {
        context.fillStyle = liquidTypeRef.current === "beer"
          ? `rgba(190,112,14,${ball.sinkProgress * 0.42})`
          : `rgba(70,30,16,${ball.sinkProgress * 0.42})`;
        context.fillRect(
          ball.x - visibleRadius,
          renderY - visibleRadius,
          visibleRadius * 2,
          visibleRadius * 2
        );
      }
      context.restore();

      context.strokeStyle =
        "rgba(15,23,42,0.22)";
      context.lineWidth = Math.max(0.65, visibleRadius * 0.055);
      context.beginPath();
      context.arc(ball.x, renderY, visibleRadius, 0, Math.PI * 2);
      context.stroke();

      context.restore();
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

    const isOverTable = (x: number, y: number) => {
      const bounds = getPerspectiveTableBounds(
        y,
        TABLE_TOP_Y,
        TABLE_NEAR_Y,
        TABLE_FAR_LEFT,
        TABLE_FAR_RIGHT,
        TABLE_NEAR_LEFT,
        TABLE_NEAR_RIGHT
      );

      return Boolean(bounds && x >= bounds.left && x <= bounds.right);
    };

    const dropToFloor = () => {
      const ball = ballRef.current;
      const renderY = ball.y - Math.max(0, ball.height);
      const fallVelocity = getOffTableFallVelocity(
        ball.vx,
        ball.vy,
        ball.verticalVelocity
      );

      // Preserve the exact visual position and velocity at the table edge.
      // Snapping to a rail and substituting a generic downward velocity made
      // cup rebounds visibly turn back toward the table.
      ball.falling = true;
      ball.y = renderY;
      ball.fallVelocityX = fallVelocity.x;
      ball.fallVelocityY = fallVelocity.y;
      ball.floorBounces = 0;
      ball.height = 0;
      ball.verticalVelocity = 0;
      ball.spinVelocity *= 0.65;
    };

    const updateLiquidEffects = (delta: number) => {
      cupsRef.current.forEach((cup) => {
        // A light spring keeps a struck cup seated in its rack while letting
        // it visibly jostle and settle after a rim hit or splash.
        cup.velocityX +=
          (cup.homeX - cup.x) * 0.075 * delta;
        cup.velocityY +=
          (cup.homeY - cup.y) * 0.075 * delta;
        cup.velocityX *= Math.pow(0.82, delta);
        cup.velocityY *= Math.pow(0.82, delta);
        cup.x += cup.velocityX * delta;
        cup.y += cup.velocityY * delta;

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

      // Cups are allowed to jostle after a hit, but they still need a solid
      // edge when they meet. Resolve overlap first, then share a small,
      // damped impulse so they bounce apart instead of clipping or sticking.
      const activeCups = cupsRef.current.filter(
        (cup) => cup.active
      );

      for (let firstIndex = 0; firstIndex < activeCups.length; firstIndex += 1) {
        const firstCup = activeCups[firstIndex];
        const firstMeasurements = getCupMeasurements(firstCup);

        for (
          let secondIndex = firstIndex + 1;
          secondIndex < activeCups.length;
          secondIndex += 1
        ) {
          const secondCup = activeCups[secondIndex];
          const secondMeasurements = getCupMeasurements(secondCup);
          let offsetX = secondCup.x - firstCup.x;
          let offsetY = secondCup.y - firstCup.y;
          let distance = Math.hypot(offsetX, offsetY);
          const minimumDistance =
            (firstMeasurements.topRadiusX +
              secondMeasurements.topRadiusX) *
            0.9;

          if (distance >= minimumDistance) {
            continue;
          }

          if (distance < 0.001) {
            offsetX = secondCup.homeX - firstCup.homeX || 1;
            offsetY = secondCup.homeY - firstCup.homeY;
            distance = Math.hypot(offsetX, offsetY);
          }

          const normalX = offsetX / distance;
          const normalY = offsetY / distance;
          const overlap = minimumDistance - distance;

          firstCup.x -= normalX * overlap * 0.5;
          firstCup.y -= normalY * overlap * 0.5;
          secondCup.x += normalX * overlap * 0.5;
          secondCup.y += normalY * overlap * 0.5;

          const relativeVelocity =
            (secondCup.velocityX - firstCup.velocityX) * normalX +
            (secondCup.velocityY - firstCup.velocityY) * normalY;

          if (relativeVelocity < 0) {
            const impulse = -relativeVelocity * 0.56;

            firstCup.velocityX -= normalX * impulse;
            firstCup.velocityY -= normalY * impulse;
            secondCup.velocityX += normalX * impulse;
            secondCup.velocityY += normalY * impulse;
            firstCup.wobble = Math.max(firstCup.wobble, 5);
            secondCup.wobble = Math.max(secondCup.wobble, 5);
            firstCup.liquidWave = Math.max(firstCup.liquidWave, 5);
            secondCup.liquidWave = Math.max(secondCup.liquidWave, 5);
          }
        }
      }

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

      if (ball.falling) {
        const flight = stepOffTableFlight(
          ball.x,
          ball.y,
          ball.fallVelocityX,
          ball.fallVelocityY,
          delta
        );
        ball.x = flight.x;
        ball.y = flight.y;
        ball.fallVelocityX = flight.vx;
        ball.fallVelocityY = flight.vy;
        ball.rotation += ball.spinVelocity * delta;
        ball.spinVelocity *= Math.pow(0.97, delta);

        const radius = getBallRenderRadius(ball);
        const movingPastLeft =
          ball.x < -radius * 2 && ball.fallVelocityX <= 0;
        const movingPastRight =
          ball.x > WIDTH + radius * 2 && ball.fallVelocityX >= 0;
        const movingPastBottom =
          ball.y > HEIGHT + radius * 2 && ball.fallVelocityY >= 0;

        if (movingPastLeft || movingPastRight || movingPastBottom) {
          completeMiss();
          return;
        }

        if (ball.y >= FLOOR_Y && ball.fallVelocityY > 0) {
          ball.y = FLOOR_Y;
          ball.fallVelocityY *= -0.46;
          ball.fallVelocityX *= 0.72;
          ball.floorBounces += 1;

          if (ball.floorBounces >= 3) completeMiss();
        }
        return;
      }

      if (ball.sinking) {
        ball.sinkProgress = Math.min(1, ball.sinkProgress + 0.075 * delta);
        ball.height = Math.max(0, 2 * (1 - ball.sinkProgress));
        return;
      }

      if (!ball.flying || ball.resetting || gameOverRef.current) return;

      const sinkBall = (cup: Cup) => {
        cup.velocityX += ball.vx * 0.035;
        cup.velocityY += ball.vy * 0.022;
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
          if (!gameOverRef.current) resetBall();
        }, 460);
      };

      const settleRepeatedCupContacts = (
        contactX: number,
        contactRenderY: number,
        contactHeight: number,
        escapeVelocityX: number
      ) => {
        const ballRadius = getBallRenderRadius(ball);
        let nearestCup: Cup | null = null;
        let nearestOpeningDistance = Number.POSITIVE_INFINITY;

        for (const cup of cupsRef.current) {
          if (!cup.active) continue;
          const { topRadiusX, topRadiusY } = getCupMeasurements(cup);
          const radiusX = Math.max(4, topRadiusX - ballRadius * 0.72);
          const radiusY = Math.max(2.8, topRadiusY * 0.62);
          const normalizedDistance = Math.hypot(
            (contactX - cup.x) / radiusX,
            (contactRenderY - cup.y) / radiusY
          );

          if (normalizedDistance < nearestOpeningDistance) {
            nearestOpeningDistance = normalizedDistance;
            nearestCup = cup;
          }
        }

        // A ball rattling above an opening loses its remaining energy into
        // that cup. A ball pinched between solid rims is released downward
        // with cup collisions briefly suppressed so gravity can reach table.
        const settlement = getCupContactSettlement(
          ball.cupContactCount,
          nearestOpeningDistance
        );
        if (settlement === "continue") return false;

        if (settlement === "cup" && nearestCup) {
          sinkBall(nearestCup);
          return true;
        }

        const escapeDirection = Math.sign(
          escapeVelocityX || contactX - CUP_CENTER_X || 1
        );
        ball.x = contactX + escapeDirection * 1.5;
        ball.height = Math.max(0, contactHeight);
        ball.y = contactRenderY + ball.height + 1.2;
        ball.vx = escapeDirection *
          clamp(0.65 + Math.abs(escapeVelocityX) * 0.18, 0.65, 2.2);
        ball.vy = 0.35;
        ball.verticalVelocity = -2.2;
        ball.spinVelocity *= 0.35;
        ball.rimCooldown = 18;
        ball.cupContactCount = 0;
        return true;
      };

      const stepFlyingBall = (step: number) => {
        const previousX = ball.x;
        const previousY = ball.y;
        const previousHeight = ball.height;
        const previousRenderY = previousY - previousHeight;

        ball.x += ball.vx * step;
        ball.y += ball.vy * step;
        ball.height += ball.verticalVelocity * step;
        ball.verticalVelocity -= CUP_PONG_GRAVITY * step;
        ball.rotation += ball.spinVelocity * step;

        const airRetention = Math.pow(CUP_PONG_AIR_RETENTION, step);
        ball.vx *= airRetention;
        ball.vy *= airRetention;
        ball.spinVelocity *= Math.pow(0.995, step);
        ball.rimCooldown = Math.max(0, ball.rimCooldown - step);

        const renderY = ball.y - ball.height;
        const isDescending = ball.verticalVelocity < 0;

        for (const cup of cupsRef.current) {
          if (!cup.active) continue;

          const { topRadiusX, topRadiusY, cupHeight } = getCupMeasurements(cup);
          const ballRadius = getBallRenderRadius(ball);
          const pathStart = { x: previousX, y: previousRenderY };
          const pathEnd = { x: ball.x, y: renderY };
          const opening = {
            centerX: cup.x,
            centerY: cup.y,
            radiusX: Math.max(4, topRadiusX - ballRadius * 0.72),
            radiusY: Math.max(2.8, topRadiusY * 0.62),
          };
          const openingApproach = closestEllipseApproach(
            pathStart,
            pathEnd,
            opening
          );
          const heightAtOpening = previousHeight +
            (ball.height - previousHeight) * openingApproach.t;

          // A valid cup entry crosses the clear inner opening while falling.
          // Rising shots hit the underside/body instead of scoring early.
          if (
            isDescending &&
            heightAtOpening >= 0 &&
            openingApproach.normalizedDistance <= 1
          ) {
            sinkBall(cup);
            return;
          }

          if (
            ball.rimCooldown <= 0 &&
            (isDescending || ball.height <= cupHeight + ballRadius)
          ) {
            const rimHit = sweepPointIntoEllipse(pathStart, pathEnd, {
              centerX: cup.x,
              centerY: cup.y,
              radiusX: topRadiusX + ballRadius * 0.65,
              radiusY: topRadiusY + ballRadius * 0.38,
            });

            if (rimHit) {
              const incomingX = ball.vx;
              const incomingY = ball.vy;
              const renderVelocityY = ball.vy - ball.verticalVelocity;
              const reflected = reflectVelocity(
                ball.vx,
                renderVelocityY,
                rimHit.normalX,
                rimHit.normalY,
                0.58,
                0.82,
                ball.spinVelocity * 2.2
              );

              if (reflected.normalSpeed < 0) {
                const contactHeight = Math.max(
                  0,
                  previousHeight + (ball.height - previousHeight) * rimHit.t
                );
                ball.cupContactCount += 1;

                if (
                  settleRepeatedCupContacts(
                    rimHit.x,
                    rimHit.y,
                    contactHeight,
                    reflected.vx
                  )
                ) {
                  return;
                }

                const upwardKick = Math.max(
                  0.72,
                  Math.abs(ball.verticalVelocity) * 0.28
                );

                ball.height = contactHeight;
                ball.x = rimHit.x + rimHit.normalX * 1.8;
                ball.y = rimHit.y + contactHeight + rimHit.normalY * 1.8;
                ball.vx = clamp(reflected.vx, -10, 10);
                ball.verticalVelocity = upwardKick;
                ball.vy = clamp(reflected.vy + upwardKick, -14, 14);
                ball.spinVelocity = clamp(
                  ball.spinVelocity * -0.38 - reflected.tangentSpeed * 0.018,
                  -0.22,
                  0.22
                );
                ball.rimCooldown = 3;
                ball.bounceCount += 1;
                cup.velocityX += incomingX * 0.055;
                cup.velocityY += incomingY * 0.035;
                cup.wobble = 9;
                cup.liquidWave = 10;
                ripplesRef.current.push({
                  cupId: cup.id,
                  x: cup.x,
                  y: cup.y + 1,
                  radiusX: 3,
                  radiusY: 1,
                  life: 0.8,
                  maxLife: 0.8,
                });
                return;
              }
            }
          }

          // Low shots also collide with the cup body. This is deliberately
          // separate from the rim so a front-wall hit cannot ghost through.
          if (ball.rimCooldown <= 0 && ball.height <= cupHeight + ballRadius) {
            const bodyHit = sweepPointIntoEllipse(pathStart, pathEnd, {
              centerX: cup.x,
              centerY: cup.y + cupHeight * 0.5,
              radiusX: topRadiusX + ballRadius * 0.55,
              radiusY: cupHeight * 0.5 + ballRadius * 0.45,
            });

            if (bodyHit && bodyHit.y > cup.y + topRadiusY * 0.45) {
              const incomingX = ball.vx;
              const incomingY = ball.vy;
              const renderVelocityY = ball.vy - ball.verticalVelocity;
              const reflected = reflectVelocity(
                ball.vx,
                renderVelocityY,
                bodyHit.normalX,
                bodyHit.normalY,
                0.42,
                0.72
              );

              if (reflected.normalSpeed < 0) {
                const contactHeight = Math.max(
                  0,
                  previousHeight + (ball.height - previousHeight) * bodyHit.t
                );
                ball.cupContactCount += 1;

                if (
                  settleRepeatedCupContacts(
                    bodyHit.x,
                    bodyHit.y,
                    contactHeight,
                    reflected.vx
                  )
                ) {
                  return;
                }

                const retainedVerticalVelocity = ball.verticalVelocity * 0.72;

                ball.height = contactHeight;
                ball.x = bodyHit.x + bodyHit.normalX * 2;
                ball.y = bodyHit.y + contactHeight + bodyHit.normalY * 2;
                ball.vx = clamp(reflected.vx, -9, 9);
                ball.verticalVelocity = retainedVerticalVelocity;
                ball.vy = clamp(
                  reflected.vy + retainedVerticalVelocity,
                  -13,
                  13
                );
                ball.spinVelocity *= 0.62;
                ball.rimCooldown = 3;
                ball.bounceCount += 1;
                cup.velocityX += incomingX * 0.08;
                cup.velocityY += incomingY * 0.05;
                cup.wobble = Math.max(cup.wobble, 8);
                cup.liquidWave = Math.max(cup.liquidWave, 7);
                return;
              }
            }
          }
        }

        if (ball.height <= 0 && ball.verticalVelocity < 0) {
          const heightTravel = previousHeight - ball.height;
          const impactProgress = heightTravel > 0
            ? clamp(previousHeight / heightTravel, 0, 1)
            : 1;
          ball.x = previousX + (ball.x - previousX) * impactProgress;
          ball.y = previousY + (ball.y - previousY) * impactProgress;
          ball.height = 0;

          if (!isOverTable(ball.x, ball.y)) {
            if (ball.y >= TABLE_TOP_Y + 18) dropToFloor();
            else completeMiss();
            return;
          }

          const bounce = getTableBounce(
            ball.verticalVelocity,
            ball.vx,
            ball.vy,
            ball.spinVelocity
          );
          ball.verticalVelocity = bounce.verticalVelocity;
          ball.vx = bounce.vx;
          ball.vy = bounce.vy;
          ball.spinVelocity = bounce.spinVelocity;
          ball.bounceCount += 1;
          ball.cupContactCount = 0;

          if (
            (ball.verticalVelocity < 0.85 && Math.hypot(ball.vx, ball.vy) < 0.55) ||
            ball.bounceCount >= 5
          ) {
            completeMiss();
          }
          return;
        }

        if (ball.height <= 10 && !isOverTable(ball.x, ball.y)) {
          if (ball.y >= TABLE_TOP_Y + 18) dropToFloor();
          else completeMiss();
          return;
        }

        if (
          ball.x < -80 ||
          ball.x > WIDTH + 80 ||
          ball.y < -120 ||
          ball.y > HEIGHT + 120 ||
          ball.height < -100
        ) {
          completeMiss();
        }
      };

      let remaining = delta;
      while (
        remaining > 0 &&
        ball.flying &&
        !ball.sinking &&
        !ball.falling &&
        !ball.resetting
      ) {
        const step = Math.min(CUP_PONG_MAX_PHYSICS_STEP, remaining);
        stepFlyingBall(step);
        remaining -= step;
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

      // Defensive frame reset: transient cup wobble and clipped ball details
      // must never leak a transform or paint state into the next frame.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      context.filter = "none";
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      context.lineCap = "butt";
      context.lineJoin = "miter";

      drawBackground();
      drawTable();
      const ballBehindCups = shouldDrawBallBehindCups();
      if (ballBehindCups) {
        drawBall();
      }
      drawCups();
      drawRipples();
      if (!ballBehindCups) {
        drawBall();
        drawFrontRimsOverBall();
      }
      drawSplashParticles();

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

    const ball = ballRef.current;
    const launch = getCupPongLaunchVelocity(dx, dy);

    ball.vx = launch.vx;
    ball.vy = launch.vy;
    ball.verticalVelocity = launch.verticalVelocity;
    ball.spinVelocity = launch.spinVelocity;
    ball.rotation = 0;

    ball.flying = true;
    ball.sinking = false;
    ball.sinkProgress = 0;
    ball.resetting = false;
    ball.bounceCount = 0;
    ball.rimCooldown = 0;
    ball.cupContactCount = 0;

    setPower(0);
    setIsShotActive(true);
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

  const activeCupCount = STARTING_BALLS - score;

  const canRerack =
    reracksLeft > 0 &&
    activeCupCount < 10 &&
    activeCupCount > 1 &&
    !isShotActive &&
    !gameOver;

  const twoPlayerShotsRemaining =
    TWO_PLAYER_SHOTS_PER_TURN - shotsThisTurn;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0f2632] text-white select-none touch-none">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="absolute left-1/2 top-1/2 block h-full w-auto max-w-full -translate-x-1/2 -translate-y-1/2"
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
                className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-100/20 bg-black/45 text-amber-50 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-lg transition-colors hover:bg-white/10"
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
              className="rounded-full border border-amber-100/20 bg-black/45 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-50 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-lg transition-colors hover:bg-white/10"
            >
              Mode
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restartGame}
              className="rounded-full border border-amber-100/20 bg-black/45 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-amber-50 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-lg transition-colors hover:bg-white/10"
            >
              Restart
            </button>

            <button
              type="button"
              onClick={() => setShowRules(true)}
              aria-label="How to play Cup Pong"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/45 bg-amber-100/10 text-amber-100 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-lg transition-colors hover:bg-amber-100/20"
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-amber-100 text-xs font-black leading-none"
              >
                ?
              </span>
            </button>
          </div>
        </div>

        {gameMode === "single" ? (
          <div className="pointer-events-auto mt-2 rounded-2xl border border-amber-100/15 bg-black/55 px-4 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="grid grid-cols-3 items-center text-center">
              <div>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55">
                  Cups
                </span>

                <span className="block text-xl font-black tabular-nums text-amber-50">
                  {score}/10
                </span>
              </div>

              <div>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55">
                  Balls
                </span>

                <span className="block text-xl font-black tabular-nums text-amber-300">
                  {ballsLeft}
                </span>
              </div>

              <button
                type="button"
                disabled={!canRerack}
                onClick={handleRerack}
                className={`rounded-xl px-3 py-2 text-[10px] font-bold ${
                  canRerack
                    ? "bg-gradient-to-b from-red-500 to-red-700 text-white shadow-[0_5px_12px_rgba(127,29,29,0.36)] active:scale-95"
                    : "bg-white/10 text-white/30"
                }`}
              >
                Re-rack · {reracksLeft}
              </button>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto mt-2 rounded-2xl border border-amber-100/15 bg-black/55 px-3 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="grid grid-cols-4 items-center text-center">
              <div
                className={`rounded-xl py-1.5 ${
                  currentPlayer === 0
                    ? "bg-sky-400/15 ring-1 ring-sky-200/25"
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
                    ? "bg-red-400/15 ring-1 ring-red-200/25"
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
                    ? "bg-gradient-to-b from-amber-300 to-amber-500 text-stone-950 shadow-[0_5px_12px_rgba(180,83,9,0.25)]"
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
          <div className="rounded-2xl border border-amber-100/15 bg-black/55 px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                Shot power
              </span>

              <span className="text-xs font-bold text-white/80">
                {Math.round(power * 100)}%
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-white/10 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-200 via-amber-400 to-red-500 shadow-[0_0_10px_rgba(251,191,36,0.65)]"
                style={{
                  width: `${power * 100}%`,
                }}
              />
            </div>
          </div>

          <p className="pt-2 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-amber-50/65">
            Pull back · aim · release
          </p>
        </div>
      </div>

      {showModePicker && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-[#1c94be]/55 p-5 backdrop-blur-md">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-b from-[#70d3ee] via-[#55c2e2] to-[#3aaed5] p-6 text-center shadow-[0_28px_70px_rgba(9,83,117,0.42)]">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
            <button
              type="button"
              onClick={() => setShowModePicker(false)}
              aria-label="Close mode selection"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/25 text-xl font-black leading-none text-white transition-colors hover:bg-white/40"
            >
              ×
            </button>

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/65 bg-white/20 shadow-[0_0_32px_rgba(255,255,255,0.2)]">
              <div
                role="img"
                aria-label={`${liquidType === "beer" ? "Beer" : "Cola"} party cup`}
                className="h-[68px] w-[68px] bg-contain bg-center bg-no-repeat drop-shadow-[0_8px_7px_rgba(14,71,94,0.28)]"
                style={{
                  backgroundImage: `url(${
                    liquidType === "beer"
                      ? "/cup-pong-party-cup.png"
                      : "/cup-pong-cola-cup.png"
                  })`,
                }}
              />
            </div>

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-white/75">
              Ready to Play
            </p>

            <h2 className="mt-1 text-3xl font-black tracking-tight text-white">
              Cup Pong
            </h2>

            <p className="mt-2 text-sm text-white/75">
              Choose a drink, then pick your table.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => changeLiquid("beer")}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  liquidType === "beer"
                    ? "border-white bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                    : "border-white/35 bg-white/10 hover:bg-white/20"
                }`}
              >
                <span className="block font-black text-white">
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
                    ? "border-white bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                    : "border-white/35 bg-white/10 hover:bg-white/20"
                }`}
              >
                <span className="block font-black text-white">
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
                className="rounded-2xl border border-red-200/70 bg-gradient-to-b from-[#fa5360] to-[#db2737] px-5 py-4 text-left text-white shadow-[0_10px_24px_rgba(174,30,47,0.3)] transition-transform active:scale-[0.98]"
              >
                <span className="block text-lg font-black">
                  1 Player
                </span>

                <span className="text-xs text-white/80">
                  Clear all cups before the balls run out.
                </span>
              </button>

              <button
                type="button"
                onClick={() => startGame("two")}
                className="rounded-2xl border border-white/60 bg-gradient-to-b from-[#218dbb] to-[#1475a1] px-5 py-4 text-left text-white shadow-[0_10px_24px_rgba(13,101,140,0.3)] transition-transform active:scale-[0.98]"
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
