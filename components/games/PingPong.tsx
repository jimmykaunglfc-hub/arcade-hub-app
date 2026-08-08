"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TableTennisGame,
  type TableTennisBestOf,
  type TableTennisPlayerId,
  type TableTennisState,
} from "@/lib/TableTennisGame";
import {
  applySideSpin,
  calculateCircularSwipeTwist,
  calculateRacketTilt,
  calculateSwipeShotPower,
  calculateSwipeSpin,
  calculateSwipeSteering,
  calculateTwistSpin,
  createPhysicsRally,
  dampRacketTilt,
  predictBallAtZPlane,
  predictBallAtZPlaneAfterTableBounce,
  predictTableLanding,
  registerPaddleReturn,
  resolveTableBounce,
  solveRallyLandingVelocity,
  solveServeLandingVelocity,
  sweepSphereAgainstPaddle,
  sweepSphereAgainstNet,
  type PhysicsRallyState,
  type SwipeGestureSample,
} from "@/lib/pingPongPhysics";
import {
  getEquippedPingPongRacketSkin,
  type PingPongRacketSkin,
} from "@/lib/pingPongCosmetics";
import { supabase } from "@/lib/supabaseClient";
import MatchmakingModal from "../MatchmakingModal";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * A player shape that accepts both the camelCase fields used by this component
 * and the snake_case profile fields returned by the existing Supabase tables.
 */
export interface PingPongPlayer {
  id: string;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
}

export interface PingPongProps {
  matchId?: string | null;
  /** Seat one owns the realtime physics simulation for online matches. */
  seat?: 1 | 2;
  currentUserId?: string | null;
  players?: PingPongPlayer[];
  wager?: number;
  /** Official match length. The default is best-of-five games. */
  bestOf?: TableTennisBestOf;
  onClose?: () => void;
  /**
   * Compatibility props used by the existing GamePlayer native-game router.
   * Explicit matchId/currentUserId/players values still take precedence.
   */
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
  /**
   * Enables the real-player matchmaking overlay. It is opt-in so regular
   * gameplay always opens immediately without a blocking search screen.
   */
  enableOnlineMatchmaking?: boolean;
  /**
   * Optional match payload for the local player's equipped racket. When it is
   * omitted the game reads the currently equipped Ping Pong racket from the
   * Store Management inventory automatically.
   */
  localRacketSkin?: PingPongRacketSkin | null;
  /** Send the remote player's equipped skin in the multiplayer match payload. */
  opponentRacketSkin?: PingPongRacketSkin | null;
  onResult?: (result: "Win" | "Loss" | "Draw") => void;
}

