"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MatchmakingModal from "../MatchmakingModal";
import { JoeYokeEngine } from "../../lib/backendEngine";
import {
  processGameEntry,
  recordMatchResult,
} from "../../lib/matchManager";
import { supabase } from "../../lib/supabaseClient";

type Player = "player1" | "player2";
type MatchPhase = "regulation" | "suddenDeath" | "finished";
type ShotOutcome = "goal" | "saved" | "post" | "miss";
type DiveDirection = "left" | "center" | "right";
type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface OpponentProfile {
  name: string;
  isBot: boolean;
  avatarIcon?: string;
  elo?: number;
}

export interface FootballClashProps {
  onClose?: () => void;
  /** The platform currently calls this preloadedMatchId in its native games. */
  preloadedMatchId?: string | null;
  /** Alias for hosts that expose matchId directly. */
  matchId?: string | null;
  opponent?: OpponentProfile | null;
  /** Pass the 1/2 role returned by MatchmakingModal when the host keeps it. */
  role?: 1 | 2;
}

interface WindState {
  direction: -1 | 1;
  speed: number;
}

interface GoalkeeperState {
  reflex: number;
  anticipation: DiveDirection;
}

interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
}

interface ShotRecord {
  id: string;
  player: Player;
  round: number;
  outcome: ShotOutcome;
  zone: string;
  power: number;
  curve: number;
  targetX: number;
  targetY: number;
  goalieDiveDirection: DiveDirection;
  trajectory: TrajectoryPoint[];
}

interface FootballGameState {
  schemaVersion: 1;
  gameKey: typeof GAME_KEY;
  matchId: string;
  revision: number;
  phase: MatchPhase;
  round: number;
  currentTurn: Player;
  playerIds: Record<Player, string | null>;
  scores: Record<Player, number>;
  attempts: Record<Player, ShotOutcome[]>;
  wind: WindState;
  goalkeeper: GoalkeeperState;
  lastShot: ShotRecord | null;
  winner: Player | null;
  updatedAt: string;
}

interface Point {
  x: number;
  y: number;
}

interface SwipeGesture {
  start: Point;
  end: Point;
  durationMs: number;
}

interface AimVisual {
  start: Point;
  current: Point;
}

interface FlightVisual {
  x: number;
  y: number;
  progress: number;
  dive: DiveDirection;
  outcome: ShotOutcome;
}

const GAME_KEY = "football-clash" as const;
const GAME_NAME = "Football Clash";
const CANVAS_WIDTH = 780;
const CANVAS_HEIGHT = 1180;
const BALL_START = { x: CANVAS_WIDTH / 2, y: 1030 };
const GOAL = { x: 88, y: 190, width: 604, height: 330 };
const MIN_SWIPE_DISTANCE = 48;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function otherPlayer(player: Player): Player {
  return player === "player1" ? "player2" : "player1";
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let value = hashString(seed) || 1;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTurnConditions(seed: string): {
  wind: WindState;
  goalkeeper: GoalkeeperState;
} {
  const random = seededRandom(seed);
  const diveOptions: DiveDirection[] = ["left", "center", "right"];
  return {
    wind: {
      direction: random() < 0.5 ? -1 : 1,
      speed: Math.round((0.8 + random() * 7.2) * 10) / 10,
    },
    goalkeeper: {
      reflex: Math.round((0.45 + random() * 0.48) * 100) / 100,
      anticipation: diveOptions[Math.floor(random() * diveOptions.length)],
    },
  };
}

function makeInitialState(
  matchId: string,
  playerIds: Record<Player, string | null>,
): FootballGameState {
  const conditions = makeTurnConditions(`${matchId}:kick:0`);
  return {
    schemaVersion: 1,
    gameKey: GAME_KEY,
    matchId,
    revision: 0,
    phase: "regulation",
    round: 1,
    currentTurn: "player1",
    playerIds,
    scores: { player1: 0, player2: 0 },
    attempts: { player1: [], player2: [] },
    ...conditions,
    lastShot: null,
    winner: null,
    updatedAt: new Date().toISOString(),
  };
}

function isFootballState(value: unknown): value is FootballGameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FootballGameState>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.gameKey === GAME_KEY &&
    typeof candidate.matchId === "string" &&
    typeof candidate.revision === "number" &&
    Boolean(candidate.playerIds) &&
    Boolean(candidate.scores) &&
    Boolean(candidate.attempts)
  );
}

function targetDive(targetX: number): DiveDirection {
  if (targetX < 0.38) return "left";
  if (targetX > 0.62) return "right";
  return "center";
}

function classifyZone(x: number, y: number): string {
  const horizontal = x < 0.3 ? "Left" : x > 0.7 ? "Right" : "Center";
  const vertical = y < 0.35 ? "Top" : y > 0.7 ? "Low" : "Middle";
  if (vertical === "Top" && horizontal !== "Center") return "Top bins";
  return `${vertical} ${horizontal.toLowerCase()}`;
}

