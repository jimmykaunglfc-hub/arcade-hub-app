"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import {
  Anchor,
  ArrowLeft,
  Bot,
  BusFront,
  Building2,
  CarFront,
  Crown,
  Gem,
  Gift,
  Hand,
  House,
  Lightbulb,
  LockKeyhole,
  Plane,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrainFront,
  Trophy,
  WandSparkles,
  X,
} from "lucide-react";

interface MonopolyProps {
  onBack?: () => void;
  onClose?: () => void;
  userId?: string;
  roomId?: string | null;
}

const MONOPOLY_BOT_ID_PREFIX = "00000000-0000-4000-8000-";
const getMonopolyBotId = (seat: number) => `${MONOPOLY_BOT_ID_PREFIX}${String(seat).padStart(12, "0")}`;
const isMonopolyBotId = (id: string | null | undefined) => Boolean(id?.startsWith(MONOPOLY_BOT_ID_PREFIX));

type SpaceKind = "property" | "station" | "utility" | "chance" | "chest" | "tax" | "go" | "parking" | "jail" | "go-to-jail";
type TokenKind = "car" | "trophy" | "robot" | "diamond";
type TransportType = "airport" | "railway" | "bus-terminal" | "port";
type GamePhase = "setup" | "playing";

interface BoardSpace {
  id: string;
  label: string;
  kind: SpaceKind;
  color?: string;
  cost?: number;
  rent?: number;
  taxAmount?: number;
  transportType?: TransportType;
}

interface PlayerTemplate {
  id: string;
  username: string;
  token: TokenKind;
  color: string;
  tint: string;
}

interface Player extends PlayerTemplate {
  cash: number;
  points: number;
  position: number;
  ownedSpaceIds: string[];
  propertyLevels: Record<string, number>;
  mortgagedSpaceIds: string[];
  jailFreeCards: number;
  bankrupt: boolean;
  inJail: boolean;
  jailAttempts: number;
}

interface ActionLog {
  title: string;
  highlight: string;
}

type AlertKind = "purchase" | "payment" | "notice" | "owned" | "auction" | "inspect" | "card";

interface GameAlert {
  kind: AlertKind;
  title: string;
  message: string;
  spaceId?: string;
  amount?: number;
  autoPassOnDismiss?: boolean;
}

interface DrawCard {
  id: string;
  title: string;
  description: string;
  cashDelta?: number;
  jailFreeCards?: number;
}

interface AuctionState {
  spaceId: string;
  sellerId: string;
  bids: Record<string, number>;
}

type BoardActionKind = "build" | "sell" | "mortgage" | "redeem" | "trade";

interface TradeDraft {
  proposerId: string;
  recipientId: string;
  offeredCash: number;
  requestedCash: number;
  offeredPropertyId: string | null;
  requestedPropertyId: string | null;
  offeredJailFreeCard: boolean;
  requestedJailFreeCard: boolean;
  awaitingConfirmation: boolean;
}

interface ActionPanel {
  kind: BoardActionKind;
  trade?: TradeDraft;
}

interface BalanceChange {
  playerId: string;
  cashDelta?: number;
  jailFreeCardsDelta?: number;
}

type PendingTransaction =
  | { kind: "balance"; changes: BalanceChange[]; autoPassAfterConfirmation: boolean }
  | { kind: "rent"; payerId: string; recipientId: string; spaceId: string; amount: number; autoPassAfterConfirmation: boolean }
  | { kind: "bank-fee"; playerId: string; amount: number; bankruptIfInsufficient: boolean; autoPassAfterConfirmation: boolean };

interface GameState {
  players: Player[];
  activePlayerId: string;
  roundsLeft: number;
  dice: [number, number];
  hasRolled: boolean;
  hasJourneyStarted: boolean;
  pendingPurchaseId: string | null;
  alert: GameAlert | null;
  auction: AuctionState | null;
  actionPanel: ActionPanel | null;
  autoPassPlayerId: string | null;
  pendingTransactions: PendingTransaction[];
  turnWarning: boolean;
  finalPointsAwarded: boolean;
  winnerId: string | null;
  actionLog: ActionLog;
}

interface BrowserScreenOrientation {
  lock?: (orientation: "portrait" | "landscape") => Promise<void>;
  unlock?: () => void;
}

const STARTING_CASH = 1500;
const GO_SALARY = 200;
const JAIL_FINE = 50;
const TURN_DURATION_SECONDS = 60;
const INACTIVITY_WARNING_AFTER_SECONDS = 40;
const MAX_PROPERTY_LEVEL = 5;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const PLAYER_TEMPLATES: PlayerTemplate[] = [
  { id: "whereuk82", username: "whereuk82", token: "car", color: "#37b9ff", tint: "#0b5c95" },
  { id: "meowster88", username: "Meowster88", token: "trophy", color: "#c084fc", tint: "#6c2cb1" },
  { id: "puppower", username: "PupPower", token: "robot", color: "#f9c928", tint: "#9b6510" },
  { id: "pandapal", username: "PandaPal", token: "diamond", color: "#6ee05d", tint: "#23713a" },
];

const CHEST_CARDS: DrawCard[] = [
  { id: "chest-tourism", title: "Tourism grant", description: "ASEAN visitors boost your city campaign.", cashDelta: 120 },
  { id: "chest-repair", title: "Platform repair", description: "Your crystal table needs a quick repair.", cashDelta: -65 },
  { id: "chest-festival", title: "Festival dividend", description: "Your local festival sold out.", cashDelta: 90 },
];

const CHANCE_CARDS: DrawCard[] = [
  { id: "chance-investor", title: "Investor spotlight", description: "A regional investor backs your next move.", cashDelta: 150 },
  { id: "chance-flight", title: "Last-minute flight", description: "Pay for a surprise travel detour.", cashDelta: -80 },
  { id: "chance-neon", title: "Neon landmark award", description: "Your skyline earns a design award.", cashDelta: 75 },
  { id: "chance-jail-free", title: "Travel clearance", description: "Keep this card for a future Jail escape or trade it with another player.", cashDelta: 0, jailFreeCards: 1 },
];

function getCardCashDelta(card: DrawCard) {
  if (typeof card.cashDelta === "number" && Number.isFinite(card.cashDelta)) return Math.trunc(card.cashDelta);

  const cardText = `${card.title} ${card.description}`;
  const amountMatch = cardText.match(/(?:[+-]\s*\$?|\$\s*)(\d+(?:\.\d+)?)/);
  if (!amountMatch) return 0;
  const amount = Math.round(Number(amountMatch[1]));
  const isDeduction = /-\s*\$?\s*\d|\b(pay|lose|deduct|penalty|fine|repair|charge)\b/i.test(cardText);
  return isDeduction ? -amount : amount;
}

const boardSpaces: BoardSpace[] = [
  { id: "go", label: "GO", kind: "go" },
  { id: "manila", label: "MANILA", kind: "property", color: "#f5d547", cost: 60, rent: 6 },
  { id: "cebu", label: "CEBU", kind: "property", color: "#f5d547", cost: 70, rent: 7 },
  { id: "income-tax", label: "INCOME TAX", kind: "tax", taxAmount: 200 },
  { id: "chance-bottom", label: "BUS TERMINAL", kind: "station", transportType: "bus-terminal", cost: 200, rent: 35 },
  { id: "phnom-penh", label: "PHNOM PENH", kind: "property", color: "#63c96b", cost: 80, rent: 8 },
  { id: "siem-reap", label: "SIEM REAP", kind: "property", color: "#63c96b", cost: 90, rent: 9 },
  { id: "chest-bottom-2", label: "SIHANOUKVILLE", kind: "property", color: "#63c96b", cost: 100, rent: 10 },
  { id: "just-visiting", label: "JAIL", kind: "jail" },
  { id: "phuket", label: "PHUKET", kind: "property", color: "#72c9e8", cost: 100, rent: 10 },
  { id: "bangkok", label: "BANGKOK", kind: "property", color: "#72c9e8", cost: 110, rent: 11 },
  { id: "chance-left", label: "CHANCE", kind: "chance" },
  { id: "mandalay", label: "MANDALAY", kind: "property", color: "#8b5a2b", cost: 120, rent: 12 },
  { id: "yangon", label: "YANGON", kind: "property", color: "#8b5a2b", cost: 130, rent: 13 },
  { id: "chest-left", label: "BAGAN", kind: "property", color: "#8b5a2b", cost: 140, rent: 14 },
  { id: "asean-station", label: "RAILWAY STATION", kind: "station", transportType: "railway", cost: 200, rent: 35 },
  { id: "free-parking", label: "FREE PARKING", kind: "parking" },
  { id: "hanoi", label: "HANOI", kind: "property", color: "#f294bc", cost: 140, rent: 14 },
  { id: "ho-chi-minh", label: "HO CHI MINH", kind: "property", color: "#f294bc", cost: 150, rent: 15 },
  { id: "chest-top", label: "AIRPORT", kind: "station", transportType: "airport", cost: 200, rent: 35 },
  { id: "kuala-lumpur", label: "KUALA LUMPUR", kind: "property", color: "#f28945", cost: 160, rent: 16 },
  { id: "penang", label: "PENANG", kind: "property", color: "#f28945", cost: 170, rent: 17 },
  { id: "malacca", label: "MALACCA", kind: "property", color: "#f28945", cost: 180, rent: 18 },
  { id: "chance-top", label: "JOHOR BAHRU", kind: "property", color: "#f28945", cost: 190, rent: 19 },
  { id: "go-to-jail", label: "GO TO JAIL", kind: "go-to-jail" },
  { id: "jakarta", label: "JAKARTA", kind: "property", color: "#eb5757", cost: 190, rent: 19 },
  { id: "surabaya", label: "SURABAYA", kind: "property", color: "#eb5757", cost: 200, rent: 20 },
  { id: "bali", label: "BALI", kind: "property", color: "#eb5757", cost: 210, rent: 21 },
  { id: "chest-right", label: "CHEST", kind: "chest" },
  { id: "vientiane", label: "VIENTIANE", kind: "property", color: "#264e86", cost: 220, rent: 22 },
  { id: "luang-prabang", label: "LUANG PRABANG", kind: "property", color: "#264e86", cost: 230, rent: 23 },
  { id: "chance-right", label: "PORT", kind: "station", transportType: "port", cost: 200, rent: 35 },
];

const topTileIds = ["free-parking", "hanoi", "ho-chi-minh", "chest-top", "kuala-lumpur", "penang", "malacca", "chance-top", "go-to-jail"];
const leftTileIds = ["asean-station", "chest-left", "yangon", "mandalay", "chance-left", "bangkok", "phuket"];
const rightTileIds = ["jakarta", "surabaya", "bali", "chest-right", "vientiane", "luang-prabang", "chance-right"];
const bottomTileIds = ["just-visiting", "chest-bottom-2", "siem-reap", "phnom-penh", "chance-bottom", "income-tax", "cebu", "manila", "go"];

const spacesById = new Map(boardSpaces.map((space) => [space.id, space]));
const jailPosition = Math.max(0, boardSpaces.findIndex((space) => space.kind === "jail"));

const pipLayouts: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[27, 27], [73, 73]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[27, 23], [73, 23], [27, 50], [73, 50], [27, 77], [73, 77]],
};

function getSpace(id: string) {
  return spacesById.get(id) ?? boardSpaces[0];
}

function isOwnable(space: BoardSpace) {
  return space.kind === "property" || space.kind === "station" || space.kind === "utility";
}

function getFinalPoints(player: Player) {
  return Math.round(player.cash * 0.1);
}

function awardFinalPoints(players: Player[]) {
  return players.map((player) => ({ ...player, points: getFinalPoints(player) }));
}

function getPropertyLevel(player: Player, spaceId: string) {
  return player.propertyLevels[spaceId] ?? 0;
}

function getPropertyPrice(space: BoardSpace) {
  return space.cost ?? 0;
}

function getRentTiers(space: BoardSpace) {
  const baseRent = space.rent ?? 0;
  const oneHouseRent = getPropertyPrice(space) || baseRent;
  return [baseRent, oneHouseRent, oneHouseRent * 3, oneHouseRent * 7, oneHouseRent * 16, oneHouseRent * 35];
}

function getPropertyRent(space: BoardSpace, level: number, hasCompleteSet = false) {
  const rent = getRentTiers(space)[Math.min(Math.max(level, 0), MAX_PROPERTY_LEVEL)] ?? 0;
  return level === 0 && space.kind === "property" && hasCompleteSet ? rent * 2 : rent;
}

function getConstructionCost(space: BoardSpace) {
  return getRentTiers(space)[1] ?? Math.max(10, getPropertyPrice(space));
}

function getUpgradeCost(space: BoardSpace, targetLevel = 1) {
  const tier = Math.min(Math.max(targetLevel, 1), MAX_PROPERTY_LEVEL);
  return getRentTiers(space)[tier] ?? getConstructionCost(space);
}

function getMortgageValue(space: BoardSpace) {
  return Math.round(getPropertyPrice(space) / 2);
}

function getColorSet(space: BoardSpace) {
  return boardSpaces.filter((candidate) => candidate.kind === "property" && candidate.color === space.color);
}

function hasCompleteColorSet(player: Player, space: BoardSpace) {
  const colorSet = getColorSet(space);
  return colorSet.length > 0 && colorSet.every((candidate) => player.ownedSpaceIds.includes(candidate.id) && !player.mortgagedSpaceIds.includes(candidate.id));
}

function hasAnyBuildingsInColorSet(player: Player, space: BoardSpace) {
  return getColorSet(space).some((candidate) => getPropertyLevel(player, candidate.id) > 0);
}

function canBuildEvenly(player: Player, space: BoardSpace) {
  if (!hasCompleteColorSet(player, space)) return false;
  const level = getPropertyLevel(player, space.id);
  if (level >= MAX_PROPERTY_LEVEL) return false;
  const lowestLevel = Math.min(...getColorSet(space).map((candidate) => getPropertyLevel(player, candidate.id)));
  return level === lowestLevel;
}

function canSellEvenly(player: Player, space: BoardSpace) {
  const level = getPropertyLevel(player, space.id);
  if (level <= 0) return false;
  const highestLevel = Math.max(...getColorSet(space).map((candidate) => getPropertyLevel(player, candidate.id)));
  return level === highestLevel;
}

function getNextActivePlayer(players: Player[], currentId: string) {
  const start = players.findIndex((player) => player.id === currentId);
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(start + offset) % players.length];
    if (!candidate.bankrupt) return candidate;
  }
  return players[Math.max(0, start)];
}

function getWinner(players: Player[]) {
  const remaining = players.filter((player) => !player.bankrupt);
  return remaining.length === 1 ? remaining[0] : null;
}

function getQueuedCashDelta(transactions: PendingTransaction[], playerId: string) {
  return transactions.reduce((total, transaction) => transaction.kind === "balance" ? total + transaction.changes.filter((change) => change.playerId === playerId).reduce((changeTotal, change) => changeTotal + (change.cashDelta ?? 0), 0) : total, 0);
}

function commitPendingTransactions(current: GameState): GameState {
  if (current.pendingTransactions.length === 0) return current;
  let players = current.players;

  current.pendingTransactions.forEach((transaction) => {
    if (transaction.kind === "balance") {
      players = players.map((player) => {
        const change = transaction.changes.find((item) => item.playerId === player.id);
        return change ? { ...player, cash: Math.max(0, player.cash + (change.cashDelta ?? 0)), jailFreeCards: Math.max(0, player.jailFreeCards + (change.jailFreeCardsDelta ?? 0)) } : player;
      });
      return;
    }

    if (transaction.kind === "bank-fee") {
      const player = players.find((item) => item.id === transaction.playerId);
      if (!player) return;
      players = players.map((item) => item.id !== player.id ? item : { ...item, cash: Math.max(0, item.cash - transaction.amount) });
      return;
    }

    const payer = players.find((player) => player.id === transaction.payerId);
    const recipient = players.find((player) => player.id === transaction.recipientId);
    if (!payer || !recipient) return;
    if (payer.cash < transaction.amount) {
      players = players.map((player) => {
        if (player.id === payer.id) return { ...player, cash: 0 };
        if (player.id === recipient.id) return { ...player, cash: player.cash + payer.cash };
        return player;
      });
    } else {
      players = players.map((player) => {
        if (player.id === payer.id) return { ...player, cash: player.cash - transaction.amount };
        if (player.id === recipient.id) return { ...player, cash: player.cash + transaction.amount };
        return player;
      });
    }
  });

  return { ...current, players, pendingTransactions: [], winnerId: getWinner(players)?.id ?? null };
}