interface PingPongMatchedOpponent {
  name: string;
  isBot: boolean;
  avatarIcon?: string;
  elo?: number;
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface BallState extends Vector3 {
  vx: number;
  vy: number;
  vz: number;
  /** Signed side-spin; positive values curve toward world-space right. */
  spin: number;
  active: boolean;
  /** Prevents either paddle from touching a ball caught by the net. */
  netStopped: boolean;
  servePhase: "waiting" | "toss" | "flight" | null;
  /** Latched horizontal aim while an official serve toss is in the air. */
  serveAimX: number;
  /** Circular spin and vertical power captured before the serve toss. */
  serveTwistSpin: number;
  servePower: number;
  serveVertical: number;
  /** Non-zero after the point is final while the ball finishes moving. */
  deadAt: number;
}

interface PaddleState extends Vector3 {
  vx: number;
  vy: number;
  vz: number;
  /** Screen-facing racket roll in radians. */
  tilt: number;
  /** Recent horizontal swing intent, normalized to -1…1. */
  swingX: number;
}

interface PaddleTarget extends Vector3 {
  tilt: number;
  swingX: number;
}

interface SwingIntent {
  horizontal: number;
  vertical: number;
  twist: number;
  intensity: number;
  expiresAt: number;
}

interface AssistWindow {
  expiresAt: number;
  landingX: number;
}

interface PaddlePositions {
  local: PaddleState;
  opponent: PaddleState;
}

interface ScoreState {
  local: number;
  opponent: number;
}

interface BallHitPayload {
  position: Vector3;
  velocity: Vector3;
  hitterId: string;
  timestamp: number;
}

/** Compact host-authoritative state sent at 20 Hz; rendering remains at 60 fps. */
interface NetworkMatchSnapshot {
  sequence: number;
  ball: BallState;
  paddles: PaddlePositions;
  matchState: TableTennisState;
  status: string;
  winner: Side | null;
}

interface TrailPoint extends Vector3 {
  createdAt: number;
}

type Side = "local" | "opponent";
type RacketDirection = "left" | "center" | "right";

const mirrorVector = (vector: Vector3): Vector3 => ({
  x: -vector.x,
  y: vector.y,
  z: -vector.z,
});

const mirrorPaddle = (paddle: PaddleState): PaddleState => ({
  ...paddle,
  ...mirrorVector(paddle),
  vx: -paddle.vx,
  vy: paddle.vy,
  vz: -paddle.vz,
  tilt: -paddle.tilt,
  swingX: -paddle.swingX,
});

const mirrorBall = (ball: BallState): BallState => ({
  ...ball,
  ...mirrorVector(ball),
  vx: -ball.vx,
  vy: ball.vy,
  vz: -ball.vz,
  spin: -ball.spin,
  serveAimX: -ball.serveAimX,
});

const mirrorMatchState = (state: TableTennisState): TableTennisState => ({
  ...state,
  player1Score: state.player2Score,
  player2Score: state.player1Score,
  player1GamesWon: state.player2GamesWon,
  player2GamesWon: state.player1GamesWon,
  currentServer: state.currentServer === "player1" ? "player2" : "player1",
  gameStartingServer:
    state.gameStartingServer === "player1" ? "player2" : "player1",
  player1Side: state.player2Side,
  player2Side: state.player1Side,
  gameWinner:
    state.gameWinner === null
      ? null
      : state.gameWinner === "player1"
      ? "player2"
      : "player1",
  matchWinner:
    state.matchWinner === null
      ? null
      : state.matchWinner === "player1"
      ? "player2"
      : "player1",
  lastPointWinner:
    state.lastPointWinner === null
      ? null
      : state.lastPointWinner === "player1"
      ? "player2"
      : "player1",
});

interface RacketAssetLayout {
  crop: [x: number, y: number, width: number, height: number];
  /** Face-center anchor within the cropped visible racket. */
  anchor: [x: number, y: number];
  /** Normalizes the visible racket-face diameter across differently cropped PNGs. */
  renderScale: number;
}

interface RacketAssetSet {
  center: HTMLImageElement;
  left: HTMLImageElement;
  right: HTMLImageElement;
  /** Dynamic store skins use a generic, direction-safe crop. */
  isDynamicSkin: boolean;
}
type RacketSpriteSet = Record<RacketDirection, HTMLCanvasElement>;

const RACKET_SPRITE_SIZE = 512;
const RACKET_SPRITE_VISIBLE_HEIGHT = 260;

const RACKET_ASSET_LAYOUTS: Record<
  Side,
  Record<RacketDirection, RacketAssetLayout>
> = {
  local: {
    center: {
      crop: [521, 355, 421, 701],
      anchor: [0.5, 0.314],
      renderScale: 1.38,
    },
    left: {
      crop: [298, 275, 616, 528],
      anchor: [0.375, 0.426],
      renderScale: 1,
    },
    right: {
      crop: [264, 275, 615, 529],
      anchor: [0.624, 0.425],
      renderScale: 1,
    },
  },
  opponent: {
    center: {
      crop: [311, 196, 388, 648],
      anchor: [0.499, 0.326],
      renderScale: 1.35,
    },
    left: {
      crop: [428, 456, 564, 506],
      anchor: [0.367, 0.402],
      renderScale: 1,
    },
    right: {
      crop: [449, 456, 564, 506],
      anchor: [0.631, 0.402],
      renderScale: 1,
    },
  },
};

/** Hysteresis prevents noisy pointer samples from flipping sprites each frame. */
const resolveRacketDirection = (
  current: RacketDirection,
  swingX: number
): RacketDirection => {
  if (current === "center") {
    return swingX < -0.28 ? "left" : swingX > 0.28 ? "right" : "center";
  }
  if (current === "left") {
    if (swingX > 0.28) return "right";
    return swingX > -0.1 ? "center" : "left";
  }
  if (swingX < -0.28) return "left";
  return swingX < 0.1 ? "center" : "right";
};

const REACTIONS = [
  { emoji: "🔥", label: "Fire" },
  { emoji: "😄", label: "Nice shot" },
  { emoji: "😎", label: "Cool" },
  { emoji: "✌️", label: "Peace" },
  { emoji: "😜", label: "Playful" },
] as const;

/** Physics world uses a 2× scale of regulation table-tennis dimensions. */
const WORLD_SCALE = 2;
const TABLE_HALF_WIDTH = 0.7625 * WORLD_SCALE;
const TABLE_HALF_LENGTH = 1.37 * WORLD_SCALE;
const TABLE_HEIGHT = 0;
const NET_HEIGHT = 0.1525 * WORLD_SCALE;
const NET_Z = 0;
const NET_VISUAL_Z = NET_Z;
const BALL_RADIUS = 0.02 * WORLD_SCALE;
const GRAVITY = -5.8;
const TABLE_RESTITUTION = 0.82;
const DEAD_BALL_RESTITUTION = 0.68;
const POINT_SETTLE_DELAY_MS = 2400;
const GAME_SETTLE_DELAY_MS = 2850;
const DEAD_BALL_MAX_LIFETIME_MS = 3200;
const NETWORK_INPUT_INTERVAL_MS = 33;
const NETWORK_SNAPSHOT_INTERVAL_MS = 50;
const CAMERA_DEPTH_CURVE = 1.35;
const NET_TAPE_THICKNESS = 0.035;
/**
 * One camera model drives the table, ball and paddles. These values place the
 * far edge just below the arena boards and expose a little more tabletop than
 * the previous low angle, while keeping the near contact zone reachable on a
 * portrait phone.
 */
const CAMERA_FAR_BASELINE = 0.39;
const CAMERA_NEAR_BASELINE = 0.675;
const LOCAL_PADDLE_START: PaddleState = {
  x: 0,
  y: 0.46,
  z: 2.3,
  vx: 0,
  vy: 0,
  vz: 0,
  tilt: 0,
  swingX: 0,
};

const OPPONENT_PADDLE_START: PaddleState = {
  x: 0,
  y: 0.58,
  z: -2.3,
  vx: 0,
  vy: 0,
  vz: 0,
  tilt: 0,
  swingX: 0,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const createOpponentServeAim = () => {
  const magnitude = 0.35 + Math.random() * 0.6;
  return (Math.random() < 0.5 ? -1 : 1) * magnitude;
};

const createOpponentReturnAim = () =>
  clamp((Math.random() * 2 - 1) * 1.08, -1.08, 1.08);

/**
 * Pre-renders the large source PNGs into small normalized, fully opaque
 * sprites. Runtime cross-fading previously made the racket blink or appear
 * transparent during rapid direction changes.
 */
const createRacketSpriteSet = (
  side: Side,
  assets: RacketAssetSet
): RacketSpriteSet => {
  const renderSprite = (direction: RacketDirection) => {
    const canvas = document.createElement("canvas");
    canvas.width = RACKET_SPRITE_SIZE;
    canvas.height = RACKET_SPRITE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return canvas;

    const asset = assets[direction];
    if (assets.isDynamicSkin) {
      const angle =
        direction === "left" ? -0.48 : direction === "right" ? 0.48 : 0;
      const sourceRatio = asset.naturalWidth / Math.max(asset.naturalHeight, 1);
      const renderedHeight = RACKET_SPRITE_VISIBLE_HEIGHT * 1.5;
      const renderedWidth = renderedHeight * sourceRatio;
      // Store skins normally contain a transparent, upright racket. The head
      // is anchored to the physics contact point while rotation only changes
      // its presentation; no collision values are affected.
      context.save();
      context.translate(RACKET_SPRITE_SIZE / 2, RACKET_SPRITE_SIZE / 2);
      context.rotate(angle);
      context.drawImage(
        asset,
        -renderedWidth / 2,
        -renderedHeight * 0.42,
        renderedWidth,
        renderedHeight
      );
      context.restore();
      return canvas;
    }
    const layout = RACKET_ASSET_LAYOUTS[side][direction];
    const [sourceX, sourceY, sourceWidth, sourceHeight] = layout.crop;
    const renderedHeight = RACKET_SPRITE_VISIBLE_HEIGHT * layout.renderScale;
    const renderedWidth = renderedHeight * (sourceWidth / sourceHeight);
    const [anchorX, anchorY] = layout.anchor;
    context.globalAlpha = 1;
    context.drawImage(
      asset,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      RACKET_SPRITE_SIZE / 2 - renderedWidth * anchorX,
      RACKET_SPRITE_SIZE / 2 - renderedHeight * anchorY,
      renderedWidth,
      renderedHeight
    );
    return canvas;
  };

  return {
    center: renderSprite("center"),
    left: renderSprite("left"),
    right: renderSprite("right"),
  };
};

const oppositeSide = (side: Side): Side =>
  side === "local" ? "opponent" : "local";

const getPlayerName = (player: PingPongPlayer | undefined, fallback: string) =>
  player?.username?.trim() || player?.name?.trim() || fallback;

const getAvatarUrl = (player: PingPongPlayer | undefined) =>
  player?.avatarUrl || player?.avatar_url || null;

const createServe = (server: Side, isDoubles = false): BallState => ({
  x: isDoubles ? (server === "local" ? 0.62 : -0.62) : 0,
  y: server === "local" ? 0.48 : 0.42,
  z: server === "local" ? 2.24 : -2.24,
  vx: 0,
  vy: server === "local" ? 0 : 1.9,
  vz: 0,
  spin: 0,
  active: true,
  netStopped: false,
  servePhase: server === "local" ? "waiting" : "toss",
  serveAimX: 0,
  serveTwistSpin: 0,
  servePower: 0,
  serveVertical: 0,
  deadAt: 0,
});

const toPlayerId = (side: Side): TableTennisPlayerId =>
  side === "local" ? "player1" : "player2";

const toSide = (playerId: TableTennisPlayerId): Side =>
  playerId === "player1" ? "local" : "opponent";

function Avatar({
  player,
  fallback,
  accent,
}: {
  player: PingPongPlayer | undefined;
  fallback: string;
  accent: string;
}) {
  const name = getPlayerName(player, fallback);
  const avatarUrl = getAvatarUrl(player);

  return (
    <div
      aria-label={`${name} avatar`}
      className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-zinc-900 bg-cover bg-center text-xs font-black text-white shadow-lg sm:size-12 sm:text-sm"
      style={{
        backgroundImage: avatarUrl ? `url("${avatarUrl}")` : undefined,
        borderColor: accent,
        boxShadow: `0 0 22px ${accent}55`,
      }}
    >
      {!avatarUrl && name.slice(0, 2).toUpperCase()}
    </div>
  );
}

/**
 * Dependency-free perspective table tennis. The game uses a fixed-step-ish
 * canvas simulation so it remains light enough for Capacitor builds.
 */
export default function PingPong(props: PingPongProps) {
  const {
    onClose,
    onResult,
    preloadedMatchId,
    opponent,
    players: providedPlayers,
  } = props;
  const onlineMatchmakingEnabled = props.enableOnlineMatchmaking ?? false;
  const startsWithConfirmedMatch = Boolean(
    props.matchId ?? preloadedMatchId ?? opponent ?? providedPlayers?.length
  );
  const [showMatchmaker, setShowMatchmaker] = useState(
    onlineMatchmakingEnabled && !startsWithConfirmedMatch
  );
  const [isMatchReady, setIsMatchReady] = useState(
    startsWithConfirmedMatch || !onlineMatchmakingEnabled
  );
  const [matchedSession, setMatchedSession] = useState<{
    matchId: string;
    opponent: PingPongMatchedOpponent;
  } | null>(null);
  const activeOpponent = matchedSession?.opponent ?? opponent;
  const matchId =
    matchedSession?.matchId ??
    props.matchId ??
    preloadedMatchId ??
    "local-ping-pong";
  const currentUserId =
    props.currentUserId ?? providedPlayers?.[0]?.id ?? "local-player";
  const localSeat = props.seat ?? 1;
  const players = useMemo<PingPongPlayer[]>(() => {
    if (providedPlayers?.length) return providedPlayers;
    return [
      { id: currentUserId, username: "You" },
      {
        id: "ping-pong-opponent",
        username: activeOpponent?.name || "Arena Opponent",
      },
    ];
  }, [activeOpponent?.name, currentUserId, providedPlayers]);
  const isDoubles = players.length >= 4;
  const bestOf = props.bestOf ?? 5;
  const gameEngine = useMemo(() => new TableTennisGame({ bestOf }), [bestOf]);
  const initialMatchState = useMemo(() => gameEngine.getState(), [gameEngine]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardLogoRef = useRef<HTMLImageElement | null>(null);
  const localRacketAssetsRef = useRef<RacketAssetSet | null>(null);
  const opponentRacketAssetsRef = useRef<RacketAssetSet | null>(null);
  const racketSpritesRef = useRef<Record<Side, RacketSpriteSet> | null>(null);
  const opponentServeAimRef = useRef(createOpponentServeAim());
  const opponentReturnAimRef = useRef(createOpponentReturnAim());
  const draggingRef = useRef(false);
  const roundLockedRef = useRef(false);
  const serveTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const lastStatePublishRef = useRef(0);
  const lastPaddleBroadcastRef = useRef(0);
  const reactionTimerRef = useRef<number | null>(null);
  const opponentNetworkActiveUntilRef = useRef(0);
  const networkOpponentTargetRef = useRef<PaddleState | null>(null);
  const lastTrailStampRef = useRef({ local: 0, opponent: 0 });
  const gameWinnerRef = useRef<Side | null>(null);
  const pointerSampleRef = useRef<SwipeGestureSample | null>(null);
  const gesturePathRef = useRef<SwipeGestureSample[]>([]);
  const swingIntentRef = useRef<SwingIntent>({
    horizontal: 0,
    vertical: 0,
    twist: 0,
    intensity: 0,
    expiresAt: 0,
  });
  const opponentSpinReadErrorRef = useRef(0);
  const lastPlayerSwipeAtRef = useRef(0);
  const lastOpponentSwipeAtRef = useRef(0);
  const networkChannelRef = useRef<RealtimeChannel | null>(null);
  const networkSequenceRef = useRef(0);
  const lastNetworkSnapshotRef = useRef(0);
  const lastReceivedSnapshotRef = useRef(-1);
  const networkReplicaTargetRef = useRef<{
    ball: BallState;
    opponent: PaddleState;
  } | null>(null);
  const matchReadyRef = useRef(
    startsWithConfirmedMatch || !onlineMatchmakingEnabled
  );
  const stalledBallSinceRef = useRef(0);
  const assistWindowsRef = useRef<Record<Side, AssistWindow | null>>({
    local: null,
    opponent: null,
  });
  const racketDirectionRef = useRef<Record<Side, RacketDirection>>({
    local: "center",
    opponent: "center",
  });
  const localPaddleTargetRef = useRef<PaddleTarget>({
    x: LOCAL_PADDLE_START.x,
    y: LOCAL_PADDLE_START.y,
    z: LOCAL_PADDLE_START.z,
    tilt: LOCAL_PADDLE_START.tilt,
    swingX: LOCAL_PADDLE_START.swingX,
  });

  const localPlayer = useMemo(
    () => players.find((player) => player.id === currentUserId) ?? players[0],
    [currentUserId, players]
  );
  const opponentPlayer = useMemo(
    () => players.find((player) => player.id !== localPlayer?.id) ?? players[1],
    [localPlayer?.id, players]
  );

  const initialServer = toSide(initialMatchState.currentServer);
  const initialBall = useMemo(
    () => createServe(initialServer, isDoubles),
    [initialServer, isDoubles]
  );
  const [matchState, setMatchState] = useState(initialMatchState);
  const score: ScoreState = {
    local: matchState.player1Score,
    opponent: matchState.player2Score,
  };
  const [ballPosition, setBallPosition] = useState<BallState>(initialBall);
  const [paddlePositions, setPaddlePositions] = useState<PaddlePositions>({
    local: LOCAL_PADDLE_START,
    opponent: OPPONENT_PADDLE_START,
  });
  const [status, setStatus] = useState(
    initialServer === "local"
      ? "Your serve — swipe left or right"
      : "Opponent serve — get ready"
  );
  const [gameWinner, setGameWinner] = useState<Side | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [activeReaction, setActiveReaction] = useState<{
    emoji: string;
    id: number;
  } | null>(null);
  const [storedRacketSkin, setStoredRacketSkin] =
    useState<PingPongRacketSkin | null>(null);
  const activeLocalRacketSkin = props.localRacketSkin ?? storedRacketSkin;
  const isNetworkMatch = Boolean(matchId && matchId !== "local-ping-pong" && !matchId.startsWith("bot_") && !activeOpponent?.isBot);
  // Player one is the sole simulation authority. Player two receives compact
  // snapshots and only transmits input, avoiding competing physics clocks.
  const isSimulationAuthority = !isNetworkMatch || localSeat === 1;
  const isNetworkReplica = isNetworkMatch && !isSimulationAuthority;

  useEffect(() => {
    if (!gameWinner) return;
    onResult?.(gameWinner === "local" ? "Win" : "Loss");
  }, [gameWinner, onResult]);

  const ballRef = useRef<BallState>({ ...initialBall });
  const paddlesRef = useRef<PaddlePositions>({
    local: { ...LOCAL_PADDLE_START },
    opponent: { ...OPPONENT_PADDLE_START },
  });
  const rallyRef = useRef<PhysicsRallyState>(
    createPhysicsRally(initialServer)
  );
  const trailsRef = useRef<Record<Side, TrailPoint[]>>({
    local: [],
    opponent: [],
  });

  useEffect(() => {
    gameWinnerRef.current = gameWinner;
  }, [gameWinner]);

  useEffect(() => {
    matchReadyRef.current = isMatchReady;
  }, [isMatchReady]);

  useEffect(() => {
    // Cosmetic images are presentation-only. Loading or changing a skin does
    // not reset the rally, paddle transform, physics state, or score.
    if (props.localRacketSkin) {
      return;
    }

    let disposed = false;
    let unsubscribe = () => undefined;
    const start = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || disposed) return;
      const refreshEquippedSkin = async () => {
        const skin = await getEquippedPingPongRacketSkin(userId);
        if (!disposed) setStoredRacketSkin(skin);
      };
      await refreshEquippedSkin();
      if (disposed) return;

      // Subscribe once. The previous version of this integration accidentally
      // subscribed again after each inventory update, which would multiply
      // callbacks after several equips.
      const channel = supabase
        .channel(`ping-pong-racket-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_inventory",
            filter: `user_id=eq.${userId}`,
          },
          () => void refreshEquippedSkin()
        )
        .subscribe();
      unsubscribe = () => void supabase.removeChannel(channel);
    };
    void start();

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [props.localRacketSkin]);

  useEffect(() => {
    let cancelled = false;
    const loadRacketSet = (
      center: string,
      left: string,
      right: string,
      isDynamicSkin = false
    ): RacketAssetSet => {
      const createAsset = (source: string) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = source;
        return image;
      };
      return {
        center: createAsset(center),
        left: createAsset(left),
        right: createAsset(right),
        isDynamicSkin,
      };
    };

    const logo = new Image();
    logo.src = "/joe-yoke-board-logo.png";
    boardLogoRef.current = logo;
    const localAssets = activeLocalRacketSkin
      ? loadRacketSet(
          activeLocalRacketSkin.centerImageUrl ?? activeLocalRacketSkin.imageUrl,
          activeLocalRacketSkin.leftImageUrl ?? activeLocalRacketSkin.imageUrl,
          activeLocalRacketSkin.rightImageUrl ?? activeLocalRacketSkin.imageUrl,
          true
        )
      : loadRacketSet(
          "/ping-pong-racket-black-center.png",
          "/ping-pong-racket-black-left.png",
          "/ping-pong-racket-black-right.png"
        );
    const opponentAssets = props.opponentRacketSkin
      ? loadRacketSet(
          props.opponentRacketSkin.centerImageUrl ??
            props.opponentRacketSkin.imageUrl,
          props.opponentRacketSkin.leftImageUrl ?? props.opponentRacketSkin.imageUrl,
          props.opponentRacketSkin.rightImageUrl ?? props.opponentRacketSkin.imageUrl,
          true
        )
      : loadRacketSet(
          "/ping-pong-racket-red-center.png",
          "/ping-pong-racket-red-left.png",
          "/ping-pong-racket-red-right.png"
        );
    localRacketAssetsRef.current = localAssets;
    opponentRacketAssetsRef.current = opponentAssets;

    const buildSpriteCache = async () => {
      await Promise.allSettled(
        [
          localAssets.center,
          localAssets.left,
          localAssets.right,
          opponentAssets.center,
          opponentAssets.left,
          opponentAssets.right,
        ].map((image) => image.decode())
      );
      if (
        cancelled ||
        [
          localAssets.center,
          localAssets.left,
          localAssets.right,
          opponentAssets.center,
          opponentAssets.left,
          opponentAssets.right,
        ].some((image) => image.naturalWidth <= 0)
      ) {
        return;
      }
      racketSpritesRef.current = {
        local: createRacketSpriteSet("local", localAssets),
        opponent: createRacketSpriteSet("opponent", opponentAssets),
      };
    };
    void buildSpriteCache();

    return () => {
      cancelled = true;
      boardLogoRef.current = null;
      localRacketAssetsRef.current = null;
      opponentRacketAssetsRef.current = null;
      racketSpritesRef.current = null;
    };
  }, [activeLocalRacketSkin, props.opponentRacketSkin]);

  /**
   * MULTIPLAYER HOOK 1
   * Replace this body with a Supabase broadcast or backendEngine call.
   * A 20 Hz throttle is already applied by the pointer handler.
   */
  const broadcastPaddlePosition = useCallback(
    (position: PaddleState & { strokeActive?: boolean }) => {
      if (!isNetworkMatch || !networkChannelRef.current) return;
      void networkChannelRef.current.send({ type: "broadcast", event: "ping_pong_paddle", payload: position });
    },
    [isNetworkMatch]
  );

  /**
   * MULTIPLAYER HOOK 2
   * The locally authoritative client calls this after a paddle collision.
   */
  const broadcastBallHit = useCallback(
    (payload: BallHitPayload) => {
      if (!isNetworkMatch || !networkChannelRef.current) return;
      void networkChannelRef.current.send({ type: "broadcast", event: "ping_pong_ball_hit", payload });
    },
    [isNetworkMatch]
  );

  /**
   * MULTIPLAYER HOOK 3
   * Call this from your realtime subscription when the remote paddle moves.
   * Recent network input temporarily takes control away from the demo AI.
   */
  const onReceiveOpponentMove = useCallback(
    (position: Vector3 & { tilt?: number; swingX?: number; strokeActive?: boolean }) => {
      // The second player sends input in their own near-side camera space.
      // Mirror it into the host's far-side world before collision tests.
      const worldPosition = {
        x: -position.x,
        y: position.y,
        z: -position.z,
        tilt: -(position.tilt ?? 0),
        swingX: -(position.swingX ?? 0),
      };
      const previous = paddlesRef.current.opponent;
      const nextVx = (worldPosition.x - previous.x) * 20;
      const next: PaddleState = {
        x: clamp(worldPosition.x, -1.34, 1.34),
        y: clamp(worldPosition.y, 0.28, 1.25),
        z: clamp(worldPosition.z, -2.55, -1.45),
        vx: nextVx,
        vy: (worldPosition.y - previous.y) * 20,
        vz: (worldPosition.z - previous.z) * 20,
        tilt: clamp(worldPosition.tilt || nextVx * 0.06, -0.52, 0.52),
        swingX: clamp(worldPosition.swingX || nextVx / 4, -1, 1),
      };
      networkOpponentTargetRef.current = next;
      if (position.strokeActive) {
        lastOpponentSwipeAtRef.current = performance.now();
        // A seat-two serve is requested by an actual swipe and then resolved
        // by the authority. This prevents the old automatic opponent serve.
        const ball = ballRef.current;
        if (
          isSimulationAuthority &&
          ball.servePhase === "waiting" &&
          rallyRef.current.server === "opponent"
        ) {
          ball.servePhase = "toss";
          ball.vx = 0;
          ball.vy = 2.05;
          ball.vz = 0;
          ball.spin = 0;
          setStatus("Opponent tosses the ball");
        }
      }
      opponentNetworkActiveUntilRef.current = performance.now() + 600;
    },
    [isSimulationAuthority]
  );

  const publishAuthoritativeSnapshot = useCallback(() => {
    if (!isNetworkMatch || !isSimulationAuthority || !networkChannelRef.current) return;
    void networkChannelRef.current.send({
      type: "broadcast",
      event: "ping_pong_snapshot",
      payload: {
        sequence: ++networkSequenceRef.current,
        ball: ballRef.current,
        paddles: paddlesRef.current,
        matchState: gameEngine.getState(),
        status,
        winner: gameWinnerRef.current,
      } satisfies NetworkMatchSnapshot,
    });
  }, [gameEngine, isNetworkMatch, isSimulationAuthority, status]);

  useEffect(() => {
    if (!isNetworkMatch) return;
    const channel = supabase.channel(`ping-pong-match-${matchId}`, { config: { broadcast: { self: false } } });
    networkChannelRef.current = channel;
    channel
      .on("broadcast", { event: "ping_pong_paddle" }, ({ payload }) => onReceiveOpponentMove(payload as Vector3 & { tilt?: number; swingX?: number; strokeActive?: boolean }))
      .on("broadcast", { event: "ping_pong_snapshot" }, ({ payload }) => {
        if (isSimulationAuthority) return;
        const snapshot = payload as NetworkMatchSnapshot;
        if (!Number.isFinite(snapshot.sequence) || snapshot.sequence <= lastReceivedSnapshotRef.current) return;
        lastReceivedSnapshotRef.current = snapshot.sequence;
        // Mirror the authority world so each player still sees their own
        // paddle near the camera. This is visual-only; scoring stays host-side.
        const hadReplicaTarget = Boolean(networkReplicaTargetRef.current);
        const mirroredBall = mirrorBall(snapshot.ball);
        const mirroredOpponent = mirrorPaddle(snapshot.paddles.local);
        networkReplicaTargetRef.current = {
          ball: mirroredBall,
          opponent: mirroredOpponent,
        };
        // First packet seeds the renderer immediately; subsequent packets are
        // interpolated in the animation loop rather than visibly snapping.
        if (!hadReplicaTarget) {
          ballRef.current = mirroredBall;
          paddlesRef.current.opponent = mirroredOpponent;
        }
        setMatchState(mirrorMatchState(snapshot.matchState));
        setStatus(snapshot.status);
        if (snapshot.winner) setGameWinner(oppositeSide(snapshot.winner));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); if (networkChannelRef.current === channel) networkChannelRef.current = null; };
  }, [isNetworkMatch, isSimulationAuthority, matchId, onReceiveOpponentMove]);

  const resetRound = useCallback(
    (server: Side) => {
      const nextBall = createServe(server, isDoubles);
      ballRef.current = nextBall;
      rallyRef.current = createPhysicsRally(server);
      if (server === "opponent") {
        opponentServeAimRef.current = createOpponentServeAim();
      }
      opponentReturnAimRef.current = createOpponentReturnAim();
      swingIntentRef.current = {
        horizontal: 0,
        vertical: 0,
        twist: 0,
        intensity: 0,
        expiresAt: 0,
      };
      gesturePathRef.current = [];
      opponentSpinReadErrorRef.current = 0;
      lastPlayerSwipeAtRef.current = 0;
      stalledBallSinceRef.current = 0;
      assistWindowsRef.current = { local: null, opponent: null };
      racketDirectionRef.current = { local: "center", opponent: "center" };
      localPaddleTargetRef.current.swingX = 0;
      localPaddleTargetRef.current.tilt = 0;
      roundLockedRef.current = false;
      setBallPosition({ ...nextBall });
      setStatus(
        server === "local"
          ? "Your serve — swipe left or right"
          : "Opponent serve — get ready"
      );
    },
    [isDoubles]
  );

  const scorePoint = useCallback(
    (winner: Side, reason: string) => {
      if (roundLockedRef.current || gameWinnerRef.current) return;

      roundLockedRef.current = true;
      // The point is final, but the rendered ball remains physical for a short
      // dead-ball period instead of freezing at the scoring position.
      ballRef.current.deadAt = performance.now();
      setStatus(reason);

      const pointResult = gameEngine.scorePoint(
        toPlayerId(winner),
        "RALLY_WINNER"
      );
      const next = pointResult.state;
      // Always publish a detached snapshot so React cannot skip a scoreboard
      // render even if a future authority returns a reused state object.
      setMatchState({ ...next });

      if (pointResult.matchEnded) {
        gameWinnerRef.current = winner;
        setGameWinner(winner);
        setStatus(`${reason} · Match complete`);
      } else if (pointResult.gameEnded) {
        setStatus(`${reason} · Game won — changing ends`);
      } else if (pointResult.sidesSwitched) {
        setStatus("Deciding game — change ends at five");
      }

      if (serveTimerRef.current !== null) {
        window.clearTimeout(serveTimerRef.current);
      }
      if (!pointResult.matchEnded) {
        serveTimerRef.current = window.setTimeout(
          () => {
            if (gameWinnerRef.current) return;

            if (pointResult.gameEnded) {
              const nextGame = gameEngine.resetGame();
              setMatchState({ ...nextGame });
              resetRound(toSide(nextGame.currentServer));
              return;
            }

            resetRound(toSide(next.currentServer));
          },
          pointResult.gameEnded
            ? GAME_SETTLE_DELAY_MS
            : POINT_SETTLE_DELAY_MS
        );
      }
    },
    [gameEngine, resetRound]
  );

  const sendReaction = useCallback((emoji: string) => {
    if (reactionTimerRef.current !== null) {
      window.clearTimeout(reactionTimerRef.current);
    }
    setActiveReaction({ emoji, id: Date.now() });
    reactionTimerRef.current = window.setTimeout(() => {
      setActiveReaction(null);
      reactionTimerRef.current = null;
    }, 1400);

    // Multiplayer hook: broadcast this emoji through the match realtime
    // channel when reactions are connected to Supabase/backendEngine.
  }, []);

  const moveLocalPaddle = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const bounds = canvas.getBoundingClientRect();
      const normalizedX = clamp((clientX - bounds.left) / bounds.width, 0, 1);
      const normalizedPointerY = clamp(
        (clientY - bounds.top) / bounds.height,
        0,
        1
      );
      // Both gesture axes use canvas-width units so a drawn circle remains a
      // circle on a tall phone screen instead of being flattened vertically.
      const gestureY = (clientY - bounds.top) / Math.max(bounds.width, 1);
      const now = performance.now();
      const previousSample = pointerSampleRef.current;
      const sampleDuration = previousSample
        ? Math.max(now - previousSample.at, 8)
        : 8;
      const pointerVelocityX = previousSample
        ? ((normalizedX - previousSample.x) * 1000) / sampleDuration
        : 0;
      const pointerVelocityY = previousSample
        ? ((previousSample.y - gestureY) * 1000) / sampleDuration
        : 0;
      const measuredHorizontal = clamp(pointerVelocityX / 3.2, -1, 1);
      const measuredVertical = clamp(pointerVelocityY / 3.2, -1, 1);
      const sample: SwipeGestureSample = { x: normalizedX, y: gestureY, at: now };
      const swipeDistance = previousSample
        ? Math.hypot(
            (normalizedX - previousSample.x) * bounds.width,
            (gestureY - previousSample.y) * bounds.width
          )
        : 0;
      gesturePathRef.current = [...gesturePathRef.current, sample]
        .filter((entry) => now - entry.at <= 240)
        .slice(-20);
      const circularTwist = calculateCircularSwipeTwist(
        gesturePathRef.current
      );
      const swipeIntensity = clamp(
        Math.hypot(pointerVelocityX, pointerVelocityY) / 3.4,
        0,
        1
      );
      // Pointer-capture commonly emits a 1–2px move after a tap. It must not
      // count as a serve or return stroke; a real swipe needs visible travel.
      const deliberateGesture = swipeDistance >= 10
        ? Math.max(
            Math.abs(measuredHorizontal),
            Math.abs(measuredVertical),
            Math.abs(circularTwist)
          )
        : 0;
      // Preserve the complete stroke long enough for an incoming ball to reach
      // the racket. Stationary pointer samples cannot erase the chosen intent.
      if (deliberateGesture >= 0.08) {
        const horizontalStrength =
          Math.abs(measuredHorizontal) >= 0.05
            ? Math.sign(measuredHorizontal) *
              clamp(0.22 + Math.abs(measuredHorizontal) * 0.78, 0.22, 1)
            : 0;
        swingIntentRef.current = {
          horizontal: horizontalStrength,
          vertical: measuredVertical,
          twist: circularTwist,
          intensity: swipeIntensity,
          expiresAt: now + 820,
        };
        lastPlayerSwipeAtRef.current = now;

        const ball = ballRef.current;
        if (
          ball.servePhase === "waiting" &&
          rallyRef.current.server === "local"
        ) {
          // A swipe starts the regulation vertical toss. The selected aim is
          // held until the ball descends and the virtual racket strikes it.
          ball.servePhase = "toss";
          ball.serveAimX = horizontalStrength;
          ball.servePower = calculateSwipeShotPower(
            measuredVertical,
            swipeIntensity
          );
          ball.serveVertical = measuredVertical;
          ball.serveTwistSpin = calculateTwistSpin(
            circularTwist,
            swipeIntensity
          );
          ball.vx = 0;
          ball.vy = 2.05;
          ball.vz = 0;
          ball.spin = 0;
          setStatus(
            Math.abs(circularTwist) >= 0.24
              ? "Twist serve - toss up!"
              : horizontalStrength < -0.08
              ? "Toss up - serve aimed left"
              : horizontalStrength > 0.08
              ? "Toss up - serve aimed right"
              : "Toss up - power serve"
          );
        } else if (
          ball.servePhase === "toss" &&
          rallyRef.current.server === "local"
        ) {
          // Keep sampling while the toss is airborne. A circular serve gesture
          // needs several pointer samples, so freezing intent on its first
          // segment would discard the actual twist before contact.
          const updatedPower = calculateSwipeShotPower(
            measuredVertical,
            swipeIntensity
          );
          const updatedTwistSpin = calculateTwistSpin(
            circularTwist,
            swipeIntensity
          );
          if (Math.abs(horizontalStrength) >= 0.08) {
            ball.serveAimX = horizontalStrength;
          }
          ball.servePower = Math.max(ball.servePower, updatedPower);
          ball.serveVertical = measuredVertical;
          if (Math.abs(updatedTwistSpin) > Math.abs(ball.serveTwistSpin)) {
            ball.serveTwistSpin = updatedTwistSpin;
          }
          if (Math.abs(ball.serveTwistSpin) >= 1.5) {
            setStatus("Twist loaded - strike on descent");
          }
        }
      }
      const swingX =
        now < swingIntentRef.current.expiresAt
          ? swingIntentRef.current.horizontal
          : 0;
      pointerSampleRef.current = sample;
      // The lower bound reaches beneath a near-edge bounce, giving the player
      // enough downward travel without moving the header or reaction controls.
      const normalizedY = clamp(
        (normalizedPointerY - 0.14) / 0.86,
        0,
        1
      );
      localPaddleTargetRef.current = {
        x: (normalizedX - 0.5) * 2.7,
        y: 0.16 + (1 - normalizedY) * 1.02,
        z: 1.55 + normalizedY * 0.92,
        tilt: calculateRacketTilt(swingX, normalizedX - 0.5),
        swingX,
      };

      if (now - lastPaddleBroadcastRef.current >= NETWORK_INPUT_INTERVAL_MS) {
        broadcastPaddlePosition({
          ...localPaddleTargetRef.current,
          vx: paddlesRef.current.local.vx,
          vy: paddlesRef.current.local.vy,
          vz: paddlesRef.current.local.vz,
          strokeActive: now - lastPlayerSwipeAtRef.current <= 850,
        });
        lastPaddleBroadcastRef.current = now;
      }
    },
    [broadcastPaddlePosition]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    pointerSampleRef.current = null;
    gesturePathRef.current = [];
    event.currentTarget.setPointerCapture(event.pointerId);
    moveLocalPaddle(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    moveLocalPaddle(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    pointerSampleRef.current = null;
    gesturePathRef.current = [];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    return () => {
      if (serveTimerRef.current !== null) {
        window.clearTimeout(serveTimerRef.current);
      }
      if (reactionTimerRef.current !== null) {
        window.clearTimeout(reactionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const project = (
      point: Vector3,
      width: number,
      height: number
    ): { x: number; y: number; scale: number } => {
      const depth = clamp(
        (point.z + TABLE_HALF_LENGTH) / (TABLE_HALF_LENGTH * 2),
        -0.15,
        1.15
      );
      const cameraDepth =
        depth < 0
          ? -Math.pow(-depth, CAMERA_DEPTH_CURVE)
          : depth > 1
          ? 1 + Math.pow(depth - 1, CAMERA_DEPTH_CURVE)
          : Math.pow(depth, CAMERA_DEPTH_CURVE);
      // Mildly overhead broadcast view shared by the table, net, ball,
      // paddles and every collision boundary.
      // Strong tournament-camera perspective: about 49% viewport width at
      // the far edge and 98% at the near edge, matching the reference.
      const halfWidth = width * (0.245 + cameraDepth * 0.245);
      const baseline =
        height *
        (CAMERA_FAR_BASELINE +
          cameraDepth * (CAMERA_NEAR_BASELINE - CAMERA_FAR_BASELINE));
      return {
        x: width / 2 + (point.x / TABLE_HALF_WIDTH) * halfWidth,
        y: baseline - point.y * (48 + cameraDepth * 66),
        scale: 0.58 + cameraDepth * 0.78,
      };
    };

    const drawArena = (width: number, height: number) => {
      const sky = context.createLinearGradient(0, 0, 0, height * 0.55);
      sky.addColorStop(0, "#03060e");
      sky.addColorStop(0.52, "#101a32");
      sky.addColorStop(1, "#26385c");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      // Broadcast-arena lighting: a truss, soft cones and warm seat spill add
      // depth without becoming game objects or affecting the table/ball layer.
      context.save();
      context.strokeStyle = "rgba(124, 145, 170, 0.38)";
      context.lineWidth = Math.max(1, width * 0.004);
      context.beginPath();
      context.moveTo(-width * 0.08, height * 0.105);
      context.lineTo(width * 1.08, height * 0.105);
      context.stroke();
      for (let index = 0; index < 7; index += 1) {
        const x = width * (0.08 + index * 0.14);
        const beam = context.createLinearGradient(x, height * 0.11, x, height * 0.43);
        beam.addColorStop(0, "rgba(191, 224, 255, 0.16)");
        beam.addColorStop(1, "rgba(191, 224, 255, 0)");
        context.fillStyle = beam;
        context.beginPath();
        context.moveTo(x - width * 0.025, height * 0.112);
        context.lineTo(x + width * 0.025, height * 0.112);
        context.lineTo(x + width * 0.14, height * 0.43);
        context.lineTo(x - width * 0.14, height * 0.43);
        context.closePath();
        context.fill();
        context.fillStyle = "#dff3ff";
        context.shadowColor = "#9ddcff";
        context.shadowBlur = Math.max(5, width * 0.022);
        context.beginPath();
        context.arc(x, height * 0.105, Math.max(1.8, width * 0.006), 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      // A clean arena end-wall inspired by broadcast table-tennis venues.
      // It intentionally has no decorative stripes or structural bars.
      const arenaWall = context.createLinearGradient(0, height * 0.12, 0, height * 0.39);
      arenaWall.addColorStop(0, "#151c2b");
      arenaWall.addColorStop(0.54, "#090e18");
      arenaWall.addColorStop(1, "#04070c");
      context.fillStyle = arenaWall;
      context.fillRect(0, height * 0.125, width, height * 0.275);

      // Receding LED walls frame the far end, leaving a quiet central space
      // behind the score rather than an abstract pattern.
      const leftWall = context.createLinearGradient(0, 0, width * 0.34, 0);
      leftWall.addColorStop(0, "#092f51");
      leftWall.addColorStop(1, "#0d1220");
      context.fillStyle = leftWall;
      context.beginPath();
      context.moveTo(0, height * 0.17);
      context.lineTo(width * 0.34, height * 0.14);
      context.lineTo(width * 0.27, height * 0.35);
      context.lineTo(0, height * 0.385);
      context.closePath();
      context.fill();
      const rightWall = context.createLinearGradient(width, 0, width * 0.66, 0);
      rightWall.addColorStop(0, "#411b37");
      rightWall.addColorStop(1, "#0d1220");
      context.fillStyle = rightWall;
      context.beginPath();
      context.moveTo(width, height * 0.17);
      context.lineTo(width * 0.66, height * 0.14);
      context.lineTo(width * 0.73, height * 0.35);
      context.lineTo(width, height * 0.385);
      context.closePath();
      context.fill();

      context.save();
      context.fillStyle = "rgba(204, 255, 0, 0.72)";
      context.fillRect(width * 0.34, height * 0.146, width * 0.32, 2);
      context.fillStyle = "rgba(255,255,255,0.76)";
      context.font = `900 ${Math.max(7, width * 0.027)}px Arial`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("JOE YOKE ARENA", width / 2, height * 0.174);
      context.font = `700 ${Math.max(4.5, width * 0.014)}px Arial`;
      context.fillStyle = "rgba(214, 225, 238, 0.7)";
      context.fillText("TABLE TENNIS CLUB", width / 2, height * 0.192);
      context.restore();

      // Tiered arena seating.
      context.fillStyle = "#11151b";
      context.fillRect(0, height * 0.235, width, height * 0.205);
      context.fillStyle = "#262c34";
      for (let row = 0; row < 3; row += 1) {
        const rowY = height * (0.26 + row * 0.058);
        context.fillRect(0, rowY, width, height * 0.045);
        context.fillStyle = row % 2 === 0 ? "#171b21" : "#242a31";
      }

      // Layered seated spectators: varied heads, hair, shirts, shoulders and
      // bent arms give the background more realistic 2D depth.
      const shirtColors = [
        "#6f8798",
        "#c33b4f",
        "#d5a43b",
        "#2b8a72",
        "#d8d9d4",
        "#5f4a91",
      ];
      const skinColors = ["#f0c6a2", "#c98d68", "#8b5a43", "#e0ab82"];
      const hairColors = ["#191717", "#543421", "#b49a72", "#30343a"];
      const peoplePerRow = Math.max(18, Math.floor(width / 18));
      for (let row = 0; row < 3; row += 1) {
        const scale = (0.72 + row * 0.12) * clamp(width / 390, 0.86, 1.16);
        const baseY = height * (0.266 + row * 0.058);
        for (let index = 0; index < peoplePerRow; index += 1) {
          const x = ((index + 0.5 + (row % 2) * 0.45) / peoplePerRow) * width;
          const headY = baseY - 3 * scale;
          const skin = skinColors[(index + row) % skinColors.length];
          context.fillStyle = hairColors[(index * 3 + row) % hairColors.length];
          context.beginPath();
          context.arc(x, headY - 1.5 * scale, 4.5 * scale, Math.PI, 0);
          context.fill();
          context.fillStyle = skin;
          context.beginPath();
          context.arc(x, headY, 3.8 * scale, 0, Math.PI * 2);
          context.fill();
          context.fillStyle =
            shirtColors[(index + row * 2) % shirtColors.length];
          context.beginPath();
          context.roundRect(
            x - 6 * scale,
            headY + 4 * scale,
            12 * scale,
            10 * scale,
            3 * scale
          );
          context.fill();
          context.strokeStyle = skin;
          context.lineWidth = Math.max(1.5, 2.2 * scale);
          context.beginPath();
          context.moveTo(x - 5 * scale, headY + 7 * scale);
          context.lineTo(x - 8 * scale, headY + 12 * scale);
          context.moveTo(x + 5 * scale, headY + 7 * scale);
          context.lineTo(x + 8 * scale, headY + 12 * scale);
          context.stroke();
        }
      }

      // Matte black competition carpet.
      const floor = context.createLinearGradient(
        width / 2,
        height * 0.4,
        width / 2,
        height
      );
      floor.addColorStop(0, "#16191d");
      floor.addColorStop(0.52, "#090b0e");
      floor.addColorStop(1, "#020304");
      context.fillStyle = floor;
      context.fillRect(0, height * 0.43, width, height * 0.57);


      // Freestanding, fabric-covered arena barriers with metal rails. The
      // darker treatment reads like real event signage instead of neon tiles.
      const barrierY = height * 0.35;
      const barrierHeight = Math.max(50, height * 0.078);
      const panelCount = 4;
      const panelGap = Math.max(3, width * 0.009);
      const panelWidth = (width - panelGap * (panelCount - 1)) / panelCount;
      const logo = boardLogoRef.current;

      context.save();
      context.shadowColor = "rgba(0, 0, 0, 0.55)";
      context.shadowBlur = 12;
      context.shadowOffsetY = 6;
      for (let index = 0; index < panelCount; index += 1) {
        const x = index * (panelWidth + panelGap);
        const innerLeft = x + 2;
        const innerRight = x + panelWidth - 2;
        const panelGradient = context.createLinearGradient(
          x,
          barrierY,
          x + panelWidth,
          barrierY + barrierHeight
        );
        panelGradient.addColorStop(0, "#1c2633");
        panelGradient.addColorStop(0.48, "#0d141d");
        panelGradient.addColorStop(1, "#05080d");

        context.fillStyle = "#77808a";
        context.beginPath();
        context.roundRect(
          x,
          barrierY,
          panelWidth,
          barrierHeight,
          Math.max(2, width * 0.008)
        );
        context.fill();

        context.fillStyle = panelGradient;
        context.fillRect(
          innerLeft,
          barrierY + 3,
          innerRight - innerLeft,
          barrierHeight - 7
        );

        // Lime sponsor piping and subtle material highlight.
        context.fillStyle = "#ccff00";
        context.fillRect(
          innerLeft,
          barrierY + barrierHeight - 7,
          innerRight - innerLeft,
          3
        );
        context.fillStyle = "rgba(255,255,255,0.08)";
        context.fillRect(innerLeft + 2, barrierY + 5, 1, barrierHeight - 14);

        const logoSize = Math.min(barrierHeight * 0.55, panelWidth * 0.3);
        const contentY = barrierY + barrierHeight * 0.46;
        const logoX = x + Math.max(5, panelWidth * 0.08);
        if (logo?.complete && logo.naturalWidth > 0) {
          context.drawImage(
            logo,
            logoX,
            contentY - logoSize / 2,
            logoSize,
            logoSize
          );
        }

        const textX = logoX + logoSize + Math.max(3, panelWidth * 0.035);
        context.textAlign = "left";
        context.textBaseline = "middle";
        context.fillStyle = "#f8fafc";
        context.font = `900 ${Math.max(
          6.5,
          Math.min(9, panelWidth * 0.095)
        )}px Arial`;
        context.fillText("JOE YOKE", textX, contentY - 3);
        context.fillStyle = "#aeb8c4";
        context.font = `700 ${Math.max(
          4.5,
          Math.min(6, panelWidth * 0.06)
        )}px Arial`;
        context.fillText("ARENA", textX, contentY + 7);
      }
      context.restore();

      // Visible feet make each barrier feel physically installed.
      context.fillStyle = "#505862";
      for (let index = 0; index <= panelCount; index += 1) {
        const x = clamp(index * (panelWidth + panelGap), 5, width - 5);
        context.fillRect(x - 2, barrierY + barrierHeight, 4, 8);
        context.fillRect(x - 7, barrierY + barrierHeight + 6, 14, 3);
      }
    };

    const drawTable = (width: number, height: number) => {
      const farLeft = project(
        { x: -TABLE_HALF_WIDTH, y: 0, z: -TABLE_HALF_LENGTH },
        width,
        height
      );
      const farRight = project(
        { x: TABLE_HALF_WIDTH, y: 0, z: -TABLE_HALF_LENGTH },
        width,
        height
      );
      const nearRight = project(
        { x: TABLE_HALF_WIDTH, y: 0, z: TABLE_HALF_LENGTH },
        width,
        height
      );
      const nearLeft = project(
        { x: -TABLE_HALF_WIDTH, y: 0, z: TABLE_HALF_LENGTH },
        width,
        height
      );

      const tableSpan = nearRight.x - nearLeft.x;

      // Soft carpet shadow anchors the table before any frame pieces are drawn.
      context.save();
      context.fillStyle = "rgba(0, 0, 0, 0.5)";
      context.filter = `blur(${Math.max(5, width * 0.018)}px)`;
      context.beginPath();
      context.ellipse(
        width / 2,
        nearLeft.y + height * 0.09,
        tableSpan * 0.48,
        height * 0.055,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();

      // Dark steel frames and legs matching the photographic reference.
      const legTopY = nearLeft.y + height * 0.018;
      const legBottomY = Math.min(height * 0.855, nearLeft.y + height * 0.13);
      const legs = [
        {
          topX: nearLeft.x + tableSpan * 0.27,
          bottomX: nearLeft.x + tableSpan * 0.22,
        },
        {
          topX: nearLeft.x + tableSpan * 0.73,
          bottomX: nearLeft.x + tableSpan * 0.78,
        },
      ];
      legs.forEach(({ topX, bottomX }) => {
        context.lineCap = "square";
        context.strokeStyle = "#181b1c";
        context.lineWidth = Math.max(10, width * 0.027);
        context.beginPath();
        context.moveTo(topX, legTopY);
        context.lineTo(bottomX, legBottomY);
        context.stroke();

        context.strokeStyle = "#3a4041";
        context.lineWidth = Math.max(4, width * 0.01);
        context.beginPath();
        context.moveTo(topX, legTopY + 2);
        context.lineTo(bottomX, legBottomY - 2);
        context.stroke();

        context.strokeStyle = "#202735";
        context.lineWidth = Math.max(8, width * 0.02);
        context.beginPath();
        context.moveTo(bottomX - width * 0.025, legBottomY);
        context.lineTo(bottomX + width * 0.035, legBottomY);
        context.stroke();
      });
      context.lineCap = "butt";

      // Straight dark under-frame, visible just beneath the near edge.
      context.fillStyle = "#171a1b";
      context.fillRect(
        nearLeft.x + tableSpan * 0.22,
        nearLeft.y + height * 0.02,
        tableSpan * 0.56,
        Math.max(8, height * 0.012)
      );
      context.fillStyle = "#3b4142";
      context.fillRect(
        nearLeft.x + tableSpan * 0.28,
        nearLeft.y + height * 0.022,
        tableSpan * 0.44,
        Math.max(2, height * 0.004)
      );

      // Substantial charcoal/white tabletop edge.
      context.fillStyle = "#394554";
      context.beginPath();
      context.moveTo(nearLeft.x, nearLeft.y);
      context.lineTo(nearRight.x, nearRight.y);
      context.lineTo(nearRight.x - width * 0.008, nearRight.y + height * 0.022);
      context.lineTo(nearLeft.x + width * 0.008, nearLeft.y + height * 0.022);
      context.closePath();
      context.fill();
      context.strokeStyle = "#f4f5f7";
      context.lineWidth = Math.max(3, width * 0.008);
      context.beginPath();
      context.moveTo(nearLeft.x, nearLeft.y + 1);
      context.lineTo(nearRight.x, nearRight.y + 1);
      context.stroke();

      // Cyan competition surface with the soft depth shift in the reference.
      const farCenter = project(
        { x: 0, y: 0.006, z: -TABLE_HALF_LENGTH },
        width,
        height
      );
      const nearCenter = project(
        { x: 0, y: 0.006, z: TABLE_HALF_LENGTH },
        width,
        height
      );
      const tableSurface = context.createLinearGradient(
        0,
        farLeft.y,
        0,
        nearLeft.y
      );
      tableSurface.addColorStop(0, "#168eaf");
      tableSurface.addColorStop(0.5, "#28afd0");
      tableSurface.addColorStop(1, "#55c6df");
      context.fillStyle = tableSurface;
      context.beginPath();
      context.moveTo(farLeft.x, farLeft.y);
      context.lineTo(farCenter.x, farCenter.y);
      context.lineTo(nearCenter.x, nearCenter.y);
      context.lineTo(nearLeft.x, nearLeft.y);
      context.closePath();
      context.fill();
      context.fillStyle = tableSurface;
      context.beginPath();
      context.moveTo(farCenter.x, farCenter.y);
      context.lineTo(farRight.x, farRight.y);
      context.lineTo(nearRight.x, nearRight.y);
      context.lineTo(nearCenter.x, nearCenter.y);
      context.closePath();
      context.fill();

      context.strokeStyle = "#f7f8fa";
      context.lineWidth = Math.max(2.5, width * 0.007);
      context.beginPath();
      context.moveTo(farLeft.x, farLeft.y);
      context.lineTo(farRight.x, farRight.y);
      context.lineTo(nearRight.x, nearRight.y);
      context.lineTo(nearLeft.x, nearLeft.y);
      context.closePath();
      context.stroke();

      context.lineWidth = Math.max(1.5, width * 0.0035);
      context.beginPath();
      context.moveTo(farCenter.x, farCenter.y);
      context.lineTo(nearCenter.x, nearCenter.y);
      context.stroke();

      // Regulation-height net. It uses the same NET_Z/NET_HEIGHT values as the
      // swept collision test, so there is no separate visual hit boundary.
      const netLeftBottom = project(
        { x: -TABLE_HALF_WIDTH - 0.06, y: 0, z: NET_VISUAL_Z },
        width,
        height
      );
      const netRightBottom = project(
        { x: TABLE_HALF_WIDTH + 0.06, y: 0, z: NET_VISUAL_Z },
        width,
        height
      );
      const netLeftTop = project(
        {
          x: -TABLE_HALF_WIDTH - 0.06,
          y: NET_HEIGHT,
          z: NET_VISUAL_Z,
        },
        width,
        height
      );
      const netRightTop = project(
        {
          x: TABLE_HALF_WIDTH + 0.06,
          y: NET_HEIGHT,
          z: NET_VISUAL_Z,
        },
        width,
        height
      );
      context.fillStyle = "rgba(9, 22, 27, 0.62)";
      context.beginPath();
      context.moveTo(netLeftBottom.x, netLeftBottom.y);
      context.lineTo(netRightBottom.x, netRightBottom.y);
      context.lineTo(netRightTop.x, netRightTop.y);
      context.lineTo(netLeftTop.x, netLeftTop.y);
      context.closePath();
      context.fill();
      // White top tape with a dark lower seam.
      context.strokeStyle = "#f1f5f9";
      context.lineWidth = Math.max(2.5, width * 0.007);
      context.beginPath();
      context.moveTo(netLeftTop.x, netLeftTop.y);
      context.lineTo(netRightTop.x, netRightTop.y);
      context.stroke();
      context.strokeStyle = "#53636b";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(netLeftTop.x, netLeftTop.y + 3);
      context.lineTo(netRightTop.x, netRightTop.y + 3);
      context.stroke();

      context.strokeStyle = "rgba(197, 213, 220, 0.5)";
      context.lineWidth = 1;
      for (let index = 1; index < 22; index += 1) {
        const t = index / 22;
        const xBottom =
          netLeftBottom.x + (netRightBottom.x - netLeftBottom.x) * t;
        const xTop = netLeftTop.x + (netRightTop.x - netLeftTop.x) * t;
        context.beginPath();
        context.moveTo(xBottom, netLeftBottom.y);
        context.lineTo(xTop, netLeftTop.y);
        context.stroke();
      }
      for (let index = 1; index < 4; index += 1) {
        const t = index / 4;
        const yLeft = netLeftTop.y + (netLeftBottom.y - netLeftTop.y) * t;
        const yRight = netRightTop.y + (netRightBottom.y - netRightTop.y) * t;
        context.beginPath();
        context.moveTo(netLeftTop.x, yLeft);
        context.lineTo(netRightTop.x, yRight);
        context.stroke();
      }

      context.strokeStyle = "#20262a";
      context.lineWidth = Math.max(4, width * 0.011);
      context.beginPath();
      context.moveTo(netLeftBottom.x, netLeftBottom.y + 5);
      context.lineTo(netLeftTop.x, netLeftTop.y - 4);
      context.moveTo(netRightBottom.x, netRightBottom.y + 5);
      context.lineTo(netRightTop.x, netRightTop.y - 4);
      context.stroke();

      // Compact clamps below each post.
      context.fillStyle = "#343b40";
      const clampWidth = Math.max(7, width * 0.019);
      const clampHeight = Math.max(5, height * 0.007);
      context.fillRect(
        netLeftBottom.x - clampWidth / 2,
        netLeftBottom.y,
        clampWidth,
        clampHeight
      );
      context.fillRect(
        netRightBottom.x - clampWidth / 2,
        netRightBottom.y,
        clampWidth,
        clampHeight
      );
    };

    const drawTrail = (
      side: Side,
      width: number,
      height: number,
      now: number
    ) => {
      const fresh = trailsRef.current[side].filter(
        (point) => now - point.createdAt < 360
      );
      trailsRef.current[side] = fresh;

      if (fresh.length < 2) return;

      const colors =
        side === "local" ? ["#ffd6df", "#ffffff"] : ["#c9ddff", "#ffffff"];
      const points = fresh.map((point) => {
        const projected = project(point, width, height);
        return projected;
      });

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      colors.forEach((color, colorIndex) => {
        context.globalAlpha = side === "local" ? 0.35 : 0.28;
        context.strokeStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 6;
        context.lineWidth = Math.max(1.8, width * 0.0055) - colorIndex * 0.3;
        context.beginPath();
        points.forEach((point, pointIndex) => {
          const offset = (colorIndex - (colors.length - 1) / 2) * 3.5;
          if (pointIndex === 0) {
            context.moveTo(point.x, point.y + offset);
          } else {
            context.lineTo(point.x, point.y + offset);
          }
        });
        context.stroke();
      });
      context.restore();
    };

    const drawPaddle = (
      side: Side,
      paddle: PaddleState,
      width: number,
      height: number
    ) => {
      const point = project(paddle, width, height);
      const isLocal = side === "local";
      const radius = (isLocal ? 35 : 19) * point.scale;
      const direction = resolveRacketDirection(
        racketDirectionRef.current[side],
        paddle.swingX
      );
      racketDirectionRef.current[side] = direction;
      const racketAssets = isLocal
        ? localRacketAssetsRef.current
        : opponentRacketAssetsRef.current;
      const sprite = racketSpritesRef.current?.[side][direction];
      if (sprite) {
        const renderedSize =
          radius *
          (isLocal ? 2.05 : 2.62) *
          (RACKET_SPRITE_SIZE / RACKET_SPRITE_VISIBLE_HEIGHT);
        context.save();
        context.globalAlpha = 1;
        context.drawImage(
          sprite,
          point.x - renderedSize / 2,
          point.y - renderedSize / 2,
          renderedSize,
          renderedSize
        );
        context.restore();
        return;
      }

      // Startup fallback while the small opaque sprite cache is being built.
      const racketAsset = racketAssets?.[direction];
      const assetLayout = RACKET_ASSET_LAYOUTS[side][direction];
      if (
        racketAsset?.complete &&
        racketAsset.naturalWidth > 0 &&
        racketAsset.naturalHeight > 0
      ) {
        const [sourceX, sourceY, sourceWidth, sourceHeight] = assetLayout.crop;
        const renderedHeight =
          radius *
          (isLocal ? 2.05 : 2.62) *
          assetLayout.renderScale;
        const renderedWidth = renderedHeight * (sourceWidth / sourceHeight);
        const [anchorX, anchorY] = assetLayout.anchor;
        context.drawImage(
          racketAsset,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          point.x - renderedWidth * anchorX,
          point.y - renderedHeight * anchorY,
          renderedWidth,
          renderedHeight
        );
        return;
      }

      const handleLength = radius * (isLocal ? 1.14 : 1.08);
      const handleAngle = Math.PI * 0.5;

      context.save();
      context.translate(point.x, point.y);
      context.rotate(
        (isLocal ? -0.04 : 0.04) + clamp(paddle.tilt, -0.66, 0.66)
      );

      context.lineCap = "round";
      const handleStart = radius * 0.62;
      const handleEnd = radius + handleLength;
      context.strokeStyle = isLocal ? "#183b42" : "#263a69";
      context.lineWidth = Math.max(8, radius * 0.27);
      context.shadowBlur = 0;
      context.beginPath();
      context.moveTo(
        Math.cos(handleAngle) * handleStart,
        Math.sin(handleAngle) * handleStart
      );
      context.lineTo(
        Math.cos(handleAngle) * handleEnd,
        Math.sin(handleAngle) * handleEnd
      );
      context.stroke();

      // Flat matte rubber: solid colors, no gradient, gloss, glow or
      // reflection. The near paddle mirrors the black racket in the reference.
      context.fillStyle = isLocal ? "#24272c" : "#b61f3a";
      context.beginPath();
      context.ellipse(0, 0, radius * 0.94, radius, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = isLocal ? "#17191d" : "#851329";
      context.lineWidth = Math.max(2, radius * 0.055);
      context.stroke();

      context.restore();
    };

    const drawBall = (width: number, height: number) => {
      const ball = ballRef.current;
      if (!ball.active) return;

      const shadowPoint = project(
        { x: ball.x, y: TABLE_HEIGHT + 0.005, z: ball.z },
        width,
        height
      );
      const point = project(ball, width, height);
      const radius = clamp(6.5 * point.scale, 4, 13);

      context.globalAlpha = clamp(0.45 - ball.y * 0.12, 0.12, 0.42);
      context.fillStyle = "#00151d";
      context.beginPath();
      context.ellipse(
        shadowPoint.x,
        shadowPoint.y,
        radius * 1.45,
        radius * 0.48,
        0,
        0,
        Math.PI * 2
      );
      context.fill();
      context.globalAlpha = 1;

      const gradient = context.createRadialGradient(
        point.x - radius * 0.3,
        point.y - radius * 0.35,
        radius * 0.12,
        point.x,
        point.y,
        radius
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.42, "#f7f7f2");
      gradient.addColorStop(1, "#9ca3af");
      context.shadowBlur = 15;
      context.shadowColor = "rgba(255, 255, 255, 0.65)";
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    };

    const tryPaddleCollision = (
      side: Side,
      previousBallPosition: Vector3,
      ball: BallState,
      previousPaddle: PaddleState,
      paddle: PaddleState,
      now: number,
      assisted: boolean
    ) => {
      if (ball.servePhase === "toss" || ball.netStopped) return false;

      // A stationary on-screen racket is only a visual ready position. Requiring
      // a recent deliberate stroke prevents an untouched incoming ball from
      // overlapping the generous mobile hitbox and becoming a false volley.
      if (side === "local" && now - lastPlayerSwipeAtRef.current > 850) {
        return false;
      }
      // In a human online match the authority never substitutes an AI return
      // for the remote player. Their racket must have received a real swipe.
      if (
        side === "opponent" &&
        isNetworkMatch &&
        now - lastOpponentSwipeAtRef.current > 850
      ) {
        return false;
      }

      const movingTowardPaddle = side === "local" ? ball.vz > 0 : ball.vz < 0;
      const nextRally = registerPaddleReturn(rallyRef.current, side);
      const approachDirection: 1 | -1 = side === "local" ? 1 : -1;
      const radiusX = assisted ? 1.05 : 0.94;
      const radiusY = assisted ? 0.98 : 0.86;
      const sweptImpact = sweepSphereAgainstPaddle(
        previousBallPosition,
        ball,
        {
          x: paddle.x,
          y: paddle.y,
          z: paddle.z,
          radiusX,
          radiusY,
          tilt: paddle.tilt,
          ballRadius: BALL_RADIUS,
          approachDirection,
          previous: {
            x: previousPaddle.x,
            y: previousPaddle.y,
            z: previousPaddle.z,
            tilt: previousPaddle.tilt,
          },
        }
      );
      // The overlap fallback also catches a player moving the racket sideways
      // into a slow ball while both remain close to the contact plane.
      const closeInDepth = Math.abs(ball.z - paddle.z) < 0.42;
      const opponentContactPlane = paddle.z + BALL_RADIUS;
      const assistedOpponentPlaneContact =
        side === "opponent" &&
        assisted &&
        Boolean(nextRally) &&
        previousBallPosition.z >= opponentContactPlane &&
        ball.z <= opponentContactPlane &&
        ball.y >= TABLE_HEIGHT + BALL_RADIUS * 0.5 &&
        ball.y <= 1.5 &&
        Math.abs(ball.x) <= TABLE_HALF_WIDTH + 0.12;
      const contactX = sweptImpact?.x ?? ball.x;
      const contactY = sweptImpact?.y ?? ball.y;
      const contactPaddleX = sweptImpact?.paddleX ?? paddle.x;
      const contactPaddleY = sweptImpact?.paddleY ?? paddle.y;
      const contactPaddleZ = sweptImpact?.paddleZ ?? paddle.z;
      const contactPaddleTilt = sweptImpact?.paddleTilt ?? paddle.tilt;
      const relativeX = contactX - contactPaddleX;
      const relativeY = contactY - contactPaddleY;
      const cosine = Math.cos(-contactPaddleTilt);
      const sine = Math.sin(-contactPaddleTilt);
      const racketX = relativeX * cosine - relativeY * sine;
      const racketY = relativeX * sine + relativeY * cosine;
      const closeToFace =
        (racketX * racketX) / ((radiusX + 0.04) * (radiusX + 0.04)) +
          (racketY * racketY) / ((radiusY + 0.04) * (radiusY + 0.04)) <
        1;

      if (
        !movingTowardPaddle ||
        (!sweptImpact &&
          !assistedOpponentPlaneContact &&
          (!closeInDepth || !closeToFace))
      ) {
        return false;
      }

      // Volleys are illegal: a receiver may strike only after the ball has
      // bounced on their side. The paddle collision includes the paddle hand,
      // which is a legal striking surface under table-tennis rules.
      if (!nextRally) {
        scorePoint(
          oppositeSide(side),
          side === "local"
            ? "Volley fault — opponent scores"
            : "Opponent volley fault — you score"
        );
        return true;
      }

      // The AI uses a buffered collision ellipse so fast mobile rallies stay
      // playable. Once that buffered hit succeeds, move the visible opponent
      // racket face to the actual swept impact point. Without this correction
      // the collision is valid, but the artwork can remain almost one face
      // radius away and make the ball appear to strike the handle.
      let resolvedContactPaddleX = contactPaddleX;
      if (side === "opponent") {
        resolvedContactPaddleX = contactX;
        paddle.x = resolvedContactPaddleX;
        paddle.y = contactY;
        paddle.vx = 0;
        paddle.vy = 0;
      }

      const xOffset = contactX - resolvedContactPaddleX;
      ball.x = contactX;
      ball.y = contactY;
      ball.z = contactPaddleZ + (side === "local" ? -0.24 : 0.24);
      const localIntentActive =
        side === "local" && now < swingIntentRef.current.expiresAt;
      const latchedLocalSwing = localIntentActive
        ? swingIntentRef.current.horizontal
        : paddle.swingX;
      const latchedVerticalSwing = localIntentActive
        ? swingIntentRef.current.vertical
        : 0;
      const latchedTwist = localIntentActive
        ? swingIntentRef.current.twist
        : 0;
      const latchedIntensity = localIntentActive
        ? swingIntentRef.current.intensity
        : 0;
      const shotPower =
        side === "local"
          ? calculateSwipeShotPower(latchedVerticalSwing, latchedIntensity)
          : 0;
      const effectiveTilt = calculateRacketTilt(
        latchedLocalSwing,
        paddle.x / (TABLE_HALF_WIDTH * 2)
      );
      const swipeSteering = calculateSwipeSteering(
        latchedLocalSwing,
        effectiveTilt,
        paddle.vx
      );
      const twistSpin =
        side === "local"
          ? calculateTwistSpin(latchedTwist, latchedIntensity)
          : 0;
      ball.spin = clamp(
        calculateSwipeSpin(
          latchedLocalSwing,
          effectiveTilt,
          paddle.vx
        ) + twistSpin,
        -7.2,
        7.2
      );
      ball.vy =
        side === "local"
          ? clamp(
              2.38 -
                shotPower * 0.78 +
                latchedVerticalSwing * 0.22 +
                Math.abs(ball.vy) * 0.1,
              1.35,
              2.85
            )
          : clamp(
              1.82 +
                Math.abs(ball.vy) * 0.2 +
                paddle.vy * 0.06 +
                Math.abs(latchedLocalSwing) * 0.34,
              1.65,
              3.15
            );

      // Aim at an in-bounds receiver-side landing point. Swipe direction
      // selects the target; it no longer becomes an unbounded world velocity.
      const deliberateLocalShot =
        side === "local" && Math.abs(latchedLocalSwing) >= 0.16;
      const targetLandingX =
        side === "local"
          ? deliberateLocalShot
            ? Math.sign(latchedLocalSwing) *
              (0.42 + Math.abs(latchedLocalSwing) * 0.68)
            : clamp(
                swipeSteering * 0.18 + xOffset * 0.22,
                -0.82,
                0.82
              )
          : opponentReturnAimRef.current;
      // Keep powerful shots fast without placing their bounce almost directly
      // on the opponent's racket plane. That depth previously left the AI only
      // a few milliseconds to complete an otherwise valid return.
      const targetLandingZ =
        side === "local" ? -1.58 - shotPower * 0.12 : 1.72;
      const landingVelocity = solveRallyLandingVelocity(
        ball,
        clamp(targetLandingX, -1.18, 1.18),
        targetLandingZ,
        TABLE_HEIGHT,
        BALL_RADIUS,
        GRAVITY
      );
      if (landingVelocity) {
        const lateralLimit = 3.4 + Math.abs(latchedTwist) * 0.8;
        ball.vx = clamp(landingVelocity.vx, -lateralLimit, lateralLimit);
        if (side === "local") {
          const minimumDrive = 3.8 + shotPower * 0.55;
          const maximumDrive = 6.2 + shotPower * 1.05;
          ball.vz = clamp(
            landingVelocity.vz,
            -maximumDrive,
            -minimumDrive
          );
        } else {
          ball.vz = clamp(landingVelocity.vz, 3.8, 6.2);
        }
      } else {
        ball.vx = clamp(swipeSteering * 0.55, -2.4, 2.4);
        ball.vz =
          side === "local" ? -(4.7 + shotPower * 1.15) : 4.7;
      }
      if (side === "opponent") {
        opponentReturnAimRef.current = createOpponentReturnAim();
        opponentSpinReadErrorRef.current = 0;
      } else {
        const readDifficulty =
          Math.abs(latchedTwist) * (0.14 + latchedIntensity * 0.18);
        opponentSpinReadErrorRef.current =
          readDifficulty > 0.025
            ? (Math.random() * 2 - 1) * readDifficulty
            : 0;
      }

      if (side === "local") {
        // Keep the matching directional artwork visible through follow-through
        // without leaking the previous shot into the next rally.
        swingIntentRef.current.expiresAt = now + 180;
      }
      assistWindowsRef.current[side] = null;

      rallyRef.current = nextRally;

      trailsRef.current[side].push({ ...paddle, createdAt: now });
      setStatus(
        side === "local"
          ? Math.abs(latchedTwist) >= 0.24
            ? "Twist spin!"
            : shotPower >= 0.68
            ? "Power drive!"
            : "Clean return!"
          : "Opponent returns"
      );

      if (side === "local") {
        broadcastBallHit({
          position: { x: ball.x, y: ball.y, z: ball.z },
          velocity: { x: ball.vx, y: ball.vy, z: ball.vz },
          hitterId: currentUserId,
          timestamp: Date.now(),
        });
      }
      return true;
    };

    const updateDeadBall = (deltaSeconds: number, now: number) => {
      const ball = ballRef.current;
      const previousPosition: Vector3 = {
        x: ball.x,
        y: ball.y,
        z: ball.z,
      };

      const spinStep = applySideSpin(ball.vx, ball.spin, deltaSeconds);
      ball.vx = spinStep.vx;
      ball.spin = spinStep.spin;
      ball.vy += GRAVITY * deltaSeconds;
      ball.x += ball.vx * deltaSeconds;
      ball.y += ball.vy * deltaSeconds;
      ball.z += ball.vz * deltaSeconds;

      // A dead ball may still catch the net. Absorb most forward energy while
      // allowing gravity to finish the visible motion naturally.
      const netImpact = sweepSphereAgainstNet(previousPosition, ball, {
        z: NET_Z,
        halfWidth: TABLE_HALF_WIDTH,
        height: NET_HEIGHT,
        tableHeight: TABLE_HEIGHT,
        ballRadius: BALL_RADIUS,
      });
      if (netImpact) {
        ball.x = netImpact.x;
        ball.y = netImpact.y;
        ball.z = NET_Z +
          netImpact.approachSide * (BALL_RADIUS + 0.008);
        ball.vx *= 0.55;
        ball.vz *= -0.12;
        ball.vy = Math.min(ball.vy * 0.35, -0.2);
        ball.spin *= 0.45;
      }

      const overTable =
        Math.abs(ball.x) <= TABLE_HALF_WIDTH &&
        Math.abs(ball.z) <= TABLE_HALF_LENGTH;
      if (overTable && ball.y - BALL_RADIUS <= TABLE_HEIGHT && ball.vy < 0) {
        ball.y = TABLE_HEIGHT + BALL_RADIUS;
        ball.vy = Math.abs(ball.vy) * DEAD_BALL_RESTITUTION;
        ball.vx *= 0.985;
        ball.vz *= 0.988;
        ball.spin *= 0.74;

        if (ball.vy < 0.16) ball.vy = 0;
      }

      if (
        ball.y < -1.8 ||
        (ball.deadAt > 0 && now - ball.deadAt >= DEAD_BALL_MAX_LIFETIME_MS)
      ) {
        ball.active = false;
      }
    };

    const updatePhysics = (deltaSeconds: number, now: number) => {
      // Matchmaking intentionally pauses the simulation. A point cannot start
      // or score while a real-player search is still in progress.
      if (!matchReadyRef.current) return;
      const ball = ballRef.current;
      if (!ball.active) {
        return;
      }
      if (roundLockedRef.current) {
        updateDeadBall(deltaSeconds, now);
        return;
      }
      if (gameWinnerRef.current) {
        return;
      }

      // Collision uses both ends of each paddle's movement during this fixed
      // step, keeping the physical face synchronized with the rendered face.
      const previousPaddles: PaddlePositions = {
        local: { ...paddlesRef.current.local },
        opponent: { ...paddlesRef.current.opponent },
      };

      // Critically damped pointer follow: fast enough to feel direct, smooth
      // enough to avoid the jumpy racket motion visible in the first build.
      const local = paddlesRef.current.local;
      const target = localPaddleTargetRef.current;
      const localAssistWindow = assistWindowsRef.current.local;
      const localPrediction =
        ball.vz > 0 && rallyRef.current.validBounce
          ? predictBallAtZPlane(
              ball,
              local.z - BALL_RADIUS,
              GRAVITY
            )
          : null;
      const localGestureReady = Boolean(
        localAssistWindow &&
          now < localAssistWindow.expiresAt &&
          now - lastPlayerSwipeAtRef.current < 780
      );
      const localAssistActive = Boolean(
        localGestureReady &&
          localPrediction &&
          localPrediction.time < 0.55 &&
          localPrediction.y >= 0.14 &&
          localPrediction.y <= 1.36
      );
      const hasLatchedSwing = now < swingIntentRef.current.expiresAt;
      if (hasLatchedSwing) {
        target.swingX = swingIntentRef.current.horizontal;
        target.tilt = calculateRacketTilt(target.swingX, target.x / 2.7);
      } else if (
        !draggingRef.current ||
        now - (pointerSampleRef.current?.at ?? 0) > 40
      ) {
        const swingDecay = Math.exp(-deltaSeconds / 0.18);
        target.swingX *= swingDecay;
        target.tilt = calculateRacketTilt(target.swingX, target.x / 2.7);
      }
      const follow = 1 - Math.exp(-26 * deltaSeconds);
      const assistedTargetX = localAssistActive
        ? target.x +
          (clamp(localPrediction!.x, -1.34, 1.34) - target.x) * 0.82
        : localGestureReady
        ? target.x +
          (clamp(localAssistWindow!.landingX, -1.34, 1.34) - target.x) *
            0.28
        : target.x;
      const assistedTargetY = localAssistActive
        ? target.y +
          (clamp(localPrediction!.y, 0.18, 1.18) - target.y) * 0.72
        : target.y;
      const nextLocal = {
        x: local.x + (assistedTargetX - local.x) * follow,
        y: local.y + (assistedTargetY - local.y) * follow,
        z: local.z + (target.z - local.z) * follow,
        tilt: dampRacketTilt(local.tilt, target.tilt, deltaSeconds),
        swingX: dampRacketTilt(local.swingX, target.swingX, deltaSeconds, 14),
      };
      paddlesRef.current.local = {
        ...nextLocal,
        vx: clamp(
          (nextLocal.x - local.x) / Math.max(deltaSeconds, 0.001),
          -8,
          8
        ),
        vy: clamp(
          (nextLocal.y - local.y) / Math.max(deltaSeconds, 0.001),
          -6,
          6
        ),
        vz: clamp(
          (nextLocal.z - local.z) / Math.max(deltaSeconds, 0.001),
          -6,
          6
        ),
      };

      if (
        Math.hypot(
          paddlesRef.current.local.vx,
          paddlesRef.current.local.vy,
          paddlesRef.current.local.vz
        ) > 0.45 &&
        now - lastTrailStampRef.current.local > 24
      ) {
        trailsRef.current.local.push({
          ...paddlesRef.current.local,
          createdAt: now,
        });
        trailsRef.current.local = trailsRef.current.local.slice(-16);
        lastTrailStampRef.current.local = now;
      }

      // Demo opponent. Any realtime move received through
      // onReceiveOpponentMove takes priority for 600ms.
      if (now <= opponentNetworkActiveUntilRef.current && networkOpponentTargetRef.current) {
        // Remote input arrives at 30 Hz; critically-damped interpolation keeps
        // the remote racket moving on every 120 Hz physics tick instead of
        // visibly stepping once per packet.
        const opponent = paddlesRef.current.opponent;
        const targetOpponent = networkOpponentTargetRef.current;
        const followRemote = 1 - Math.exp(-38 * deltaSeconds);
        const nextX = opponent.x + (targetOpponent.x - opponent.x) * followRemote;
        const nextY = opponent.y + (targetOpponent.y - opponent.y) * followRemote;
        const nextZ = opponent.z + (targetOpponent.z - opponent.z) * followRemote;
        paddlesRef.current.opponent = {
          x: nextX,
          y: nextY,
          z: nextZ,
          vx: clamp((nextX - opponent.x) / Math.max(deltaSeconds, 0.001), -10, 10),
          vy: clamp((nextY - opponent.y) / Math.max(deltaSeconds, 0.001), -8, 8),
          vz: clamp((nextZ - opponent.z) / Math.max(deltaSeconds, 0.001), -8, 8),
          tilt: dampRacketTilt(opponent.tilt, targetOpponent.tilt, deltaSeconds, 22),
          swingX: dampRacketTilt(opponent.swingX, targetOpponent.swingX, deltaSeconds, 22),
        };
      } else if (!isNetworkMatch) {
        const opponent = paddlesRef.current.opponent;
        const opponentAssistWindow = assistWindowsRef.current.opponent;
        const opponentWindowActive = Boolean(
          opponentAssistWindow && now < opponentAssistWindow.expiresAt
        );
        const opponentPrediction =
          ball.vz < 0
            ? rallyRef.current.validBounce
              ? predictBallAtZPlane(
                  ball,
                  opponent.z + BALL_RADIUS,
                  GRAVITY
                )
              : opponentWindowActive
              ? predictBallAtZPlaneAfterTableBounce(
                  ball,
                  opponent.z + BALL_RADIUS,
                  TABLE_HEIGHT,
                  BALL_RADIUS,
                  GRAVITY,
                  TABLE_RESTITUTION
                )
              : null
            : null;
        const predictionIsBeforeBounce = Boolean(
          opponentPrediction && !rallyRef.current.validBounce
        );
        const opponentAssistActive = Boolean(
          opponentWindowActive &&
            opponentPrediction &&
            opponentPrediction.time <
              (predictionIsBeforeBounce ? 1.25 : 0.72) &&
            opponentPrediction.y >= TABLE_HEIGHT + BALL_RADIUS * 0.5 &&
            opponentPrediction.y <= 1.42
        );
        // Twist spin may fool the AI early in the shot, but the error must
        // converge to zero before contact or a visible racket overlap can miss
        // the physical collision ellipse.
        const spinReadError = opponentPrediction
          ? opponentSpinReadErrorRef.current *
            clamp((opponentPrediction.time - 0.14) / 0.5, 0, 1)
          : 0;
        const targetX =
          ball.vz < 0
            ? clamp(
                opponentAssistActive
                  ? opponentPrediction!.x + spinReadError
                  : opponentWindowActive
                  ? opponentAssistWindow!.landingX
                  : ball.x,
                -1.28,
                1.28
              )
            : ball.x * 0.25;
        const targetY =
          ball.vz < 0
            ? clamp(
                opponentAssistActive ? opponentPrediction!.y : ball.y,
                0.14,
                1.22
              )
            : 0.58;
        const imminentContact = Boolean(
          opponentPrediction && opponentPrediction.time < 0.2
        );
        const opponentMoveSpeedX = predictionIsBeforeBounce
          ? 4.6
          : imminentContact
          ? 5.4
          : 3.2;
        const opponentMoveSpeedY = predictionIsBeforeBounce
          ? 3.4
          : imminentContact
          ? 4.1
          : 2.5;
        const nextX =
          opponent.x +
          clamp(
            targetX - opponent.x,
            -opponentMoveSpeedX * deltaSeconds,
            opponentMoveSpeedX * deltaSeconds
          );
        const nextY =
          opponent.y +
          clamp(
            targetY - opponent.y,
            -opponentMoveSpeedY * deltaSeconds,
            opponentMoveSpeedY * deltaSeconds
          );
        const nextVx = (nextX - opponent.x) / Math.max(deltaSeconds, 0.001);
        const opponentSwingX = clamp(nextVx / opponentMoveSpeedX, -1, 1);
        const targetTilt = calculateRacketTilt(
          opponentSwingX,
          nextX / 2.56,
          0.52
        );
        const nextTilt = dampRacketTilt(
          opponent.tilt,
          targetTilt,
          deltaSeconds,
          14
        );
        paddlesRef.current.opponent = {
          x: nextX,
          y: nextY,
          z: -2.3,
          vx: nextVx,
          vy: (nextY - opponent.y) / Math.max(deltaSeconds, 0.001),
          vz: 0,
          tilt: nextTilt,
          swingX: opponentSwingX,
        };

        if (
          Math.hypot(
            paddlesRef.current.opponent.vx,
            paddlesRef.current.opponent.vy
          ) > 0.65 &&
          now - lastTrailStampRef.current.opponent > 65
        ) {
          trailsRef.current.opponent.push({
            ...paddlesRef.current.opponent,
            createdAt: now,
          });
          trailsRef.current.opponent = trailsRef.current.opponent.slice(-12);
          lastTrailStampRef.current.opponent = now;
        }
      }

      if (ball.servePhase === "waiting") {
        // Hold the local serve visibly above the paddle until a deliberate
        // horizontal gesture supplies both its aim and launch power.
        ball.x = clamp(paddlesRef.current.local.x * 0.3, -0.72, 0.72);
        ball.y = 0.48;
        ball.z = 2.16;
        ball.vx = 0;
        ball.vy = 0;
        ball.vz = 0;
        return;
      }

      // Regulation serve animation: the ball rises straight up more than six
      // inches before an automatic strike on the way down.
      if (ball.servePhase === "toss" && ball.vy < 0 && ball.y <= 0.57) {
        const server = rallyRef.current.server;
        ball.servePhase = "flight";
        ball.vy =
          server === "local"
            ? clamp(
                -1.45 -
                  ball.servePower * 0.38 +
                  ball.serveVertical * 0.08,
                -1.9,
                -1.35
              )
            : -1.6;
        const aim =
          server === "local" ? ball.serveAimX : opponentServeAimRef.current;
        if (server === "opponent") {
          // Serving is an authored strike rather than a swept collision, so
          // explicitly put the red racket's face center behind the descending
          // ball at the instant of contact.
          const opponentPaddle = paddlesRef.current.opponent;
          opponentPaddle.x = ball.x;
          opponentPaddle.y = ball.y;
          opponentPaddle.vx = 0;
          opponentPaddle.vy = 0;
        }
        ball.spin =
          server === "local"
            ? clamp(ball.serveAimX * 0.32 + ball.serveTwistSpin, -7.2, 7.2)
            : aim * 0.28;
        const targetSecondBounceX = isDoubles
          ? server === "local"
            ? -0.68
            : 0.68
          : clamp(aim * 1.02, -1.08, 1.08);
        const targetSecondBounceZ =
          server === "local" ? -1.58 - ball.servePower * 0.14 : 1.78;
        const serveVelocity = solveServeLandingVelocity(
          ball,
          targetSecondBounceX,
          targetSecondBounceZ,
          TABLE_HEIGHT,
          BALL_RADIUS,
          GRAVITY,
          TABLE_RESTITUTION
        );
        ball.vx = serveVelocity?.vx ?? aim * 0.72;
        ball.vz = serveVelocity?.vz ?? (server === "local" ? -3.85 : 3.85);
        setStatus(server === "local" ? "Your serve" : "Opponent serves");
      }

      const previousPosition: Vector3 = {
        x: ball.x,
        y: ball.y,
        z: ball.z,
      };
      const spinStep = applySideSpin(ball.vx, ball.spin, deltaSeconds);
      ball.vx = clamp(spinStep.vx, -5.8, 5.8);
      ball.spin = spinStep.spin;
      ball.vy += GRAVITY * deltaSeconds;
      ball.x += ball.vx * deltaSeconds;
      ball.y += ball.vy * deltaSeconds;
      ball.z += ball.vz * deltaSeconds;

      const finiteBallState = [
        ball.x,
        ball.y,
        ball.z,
        ball.vx,
        ball.vy,
        ball.vz,
        ball.spin,
      ].every(Number.isFinite);
      if (!finiteBallState) {
        scorePoint(
          oppositeSide(rallyRef.current.lastHitBy),
          "Invalid ball state — rally recovered"
        );
        return;
      }

      const currentBallSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);
      // The waiting-serve branch returned above, so any stationary ball here
      // is an unintended physics stall.
      if (currentBallSpeed < 0.08) {
        stalledBallSinceRef.current ||= now;
        if (now - stalledBallSinceRef.current > 650) {
          scorePoint(
            oppositeSide(rallyRef.current.lastHitBy),
            "Stalled ball — rally recovered"
          );
          return;
        }
      } else {
        stalledBallSinceRef.current = 0;
      }

      const netImpact = ball.netStopped
        ? null
        : sweepSphereAgainstNet(previousPosition, ball, {
            z: NET_Z,
            halfWidth: TABLE_HALF_WIDTH,
            height: NET_HEIGHT,
            tableHeight: TABLE_HEIGHT,
            ballRadius: BALL_RADIUS,
          });
      if (netImpact) {
        const hitTopTape =
          netImpact.y + BALL_RADIUS >= NET_HEIGHT - NET_TAPE_THICKNESS;
        const rally = rallyRef.current;

        if (hitTopTape) {
          // A genuine top-tape graze may trickle over in a rally. On serve it
          // becomes a let only after the two otherwise-legal table bounces.
          ball.x = netImpact.x;
          ball.y = netImpact.y;
          ball.z = NET_Z - netImpact.approachSide * (BALL_RADIUS + 0.008);
          ball.vx *= 0.88;
          ball.vz *= 0.48;
          ball.spin *= 0.55;
          ball.vy = Math.max(ball.vy, 0.18);
          if (rally.isServe) rally.serveTouchedNet = true;
          setStatus(rally.isServe ? "Net cord — possible let" : "Tape clip");
        } else {
          // The mesh absorbs almost all forward energy. Keep the ball on the
          // hitter's side, disable paddle contact and let gravity drop it.
          ball.netStopped = true;
          ball.x = netImpact.x;
          ball.y = netImpact.y;
          ball.z = NET_Z + netImpact.approachSide * (BALL_RADIUS + 0.008);
          ball.vx *= 0.16;
          ball.vz = 0;
          ball.spin = 0;
          ball.vy = Math.min(ball.vy * 0.18, -0.45);
          setStatus("Net fault — ball stopped");
        }
      }

      const crossedNet =
        !ball.netStopped &&
        (previousPosition.z - NET_Z) * (ball.z - NET_Z) <= 0 &&
        previousPosition.z !== ball.z;

      if (crossedNet && !ball.netStopped) {
        const receiver = oppositeSide(rallyRef.current.lastHitBy);
        const landing = predictTableLanding(
          ball,
          TABLE_HEIGHT,
          BALL_RADIUS,
          GRAVITY
        );
        const landsOnReceiverSide = landing
          ? receiver === "local"
            ? landing.z >= NET_Z
            : landing.z < NET_Z
          : false;
        if (
          landing &&
          landsOnReceiverSide &&
          Math.abs(landing.x) <= TABLE_HALF_WIDTH &&
          Math.abs(landing.z) <= TABLE_HALF_LENGTH
        ) {
          assistWindowsRef.current[receiver] = {
            expiresAt: now + 1400,
            landingX: landing.x,
          };
        }
      }

      // If extreme spin brings a valid shot back over the net untouched after
      // landing on the receiver's side, the original hitter wins the point.
      const rallyAfterNet = rallyRef.current;
      const returningToHitter =
        rallyAfterNet.lastHitBy === "local" ? ball.vz > 0 : ball.vz < 0;
      if (
        crossedNet &&
        !rallyAfterNet.isServe &&
        rallyAfterNet.validBounce &&
        rallyAfterNet.lastBounceSide ===
          oppositeSide(rallyAfterNet.lastHitBy) &&
        returningToHitter
      ) {
        scorePoint(
          rallyAfterNet.lastHitBy,
          "Untouched spin return — point won"
        );
        return;
      }

      const overTable =
        Math.abs(ball.x) <= TABLE_HALF_WIDTH &&
        Math.abs(ball.z) <= TABLE_HALF_LENGTH;
      if (overTable && ball.y - BALL_RADIUS <= TABLE_HEIGHT && ball.vy < 0) {
        ball.y = TABLE_HEIGHT + BALL_RADIUS;
        if (ball.netStopped) {
          // Preserve a small natural table rebound after the fault is called.
          ball.vx *= 0.4;
          ball.vy = Math.max(Math.abs(ball.vy) * 0.45, 0.34);
          ball.vz = 0;
          ball.netStopped = false;
          scorePoint(
            oppositeSide(rallyRef.current.lastHitBy),
            "Net fault — ball stopped"
          );
          return;
        }
        ball.vy = Math.abs(ball.vy) * TABLE_RESTITUTION;
        ball.vx *= 0.992;
        ball.vz *= 0.994;
        ball.spin *= 0.86;

        const bounceSide: Side = ball.z >= NET_Z ? "local" : "opponent";
        const previousRally = rallyRef.current;
        const bounceResult = resolveTableBounce(previousRally, bounceSide, {
          isDoubles,
          ballX: ball.x,
        });
        rallyRef.current = bounceResult.rally;

        if (bounceResult.kind === "POINT") {
          const reason =
            bounceResult.reason === "DOUBLE_BOUNCE"
              ? bounceSide === "local"
                ? "Double bounce — opponent scores"
                : "Double bounce — you score"
              : bounceResult.reason === "BAD_DOUBLES_COURT"
              ? "Doubles serve missed the right court"
              : bounceResult.reason === "WRONG_SIDE"
              ? "Shot bounced on the hitter's side"
              : "Illegal serve — wrong table bounce";
          scorePoint(bounceResult.winner, reason);
          return;
        }

        if (bounceResult.kind === "LET") {
          roundLockedRef.current = true;
          ball.deadAt = now;
          setStatus("Let serve — replay");
          if (serveTimerRef.current !== null) {
            window.clearTimeout(serveTimerRef.current);
          }
          const server = bounceResult.rally.server;
          serveTimerRef.current = window.setTimeout(() => {
            resetRound(server);
          }, 1350);
          return;
        }

        if (bounceResult.rally.phase === "SERVE_RECEIVER_BOUNCE") {
          setStatus("Serve bounced on server side");
        } else if (
          previousRally.isServe &&
          bounceResult.rally.phase === "RALLY_RETURN"
        ) {
          ball.servePhase = null;
          setStatus(
            bounceSide === "local"
              ? "Valid serve — return it!"
              : "Valid serve"
          );
        } else if (bounceResult.rally.phase === "RALLY_RETURN") {
          setStatus(
            bounceSide === "local" ? "Your bounce — return it!" : "Valid shot"
          );
        }
      }

      // Resolve the table first. If a ball reaches the tabletop and racket in
      // the same physics step, the bounce must make the return legal before
      // paddle contact is evaluated.
      const localHit = tryPaddleCollision(
        "local",
        previousPosition,
        ball,
        previousPaddles.local,
        paddlesRef.current.local,
        now,
        localAssistActive
      );
      if (localHit || roundLockedRef.current) return;

      const opponentHit = tryPaddleCollision(
        "opponent",
        previousPosition,
        ball,
        previousPaddles.opponent,
        paddlesRef.current.opponent,
        now,
        Boolean(
          assistWindowsRef.current.opponent &&
            now < assistWindowsRef.current.opponent!.expiresAt
        )
      );
      if (opponentHit || roundLockedRef.current) return;

      const outsidePlayVolume =
        Math.abs(ball.x) > TABLE_HALF_WIDTH + 1.0 ||
        Math.abs(ball.z) > TABLE_HALF_LENGTH + 1.15 ||
        ball.y < -1.25;
      if (outsidePlayVolume) {
        const lastHitter = rallyRef.current.lastHitBy;
        const winner = rallyRef.current.validBounce
          ? lastHitter
          : oppositeSide(lastHitter);
        scorePoint(
          winner,
          rallyRef.current.validBounce
            ? winner === "local"
              ? "Opponent misses — you score"
              : "You miss — opponent scores"
            : "Out without a valid table bounce"
        );
      }
    };

    const staticLayer = document.createElement("canvas");
    const staticContext = staticLayer.getContext("2d");
    let staticLayerHasLogo = false;

    const rebuildStaticLayer = (
      width: number,
      height: number,
      pixelWidth: number,
      pixelHeight: number
    ) => {
      if (!staticContext) return;
      const logo = boardLogoRef.current;
      const logoReady = Boolean(logo?.complete && logo.naturalWidth > 0);
      const sizeChanged =
        staticLayer.width !== pixelWidth || staticLayer.height !== pixelHeight;
      if (!sizeChanged && (staticLayerHasLogo || !logoReady)) {
        return;
      }

      context.clearRect(0, 0, width, height);
      drawArena(width, height);
      drawTable(width, height);

      staticLayer.width = pixelWidth;
      staticLayer.height = pixelHeight;
      staticContext.setTransform(1, 0, 0, 1, 0, 0);
      staticContext.clearRect(0, 0, pixelWidth, pixelHeight);
      staticContext.drawImage(canvas, 0, 0);
      staticLayerHasLogo = logoReady;
    };

    const renderFrame = (now: number) => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      // A 1.25x backing store keeps canvas animation at a stable 60fps on
      // iPhones without making the GPU paint four times as many pixels.
      const density = Math.min(window.devicePixelRatio || 1, 1.25);
      const pixelWidth = Math.round(width * density);
      const pixelHeight = Math.round(height * density);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(density, 0, 0, density, 0, 0);
      rebuildStaticLayer(width, height, pixelWidth, pixelHeight);

      const previousFrame = lastFrameRef.current ?? now;
      const deltaSeconds = Math.min((now - previousFrame) / 1000, 0.05);
      lastFrameRef.current = now;
      if (!isNetworkReplica) {
        const physicsSteps = Math.max(1, Math.ceil(deltaSeconds / (1 / 120)));
        const physicsDelta = deltaSeconds / physicsSteps;
        for (let step = 0; step < physicsSteps; step += 1) {
          updatePhysics(physicsDelta, now);
        }
      } else {
        // Keep the locally controlled racket immediate between snapshots.
        const local = paddlesRef.current.local;
        const target = localPaddleTargetRef.current;
        const follow = 1 - Math.exp(-30 * deltaSeconds);
        paddlesRef.current.local = {
          ...local,
          x: local.x + (target.x - local.x) * follow,
          y: local.y + (target.y - local.y) * follow,
          z: local.z + (target.z - local.z) * follow,
          tilt: dampRacketTilt(local.tilt, target.tilt, deltaSeconds),
          swingX: dampRacketTilt(local.swingX, target.swingX, deltaSeconds, 14),
          vx: (target.x - local.x) / Math.max(deltaSeconds, 0.001),
          vy: (target.y - local.y) / Math.max(deltaSeconds, 0.001),
          vz: (target.z - local.z) / Math.max(deltaSeconds, 0.001),
        };
        const replicaTarget = networkReplicaTargetRef.current;
        if (replicaTarget) {
          // Exponential interpolation absorbs packet jitter without adding a
          // fixed frame delay. The ball remains fluid at the display refresh
          // rate even though network snapshots arrive only 20 times/second.
          const blend = 1 - Math.exp(-24 * deltaSeconds);
          const ball = ballRef.current;
          const targetBall = replicaTarget.ball;
          ball.x += (targetBall.x - ball.x) * blend;
          ball.y += (targetBall.y - ball.y) * blend;
          ball.z += (targetBall.z - ball.z) * blend;
          ball.vx += (targetBall.vx - ball.vx) * blend;
          ball.vy += (targetBall.vy - ball.vy) * blend;
          ball.vz += (targetBall.vz - ball.vz) * blend;
          ball.spin += (targetBall.spin - ball.spin) * blend;
          ball.active = targetBall.active;
          ball.netStopped = targetBall.netStopped;
          ball.servePhase = targetBall.servePhase;
          ball.serveAimX = targetBall.serveAimX;
          ball.serveTwistSpin = targetBall.serveTwistSpin;
          ball.servePower = targetBall.servePower;
          ball.serveVertical = targetBall.serveVertical;
          ball.deadAt = targetBall.deadAt;

          const remote = paddlesRef.current.opponent;
          const targetRemote = replicaTarget.opponent;
          paddlesRef.current.opponent = {
            x: remote.x + (targetRemote.x - remote.x) * blend,
            y: remote.y + (targetRemote.y - remote.y) * blend,
            z: remote.z + (targetRemote.z - remote.z) * blend,
            vx: remote.vx + (targetRemote.vx - remote.vx) * blend,
            vy: remote.vy + (targetRemote.vy - remote.vy) * blend,
            vz: remote.vz + (targetRemote.vz - remote.vz) * blend,
            tilt: remote.tilt + (targetRemote.tilt - remote.tilt) * blend,
            swingX: remote.swingX + (targetRemote.swingX - remote.swingX) * blend,
          };
        }
      }

      if (isSimulationAuthority && now - lastNetworkSnapshotRef.current >= NETWORK_SNAPSHOT_INTERVAL_MS) {
        publishAuthoritativeSnapshot();
        lastNetworkSnapshotRef.current = now;
      }

      context.clearRect(0, 0, width, height);
      if (staticContext) {
        context.drawImage(staticLayer, 0, 0, width, height);
      } else {
        drawArena(width, height);
        drawTable(width, height);
      }
      drawTrail("opponent", width, height, now);
      drawPaddle("opponent", paddlesRef.current.opponent, width, height);
      drawBall(width, height);
      drawTrail("local", width, height, now);
      drawPaddle("local", paddlesRef.current.local, width, height);

      // Canvas owns motion. React only needs occasional telemetry updates;
      // frequent whole-tree renders were the main native-frame-rate drop.
      if (now - lastStatePublishRef.current > 500) {
        setBallPosition({ ...ballRef.current });
        setPaddlePositions({
          local: { ...paddlesRef.current.local },
          opponent: { ...paddlesRef.current.opponent },
        });
        lastStatePublishRef.current = now;
      }

      frameRef.current = window.requestAnimationFrame(renderFrame);
    };

    frameRef.current = window.requestAnimationFrame(renderFrame);
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      lastFrameRef.current = null;
    };
  }, [broadcastBallHit, currentUserId, isDoubles, isNetworkMatch, isNetworkReplica, isSimulationAuthority, publishAuthoritativeSnapshot, resetRound, scorePoint]);

  const localName = getPlayerName(localPlayer, "You");
  const opponentName = getPlayerName(opponentPlayer, "Opponent");
  const winnerPlayer =
    gameWinner === "local"
      ? localPlayer
      : gameWinner === "opponent"
      ? opponentPlayer
      : undefined;
  const winnerName =
    gameWinner === "local"
      ? localName
      : gameWinner === "opponent"
      ? opponentName
      : "";
  const winnerAvatarUrl = getAvatarUrl(winnerPlayer);
  const ballSpeed = Math.hypot(
    ballPosition.vx,
    ballPosition.vy,
    ballPosition.vz
  );
  const handleBack = () => {
    if (onClose) {
      onClose();
      return;
    }
    window.history.back();
  };

  return (
    <section className="relative h-[100dvh] min-h-[560px] w-full overflow-hidden bg-[#153796] text-white">
      <canvas
        ref={canvasRef}
        aria-label="London perspective table tennis arena"
        className="absolute inset-0 z-10 size-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Native game navigation header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 border-b border-white/15 bg-[#073d74]/90 pt-[var(--app-safe-top)] shadow-lg backdrop-blur-xl">
        <div className="relative mx-auto flex h-14 max-w-2xl items-center px-3">
          <button
            type="button"
            onClick={handleBack}
            className="pointer-events-auto flex h-10 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-white/20 active:scale-95"
            aria-label="Back to arcade"
          >
            <svg
              aria-hidden="true"
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 text-center">
            <h1 className="whitespace-nowrap text-sm font-black uppercase tracking-[0.22em] text-white">
              Ping Pong
            </h1>
            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.28em] text-cyan-200">
              Joe Yoke Arena
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="pointer-events-auto ml-auto grid size-10 place-items-center rounded-full border border-[#ccff00]/70 bg-[#ccff00]/10 text-[#ccff00] shadow-[0_0_18px_rgba(204,255,0,0.18)] transition hover:bg-[#ccff00]/20 active:scale-95"
            aria-label="How to play Ping Pong"
          >
            <span className="text-lg font-black" aria-hidden="true">?</span>
          </button>
        </div>
      </header>

      {/* Scoreboard overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--app-safe-top)+3.5rem)] z-20 bg-gradient-to-b from-[#052e61]/75 via-[#063969]/25 to-transparent px-3 pb-10 pt-3 sm:px-6">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5 sm:gap-3">
          <div className="flex min-w-0 flex-col items-center">
            <Avatar player={localPlayer} fallback="You" accent="#22d3ee" />
            <p className="mt-1 w-full break-words text-center text-[clamp(10px,3vw,14px)] font-extrabold leading-[1.05] [overflow-wrap:anywhere]">
              {localName}
            </p>
            <span
              className={`mt-1 size-1.5 rounded-full ${
                matchState.currentServer === "player1"
                  ? "bg-cyan-300 shadow-[0_0_8px_#67e8f9]"
                  : "bg-white/20"
              }`}
              aria-label={
                matchState.currentServer === "player1"
                  ? `${localName} is serving`
                  : undefined
              }
            />
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <div className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-[#071018]/85 px-2.5 py-1.5 shadow-2xl backdrop-blur-xl sm:gap-3 sm:px-5">
              <span className="min-w-7 text-center text-3xl font-black leading-none tabular-nums sm:text-4xl">
                {score.local}
              </span>
              <span className="relative block h-9 w-5" aria-hidden="true">
                <span className="absolute left-2 top-0 h-5 w-1 -skew-x-[28deg] bg-amber-300 shadow-[0_0_12px_#facc15]" />
                <span className="absolute bottom-0 right-2 h-5 w-1 -skew-x-[28deg] bg-amber-300 shadow-[0_0_12px_#facc15]" />
              </span>
              <span className="min-w-7 text-center text-3xl font-black leading-none tabular-nums sm:text-4xl">
                {score.opponent}
              </span>
            </div>
            <p className="mt-1.5 max-w-32 rounded-xl bg-black/45 px-2 py-1 text-center text-[7px] font-black uppercase leading-tight tracking-[0.11em] text-white/75 backdrop-blur-md">
              Game {matchState.currentGameNumber} · {matchState.player1GamesWon}
              –{matchState.player2GamesWon}
            </p>
          </div>

          <div className="flex min-w-0 flex-col items-center">
            <Avatar
              player={opponentPlayer}
              fallback="Opponent"
              accent="#fb3155"
            />
            <p className="mt-1 w-full break-words text-center text-[clamp(10px,3vw,14px)] font-extrabold leading-[1.05] [overflow-wrap:anywhere]">
              {opponentName}
            </p>
            <span
              className={`mt-1 size-1.5 rounded-full ${
                matchState.currentServer === "player2"
                  ? "bg-rose-300 shadow-[0_0_8px_#fda4af]"
                  : "bg-white/20"
              }`}
              aria-label={
                matchState.currentServer === "player2"
                  ? `${opponentName} is serving`
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Quick reactions inspired by the reference game's emoji strip. */}
      <div
        className="absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4rem)] left-3 z-30 flex items-center rounded-full border border-white/15 bg-[#08152d]/85 p-1 shadow-2xl backdrop-blur-md"
        aria-label="Match reactions"
      >
        {REACTIONS.map((reaction) => (
          <button
            key={reaction.label}
            type="button"
            onClick={() => sendReaction(reaction.emoji)}
            className="grid size-9 place-items-center rounded-full text-xl transition hover:bg-white/10 active:scale-75"
            aria-label={`Send ${reaction.label} reaction`}
          >
            {reaction.emoji}
          </button>
        ))}
      </div>

      {activeReaction && (
        <div
          key={activeReaction.id}
          className="pointer-events-none absolute bottom-32 left-1/2 z-30 -translate-x-1/2 animate-bounce rounded-full border border-white/20 bg-[#08152d]/90 px-4 py-2 text-4xl shadow-2xl"
          aria-live="polite"
        >
          {activeReaction.emoji}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/35 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16">
        <div className="mx-auto flex max-w-xl items-end gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">
              {status}
            </p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/45">
              Ball {ballSpeed.toFixed(1)} m/s · Paddle{" "}
              {paddlePositions.local.x >= 0 ? "+" : ""}
              {paddlePositions.local.x.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      {gameWinner && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] border border-white/15 bg-[#071018]/95 p-7 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.32em] text-amber-300">
              Match complete
            </p>
            <div className="mt-5 flex justify-center">
              <div
                className="grid size-20 place-items-center overflow-hidden rounded-full border-4 border-[#ccff00] bg-black bg-cover bg-center text-xl font-black text-white shadow-[0_0_30px_rgba(204,255,0,0.28)]"
                style={{
                  backgroundImage: winnerAvatarUrl
                    ? `url("${winnerAvatarUrl}")`
                    : undefined,
                }}
                aria-label={`${winnerName} winner profile`}
              >
                {!winnerAvatarUrl && winnerName.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.25em] text-[#ccff00]">
              Winner
            </p>
            <h2 className="mt-3 text-3xl font-black">{winnerName} wins!</h2>
            <p className="mt-2 text-sm text-white/55">
              Match {matchState.player1GamesWon}–{matchState.player2GamesWon} ·
              Final game {score.local}–{score.opponent}
            </p>
            <button
              type="button"
              onClick={handleBack}
              className="mt-6 w-full rounded-2xl bg-[#ccff00] px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-black transition active:scale-[0.98]"
            >
              Back to arcade
            </button>
          </div>
        </div>
      )}

      {showRules && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ping-pong-rules-title"
        >
          <div className="max-h-[82dvh] w-full max-w-md overflow-y-auto rounded-[2rem] border-2 border-[#ccff00]/75 bg-[#091526] p-5 shadow-[0_0_42px_rgba(204,255,0,0.16)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-full border-2 border-[#ccff00] bg-[#ccff00]/10 text-2xl font-black text-[#ccff00]">?</div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#ccff00]">Ping Pong</p>
                  <h2 id="ping-pong-rules-title" className="text-2xl font-black">How to play</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="grid size-10 place-items-center rounded-full bg-white/10 text-xl font-bold text-white transition hover:bg-white/20"
                aria-label="Close rules"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              {[
                ["🏆", "Score & serve", "Score 11 points and lead by two to win. Serve changes every two points, then every point from 10–10."],
                ["🎾", "Start a legal serve", "Swipe to toss and strike. The ball must bounce on your side first, then on the receiver’s side."],
                ["↩", "Bounce, then return", "Do not volley. Let the ball bounce once on your side, then swipe your racket to return it."],
                ["⚡", "Aim, pace & spin", "Swipe left or right to aim. A fast up/down swipe adds pace; a circular stroke adds twist spin."],
                ["⚠", "Win points", "Two bounces, an out ball, a wrong-side bounce, or a net fault gives the point away. A net-touching legal serve is replayed."],
              ].map(([icon, title, description]) => (
                <div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/25 text-xl" aria-hidden="true">
                    {icon}
                  </div>
                  <div>
                    <h3 className="font-black text-[#f7df73]">{title}</h3>
                    <p className="mt-1 leading-relaxed text-white/70">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showMatchmaker && (
        <MatchmakingModal
          gameKey="ping-pong"
          gameName="Ping Pong"
          userId={currentUserId}
          fallbackAfterMs={45_000}
          onMatchFound={(matchData) => {
            setMatchedSession({
              matchId: matchData.matchId,
              opponent: matchData.opponent,
            });
            matchReadyRef.current = true;
            setIsMatchReady(true);
            setShowMatchmaker(false);
            setStatus(
              matchData.opponent.isBot
                ? "No player found — arena bot joined"
                : `${matchData.opponent.name} joined the arena`
            );
          }}
          onCancel={handleBack}
        />
      )}
    </section>
  );
}