function calculateShot(
  game: FootballGameState,
  player: Player,
  gesture: SwipeGesture,
): ShotRecord {
  const dx = gesture.end.x - gesture.start.x;
  const dy = gesture.end.y - gesture.start.y;
  const distance = Math.hypot(dx, dy);
  const seconds = clamp(gesture.durationMs / 1000, 0.12, 1.25);
  const speed = distance / seconds;
  const power = clamp(distance / 430 * 0.68 + speed / 1650 * 0.32, 0, 1);
  const upward = clamp(-dy / 430, -0.2, 1.25);
  const elevation = upward * 0.72 + power * 0.42;
  const baseX = 0.5 + dx / 720;
  const curve = clamp((dx / CANVAS_WIDTH) * (0.18 + power * 0.18), -0.16, 0.16);
  const windOffset = game.wind.direction * game.wind.speed * (0.007 + power * 0.0045);
  const targetX = baseX + curve + windOffset;
  const targetY = 1.08 - elevation;
  const shotNumber = game.attempts[player].length + 1;
  const id = `${game.matchId}:${game.revision + 1}:${player}:${shotNumber}`;
  const random = seededRandom(
    `${id}:${Math.round(dx)}:${Math.round(dy)}:${Math.round(gesture.durationMs)}`,
  );

  const frameDistance = Math.min(
    Math.abs(targetX),
    Math.abs(1 - targetX),
    Math.abs(targetY),
  );
  const outsideGoal = targetX < -0.04 || targetX > 1.04 || targetY < -0.05 || targetY > 1.06;
  const hitsFrame =
    !outsideGoal &&
    (frameDistance < 0.028 || Math.abs(1 - targetY) < 0.025) &&
    random() < 0.82;
  const zone = classifyZone(targetX, targetY);
  const intendedDive = targetDive(targetX);
  const readsShot = random() < game.goalkeeper.reflex * 0.76;
  const goalieDiveDirection = readsShot
    ? intendedDive
    : game.goalkeeper.anticipation;
  const diveMatches = goalieDiveDirection === intendedDive;
  const topCorner = targetY < 0.35 && (targetX < 0.3 || targetX > 0.7);
  const sideZone = targetX < 0.38 || targetX > 0.62;
  let saveChance = topCorner ? 0.12 : sideZone ? 0.32 : 0.66;
  saveChance += game.goalkeeper.reflex * (topCorner ? 0.16 : sideZone ? 0.3 : 0.28);
  if (!diveMatches) saveChance *= intendedDive === "center" ? 0.4 : 0.12;
  if (power > 0.88) saveChance *= 0.78;

  let outcome: ShotOutcome;
  if (outsideGoal) outcome = "miss";
  else if (hitsFrame) outcome = "post";
  else if (random() < saveChance) outcome = "saved";
  else outcome = "goal";

  const trajectory: TrajectoryPoint[] = Array.from({ length: 31 }, (_, index) => {
    const t = index / 30;
    const eased = 1 - (1 - t) ** 1.55;
    const startX = 0.5;
    const startY = 2.52;
    const bend = curve * Math.sin(Math.PI * t) * 1.8;
    const liveWind = windOffset * t * t;
    return {
      // Wind grows quadratically during flight instead of teleporting the
      // impact point sideways at release. The final sample still equals targetX.
      x: startX + (targetX - windOffset - startX) * eased + bend + liveWind,
      y: startY + (targetY - startY) * eased - Math.sin(Math.PI * t) * (0.16 + power * 0.2),
      t,
    };
  });

  return {
    id,
    player,
    round: game.round,
    outcome,
    zone,
    power,
    curve,
    targetX,
    targetY,
    goalieDiveDirection,
    trajectory,
  };
}

function applyShot(game: FootballGameState, shot: ShotRecord): FootballGameState {
  const player = shot.player;
  const nextRevision = game.revision + 1;
  const attempts = {
    ...game.attempts,
    [player]: [...game.attempts[player], shot.outcome],
  };
  const scores = {
    ...game.scores,
    [player]: game.scores[player] + (shot.outcome === "goal" ? 1 : 0),
  };
  let phase = game.phase;
  let round = game.round;
  let currentTurn = otherPlayer(player);
  let winner: Player | null = null;

  if (player === "player2") {
    if (game.phase === "regulation" && game.round < 5) {
      round += 1;
      currentTurn = "player1";
    } else if (game.phase === "regulation") {
      if (scores.player1 === scores.player2) {
        phase = "suddenDeath";
        round += 1;
        currentTurn = "player1";
      } else {
        phase = "finished";
        winner = scores.player1 > scores.player2 ? "player1" : "player2";
      }
    } else if (game.phase === "suddenDeath") {
      if (scores.player1 !== scores.player2) {
        phase = "finished";
        winner = scores.player1 > scores.player2 ? "player1" : "player2";
      } else {
        round += 1;
        currentTurn = "player1";
      }
    }
  }

  const nextConditions = makeTurnConditions(
    `${game.matchId}:kick:${nextRevision}:${currentTurn}`,
  );
  return {
    ...game,
    revision: nextRevision,
    phase,
    round,
    currentTurn,
    attempts,
    scores,
    ...nextConditions,
    lastShot: shot,
    winner,
    updatedAt: new Date().toISOString(),
  };
}

function outcomeLabel(outcome: ShotOutcome): string {
  if (outcome === "goal") return "GOAL!";
  if (outcome === "saved") return "SAVED";
  if (outcome === "post") return "OFF THE WOODWORK";
  return "MISS";
}

function outcomeColor(outcome: ShotOutcome): string {
  if (outcome === "goal") return "bg-lime-300 text-black";
  if (outcome === "saved") return "bg-sky-400 text-slate-950";
  if (outcome === "post") return "bg-amber-400 text-black";
  return "bg-rose-500 text-white";
}

