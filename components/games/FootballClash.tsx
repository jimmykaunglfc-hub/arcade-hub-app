"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MatchmakingModal from "../MatchmakingModal";
import { JoeYokeEngine } from "../../lib/backendEngine";
import { processGameEntry, recordMatchResult } from "../../lib/matchManager";
import { supabase } from "../../lib/supabaseClient";

type Team = "home" | "away";
type MatchPhase = "ready" | "playing" | "goal" | "finished";
type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface OpponentProfile {
  name: string;
  isBot: boolean;
  avatarIcon?: string;
  elo?: number;
}

export interface FootballClashProps {
  onClose?: () => void;
  preloadedMatchId?: string | null;
  matchId?: string | null;
  opponent?: OpponentProfile | null;
  role?: 1 | 2;
}

interface Vector {
  x: number;
  y: number;
}

interface PlayerDisc extends Vector {
  id: string;
  team: Team;
  number: number;
  vx: number;
  vy: number;
  radius: number;
}

interface BallBody extends Vector {
  vx: number;
  vy: number;
  radius: number;
}

interface FlickAction {
  id: string;
  playerId: string;
  team: Team;
  vx: number;
  vy: number;
}

interface ArenaState {
  schemaVersion: 2;
  gameKey: typeof GAME_KEY;
  matchId: string;
  revision: number;
  phase: MatchPhase;
  currentTurn: Team;
  playerIds: Record<Team, string | null>;
  score: Record<Team, number>;
  players: PlayerDisc[];
  ball: BallBody;
  matchEndsAt: number | null;
  suddenDeath: boolean;
  winner: Team | null;
  lastGoal: Team | null;
  lastAction: FlickAction | null;
  updatedAt: string;
}

interface DragState {
  pointerId: number;
  playerId: string;
  origin: Vector;
  current: Vector;
}

const GAME_KEY = "football-clash" as const;
const GAME_NAME = "Football Clash";
const WIDTH = 720;
const HEIGHT = 1180;
const MATCH_SECONDS = 75;
const PLAYER_RADIUS = 37;
const BALL_RADIUS = 18;
const FIELD = {
  left: 62,
  right: 658,
  top: 116,
  bottom: 1064,
  goalLeft: 245,
  goalRight: 475,
  goalDepth: 58,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const otherTeam = (team: Team): Team => (team === "home" ? "away" : "home");

function formationPlayers(): PlayerDisc[] {
  const create = (
    id: string,
    team: Team,
    number: number,
    x: number,
    y: number,
  ): PlayerDisc => ({
    id,
    team,
    number,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
  });

  return [
    create("home-7", "home", 7, 360, 865),
    create("home-10", "home", 10, 215, 760),
    create("home-11", "home", 11, 505, 760),
    create("away-9", "away", 9, 360, 315),
    create("away-6", "away", 6, 215, 420),
    create("away-8", "away", 8, 505, 420),
  ];
}

function makeInitialState(
  matchId: string,
  playerIds: Record<Team, string | null>,
  active: boolean,
): ArenaState {
  return {
    schemaVersion: 2,
    gameKey: GAME_KEY,
    matchId,
    revision: 0,
    phase: active ? "playing" : "ready",
    currentTurn: "home",
    playerIds,
    score: { home: 0, away: 0 },
    players: formationPlayers(),
    ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, radius: BALL_RADIUS },
    matchEndsAt: active ? Date.now() + MATCH_SECONDS * 1000 : null,
    suddenDeath: false,
    winner: null,
    lastGoal: null,
    lastAction: null,
    updatedAt: new Date().toISOString(),
  };
}

function resetFormation(state: ArenaState, kickoff: Team): ArenaState {
  return {
    ...state,
    revision: state.revision + 1,
    phase: "playing",
    currentTurn: kickoff,
    players: formationPlayers(),
    ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, radius: BALL_RADIUS },
    lastGoal: null,
    lastAction: null,
    updatedAt: new Date().toISOString(),
  };
}

function isArenaState(value: unknown): value is ArenaState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArenaState>;
  return (
    candidate.schemaVersion === 2 &&
    candidate.gameKey === GAME_KEY &&
    typeof candidate.matchId === "string" &&
    typeof candidate.revision === "number" &&
    Array.isArray(candidate.players) &&
    Boolean(candidate.ball) &&
    Boolean(candidate.score)
  );
}

function speed(body: { vx: number; vy: number }): number {
  return Math.hypot(body.vx, body.vy);
}

function hasMotion(state: ArenaState): boolean {
  return speed(state.ball) > 0.08 || state.players.some((player) => speed(player) > 0.08);
}

function stopBodies(state: ArenaState): ArenaState {
  return {
    ...state,
    players: state.players.map((player) => ({ ...player, vx: 0, vy: 0 })),
    ball: { ...state.ball, vx: 0, vy: 0 },
  };
}

function resolveCollision(
  first: { x: number; y: number; vx: number; vy: number; radius: number },
  second: { x: number; y: number; vx: number; vy: number; radius: number },
  firstMass: number,
  secondMass: number,
) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const distance = Math.hypot(dx, dy) || 0.001;
  const minimum = first.radius + second.radius;
  if (distance >= minimum) return;

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimum - distance;
  const totalMass = firstMass + secondMass;
  first.x -= nx * overlap * (secondMass / totalMass);
  first.y -= ny * overlap * (secondMass / totalMass);
  second.x += nx * overlap * (firstMass / totalMass);
  second.y += ny * overlap * (firstMass / totalMass);

  const relativeVelocity =
    (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
  if (relativeVelocity >= 0) return;
  const impulse = (-(1 + 0.88) * relativeVelocity) / (1 / firstMass + 1 / secondMass);
  first.vx -= (impulse * nx) / firstMass;
  first.vy -= (impulse * ny) / firstMass;
  second.vx += (impulse * nx) / secondMass;
  second.vy += (impulse * ny) / secondMass;
}