function getNextTurnState(current: GameState, reason: "timeout" | "system"): GameState {
  if (current.winnerId) return current;
  const nextPlayer = getNextActivePlayer(current.players, current.activePlayerId);
  const currentIndex = current.players.findIndex((item) => item.id === current.activePlayerId);
  const nextIndex = current.players.findIndex((item) => item.id === nextPlayer.id);
  const roundsLeft = nextIndex <= currentIndex ? Math.max(0, current.roundsLeft - 1) : current.roundsLeft;
  const endGamePlayers = roundsLeft === 0 ? awardFinalPoints(current.players) : current.players;
  const timedWinner = roundsLeft === 0 ? [...endGamePlayers].filter((item) => !item.bankrupt).sort((first, second) => second.points - first.points || second.cash - first.cash)[0] : null;
  const actionLog = timedWinner
    ? { title: "30 rounds complete", highlight: `${timedWinner.username.toUpperCase()} WINS` }
    : reason === "timeout"
      ? { title: "TURN AUTO-PASSED", highlight: `${nextPlayer.username.toUpperCase()} · TAP THE DICE` }
      : { title: "NEXT PLAYER READY", highlight: `${nextPlayer.username.toUpperCase()} · TAP THE DICE` };
  return { ...current, players: endGamePlayers, activePlayerId: nextPlayer.id, hasRolled: false, pendingPurchaseId: null, alert: null, auction: null, actionPanel: null, autoPassPlayerId: null, pendingTransactions: [], turnWarning: false, finalPointsAwarded: Boolean(timedWinner), roundsLeft, winnerId: timedWinner?.id ?? null, actionLog };
}

function createGameState(playerCount: number): GameState {
  const players = PLAYER_TEMPLATES.slice(0, playerCount).map((template) => ({
    ...template,
    cash: STARTING_CASH,
    points: 0,
    position: 0,
    ownedSpaceIds: [],
    propertyLevels: {},
    mortgagedSpaceIds: [],
    jailFreeCards: 0,
    bankrupt: false,
    inJail: false,
    jailAttempts: 0,
  }));

  return {
    players,
    activePlayerId: players[0]?.id ?? PLAYER_TEMPLATES[0].id,
    roundsLeft: 30,
    dice: [5, 1],
    hasRolled: false,
    hasJourneyStarted: false,
    pendingPurchaseId: null,
    alert: null,
    auction: null,
    actionPanel: null,
    autoPassPlayerId: null,
    pendingTransactions: [],
    turnWarning: false,
    finalPointsAwarded: false,
    winnerId: null,
    actionLog: { title: "Crystal table ready", highlight: "YOUR TURN" },
  };
}

function TokenGlyph({ token, className = "h-full w-full" }: { token: TokenKind; className?: string }) {
  if (token === "car") return <CarFront className={className} strokeWidth={2.5} />;
  if (token === "trophy") return <Trophy className={className} strokeWidth={2.5} />;
  if (token === "robot") return <Bot className={className} strokeWidth={2.3} />;
  return <Gem className={className} strokeWidth={2.3} />;
}

function ToyPawn({ player, active, compact = false }: { player: Player; active: boolean; compact?: boolean }) {
  const size = compact ? "h-4 w-4" : "h-10 w-10";
  const iconSize = compact ? "h-2.5 w-2.5" : "h-6 w-6";

  return (
    <span className={`relative inline-grid shrink-0 place-items-center ${size}`} aria-label={`${player.username} pawn`}>
      <span className={`absolute bottom-0 h-[25%] w-[78%] rounded-[50%] bg-black/65 blur-[2px] ${active ? "animate-[monopoly-aura_1.3s_ease-in-out_infinite]" : ""}`} style={{ boxShadow: active ? `0 0 10px 4px ${player.color}` : undefined }} />
      <span className={`relative grid h-[84%] w-[84%] place-items-center rounded-[38%] border bg-[linear-gradient(135deg,rgba(255,255,255,.95),rgba(255,255,255,.18)_32%,rgba(0,0,0,.22))] shadow-[inset_0_2px_3px_rgba(255,255,255,.85),inset_0_-3px_5px_rgba(0,0,0,.35),0_3px_5px_rgba(0,0,0,.55)] ${active ? "animate-[monopoly-pawn_1.5s_ease-in-out_infinite]" : ""}`} style={{ color: player.color, borderColor: player.color, backgroundColor: player.tint }}>
        <TokenGlyph token={player.token} className={iconSize} />
      </span>
    </span>
  );
}

function Pips({ value, crystal = false }: { value: number; crystal?: boolean }) {
  const pipMaterial = crystal
    ? "border border-[#ffe8a0]/80 bg-[radial-gradient(circle_at_35%_28%,#fffbe1_0_8%,#ffd56a_25%,#a95708_72%,#4a2504_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,.95),0_0_7px_rgba(255,190,58,.9)]"
    : value === 1 || value === 4
      ? "border border-[#ff9ba0]/90 bg-[radial-gradient(circle_at_35%_28%,#ffb4b6_0_12%,#ef3347_42%,#9d0b1b_100%)] shadow-[inset_-1px_-2px_2px_rgba(84,0,12,.38),0_1px_2px_rgba(38,3,7,.62)]"
      : "bg-[#0b0c0f] shadow-[inset_0_1px_1px_rgba(255,255,255,.45),0_1px_1px_rgba(0,0,0,.55)]";

  return (
    <>
      {pipLayouts[value].map(([left, top], index) => (
        <span key={`${left}-${top}-${index}`} className={`absolute h-[16%] w-[16%] rounded-full ${pipMaterial}`} style={{ left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -50%)" }} />
      ))}
    </>
  );
}

function StageDie({ value, rolling, delay = 0 }: { value: number; rolling: boolean; delay?: number }) {
  const faceValues = [value, 7 - value, 6, 1, 5, 2];
  const faceTransforms = [
    "translateZ(clamp(16px,3.65vw,25px))",
    "rotateY(180deg) translateZ(clamp(16px,3.65vw,25px))",
    "rotateY(90deg) translateZ(clamp(16px,3.65vw,25px))",
    "rotateY(-90deg) translateZ(clamp(16px,3.65vw,25px))",
    "rotateX(90deg) translateZ(clamp(16px,3.65vw,25px))",
    "rotateX(-90deg) translateZ(clamp(16px,3.65vw,25px))",
  ];
  const faceShading = ["brightness(1.08)", "brightness(.72)", "brightness(.9)", "brightness(.8)", "brightness(1.14)", "brightness(.68)"];
  const animationStyle = { animationDelay: `${delay}ms` } as CSSProperties;
  const rollAnimation = delay ? "animate-[monopoly-stage-die-roll-alt_680ms_cubic-bezier(.18,.78,.18,1)]" : "animate-[monopoly-stage-die-roll_680ms_cubic-bezier(.18,.78,.18,1)]";
  const dieMaterial = "border-[#9aaab7] bg-[linear-gradient(135deg,#ffffff_0%,#f4f7f8_38%,#c2ced5_100%)] shadow-[inset_3px_3px_5px_rgba(255,255,255,.98),inset_-4px_-5px_8px_rgba(59,78,92,.34),0_6px_9px_rgba(0,12,22,.5)]";

  return (
    <span className="relative isolate block h-[clamp(32px,7.3vw,50px)] w-[clamp(32px,7.3vw,50px)] [perspective:360px]">
      <span aria-hidden className="absolute -bottom-[9%] left-[14%] z-0 h-[16%] w-[72%] rounded-[50%] bg-black/35 blur-[3px]" />
      {rolling && <span aria-hidden className={`absolute inset-[9%] z-0 rounded-[24%] bg-white/40 blur-[7px] ${delay ? "animate-[monopoly-stage-die-trail-alt_680ms_cubic-bezier(.18,.78,.18,1)]" : "animate-[monopoly-stage-die-trail_680ms_cubic-bezier(.18,.78,.18,1)]"}`} style={animationStyle} />}
      <span className={`relative z-10 block h-full w-full will-change-transform [transform-style:preserve-3d] ${rolling ? rollAnimation : ""}`} style={animationStyle}>
        {faceValues.map((faceValue, index) => (
          <span key={index} className={`absolute inset-0 overflow-hidden rounded-[22%] border ${dieMaterial} [backface-visibility:hidden] [transform-style:preserve-3d]`} style={{ transform: faceTransforms[index], filter: faceShading[index] }}>
            <Pips value={faceValue} />
          </span>
        ))}
      </span>
    </span>
  );
}

function SpaceGlyph({ space }: { space: BoardSpace }) {
  const className = "h-[clamp(10px,3vw,20px)] w-[clamp(10px,3vw,20px)]";
  if (space.kind === "parking") return <CarFront className={`${className} text-[#ef4a4a]`} strokeWidth={2.5} />;
  if (space.kind === "go-to-jail") return <LockKeyhole className={`${className} text-[#316caa]`} strokeWidth={2.3} />;
  if (space.kind === "jail") return <LockKeyhole className={`${className} text-[#181818]`} strokeWidth={2.4} />;
  if (space.kind === "go") return <Hand className={`${className} text-[#e02626]`} strokeWidth={2.7} />;
  if (space.kind === "station" && space.transportType === "airport") return <Plane className={`${className} text-[#161616]`} strokeWidth={2.4} />;
  if (space.kind === "station" && space.transportType === "railway") return <TrainFront className={`${className} text-[#161616]`} strokeWidth={2.4} />;
  if (space.kind === "station" && space.transportType === "bus-terminal") return <BusFront className={`${className} text-[#161616]`} strokeWidth={2.4} />;
  if (space.kind === "station" && space.transportType === "port") return <Anchor className={`${className} text-[#161616]`} strokeWidth={2.4} />;
  if (space.kind === "station") return <TrainFront className={`${className} text-[#161616]`} strokeWidth={2.4} />;
  if (space.kind === "utility") return <Lightbulb className={`${className} text-[#e39912]`} strokeWidth={2.4} />;
  if (space.kind === "chest") return <Gift className={`${className} text-[#6cf1ff]`} strokeWidth={2.4} />;
  if (space.kind === "chance") return <WandSparkles className={`${className} text-[#ffcc5a]`} strokeWidth={2.4} />;
  if (space.kind === "tax") return <ReceiptText className={`${className} text-[#c43131]`} strokeWidth={2.5} />;
  return null;
}

function BuildingMarkers({ level, ownerColor }: { level: number; ownerColor: string }) {
  if (level <= 0) return null;
  const isHotel = level === MAX_PROPERTY_LEVEL;

  return (
    <span aria-label={isHotel ? "Hotel" : level > 0 ? `${level} house${level === 1 ? "" : "s"}` : "Owned property"} className={`absolute right-[5%] top-[5%] z-20 grid h-[clamp(11px,2.7vw,18px)] w-[clamp(11px,2.7vw,18px)] place-items-center rounded-full border border-white/90 shadow-[0_0_7px_rgba(255,255,255,.5),0_1px_3px_rgba(0,0,0,.75)] ${isHotel ? "bg-[#8e2c20] text-[#fff4c7]" : "bg-[#061018]/85 text-[#c9ffb8]"}`} style={{ boxShadow: `0 0 7px ${ownerColor}, 0 1px 3px rgba(0,0,0,.75)` }}>
      {isHotel ? <Building2 className="h-[68%] w-[68%]" strokeWidth={2.8} /> : <span className="flex max-h-[76%] max-w-[76%] flex-wrap items-center justify-center gap-px leading-none">{Array.from({ length: level }, (_, index) => <House key={index} className="h-[clamp(4px,.9vw,6px)] w-[clamp(4px,.9vw,6px)]" fill="currentColor" strokeWidth={2.8} />)}</span>}
    </span>
  );
}

function BoardTile({ space, tokens, owner, mortgaged = false, activePlayerId, colorBandEdge = "top", onInspect }: { space: BoardSpace; tokens: Player[]; owner?: Player; mortgaged?: boolean; activePlayerId: string; colorBandEdge?: "top" | "right" | "bottom" | "left"; onInspect?: (spaceId: string) => void }) {
  const isProperty = space.kind === "property";
  const isPricedTile = isProperty || space.kind === "station";
  const isOwned = Boolean(owner);
  const canInspect = Boolean(owner && onInspect && isOwnable(space));
  const glow = owner ? `inset 0 0 0 1.5px ${owner.color}, inset 0 0 15px ${owner.color}66, 0 0 10px ${owner.color}cc` : undefined;
  const specialBackground = space.kind === "chest" ? "linear-gradient(135deg,#082d45,#061320 62%,#0f5b78)" : space.kind === "chance" ? "linear-gradient(135deg,#41210a,#11101b 62%,#69410d)" : space.kind === "tax" ? "linear-gradient(135deg,#50120f,#210706 62%,#731c16)" : undefined;
  const specialTextColor = space.kind === "chest" ? "#d7fbff" : space.kind === "chance" ? "#fff1bd" : space.kind === "tax" ? "#ffe0d6" : undefined;
  const buildingLevel = owner ? getPropertyLevel(owner, space.id) : 0;

  return (
    <div role={canInspect ? "button" : undefined} tabIndex={canInspect ? 0 : undefined} onClick={canInspect ? () => onInspect?.(space.id) : undefined} onKeyDown={canInspect ? (event) => { if (event.key === "Enter" || event.key === " ") onInspect?.(space.id); } : undefined} className={`relative flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden border border-[#20242a] bg-[linear-gradient(135deg,#fffef6_0%,#e4e3dc_62%,#b7b4a8_100%)] px-px py-px text-center text-[#11151a] shadow-[inset_0_1px_0_rgba(255,255,255,.95),inset_0_-2px_0_rgba(34,35,36,.22)] ${isOwned ? "z-10" : ""} ${canInspect ? "cursor-pointer focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" : ""}`} style={{ background: mortgaged ? "linear-gradient(135deg,#37434b,#111920 60%,#344957)" : owner?.color ?? specialBackground, color: specialTextColor, boxShadow: glow }}>
      {space.color && <span className={`absolute z-20 ${colorBandEdge === "top" ? "inset-x-0 top-0 h-[13%]" : colorBandEdge === "right" ? "inset-y-0 right-0 w-[13%]" : colorBandEdge === "bottom" ? "inset-x-0 bottom-0 h-[13%]" : "inset-y-0 left-0 w-[13%]"}`} style={{ backgroundColor: space.color, boxShadow: isOwned ? `0 0 8px ${space.color}` : undefined }} />}
      {isOwned && isProperty && <BuildingMarkers level={buildingLevel} ownerColor={owner!.color} />}
      {mortgaged && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 rotate-[-18deg] border-y border-white/35 bg-[#091017]/80 py-px text-[clamp(3px,.85vw,6px)] font-black tracking-[.1em] text-white">MORTGAGED</span>}

      {isPricedTile ? (
        <>
          {space.kind === "station" && <SpaceGlyph space={space} />}
          <span className="max-w-full break-words px-[2%] text-[clamp(4.5px,1.45vw,10px)] font-extrabold leading-[.95] [text-shadow:0_1px_0_rgba(255,255,255,.75)]">{space.label}</span>
          <span className="mt-[4%] text-[clamp(4.5px,1.25vw,9px)] font-black leading-none [text-shadow:0_1px_0_rgba(255,255,255,.7)]">{currency.format(getPropertyPrice(space))}</span>
        </>
      ) : (
        <>
          <SpaceGlyph space={space} />
          <span className={`${space.kind === "go" ? "text-[clamp(8px,2.8vw,18px)]" : "text-[clamp(4px,1.25vw,8px)]"} mt-px max-w-full px-px font-black leading-none`}>{space.label}</span>
          {space.kind === "tax" && <span className="mt-px text-[clamp(4px,1.05vw,7px)] font-black">PAY ${space.taxAmount}</span>}
        </>
      )}

      {tokens.length > 0 && <div className="absolute bottom-px right-px grid grid-cols-2 gap-px">{tokens.slice(0, 4).map((player) => <ToyPawn key={player.id} player={player} active={!player.bankrupt && player.id === activePlayerId} compact />)}</div>}
    </div>
  );
}

function CardDeck({ kind }: { kind: "chest" | "chance" }) {
  const isChest = kind === "chest";
  const accent = isChest ? "#67e8f9" : "#ffd15d";
  const label = isChest ? "CHEST" : "CHANCE";

  return (
    <div className="relative h-[clamp(38px,8vw,58px)] w-[clamp(30px,6.5vw,46px)] [perspective:240px]" aria-label={`${label} card deck`}>
      <span className="absolute inset-[8%] translate-x-[-5px] translate-y-[6px] rounded-md border border-white/20 bg-[#08111b] shadow-[0_5px_0_#14293a,0_10px_13px_rgba(0,0,0,.48)]" />
      <span className="absolute inset-[6%] translate-x-[-2px] translate-y-[3px] rounded-md border border-white/25 bg-[#10283a]" />
      <span className="absolute inset-0 grid place-items-center rounded-md border-2 bg-[linear-gradient(145deg,#173c51,#06111c_62%,#102536)] p-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.32),0_7px_12px_rgba(0,0,0,.48)] [transform:rotateX(12deg)_rotateZ(-6deg)]" style={{ borderColor: accent, color: accent, boxShadow: `inset 0 1px 0 rgba(255,255,255,.32), 0 0 13px ${accent}66, 0 7px 12px rgba(0,0,0,.48)` }}>
        <span>{isChest ? <Gift className="mx-auto h-[clamp(11px,2.7vw,18px)] w-[clamp(11px,2.7vw,18px)]" strokeWidth={2.4} /> : <WandSparkles className="mx-auto h-[clamp(11px,2.7vw,18px)] w-[clamp(11px,2.7vw,18px)]" strokeWidth={2.4} />}<span className="mt-1 block text-[clamp(4px,.9vw,6px)] font-black tracking-[.12em]">{label}</span></span>
      </span>
    </div>
  );
}

function TurnWarningBanner() {
  return <div role="status" className="pointer-events-none absolute left-1/2 top-[21%] z-50 w-[88%] -translate-x-1/2 rounded-lg border border-[#ffca5b]/80 bg-[#2b1608]/95 px-[4%] py-[2%] text-center shadow-[0_0_20px_rgba(255,166,42,.34),inset_0_1px_0_rgba(255,255,255,.18)]"><p className="text-[clamp(6px,1.35cqw,9px)] font-black leading-snug text-[#ffe6a0]">WARNING: 40s reached. Turn auto-passes at 1 min.</p></div>;
}

function CityStage({ actionLog, dice, isRolling, canRoll, isEndTurn, showStartBanner, activePlayer, alert, auction, actionPanel, secondsLeft, turnWarning, players, viewerId, onRoll, onEndTurn, onBuy, onSkip, onUpgrade, onSell, onAwardAuction, onDismiss, onBuild, onSellBuilding, onMortgage, onRedeem, onUpdateTrade, onProposeTrade, onConfirmTrade, onDeclineTrade, onCloseActionPanel }: { actionLog: ActionLog; dice: [number, number]; isRolling: boolean; canRoll: boolean; isEndTurn: boolean; showStartBanner: boolean; activePlayer: Player; alert: GameAlert | null; auction: AuctionState | null; actionPanel: ActionPanel | null; secondsLeft: number; turnWarning: boolean; players: Player[]; viewerId?: string; onRoll: () => void; onEndTurn: () => void; onBuy: () => void; onSkip: () => void; onUpgrade: () => void; onSell: () => void; onAwardAuction: () => void; onDismiss: () => void; onBuild: (spaceId: string) => void; onSellBuilding: (spaceId: string, mode: "single" | "hotel" | "clear") => void; onMortgage: (spaceId: string) => void; onRedeem: (spaceId: string) => void; onUpdateTrade: (update: Partial<TradeDraft>) => void; onProposeTrade: () => void; onConfirmTrade: () => void; onDeclineTrade: () => void; onCloseActionPanel: () => void }) {
  const timerLabel = secondsLeft === TURN_DURATION_SECONDS ? "01:00" : `00:${String(secondsLeft).padStart(2, "0")}`;

  return (
    <section className="col-start-2 col-end-9 row-start-2 row-end-9 relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_43%,#1e4d72_0%,#0a1a2a_52%,#03070e_100%)]">
      <div aria-hidden className="pointer-events-none absolute inset-[3%] z-0 overflow-hidden rounded-[8%] border border-[#8ed9ff]/25 bg-[#061421] shadow-[inset_0_0_30px_rgba(8,21,35,.95),0_0_22px_rgba(50,166,238,.18)]">
        <Image src="/images/monopoly-asean-center.png" alt="" fill priority sizes="(max-width: 560px) 74vw, 420px" className="object-cover object-center opacity-95 saturate-110 contrast-110" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,10,18,.62),rgba(4,17,28,.08)_45%,rgba(3,10,17,.72)),radial-gradient(ellipse_at_center,transparent_32%,rgba(3,11,20,.48)_100%)]" />
      </div>
      <div className="absolute left-1/2 top-[47%] z-[2] h-[66%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-[38%] border border-[#78d8ff]/25 bg-[radial-gradient(ellipse_at_50%_50%,rgba(47,169,238,.2),transparent_68%)] shadow-[0_0_46px_rgba(47,177,255,.2)]" />

      <div className="absolute top-[6%] z-30 flex min-w-[48%] max-w-[86%] flex-col items-center rounded-full border border-white/15 bg-[#06121ed9] px-[5%] py-[2%] text-center shadow-[0_0_16px_rgba(72,177,255,.2),inset_0_1px_0_rgba(255,255,255,.12)]">
        <span className="text-[clamp(4px,1.15vw,7px)] font-black uppercase tracking-[.18em] text-[#8fdcff]">CRYSTAL TABLE - ACTIVE TURN</span>
        <span className="mt-[3%] max-w-full truncate text-[clamp(6px,1.65vw,10px)] font-black" style={{ color: activePlayer.color }}>{activePlayer.username}</span>
        <time dateTime={`PT${secondsLeft}S`} className={`mt-[3%] text-[clamp(5px,1.3cqw,8px)] font-black tracking-[.14em] ${turnWarning ? "text-[#ffe28a]" : "text-[#ddf7ff]"}`}>TURN TIMER · {timerLabel}</time>
        <span aria-hidden className="mt-[3%] h-px w-[78%] overflow-hidden rounded-full bg-white/15"><span className={`block h-full rounded-full transition-[width,background-color] duration-300 ${turnWarning ? "bg-[#ffb74d]" : "bg-[#6ad8ff]"}`} style={{ width: `${(secondsLeft / TURN_DURATION_SECONDS) * 100}%` }} /></span>
      </div>

      <div className="absolute left-[7%] top-[34%] z-20"><CardDeck kind="chest" /></div>
      <div className="absolute right-[7%] top-[34%] z-20"><CardDeck kind="chance" /></div>

      {showStartBanner && <div className="pointer-events-none absolute left-1/2 top-[17%] z-40 w-[76%] -translate-x-1/2 rounded-lg border border-[#98dcff]/80 bg-[#061322]/95 px-[4%] py-[2.5%] text-center shadow-[0_0_18px_rgba(70,190,255,.28),inset_0_1px_0_rgba(255,255,255,.18)]"><p className="text-[clamp(5px,1.35vw,9px)] font-black uppercase tracking-[.08em] text-white">ALL PLAYERS ARE ON GO.</p><p className="mt-[1%] text-[clamp(6px,1.55vw,11px)] font-black uppercase tracking-[.04em] text-[#ffdb45]">ROLL TO START THE JOURNEY</p></div>}

      <button type="button" onClick={isEndTurn ? onEndTurn : onRoll} disabled={!canRoll && !isEndTurn} aria-label="Roll two dice on the white stage" className="absolute left-1/2 top-[55%] z-40 h-[34%] w-[60%] overflow-visible rounded-[25%] outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#ffe18a] disabled:cursor-not-allowed" style={{ transform: "translate(-50%, -50%)" }}>
        <span className="relative z-10 flex h-full items-center justify-center gap-[clamp(6px,1.6vw,14px)]">
          <StageDie value={dice[0]} rolling={isRolling} />
          <StageDie value={dice[1]} rolling={isRolling} delay={55} />
        </span>
        <span className="absolute -bottom-[24%] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#8bdcff]/55 bg-[#06111ed9] px-[7%] py-[3%] text-[clamp(4px,1.15vw,8px)] font-black uppercase tracking-[.11em] text-[#d9f7ff] shadow-[0_0_12px_rgba(58,191,255,.24)]">{isRolling ? "Rolling two dice…" : isEndTurn ? "Tap stage to end turn" : "Tap white stage to roll"}</span>
      </button>

      <div className="absolute bottom-[5%] z-30 max-w-[83%] rounded-md border border-[#72cfff]/35 bg-[#06111ed9] px-[5%] py-[2%] text-center shadow-[inset_0_1px_0_rgba(255,255,255,.1)]"><p className="truncate text-[clamp(4px,1.1vw,7px)] font-black uppercase tracking-[.16em] text-[#7ecfff]">{actionLog.title}</p><p className="mt-[3%] truncate text-[clamp(5px,1.35vw,9px)] font-black text-white">{actionLog.highlight}</p></div>

      {alert && <ActionModal alert={alert} auction={auction} players={players} onBuy={onBuy} onSkip={onSkip} onUpgrade={onUpgrade} onSell={onSell} onAwardAuction={onAwardAuction} onDismiss={onDismiss} />}
      {actionPanel && <ActionPanelModal panel={actionPanel} activePlayer={activePlayer} players={players} viewerId={viewerId} onBuild={onBuild} onSellBuilding={onSellBuilding} onMortgage={onMortgage} onRedeem={onRedeem} onUpdateTrade={onUpdateTrade} onProposeTrade={onProposeTrade} onConfirmTrade={onConfirmTrade} onDeclineTrade={onDeclineTrade} onClose={onCloseActionPanel} />}
      {turnWarning && <TurnWarningBanner />}

    </section>
  );
}