function drawFootball(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation = 0,
) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.shadowColor = "rgba(0,0,0,.45)";
  context.shadowBlur = radius * 0.45;
  context.shadowOffsetY = radius * 0.2;
  context.fillStyle = "#f8fafc";
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.fillStyle = "#111827";
  context.beginPath();
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 0.4;
    const px = Math.cos(angle) * radius * 0.34;
    const py = Math.sin(angle) * radius * 0.34;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fill();
  context.strokeStyle = "rgba(15,23,42,.35)";
  context.lineWidth = Math.max(1, radius * 0.06);
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 0.4;
    context.beginPath();
    context.moveTo(Math.cos(angle) * radius * 0.34, Math.sin(angle) * radius * 0.34);
    context.lineTo(Math.cos(angle) * radius * 0.88, Math.sin(angle) * radius * 0.88);
    context.stroke();
  }
  context.restore();
}

function drawGoalkeeper(
  context: CanvasRenderingContext2D,
  dive: DiveDirection,
  progress: number,
) {
  const direction = dive === "left" ? -1 : dive === "right" ? 1 : 0;
  const diveAmount = Math.sin(clamp(progress * 1.25, 0, 1) * Math.PI * 0.5);
  const x = CANVAS_WIDTH / 2 + direction * 155 * diveAmount;
  const y = GOAL.y + GOAL.height * 0.72 - Math.abs(direction) * 28 * diveAmount;
  const rotation = direction * -0.45 * diveAmount;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.strokeStyle = "#fb923c";
  context.lineCap = "round";
  context.lineWidth = 27;
  context.beginPath();
  context.moveTo(0, -42);
  context.lineTo(direction * 8, 35);
  context.stroke();
  context.lineWidth = 20;
  context.beginPath();
  context.moveTo(-5, -23);
  context.lineTo(-58 - direction * 18, -50 - Math.abs(direction) * 25);
  context.moveTo(5, -23);
  context.lineTo(58 - direction * 18, -50 + Math.abs(direction) * 8);
  context.stroke();
  context.strokeStyle = "#111827";
  context.lineWidth = 22;
  context.beginPath();
  context.moveTo(-4, 30);
  context.lineTo(-35 - direction * 16, 88);
  context.moveTo(4, 30);
  context.lineTo(35 - direction * 16, 88);
  context.stroke();
  context.fillStyle = "#f4c7a1";
  context.beginPath();
  context.arc(0, -82, 29, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#111827";
  context.beginPath();
  context.arc(0, -89, 29, Math.PI, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawScene(
  canvas: HTMLCanvasElement,
  game: FootballGameState | null,
  aim: AimVisual | null,
  flight: FlightVisual | null,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const sky = context.createLinearGradient(0, 0, 0, 570);
  sky.addColorStop(0, "#07111f");
  sky.addColorStop(0.54, "#13304a");
  sky.addColorStop(1, "#21455c");
  context.fillStyle = sky;
  context.fillRect(0, 0, CANVAS_WIDTH, 570);

  context.fillStyle = "#f8fafc";
  for (let index = 0; index < 6; index += 1) {
    const x = 65 + index * 130;
    context.save();
    context.shadowColor = "#dbeafe";
    context.shadowBlur = 28;
    context.fillRect(x, 55, 36, 9);
    context.restore();
  }

  context.fillStyle = "#101923";
  context.fillRect(0, 100, CANVAS_WIDTH, 115);
  const crowdColors = ["#e2e8f0", "#38bdf8", "#fbbf24", "#fb7185", "#94a3b8"];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 35; column += 1) {
      context.fillStyle = crowdColors[(row * 7 + column * 3) % crowdColors.length];
      context.globalAlpha = 0.34 + ((row + column) % 3) * 0.14;
      context.beginPath();
      context.arc(8 + column * 23, 118 + row * 18, 4, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;

  const pitch = context.createLinearGradient(0, 480, 0, CANVAS_HEIGHT);
  pitch.addColorStop(0, "#197340");
  pitch.addColorStop(1, "#07532e");
  context.fillStyle = pitch;
  context.fillRect(0, 470, CANVAS_WIDTH, CANVAS_HEIGHT - 470);
  for (let stripe = 0; stripe < 8; stripe += 1) {
    context.fillStyle = stripe % 2 ? "rgba(255,255,255,.025)" : "rgba(0,0,0,.035)";
    context.beginPath();
    context.moveTo(stripe * 98, CANVAS_HEIGHT);
    context.lineTo(260 + stripe * 34, 470);
    context.lineTo(294 + stripe * 34, 470);
    context.lineTo((stripe + 1) * 98, CANVAS_HEIGHT);
    context.fill();
  }

  context.strokeStyle = "rgba(255,255,255,.82)";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(70, CANVAS_HEIGHT);
  context.lineTo(246, 515);
  context.moveTo(CANVAS_WIDTH - 70, CANVAS_HEIGHT);
  context.lineTo(CANVAS_WIDTH - 246, 515);
  context.stroke();

  context.fillStyle = "rgba(226,232,240,.12)";
  context.fillRect(GOAL.x, GOAL.y, GOAL.width, GOAL.height);
  context.strokeStyle = "rgba(226,232,240,.24)";
  context.lineWidth = 2;
  for (let index = 1; index < 12; index += 1) {
    const x = GOAL.x + (GOAL.width / 12) * index;
    context.beginPath();
    context.moveTo(x, GOAL.y);
    context.lineTo(x, GOAL.y + GOAL.height);
    context.stroke();
  }
  for (let index = 1; index < 7; index += 1) {
    const y = GOAL.y + (GOAL.height / 7) * index;
    context.beginPath();
    context.moveTo(GOAL.x, y);
    context.lineTo(GOAL.x + GOAL.width, y);
    context.stroke();
  }
  context.strokeStyle = "#f8fafc";
  context.lineWidth = 15;
  context.lineJoin = "round";
  context.strokeRect(GOAL.x, GOAL.y, GOAL.width, GOAL.height);

  context.fillStyle = "rgba(163,230,53,.07)";
  context.fillRect(GOAL.x + 8, GOAL.y + 8, GOAL.width * 0.29, GOAL.height * 0.34);
  context.fillRect(
    GOAL.x + GOAL.width * 0.71,
    GOAL.y + 8,
    GOAL.width * 0.29 - 8,
    GOAL.height * 0.34,
  );

  const dive = flight?.dive ?? "center";
  drawGoalkeeper(context, dive, flight?.progress ?? 0);

  if (aim) {
    const dx = aim.current.x - aim.start.x;
    const dy = aim.current.y - aim.start.y;
    const strength = clamp(Math.hypot(dx, dy) / 430, 0, 1);
    context.save();
    context.setLineDash([13, 13]);
    context.strokeStyle = `rgba(190,242,100,${0.48 + strength * 0.45})`;
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(aim.start.x, aim.start.y);
    context.lineTo(aim.current.x, aim.current.y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#bef264";
    context.beginPath();
    context.arc(aim.current.x, aim.current.y, 12 + strength * 8, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  if (flight) {
    const ballX = GOAL.x + flight.x * GOAL.width;
    const ballY = GOAL.y + flight.y * GOAL.height;
    const radius = 34 - flight.progress * 18;
    drawFootball(context, ballX, ballY, radius, flight.progress * 10);
  } else if (!game?.lastShot || game.phase !== "finished") {
    context.fillStyle = "rgba(0,0,0,.2)";
    context.beginPath();
    context.ellipse(BALL_START.x, BALL_START.y + 25, 52, 18, 0, 0, Math.PI * 2);
    context.fill();
    drawFootball(context, BALL_START.x, BALL_START.y, 52);
  }
}

function AttemptDots({ attempts }: { attempts: ShotOutcome[] }) {
  const regulation = Array.from({ length: 5 }, (_, index) => attempts[index]);
  const suddenDeath = attempts.slice(5);
  return (
    <div className="flex min-w-0 items-center gap-1">
      {regulation.map((outcome, index) => (
        <span
          key={index}
          aria-label={outcome ?? `Kick ${index + 1} pending`}
          className={`h-2.5 w-2.5 rounded-full border ${
            outcome === "goal"
              ? "border-lime-300 bg-lime-300"
              : outcome
                ? "border-rose-400 bg-rose-500"
                : "border-white/25 bg-white/5"
          }`}
        />
      ))}
      {suddenDeath.length > 0 && <span className="mx-0.5 h-3 w-px bg-white/20" />}
      {suddenDeath.map((outcome, index) => (
        <span
          key={`sd-${index}`}
          aria-label={`Sudden death ${outcome}`}
          className={`h-2.5 w-2.5 rounded-full ${
            outcome === "goal" ? "bg-lime-300" : "bg-rose-500"
          }`}
        />
      ))}
    </div>
  );
}

function FootballClashLogo({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label="Football Clash ball logo"
    >
      <defs>
        <radialGradient id="football-clash-ball" cx="36%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="72%" stopColor="#e8f7df" />
          <stop offset="100%" stopColor="#a3e635" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="42" fill="url(#football-clash-ball)" stroke="#d9f99d" strokeWidth="3" />
      <path d="m48 31 13 9-5 15H40l-5-15 13-9Z" fill="#07110b" />
      <path d="m48 7 11 8-5 16H42l-5-16 11-8Zm37 25-2 14-17 4-9-12 8-12 20 6ZM75 78l-15 8-11-13 8-14 16 3 2 16ZM21 78l2-16 16-3 8 14-11 13-15-8ZM11 32l20-6 8 12-9 12-17-4-2-14Z" fill="#10251a" />
      <path d="m48 31 1-18M61 40l17-5M56 55l10 15M40 55 30 70M35 40l-17-5" fill="none" stroke="#10251a" strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}

export default function FootballClash({
  onClose,
  preloadedMatchId,
  matchId: suppliedMatchId,
  opponent,
  role: suppliedRole,
}: FootballClashProps) {
  const incomingMatchId = preloadedMatchId ?? suppliedMatchId ?? null;
  const [view, setView] = useState<"menu" | "matchmaking" | "play">(
    incomingMatchId ? "play" : "menu",
  );
  const [activeMatchId, setActiveMatchId] = useState<string | null>(incomingMatchId);
  const [localOpponent, setLocalOpponent] = useState<OpponentProfile | null>(opponent ?? null);
  const [userId, setUserId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("You");
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<Player | null>(
    suppliedRole === 1 ? "player1" : suppliedRole === 2 ? "player2" : null,
  );
  const [matchmakerRole, setMatchmakerRole] = useState<1 | 2 | undefined>(suppliedRole);
  const [game, setGame] = useState<FootballGameState | null>(null);
  const [presenceIds, setPresenceIds] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionState>(
    incomingMatchId ? "connecting" : "idle",
  );
  const [pullComplete, setPullComplete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aim, setAim] = useState<AimVisual | null>(null);
  const [flight, setFlight] = useState<FlightVisual | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<FootballGameState | null>(null);
  const swipeRef = useRef<{ start: Point; startedAt: number; pointerId: number } | null>(null);
  const animatedShotRef = useRef<string | null>(null);
  const recordedRef = useRef(false);

  const isBotMatch = Boolean(
    localOpponent?.isBot || activeMatchId?.startsWith("bot_"),
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    let mounted = true;
    const loadPlayer = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;
      // Guests receive a local-only identity and can immediately test against
      // the bot. Signed-in players still use matchManager for online pairing.
      setUserId(user?.id ?? `guest:${Math.random().toString(36).slice(2)}`);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .maybeSingle();
        if (mounted) setPlayerName(profile?.username?.trim() || "You");
      }
      if (mounted) setAuthReady(true);
    };
    void loadPlayer();
    return () => {
      mounted = false;
    };
  }, []);

  const acceptSnapshot = useCallback((snapshot: FootballGameState) => {
    if (!isFootballState(snapshot)) return;
    setGame((current) => {
      if (current && snapshot.revision < current.revision) return current;
      gameRef.current = snapshot;
      return snapshot;
    });
  }, []);

  const pushSnapshot = useCallback(
    async (snapshot: FootballGameState) => {
      gameRef.current = snapshot;
      setGame(snapshot);
      if (!activeMatchId || !userId || isBotMatch) return;

      // backendEngine is the transport boundary: turns, scores, wind, the full
      // trajectory, and the goalkeeper dive are persisted as one JSON snapshot.
      const result = await JoeYokeEngine.pushGameState({
        gameKey: GAME_KEY,
        matchId: activeMatchId,
        userId,
        state: snapshot,
      });
      if (!result.success) {
        setConnection("error");
        setMessage("Connection interrupted. Retrying your kick...");
        window.setTimeout(() => {
          void JoeYokeEngine.pushGameState({
            gameKey: GAME_KEY,
            matchId: activeMatchId,
            userId,
            state: snapshot,
          });
        }, 800);
      }
    },
    [activeMatchId, isBotMatch, userId],
  );

  useEffect(() => {
    if (view !== "play" || !activeMatchId || !userId || isBotMatch) return;
    let mounted = true;

    // Realtime state and Presence are intentionally encapsulated by
    // backendEngine so this component never depends on Supabase channel types.
    const unsubscribe = JoeYokeEngine.subscribeToGameState<FootballGameState>({
      gameKey: GAME_KEY,
      matchId: activeMatchId,
      userId,
      onState: (snapshot) => {
        if (mounted && snapshot.matchId === activeMatchId) acceptSnapshot(snapshot);
      },
      onPresence: (ids) => {
        if (mounted) setPresenceIds(ids);
      },
      onStatus: (status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") setConnection("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("error");
        }
      },
    });

    void JoeYokeEngine.pullGameState<FootballGameState>(GAME_KEY, activeMatchId).then(
      (snapshot) => {
        if (!mounted) return;
        if (snapshot && isFootballState(snapshot)) acceptSnapshot(snapshot);
        setPullComplete(true);
      },
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [acceptSnapshot, activeMatchId, isBotMatch, userId, view]);

  useEffect(() => {
    if (view !== "play" || !activeMatchId || !userId) return;

    if (isBotMatch && !gameRef.current) {
      const initial = makeInitialState(activeMatchId, {
        player1: userId,
        player2: `bot:${localOpponent?.name ?? "Keeper XI"}`,
      });
      setRole("player1");
      gameRef.current = initial;
      setGame(initial);
      setConnection("connected");
      return;
    }

    if (isBotMatch || !pullComplete) return;
    const current = gameRef.current;
    if (current) {
      if (current.playerIds.player1 === userId) setRole("player1");
      else if (current.playerIds.player2 === userId) setRole("player2");
      else if (matchmakerRole === 2 && !current.playerIds.player2) {
        const joined = {
          ...current,
          revision: current.revision + 1,
          playerIds: { ...current.playerIds, player2: userId },
          updatedAt: new Date().toISOString(),
        };
        setRole("player2");
        void pushSnapshot(joined);
      }
      return;
    }

    if (matchmakerRole === 1) {
      setRole("player1");
      void pushSnapshot(
        makeInitialState(activeMatchId, { player1: userId, player2: null }),
      );
      return;
    }

    // Invitations do not currently pass the matchmaker role through GamePlayer.
    // Presence gives both clients the same sorted IDs, yielding a deterministic
    // role and identical initial state even if both initialize simultaneously.
    const pairedIds = [...new Set([...presenceIds, userId])].sort();
    if (pairedIds.length >= 2) {
      const playerIds = { player1: pairedIds[0], player2: pairedIds[1] };
      setRole(playerIds.player1 === userId ? "player1" : "player2");
      void pushSnapshot(makeInitialState(activeMatchId, playerIds));
    }
  }, [
    activeMatchId,
    isBotMatch,
    localOpponent?.name,
    presenceIds,
    pullComplete,
    pushSnapshot,
    matchmakerRole,
    userId,
    view,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawScene(canvas, game, aim, flight);
  }, [aim, flight, game]);

  useEffect(() => {
    const shot = game?.lastShot;
    if (!shot || animatedShotRef.current === shot.id) return;
    animatedShotRef.current = shot.id;
    setIsAnimating(true);
    const startedAt = performance.now();
    const duration = 720 + (1 - shot.power) * 220;
    let frameId = 0;

    const animate = (now: number) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const scaled = progress * (shot.trajectory.length - 1);
      const lower = Math.floor(scaled);
      const upper = Math.min(shot.trajectory.length - 1, lower + 1);
      const mix = scaled - lower;
      const first = shot.trajectory[lower];
      const second = shot.trajectory[upper];
      setFlight({
        x: first.x + (second.x - first.x) * mix,
        y: first.y + (second.y - first.y) * mix,
        progress,
        dive: shot.goalieDiveDirection,
        outcome: shot.outcome,
      });
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        navigator.vibrate?.(shot.outcome === "goal" ? [22, 35, 50] : 32);
        window.setTimeout(() => {
          setFlight(null);
          setIsAnimating(false);
        }, 580);
      }
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [game?.lastShot]);

  const opponentReady = Boolean(
    isBotMatch || (game?.playerIds.player1 && game?.playerIds.player2),
  );
  const canShoot = Boolean(
    game &&
      role &&
      opponentReady &&
      game.phase !== "finished" &&
      game.currentTurn === role &&
      !isAnimating,
  );

  const executeShot = useCallback(
    (player: Player, gesture: SwipeGesture) => {
      const current = gameRef.current;
      if (!current || current.phase === "finished" || current.currentTurn !== player) return;
      const shot = calculateShot(current, player, gesture);
      setIsAnimating(true);
      navigator.vibrate?.(12);
      void pushSnapshot(applyShot(current, shot));
    },
    [pushSnapshot],
  );

  useEffect(() => {
    if (
      !isBotMatch ||
      !game ||
      game.phase === "finished" ||
      game.currentTurn !== "player2" ||
      isAnimating
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.currentTurn !== "player2") return;
      const random = seededRandom(`${current.matchId}:bot:${current.revision}`);
      const desiredX = 0.12 + random() * 0.76;
      const desiredY = 0.12 + random() * 0.72;
      const windCompensation = current.wind.direction * current.wind.speed * 0.006;
      const dx = (desiredX - 0.5 - windCompensation) * 700 + (random() - 0.5) * 55;
      const powerTarget = 0.68 + random() * 0.26;
      const upward = clamp((1.08 - desiredY - powerTarget * 0.42) / 0.72, 0.25, 1.05);
      executeShot("player2", {
        start: { x: BALL_START.x, y: BALL_START.y },
        end: { x: BALL_START.x + dx, y: BALL_START.y - upward * 430 },
        durationMs: 260 + random() * 220,
      });
    }, 1050 + hashString(`${game.matchId}:${game.revision}`) % 650);
    return () => window.clearTimeout(timer);
  }, [executeShot, game, isAnimating, isBotMatch]);

  useEffect(() => {
    if (!game?.winner || !role || recordedRef.current) return;
    if (isBotMatch && userId?.startsWith("guest:")) return;
    recordedRef.current = true;
    const didWin = game.winner === role;
    // matchManager owns the platform lifecycle/history record. Queue pairing is
    // supplied by MatchmakingModal/preloadedMatchId; backendEngine owns live turns.
    void recordMatchResult({
      game_id: GAME_KEY,
      game_title: GAME_NAME,
      opponent_name: localOpponent?.name ?? "Online Opponent",
      result: didWin ? "Win" : "Loss",
      points_change: 0,
    });
  }, [game?.winner, isBotMatch, localOpponent?.name, role, userId]);

  const pointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canShoot) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromPointer(event);
    swipeRef.current = { start: point, startedAt: performance.now(), pointerId: event.pointerId };
    setAim({ start: point, current: point });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    event.preventDefault();
    setAim({ start: swipe.start, current: pointFromPointer(event) });
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const end = pointFromPointer(event);
    const durationMs = performance.now() - swipe.startedAt;
    swipeRef.current = null;
    setAim(null);
    const distance = Math.hypot(end.x - swipe.start.x, end.y - swipe.start.y);
    if (distance < MIN_SWIPE_DISTANCE || end.y >= swipe.start.y - 18) {
      setMessage("Swipe up toward the goal, then release.");
      window.setTimeout(() => setMessage(null), 1700);
      return;
    }
    if (role) executeShot(role, { start: swipe.start, end, durationMs });
  };

  const cancelPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (swipeRef.current?.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    setAim(null);
  };

  const beginMatchmaking = async () => {
    setMessage(null);
    if (!authReady || !userId) return;

    if (userId.startsWith("guest:")) {
      const testMatchId = `bot_football_clash_${Date.now()}`;
      recordedRef.current = false;
      animatedShotRef.current = null;
      gameRef.current = null;
      setGame(null);
      setPlayerName("Guest Striker");
      setActiveMatchId(testMatchId);
      setRole("player1");
      setMatchmakerRole(1);
      setLocalOpponent({
        name: "Clash Bot",
        isBot: true,
        avatarIcon: "FC",
        elo: 1100,
      });
      setConnection("connected");
      setPullComplete(true);
      setView("play");
      return;
    }

    // Existing games use matchManager for entry validation/ledger setup before
    // handing queue/pairing to MatchmakingModal. Change entryFee here if the
    // Football Clash game record later becomes wagered.
    const entry = await processGameEntry({
      gameTitle: GAME_NAME,
      entryFee: 0,
      opponentName: "Matchmaking Opponent",
    });
    if (!entry.success) {
      setMessage(entry.error ?? "Unable to enter matchmaking.");
      return;
    }
    setView("matchmaking");
  };

  const playerLabels = useMemo(() => {
    if (role === "player2") {
      return {
        player1: localOpponent?.name ?? "Opponent",
        player2: playerName,
      };
    }
    return {
      player1: playerName,
      player2: localOpponent?.name ?? (isBotMatch ? "Clash Bot" : "Opponent"),
    };
  }, [isBotMatch, localOpponent?.name, playerName, role]);

  const statusText = useMemo(() => {
    if (!game) return connection === "error" ? "Connection problem" : "Syncing match...";
    if (!opponentReady) return "Waiting for opponent...";
    if (game.phase === "finished") return "Full time";
    if (isAnimating) return `${playerLabels[game.lastShot?.player ?? game.currentTurn]}'s shot`;
    if (game.currentTurn === role) return "Your turn - swipe to shoot";
    return `${playerLabels[game.currentTurn]} is lining up...`;
  }, [connection, game, isAnimating, opponentReady, playerLabels, role]);

  const isGuest = Boolean(userId?.startsWith("guest:"));

  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] overflow-hidden bg-[#06130d] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(163,230,53,.18),transparent_34%),linear-gradient(160deg,#071b12_0%,#030807_75%)]" />
        <div className="relative flex h-full flex-col items-center justify-center px-6 text-center" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {onClose && (
            <button onClick={onClose} className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-xl active:scale-95" aria-label="Close Football Clash">
              {"\u00d7"}
            </button>
          )}
          <div className="mb-5 grid h-24 w-24 place-items-center rounded-[30px] border border-lime-300/35 bg-lime-300/10 shadow-[0_0_55px_rgba(163,230,53,.2)]">
            <FootballClashLogo className="h-[74px] w-[74px] drop-shadow-[0_10px_24px_rgba(163,230,53,.28)]" />
          </div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.36em] text-lime-300">Five rounds &middot; sudden death</p>
          <h1 className="text-4xl font-black uppercase italic tracking-[-0.05em] sm:text-5xl">Football Clash</h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/55">{isGuest ? "Test every shot instantly against the Clash Bot - no sign-in required." : "Read the wind, swipe for power and curl, and beat the keeper in a live 1v1 shootout."}</p>
          <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-2 text-left">
            {["Swipe up", "Beat the AI", "Score five"].map((label, index) => (
              <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                <span className="text-[10px] font-black text-lime-300">0{index + 1}</span>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-white/75">{label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => void beginMatchmaking()} disabled={!authReady} className="mt-8 w-full max-w-sm rounded-2xl bg-lime-300 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-[#07110b] shadow-[0_14px_45px_rgba(163,230,53,.2)] transition active:scale-[.98] disabled:opacity-50">
            {authReady ? (isGuest ? "Play test match" : "Find opponent") : "Loading player..."}
          </button>
          {message && <p className="mt-4 text-xs font-semibold text-rose-300">{message}</p>}
        </div>
      </div>
    );
  }

  if (view === "matchmaking") {
    return (
      <MatchmakingModal
        gameKey={GAME_KEY}
        gameName={GAME_NAME}
        userId={userId ?? "guest"}
        onCancel={() => setView("menu")}
        onMatchFound={(match) => {
          setActiveMatchId(match.matchId);
          setRole(match.role === 1 ? "player1" : "player2");
          setMatchmakerRole(match.role);
          setLocalOpponent(match.opponent);
          setConnection("connecting");
          setPullComplete(false);
          setView("play");
        }}
      />
    );
  }

  const showingLoader = !authReady || !activeMatchId || !game;
  const lastShot = game?.lastShot ?? null;

  return (
    <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-[#020705] font-sans text-white" style={{ WebkitUserSelect: "none" }}>
      <div className="absolute inset-0 flex justify-center bg-[radial-gradient(circle_at_50%_40%,#173d2a_0%,#020705_68%)]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="Football penalty shootout pitch"
          className={`h-full max-h-full w-full max-w-[660px] ${canShoot ? "cursor-crosshair" : "cursor-default"}`}
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={cancelPointer}
        />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3" style={{ paddingTop: "max(.65rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto flex max-w-[620px] items-center justify-between">
          <button onClick={onClose} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/45 text-xl backdrop-blur-md active:scale-95" aria-label="Leave match">{"\u00d7"}</button>
          <div className="rounded-full border border-white/10 bg-black/45 px-4 py-2 text-center backdrop-blur-md">
            <p className="text-[9px] font-black uppercase tracking-[.28em] text-lime-300">{game?.phase === "suddenDeath" ? "Sudden death" : `Round ${game?.round ?? 1} / 5`}</p>
            <p className="mt-0.5 text-[10px] font-bold text-white/70">{statusText}</p>
          </div>
          <div className={`grid h-10 w-10 place-items-center rounded-full border bg-black/45 text-xs backdrop-blur-md ${connection === "error" ? "border-rose-400/60 text-rose-300" : "border-white/15 text-lime-300"}`} aria-label={`Network ${connection}`}>
            {connection === "error" ? "!" : <span className="h-2 w-2 rounded-full bg-lime-300" aria-hidden="true" />}
          </div>
        </div>

        <div className="mx-auto mt-2 grid max-w-[620px] grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-2xl border border-white/12 bg-black/60 shadow-2xl backdrop-blur-xl">
          <div className={`min-w-0 p-3 ${game?.currentTurn === "player1" && game.phase !== "finished" ? "bg-lime-300/10" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lime-300 text-[10px] font-black text-black">{playerLabels.player1.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-wide">{playerLabels.player1}</p>
                <AttemptDots attempts={game?.attempts.player1 ?? []} />
              </div>
            </div>
          </div>
          <div className="grid min-w-20 place-items-center border-x border-white/10 bg-white/[0.025] px-3">
            <span className="text-2xl font-black tabular-nums tracking-tight">{game?.scores.player1 ?? 0}<span className="mx-2 text-white/25">:</span>{game?.scores.player2 ?? 0}</span>
          </div>
          <div className={`min-w-0 p-3 ${game?.currentTurn === "player2" && game.phase !== "finished" ? "bg-sky-400/10" : ""}`}>
            <div className="flex flex-row-reverse items-center gap-2 text-right">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-400 text-[10px] font-black text-slate-950">{playerLabels.player2.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-black uppercase tracking-wide">{playerLabels.player2}</p>
                <AttemptDots attempts={game?.attempts.player2 ?? []} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute left-3 top-[172px] z-10 rounded-2xl border border-white/10 bg-black/48 px-3 py-2 backdrop-blur-md" style={{ top: "calc(max(.65rem, env(safe-area-inset-top)) + 7.7rem)" }}>
        <p className="text-[8px] font-black uppercase tracking-[.24em] text-white/45">Wind</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xl font-black text-sky-300">{game?.wind.direction === -1 ? "\u2190" : "\u2192"}</span>
          <span className="text-xs font-black tabular-nums">{game?.wind.speed.toFixed(1) ?? "-"} <span className="text-[8px] text-white/45">m/s</span></span>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-[172px] z-10 w-28 rounded-2xl border border-white/10 bg-black/48 px-3 py-2 backdrop-blur-md" style={{ top: "calc(max(.65rem, env(safe-area-inset-top)) + 7.7rem)" }}>
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[.16em] text-white/45"><span>Keeper</span><span>{Math.round((game?.goalkeeper.reflex ?? 0) * 100)}%</span></div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${(game?.goalkeeper.reflex ?? 0) * 100}%` }} /></div>
      </div>

      {lastShot && isAnimating && (flight?.progress ?? 0) > 0.82 && (
        <div className={`pointer-events-none absolute left-1/2 top-[43%] z-30 -translate-x-1/2 rounded-full px-5 py-2 text-xs font-black uppercase tracking-[.22em] shadow-2xl ${outcomeColor(lastShot.outcome)}`}>
          {outcomeLabel(lastShot.outcome)}
        </div>
      )}

      {showingLoader && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#030806]/86 px-8 text-center backdrop-blur-sm">
          <div>
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-lime-300" />
            <p className="mt-5 text-xs font-black uppercase tracking-[.25em]">{!authReady ? "Loading player" : !activeMatchId ? "Waiting for match" : "Syncing kickoff"}</p>
            <p className="mt-2 text-[11px] text-white/45">{isBotMatch ? "Preparing your test shootout..." : "Restoring the latest Supabase match snapshot..."}</p>
          </div>
        </div>
      )}

      {!showingLoader && !opponentReady && (
        <div className="pointer-events-none absolute inset-x-5 top-1/2 z-30 -translate-y-1/2 rounded-3xl border border-white/10 bg-black/70 p-6 text-center backdrop-blur-xl">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-lime-300" />
          <p className="mt-4 text-sm font-black uppercase tracking-[.18em]">Waiting for opponent</p>
          <p className="mt-2 text-xs text-white/45">Your match is ready. The shootout begins when both players connect.</p>
        </div>
      )}

      {!showingLoader && opponentReady && game?.phase !== "finished" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 text-center" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className={`mx-auto max-w-sm rounded-2xl border px-4 py-3 backdrop-blur-xl transition ${canShoot ? "border-lime-300/35 bg-lime-300/12" : "border-white/10 bg-black/55"}`}>
            <p className={`text-[10px] font-black uppercase tracking-[.22em] ${canShoot ? "text-lime-300" : "text-white/55"}`}>{canShoot ? <>Touch &middot; swipe up &middot; release</> : statusText}</p>
            {canShoot && <p className="mt-1 text-[9px] text-white/45">Angle controls placement &middot; speed controls power &middot; sideways drag adds curve</p>}
          </div>
        </div>
      )}

      {message && view === "play" && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/80 px-4 py-2 text-[10px] font-bold text-white shadow-xl">{message}</div>
      )}

      {game?.phase === "finished" && game.winner && role && !isAnimating && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/72 px-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[32px] border border-white/12 bg-[#0b1510] p-7 text-center shadow-2xl">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-lime-300 text-black"><FootballClashLogo className="h-12 w-12" /></div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[.3em] text-lime-300">Full time</p>
            <h2 className="mt-2 text-3xl font-black uppercase italic tracking-tight">{game.winner === role ? "You win" : "Opponent wins"}</h2>
            <p className="mt-3 text-sm text-white/50">Final score <span className="ml-1 font-black text-white">{game.scores.player1} - {game.scores.player2}</span></p>
            <button onClick={onClose} className="mt-7 w-full rounded-2xl bg-lime-300 py-4 text-xs font-black uppercase tracking-[.18em] text-black active:scale-[.98]">Back to arcade</button>
          </div>
        </div>
      )}
    </div>
  );
}