function advancePhysics(
  current: ArenaState,
  elapsedSeconds: number,
): { state: ArenaState; goal: Team | null } {
  const state: ArenaState = {
    ...current,
    players: current.players.map((player) => ({ ...player })),
    ball: { ...current.ball },
  };
  const frameScale = clamp(elapsedSeconds * 60, 0.4, 2.2);
  const friction = Math.pow(0.976, frameScale);

  for (const player of state.players) {
    player.x += player.vx * frameScale;
    player.y += player.vy * frameScale;
    player.vx *= friction;
    player.vy *= friction;
    if (speed(player) < 0.07) {
      player.vx = 0;
      player.vy = 0;
    }
    if (player.x - player.radius < FIELD.left) {
      player.x = FIELD.left + player.radius;
      player.vx = Math.abs(player.vx) * 0.62;
    } else if (player.x + player.radius > FIELD.right) {
      player.x = FIELD.right - player.radius;
      player.vx = -Math.abs(player.vx) * 0.62;
    }
    if (player.y - player.radius < FIELD.top) {
      player.y = FIELD.top + player.radius;
      player.vy = Math.abs(player.vy) * 0.62;
    } else if (player.y + player.radius > FIELD.bottom) {
      player.y = FIELD.bottom - player.radius;
      player.vy = -Math.abs(player.vy) * 0.62;
    }
  }

  state.ball.x += state.ball.vx * frameScale;
  state.ball.y += state.ball.vy * frameScale;
  state.ball.vx *= Math.pow(0.989, frameScale);
  state.ball.vy *= Math.pow(0.989, frameScale);
  if (speed(state.ball) < 0.055) {
    state.ball.vx = 0;
    state.ball.vy = 0;
  }
  if (state.ball.x - state.ball.radius < FIELD.left) {
    state.ball.x = FIELD.left + state.ball.radius;
    state.ball.vx = Math.abs(state.ball.vx) * 0.78;
  } else if (state.ball.x + state.ball.radius > FIELD.right) {
    state.ball.x = FIELD.right - state.ball.radius;
    state.ball.vx = -Math.abs(state.ball.vx) * 0.78;
  }

  const insideGoalMouth =
    state.ball.x > FIELD.goalLeft + state.ball.radius * 0.2 &&
    state.ball.x < FIELD.goalRight - state.ball.radius * 0.2;
  let goal: Team | null = null;
  if (insideGoalMouth && state.ball.y < FIELD.top - FIELD.goalDepth * 0.45) {
    goal = "home";
  } else if (insideGoalMouth && state.ball.y > FIELD.bottom + FIELD.goalDepth * 0.45) {
    goal = "away";
  } else {
    if (!insideGoalMouth && state.ball.y - state.ball.radius < FIELD.top) {
      state.ball.y = FIELD.top + state.ball.radius;
      state.ball.vy = Math.abs(state.ball.vy) * 0.8;
    }
    if (!insideGoalMouth && state.ball.y + state.ball.radius > FIELD.bottom) {
      state.ball.y = FIELD.bottom - state.ball.radius;
      state.ball.vy = -Math.abs(state.ball.vy) * 0.8;
    }
    if (insideGoalMouth) {
      const goalTop = FIELD.top - FIELD.goalDepth;
      const goalBottom = FIELD.bottom + FIELD.goalDepth;
      if (state.ball.y - state.ball.radius < goalTop) {
        state.ball.y = goalTop + state.ball.radius;
        state.ball.vy = Math.abs(state.ball.vy) * 0.72;
      }
      if (state.ball.y + state.ball.radius > goalBottom) {
        state.ball.y = goalBottom - state.ball.radius;
        state.ball.vy = -Math.abs(state.ball.vy) * 0.72;
      }
    }
  }

  for (let firstIndex = 0; firstIndex < state.players.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < state.players.length; secondIndex += 1) {
      resolveCollision(state.players[firstIndex], state.players[secondIndex], 2.2, 2.2);
    }
    resolveCollision(state.players[firstIndex], state.ball, 2.35, 1);
  }
  return { state, goal };
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawGoal(context: CanvasRenderingContext2D, top: boolean) {
  const y = top ? FIELD.top - FIELD.goalDepth : FIELD.bottom;
  context.save();
  context.strokeStyle = "rgba(226,255,205,.9)";
  context.lineWidth = 5;
  context.strokeRect(FIELD.goalLeft, y, FIELD.goalRight - FIELD.goalLeft, FIELD.goalDepth);
  context.strokeStyle = "rgba(163,230,53,.28)";
  context.lineWidth = 1.5;
  for (let x = FIELD.goalLeft + 18; x < FIELD.goalRight; x += 18) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x, y + FIELD.goalDepth);
    context.stroke();
  }
  for (let line = 1; line < 4; line += 1) {
    const lineY = y + (FIELD.goalDepth / 4) * line;
    context.beginPath();
    context.moveTo(FIELD.goalLeft, lineY);
    context.lineTo(FIELD.goalRight, lineY);
    context.stroke();
  }
  context.restore();
}

