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
} from "@/lib/TableTennisGame";
import {
  applySideSpin,
  calculateRacketTilt,
  calculateSwipeSpin,
  calculateSwipeSteering,
  createPhysicsRally,
  dampRacketTilt,
  predictBallAtZPlane,
  predictTableLanding,
  registerPaddleReturn,
  resolveTableBounce,
  solveRallyLandingVelocity,
  solveServeLandingVelocity,
  sweepSphereAgainstPaddle,
  sweepSphereAgainstNet,
  type PhysicsRallyState,
} from "@/lib/pingPongPhysics";
import { supabase } from "@/lib/supabaseClient";
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
  /** Reports the completed competitive match back to Joe Yoke's wallet, XP,
   * and match-history integration. */
  onResult?: (result: "Win" | "Loss" | "Draw") => void;
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
  value: number;
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

interface TrailPoint extends Vector3 {
  createdAt: number;
}

type Side = "local" | "opponent";
type RacketDirection = "left" | "center" | "right";

interface RacketAssetLayout {
  crop: [x: number, y: number, width: number, height: number];
  /** Face-center anchor within the cropped visible racket. */
  anchor: [x: number, y: number];
  /** Normalizes the visible racket-face diameter across differently cropped PNGs. */
  renderScale: number;
}

type RacketAssetSet = Record<RacketDirection, HTMLImageElement>;
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
  y: 0.58,
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
  const matchId = props.matchId ?? preloadedMatchId ?? "local-ping-pong";
  const currentUserId =
    props.currentUserId ?? providedPlayers?.[0]?.id ?? "local-player";
  const players = useMemo<PingPongPlayer[]>(() => {
    if (providedPlayers?.length) return providedPlayers;
    return [
      { id: currentUserId, username: "You" },
      {
        id: "ping-pong-opponent",
        username: opponent?.name || "Arena Opponent",
      },
    ];
  }, [currentUserId, opponent?.name, providedPlayers]);
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
  const lastTrailStampRef = useRef({ local: 0, opponent: 0 });
  const gameWinnerRef = useRef<Side | null>(null);
  const pointerSampleRef = useRef<{ x: number; at: number } | null>(null);
  const swingIntentRef = useRef<SwingIntent>({ value: 0, expiresAt: 0 });
  const lastPlayerSwipeAtRef = useRef(0);
  const networkChannelRef = useRef<RealtimeChannel | null>(null);
  const networkIdentityRef = useRef<string | null>(null);
  const opponentSeenRef = useRef(false);
  const disconnectForfeitRef = useRef<number | null>(null);
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
  const [activeReaction, setActiveReaction] = useState<{
    emoji: string;
    id: number;
  } | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const isNetworkMatch = Boolean(
    matchId && matchId !== "local-ping-pong" && !matchId.startsWith("bot_") && !opponent?.isBot
  );

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
    let cancelled = false;
    const loadRacketSet = (
      center: string,
      left: string,
      right: string
    ): RacketAssetSet => {
      const createAsset = (source: string) => {
        const image = new Image();
        image.src = source;
        return image;
      };
      return {
        center: createAsset(center),
        left: createAsset(left),
        right: createAsset(right),
      };
    };

    const logo = new Image();
    logo.src = "/joe-yoke-board-logo.png";
    boardLogoRef.current = logo;
    const localAssets = loadRacketSet(
      "/ping-pong-racket-black-center.png",
      "/ping-pong-racket-black-left.png",
      "/ping-pong-racket-black-right.png"
    );
    const opponentAssets = loadRacketSet(
      "/ping-pong-racket-red-center.png",
      "/ping-pong-racket-red-left.png",
      "/ping-pong-racket-red-right.png"
    );
    localRacketAssetsRef.current = localAssets;
    opponentRacketAssetsRef.current = opponentAssets;

    const buildSpriteCache = async () => {
      await Promise.allSettled(
        [...Object.values(localAssets), ...Object.values(opponentAssets)].map(
          (image) => image.decode()
        )
      );
      if (
        cancelled ||
        [...Object.values(localAssets), ...Object.values(opponentAssets)].some(
          (image) => image.naturalWidth <= 0
        )
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
  }, []);

  // Realtime input channel. The existing physics stays local-authoritative for
  // the host; remote paddle/ball snapshots keep the second device in sync.
  // This replaces the handoff source's placeholder extension points.
  const broadcastPaddlePosition = useCallback(
    (position: PaddleState) => {
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
    (position: Vector3 & { tilt?: number; swingX?: number }) => {
      const previous = paddlesRef.current.opponent;
      const nextVx = (position.x - previous.x) * 20;
      const next: PaddleState = {
        x: clamp(position.x, -1.34, 1.34),
        y: clamp(position.y, 0.28, 1.25),
        z: clamp(position.z, -2.55, -1.45),
        vx: nextVx,
        vy: (position.y - previous.y) * 20,
        vz: (position.z - previous.z) * 20,
        tilt: clamp(position.tilt ?? nextVx * 0.06, -0.52, 0.52),
        swingX: clamp(position.swingX ?? nextVx / 4, -1, 1),
      };
      paddlesRef.current.opponent = next;
      opponentNetworkActiveUntilRef.current = performance.now() + 600;
    },
    []
  );

  useEffect(() => {
    if (!isNetworkMatch) return;
    let alive = true;
    const connect = async () => {
      const { data } = await supabase.auth.getUser();
      const identity = data.user?.id ?? currentUserId;
      if (!alive) return;
      networkIdentityRef.current = identity;
      const channel = supabase.channel(`ping-pong-match-${matchId}`, {
        config: { broadcast: { self: false }, presence: { key: identity } },
      });
      networkChannelRef.current = channel;
      channel
        .on("broadcast", { event: "ping_pong_paddle" }, ({ payload }) => onReceiveOpponentMove(payload as Vector3 & { tilt?: number; swingX?: number }))
        .on("broadcast", { event: "ping_pong_ball_hit" }, ({ payload }) => {
          const hit = payload as BallHitPayload;
          ballRef.current = { ...ballRef.current, x: hit.position.x, y: hit.position.y, z: hit.position.z, vx: hit.velocity.x, vy: hit.velocity.y, vz: hit.velocity.z, active: true };
        })
        .on("presence", { event: "sync" }, () => {
          const connected = Object.keys(channel.presenceState()).length > 1;
          setOpponentConnected(connected);
          if (connected) {
            opponentSeenRef.current = true;
            if (disconnectForfeitRef.current) window.clearTimeout(disconnectForfeitRef.current);
            disconnectForfeitRef.current = null;
          } else if (opponentSeenRef.current && !disconnectForfeitRef.current) {
            disconnectForfeitRef.current = window.setTimeout(() => {
              setStatus("Opponent disconnected — you win by forfeit");
              setGameWinner("local");
              gameWinnerRef.current = "local";
              onResult?.("Win");
              disconnectForfeitRef.current = null;
            }, 30_000);
          }
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString() });
        });
    };
    void connect();
    return () => {
      alive = false;
      if (disconnectForfeitRef.current) window.clearTimeout(disconnectForfeitRef.current);
      disconnectForfeitRef.current = null;
      if (networkChannelRef.current) {
        void networkChannelRef.current.untrack();
        void supabase.removeChannel(networkChannelRef.current);
      }
      networkChannelRef.current = null;
    };
  }, [currentUserId, isNetworkMatch, matchId, onReceiveOpponentMove, onResult]);

  const resetRound = useCallback(
    (server: Side) => {
      const nextBall = createServe(server, isDoubles);
      ballRef.current = nextBall;
      rallyRef.current = createPhysicsRally(server);
      if (server === "opponent") {
        opponentServeAimRef.current = createOpponentServeAim();
      }
      opponentReturnAimRef.current = createOpponentReturnAim();
      swingIntentRef.current = { value: 0, expiresAt: 0 };
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
        onResult?.(winner === "local" ? "Win" : "Loss");
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
    [gameEngine, onResult, resetRound]
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
      const now = performance.now();
      const previousSample = pointerSampleRef.current;
      const pointerVelocityX = previousSample
        ? ((normalizedX - previousSample.x) * 1000) /
          Math.max(now - previousSample.at, 8)
        : 0;
      const measuredSwing = clamp(pointerVelocityX / 3.2, -1, 1);
      // Preserve the last deliberate swipe long enough for the incoming ball
      // to reach the racket. Tiny stationary pointer samples must not erase a
      // shot direction selected a fraction of a second earlier.
      if (Math.abs(measuredSwing) >= 0.08) {
        const signedStrength =
          Math.sign(measuredSwing) *
          clamp(0.38 + Math.abs(measuredSwing) * 0.62, 0.38, 1);
        swingIntentRef.current = {
          value: signedStrength,
          expiresAt: now + 650,
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
          ball.serveAimX = signedStrength;
          ball.vx = 0;
          ball.vy = 2.05;
          ball.vz = 0;
          ball.spin = 0;
          setStatus(
            signedStrength < 0
              ? "Toss up — serve aimed left"
              : "Toss up — serve aimed right"
          );
        }
      }
      const swingX =
        now < swingIntentRef.current.expiresAt
          ? swingIntentRef.current.value
          : 0;
      pointerSampleRef.current = { x: normalizedX, at: now };
      // Keep the header area free for navigation while mapping the rest of the
      // screen to the player's half of the table.
      const normalizedY = clamp(
        ((clientY - bounds.top) / bounds.height - 0.16) / 0.84,
        0,
        1
      );
      localPaddleTargetRef.current = {
        x: (normalizedX - 0.5) * 2.7,
        y: 0.32 + (1 - normalizedY) * 0.92,
        z: 1.55 + normalizedY * 0.92,
        tilt: calculateRacketTilt(swingX, normalizedX - 0.5),
        swingX,
      };

      if (now - lastPaddleBroadcastRef.current > 50) {
        broadcastPaddlePosition({
          ...localPaddleTargetRef.current,
          vx: paddlesRef.current.local.vx,
          vy: paddlesRef.current.local.vy,
          vz: paddlesRef.current.local.vz,
        });
        lastPaddleBroadcastRef.current = now;
      }
    },
    [broadcastPaddlePosition]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    pointerSampleRef.current = null;
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

      // Shadowed indoor stadium tiers.
      context.fillStyle = "#11182a";
      context.beginPath();
      context.moveTo(0, height * 0.25);
      context.quadraticCurveTo(
        width * 0.13,
        height * 0.12,
        width * 0.28,
        height * 0.26
      );
      context.quadraticCurveTo(
        width * 0.45,
        height * 0.08,
        width * 0.62,
        height * 0.26
      );
      context.quadraticCurveTo(
        width * 0.78,
        height * 0.13,
        width,
        height * 0.25
      );
      context.lineTo(width, height * 0.43);
      context.lineTo(0, height * 0.43);
      context.closePath();
      context.fill();

      // Dark roof sections and spotlit ceiling panels.
      context.fillStyle = "rgba(8, 11, 20, 0.98)";
      context.beginPath();
      context.moveTo(-width * 0.04, height * 0.12);
      context.quadraticCurveTo(
        width * 0.15,
        height * 0.015,
        width * 0.32,
        height * 0.12
      );
      context.quadraticCurveTo(
        width * 0.22,
        height * 0.18,
        width * 0.02,
        height * 0.19
      );
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(width * 0.27, height * 0.1);
      context.quadraticCurveTo(
        width * 0.5,
        -height * 0.025,
        width * 0.73,
        height * 0.1
      );
      context.quadraticCurveTo(
        width * 0.61,
        height * 0.17,
        width * 0.39,
        height * 0.17
      );
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(width * 0.68, height * 0.12);
      context.quadraticCurveTo(
        width * 0.86,
        height * 0.015,
        width * 1.04,
        height * 0.12
      );
      context.lineTo(width, height * 0.19);
      context.quadraticCurveTo(
        width * 0.82,
        height * 0.18,
        width * 0.68,
        height * 0.12
      );
      context.fill();

      context.strokeStyle = "#354665";
      context.lineWidth = Math.max(3, width * 0.008);
      [0.08, 0.34, 0.66, 0.92].forEach((x) => {
        context.beginPath();
        context.moveTo(width * x, height * 0.1);
        context.lineTo(width * x, height * 0.34);
        context.stroke();
      });

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
      if (side === "local" && now - lastPlayerSwipeAtRef.current > 650) {
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
        (!sweptImpact && (!closeInDepth || !closeToFace))
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
      const latchedLocalSwing =
        side === "local" && now < swingIntentRef.current.expiresAt
          ? swingIntentRef.current.value
          : paddle.swingX;
      const effectiveTilt = calculateRacketTilt(
        latchedLocalSwing,
        paddle.x / (TABLE_HALF_WIDTH * 2)
      );
      const swipeSteering = calculateSwipeSteering(
        latchedLocalSwing,
        effectiveTilt,
        paddle.vx
      );
      ball.spin = calculateSwipeSpin(
        latchedLocalSwing,
        effectiveTilt,
        paddle.vx
      );
      ball.vy = clamp(
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
      const targetLandingZ = side === "local" ? -1.72 : 1.72;
      const landingVelocity = solveRallyLandingVelocity(
        ball,
        clamp(targetLandingX, -1.18, 1.18),
        targetLandingZ,
        TABLE_HEIGHT,
        BALL_RADIUS,
        GRAVITY
      );
      if (landingVelocity) {
        ball.vx = clamp(landingVelocity.vx, -3.4, 3.4);
        ball.vz = clamp(
          landingVelocity.vz,
          side === "local" ? -6.2 : 3.8,
          side === "local" ? -3.8 : 6.2
        );
      } else {
        ball.vx = clamp(swipeSteering * 0.55, -2.4, 2.4);
        ball.vz = side === "local" ? -4.7 : 4.7;
      }
      if (side === "opponent") {
        opponentReturnAimRef.current = createOpponentReturnAim();
      }

      if (side === "local") {
        // Keep the matching directional artwork visible through follow-through
        // without leaking the previous shot into the next rally.
        swingIntentRef.current.expiresAt = now + 180;
      }
      assistWindowsRef.current[side] = null;

      rallyRef.current = nextRally;

      trailsRef.current[side].push({ ...paddle, createdAt: now });
      setStatus(side === "local" ? "Clean return!" : "Opponent returns");

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
          now - lastPlayerSwipeAtRef.current < 600
      );
      const localAssistActive = Boolean(
        localGestureReady &&
          localPrediction &&
          localPrediction.time < 0.55 &&
          localPrediction.y >= 0.22 &&
          localPrediction.y <= 1.36
      );
      const hasLatchedSwing = now < swingIntentRef.current.expiresAt;
      if (hasLatchedSwing) {
        target.swingX = swingIntentRef.current.value;
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
          (clamp(localPrediction!.y, 0.3, 1.18) - target.y) * 0.72
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
      if (now > opponentNetworkActiveUntilRef.current) {
        const opponent = paddlesRef.current.opponent;
        const opponentAssistWindow = assistWindowsRef.current.opponent;
        const opponentPrediction =
          ball.vz < 0 && rallyRef.current.validBounce
            ? predictBallAtZPlane(
                ball,
                opponent.z + BALL_RADIUS,
                GRAVITY
              )
            : null;
        const opponentWindowActive = Boolean(
          opponentAssistWindow && now < opponentAssistWindow.expiresAt
        );
        const opponentAssistActive = Boolean(
          opponentWindowActive &&
            opponentPrediction &&
            opponentPrediction.time < 0.62 &&
            opponentPrediction.y >= 0.22 &&
            opponentPrediction.y <= 1.36
        );
        const targetX =
          ball.vz < 0
            ? clamp(
                opponentAssistActive
                  ? opponentPrediction!.x
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
                0.34,
                1.05
              )
            : 0.58;
        const nextX =
          opponent.x +
          clamp(targetX - opponent.x, -2.5 * deltaSeconds, 2.5 * deltaSeconds);
        const nextY =
          opponent.y +
          clamp(targetY - opponent.y, -1.9 * deltaSeconds, 1.9 * deltaSeconds);
        const nextVx = (nextX - opponent.x) / Math.max(deltaSeconds, 0.001);
        const opponentSwingX = clamp(nextVx / 2.5, -1, 1);
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
        ball.vy = -1.6;
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
          server === "local" ? ball.serveAimX * 0.32 : aim * 0.28;
        const targetSecondBounceX = isDoubles
          ? server === "local"
            ? -0.68
            : 0.68
          : clamp(aim * 1.02, -1.08, 1.08);
        const targetSecondBounceZ = server === "local" ? -1.78 : 1.78;
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
      const density = Math.min(window.devicePixelRatio || 1, 1.5);
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
      const physicsSteps = Math.max(1, Math.ceil(deltaSeconds / (1 / 120)));
      const physicsDelta = deltaSeconds / physicsSteps;
      for (let step = 0; step < physicsSteps; step += 1) {
        updatePhysics(physicsDelta, now);
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

      if (now - lastStatePublishRef.current > 120) {
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
  }, [broadcastBallHit, currentUserId, isDoubles, resetRound, scorePoint]);

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
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 border-b border-white/15 bg-[#073d74]/90 pt-[env(safe-area-inset-top)] shadow-lg backdrop-blur-xl">
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
        </div>
      </header>

      {/* Scoreboard overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 bg-gradient-to-b from-[#052e61]/75 via-[#063969]/25 to-transparent px-3 pb-10 pt-3 sm:px-6">
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
    </section>
  );
}
