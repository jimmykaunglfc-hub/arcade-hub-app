"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MatchmakingModal from "../MatchmakingModal";
import { JoeYokeEngine } from "../../lib/backendEngine";
import { processGameEntry, recordMatchResult } from "../../lib/matchManager";
import { supabase } from "../../lib/supabaseClient";

type Team = "home" | "away";
type MatchPhase = "ready" | "playing" | "goal" | "finished";
type ConnectionState = "idle" | "connecting" | "connected" | "error";
type GameView = "menu" | "country" | "road" | "lineup" | "matchmaking" | "play";

interface Country {
  code: string;
  name: string;
  flag: string;
}
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
  schemaVersion: 3;
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
const COUNTRIES: Country[] = [
  { code: "MM", name: "Myanmar", flag: "🇲🇲" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "BE", name: "Belgium", flag: "🇧🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "HR", name: "Croatia", flag: "🇭🇷" },
  { code: "DK", name: "Denmark", flag: "🇩🇰" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "EN", name: "England", flag: "🏴" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "GH", name: "Ghana", flag: "🇬🇭" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", flag: "🇰🇷" },
  { code: "MX", name: "Mexico", flag: "🇲🇽" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "NL", name: "Netherlands", flag: "🇳🇱" },
  { code: "PL", name: "Poland", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", flag: "🇵🇹" },
  { code: "SN", name: "Senegal", flag: "🇸🇳" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "CH", name: "Switzerland", flag: "🇨🇭" },
  { code: "US", name: "United States", flag: "🇺🇸" },
];
const WIDTH = 1600;
const HEIGHT = 900;
const MATCH_SECONDS = 75;
const PLAYER_RADIUS = 48;
const BALL_RADIUS = 24;
const FIELD = {
  left: 150,
  right: 1450,
  top: 118,
  bottom: 812,
  goalTop: 310,
  goalBottom: 620,
  goalDepth: 78,
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
    create("home-7", "home", 7, 410, 285),
    create("home-10", "home", 10, 545, 465),
    create("home-11", "home", 11, 410, 645),
    create("away-9", "away", 9, 1190, 285),
    create("away-6", "away", 6, 1055, 465),
    create("away-8", "away", 8, 1190, 645),
  ];
}

function makeInitialState(
  matchId: string,
  playerIds: Record<Team, string | null>,
  active: boolean,
): ArenaState {
  return {
    schemaVersion: 3,
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
    candidate.schemaVersion === 3 &&
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
  const insideGoalMouth =
    state.ball.y > FIELD.goalTop + state.ball.radius * 0.2 &&
    state.ball.y < FIELD.goalBottom - state.ball.radius * 0.2;
  let goal: Team | null = null;
  if (insideGoalMouth && state.ball.x < FIELD.left - FIELD.goalDepth * 0.45) {
    goal = "away";
  } else if (insideGoalMouth && state.ball.x > FIELD.right + FIELD.goalDepth * 0.45) {
    goal = "home";
  } else {
    if (!insideGoalMouth && state.ball.x - state.ball.radius < FIELD.left) {
      state.ball.x = FIELD.left + state.ball.radius;
      state.ball.vx = Math.abs(state.ball.vx) * 0.8;
    }
    if (!insideGoalMouth && state.ball.x + state.ball.radius > FIELD.right) {
      state.ball.x = FIELD.right - state.ball.radius;
      state.ball.vx = -Math.abs(state.ball.vx) * 0.8;
    }
    if (insideGoalMouth) {
      const goalLeft = FIELD.left - FIELD.goalDepth;
      const goalRight = FIELD.right + FIELD.goalDepth;
      if (state.ball.x - state.ball.radius < goalLeft) {
        state.ball.x = goalLeft + state.ball.radius;
        state.ball.vx = Math.abs(state.ball.vx) * 0.72;
      }
      if (state.ball.x + state.ball.radius > goalRight) {
        state.ball.x = goalRight - state.ball.radius;
        state.ball.vx = -Math.abs(state.ball.vx) * 0.72;
      }
    }
    if (state.ball.y - state.ball.radius < FIELD.top) {
      state.ball.y = FIELD.top + state.ball.radius;
      state.ball.vy = Math.abs(state.ball.vy) * 0.8;
    }
    if (state.ball.y + state.ball.radius > FIELD.bottom) {
      state.ball.y = FIELD.bottom - state.ball.radius;
      state.ball.vy = -Math.abs(state.ball.vy) * 0.8;
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

function drawGoal(context: CanvasRenderingContext2D, left: boolean) {
  const x = left ? FIELD.left - FIELD.goalDepth : FIELD.right;
  context.save();
  context.strokeStyle = "rgba(226,255,205,.9)";
  context.lineWidth = 5;
  context.strokeRect(x, FIELD.goalTop, FIELD.goalDepth, FIELD.goalBottom - FIELD.goalTop);
  context.strokeStyle = "rgba(163,230,53,.28)";
  context.lineWidth = 1.5;
  for (let lineX = x + 16; lineX < x + FIELD.goalDepth; lineX += 16) {
    context.beginPath();
    context.moveTo(lineX, FIELD.goalTop);
    context.lineTo(lineX, FIELD.goalBottom);
    context.stroke();
  }
  for (let lineY = FIELD.goalTop + 22; lineY < FIELD.goalBottom; lineY += 22) {
    context.beginPath();
    context.moveTo(x, lineY);
    context.lineTo(x + FIELD.goalDepth, lineY);
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
  const kit = home
    ? { shirt: "#a3e635", dark: "#365314", shorts: "#f8fafc", socks: "#38bdf8" }
    : { shirt: "#38bdf8", dark: "#075985", shorts: "#082f49", socks: "#f8fafc" };
  const skinTones = ["#f4c99b", "#c98d63", "#8a5739"];
  const skin = skinTones[player.number % skinTones.length];
  const hair = player.number % 3 === 0 ? "#111827" : player.number % 3 === 1 ? "#7c2d12" : "#3f2a1d";

  context.save();
  context.translate(player.x, player.y);
  context.fillStyle = "rgba(15,23,42,.25)";
  context.beginPath();
  context.ellipse(5, 51, 55, 15, 0, 0, Math.PI * 2);
  context.fill();

  if (active || selected) {
    context.strokeStyle = selected ? "#ffffff" : home ? "#facc15" : "#f8fafc";
    context.lineWidth = selected ? 8 : 5;
    context.beginPath();
    context.ellipse(0, 44, 60, 22, 0, 0, Math.PI * 2);
    context.stroke();
  }

  context.strokeStyle = "#172033";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.fillStyle = kit.socks;
  drawRoundedRect(context, -32, 24, 24, 28, 8);
  context.fill();
  context.stroke();
  drawRoundedRect(context, 8, 24, 24, 28, 8);
  context.fill();
  context.stroke();

  context.fillStyle = home ? "#ffffff" : "#f59e0b";
  drawRoundedRect(context, -39, 43, 34, 14, 7);
  context.fill();
  context.stroke();
  drawRoundedRect(context, 5, 43, 34, 14, 7);
  context.fill();
  context.stroke();

  context.fillStyle = kit.shorts;
  drawRoundedRect(context, -37, 5, 74, 31, 9);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(0, 10);
  context.lineTo(0, 34);
  context.stroke();

  context.fillStyle = skin;
  context.beginPath();
  context.arc(-43, -5, 15, 0, Math.PI * 2);
  context.arc(43, -5, 15, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = kit.shirt;
  context.beginPath();
  context.moveTo(-35, -38);
  context.quadraticCurveTo(-55, -30, -52, -5);
  context.lineTo(-34, 4);
  context.lineTo(34, 4);
  context.lineTo(52, -5);
  context.quadraticCurveTo(55, -30, 35, -38);
  context.closePath();
  context.fill();
  context.strokeStyle = kit.dark;
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(-36, -32);
  context.lineTo(-50, -9);
  context.moveTo(36, -32);
  context.lineTo(50, -9);
  context.stroke();

  context.fillStyle = skin;
  context.strokeStyle = "#172033";
  context.lineWidth = 5;
  context.beginPath();
  context.arc(0, -58, 39, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = hair;
  context.beginPath();
  context.moveTo(-38, -65);
  context.quadraticCurveTo(-32, -103, 2, -99);
  context.lineTo(13, -111);
  context.lineTo(17, -96);
  context.lineTo(32, -104);
  context.lineTo(27, -88);
  context.quadraticCurveTo(43, -81, 37, -58);
  context.quadraticCurveTo(26, -77, 0, -75);
  context.quadraticCurveTo(-24, -78, -38, -65);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.ellipse(-14, -57, 8, 10, 0, 0, Math.PI * 2);
  context.ellipse(14, -57, 8, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#172033";
  context.beginPath();
  context.arc(-13, -56, 3.4, 0, Math.PI * 2);
  context.arc(13, -56, 3.4, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#6b3f2c";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, -42, 10, 0.2, Math.PI - 0.2);
  context.stroke();

  context.fillStyle = home ? "#172033" : "#ffffff";
  context.font = "900 21px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(player.number), 0, -14);
  context.restore();
}

function drawBall(context: CanvasRenderingContext2D, ball: BallBody) {
  context.save();
  context.translate(ball.x, ball.y);
  context.fillStyle = "rgba(15,23,42,.25)";
  context.beginPath();
  context.ellipse(5, ball.radius + 11, ball.radius * 0.95, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(0, 0, ball.radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#172033";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#172033";
  context.beginPath();
  for (let point = 0; point < 5; point += 1) {
    const angle = -Math.PI / 2 + point * (Math.PI * 2 / 5);
    const x = Math.cos(angle) * 9;
    const y = Math.sin(angle) * 9;
    if (point === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function drawArena(canvas: HTMLCanvasElement, state: ArenaState | null, drag: DragState | null) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, WIDTH, HEIGHT);

  const sky = context.createLinearGradient(0, 0, 0, 140);
  sky.addColorStop(0, "#082f49");
  sky.addColorStop(1, "#0f766e");
  context.fillStyle = sky;
  context.fillRect(0, 0, WIDTH, 128);

  context.fillStyle = "#163e35";
  context.fillRect(0, 66, WIDTH, 62);
  for (let section = 0; section < 32; section += 1) {
    context.fillStyle = ["#a3e635", "#38bdf8", "#facc15", "#f8fafc"][section % 4];
    context.globalAlpha = 0.72;
    context.beginPath();
    context.arc(28 + section * 51, 91 + (section % 2) * 12, 8, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  context.fillStyle = "#8fd02d";
  context.fillRect(0, 108, WIDTH, HEIGHT - 108);
  const stripeHeight = (FIELD.bottom - FIELD.top) / 7;
  for (let stripe = 0; stripe < 7; stripe += 1) {
    context.fillStyle = stripe % 2 === 0 ? "#96d630" : "#7bbb28";
    context.fillRect(0, FIELD.top + stripe * stripeHeight, WIDTH, stripeHeight);
  }

  context.fillStyle = "rgba(3,35,24,.22)";
  context.fillRect(0, 0, WIDTH, 72);
  context.fillStyle = "#d9f99d";
  context.font = "900 24px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText("JOE YOKE ARENA", 32, 45);
  context.textAlign = "right";
  context.fillStyle = "#bae6fd";
  context.fillText("MYAN HUB CUP", WIDTH - 32, 45);

  drawGoal(context, true);
  drawGoal(context, false);

  context.strokeStyle = "#ffffff";
  context.lineWidth = 6;
  context.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
  context.beginPath();
  context.moveTo(WIDTH / 2, FIELD.top);
  context.lineTo(WIDTH / 2, FIELD.bottom);
  context.stroke();
  context.beginPath();
  context.arc(WIDTH / 2, HEIGHT / 2 + 15, 104, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(WIDTH / 2, HEIGHT / 2 + 15, 7, 0, Math.PI * 2);
  context.fill();

  context.strokeRect(FIELD.left, 260, 190, 410);
  context.strokeRect(FIELD.right - 190, 260, 190, 410);
  context.beginPath();
  context.arc(FIELD.left + 130, HEIGHT / 2 + 15, 6, 0, Math.PI * 2);
  context.arc(FIELD.right - 130, HEIGHT / 2 + 15, 6, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(7,17,11,.88)";
  drawRoundedRect(context, 18, 380, 78, 170, 24);
  context.fill();
  context.save();
  context.translate(57, 465);
  context.rotate(-Math.PI / 2);
  context.fillStyle = "#bef264";
  context.font = "900 20px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("JOE YOKE", 0, 7);
  context.restore();

  context.fillStyle = "rgba(7,17,11,.88)";
  drawRoundedRect(context, WIDTH - 96, 380, 78, 170, 24);
  context.fill();
  context.save();
  context.translate(WIDTH - 57, 465);
  context.rotate(Math.PI / 2);
  context.fillStyle = "#7dd3fc";
  context.font = "900 20px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("MYAN HUB", 0, 7);
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
      const capped = Math.min(distance, 260);
      const nx = dx / distance;
      const ny = dy / distance;
      const endX = drag.origin.x + nx * capped;
      const endY = drag.origin.y + ny * capped;
      context.save();
      context.strokeStyle = "rgba(255,255,255,.95)";
      context.lineWidth = 10;
      context.lineCap = "round";
      context.setLineDash([20, 13]);
      context.beginPath();
      context.moveTo(drag.origin.x, drag.origin.y);
      context.lineTo(endX, endY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#facc15";
      context.beginPath();
      context.moveTo(endX + nx * 18, endY + ny * 18);
      context.lineTo(endX - ny * 16 - nx * 12, endY + nx * 16 - ny * 12);
      context.lineTo(endX + ny * 16 - nx * 12, endY - nx * 16 - ny * 12);
      context.closePath();
      context.fill();

      context.fillStyle = "rgba(7,17,11,.84)";
      drawRoundedRect(context, WIDTH / 2 - 170, HEIGHT - 54, 340, 24, 12);
      context.fill();
      const power = capped / 260;
      const powerGradient = context.createLinearGradient(WIDTH / 2 - 164, 0, WIDTH / 2 + 164, 0);
      powerGradient.addColorStop(0, "#38bdf8");
      powerGradient.addColorStop(0.65, "#bef264");
      powerGradient.addColorStop(1, "#fb7185");
      context.fillStyle = powerGradient;
      drawRoundedRect(context, WIDTH / 2 - 164, HEIGHT - 48, 328 * power, 12, 6);
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

function StadiumBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-0 top-0 h-[48%] bg-[linear-gradient(180deg,#38bdf8_0%,#67e8f9_55%,#99f6e4_100%)]" />
      <div className="absolute -left-[8%] top-[18%] h-[52%] w-[62%] origin-left -skew-y-[10deg] border-y-[18px] border-[#d8b4fe]/55 bg-[#243b4a] shadow-[inset_0_70px_0_rgba(255,255,255,.12),inset_0_130px_0_rgba(56,189,248,.08)]" />
      <div className="absolute -right-[8%] top-[18%] h-[52%] w-[62%] origin-right skew-y-[10deg] border-y-[18px] border-[#d8b4fe]/55 bg-[#243b4a] shadow-[inset_0_70px_0_rgba(255,255,255,.12),inset_0_130px_0_rgba(56,189,248,.08)]" />
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[#8fd02d]" />
      <div className="absolute inset-x-[18%] bottom-0 h-[30%] [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)] bg-[repeating-linear-gradient(90deg,#96d630_0_12%,#7bbb28_12%_24%)]" />
      <div className="absolute bottom-[3%] left-1/2 h-[22%] w-[46%] -translate-x-1/2 border-x-2 border-t-2 border-white/75 [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)]" />
      <div className="absolute bottom-[20%] left-1/2 h-[9%] w-[12%] -translate-x-1/2 border-4 border-white/85 bg-white/5 shadow-[inset_0_0_0_2px_rgba(255,255,255,.22)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,transparent_0%,transparent_35%,rgba(2,8,23,.18)_100%)]" />
    </div>
  );
}

function TournamentLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative text-center drop-shadow-[0_10px_0_rgba(20,83,45,.28)]">
      <FootballClashLogo className={`mx-auto ${compact ? "h-20 w-20" : "h-24 w-24 sm:h-32 sm:w-32"}`} />
      <div className="-mt-3 -rotate-1 rounded-[28px] border-4 border-[#052e2b] bg-gradient-to-b from-lime-300 to-lime-500 px-7 py-2 shadow-[0_6px_0_#075985]">
        <p className={`${compact ? "text-lg" : "text-2xl sm:text-4xl"} font-black uppercase italic leading-none tracking-[-.05em] text-[#052e2b]`}>Football Clash</p>
        <p className="mt-1 text-[9px] font-black uppercase tracking-[.32em] text-[#075985]">Joe Yoke Cup</p>
      </div>
    </div>
  );
}

function CartoonButton({ children, onClick, tone = "lime", disabled = false, className = "" }: { children: React.ReactNode; onClick: () => void; tone?: "lime" | "sky" | "violet" | "amber"; disabled?: boolean; className?: string }) {
  const colors = {
    lime: "border-lime-200 bg-lime-400 text-[#12310c] shadow-[0_7px_0_#3f6212]",
    sky: "border-cyan-100 bg-cyan-400 text-[#083344] shadow-[0_7px_0_#0e7490]",
    violet: "border-fuchsia-200 bg-fuchsia-500 text-white shadow-[0_7px_0_#86198f]",
    amber: "border-yellow-100 bg-yellow-400 text-[#422006] shadow-[0_7px_0_#a16207]",
  };
  return <button type="button" onClick={onClick} disabled={disabled} className={`rounded-[22px] border-4 px-6 py-3 text-sm font-black uppercase tracking-[.08em] transition active:translate-y-1 active:shadow-none disabled:opacity-45 ${colors[tone]} ${className}`}>{children}</button>;
}

function ChibiPreview({ team, variant }: { team: Team; variant: number }) {
  const shirt = team === "home" ? ["#a3e635", "#facc15", "#f8fafc"][variant % 3] : ["#38bdf8", "#fb7185", "#c084fc"][variant % 3];
  return (
    <svg viewBox="0 0 90 120" className="h-24 w-20 drop-shadow-[0_6px_0_rgba(0,0,0,.18)]" aria-hidden="true">
      <ellipse cx="45" cy="111" rx="31" ry="7" fill="rgba(0,0,0,.22)" />
      <rect x="21" y="88" width="19" height="20" rx="7" fill="#f8fafc" stroke="#172033" strokeWidth="4" />
      <rect x="50" y="88" width="19" height="20" rx="7" fill="#f8fafc" stroke="#172033" strokeWidth="4" />
      <rect x="13" y="101" width="28" height="11" rx="5" fill="#38bdf8" stroke="#172033" strokeWidth="4" />
      <rect x="49" y="101" width="28" height="11" rx="5" fill="#38bdf8" stroke="#172033" strokeWidth="4" />
      <path d="M16 58Q8 67 15 87l17-5h26l17 5q7-20-1-29L61 48H29Z" fill={shirt} stroke="#172033" strokeWidth="4" />
      <rect x="28" y="79" width="34" height="18" rx="6" fill="#f8fafc" stroke="#172033" strokeWidth="4" />
      <circle cx="45" cy="39" r="27" fill="#d69b6b" stroke="#172033" strokeWidth="4" />
      <path d="M19 38Q17 8 46 9l9-8 1 10 13-5-5 12q10 8 7 24-12-15-28-14-14 0-24 10Z" fill="#172033" stroke="#172033" strokeWidth="3" />
      <circle cx="35" cy="41" r="5" fill="white" /><circle cx="55" cy="41" r="5" fill="white" />
      <circle cx="36" cy="42" r="2" fill="#172033" /><circle cx="54" cy="42" r="2" fill="#172033" />
      <path d="M39 53q6 5 12 0" fill="none" stroke="#7c2d12" strokeWidth="3" strokeLinecap="round" />
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
  const [view, setView] = useState<GameView>(incomingMatchId ? "play" : "menu");
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
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [opponentCountry, setOpponentCountry] = useState<Country>(COUNTRIES[8]);
  const [homeKit, setHomeKit] = useState(0);
  const [awayKit, setAwayKit] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
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
      const targetX = current.ball.x - 105;
      const targetY = current.ball.y + (HEIGHT / 2 - current.ball.y) * 0.12;
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
    const power = Math.min(distance, 260) / 14.05;
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
    setPlayerName(selectedCountry.name);
    setLocalOpponent({ name: opponentCountry.name, isBot: true, avatarIcon: opponentCountry.code, elo: 1180 });
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
      <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-[#082f49] text-white">
        <StadiumBackdrop />
        <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-6 text-center" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {onClose && <button onClick={onClose} className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] grid h-12 w-12 place-items-center rounded-2xl border-4 border-yellow-100 bg-yellow-400 text-2xl font-black text-[#422006] shadow-[0_6px_0_#a16207] active:translate-y-1 active:shadow-none" aria-label="Close Football Clash">{"←"}</button>}
          <div className="mb-5 sm:mb-8"><TournamentLogo /></div>
          <div className="flex w-full max-w-sm flex-col gap-4">
            <CartoonButton onClick={() => setView("country")} disabled={!authReady} tone="sky" className="w-full text-base sm:text-lg">
              <span className="mr-3 text-xl">▶</span>{authReady ? "New tournament" : "Loading arena..."}
            </CartoonButton>
            <CartoonButton onClick={() => {
              const rivals = COUNTRIES.filter((country) => country.code !== selectedCountry.code);
              setOpponentCountry(rivals[Math.floor(Math.random() * rivals.length)]);
              setView("lineup");
            }} disabled={!authReady} tone="lime" className="w-full">
              <span className="mr-3">⚡</span>Quick match
            </CartoonButton>
            {!isGuest && <CartoonButton onClick={() => void beginOnlineMatch()} tone="violet" className="w-full text-xs">Online arena</CartoonButton>}
          </div>
          <p className="mt-5 rounded-full bg-[#052e2b]/75 px-5 py-2 text-[10px] font-black uppercase tracking-[.18em] text-lime-200 backdrop-blur">{isGuest ? "Guest mode · no sign-in required" : "Tournament or live multiplayer"}</p>
          <button onClick={() => setSoundOn((current) => !current)} className="absolute bottom-[max(1.1rem,env(safe-area-inset-bottom))] left-4 grid h-14 w-14 place-items-center rounded-2xl border-4 border-yellow-100 bg-yellow-400 text-2xl shadow-[0_6px_0_#a16207] active:translate-y-1 active:shadow-none" aria-label={soundOn ? "Mute sound" : "Enable sound"}>{soundOn ? "🔊" : "🔇"}</button>
          <button onClick={() => { setMessage("Choose a player, drag toward the target, then release."); window.setTimeout(() => setMessage(null), 2600); }} className="absolute bottom-[max(1.1rem,env(safe-area-inset-bottom))] right-4 grid h-14 w-14 place-items-center rounded-2xl border-4 border-yellow-100 bg-yellow-400 text-2xl font-black text-[#422006] shadow-[0_6px_0_#a16207] active:translate-y-1 active:shadow-none" aria-label="How to play">i</button>
          {message && <div className="absolute bottom-24 left-1/2 w-[min(90%,420px)] -translate-x-1/2 rounded-2xl border-2 border-white/50 bg-[#052e2b]/90 px-4 py-3 text-xs font-bold shadow-xl">{message}</div>}
        </div>
      </div>
    );
  }

  if (view === "country") {
    return (
      <div className="fixed inset-0 z-[100] select-none overflow-y-auto bg-[#082f49] text-white">
        <StadiumBackdrop />
        <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 py-5 sm:px-8" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-between">
            <CartoonButton onClick={() => setView("menu")} tone="violet" className="px-4 py-2">← Back</CartoonButton>
            <div className="hidden sm:block"><TournamentLogo compact /></div>
            <div className="w-24" />
          </div>
          <section className="my-auto rounded-[38px] border-4 border-white/30 bg-[#082f49]/85 p-4 shadow-[0_12px_0_rgba(4,47,46,.55)] backdrop-blur-md sm:p-7">
            <p className="text-center text-xs font-black uppercase tracking-[.3em] text-lime-300">Joe Yoke Cup</p>
            <h2 className="mt-1 text-center text-2xl font-black uppercase italic sm:text-4xl">Choose your nation</h2>
            <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-3">
              {COUNTRIES.map((country) => {
                const active = selectedCountry.code === country.code;
                return (
                  <button key={country.code} onClick={() => setSelectedCountry(country)} className={"group rounded-2xl border-4 p-2 transition active:scale-95 " + (active ? "border-yellow-300 bg-lime-300/25 shadow-[0_5px_0_#a16207]" : "border-white/12 bg-white/8 hover:bg-white/15")} aria-label={"Select " + country.name}>
                    <span className="block text-3xl sm:text-4xl">{country.flag}</span>
                    <span className={"mt-1 block truncate text-[8px] font-black uppercase sm:text-[10px] " + (active ? "text-yellow-200" : "text-white/70")}>{country.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <div className="mt-5 flex items-center justify-center gap-3">
            <CartoonButton onClick={() => setSelectedCountry(COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)])} tone="lime">↝ Random</CartoonButton>
            <CartoonButton onClick={() => {
              const rivals = COUNTRIES.filter((country) => country.code !== selectedCountry.code);
              setOpponentCountry(rivals[Math.floor(Math.random() * rivals.length)]);
              setView("road");
            }} tone="sky">Next ▶</CartoonButton>
          </div>
        </div>
      </div>
    );
  }

  if (view === "road") {
    const stages = ["Matchday 1", "Matchday 2", "Matchday 3", "Round of 16", "Quarter final", "Semi final", "Final"];
    return (
      <div className="fixed inset-0 z-[100] select-none overflow-y-auto bg-[#082f49] text-white">
        <StadiumBackdrop />
        <div className="relative mx-auto flex min-h-full max-w-7xl flex-col px-4 py-5 sm:px-8" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-between">
            <CartoonButton onClick={() => setView("country")} tone="violet" className="px-4 py-2">← Back</CartoonButton>
            <h2 className="rounded-b-[28px] border-x-4 border-b-4 border-white/25 bg-[#334155]/90 px-7 py-3 text-xl font-black uppercase italic shadow-[0_7px_0_rgba(15,23,42,.45)] sm:text-3xl">Road to the final</h2>
            <span className="text-4xl drop-shadow-lg" aria-label="Trophy">🏆</span>
          </div>
          <section className="my-auto rounded-[38px] border-4 border-white/30 bg-[#082f49]/82 p-4 shadow-[0_12px_0_rgba(4,47,46,.55)] backdrop-blur-md sm:p-7">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-7">
              {stages.map((stage, index) => (
                <div key={stage} className={"rounded-2xl border-4 p-3 text-center " + (index === 0 ? "border-yellow-300 bg-yellow-300/12" : "border-white/10 bg-white/8")}>
                  <p className="min-h-8 text-[9px] font-black uppercase leading-4 text-white/70">{stage}</p>
                  <div className="mt-3 flex items-center justify-center gap-2 text-2xl">
                    <span>{selectedCountry.flag}</span>
                    <span className="text-xs font-black">VS</span>
                    <span>{index === 0 ? opponentCountry.flag : "❔"}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-black/20 px-4 py-3 text-center">
              <span className="text-4xl">{selectedCountry.flag}</span>
              <div><p className="text-[9px] font-black uppercase tracking-widest text-lime-300">Opening match</p><p className="text-lg font-black uppercase">{selectedCountry.name} vs {opponentCountry.name}</p></div>
              <span className="text-4xl">{opponentCountry.flag}</span>
            </div>
          </section>
          <div className="mt-5 flex justify-center"><CartoonButton onClick={() => setView("lineup")} tone="lime" className="min-w-56 text-lg">Build squad ▶</CartoonButton></div>
        </div>
      </div>
    );
  }

  if (view === "lineup") {
    return (
      <div className="fixed inset-0 z-[100] select-none overflow-y-auto bg-[#082f49] text-white">
        <StadiumBackdrop />
        <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 py-5 sm:px-8" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center justify-between">
            <CartoonButton onClick={() => setView("road")} tone="violet" className="px-4 py-2">← Back</CartoonButton>
            <div className="rounded-[24px] border-4 border-white/25 bg-[#334155]/90 px-6 py-2 text-center shadow-[0_6px_0_rgba(15,23,42,.45)]"><p className="text-[9px] font-black uppercase tracking-widest text-lime-300">Matchday 1</p><p className="text-xl font-black uppercase italic">Squad selection</p></div>
            <div className="w-24" />
          </div>
          <section className="my-auto grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="rounded-[34px] border-4 border-lime-200/60 bg-[#052e2b]/82 p-4 text-center shadow-[0_10px_0_#365314] backdrop-blur">
              <div className="flex items-center justify-center gap-2"><span className="text-4xl">{selectedCountry.flag}</span><h3 className="text-xl font-black uppercase">{selectedCountry.name}</h3></div>
              <div className="mt-4 flex items-end justify-center">{[0, 1, 2].map((index) => <ChibiPreview key={index} team="home" variant={homeKit + index} />)}</div>
              <CartoonButton onClick={() => setHomeKit((value) => (value + 1) % 3)} tone="amber" className="mt-3 px-4 py-2 text-xs">↝ Change kit</CartoonButton>
            </div>
            <div className="text-center text-4xl font-black italic drop-shadow-[0_5px_0_#0f172a]">VS</div>
            <div className="rounded-[34px] border-4 border-sky-200/60 bg-[#082f49]/82 p-4 text-center shadow-[0_10px_0_#075985] backdrop-blur">
              <div className="flex items-center justify-center gap-2"><span className="text-4xl">{opponentCountry.flag}</span><h3 className="text-xl font-black uppercase">{opponentCountry.name}</h3></div>
              <div className="mt-4 flex items-end justify-center">{[0, 1, 2].map((index) => <ChibiPreview key={index} team="away" variant={awayKit + index} />)}</div>
              <CartoonButton onClick={() => setAwayKit((value) => (value + 1) % 3)} tone="amber" className="mt-3 px-4 py-2 text-xs">↝ Change rival</CartoonButton>
            </div>
          </section>
          <div className="mt-5 flex justify-center"><CartoonButton onClick={startBotMatch} disabled={!authReady} tone="lime" className="min-w-64 text-xl">▶ Play match</CartoonButton></div>
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
      <div className="absolute inset-0 flex items-center justify-center bg-[#071a12]">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Joe Yoke three versus three football arena" className={`${canFlick ? "cursor-crosshair" : "cursor-default"}`} style={{ touchAction: "none", width: "min(100vw, 177.778vh)", height: "min(56.25vw, 100vh)" }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishPointer} onPointerCancel={cancelPointer} />
      </div>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3" style={{ paddingTop: "max(.65rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto grid max-w-4xl grid-cols-[48px_1fr_48px] items-center gap-2">
          <button onClick={onClose ?? (() => setView("menu"))} className="pointer-events-auto grid h-11 w-11 place-items-center rounded-2xl border-4 border-yellow-100 bg-yellow-400 text-xl font-black text-[#422006] shadow-[0_5px_0_#a16207] active:translate-y-1 active:shadow-none" aria-label="Leave arena">{"Ⅱ"}</button>
          <div className="overflow-hidden rounded-[22px] border-4 border-white/30 bg-[#365314]/92 shadow-[0_7px_0_rgba(20,83,45,.65)] backdrop-blur-xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <div className={`flex min-w-0 items-center gap-2 px-3 py-1.5 ${game?.currentTurn === "home" ? "bg-lime-300/20" : ""}`}><span className="text-2xl sm:text-3xl">{selectedCountry.flag}</span><p className="hidden truncate text-[9px] font-black uppercase tracking-wide text-lime-100 sm:block">{playerLabels.home}</p><p className="ml-auto text-2xl font-black tabular-nums">{game?.score.home ?? 0}</p></div>
              <div className="grid min-w-[94px] place-items-center border-x border-white/20 bg-black/15 px-3 py-1.5"><p className={`text-lg font-black tabular-nums ${game?.suddenDeath ? "text-rose-300" : "text-white"}`}>{displayClock}</p><p className="text-[7px] font-black uppercase tracking-[.22em] text-lime-200">Joe Yoke</p></div>
              <div className={`flex min-w-0 items-center gap-2 px-3 py-1.5 text-right ${game?.currentTurn === "away" ? "bg-sky-300/20" : ""}`}><p className="text-2xl font-black tabular-nums">{game?.score.away ?? 0}</p><p className="hidden min-w-0 flex-1 truncate text-[9px] font-black uppercase tracking-wide text-sky-100 sm:block">{playerLabels.away}</p><span className="ml-auto text-2xl sm:text-3xl">{opponentCountry.flag}</span></div>
            </div>
          </div>
          <div className={`grid h-11 w-11 place-items-center rounded-2xl border-4 bg-[#052e2b]/90 text-lg font-black shadow-[0_5px_0_#0f172a] ${connection === "error" ? "border-rose-300 text-rose-300" : "border-lime-200 text-lime-300"}`} aria-label={`Network ${connection}`}>{connection === "error" ? "!" : "●"}</div>
        </div>
        <div className="mx-auto mt-2 max-w-sm rounded-full border border-white/10 bg-black/55 px-4 py-2 text-center text-[9px] font-black uppercase tracking-[.16em] text-white/75 backdrop-blur-md">{statusText}</div>
      </header>
      {showingLoader && <div className="absolute inset-0 z-40 grid place-items-center bg-[#030806]/88 px-8 text-center backdrop-blur-sm"><div><FootballClashLogo className="mx-auto h-20 w-20 animate-pulse" /><p className="mt-5 text-xs font-black uppercase tracking-[.25em]">Preparing Joe Yoke Arena</p><p className="mt-2 text-[11px] text-white/45">Setting the teams and match clock...</p></div></div>}
      {!showingLoader && !opponentReady && <div className="absolute inset-x-5 top-1/2 z-30 -translate-y-1/2 rounded-3xl border border-white/10 bg-black/76 p-6 text-center backdrop-blur-xl"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-lime-300" /><p className="mt-4 text-sm font-black uppercase tracking-[.18em]">Waiting for opponent</p></div>}
      {!showingLoader && opponentReady && game?.phase !== "finished" && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 text-center" style={{ paddingBottom: "max(.8rem, env(safe-area-inset-bottom))" }}><div className={`mx-auto max-w-sm rounded-2xl border px-4 py-3 backdrop-blur-xl ${canFlick ? "border-lime-300/35 bg-[#07110b]/82" : "border-white/10 bg-black/58"}`}><p className={`text-[10px] font-black uppercase tracking-[.2em] ${canFlick ? "text-lime-300" : "text-white/55"}`}>{canFlick ? "Choose player - drag - release" : statusText}</p>{canFlick && <p className="mt-1 text-[9px] text-white/42">Longer drag gives more power. Bank shots off players and walls.</p>}</div></div>}
      {message && game?.phase !== "finished" && <div className="pointer-events-none absolute left-1/2 top-[20%] z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/12 bg-black/82 px-5 py-2 text-xs font-black uppercase tracking-[.18em] text-white shadow-2xl">{message}</div>}
      {game?.phase === "finished" && game.winner && role && <div className="absolute inset-0 z-50 grid place-items-center bg-[#052e2b]/82 px-6 backdrop-blur-md"><div className="w-full max-w-md rounded-[38px] border-4 border-lime-200/60 bg-[#091710] p-7 text-center shadow-[0_12px_0_#365314]"><FootballClashLogo className="mx-auto h-20 w-20" /><p className="mt-4 text-[10px] font-black uppercase tracking-[.34em] text-lime-300">Full time</p><h2 className="mt-2 text-3xl font-black uppercase italic tracking-tight">{game.winner === role ? "Arena champions" : `${playerLabels[game.winner]} win`}</h2><p className="mt-3 text-sm text-white/50">Final score <span className="ml-1 font-black text-white">{game.score.home} - {game.score.away}</span></p>{isBotMatch && <CartoonButton onClick={startBotMatch} tone="lime" className="mt-7 w-full">Play again</CartoonButton>}<CartoonButton onClick={onClose ?? (() => setView("menu"))} tone="sky" className="mt-4 w-full">Back to arcade</CartoonButton></div></div>}
    </div>
  );
}