function drawPlayer(
  context: CanvasRenderingContext2D,
  player: PlayerDisc,
  active: boolean,
  selected: boolean,
) {
  const home = player.team === "home";
  context.save();
  context.translate(player.x, player.y);
  context.fillStyle = "rgba(0,0,0,.28)";
  context.beginPath();
  context.ellipse(4, player.radius * 0.78, player.radius * 0.9, 13, 0, 0, Math.PI * 2);
  context.fill();
  if (active || selected) {
    context.strokeStyle = selected ? "#fff" : home ? "#bef264" : "#7dd3fc";
    context.lineWidth = selected ? 7 : 4;
    context.beginPath();
    context.arc(0, 0, player.radius + (selected ? 9 : 5), 0, Math.PI * 2);
    context.stroke();
  }
  const rim = context.createLinearGradient(-30, -30, 30, 32);
  rim.addColorStop(0, home ? "#d9f99d" : "#bae6fd");
  rim.addColorStop(1, home ? "#4d7c0f" : "#075985");
  context.fillStyle = rim;
  context.beginPath();
  context.arc(0, 0, player.radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.55)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = home ? "#17240e" : "#101b34";
  context.beginPath();
  context.arc(0, 3, player.radius - 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = home ? "#a3e635" : "#38bdf8";
  context.beginPath();
  context.arc(0, 8, 22, 0, Math.PI, false);
  context.lineTo(-22, 19);
  context.quadraticCurveTo(0, 31, 22, 19);
  context.closePath();
  context.fill();
  const skinTones = ["#f4c99b", "#c98d63", "#8a5739"];
  context.fillStyle = skinTones[player.number % skinTones.length];
  context.beginPath();
  context.arc(0, -5, 14, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = player.number % 2 ? "#1c120d" : "#3c2517";
  context.beginPath();
  context.arc(0, -10, 14, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "#07110b";
  context.beginPath();
  context.arc(-5, -4, 1.7, 0, Math.PI * 2);
  context.arc(5, -4, 1.7, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = home ? "#07110b" : "#e0f2fe";
  context.font = "900 13px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(player.number), 0, 17);
  context.restore();
}

function drawBall(context: CanvasRenderingContext2D, ball: BallBody) {
  context.save();
  context.translate(ball.x, ball.y);
  context.fillStyle = "rgba(0,0,0,.3)";
  context.beginPath();
  context.ellipse(4, ball.radius + 7, ball.radius * 0.85, 7, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f8fafc";
  context.beginPath();
  context.arc(0, 0, ball.radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#07110b";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#07110b";
  context.beginPath();
  for (let point = 0; point < 5; point += 1) {
    const angle = -Math.PI / 2 + point * (Math.PI * 2 / 5);
    const x = Math.cos(angle) * 7;
    const y = Math.sin(angle) * 7;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  for (let spoke = 0; spoke < 5; spoke += 1) {
    const angle = -Math.PI / 2 + spoke * (Math.PI * 2 / 5);
    context.beginPath();
    context.moveTo(Math.cos(angle) * 7, Math.sin(angle) * 7);
    context.lineTo(Math.cos(angle) * 15, Math.sin(angle) * 15);
    context.stroke();
  }
  context.restore();
}

function drawArena(canvas: HTMLCanvasElement, state: ArenaState | null, drag: DragState | null) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, WIDTH, HEIGHT);
  const backdrop = context.createLinearGradient(0, 0, 0, HEIGHT);
  backdrop.addColorStop(0, "#071a12");
  backdrop.addColorStop(0.5, "#020a07");
  backdrop.addColorStop(1, "#071a12");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#0c2418";
  context.fillRect(0, 0, WIDTH, 98);
  context.fillRect(0, HEIGHT - 98, WIDTH, 98);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 24; column += 1) {
      const x = 18 + column * 30 + (row % 2) * 7;
      const colorIndex = (column * 7 + row * 11) % 4;
      context.fillStyle = ["#bef264", "#38bdf8", "#f8fafc", "#f59e0b"][colorIndex];
      context.globalAlpha = 0.35 + ((column + row) % 3) * 0.16;
      context.beginPath();
      context.arc(x, 20 + row * 24, 5, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(x, HEIGHT - 20 - row * 24, 5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
  const pitch = context.createLinearGradient(FIELD.left, 0, FIELD.right, 0);
  pitch.addColorStop(0, "#0e5c35");
  pitch.addColorStop(0.5, "#168247");
  pitch.addColorStop(1, "#0e5c35");
  context.fillStyle = pitch;
  context.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
  const stripeHeight = (FIELD.bottom - FIELD.top) / 10;
  for (let stripe = 0; stripe < 10; stripe += 1) {
    if (stripe % 2 === 0) {
      context.fillStyle = "rgba(190,242,100,.055)";
      context.fillRect(FIELD.left, FIELD.top + stripe * stripeHeight, FIELD.right - FIELD.left, stripeHeight);
    }
  }
  drawGoal(context, true);
  drawGoal(context, false);
  context.strokeStyle = "rgba(239,255,231,.78)";
  context.lineWidth = 4;
  context.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
  context.beginPath();
  context.moveTo(FIELD.left, HEIGHT / 2);
  context.lineTo(FIELD.right, HEIGHT / 2);
  context.stroke();
  context.beginPath();
  context.arc(WIDTH / 2, HEIGHT / 2, 88, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "rgba(239,255,231,.82)";
  context.beginPath();
  context.arc(WIDTH / 2, HEIGHT / 2, 5, 0, Math.PI * 2);
  context.fill();
  context.strokeRect(176, FIELD.top, 368, 155);
  context.strokeRect(176, FIELD.bottom - 155, 368, 155);
  context.beginPath();
  context.arc(WIDTH / 2, FIELD.top + 112, 4, 0, Math.PI * 2);
  context.arc(WIDTH / 2, FIELD.bottom - 112, 4, 0, Math.PI * 2);
  context.fill();
  context.save();
  context.fillStyle = "rgba(2,8,5,.86)";
  drawRoundedRect(context, 8, 300, 44, 185, 12);
  context.fill();
  drawRoundedRect(context, WIDTH - 52, 695, 44, 185, 12);
  context.fill();
  context.translate(30, 393);
  context.rotate(-Math.PI / 2);
  context.fillStyle = "#bef264";
  context.font = "900 17px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("JOE YOKE", 0, 6);
  context.restore();
  context.save();
  context.translate(WIDTH - 30, 788);
  context.rotate(Math.PI / 2);
  context.fillStyle = "#7dd3fc";
  context.font = "900 17px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("MYAN HUB", 0, 6);
  context.restore();

  if (!state) return;
  for (const player of state.players) {
    drawPlayer(context, player, state.phase === "playing" && state.currentTurn === player.team, drag?.playerId === player.id);
  }
  drawBall(context, state.ball);
  if (drag) {
    const dx = drag.current.x - drag.origin.x;
    const dy = drag.current.y - drag.origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 2) {
      const capped = Math.min(distance, 190);
      const nx = dx / distance;
      const ny = dy / distance;
      const endX = drag.origin.x + nx * capped;
      const endY = drag.origin.y + ny * capped;
      context.save();
      context.strokeStyle = "rgba(255,255,255,.92)";
      context.lineWidth = 8;
      context.lineCap = "round";
      context.setLineDash([15, 10]);
      context.beginPath();
      context.moveTo(drag.origin.x, drag.origin.y);
      context.lineTo(endX, endY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#bef264";
      context.beginPath();
      context.moveTo(endX + nx * 13, endY + ny * 13);
      context.lineTo(endX - ny * 13 - nx * 9, endY + nx * 13 - ny * 9);
      context.lineTo(endX + ny * 13 - nx * 9, endY - nx * 13 - ny * 9);
      context.closePath();
      context.fill();
      context.fillStyle = "rgba(2,8,5,.86)";
      drawRoundedRect(context, WIDTH / 2 - 122, HEIGHT - 75, 244, 22, 11);
      context.fill();
      const power = capped / 190;
      const powerGradient = context.createLinearGradient(WIDTH / 2 - 117, 0, WIDTH / 2 + 117, 0);
      powerGradient.addColorStop(0, "#38bdf8");
      powerGradient.addColorStop(0.65, "#bef264");
      powerGradient.addColorStop(1, "#fb7185");
      context.fillStyle = powerGradient;
      drawRoundedRect(context, WIDTH / 2 - 117, HEIGHT - 70, 234 * power, 12, 6);
      context.fill();
      context.restore();
    }
  }
}

function FootballClashLogo({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="Joe Yoke Arena crest">
      <defs>
        <linearGradient id="joe-yoke-crest" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d9f99d" />
          <stop offset="58%" stopColor="#a3e635" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path d="M48 5 85 18v29c0 23-14 37-37 45C25 84 11 70 11 47V18L48 5Z" fill="#07110b" stroke="url(#joe-yoke-crest)" strokeWidth="4" />
      <circle cx="48" cy="43" r="23" fill="#f8fafc" stroke="#07110b" strokeWidth="3" />
      <path d="m48 30 10 7-4 12H42l-4-12 10-7Z" fill="#07110b" />
      <path d="m48 20 7 5-3 6h-8l-3-6 7-5Zm21 16-2 9-10 2-5-8 6-7 11 4ZM62 61l-9 5-7-8 5-9 10 2 1 10ZM34 61l1-10 10-2 5 9-7 8-9-5ZM27 36l11-4 6 7-5 8-10-2-2-9Z" fill="#10251a" />
      <path d="M24 72h48" stroke="#a3e635" strokeLinecap="round" strokeWidth="5" />
      <text x="48" y="83" fill="#f8fafc" fontFamily="system-ui, sans-serif" fontSize="10" fontWeight="900" textAnchor="middle">ARENA</text>
    </svg>
  );
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function FootballClash({
  onClose,
  preloadedMatchId,
  matchId: suppliedMatchId,
  opponent,
  role: suppliedRole,
}: FootballClashProps) {
  const incomingMatchId = preloadedMatchId ?? suppliedMatchId ?? null;
  const [view, setView] = useState<"menu" | "matchmaking" | "play">(incomingMatchId ? "play" : "menu");
  const [activeMatchId, setActiveMatchId] = useState<string | null>(incomingMatchId);
  const [localOpponent, setLocalOpponent] = useState<OpponentProfile | null>(opponent ?? null);
  const [userId, setUserId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("You");
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<Team | null>(suppliedRole === 1 ? "home" : suppliedRole === 2 ? "away" : null);
  const [matchmakerRole, setMatchmakerRole] = useState<1 | 2 | undefined>(suppliedRole);
  const [game, setGame] = useState<ArenaState | null>(null);
  const [presenceIds, setPresenceIds] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionState>(incomingMatchId ? "connecting" : "idle");
  const [pullComplete, setPullComplete] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [clock, setClock] = useState(MATCH_SECONDS);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<ArenaState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const actionOwnerRef = useRef(false);
  const recordedRef = useRef(false);
  const goalTimerRef = useRef<number | null>(null);

  const isBotMatch = Boolean(localOpponent?.isBot || activeMatchId?.startsWith("bot_"));
  const isGuest = Boolean(userId?.startsWith("guest:"));

  const setArena = useCallback((next: ArenaState) => {
    gameRef.current = next;
    setGame(next);
    setClock(
      next.phase === "ready"
        ? MATCH_SECONDS
        : next.suddenDeath
          ? 0
          : Math.max(0, Math.ceil(((next.matchEndsAt ?? Date.now()) - Date.now()) / 1000)),
    );
  }, []);

  const redraw = useCallback(() => {
    if (canvasRef.current) drawArena(canvasRef.current, gameRef.current, dragRef.current);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadPlayer = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserId(user?.id ?? `guest:${Math.random().toString(36).slice(2)}`);
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
        if (mounted) setPlayerName(profile?.username?.trim() || "You");
      }
      if (mounted) setAuthReady(true);
    };
    void loadPlayer();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    dragRef.current = drag;
    redraw();
  }, [drag, redraw]);

  useEffect(() => { redraw(); }, [game, redraw]);

  const persistSnapshot = useCallback(async (snapshot: ArenaState) => {
    setArena(snapshot);
    if (!activeMatchId || !userId || isBotMatch) return;
    const result = await JoeYokeEngine.pushGameState({ gameKey: GAME_KEY, matchId: activeMatchId, userId, state: snapshot });
    if (!result.success) {
      setConnection("error");
      setMessage("Arena sync interrupted. Reconnecting...");
    }
  }, [activeMatchId, isBotMatch, setArena, userId]);

  const acceptSnapshot = useCallback((snapshot: ArenaState) => {
    if (!isArenaState(snapshot)) return;
    const current = gameRef.current;
    if (current && snapshot.revision < current.revision) return;
    actionOwnerRef.current = false;
    setArena(snapshot);
    setIsMoving(snapshot.phase === "playing" && hasMotion(snapshot));
  }, [setArena]);

  useEffect(() => {
    if (view !== "play" || !activeMatchId || !userId || isBotMatch) return;
    let mounted = true;
    const unsubscribe = JoeYokeEngine.subscribeToGameState<ArenaState>({
      gameKey: GAME_KEY,
      matchId: activeMatchId,
      userId,
      onState: (snapshot) => { if (mounted && snapshot.matchId === activeMatchId) acceptSnapshot(snapshot); },
      onPresence: (ids) => { if (mounted) setPresenceIds(ids); },
      onStatus: (status) => {
        if (!mounted) return;
        if (status === "SUBSCRIBED") setConnection("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("error");
      },
    });
    void JoeYokeEngine.pullGameState<ArenaState>(GAME_KEY, activeMatchId).then((snapshot) => {
      if (!mounted) return;
      if (snapshot && isArenaState(snapshot)) acceptSnapshot(snapshot);
      setPullComplete(true);
    });
    return () => { mounted = false; unsubscribe(); };
  }, [acceptSnapshot, activeMatchId, isBotMatch, userId, view]);

  useEffect(() => {
    if (view !== "play" || !activeMatchId || !userId) return;
    if (isBotMatch && !gameRef.current) {
      const initial = makeInitialState(activeMatchId, { home: userId, away: `bot:${localOpponent?.name ?? "Neon Strikers"}` }, true);
      setRole("home");
      setConnection("connected");
      setArena(initial);
      return;
    }
    if (isBotMatch || !pullComplete) return;
    const current = gameRef.current;
    if (current) {
      if (current.playerIds.home === userId) setRole("home");
      else if (current.playerIds.away === userId) setRole("away");
      else if (matchmakerRole === 2 && !current.playerIds.away) {
        const joined: ArenaState = {
          ...current,
          revision: current.revision + 1,
          phase: "playing",
          playerIds: { ...current.playerIds, away: userId },
          matchEndsAt: Date.now() + MATCH_SECONDS * 1000,
          updatedAt: new Date().toISOString(),
        };
        setRole("away");
        void persistSnapshot(joined);
      }
      return;
    }
    if (matchmakerRole === 1) {
      setRole("home");
      void persistSnapshot(makeInitialState(activeMatchId, { home: userId, away: null }, false));
      return;
    }
    const pairedIds = [...new Set([...presenceIds, userId])].sort();
    if (pairedIds.length >= 2) {
      const playerIds = { home: pairedIds[0], away: pairedIds[1] };
      setRole(playerIds.home === userId ? "home" : "away");
      void persistSnapshot(makeInitialState(activeMatchId, playerIds, true));
    }
  }, [activeMatchId, isBotMatch, localOpponent?.name, matchmakerRole, persistSnapshot, presenceIds, pullComplete, setArena, userId, view]);

  const finishMatch = useCallback((state: ArenaState): ArenaState => {
    const winner: Team = state.score.home > state.score.away ? "home" : "away";
    return {
      ...stopBodies(state),
      revision: state.revision + 1,
      phase: "finished",
      winner,
      matchEndsAt: null,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  useEffect(() => {
    if (view !== "play") return;
    const timer = window.setInterval(() => {
      const current = gameRef.current;
      if (!current || current.phase === "ready" || current.phase === "finished") return;
      if (current.suddenDeath || current.matchEndsAt === null) { setClock(0); return; }
      const remaining = Math.max(0, Math.ceil((current.matchEndsAt - Date.now()) / 1000));
      setClock(remaining);
      if (remaining > 0 || isMoving) return;
      const authoritative = isBotMatch || role === "home";
      if (!authoritative) return;
      if (current.score.home === current.score.away) {
        const sudden: ArenaState = {
          ...stopBodies(current),
          revision: current.revision + 1,
          suddenDeath: true,
          matchEndsAt: null,
          phase: "playing",
          updatedAt: new Date().toISOString(),
        };
        setMessage("Sudden death - next goal wins");
        void persistSnapshot(sudden);
      } else {
        void persistSnapshot(finishMatch(current));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [finishMatch, isBotMatch, isMoving, persistSnapshot, role, view]);

  useEffect(() => {
    if (!isMoving || view !== "play") return;
    let frameId = 0;
    let previous = performance.now();
    let stoppedFrames = 0;
    const animate = (now: number) => {
      const current = gameRef.current;
      if (!current || current.phase !== "playing") { setIsMoving(false); return; }
      const { state: advanced, goal } = advancePhysics(current, Math.min((now - previous) / 1000, 0.04));
      previous = now;
      gameRef.current = advanced;
      if (canvasRef.current) drawArena(canvasRef.current, advanced, null);
      if (goal) {
        const score = { ...advanced.score, [goal]: advanced.score[goal] + 1 };
        const scored: ArenaState = {
          ...stopBodies(advanced),
          revision: advanced.revision + 1,
          score,
          phase: advanced.suddenDeath ? "finished" : "goal",
          winner: advanced.suddenDeath ? goal : null,
          lastGoal: goal,
          updatedAt: new Date().toISOString(),
        };
        setArena(scored);
        setIsMoving(false);
        navigator.vibrate?.([30, 35, 65]);
        setMessage(goal === role ? "GOAL!" : `${localOpponent?.name ?? "Opponent"} scores`);
        if (actionOwnerRef.current) void persistSnapshot(scored);
        actionOwnerRef.current = false;
        if (!advanced.suddenDeath) {
          goalTimerRef.current = window.setTimeout(() => {
            const latest = gameRef.current;
            if (!latest || latest.phase !== "goal") return;
            const reset = resetFormation(latest, otherTeam(goal));
            setMessage(null);
            setArena(reset);
            if (isBotMatch || role === goal) void persistSnapshot(reset);
          }, 1150);
        }
        return;
      }
      if (hasMotion(advanced)) stoppedFrames = 0;
      else stoppedFrames += 1;
      if (stoppedFrames >= 4) {
        const settled: ArenaState = {
          ...stopBodies(advanced),
          revision: advanced.revision + 1,
          currentTurn: otherTeam(advanced.currentTurn),
          lastAction: null,
          updatedAt: new Date().toISOString(),
        };
        setArena(settled);
        setIsMoving(false);
        if (actionOwnerRef.current) void persistSnapshot(settled);
        actionOwnerRef.current = false;
        return;
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [isBotMatch, isMoving, localOpponent?.name, persistSnapshot, role, setArena, view]);

  useEffect(() => () => {
    if (goalTimerRef.current) window.clearTimeout(goalTimerRef.current);
  }, []);

  const performFlick = useCallback((playerId: string, velocity: Vector) => {
    const current = gameRef.current;
    const player = current?.players.find((candidate) => candidate.id === playerId);
    if (!current || !player || current.phase !== "playing" || current.currentTurn !== player.team || hasMotion(current)) return;
    const magnitude = Math.hypot(velocity.x, velocity.y);
    if (magnitude < 2.2) return;
    const capped = Math.min(magnitude, 18.5);
    const nx = velocity.x / magnitude;
    const ny = velocity.y / magnitude;
    const action: FlickAction = {
      id: `${current.matchId}:${current.revision + 1}:${playerId}`,
      playerId,
      team: player.team,
      vx: nx * capped,
      vy: ny * capped,
    };
    const launched: ArenaState = {
      ...current,
      revision: current.revision + 1,
      players: current.players.map((candidate) => candidate.id === playerId ? { ...candidate, vx: action.vx, vy: action.vy } : { ...candidate }),
      ball: { ...current.ball },
      lastAction: action,
      updatedAt: new Date().toISOString(),
    };
    actionOwnerRef.current = true;
    setArena(launched);
    setIsMoving(true);
    navigator.vibrate?.(12);
    void persistSnapshot(launched);
  }, [persistSnapshot, setArena]);

  useEffect(() => {
    if (!isBotMatch || !game || game.phase !== "playing" || game.currentTurn !== "away" || isMoving) return;
    const timer = window.setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.currentTurn !== "away" || hasMotion(current)) return;
      const candidates = current.players.filter((player) => player.team === "away");
      const selected = [...candidates].sort((first, second) =>
        Math.hypot(first.x - current.ball.x, first.y - current.ball.y) -
        Math.hypot(second.x - current.ball.x, second.y - current.ball.y),
      )[0];
      if (!selected) return;
      const targetX = current.ball.x + (WIDTH / 2 - current.ball.x) * 0.16;
      const targetY = current.ball.y + 105;
      const targetDx = targetX - selected.x;
      const targetDy = targetY - selected.y;
      const targetDistance = Math.hypot(targetDx, targetDy) || 1;
      const ballDistance = Math.hypot(current.ball.x - selected.x, current.ball.y - selected.y);
      const power = clamp(11.5 + ballDistance / 32, 12.5, 17.4);
      performFlick(selected.id, { x: (targetDx / targetDistance) * power, y: (targetDy / targetDistance) * power });
    }, 720 + Math.floor(Math.random() * 420));
    return () => window.clearTimeout(timer);
  }, [game, isBotMatch, isMoving, performFlick]);

  useEffect(() => {
    if (!game?.winner || !role || recordedRef.current) return;
    recordedRef.current = true;
    if (isGuest) return;
    void recordMatchResult({
      game_id: GAME_KEY,
      game_title: GAME_NAME,
      opponent_name: localOpponent?.name ?? "Online Opponent",
      result: game.winner === role ? "Win" : "Loss",
      points_change: 0,
    });
  }, [game?.winner, isGuest, localOpponent?.name, role]);

  const pointFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): Vector => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT };
  };

  const opponentReady = Boolean(isBotMatch || (game?.playerIds.home && game?.playerIds.away));
  const canFlick = Boolean(game && role && opponentReady && game.phase === "playing" && game.currentTurn === role && !isMoving);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = gameRef.current;
    if (!canFlick || !current || !role) return;
    const point = pointFromPointer(event);
    const selected = current.players.filter((player) => player.team === role).find((player) => Math.hypot(player.x - point.x, player.y - point.y) <= player.radius * 1.35);
    if (!selected) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextDrag: DragState = { pointerId: event.pointerId, playerId: selected.id, origin: { x: selected.x, y: selected.y }, current: point };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const nextDrag = { ...active, current: pointFromPointer(event) };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const end = pointFromPointer(event);
    const dx = end.x - active.origin.x;
    const dy = end.y - active.origin.y;
    const distance = Math.hypot(dx, dy);
    dragRef.current = null;
    setDrag(null);
    if (distance < 22) {
      setMessage("Drag farther to add power");
      window.setTimeout(() => setMessage(null), 1300);
      return;
    }
    const power = Math.min(distance, 190) / 10.3;
    performFlick(active.playerId, { x: (dx / distance) * power, y: (dy / distance) * power });
  };

  const cancelPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
  };

  const startBotMatch = () => {
    if (!authReady || !userId) return;
    recordedRef.current = false;
    actionOwnerRef.current = false;
    gameRef.current = null;
    setGame(null);
    if (isGuest) setPlayerName("Guest Squad");
    setLocalOpponent({ name: "Neon Strikers", isBot: true, avatarIcon: "NS", elo: 1180 });
    setActiveMatchId(`bot_joe_yoke_arena_${Date.now()}`);
    setRole("home");
    setMatchmakerRole(1);
    setPullComplete(true);
    setConnection("connected");
    setView("play");
  };

  const beginOnlineMatch = async () => {
    if (!userId || isGuest) { setMessage("Use Kick Off to play instantly as a guest."); return; }
    setMessage(null);
    const entry = await processGameEntry({ gameTitle: GAME_NAME, entryFee: 0, opponentName: "Arena Opponent" });
    if (!entry.success) { setMessage(entry.error ?? "Unable to enter the arena queue."); return; }
    setView("matchmaking");
  };

  const playerLabels = useMemo(() => role === "away"
    ? { home: localOpponent?.name ?? "Opponent", away: playerName }
    : { home: playerName, away: localOpponent?.name ?? "Neon Strikers" },
  [localOpponent?.name, playerName, role]);

  const statusText = useMemo(() => {
    if (!game) return "Preparing the arena...";
    if (!opponentReady) return "Waiting for opponent...";
    if (game.phase === "finished") return game.winner === role ? "Arena victory" : "Full time";
    if (game.phase === "goal") return `${playerLabels[game.lastGoal ?? "home"]} scored`;
    if (isMoving) return `${playerLabels[game.currentTurn]} attacks`;
    if (game.currentTurn === role) return "Your turn - choose, drag, release";
    return `${playerLabels[game.currentTurn]} is aiming`;
  }, [game, isMoving, opponentReady, playerLabels, role]);

  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] overflow-hidden bg-[#030a07] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(163,230,53,.22),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(56,189,248,.12),transparent_34%),linear-gradient(165deg,#092417_0%,#020705_70%)]" />
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-lime-300 via-sky-300 to-lime-300" />
        <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-10 text-center" style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))", paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
          {onClose && <button onClick={onClose} className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/25 text-xl backdrop-blur-md active:scale-95" aria-label="Close Football Clash">{"\u00d7"}</button>}
          <div className="relative mb-4">
            <div className="absolute inset-2 rounded-full bg-lime-300/25 blur-2xl" />
            <FootballClashLogo className="relative h-28 w-28 drop-shadow-[0_16px_40px_rgba(163,230,53,.25)]" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[.42em] text-lime-300">Joe Yoke Arena</p>
          <h1 className="mt-2 text-4xl font-black uppercase italic tracking-[-.06em] sm:text-5xl">Football Clash</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/58">Command a three-player squad. Drag to aim, release to strike, and own the neon arena.</p>
          <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2 text-left">
            {[["01", "Choose", "Pick a player"], ["02", "Aim", "Drag to power"], ["03", "Strike", "Release to move"]].map(([number, title, detail]) => (
              <div key={number} className="rounded-2xl border border-white/10 bg-white/[.045] p-3 backdrop-blur-sm">
                <span className="text-[9px] font-black text-lime-300">{number}</span>
                <p className="mt-1 text-[11px] font-black uppercase">{title}</p>
                <p className="mt-1 text-[9px] leading-4 text-white/42">{detail}</p>
              </div>
            ))}
          </div>
          <button onClick={startBotMatch} disabled={!authReady} className="mt-6 w-full max-w-sm rounded-2xl bg-lime-300 px-6 py-4 text-sm font-black uppercase tracking-[.2em] text-[#07110b] shadow-[0_16px_45px_rgba(163,230,53,.22)] transition active:scale-[.98] disabled:opacity-50">{authReady ? "Kick off vs AI" : "Loading arena..."}</button>
          {!isGuest && <button onClick={() => void beginOnlineMatch()} className="mt-3 w-full max-w-sm rounded-2xl border border-sky-300/30 bg-sky-300/8 px-6 py-3.5 text-xs font-black uppercase tracking-[.18em] text-sky-200 transition active:scale-[.98]">Online arena</button>}
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[.18em] text-white/35">{isGuest ? "Guest play enabled - no sign-in required" : "AI practice or live 1v1"}</p>
          {message && <p className="mt-3 text-xs font-semibold text-rose-300">{message}</p>}
        </div>
      </div>
    );
  }

  if (view === "matchmaking") {
    return <MatchmakingModal gameKey={GAME_KEY} gameName={GAME_NAME} userId={userId ?? "guest"} onCancel={() => setView("menu")} onMatchFound={(match) => {
      setActiveMatchId(match.matchId);
      setRole(match.role === 1 ? "home" : "away");
      setMatchmakerRole(match.role);
      setLocalOpponent(match.opponent);
      setConnection("connecting");
      setPullComplete(false);
      setView("play");
    }} />;
  }

  const showingLoader = !authReady || !activeMatchId || !game;
  const displayClock = game?.suddenDeath ? "SD" : formatClock(clock);

  return (
    <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-[#020705] text-white" style={{ WebkitUserSelect: "none" }}>
      <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#143b28_0%,#020705_68%)]">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Joe Yoke three versus three football arena" className={`h-full max-h-full w-full max-w-[660px] object-contain ${canFlick ? "cursor-crosshair" : "cursor-default"}`} style={{ touchAction: "none" }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={cancelPointer} />
      </div>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3" style={{ paddingTop: "max(.65rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto grid max-w-[620px] grid-cols-[42px_1fr_42px] items-center gap-2">
          <button onClick={onClose} className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/55 text-xl backdrop-blur-md active:scale-95" aria-label="Leave arena">{"\u00d7"}</button>
          <div className="overflow-hidden rounded-2xl border border-white/12 bg-black/62 shadow-2xl backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <div className={`min-w-0 px-3 py-2 ${game?.currentTurn === "home" ? "bg-lime-300/12" : ""}`}><p className="truncate text-[9px] font-black uppercase tracking-wide text-lime-200">{playerLabels.home}</p><p className="text-2xl font-black tabular-nums">{game?.score.home ?? 0}</p></div>
              <div className="grid min-w-[74px] place-items-center border-x border-white/10 px-2 py-2"><p className={`text-sm font-black tabular-nums ${game?.suddenDeath ? "text-rose-300" : "text-white"}`}>{displayClock}</p><p className="mt-0.5 text-[7px] font-black uppercase tracking-[.22em] text-white/35">Arena</p></div>
              <div className={`min-w-0 px-3 py-2 text-right ${game?.currentTurn === "away" ? "bg-sky-300/12" : ""}`}><p className="truncate text-[9px] font-black uppercase tracking-wide text-sky-200">{playerLabels.away}</p><p className="text-2xl font-black tabular-nums">{game?.score.away ?? 0}</p></div>
            </div>
          </div>
          <div className={`grid h-10 w-10 place-items-center rounded-full border bg-black/55 backdrop-blur-md ${connection === "error" ? "border-rose-400/60 text-rose-300" : "border-white/15 text-lime-300"}`} aria-label={`Network ${connection}`}>{connection === "error" ? "!" : <span className="h-2 w-2 rounded-full bg-lime-300" aria-hidden="true" />}</div>
        </div>
        <div className="mx-auto mt-2 max-w-sm rounded-full border border-white/10 bg-black/55 px-4 py-2 text-center text-[9px] font-black uppercase tracking-[.16em] text-white/75 backdrop-blur-md">{statusText}</div>
      </header>
      {showingLoader && <div className="absolute inset-0 z-40 grid place-items-center bg-[#030806]/88 px-8 text-center backdrop-blur-sm"><div><FootballClashLogo className="mx-auto h-20 w-20 animate-pulse" /><p className="mt-5 text-xs font-black uppercase tracking-[.25em]">Preparing Joe Yoke Arena</p><p className="mt-2 text-[11px] text-white/45">Setting the teams and match clock...</p></div></div>}
      {!showingLoader && !opponentReady && <div className="absolute inset-x-5 top-1/2 z-30 -translate-y-1/2 rounded-3xl border border-white/10 bg-black/76 p-6 text-center backdrop-blur-xl"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-lime-300" /><p className="mt-4 text-sm font-black uppercase tracking-[.18em]">Waiting for opponent</p></div>}
      {!showingLoader && opponentReady && game?.phase !== "finished" && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 text-center" style={{ paddingBottom: "max(.8rem, env(safe-area-inset-bottom))" }}><div className={`mx-auto max-w-sm rounded-2xl border px-4 py-3 backdrop-blur-xl ${canFlick ? "border-lime-300/35 bg-[#07110b]/82" : "border-white/10 bg-black/58"}`}><p className={`text-[10px] font-black uppercase tracking-[.2em] ${canFlick ? "text-lime-300" : "text-white/55"}`}>{canFlick ? "Choose player - drag - release" : statusText}</p>{canFlick && <p className="mt-1 text-[9px] text-white/42">Longer drag gives more power. Bank shots off players and walls.</p>}</div></div>}
      {message && game?.phase !== "finished" && <div className="pointer-events-none absolute left-1/2 top-[20%] z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/12 bg-black/82 px-5 py-2 text-xs font-black uppercase tracking-[.18em] text-white shadow-2xl">{message}</div>}
      {game?.phase === "finished" && game.winner && role && <div className="absolute inset-0 z-50 grid place-items-center bg-black/78 px-6 backdrop-blur-md"><div className="w-full max-w-sm rounded-[34px] border border-white/12 bg-[#091710] p-7 text-center shadow-2xl"><FootballClashLogo className="mx-auto h-20 w-20" /><p className="mt-4 text-[10px] font-black uppercase tracking-[.34em] text-lime-300">Full time</p><h2 className="mt-2 text-3xl font-black uppercase italic tracking-tight">{game.winner === role ? "Arena champions" : `${playerLabels[game.winner]} win`}</h2><p className="mt-3 text-sm text-white/50">Final score <span className="ml-1 font-black text-white">{game.score.home} - {game.score.away}</span></p>{isBotMatch && <button onClick={startBotMatch} className="mt-7 w-full rounded-2xl bg-lime-300 py-4 text-xs font-black uppercase tracking-[.18em] text-black active:scale-[.98]">Play again</button>}<button onClick={onClose} className="mt-3 w-full rounded-2xl border border-white/12 py-3.5 text-xs font-black uppercase tracking-[.16em] text-white/75 active:scale-[.98]">Back to arcade</button></div></div>}
    </div>
  );
}