function PropertyDetailCard({ space, level = 0, hasCompleteSet = false, compact = false }: { space: BoardSpace; level?: number; hasCompleteSet?: boolean; compact?: boolean }) {
  const rentTiers = getRentTiers(space).slice(1);
  const tierLabels = ["1x HOUSE", "2x HOUSE", "3x HOUSE", "4x HOUSE", "HOTEL"];
  const compactTierLabels = ["1H", "2H", "3H", "4H", "HOTEL"];
  const currentRent = getPropertyRent(space, level, hasCompleteSet);
  const nextUpgradeCost = level >= MAX_PROPERTY_LEVEL ? 0 : getUpgradeCost(space, level + 1);

  return (
    <section className={`shrink-0 rounded-lg border border-[#8ce5ff]/65 bg-[linear-gradient(145deg,#f2fbff,#b9e5f5_58%,#5e9ebc)] text-[#07141d] shadow-[inset_0_1px_0_white,0_0_14px_rgba(84,214,255,.22)] ${compact ? "mt-[3%] p-1" : "mt-2 p-1.5"}`}>
      <div className={`rounded-md border border-[#0f3548]/45 bg-[#0c6f9f] text-center text-white ${compact ? "px-1 py-0.5" : "px-1.5 py-1"}`}><p className={`font-black uppercase leading-none ${compact ? "text-[clamp(6px,1.35vw,8px)]" : "text-[clamp(7px,1.55vw,10px)]"}`}>{space.label}</p><p className={`font-bold ${compact ? "mt-px text-[clamp(4px,.8vw,5px)]" : "mt-0.5 text-[clamp(5px,1.05vw,7px)]"}`}>BASE PRICE {currency.format(getPropertyPrice(space))}</p></div>
      <div className={compact ? "px-1 py-0.5" : "px-1.5 py-1"}>
        <div className="space-y-px">{rentTiers.map((rent, index) => <div key={tierLabels[index]} className={`flex items-center justify-between rounded px-1 py-px font-black ${compact ? "text-[clamp(4px,.78vw,5px)]" : "text-[clamp(5px,1.05vw,7px)]"} ${level === index + 1 ? "bg-[#ffdb58] text-[#211500]" : ""}`}><span>{compact ? compactTierLabels[index] : tierLabels[index]}</span><span>{currency.format(rent)}</span></div>)}</div>
        {compact ? <div className="mt-px grid grid-cols-3 gap-x-0.5 border-t border-[#174a60]/25 pt-px text-[clamp(3.5px,.68vw,4.5px)] font-black uppercase"><span>Rent {currency.format(currentRent)}</span><span className="text-center">Next {currency.format(nextUpgradeCost)}</span><span className="text-right">Mort. {currency.format(getMortgageValue(space))}</span></div> : <div className="mt-1 grid grid-cols-2 gap-x-1 border-t border-[#174a60]/25 pt-1 text-[clamp(4.5px,.95vw,6px)] font-black uppercase"><span>{level === 0 ? `Landing rent ${currency.format(currentRent)}` : level === MAX_PROPERTY_LEVEL ? "Hotel" : `${level} houses`}</span><span className="text-right">{level === MAX_PROPERTY_LEVEL ? "Hotel complete" : `Next build ${currency.format(nextUpgradeCost)}`}</span><span>{level === MAX_PROPERTY_LEVEL ? "Construction complete" : `Construction ${currency.format(nextUpgradeCost)}`}</span><span className="text-right">Mortgage {currency.format(getMortgageValue(space))}</span></div>}
      </div>
    </section>
  );
}

function RentPaymentSummary({ cityName, amount, message, compact = false }: { cityName: string; amount: number; message: string; compact?: boolean }) {
  return (
    <section className={`rounded-xl border border-[#7edbff]/70 bg-[linear-gradient(145deg,#103c59,#071522)] shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_0_18px_rgba(51,183,255,.2)] ${compact ? "mt-[5%] p-1.5" : "mt-3 p-3"}`}>
      <p className={`font-black uppercase tracking-[.18em] text-[#8ee5ff] ${compact ? "text-[clamp(5px,1vw,7px)]" : "text-[clamp(6px,1.1vw,8px)]"}`}>Landing on {cityName}</p>
      <p className={`font-black leading-none text-[#ffe36b] drop-shadow-[0_0_10px_rgba(255,211,80,.38)] ${compact ? "mt-0.5 text-[clamp(18px,3.7cqw,24px)]" : "mt-1 text-[clamp(24px,5vw,36px)]"}`}>{currency.format(amount)}</p>
      <p className={`break-words font-bold leading-snug text-white [overflow-wrap:anywhere] ${compact ? "mt-1 text-[clamp(7px,1.3cqw,9px)]" : "mt-2 text-[clamp(8px,1.55vw,11px)]"}`}>{message}</p>
    </section>
  );
}

function ActionModal({ alert, auction, players, onBuy, onSkip, onUpgrade, onSell, onAwardAuction, onDismiss }: { alert: GameAlert; auction: AuctionState | null; players: Player[]; onBuy: () => void; onSkip: () => void; onUpgrade: () => void; onSell: () => void; onAwardAuction: () => void; onDismiss: () => void }) {
  const space = alert.spaceId ? getSpace(alert.spaceId) : null;
  const isPurchase = alert.kind === "purchase" && space;
  const isOwned = alert.kind === "owned" && space?.kind === "property";
  const isAuction = alert.kind === "auction" && auction && space;
  const isRentPayment = alert.kind === "payment" && space?.kind === "property";
  const isCard = alert.kind === "card" && (space?.kind === "chance" || space?.kind === "chest");
  const cardLabel = space?.kind === "chest" ? "COMMUNITY CHEST" : "CHANCE";
  const isBlueAlert = !isPurchase && !isOwned;
  const showPropertyDetails = space?.kind === "property" && (isPurchase || isOwned || alert.kind === "inspect");
  const owner = space ? players.find((player) => player.ownedSpaceIds.includes(space.id)) : undefined;

  const modal = (
    <div className="absolute inset-[3%] z-[55] grid place-items-center overflow-hidden rounded-[8%] bg-[#02070de8] p-[3%] backdrop-blur-sm">
      <section className={`flex w-[92%] flex-col overflow-hidden rounded-[14px] border-2 text-center shadow-[0_0_24px_rgba(80,197,255,.32),0_12px_32px_rgba(0,0,0,.5)] ${isBlueAlert ? "h-[80%] border-[#69d1ff] bg-[radial-gradient(circle_at_50%_-15%,rgba(73,201,255,.2),transparent_42%),linear-gradient(145deg,#142d42,#060e17_58%,#102234)] p-[5%]" : "h-full border-[#ffe15b] bg-[linear-gradient(145deg,#26311e,#0a1018_52%,#1f1705)] p-[4%]"}`} role="dialog" aria-modal="true" aria-labelledby="monopoly-alert-title">
        <div className={`min-h-0 flex-1 overflow-hidden ${isBlueAlert ? "flex flex-col justify-center" : ""}`}>
        <p className={`break-words font-black uppercase tracking-[.2em] [overflow-wrap:anywhere] ${isBlueAlert ? "text-[clamp(7px,1.45cqw,9px)]" : "text-[clamp(6px,1.25vw,8px)]"} ${isPurchase || isOwned ? "text-[#ffe36b]" : "text-[#80d8ff]"}`}>{isCard ? "Crystal table alert" : isRentPayment ? "Rent settlement" : isAuction ? "Live city auction" : isOwned ? "City management" : isPurchase ? "Decision required" : "Crystal table alert"}</p>
        {isCard ? <div className="mt-[4%] grid place-items-center gap-[4%]"><h2 id="monopoly-alert-title" className={`max-w-full break-words text-center text-[clamp(15px,3.6cqw,21px)] font-black leading-[.9] tracking-[-.05em] [overflow-wrap:anywhere] drop-shadow-[0_3px_0_rgba(5,22,33,.8),0_0_18px_rgba(91,212,255,.45)] ${space?.kind === "chest" ? "text-[#ffe27a]" : "text-white"}`}>{cardLabel}</h2><p className="break-words text-[clamp(11px,2.2cqw,14px)] font-black leading-tight text-white [overflow-wrap:anywhere]">{alert.title}</p><p className="max-w-[94%] break-words text-[clamp(9px,1.75cqw,12px)] font-bold leading-snug text-slate-100 [overflow-wrap:anywhere]">{alert.message}</p></div> : <><h2 id="monopoly-alert-title" className={`mt-[4%] break-words font-black leading-tight text-white [overflow-wrap:anywhere] ${isBlueAlert ? "text-[clamp(14px,3cqw,19px)]" : isPurchase ? "text-[clamp(14px,3vw,18px)]" : "text-[clamp(15px,3.35vw,22px)]"}`}>{isRentPayment ? "Rent payment due" : alert.title}</h2>{isRentPayment && space ? <RentPaymentSummary cityName={space.label} amount={alert.amount ?? 0} message={alert.message} compact /> : <p className={`mt-[5%] break-words font-bold leading-snug text-slate-100 [overflow-wrap:anywhere] ${isBlueAlert ? "text-[clamp(9px,1.9cqw,12px)]" : "text-[clamp(8px,1.6vw,11px)]"}`}>{alert.message}</p>}</>}
        {showPropertyDetails && <PropertyDetailCard space={space} level={owner ? getPropertyLevel(owner, space.id) : 0} hasCompleteSet={Boolean(owner && hasCompleteColorSet(owner, space))} compact={Boolean(isPurchase || isOwned || alert.kind === "inspect")} />}
        {isAuction && <div className="mt-2 grid grid-cols-2 gap-1">{Object.entries(auction.bids).sort(([, firstBid], [, secondBid]) => secondBid - firstBid).map(([playerId, bid]) => { const bidder = players.find((player) => player.id === playerId); return <div key={playerId} className="rounded-md border border-white/15 bg-white/5 px-1 py-1 text-left"><span className="block truncate text-[clamp(5px,1.05vw,7px)] font-black" style={{ color: bidder?.color }}>{bidder?.username}</span><span className="block text-[clamp(7px,1.4vw,9px)] font-black text-[#ffe36b]">{currency.format(bid)}</span></div>; })}</div>}
        </div>
        {isPurchase ? (
          <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 border-t border-white/15 pt-2">
            <button type="button" onClick={onBuy} className="rounded-lg bg-[linear-gradient(180deg,#fff071,#e7a411)] px-2 py-1.5 text-[clamp(7px,1.35vw,10px)] font-black uppercase text-[#241600]">Buy {currency.format(getPropertyPrice(space))}</button>
            <button type="button" onClick={onSkip} className="rounded-lg border border-white/30 bg-black/20 px-2 py-1.5 text-[clamp(7px,1.35vw,10px)] font-black uppercase text-white">Skip</button>
          </div>
        ) : isOwned ? (
          <div className="mt-5 grid shrink-0 grid-cols-2 gap-1.5">
            <button type="button" onClick={onUpgrade} className="rounded-lg bg-[linear-gradient(180deg,#b9ff78,#59b91c)] px-2 py-1.5 text-[clamp(6px,1.2vw,9px)] font-black uppercase text-[#142205]">Upgrade next level</button>
            <button type="button" onClick={onSell} className="rounded-lg bg-[linear-gradient(180deg,#ffb46e,#d95818)] px-2 py-1.5 text-[clamp(6px,1.2vw,9px)] font-black uppercase text-[#2b1103]">Sell / Auction</button>
          </div>
        ) : isAuction ? (
          <div className="mt-5 grid shrink-0 grid-cols-2 gap-1.5">
            <button type="button" onClick={onAwardAuction} className="rounded-lg bg-[linear-gradient(180deg,#fff071,#e7a411)] px-2 py-1.5 text-[clamp(6px,1.2vw,9px)] font-black uppercase text-[#241600]">Award highest bid</button>
            <button type="button" onClick={onDismiss} className="rounded-lg border border-white/30 bg-black/20 px-2 py-1.5 text-[clamp(6px,1.2vw,9px)] font-black uppercase text-white">Cancel sale</button>
          </div>
        ) : (
          <button type="button" onClick={onDismiss} className={`w-full shrink-0 rounded-lg border px-2 font-black uppercase text-white ${isBlueAlert ? "mt-3 border-[#7fd9ff]/80 bg-[#1a638d] py-1.5 text-[clamp(8px,1.75cqw,10px)]" : "mt-5 border-[#7fd9ff]/65 bg-[#1a638d] py-2 text-[clamp(7px,1.35vw,10px)]"}`}>Continue</button>
        )}
      </section>
    </div>
  );

  return modal;
}

function ActionControlBar({ disabled, sellDisabled, onOpen }: { disabled: boolean; sellDisabled: boolean; onOpen: (kind: BoardActionKind) => void }) {
  const actions: Array<{ kind: BoardActionKind; label: string }> = [
    { kind: "build", label: "BUILD" },
    { kind: "sell", label: "SELL" },
    { kind: "mortgage", label: "MORTGAGE" },
    { kind: "redeem", label: "REDEEM" },
    { kind: "trade", label: "TRADE" },
  ];

  return (
    <nav aria-label="Property actions" className="mx-auto grid w-full max-w-md grid-cols-5 gap-1">
      {actions.map((action) => <button key={action.kind} type="button" disabled={action.kind === "sell" ? sellDisabled : disabled} onClick={() => onOpen(action.kind)} className={`rounded-lg border px-1 py-2 text-[clamp(6px,1.55vw,8px)] font-black tracking-[.05em] shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 ${action.kind === "sell" ? "border-[#ffad72]/70 bg-[linear-gradient(180deg,#733517,#321207)] text-[#ffd4b4]" : "border-[#4e87a9]/70 bg-[linear-gradient(180deg,#173a54,#09131d)] text-[#bceaff]"}`}>{action.label}</button>)}
    </nav>
  );
}

function ActionPanelModal({ panel, activePlayer, players, viewerId, onBuild, onSellBuilding, onMortgage, onRedeem, onUpdateTrade, onProposeTrade, onConfirmTrade, onDeclineTrade, onClose }: { panel: ActionPanel; activePlayer: Player; players: Player[]; viewerId?: string; onBuild: (spaceId: string) => void; onSellBuilding: (spaceId: string, mode: "single" | "hotel" | "clear") => void; onMortgage: (spaceId: string) => void; onRedeem: (spaceId: string) => void; onUpdateTrade: (update: Partial<TradeDraft>) => void; onProposeTrade: () => void; onConfirmTrade: () => void; onDeclineTrade: () => void; onClose: () => void }) {
  const ownedProperties = activePlayer.ownedSpaceIds.map(getSpace).filter((space) => space.kind === "property");
  const trade = panel.trade;
  const recipient = trade ? players.find((player) => player.id === trade.recipientId) : undefined;
  const offerableProperties = ownedProperties.filter((space) => getPropertyLevel(activePlayer, space.id) === 0 && !activePlayer.mortgagedSpaceIds.includes(space.id));
  const requestedProperties = recipient?.ownedSpaceIds.map(getSpace).filter((space) => space.kind === "property" && getPropertyLevel(recipient, space.id) === 0 && !recipient.mortgagedSpaceIds.includes(space.id)) ?? [];
  const heading = panel.kind === "build" ? "BUILD EVENLY" : panel.kind === "sell" ? "SELL BUILDINGS" : panel.kind === "mortgage" ? "MORTGAGE PROPERTY" : panel.kind === "redeem" ? "REDEEM MORTGAGE" : "TRADE DESK";

  return (
    <div onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="absolute inset-[2%] z-[56] grid place-items-center overflow-hidden rounded-[8%] border border-[#86dcff]/45 bg-[#02070de8] p-[2%] backdrop-blur-sm">
      <section className="flex h-full max-h-full w-full flex-col overflow-hidden rounded-xl border border-[#69d1ff] bg-[linear-gradient(145deg,#132b3f,#060e17_58%,#122338)] p-[3%] text-center shadow-[0_0_24px_rgba(80,197,255,.3)]" role="dialog" aria-modal="true" aria-labelledby="property-action-title">
        <div className="flex items-center justify-between gap-2"><div className="min-w-0 text-left"><p className="text-[clamp(5px,1vw,7px)] font-black uppercase tracking-[.2em] text-[#80d8ff]">Property control</p><h2 id="property-action-title" className="text-[clamp(11px,2.5vw,16px)] font-black text-white">{heading}</h2></div><button type="button" onClick={onClose} className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/25 text-[10px] text-white">×</button></div>
        {panel.kind === "build" && <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">{ownedProperties.map((space) => { const level = getPropertyLevel(activePlayer, space.id); const nextLevel = level + 1; const upgradeCost = getUpgradeCost(space, nextLevel); const eligible = canBuildEvenly(activePlayer, space); const reason = !hasCompleteColorSet(activePlayer, space) ? "Full set required" : level >= MAX_PROPERTY_LEVEL ? "Hotel complete" : !eligible ? "Build lowest title first" : `${currency.format(upgradeCost)} for ${nextLevel === MAX_PROPERTY_LEVEL ? "HOTEL" : `HOUSE ${nextLevel}`}`; return <div key={space.id} className="flex items-center justify-between gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-left"><span className="min-w-0"><span className="block truncate text-[clamp(5px,1.1vw,7px)] font-black text-white">{space.label}</span><span className="block text-[clamp(4px,.85vw,6px)] font-bold text-slate-300">{level === MAX_PROPERTY_LEVEL ? "HOTEL" : `${level} HOUSES`} · {reason}</span></span><button type="button" disabled={!eligible || activePlayer.cash < upgradeCost} onClick={() => onBuild(space.id)} className="rounded bg-[#79d83f] px-1.5 py-1 text-[clamp(5px,1vw,7px)] font-black text-[#102307] disabled:opacity-35">BUILD</button></div>; })}{ownedProperties.length === 0 && <p className="pt-4 text-[8px] font-bold text-slate-300">No properties owned.</p>}</div>}
        {panel.kind === "sell" && <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">{ownedProperties.filter((space) => getPropertyLevel(activePlayer, space.id) > 0).map((space) => { const level = getPropertyLevel(activePlayer, space.id); const eligible = canSellEvenly(activePlayer, space); const refund = Math.round(getUpgradeCost(space, level) * 0.5); const clearRefund = Math.round(Array.from({ length: MAX_PROPERTY_LEVEL }, (_, index) => getUpgradeCost(space, index + 1)).reduce((total, cost) => total + cost, 0) * 0.5); return <div key={space.id} className="rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-left"><div className="flex items-center justify-between gap-1"><span className="truncate text-[clamp(5px,1.1vw,7px)] font-black text-white">{space.label} · {level === MAX_PROPERTY_LEVEL ? "HOTEL" : `H${level}`}</span><span className="text-[clamp(4px,.85vw,6px)] font-bold text-[#ffd38c]">50% REFUND</span></div>{level === MAX_PROPERTY_LEVEL ? <div className="mt-1 grid grid-cols-2 gap-1"><button type="button" disabled={!eligible} onClick={() => onSellBuilding(space.id, "hotel")} className="rounded bg-[#ffb46e] px-1 py-1 text-[clamp(4px,.85vw,6px)] font-black text-[#2b1103] disabled:opacity-35">HOTEL → 4H +{currency.format(refund)}</button><button type="button" disabled={!eligible} onClick={() => onSellBuilding(space.id, "clear")} className="rounded border border-[#ffb46e]/60 px-1 py-1 text-[clamp(4px,.85vw,6px)] font-black text-[#ffe0bf] disabled:opacity-35">CLEAR +{currency.format(clearRefund)}</button></div> : <button type="button" disabled={!eligible} onClick={() => onSellBuilding(space.id, "single")} className="mt-1 rounded bg-[#ffb46e] px-1.5 py-1 text-[clamp(5px,1vw,7px)] font-black text-[#2b1103] disabled:opacity-35">SELL 1 HOUSE +{currency.format(refund)}</button>}</div>; })}{!ownedProperties.some((space) => getPropertyLevel(activePlayer, space.id) > 0) && <p className="pt-4 text-[8px] font-bold text-slate-300">No houses or hotels to sell.</p>}</div>}
        {panel.kind === "mortgage" && <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">{ownedProperties.map((space) => { const blocked = activePlayer.mortgagedSpaceIds.includes(space.id) || hasAnyBuildingsInColorSet(activePlayer, space); return <div key={space.id} className="flex items-center justify-between gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-left"><span><span className="block text-[clamp(5px,1.1vw,7px)] font-black text-white">{space.label}</span><span className="block text-[clamp(4px,.85vw,6px)] font-bold text-slate-300">{activePlayer.mortgagedSpaceIds.includes(space.id) ? "Already mortgaged" : hasAnyBuildingsInColorSet(activePlayer, space) ? "Sell all color-set buildings first" : `Receive ${currency.format(getMortgageValue(space))}`}</span></span><button type="button" disabled={blocked} onClick={() => onMortgage(space.id)} className="rounded bg-[#78b4e8] px-1.5 py-1 text-[clamp(5px,1vw,7px)] font-black text-[#061525] disabled:opacity-35">MORTGAGE</button></div>; })}</div>}
        {panel.kind === "redeem" && <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">{ownedProperties.filter((space) => activePlayer.mortgagedSpaceIds.includes(space.id)).map((space) => { const redeemCost = Math.ceil(getMortgageValue(space) * 1.1); return <div key={space.id} className="flex items-center justify-between gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-left"><span><span className="block text-[clamp(5px,1.1vw,7px)] font-black text-white">{space.label}</span><span className="block text-[clamp(4px,.85vw,6px)] font-bold text-slate-300">Principal + 10% = {currency.format(redeemCost)}</span></span><button type="button" disabled={activePlayer.cash < redeemCost} onClick={() => onRedeem(space.id)} className="rounded bg-[#8ce37b] px-1.5 py-1 text-[clamp(5px,1vw,7px)] font-black text-[#102307] disabled:opacity-35">REDEEM</button></div>; })}{!ownedProperties.some((space) => activePlayer.mortgagedSpaceIds.includes(space.id)) && <p className="pt-4 text-[8px] font-bold text-slate-300">No mortgaged properties.</p>}</div>}
        {panel.kind === "trade" && trade && <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5 text-left">{trade.awaitingConfirmation ? <div className="rounded-lg border border-[#ffe36b]/55 bg-[#241c08]/70 p-2 text-center"><p className="text-[8px] font-black text-[#ffe36b]">WAITING FOR {recipient?.username.toUpperCase()} TO CONFIRM</p><p className="mt-1 text-[7px] text-white">Cash: {currency.format(trade.offeredCash)} offered / {currency.format(trade.requestedCash)} requested</p><div className="mt-2 grid grid-cols-2 gap-1">{viewerId === trade.recipientId || !viewerId ? <button type="button" onClick={onConfirmTrade} className="rounded bg-[#8ce37b] py-1 text-[7px] font-black text-[#102307]">ACCEPT</button> : <span className="rounded bg-white/10 py-1 text-[7px] font-black text-slate-400">AWAITING RECIPIENT</span>}<button type="button" onClick={(viewerId === trade.recipientId || !viewerId) ? onDeclineTrade : onClose} className="rounded border border-white/25 py-1 text-[7px] font-black text-white">{(viewerId === trade.recipientId || !viewerId) ? "DECLINE" : "CANCEL"}</button></div></div> : <><p className="text-[6px] font-black uppercase text-[#80d8ff]">Choose opponent</p><div className="mt-1 flex gap-1 overflow-x-auto pb-1">{players.filter((player) => player.id !== activePlayer.id && !player.bankrupt).map((player) => <button type="button" key={player.id} onClick={() => onUpdateTrade({ recipientId: player.id, requestedPropertyId: null })} className={`shrink-0 rounded border px-1.5 py-1 text-[6px] font-black ${player.id === trade.recipientId ? "border-white bg-white/15" : "border-white/15"}`} style={{ color: player.color }}>{player.username}</button>)}</div><div className="mt-1 grid grid-cols-2 gap-1 text-[6px]"><div className="rounded border border-white/10 bg-white/5 p-1"><p className="font-black text-[#9ee5ff]">YOU OFFER CASH</p><div className="mt-1 flex items-center justify-between"><button type="button" onClick={() => onUpdateTrade({ offeredCash: Math.max(0, trade.offeredCash - 50) })}>−</button><span className="font-black text-white">{currency.format(trade.offeredCash)}</span><button type="button" onClick={() => onUpdateTrade({ offeredCash: Math.min(activePlayer.cash, trade.offeredCash + 50) })}>+</button></div></div><div className="rounded border border-white/10 bg-white/5 p-1"><p className="font-black text-[#ffd38c]">YOU REQUEST CASH</p><div className="mt-1 flex items-center justify-between"><button type="button" onClick={() => onUpdateTrade({ requestedCash: Math.max(0, trade.requestedCash - 50) })}>−</button><span className="font-black text-white">{currency.format(trade.requestedCash)}</span><button type="button" onClick={() => onUpdateTrade({ requestedCash: Math.min(recipient?.cash ?? 0, trade.requestedCash + 50) })}>+</button></div></div></div><p className="mt-1 text-center text-[6px] font-bold text-[#ffd38c]">A trade must include a title or Jail-Free card; cash-only requests are blocked.</p><div className="mt-1 grid grid-cols-2 gap-1 text-[6px]"><label className="rounded border border-white/10 bg-white/5 p-1"><span className="block font-black text-[#9ee5ff]">OFFER TITLE</span><select value={trade.offeredPropertyId ?? ""} onChange={(event) => onUpdateTrade({ offeredPropertyId: event.target.value || null })} className="mt-1 w-full bg-transparent text-white"><option value="">None</option>{offerableProperties.map((space) => <option key={space.id} value={space.id}>{space.label}</option>)}</select></label><label className="rounded border border-white/10 bg-white/5 p-1"><span className="block font-black text-[#ffd38c]">REQUEST TITLE</span><select value={trade.requestedPropertyId ?? ""} onChange={(event) => onUpdateTrade({ requestedPropertyId: event.target.value || null })} className="mt-1 w-full bg-transparent text-white"><option value="">None</option>{requestedProperties.map((space) => <option key={space.id} value={space.id}>{space.label}</option>)}</select></label></div><div className="mt-1 grid grid-cols-2 gap-1 text-[6px]"><button type="button" onClick={() => onUpdateTrade({ offeredJailFreeCard: !trade.offeredJailFreeCard })} disabled={activePlayer.jailFreeCards < 1} className={`rounded border p-1 font-black ${trade.offeredJailFreeCard ? "border-[#80d8ff] bg-[#0e3951]" : "border-white/15"}`}>OFFER JAIL-FREE</button><button type="button" onClick={() => onUpdateTrade({ requestedJailFreeCard: !trade.requestedJailFreeCard })} disabled={(recipient?.jailFreeCards ?? 0) < 1} className={`rounded border p-1 font-black ${trade.requestedJailFreeCard ? "border-[#ffd38c] bg-[#4d2d0d]" : "border-white/15"}`}>REQUEST JAIL-FREE</button></div><button type="button" onClick={onProposeTrade} className="mt-2 w-full rounded bg-[#74c8f5] py-1.5 text-[7px] font-black text-[#071826]">PROPOSE TRADE</button></>}</div>}
      </section>
    </div>
  );
}

function CornerPlayerCard({ player, active, empty }: { player?: Player; active?: boolean; empty?: boolean }) {
  if (empty || !player) {
    return <article className="portrait-player-card flex min-h-[54px] items-center justify-center rounded-xl border border-dashed border-white/15 bg-[#07101a]/45 px-2 text-center text-[8px] font-black uppercase tracking-[.14em] text-slate-500">Open seat</article>;
  }

  return (
    <article className={`portrait-player-card relative min-w-0 rounded-xl border bg-[linear-gradient(135deg,#112c40,#06101a_70%)] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.13),0_4px_10px_rgba(0,0,0,.34)] ${player.bankrupt ? "opacity-45 grayscale" : ""}`} style={{ borderColor: player.color, boxShadow: active ? `0 0 14px ${player.color}aa, inset 0 1px 0 rgba(255,255,255,.13)` : `0 0 7px ${player.color}44, inset 0 1px 0 rgba(255,255,255,.13)` }}>
      {active && <span className="absolute -top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-white animate-[monopoly-badge_1.2s_ease-in-out_infinite]" style={{ backgroundColor: player.color, boxShadow: `0 0 10px ${player.color}` }}><Crown className="h-2.5 w-2.5" fill="currentColor" />Your turn</span>}
      <div className="flex items-center gap-2">
        <ToyPawn player={player} active={Boolean(active)} />
        <div className="min-w-0 leading-none"><p className="truncate text-[clamp(9px,2.75vw,14px)] font-black" style={{ color: player.color }}>{player.username}</p><p className="mt-1 text-[clamp(11px,3.45vw,18px)] font-black text-white">{currency.format(player.cash)}</p></div>
      </div>
    </article>
  );
}

function SetupScreen({ count, onCountChange, onStart, onExit }: { count: number; onCountChange: (value: number) => void; onStart: () => void; onExit: () => void }) {
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_50%_26%,#163c5d_0%,#07111d_40%,#02060b_100%)] px-4 py-4 text-white">
      <style jsx global>{`
        @keyframes monopoly-pawn { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.06); } }
        @keyframes monopoly-aura { 0%,100% { opacity: .45; transform: scale(.75); } 50% { opacity: 1; transform: scale(1.18); } }
        @keyframes monopoly-badge { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
        @keyframes monopoly-go-bonus-toast { 0% { opacity: 0; transform: translate(-50%,-8px) scale(.9); } 12%,78% { opacity: 1; transform: translate(-50%,0) scale(1); } 100% { opacity: 0; transform: translate(-50%,-8px) scale(.96); } }
        @media (max-height: 720px) {
          .portrait-player-card { min-height: 48px !important; padding-top: 4px !important; padding-bottom: 4px !important; }
          .portrait-header { height: 40px !important; }
          .portrait-controls { padding-top: 7px !important; padding-bottom: 8px !important; }
        }
      `}</style>
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col">
        <header className="flex items-center justify-between"><button type="button" onClick={onExit} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5"><ArrowLeft className="h-5 w-5" /></button><span className="text-[10px] font-black tracking-[.22em] text-[#73c9ff]">NEON MONOPOLY</span><span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5"><Sparkles className="h-4 w-4 text-[#ffda38]" /></span></header>
        <div className="relative mt-5 h-48 overflow-hidden rounded-3xl border border-[#3c92cf]/55 bg-[#020812] shadow-[0_0_28px_rgba(42,151,255,.22)]">
          <Image src="/images/lobby-diamond-skyline.png" alt="Glowing diamond above a futuristic skyline" fill priority sizes="(max-width: 768px) 100vw, 448px" className="object-cover object-center" />
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,8,19,.04),rgba(1,8,19,.18)_70%,rgba(1,8,19,.34))]" />
        </div>
        <div className="mt-5 text-center"><p className="text-[10px] font-black uppercase tracking-[.24em] text-[#7ecfff]">Southeast Asia edition</p><h1 className="mt-1 text-3xl font-black tracking-tight">Choose your players</h1><p className="mt-2 text-sm text-slate-300">Choose 2–4 players. Every toy pawn starts together on <b className="text-[#ffdb32]">GO</b>.</p></div>
        <div className="mt-6 grid grid-cols-3 gap-2">{[2, 3, 4].map((value) => <button key={value} type="button" onClick={() => onCountChange(value)} className={`rounded-2xl border px-2 py-3 text-center transition ${count === value ? "border-[#4ec3ff] bg-[#12639a]/50 shadow-[0_0_16px_rgba(63,184,255,.35)]" : "border-white/12 bg-white/5"}`}><span className="block text-2xl font-black">{value}</span><span className="mt-1 block text-[9px] font-black uppercase tracking-wider text-slate-300">Players</span></button>)}</div>
        <div className="mt-4 grid grid-cols-4 gap-2">{PLAYER_TEMPLATES.map((player, index) => <div key={player.id} className={`rounded-xl border p-2 text-center ${index < count ? "bg-[#0d2130]" : "border-white/10 bg-black/20 opacity-35"}`} style={{ borderColor: index < count ? player.color : undefined }}><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: player.color, color: player.color, backgroundColor: player.tint }}><TokenGlyph token={player.token} className="h-5 w-5" /></div><p className="mt-1 truncate text-[8px] font-black" style={{ color: player.color }}>{player.username}</p></div>)}</div>
        <button type="button" onClick={onStart} className="mt-auto rounded-2xl border-b-4 border-[#086ba5] bg-[linear-gradient(180deg,#4fc8ff,#0c82ca)] px-4 py-4 text-sm font-black tracking-[.16em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_7px_18px_rgba(0,0,0,.4)] active:translate-y-px">START GAME</button>
      </div>
    </div>
  );
}

export default function Monopoly({ onBack, onClose, userId, roomId }: MonopolyProps) {
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [selectedPlayerCount, setSelectedPlayerCount] = useState(4);
  const [gameState, setGameState] = useState<GameState>(() => createGameState(4));
  const [isRolling, setIsRolling] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TURN_DURATION_SECONDS);
  const [showGoBonusToast, setShowGoBonusToast] = useState(false);
  const [roomReady, setRoomReady] = useState(!roomId);
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [serverTurnDeadline, setServerTurnDeadline] = useState<string | null>(null);
  const [isRoomHost, setIsRoomHost] = useState(false);
  const activeServerPlayerRef = useRef<string | null>(null);
  const serverVersionRef = useRef<number | null>(null);
  const isRollingRef = useRef(false);
  const isMovingRef = useRef(false);
  const publishingRef = useRef(false);
  const lastPublishedStateRef = useRef<string | null>(null);
  const pendingCommandRef = useRef("state_sync");
  const turnEpochRef = useRef(0);
  const goBonusToastTimerRef = useRef<number | undefined>(undefined);
  const alertResolutionRef = useRef(false);

  useEffect(() => {
    const preventPinch = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", preventPinch, { passive: false });
    return () => document.removeEventListener("gesturestart", preventPinch);
  }, []);

  useEffect(() => { isRollingRef.current = isRolling; }, [isRolling]);
  useEffect(() => { isMovingRef.current = isMoving; }, [isMoving]);

  useEffect(() => {
    if (!roomId) return;
    const keepRoomAlive = () => {
      void supabase.rpc("heartbeat_matchmaking_room", { p_room_id: roomId });
      void supabase.rpc("replace_expired_four_player_seats", { p_room_id: roomId });
    };
    keepRoomAlive();
    const timer = window.setInterval(keepRoomAlive, 10_000);
    return () => window.clearInterval(timer);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || typeof window === "undefined") return;
    window.sessionStorage.setItem("joeyoke_active_monopoly_room", roomId);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const load = async () => {
      const [{ data: room }, { data: existing }, { data: escrow }] = await Promise.all([
        supabase.rpc("get_matchmaking_room", { p_room_id: roomId }),
        supabase.from("monopoly_match_state").select("state,active_player_id,version,status,turn_deadline").eq("room_id", roomId).maybeSingle(),
        supabase.from("monopoly_match_escrow").select("match_currency").eq("room_id", roomId).eq("user_id", userId).maybeSingle(),
      ]);
      setIsRoomHost(room?.host_id === userId);
      if (existing?.state) {
        const isNewServerRevision = serverVersionRef.current === null || existing.version !== serverVersionRef.current;
        if (isNewServerRevision && !isRollingRef.current && !isMovingRef.current && !publishingRef.current) {
          setGameState(existing.state as GameState);
        }
        lastPublishedStateRef.current = JSON.stringify(existing.state);
        activeServerPlayerRef.current = existing.active_player_id;
        serverVersionRef.current = existing.version;
        setServerVersion(existing.version);
        setServerTurnDeadline(existing.turn_deadline);
        setPhase("playing"); setRoomReady(true); return;
      }
      if (room?.host_id !== userId || !room?.players?.length) return;
      const currencyValue = Number(escrow?.match_currency || STARTING_CASH);
      const seeded = createGameState(4);
      seeded.players = seeded.players.map((player, index) => ({
        ...player,
        id: room.players[index]?.is_bot ? getMonopolyBotId(Number(room.players[index]?.seat || index + 1)) : room.players[index]?.user_id || player.id,
        username: room.players[index]?.name || player.username,
        cash: currencyValue,
      }));
      seeded.activePlayerId = seeded.players[0].id;
      const { error } = await supabase.rpc("initialize_monopoly_match", { p_room_id: roomId, p_state: seeded, p_active_player_id: seeded.activePlayerId });
      if (!error) { setGameState(seeded); lastPublishedStateRef.current = JSON.stringify(seeded); activeServerPlayerRef.current = seeded.activePlayerId; serverVersionRef.current = 1; setServerVersion(1); setPhase("playing"); setRoomReady(true); }
    };
    void load(); const timer = window.setInterval(() => { void load(); }, 1200);
    return () => window.clearInterval(timer);
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId) return;
    const timer = window.setInterval(() => { void supabase.rpc("advance_monopoly_timeout", { p_room_id: roomId }); }, 1000);
    return () => window.clearInterval(timer);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !serverTurnDeadline) return;
    const syncTimer = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(serverTurnDeadline).getTime() - Date.now()) / 1000)));
    syncTimer();
    const interval = window.setInterval(syncTimer, 250);
    return () => window.clearInterval(interval);
  }, [roomId, serverTurnDeadline]);

  useEffect(() => {
    if (!roomId || !gameState.winnerId) return;
    void supabase.rpc("settle_completed_monopoly_match", { p_room_id: roomId });
  }, [gameState.winnerId, roomId]);

  useEffect(() => {
    const serialized = JSON.stringify(gameState);
    const activeIsBot = isMonopolyBotId(activeServerPlayerRef.current);
    const isTradeResolution = pendingCommandRef.current === "confirm_trade" || pendingCommandRef.current === "decline_trade";

    if (isRolling || isMoving) return;

    if (!roomId || !userId || serverVersion === null || publishingRef.current || 
       (!activeIsBot && activeServerPlayerRef.current !== userId && !isTradeResolution) || 
       lastPublishedStateRef.current === serialized) return;

    publishingRef.current = true;
    void supabase.rpc("update_monopoly_match_state", {
      p_room_id: roomId,
      p_state: gameState,
      p_expected_version: serverVersionRef.current,
      p_next_active_player_id: gameState.activePlayerId,
      p_completed: Boolean(gameState.winnerId),
      p_action: pendingCommandRef.current,
    }).then(({ data, error }) => {
      publishingRef.current = false;
      if (!error) {
        lastPublishedStateRef.current = serialized;
        const nextVersion = Number(data?.version || (serverVersionRef.current || 0) + 1);
        serverVersionRef.current = nextVersion;
        setServerVersion(nextVersion);
        setServerTurnDeadline(data?.turn_deadline ?? null);
        activeServerPlayerRef.current = gameState.activePlayerId;
        pendingCommandRef.current = "state_sync";
      }
    });
  }, [gameState, roomId, serverVersion, userId, isRolling, isMoving]);

  const activePlayer = gameState.players.find((player) => player.id === gameState.activePlayerId) ?? gameState.players[0];
  const isMyTurn = !roomId || gameState.activePlayerId === userId;
  const canDriveActiveTurn = isMyTurn || (Boolean(roomId) && isMonopolyBotId(gameState.activePlayerId));
  const winner = gameState.winnerId ? gameState.players.find((player) => player.id === gameState.winnerId) : null;
  const isEndTurn = isMyTurn && gameState.hasRolled && !gameState.alert && !gameState.pendingPurchaseId && !gameState.actionPanel;
  const markCommand = (command: string) => { pendingCommandRef.current = command; };

  const playersBySpace = useMemo(() => {
    const result = new Map<string, Player[]>();
    gameState.players.filter((player) => !player.bankrupt).forEach((player) => {
      const space = boardSpaces[player.position];
      result.set(space.id, [...(result.get(space.id) ?? []), player]);
    });
    return result;
  }, [gameState.players]);

  const ownersBySpace = useMemo(() => {
    const result = new Map<string, Player>();
    gameState.players.forEach((player) => player.ownedSpaceIds.forEach((id) => result.set(id, player)));
    return result;
  }, [gameState.players]);

  const mortgagedSpaceIds = useMemo(() => new Set(gameState.players.flatMap((player) => player.mortgagedSpaceIds)), [gameState.players]);

  useEffect(() => {
    const lockPortrait = async () => {
      try {
        await (window.screen.orientation as BrowserScreenOrientation | undefined)?.lock?.("portrait");
      } catch { }
    };

    void lockPortrait();
    return () => {
      if (goBonusToastTimerRef.current) window.clearTimeout(goBonusToastTimerRef.current);
      (window.screen.orientation as BrowserScreenOrientation | undefined)?.unlock?.();
    };
  }, []);

  const handleStart = () => {
    turnEpochRef.current += 1;
    setSecondsLeft(TURN_DURATION_SECONDS);
    setIsRolling(false);
    setIsMoving(false);
    setGameState(createGameState(selectedPlayerCount));
    setShowRules(false);
    setPhase("playing");
  };

  const presentGoBonusToast = useCallback(() => {
    setShowGoBonusToast(true);
    if (goBonusToastTimerRef.current) window.clearTimeout(goBonusToastTimerRef.current);
    goBonusToastTimerRef.current = window.setTimeout(() => setShowGoBonusToast(false), 3000);
  }, []);

  const registerPlayerActivity = useCallback(() => {
    if (roomId) return;
    setSecondsLeft(TURN_DURATION_SECONDS);
    setGameState((current) => current.turnWarning ? { ...current, turnWarning: false } : current);
  }, [roomId]);

  const resolveLanding = (current: GameState): GameState => {
    const mover = current.players.find((player) => player.id === current.activePlayerId);
    if (!mover || mover.bankrupt) return current;

    const landedSpace = boardSpaces[mover.position];
    let players = current.players;
    let actionLog: ActionLog = { title: `${mover.username} arrived`, highlight: landedSpace.label };
    let pendingPurchaseId: string | null = null;
    let alert: GameAlert | null = null;
    const autoPassPlayerId: string | null = null;
    let pendingTransactions = current.pendingTransactions;

    if (landedSpace.kind === "go-to-jail") {
      players = players.map((player) => player.id === mover.id ? { ...player, position: jailPosition, inJail: true, jailAttempts: 0 } : player);
      actionLog = { title: `${mover.username} was sent to Jail`, highlight: "IN JAIL · PRESS CONTINUE" };
      alert = { kind: "notice", title: "IN JAIL", message: `${mover.username} landed on GO TO JAIL. Press CONTINUE to pass the turn.`, spaceId: landedSpace.id };
    } else if (landedSpace.kind === "go") {
      actionLog = { title: `${mover.username} reached GO`, highlight: `+${currency.format(GO_SALARY)} GO BONUS` };
      const hasQueuedGoBonus = pendingTransactions.some((transaction) => transaction.kind === "balance" && transaction.changes.some((change) => change.playerId === mover.id && change.cashDelta === GO_SALARY));
      pendingTransactions = hasQueuedGoBonus ? pendingTransactions.map((transaction) => transaction.kind === "balance" && transaction.changes.some((change) => change.playerId === mover.id && change.cashDelta === GO_SALARY) ? { ...transaction, autoPassAfterConfirmation: true } : transaction) : [...pendingTransactions, { kind: "balance", changes: [{ playerId: mover.id, cashDelta: GO_SALARY }], autoPassAfterConfirmation: true }];
      alert = { kind: "notice", title: "+$200 GO BONUS READY", message: `${mover.username} will collect the GO bonus after CONTINUE.`, spaceId: landedSpace.id };
    } else if (landedSpace.kind === "chest" || landedSpace.kind === "chance") {
      const deck = landedSpace.kind === "chest" ? CHEST_CARDS : CHANCE_CARDS;
      const card = deck[Math.floor(Math.random() * deck.length)];
      const cashDelta = getCardCashDelta(card);
      pendingTransactions = [...pendingTransactions, { kind: "balance", changes: [{ playerId: mover.id, cashDelta, jailFreeCardsDelta: card.jailFreeCards ?? 0 }], autoPassAfterConfirmation: true }];
      actionLog = { title: landedSpace.kind === "chest" ? "CHEST DRAWN" : "CHANCE DRAWN", highlight: card.title.toUpperCase() };
      alert = { kind: "card", title: card.title, message: `${card.description} ${cashDelta >= 0 ? "+" : ""}${currency.format(cashDelta)}${card.jailFreeCards ? " · JAIL-FREE CARD" : ""}`, spaceId: landedSpace.id, amount: cashDelta };
    } else if (landedSpace.kind === "tax") {
      const amount = landedSpace.taxAmount ?? 200;
      pendingTransactions = [...pendingTransactions, { kind: "bank-fee", playerId: mover.id, amount, bankruptIfInsufficient: true, autoPassAfterConfirmation: true }];
      actionLog = { title: "INCOME TAX DUE", highlight: `${currency.format(amount)} · CONFIRM PAYMENT` };
      alert = { kind: "payment", title: "Pay Income Tax", message: `${mover.username} owes the bank ${currency.format(amount)} in income tax.`, spaceId: landedSpace.id, amount };
    } else if (isOwnable(landedSpace)) {
      const owner = current.players.find((player) => player.ownedSpaceIds.includes(landedSpace.id));
      const availableCash = mover.cash + getQueuedCashDelta(pendingTransactions, mover.id);
      const purchasePrice = getPropertyPrice(landedSpace);
      if (!owner && purchasePrice > 0 && availableCash >= purchasePrice) {
        pendingPurchaseId = landedSpace.id;
        actionLog = { title: `${landedSpace.label} is available`, highlight: `BUY FOR ${currency.format(purchasePrice)} OR SKIP` };
        alert = { kind: "purchase", title: `${landedSpace.label} is available`, message: `Buy this ${landedSpace.kind === "station" ? "station" : "city"} for ${currency.format(purchasePrice)} or skip it for now.`, spaceId: landedSpace.id };
      } else if (!owner && purchasePrice > 0) {
        actionLog = { title: `${mover.username} cannot afford`, highlight: `${currency.format(purchasePrice)} · ${landedSpace.label}` };
        alert = { kind: "notice", title: "Purchase unavailable", message: `${mover.username} needs ${currency.format(purchasePrice)} to buy ${landedSpace.label}.`, autoPassOnDismiss: true };
      } else if (owner && owner.id !== mover.id) {
        if (owner.mortgagedSpaceIds.includes(landedSpace.id)) {
          actionLog = { title: `${landedSpace.label} is mortgaged`, highlight: "NO RENT COLLECTED" };
          pendingTransactions = [...pendingTransactions, { kind: "balance", changes: [], autoPassAfterConfirmation: true }];
          alert = { kind: "notice", title: "Mortgaged property", message: `${owner.username} cannot collect rent from ${landedSpace.label}. Press CONTINUE to pass the turn.`, spaceId: landedSpace.id };
          return { ...current, players, pendingPurchaseId, alert, autoPassPlayerId, pendingTransactions, winnerId: getWinner(players)?.id ?? null, actionLog };
        }
        const rent = getPropertyRent(landedSpace, getPropertyLevel(owner, landedSpace.id), hasCompleteColorSet(owner, landedSpace));
        pendingTransactions = [...pendingTransactions, { kind: "rent", payerId: mover.id, recipientId: owner.id, spaceId: landedSpace.id, amount: rent, autoPassAfterConfirmation: true }];
        actionLog = { title: `${mover.username} owes ${owner.username}`, highlight: `${currency.format(rent)} RENT · CONFIRM PAYMENT` };
        alert = { kind: "payment", title: "Rent payment due", message: `${mover.username} owes ${owner.username} ${currency.format(rent)} for landing on ${landedSpace.label}.`, spaceId: landedSpace.id, amount: rent };
      } else if (owner && landedSpace.kind === "property") {
        const level = getPropertyLevel(mover, landedSpace.id);
        actionLog = { title: `${mover.username} owns this city`, highlight: `${landedSpace.label} · LEVEL ${level}` };
        alert = { kind: "owned", title: `${landedSpace.label} is yours`, message: level === MAX_PROPERTY_LEVEL ? "This city is at hotel level. Use SELL to manage its buildings." : "Use BUILD, SELL, MORTGAGE, REDEEM, or TRADE from the action bar to manage this city.", spaceId: landedSpace.id };
      } else if (owner) {
        actionLog = { title: `${mover.username} owns this transport hub`, highlight: landedSpace.label };
        alert = { kind: "notice", title: `${landedSpace.label} is yours`, message: `No rent is due on your own ${landedSpace.label}. Press CONTINUE to pass the turn.`, spaceId: landedSpace.id, autoPassOnDismiss: true };
      }
    } else if (landedSpace.kind === "parking") {
      actionLog = { title: `${mover.username} is taking a break`, highlight: "FREE PARKING" };
      alert = { kind: "notice", title: "FREE PARKING", message: `${mover.username} can rest here safely. Press CONTINUE to pass the turn.`, spaceId: landedSpace.id };
    } else if (landedSpace.kind === "jail") {
      actionLog = { title: `${mover.username} reached Jail`, highlight: "IN JAIL" };
      alert = { kind: "notice", title: "IN JAIL", message: `${mover.username} is visiting Jail and remains free to move next turn. Press CONTINUE to pass the turn.`, spaceId: landedSpace.id };
    }

    return { ...current, players, pendingPurchaseId, alert, autoPassPlayerId, pendingTransactions, winnerId: getWinner(players)?.id ?? null, actionLog };
  };

  const movePlayerStepByStep = (steps: number, moverId: string, turnEpoch: number, startPosition: number) => {
    setIsMoving(true);
    for (let step = 1; step <= steps; step += 1) {
      window.setTimeout(() => {
        if (turnEpochRef.current !== turnEpoch) return;
        if ((startPosition + step) % boardSpaces.length === 0) presentGoBonusToast();
        setGameState((current) => {
          const mover = current.players.find((player) => player.id === moverId);
          if (!mover || mover.bankrupt || current.activePlayerId !== moverId) return current;
          const nextPosition = (mover.position + 1) % boardSpaces.length;
          const passedGo = mover.position !== 0 && nextPosition === 0;
          const players = current.players.map((player) => player.id === mover.id ? { ...player, position: nextPosition, inJail: false, jailAttempts: 0 } : player);
          const pendingTransactions = passedGo ? [...current.pendingTransactions, { kind: "balance" as const, changes: [{ playerId: mover.id, cashDelta: GO_SALARY }], autoPassAfterConfirmation: false }] : current.pendingTransactions;
          const movingState: GameState = { ...current, players, pendingTransactions, actionLog: { title: `${mover.username} is moving`, highlight: `STEP ${step} OF ${steps}` } };
          return step === steps ? resolveLanding(movingState) : movingState;
        });
        if (step === steps && turnEpochRef.current === turnEpoch) setIsMoving(false);
      }, step * 420);
    }
  };

  const handleRoll = async () => {
    if (!canDriveActiveTurn || isRolling || isMoving || gameState.hasRolled || gameState.pendingPurchaseId || gameState.alert || gameState.winnerId) return;
    if (roomId && (!userId || serverVersion === null)) return;
    registerPlayerActivity();

    let dice: [number, number] = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    if (roomId) {
      const { data, error } = await supabase.rpc("roll_monopoly_dice", { p_room_id: roomId, p_expected_version: serverVersionRef.current });
      if (error || !data) {
        setGameState((current) => ({ ...current, actionLog: { title: "Board updated", highlight: "WAITING FOR THE CURRENT TURN" } }));
        return;
      }
      dice = [Number(data.die_one), Number(data.die_two)];
    }
    markCommand("roll");
    const dieTotal = dice[0] + dice[1];
    const rollingPlayer = activePlayer;
    const turnEpoch = turnEpochRef.current;
    setGameState((current) => ({ ...current, actionPanel: null, dice, hasRolled: true, hasJourneyStarted: true, pendingPurchaseId: null, alert: null, actionLog: { title: `${rollingPlayer.username} rolled the dice`, highlight: "WATCH THE TOKEN MOVE" } }));
    setIsRolling(true);

    window.setTimeout(() => {
      if (turnEpochRef.current !== turnEpoch) return;
      setIsRolling(false);
      movePlayerStepByStep(dieTotal, rollingPlayer.id, turnEpoch, rollingPlayer.position);
    }, 680);
  };

  const handleBuy = () => {
    if (!canDriveActiveTurn) return;
    markCommand("purchase");
    registerPlayerActivity();
    setGameState((current) => {
      const settled = commitPendingTransactions(current);
      const space = settled.pendingPurchaseId ? getSpace(settled.pendingPurchaseId) : null;
      const buyer = settled.players.find((player) => player.id === settled.activePlayerId);
      const cost = Math.abs(space ? getPropertyPrice(space) : 0);
      const alreadyOwned = space ? settled.players.some((player) => player.ownedSpaceIds.includes(space.id)) : false;
      if (!space || !isOwnable(space) || !settled.hasRolled || !cost || !buyer || buyer.cash < cost || alreadyOwned) return { ...settled, pendingPurchaseId: null, alert: { kind: "notice", title: "Purchase unavailable", message: "This property is no longer available to buy.", autoPassOnDismiss: true } };
      const cashAfterPurchase = buyer.cash - cost;
      const players = settled.players.map((player) => player.id === buyer.id ? { ...player, cash: cashAfterPurchase, ownedSpaceIds: [...player.ownedSpaceIds, space.id], propertyLevels: { ...player.propertyLevels, [space.id]: 0 } } : player);
      return { ...settled, players, pendingPurchaseId: null, autoPassPlayerId: buyer.id, winnerId: getWinner(players)?.id ?? null, actionLog: { title: `${buyer.username} bought`, highlight: `${space.label} · -${currency.format(cost)} TO BANK` }, alert: null };
    });
  };

  const handleSkip = () => {
    if (!canDriveActiveTurn) return;
    markCommand("skip_purchase");
    registerPlayerActivity();
    setGameState((current) => {
      const settled = commitPendingTransactions(current);
      const space = settled.pendingPurchaseId ? getSpace(settled.pendingPurchaseId) : null;
      const player = settled.players.find((item) => item.id === settled.activePlayerId);
      return { ...settled, pendingPurchaseId: null, autoPassPlayerId: player?.id ?? null, actionLog: { title: `${player?.username ?? "Player"} passed on`, highlight: space?.label ?? "PROPERTY" }, alert: null };
    });
  };

  const handleDismissAlert = () => {
    if (!canDriveActiveTurn) return;
    if (alertResolutionRef.current) return;
    alertResolutionRef.current = true;
    markCommand("resolve_landing");
    registerPlayerActivity();
    setGameState((current) => {
      const landedKind = current.alert?.spaceId ? getSpace(current.alert.spaceId).kind : null;
      const shouldPassTurn = Boolean(current.alert?.autoPassOnDismiss) || current.alert?.kind === "auction" || landedKind === "jail" || landedKind === "parking" || landedKind === "go-to-jail" || current.pendingTransactions.some((transaction) => transaction.autoPassAfterConfirmation);
      const settled = commitPendingTransactions(current);
      return { ...settled, alert: null, auction: current.alert?.kind === "auction" ? null : current.auction, autoPassPlayerId: shouldPassTurn ? current.activePlayerId : current.autoPassPlayerId };
    });
    window.setTimeout(() => { alertResolutionRef.current = false; }, 0);
  };

  const handleOpenActionPanel = (kind: BoardActionKind) => {
    if (!isMyTurn) return;
    registerPlayerActivity();
    setGameState((current) => {
      const active = current.players.find((player) => player.id === current.activePlayerId);
      if (!active || current.winnerId || current.alert || current.pendingPurchaseId) return current;
      const recipient = current.players.find((player) => player.id !== active.id && !player.bankrupt);
      const existingTrade = current.actionPanel?.trade;
      const trade: TradeDraft | undefined = kind === "trade" && recipient ? existingTrade ?? { proposerId: active.id, recipientId: recipient.id, offeredCash: 0, requestedCash: 0, offeredPropertyId: null, requestedPropertyId: null, offeredJailFreeCard: false, requestedJailFreeCard: false, awaitingConfirmation: false } : undefined;
      return { ...current, actionPanel: { kind, trade } };
    });
  };

  const handleCloseActionPanel = () => {
    const isTradeRecipient = gameState.actionPanel?.trade?.recipientId === userId;
    if (!isMyTurn && !isTradeRecipient) return;
    registerPlayerActivity();
    setGameState((current) => {
      const cancelledSell = current.actionPanel?.kind === "sell";
      const cancelledTrade = current.actionPanel?.kind === "trade" && current.actionPanel?.trade?.awaitingConfirmation;
      return { ...current, actionPanel: null, autoPassPlayerId: cancelledSell ? current.activePlayerId : current.autoPassPlayerId, actionLog: cancelledSell ? { title: "SALE CANCELLED", highlight: "NEXT PLAYER READY" } : cancelledTrade ? { title: "TRADE CANCELLED", highlight: "PROPOSAL REJECTED" } : current.actionLog };
    });
  };

  const handleBuildProperty = useCallback((spaceId: string) => {
    if (!canDriveActiveTurn) return;
    markCommand("build");
    registerPlayerActivity();
    setGameState((current) => {
      const owner = current.players.find((player) => player.id === current.activePlayerId);
      const space = getSpace(spaceId);
      if (!owner || !owner.ownedSpaceIds.includes(spaceId) || !canBuildEvenly(owner, space)) return { ...current, actionLog: { title: "BUILD BLOCKED", highlight: "FULL SET + EVEN BUILD REQUIRED" } };
      const nextLevel = getPropertyLevel(owner, spaceId) + 1;
      const cost = getUpgradeCost(space, nextLevel);
      if (owner.cash < cost) return { ...current, actionLog: { title: "BUILD BLOCKED", highlight: "INSUFFICIENT CASH" } };
      const players = current.players.map((player) => player.id === owner.id ? { ...player, cash: player.cash - cost, propertyLevels: { ...player.propertyLevels, [spaceId]: nextLevel } } : player);
      return { ...current, players, autoPassPlayerId: owner.id, actionLog: { title: `${owner.username} built on ${space.label}`, highlight: nextLevel === MAX_PROPERTY_LEVEL ? "HOTEL COMPLETE" : `HOUSE ${nextLevel} · RENT ${currency.format(getPropertyRent(space, nextLevel))}` }, winnerId: getWinner(players)?.id ?? null };
    });
  }, [canDriveActiveTurn, registerPlayerActivity]);

  const handleSellBuilding = (spaceId: string, mode: "single" | "hotel" | "clear") => {
    if (!isMyTurn) return;
    markCommand("sell_building");
    registerPlayerActivity();
    setGameState((current) => {
      const owner = current.players.find((player) => player.id === current.activePlayerId);
      const space = getSpace(spaceId);
      if (!owner || !owner.ownedSpaceIds.includes(spaceId) || !canSellEvenly(owner, space)) return { ...current, actionLog: { title: "SALE BLOCKED", highlight: "SELL HIGHEST LEVEL EVENLY" } };
      const level = getPropertyLevel(owner, spaceId);
      if (level <= 0) return current;
      if (mode === "hotel" && level !== MAX_PROPERTY_LEVEL) return current;
      if (mode === "clear" && level !== MAX_PROPERTY_LEVEL) return current;
      const nextLevel = mode === "clear" ? 0 : level - 1;
      const levelsSold = mode === "clear" ? Array.from({ length: MAX_PROPERTY_LEVEL }, (_, index) => index + 1) : [level];
      const refund = Math.round(levelsSold.reduce((total, soldLevel) => total + getUpgradeCost(space, soldLevel), 0) * 0.5);
      const players = current.players.map((player) => player.id === owner.id ? { ...player, cash: player.cash + refund, propertyLevels: { ...player.propertyLevels, [spaceId]: nextLevel } } : player);
      const soldLabel = mode === "hotel" ? "hotel downgraded to 4 houses" : mode === "clear" ? "hotel and 4 houses sold" : "one house sold";
      return { ...current, players, autoPassPlayerId: owner.id, actionLog: { title: `${owner.username} ${soldLabel}`, highlight: `+${currency.format(refund)} · 50% BANK REFUND` } };
    });
  };

  const handleMortgageProperty = (spaceId: string) => {
    if (!isMyTurn) return;
    markCommand("mortgage");
    registerPlayerActivity();
    setGameState((current) => {
      const owner = current.players.find((player) => player.id === current.activePlayerId);
      const space = getSpace(spaceId);
      if (!owner || !owner.ownedSpaceIds.includes(spaceId) || owner.mortgagedSpaceIds.includes(spaceId) || hasAnyBuildingsInColorSet(owner, space)) return { ...current, actionLog: { title: "MORTGAGE BLOCKED", highlight: "SELL ALL COLOR-SET BUILDINGS FIRST" } };
      const value = getMortgageValue(space);
      const players = current.players.map((player) => player.id === owner.id ? { ...player, cash: player.cash + value, mortgagedSpaceIds: [...player.mortgagedSpaceIds, spaceId] } : player);
      return { ...current, players, autoPassPlayerId: owner.id, actionLog: { title: `${space.label} mortgaged`, highlight: `+${currency.format(value)} · RENT DISABLED` } };
    });
  };

  const handleRedeemMortgage = (spaceId: string) => {
    if (!isMyTurn) return;
    markCommand("redeem");
    registerPlayerActivity();
    setGameState((current) => {
      const owner = current.players.find((player) => player.id === current.activePlayerId);
      const space = getSpace(spaceId);
      const cost = Math.ceil(getMortgageValue(space) * 1.1);
      if (!owner || !owner.mortgagedSpaceIds.includes(spaceId) || owner.cash < cost) return { ...current, actionLog: { title: "REDEEM BLOCKED", highlight: "INSUFFICIENT CASH" } };
      const players = current.players.map((player) => player.id === owner.id ? { ...player, cash: player.cash - cost, mortgagedSpaceIds: player.mortgagedSpaceIds.filter((id) => id !== spaceId) } : player);
      return { ...current, players, autoPassPlayerId: owner.id, actionLog: { title: `${space.label} redeemed`, highlight: `${currency.format(cost)} · RENT RESTORED` } };
    });
  };

  const handleUpdateTrade = (update: Partial<TradeDraft>) => {
    if (!isMyTurn) return;
    registerPlayerActivity();
    setGameState((current) => {
      const panel = current.actionPanel;
      if (panel?.kind !== "trade" || !panel.trade || panel.trade.awaitingConfirmation) return current;
      const recipientChanged = update.recipientId && update.recipientId !== panel.trade.recipientId;
      return { ...current, actionPanel: { ...panel, trade: { ...panel.trade, ...update, ...(recipientChanged ? { requestedPropertyId: null, requestedCash: 0, requestedJailFreeCard: false } : {}) } } };
    });
  };

  const handleProposeTrade = () => {
    if (!isMyTurn) return;
    markCommand("propose_trade");
    registerPlayerActivity();
    setGameState((current) => {
      const panel = current.actionPanel;
      const trade = panel?.trade;
      const proposer = trade ? current.players.find((player) => player.id === trade.proposerId) : null;
      const recipient = trade ? current.players.find((player) => player.id === trade.recipientId) : null;
      const includesTransferAsset = Boolean(trade?.offeredPropertyId || trade?.requestedPropertyId || trade?.offeredJailFreeCard || trade?.requestedJailFreeCard);
      if (!panel || panel.kind !== "trade" || !trade || !proposer || !recipient || !includesTransferAsset || trade.offeredCash > proposer.cash || trade.requestedCash > recipient.cash) return { ...current, actionLog: { title: "TRADE BLOCKED", highlight: "INCLUDE A TITLE OR JAIL-FREE CARD" } };
      return { ...current, actionPanel: { ...panel, trade: { ...trade, awaitingConfirmation: true } }, actionLog: { title: `${proposer.username} proposed a trade`, highlight: `WAITING FOR ${recipient.username.toUpperCase()}` } };
    });
  };

  const handleConfirmTrade = useCallback(() => {
    markCommand("confirm_trade");
    registerPlayerActivity();
    setGameState((current) => {
      const panel = current.actionPanel;
      const trade = panel?.trade;
      const proposer = trade ? current.players.find((player) => player.id === trade.proposerId) : null;
      const recipient = trade ? current.players.find((player) => player.id === trade.recipientId) : null;
      const offeredSpace = trade?.offeredPropertyId ? getSpace(trade.offeredPropertyId) : null;
      const requestedSpace = trade?.requestedPropertyId ? getSpace(trade.requestedPropertyId) : null;
      const valid = panel?.kind === "trade" && trade?.awaitingConfirmation && proposer && recipient && Boolean(trade.offeredPropertyId || trade.requestedPropertyId || trade.offeredJailFreeCard || trade.requestedJailFreeCard) && trade.offeredCash <= proposer.cash && trade.requestedCash <= recipient.cash && (!offeredSpace || proposer.ownedSpaceIds.includes(offeredSpace.id) && getPropertyLevel(proposer, offeredSpace.id) === 0 && !proposer.mortgagedSpaceIds.includes(offeredSpace.id)) && (!requestedSpace || recipient.ownedSpaceIds.includes(requestedSpace.id) && getPropertyLevel(recipient, requestedSpace.id) === 0 && !recipient.mortgagedSpaceIds.includes(requestedSpace.id)) && (!trade.offeredJailFreeCard || proposer.jailFreeCards > 0) && (!trade.requestedJailFreeCard || recipient.jailFreeCards > 0);
      if (!valid || !trade || !proposer || !recipient) return { ...current, actionPanel: null, actionLog: { title: "TRADE DECLINED", highlight: "TERMS ARE NO LONGER VALID" } };
      
      const players = current.players.map((player) => {
        if (player.id === proposer.id) {
          const ownedSpaceIds = [...player.ownedSpaceIds];
          const propertyLevels = { ...player.propertyLevels };
          if (offeredSpace) { ownedSpaceIds.splice(ownedSpaceIds.indexOf(offeredSpace.id), 1); delete propertyLevels[offeredSpace.id]; }
          if (requestedSpace) { ownedSpaceIds.push(requestedSpace.id); propertyLevels[requestedSpace.id] = 0; }
          return { ...player, cash: player.cash - trade.offeredCash + trade.requestedCash, ownedSpaceIds, propertyLevels, jailFreeCards: player.jailFreeCards - Number(trade.offeredJailFreeCard) + Number(trade.requestedJailFreeCard) };
        }
        if (player.id === recipient.id) {
          const ownedSpaceIds = [...player.ownedSpaceIds];
          const propertyLevels = { ...player.propertyLevels };
          if (requestedSpace) { ownedSpaceIds.splice(ownedSpaceIds.indexOf(requestedSpace.id), 1); delete propertyLevels[requestedSpace.id]; }
          if (offeredSpace) { ownedSpaceIds.push(offeredSpace.id); propertyLevels[offeredSpace.id] = 0; }
          return { ...player, cash: player.cash + trade.offeredCash - trade.requestedCash, ownedSpaceIds, propertyLevels, jailFreeCards: player.jailFreeCards + Number(trade.offeredJailFreeCard) - Number(trade.requestedJailFreeCard) };
        }
        return player;
      });
      return { ...current, players, actionPanel: null, autoPassPlayerId: proposer.id, actionLog: { title: "TRADE CONFIRMED", highlight: `${proposer.username.toUpperCase()} ↔ ${recipient.username.toUpperCase()}` } };
    });
  }, [registerPlayerActivity]);

  const handleDeclineTrade = useCallback(() => {
    markCommand("decline_trade");
    registerPlayerActivity();
    setGameState((current) => ({ ...current, actionPanel: null, actionLog: { title: "TRADE DECLINED", highlight: "PROPOSAL REJECTED" } }));
  }, [registerPlayerActivity]);

  // 🤖 BOT AI: Trade Evaluator
  useEffect(() => {
    const panel = gameState.actionPanel;
    const trade = panel?.trade;
    
    if (panel?.kind === "trade" && trade?.awaitingConfirmation && isMonopolyBotId(trade.recipientId)) {
      if (roomId && userId !== trade.proposerId) return; 

      const timer = window.setTimeout(() => {
         const offeredSpace = trade.offeredPropertyId ? getSpace(trade.offeredPropertyId) : null;
         const requestedSpace = trade.requestedPropertyId ? getSpace(trade.requestedPropertyId) : null;
         
         const offerValue = trade.offeredCash + (offeredSpace ? (offeredSpace.cost || 150) * 1.5 : 0) + (trade.offeredJailFreeCard ? 50 : 0);
         const requestValue = trade.requestedCash + (requestedSpace ? (requestedSpace.cost || 150) * 2 : 0) + (trade.requestedJailFreeCard ? 50 : 0);
         
         if (offerValue >= requestValue) {
            handleConfirmTrade();
         } else {
            handleDeclineTrade();
         }
      }, 2000); // 2 seconds of "thinking"
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.actionPanel?.trade?.awaitingConfirmation, roomId, userId]);

  const handleUpgrade = () => {
    if (!isMyTurn) return;
    markCommand("upgrade");
    registerPlayerActivity();
    setGameState((current) => {
      const settled = commitPendingTransactions(current);
      const space = settled.alert?.spaceId ? getSpace(settled.alert.spaceId) : null;
      const owner = settled.players.find((player) => player.id === settled.activePlayerId);
      if (!space || !owner || !owner.ownedSpaceIds.includes(space.id)) return { ...settled, alert: null };
      const level = getPropertyLevel(owner, space.id);
      if (level >= MAX_PROPERTY_LEVEL) return { ...settled, alert: { kind: "notice", title: "Hotel level reached", message: `${space.label} is already at its maximum rent tier.`, spaceId: space.id, autoPassOnDismiss: true } };
      if (!hasCompleteColorSet(owner, space)) return { ...settled, alert: { kind: "notice", title: "Full color set required", message: `Own every ${space.color} property and redeem mortgages before building on ${space.label}.`, spaceId: space.id, autoPassOnDismiss: true } };
      if (!canBuildEvenly(owner, space)) return { ...settled, alert: { kind: "notice", title: "Build evenly", message: `Build the lowest-level property in the ${space.color} color set before adding another level to ${space.label}.`, spaceId: space.id, autoPassOnDismiss: true } };
      const nextLevel = level + 1;
      const upgradeCost = getUpgradeCost(space, nextLevel);
      if (owner.cash < upgradeCost) return { ...settled, alert: { kind: "notice", title: "Upgrade unavailable", message: `${owner.username} needs ${currency.format(upgradeCost)} to reach level ${nextLevel}.`, spaceId: space.id, autoPassOnDismiss: true } };
      const players = settled.players.map((player) => player.id === owner.id ? { ...player, cash: player.cash - upgradeCost, propertyLevels: { ...player.propertyLevels, [space.id]: nextLevel } } : player);
      return { ...settled, players, alert: { kind: "notice", title: "City upgraded", message: `${space.label} is now level ${nextLevel}. Rent is ${currency.format(getPropertyRent(space, nextLevel))}.`, spaceId: space.id }, autoPassPlayerId: owner.id, actionLog: { title: `${owner.username} upgraded ${space.label}`, highlight: `LEVEL ${nextLevel} · RENT ${currency.format(getPropertyRent(space, nextLevel))}` }, winnerId: getWinner(players)?.id ?? null };
    });
  };

  const handleSell = () => {
    if (!isMyTurn) return;
    markCommand("open_auction");
    registerPlayerActivity();
    setGameState((current) => {
      const settled = commitPendingTransactions(current);
      const space = settled.alert?.spaceId ? getSpace(settled.alert.spaceId) : null;
      const seller = settled.players.find((player) => player.id === settled.activePlayerId);
      if (!space || !seller || !seller.ownedSpaceIds.includes(space.id)) return { ...settled, alert: null };
      const bids = settled.players.filter((player) => player.id !== seller.id && !player.bankrupt && player.cash > 0).reduce<Record<string, number>>((result, player) => {
        const openingBid = Math.max(Math.round(getPropertyPrice(space) * 0.6), Math.round(getPropertyPrice(space) * (0.85 + Math.random() * 0.85)));
        result[player.id] = Math.min(player.cash, openingBid);
        return result;
      }, {});
      if (Object.keys(bids).length === 0) return { ...settled, alert: { kind: "notice", title: "No auction bidders", message: "No remaining player has enough cash to make an offer.", spaceId: space.id } };
      return { ...settled, auction: { spaceId: space.id, sellerId: seller.id, bids }, alert: { kind: "auction", title: `${space.label} is for sale`, message: "The remaining players have submitted their competitive bids.", spaceId: space.id }, actionLog: { title: `${seller.username} opened an auction`, highlight: space.label } };
    });
  };

  const handleAwardAuction = () => {
    if (!isMyTurn) return;
    markCommand("award_auction");
    registerPlayerActivity();
    setGameState((current) => {
      const auction = current.auction;
      const space = auction ? getSpace(auction.spaceId) : null;
      const seller = auction ? current.players.find((player) => player.id === auction.sellerId) : null;
      const winningBid = auction ? Object.entries(auction.bids).sort(([, firstBid], [, secondBid]) => secondBid - firstBid)[0] : null;
      const buyer = winningBid ? current.players.find((player) => player.id === winningBid[0]) : null;
      if (!auction || !space || !seller || !buyer || !winningBid) return { ...current, auction: null, alert: { kind: "notice", title: "Auction cancelled", message: "No valid bidder was available for this property." } };
      const bid = winningBid[1];
      const players = current.players.map((player) => {
        if (player.id === seller.id) {
          const propertyLevels = { ...player.propertyLevels };
          delete propertyLevels[space.id];
          return { ...player, cash: player.cash + bid, ownedSpaceIds: player.ownedSpaceIds.filter((id) => id !== space.id), propertyLevels };
        }
        if (player.id === buyer.id) return { ...player, cash: player.cash - bid, ownedSpaceIds: [...player.ownedSpaceIds, space.id], propertyLevels: { ...player.propertyLevels, [space.id]: 0 } };
        return player;
      });
      return { ...current, players, auction: null, alert: { kind: "notice", title: "Auction complete", message: `${buyer.username} won ${space.label} with a ${currency.format(bid)} bid.`, spaceId: space.id }, autoPassPlayerId: seller.id, actionLog: { title: `${buyer.username} won the auction`, highlight: `${space.label} · ${currency.format(bid)}` }, winnerId: getWinner(players)?.id ?? null };
    });
  };

  const handleInspectProperty = (spaceId: string) => {
    registerPlayerActivity();
    setGameState((current) => {
      const space = getSpace(spaceId);
      const owner = current.players.find((player) => player.ownedSpaceIds.includes(spaceId));
      if (!owner) return current;
      const level = getPropertyLevel(owner, spaceId);
      return { ...current, alert: { kind: "inspect", title: `${space.label} · LEVEL ${level}`, message: `Owned by ${owner.username}. Current rent is ${currency.format(getPropertyRent(space, level, hasCompleteColorSet(owner, space)))}.`, spaceId } };
    });
  };

  const handleEndTurn = useCallback(() => {
    if (!canDriveActiveTurn) return;
    markCommand("end_turn");
    registerPlayerActivity();
    setGameState((current) => getNextTurnState(current, "system"));
  }, [canDriveActiveTurn, registerPlayerActivity]);

  // 🤖 BOT AI: Turn Actions (Roll, Buy, Build, End)
  useEffect(() => {
    if (!roomId || !isMonopolyBotId(activePlayer.id) || gameState.winnerId || isRolling || isMoving) return;
    
    const timer = window.setTimeout(() => {
      if (gameState.alert) {
        handleDismissAlert();
      } else if (gameState.pendingPurchaseId) {
        handleBuy();
      } else if (!gameState.hasRolled && !gameState.actionPanel) {
        let didBuild = false;
        const ownedProps = activePlayer.ownedSpaceIds.map(getSpace).filter((s) => s.kind === "property");
        for (const space of ownedProps) {
          if (canBuildEvenly(activePlayer, space)) {
            const cost = getUpgradeCost(space, getPropertyLevel(activePlayer, space.id) + 1);
            if (activePlayer.cash >= cost + 300) {
              handleBuildProperty(space.id);
              didBuild = true;
              break; 
            }
          }
        }
        if (!didBuild) {
          void handleRoll();
        }
      } else if (gameState.hasRolled && !gameState.alert && !gameState.actionPanel) {
        handleEndTurn();
      }
    }, 1200); 
    
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer.id, gameState.alert, gameState.pendingPurchaseId, gameState.hasRolled, gameState.actionPanel, gameState.winnerId, isMoving, isRolling, roomId]);

  useEffect(() => {
    if (roomId) return;
    if (phase !== "playing" || gameState.winnerId) return;
    const timer = window.setTimeout(() => {
      if (secondsLeft <= 1) {
        turnEpochRef.current += 1;
        setIsRolling(false);
        setIsMoving(false);
        setSecondsLeft(TURN_DURATION_SECONDS);
        setGameState((current) => getNextTurnState({ ...current, alert: null, actionPanel: null, pendingPurchaseId: null, pendingTransactions: [], turnWarning: false }, "timeout"));
      } else {
        if (secondsLeft === TURN_DURATION_SECONDS - INACTIVITY_WARNING_AFTER_SECONDS + 1) setGameState((current) => current.turnWarning ? current : { ...current, turnWarning: true });
        setSecondsLeft((current) => current - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [gameState.winnerId, phase, secondsLeft]);

  // Jail Rule: Single skipped turn, OR use card if owned
  useEffect(() => {
    if (gameState.winnerId || !activePlayer.inJail || gameState.hasRolled || isMoving || isRolling || !canDriveActiveTurn) return;
    
    const timer = window.setTimeout(() => {
      if (activePlayer.jailFreeCards > 0) {
        markCommand("use_jail_card");
        setGameState((current) => ({
          ...current,
          players: current.players.map((player) => player.id === activePlayer.id ? { ...player, inJail: false, jailFreeCards: player.jailFreeCards - 1 } : player),
          actionLog: { title: `${activePlayer.username} used a Jail-Free card`, highlight: "ESCAPED JAIL · CAN ROLL" }
        }));
      } else {
        markCommand("jail_skip");
        setGameState((current) => current.activePlayerId === activePlayer.id && current.players.find((player) => player.id === activePlayer.id)?.inJail
          ? { ...current, players: current.players.map((player) => player.id === activePlayer.id ? { ...player, inJail: false, jailAttempts: 0 } : player), autoPassPlayerId: activePlayer.id, actionLog: { title: `${activePlayer.username} serves a Jail turn`, highlight: "TURN SKIPPED" } }
          : current);
      }
    }, 700);
    
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer.id, activePlayer.inJail, activePlayer.jailFreeCards, activePlayer.username, gameState.hasRolled, gameState.winnerId, isMoving, isRolling, canDriveActiveTurn]);

  useEffect(() => {
    const playerId = gameState.autoPassPlayerId;
    if (!playerId || gameState.winnerId) return;
    const timer = window.setTimeout(() => {
      turnEpochRef.current += 1;
      setIsRolling(false);
      setIsMoving(false);
      setSecondsLeft(TURN_DURATION_SECONDS);
      setGameState((current) => current.autoPassPlayerId === playerId ? getNextTurnState(current, "system") : current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [gameState.autoPassPlayerId, gameState.winnerId]);

  const handleExit = () => {
    if (onBack) onBack();
    else if (onClose) onClose();
    else window.location.assign("/");
  };

  if (roomId && !roomReady) return <div className="fixed inset-0 grid place-items-center bg-[#07111c] text-white">Loading shared Monopoly board…</div>;
  if (phase === "setup") {
    return <SetupScreen count={selectedPlayerCount} onCountChange={setSelectedPlayerCount} onStart={handleStart} onExit={handleExit} />;
  }

  return (
    <div className="fixed inset-0 z-[100] h-[100dvh] min-h-[100svh] w-full overflow-hidden overscroll-none touch-none bg-[radial-gradient(circle_at_50%_33%,#173a58_0%,#07111c_52%,#02060b_100%)] font-sans text-white">
      <style jsx global>{`
        @keyframes monopoly-crystal-float { 0%,100% { transform: translateY(0) rotate(0deg) scale(1); } 50% { transform: translateY(-7px) rotate(3deg) scale(1.03); } }
        @keyframes monopoly-crystal-roll { 0% { transform: translateY(-3px) rotate(0deg) scale(1); } 42% { transform: translateY(-18px) rotate(240deg) scale(1.13); } 100% { transform: translateY(0) rotate(540deg) scale(1); } }
        @keyframes monopoly-stage-die-trail { 0% { opacity: 0; transform: translate3d(-30px,9px,0) scale(.55) rotate(-20deg); } 26% { opacity: .58; } 66% { opacity: .3; transform: translate3d(14px,-3px,0) scale(1.05) rotate(9deg); } 100% { opacity: 0; transform: translate3d(2px,0,0) scale(1); } }
        @keyframes monopoly-stage-die-trail-alt { 0% { opacity: 0; transform: translate3d(30px,9px,0) scale(.55) rotate(20deg); } 26% { opacity: .58; } 66% { opacity: .3; transform: translate3d(-14px,-3px,0) scale(1.05) rotate(-9deg); } 100% { opacity: 0; transform: translate3d(-2px,0,0) scale(1); } }
        @keyframes monopoly-stage-die-roll { 0% { transform: translate3d(-11px,0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1); } 16% { transform: translate3d(8px,-30px,34px) rotateX(255deg) rotateY(175deg) rotateZ(78deg) scale(1.12); } 38% { transform: translate3d(15px,-6px,13px) rotateX(475deg) rotateY(352deg) rotateZ(190deg) scale(1.04); } 49% { transform: translate3d(6px,0,3px) rotateX(590deg) rotateY(470deg) rotateZ(270deg) scale(.96); } 64% { transform: translate3d(-5px,-13px,9px) rotateX(686deg) rotateY(594deg) rotateZ(328deg) scale(1.035); } 82% { transform: translate3d(-2px,-2px,2px) rotateX(735deg) rotateY(676deg) rotateZ(354deg) scale(.99); } 100% { transform: translate3d(0,0,0) rotateX(720deg) rotateY(720deg) rotateZ(360deg) scale(1); } }
        @keyframes monopoly-stage-die-roll-alt { 0% { transform: translate3d(11px,0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1); } 15% { transform: translate3d(-9px,-27px,30px) rotateX(-238deg) rotateY(210deg) rotateZ(-92deg) scale(1.13); } 36% { transform: translate3d(-15px,-7px,12px) rotateX(-452deg) rotateY(420deg) rotateZ(-204deg) scale(1.05); } 49% { transform: translate3d(-7px,0,2px) rotateX(-570deg) rotateY(540deg) rotateZ(-272deg) scale(.95); } 65% { transform: translate3d(5px,-11px,8px) rotateX(-675deg) rotateY(630deg) rotateZ(-332deg) scale(1.04); } 83% { transform: translate3d(2px,-2px,2px) rotateX(-738deg) rotateY(688deg) rotateZ(-356deg) scale(.99); } 100% { transform: translate3d(0,0,0) rotateX(-720deg) rotateY(720deg) rotateZ(-360deg) scale(1); } }
        @keyframes monopoly-pawn { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.06); } }
        @keyframes monopoly-aura { 0%,100% { opacity: .45; transform: scale(.75); } 50% { opacity: 1; transform: scale(1.18); } }
        @keyframes monopoly-badge { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
        @media (max-height: 740px) {
          .portrait-header { height: 40px !important; margin-top: 4px !important; }
          .portrait-player-card { min-height: 48px !important; padding-top: 4px !important; padding-bottom: 4px !important; }
          .portrait-controls { padding-top: 7px !important; padding-bottom: 8px !important; }
        }
        @media (max-height: 620px) {
          .portrait-header { height: 36px !important; }
          .portrait-player-card { min-height: 42px !important; }
          .portrait-controls { padding-top: 5px !important; padding-bottom: max(7px, env(safe-area-inset-bottom)) !important; }
          .portrait-controls button { padding-top: 8px !important; padding-bottom: 8px !important; }
        }
      `}</style>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col">
        <header className="portrait-header mx-2 mt-2 flex h-12 shrink-0 items-center rounded-xl border border-[#36556e] bg-[#0a131c]/95 px-2 shadow-[0_4px_14px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.08)]">
          <button type="button" onClick={handleExit} aria-label="Exit Monopoly" className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1 text-center"><p className="truncate text-[clamp(9px,2.7vw,13px)] font-black tracking-[.08em] text-[#eaf8ff]">{gameState.roundsLeft} ROUNDS LEFT · FINAL POINTS AT GAME END</p><p className="mt-0.5 text-[7px] font-black tracking-[.2em] text-[#72caff]">SOUTHEAST ASIA EDITION</p></div>
          <button type="button" onClick={() => setShowRules(true)} aria-label="Open rules" className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-white/10"><ShieldCheck className="h-5 w-5 text-[#76cfff]" /></button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-1.5">
          <section className="monopoly-board-zone flex min-h-0 flex-1 items-center justify-center py-1">
            <div className="relative grid h-full w-full max-w-[560px] place-items-center [container-type:size] [perspective:1200px]">
              <section aria-label="Southeast Asia Monopoly board" className="relative z-10 mx-auto grid h-[min(100cqh,100cqw)] w-[min(100cqh,100cqw)] max-h-full max-w-full overflow-hidden rounded-xl border-2 border-[#0a1016] bg-[#e8e4d6] shadow-[0_4px_0_#020407,0_10px_0_#1d2d39,0_23px_30px_rgba(0,0,0,.64),inset_0_0_0_2px_rgba(255,255,255,.62)]" style={{ gridTemplateColumns: "1.14fr repeat(7,minmax(0,1fr)) 1.14fr", gridTemplateRows: "1.14fr repeat(7,minmax(0,1fr)) 1.14fr" }}>
                <div className="col-span-9 row-start-1 grid min-h-0 grid-cols-9">{topTileIds.map((id) => <BoardTile key={id} colorBandEdge="bottom" space={getSpace(id)} tokens={playersBySpace.get(id) ?? []} owner={ownersBySpace.get(id)} mortgaged={mortgagedSpaceIds.has(id)} activePlayerId={gameState.activePlayerId} onInspect={handleInspectProperty} />)}</div>
                <div className="col-start-1 row-start-2 row-span-7 grid min-h-0 grid-rows-7">{leftTileIds.map((id) => <BoardTile key={id} colorBandEdge="right" space={getSpace(id)} tokens={playersBySpace.get(id) ?? []} owner={ownersBySpace.get(id)} mortgaged={mortgagedSpaceIds.has(id)} activePlayerId={gameState.activePlayerId} onInspect={handleInspectProperty} />)}</div>
                <CityStage actionLog={gameState.actionLog} dice={gameState.dice} isRolling={isRolling} canRoll={isMyTurn && !isRolling && !isMoving && !gameState.hasRolled && !gameState.pendingPurchaseId && !gameState.alert && !gameState.actionPanel && !gameState.winnerId} isEndTurn={isEndTurn} showStartBanner={!gameState.hasJourneyStarted} activePlayer={activePlayer} alert={gameState.alert} auction={gameState.auction} actionPanel={gameState.actionPanel} secondsLeft={secondsLeft} turnWarning={gameState.turnWarning} players={gameState.players} viewerId={userId} onRoll={handleRoll} onEndTurn={handleEndTurn} onBuy={handleBuy} onSkip={handleSkip} onUpgrade={handleUpgrade} onSell={handleSell} onAwardAuction={handleAwardAuction} onDismiss={handleDismissAlert} onBuild={handleBuildProperty} onSellBuilding={handleSellBuilding} onMortgage={handleMortgageProperty} onRedeem={handleRedeemMortgage} onUpdateTrade={handleUpdateTrade} onProposeTrade={handleProposeTrade} onConfirmTrade={handleConfirmTrade} onDeclineTrade={handleDeclineTrade} onCloseActionPanel={handleCloseActionPanel} />
                <div className="col-start-9 row-start-2 row-span-7 grid min-h-0 grid-rows-7">{rightTileIds.map((id) => <BoardTile key={id} colorBandEdge="left" space={getSpace(id)} tokens={playersBySpace.get(id) ?? []} owner={ownersBySpace.get(id)} mortgaged={mortgagedSpaceIds.has(id)} activePlayerId={gameState.activePlayerId} onInspect={handleInspectProperty} />)}</div>
                <div className="col-span-9 row-start-9 grid min-h-0 grid-cols-9">{bottomTileIds.map((id) => <BoardTile key={id} colorBandEdge="top" space={getSpace(id)} tokens={playersBySpace.get(id) ?? []} owner={ownersBySpace.get(id)} mortgaged={mortgagedSpaceIds.has(id)} activePlayerId={gameState.activePlayerId} onInspect={handleInspectProperty} />)}</div>
              </section>
            </div>
          </section>
          <section aria-label="Player dashboard" className="grid shrink-0 grid-cols-2 gap-2"><CornerPlayerCard player={gameState.players[0]} active={activePlayer?.id === gameState.players[0]?.id} /><CornerPlayerCard player={gameState.players[1]} active={activePlayer?.id === gameState.players[1]?.id} empty={!gameState.players[1]} /><CornerPlayerCard player={gameState.players[2]} active={activePlayer?.id === gameState.players[2]?.id} empty={!gameState.players[2]} /><CornerPlayerCard player={gameState.players[3]} active={activePlayer?.id === gameState.players[3]?.id} empty={!gameState.players[3]} /></section>
        </main>

        <footer className="portrait-controls shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
          <ActionControlBar disabled={!isMyTurn || isRolling || isMoving || Boolean(gameState.alert) || Boolean(gameState.winnerId)} sellDisabled={Boolean(gameState.winnerId)} onOpen={handleOpenActionPanel} />
          <div className="mx-auto mt-1.5 max-w-md">
            <button type="button" onClick={isEndTurn ? handleEndTurn : handleRoll} disabled={!isMyTurn || isRolling || isMoving || (!isEndTurn && gameState.hasRolled) || Boolean(gameState.pendingPurchaseId) || Boolean(gameState.alert) || Boolean(gameState.winnerId)} className="group relative w-full overflow-hidden rounded-xl border border-[#8fdfff] bg-[linear-gradient(180deg,#5dd9ff,#087dbf)] px-3 py-2.5 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_6px_13px_rgba(0,0,0,.4),0_0_17px_rgba(39,181,255,.18)] transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"><span className="absolute inset-x-[10%] top-0 h-px bg-white/85" /><span className="flex items-center justify-center gap-3"><span className="text-center"><span className="block text-[7px] font-black uppercase tracking-[.2em] text-[#d9f5ff]">Crystal action</span><span className="mt-0.5 block text-sm font-black uppercase tracking-[.14em]">{isRolling ? "Rolling" : isMoving ? "Moving" : isEndTurn ? "End turn" : isMyTurn ? "Roll dice" : `${activePlayer.username}'s turn`}</span></span><Gem className="h-6 w-6 shrink-0 text-[#fff0a8] drop-shadow-[0_0_5px_rgba(255,218,109,.8)]" fill="currentColor" /></span></button>
          </div>
        </footer>
      </div>

      {showGoBonusToast && <div className="pointer-events-none absolute left-1/2 top-16 z-[52] rounded-full border border-[#ffe45e] bg-[#2a2107]/95 px-4 py-2 text-center text-xs font-black tracking-[.12em] text-[#fff09a] shadow-[0_0_20px_rgba(255,213,68,.45)] animate-[monopoly-go-bonus-toast_3s_ease-in-out_forwards]">+$200 GO BONUS · CONFIRM TO COLLECT</div>}

      {showRules && <div className="absolute inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><section className="w-full max-w-sm rounded-2xl border border-[#56bbff] bg-[linear-gradient(135deg,#12283b,#06101a)] p-5 shadow-[0_16px_44px_rgba(0,0,0,.65)]"><div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-[#72caff]">Crystal table rules</p><h2 className="mt-1 text-xl font-black">Neon Monopoly</h2></div><button type="button" onClick={() => setShowRules(false)} className="grid h-8 w-8 place-items-center rounded-full border border-white/20"><X className="h-4 w-4" /></button></div><ol className="mt-4 space-y-2 text-xs leading-relaxed text-slate-200"><li><b className="text-[#ffda2d]">1.</b> Every selected player begins together on GO with {currency.format(STARTING_CASH)}.</li><li><b className="text-[#ffda2d]">2.</b> Roll the two 3D dice, buy available cities, and collect rent on owned cities.</li><li><b className="text-[#ffda2d]">3.</b> Passing GO earns {currency.format(GO_SALARY)}. Being sent to Jail skips your next turn (unless you possess a Jail-Free card).</li><li><b className="text-[#ffda2d]">4.</b> At game end, each surviving player receives final points equal to remaining cash × 10%.</li></ol><button type="button" onClick={() => setShowRules(false)} className="mt-5 w-full rounded-xl bg-gradient-to-b from-[#49c5ff] to-[#0c7fc4] py-3 text-xs font-black uppercase tracking-wider">Got it</button></section></div>}

      {winner && <div className="absolute inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"><section className="w-full max-w-sm rounded-2xl border-2 bg-[linear-gradient(135deg,#112b40,#061019)] p-6 text-center shadow-[0_0_40px_rgba(44,173,255,.22)]" style={{ borderColor: winner.color }}><Crown className="mx-auto h-10 w-10" style={{ color: winner.color }} fill="currentColor" /><p className="mt-2 text-[10px] font-black uppercase tracking-[.2em]" style={{ color: winner.color }}>Southeast Asia champion</p><h2 className="mt-2 text-3xl font-black">{winner.username}</h2><p className="mt-2 text-sm text-slate-200">Final points: {gameState.finalPointsAwarded ? winner.points : getFinalPoints(winner)} · {currency.format(winner.cash)} cash × 10%</p><div className="mt-4 space-y-1 rounded-xl border border-white/10 bg-black/20 p-2 text-left">{gameState.players.filter((player) => !player.bankrupt).sort((first, second) => getFinalPoints(second) - getFinalPoints(first) || second.cash - first.cash).map((player) => <div key={player.id} className="flex items-center justify-between text-[10px] font-bold"><span style={{ color: player.color }}>{player.username}</span><span className="text-slate-100">{getFinalPoints(player)} PTS · {currency.format(player.cash)}</span></div>)}</div><button type="button" onClick={() => { turnEpochRef.current += 1; setSecondsLeft(TURN_DURATION_SECONDS); setGameState(createGameState(selectedPlayerCount)); }} className="mt-6 w-full rounded-xl bg-white/10 py-3 text-xs font-black uppercase tracking-wider transition hover:bg-white/20"><RotateCcw className="mr-1 inline h-4 w-4" />Play again</button><button type="button" onClick={() => setPhase("setup")} className="mt-2 w-full py-2 text-[10px] font-black uppercase tracking-wider text-[#77cbff]">Change players</button></section></div>}
    </div>
  );
}