"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { RealtimeChannel } from "@supabase/supabase-js";
import { soundEngine } from "../../lib/soundManager";
import { getRandomBotOpponent } from "../../lib/botUtils";
import { processGameEntry, recordMatchResult } from "../../lib/matchManager";
import MatchmakingModal from "../MatchmakingModal";

// 🛍️ NEW: Live Database Cosmetic Hook
import { useEquippedCosmetic } from "../../lib/cosmeticsUtils";

// 🎱 Table Dimensions & Definitions
const TABLE_WIDTH = 360;
const TABLE_HEIGHT = 640;
const BALL_RADIUS = 10;
const HEAD_LINE_Y = 480;
const TURN_TIME_LIMIT = 30; // 30-second turn limit requirement

const EMOJIS = ["👍", "😂", "🔥", "😡", "😭", "🤯"];

const BALL_TYPES: Record<number, { name: string; type: "Solid" | "Stripes" | "Black" | "Cue"; color: string }> = {
  0: { name: "Cue Ball", type: "Cue", color: "#ffffff" },
  1: { name: "1 Solid", type: "Solid", color: "#facc15" },
  2: { name: "2 Solid", type: "Solid", color: "#2563eb" },
  3: { name: "3 Solid", type: "Solid", color: "#dc2626" },
  4: { name: "4 Solid", type: "Solid", color: "#9333ea" },
  5: { name: "5 Solid", type: "Solid", color: "#f97316" },
  6: { name: "6 Solid", type: "Solid", color: "#16a34a" },
  7: { name: "7 Solid", type: "Solid", color: "#854d0e" },
  8: { name: "8 Ball", type: "Black", color: "#000000" },
  9: { name: "9 Stripe", type: "Stripes", color: "#facc15" },
  10: { name: "10 Stripe", type: "Stripes", color: "#2563eb" },
  11: { name: "11 Stripe", type: "Stripes", color: "#dc2626" },
  12: { name: "12 Stripe", type: "Stripes", color: "#9333ea" },
  13: { name: "13 Stripe", type: "Stripes", color: "#f97316" },
  14: { name: "14 Stripe", type: "Stripes", color: "#16a34a" },
  15: { name: "15 Stripe", type: "Stripes", color: "#854d0e" },
};

// 🎨 Pool Ball UI Badge Component
const PoolBallBadge: React.FC<{ num: number; size?: number }> = ({ num, size = 22 }) => {
  const isStripe = num >= 9 && num <= 15;
  const isCue = num === 0;
  const info = BALL_TYPES[num] || BALL_TYPES[1];

  if (isCue) {
    return (
      <div
        className="rounded-full bg-white border border-gray-300 shadow-md shrink-0 flex items-center justify-center"
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    );
  }

  return (
    <div
      className="relative flex items-center justify-center rounded-full shadow-md overflow-hidden shrink-0 border border-black/30 select-none bg-white"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: "#ffffff",
      }}
    >
      {isStripe && (
        <div
          className="absolute w-full h-[58%]"
          style={{ backgroundColor: info.color }}
        />
      )}

      {!isStripe && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: info.color }}
        />
      )}

      <div
        className="relative z-10 flex items-center justify-center rounded-full bg-white shadow-sm font-black text-black"
        style={{
          width: `${size * 0.52}px`,
          height: `${size * 0.52}px`,
          fontSize: `${size * 0.32}px`,
        }}
      >
        {num}
      </div>
    </div>
  );
};

interface Ball {
  id: number;
  num: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinX?: number;
  spinY?: number;
  uAx: number; uAy: number; uAz: number;
  vAx: number; vAy: number; vAz: number;
  wAx: number; wAy: number; wAz: number;
  scale?: number;
  isPotted?: boolean;
}

interface PoolProps {
  onClose?: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

function rotateVector(
  vx: number, vy: number, vz: number,
  ax: number, ay: number,
  cosA: number, sinA: number
): [number, number, number] {
  const dot = ax * vx + ay * vy;
  const cx = ay * vz;
  const cy = -ax * vz;
  const cz = ax * vy - ay * vx;
  const oneMinusCos = 1 - cosA;

  return [
    vx * cosA + cx * sinA + ax * dot * oneMinusCos,
    vy * cosA + cy * sinA + ay * dot * oneMinusCos,
    vz * cosA + cz * sinA,
  ];
}

export default function PoolGame({ onClose, preloadedMatchId, opponent }: PoolProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 🛍️ LIVE DATABASE COSMETICS ENGINE SYNC
  const { modifiers } = useEquippedCosmetic("pool");
  const isCyberTable = !!modifiers;

  // 💰 DYNAMIC POINTS & ENTRY FEE SYSTEM
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [entryFee, setEntryFee] = useState<number>(100);
  const [showNoPointsModal, setShowNoPointsModal] = useState(false);

  // 🌐 MATCHMAKING MODAL STATES
  const [showMatchmaker, setShowMatchmaker] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<{ matchId: string; role: 1 | 2; isBot: boolean } | null>(null);

  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online" | "bot" | "searching" | "confirmed">(
    isBotMode ? "bot" : preloadedMatchId ? "join" : "menu"
  );

  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);
  const [matchId, setMatchId] = useState<string>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : "")
  );

  const [historyMatchId, setHistoryMatchId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "foul" | "info" | "success" } | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<1 | 2>(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const opponentSeenRef = useRef(false);
  const disconnectForfeitTimerRef = useRef<number | null>(null);

  const [currentTurn, setCurrentTurn] = useState<"player1" | "player2">("player1");
  const [playerGroups, setPlayerGroups] = useState<{ player1: "Open" | "Solids" | "Stripes"; player2: "Open" | "Solids" | "Stripes" }>({
    player1: "Open",
    player2: "Open",
  });

  const [remainingSolids, setRemainingSolids] = useState(7);
  const [remainingStripes, setRemainingStripes] = useState(7);
  const [, setPocketedHistory] = useState<number[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [foulMessage, setFoulMessage] = useState<string | null>(null);

  const [isBallInHand, setIsBallInHand] = useState(false);
  const [showConfirmBtn, setShowConfirmBtn] = useState(false);

  const [aimAngle, setAimAngle] = useState(-Math.PI / 2);
  const [uiPower, setUiPower] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(TURN_TIME_LIMIT);

  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; role: number }[]>([]);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  const aimAngleRef = useRef(-Math.PI / 2);
  const uiPowerRef = useRef(0);
  useEffect(() => { aimAngleRef.current = aimAngle; }, [aimAngle]);
  useEffect(() => { uiPowerRef.current = uiPower; }, [uiPower]);

  const [spinOffset, setSpinOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showSpinModal, setShowSpinModal] = useState(false);
  const spinCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [wheelPos, setWheelPos] = useState(0);
  const wheelDragStartY = useRef<number | null>(null);
  const isDraggingPower = useRef(false);
  const powerDragStartY = useRef<number | null>(null);
  const initialUiPower = useRef<number>(0);

  const ballsRef = useRef<Ball[]>([]);
  const ballsBeforeShotRef = useRef<{ solidsLeft: number; stripesLeft: number }>({ solidsLeft: 7, stripesLeft: 7 });
  const turnTrackingRef = useRef({ pottedNum: [] as number[], firstHitNum: -1, cueScratch: false });
  const wasMovingRef = useRef(false);
  const didIShootRef = useRef(false);

  const pockets = [
    { x: 22, y: 22 },
    { x: TABLE_WIDTH - 22, y: 22 },
    { x: 16, y: TABLE_HEIGHT / 2 },
    { x: TABLE_WIDTH - 16, y: TABLE_HEIGHT / 2 },
    { x: 22, y: TABLE_HEIGHT - 22 },
    { x: TABLE_WIDTH - 22, y: TABLE_HEIGHT - 22 },
  ];

  useEffect(() => {
    const fetchGameData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setMyUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("points")
          .eq("id", user.id)
          .single();
        if (profile) setUserPoints(profile.points ?? 0);
      }

      const { data: gameData } = await supabase
        .from("games")
        .select("entry_fee")
        .ilike("title", "8-Ball Pool")
        .single();

      if (gameData && typeof gameData.entry_fee === "number") {
        setEntryFee(gameData.entry_fee);
      }
    };
    fetchGameData();
  }, []);

  const checkPointsAndDeduct = async (): Promise<boolean> => {
    const result = await processGameEntry({
      gameTitle: "8-Ball Pool",
      entryFee,
      opponentName: localOpponent?.name || "Online Opponent",
    });

    if (!result.success) {
      if (result.error === "INSUFFICIENT_POINTS") {
        soundEngine.playSFX("defeat");
        setShowNoPointsModal(true);
      }
      return false;
    }

    if (result.updatedPoints !== undefined) setUserPoints(result.updatedPoints);
    if (result.matchId) setHistoryMatchId(result.matchId);
    return true;
  };

  useEffect(() => {
    if (!winner || !historyMatchId) return;

    let isWin = false;
    if (winner === "Player 1") {
      isWin = myPlayerRole === 1;
    } else if (winner === "Player 2") {
      isWin = myPlayerRole === 2;
    }

    const outcomeResult = isWin ? "Win" : "Loss";
    const rewardPoints = isWin ? entryFee * 2 : 0;

    recordMatchResult({
      game_id: "pool",
      game_title: "8-Ball Pool",
      opponent_name: localOpponent?.name || "Online Opponent",
      result: outcomeResult,
      points_change: rewardPoints
    });
  }, [winner, historyMatchId, myPlayerRole, entryFee, localOpponent]);

  const triggerFoulAlert = (msg: string) => {
    setFoulMessage(msg);
    setTimeout(() => setFoulMessage(null), 2500);
  };

  const handleTimeOut = useCallback(() => {
    if (winner || isMoving) return;
    soundEngine.playSFX("defeat");

    const nextTurn = currentTurn === "player1" ? "player2" : "player1";
    triggerFoulAlert("🚨 TIME EXPIRED! TURN LOST");
    setCurrentTurn(nextTurn);
    setIsBallInHand(true);
    setShowConfirmBtn(true);
    setSpinOffset({ x: 0, y: 0 });
    setUiPower(0);

    if (playMode === "online" && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "turn_sync",
        payload: {
          balls: ballsRef.current,
          nextTurn,
          groups: playerGroups,
          win: winner,
          foul: "🚨 TIME EXPIRED! TURN LOST"
        },
      });
    }
  }, [currentTurn, winner, isMoving, playMode, playerGroups]);

  useEffect(() => {
    if (playMode === "menu" || playMode === "searching" || playMode === "confirmed" || playMode === "host" || playMode === "join" || winner || isMoving) return;

    setTimeLeft(TURN_TIME_LIMIT);

    const timerInterval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          handleTimeOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [currentTurn, winner, isMoving, playMode, handleTimeOut]);

  const shouldConnect = matchId && myUserId && playMode !== "menu" && playMode !== "local" && playMode !== "bot" && playMode !== "searching" && playMode !== "confirmed";

  useEffect(() => {
    if (!shouldConnect) return;

    const channel = supabase.channel(`pool_${matchId}`, {
      config: { broadcast: { ack: false, self: false }, presence: { key: myUserId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const connectedPlayers = Object.keys(state).length;

        if (connectedPlayers === 2) {
          opponentSeenRef.current = true;
          if (disconnectForfeitTimerRef.current) window.clearTimeout(disconnectForfeitTimerRef.current);
          disconnectForfeitTimerRef.current = null;
        }
        if (connectedPlayers === 2 && playMode === "host") {
          setPlayMode("online");
          setToast({ msg: "Opponent joined the Arena!", type: "success" });
        } else if (connectedPlayers === 2 && playMode === "join") {
          setPlayMode("online");
          setToast({ msg: "Connected to Host Matrix!", type: "success" });
        } else if (connectedPlayers < 2 && playMode === "online" && opponentSeenRef.current && !disconnectForfeitTimerRef.current) {
          setToast({ msg: "Opponent reconnecting — 30 seconds remaining.", type: "info" });
          disconnectForfeitTimerRef.current = window.setTimeout(() => {
            setToast({ msg: "Opponent did not reconnect. You win by forfeit.", type: "success" });
            setWinner(myPlayerRole === 1 ? "Player 1" : "Player 2");
            disconnectForfeitTimerRef.current = null;
          }, 30_000);
        }
      })
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const { vx, vy, spinX, spinY, cueX, cueY } = payload.payload;
        const cueBall = ballsRef.current.find((b) => b.num === 0);
        if (cueBall) {
          cueBall.x = cueX;
          cueBall.y = cueY;
          cueBall.vx = vx;
          cueBall.vy = vy;
          cueBall.spinX = spinX;
          cueBall.spinY = spinY;
          setIsBallInHand(false);
          setIsMoving(true);
          didIShootRef.current = false;
          soundEngine.playSFX("strike");
        }
      })
      .on("broadcast", { event: "turn_sync" }, (payload) => {
        const { balls, nextTurn, groups, win, foul } = payload.payload;
        ballsRef.current = balls;
        setCurrentTurn(nextTurn);
        setPlayerGroups(groups);
        if (foul) triggerFoulAlert(foul);
        if (win) {
          setWinner(win);
          soundEngine.playSFX("victory");
        }
      })
      .on("broadcast", { event: "emoji" }, (payload) => {
        const { emoji, role } = payload.payload;
        const newEmoji = { id: Date.now() + Math.random(), emoji, role };
        setFloatingEmojis((prev) => [...prev, newEmoji]);
        setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
      });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ online_at: new Date().toISOString(), role: myPlayerRole });
    });

    return () => {
      if (disconnectForfeitTimerRef.current) window.clearTimeout(disconnectForfeitTimerRef.current);
      disconnectForfeitTimerRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [shouldConnect, matchId, myUserId, playMode, myPlayerRole]);

  const handleExitToHome = () => {
    soundEngine.playSFX("click");
    if (onClose) {
      onClose();
    } else {
      setPlayMode("menu");
    }
  };

  const sendEmoji = (emoji: string) => {
    soundEngine.playSFX("click");
    setShowEmojiMenu(false);
    if (playMode === "online" && channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "emoji", payload: { emoji, role: myPlayerRole } });
    } else {
      const newEmoji = { id: Date.now(), emoji, role: currentTurn === "player1" ? 1 : 2 };
      setFloatingEmojis((prev) => [...prev, newEmoji]);
      setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
    }
  };

  const evaluateTurnEnd = useCallback(() => {
    const tracking = turnTrackingRef.current;
    const opponent = currentTurn === "player1" ? "player2" : "player1";
    let turnSwitched = false;
    let localFoulMsg: string | null = null;

    const myGroup = playerGroups[currentTurn];
    const pottedEight = tracking.pottedNum.includes(8);
    const scratch = tracking.cueScratch;

    if (tracking.pottedNum.length > 0) {
      const newlyPotted = tracking.pottedNum.filter((n) => n > 0 && n !== 8);
      if (newlyPotted.length > 0) {
        setPocketedHistory((prev) => [...prev, ...newlyPotted]);
      }
    }

    const solidsRemainingCurrent = ballsRef.current.filter((b) => b.num >= 1 && b.num <= 7 && !b.isPotted).length;
    const stripesRemainingCurrent = ballsRef.current.filter((b) => b.num >= 9 && b.num <= 15 && !b.isPotted).length;

    setRemainingSolids(solidsRemainingCurrent);
    setRemainingStripes(stripesRemainingCurrent);

    if (pottedEight) {
      const myRemaining = myGroup === "Solids" ? solidsRemainingCurrent : myGroup === "Stripes" ? stripesRemainingCurrent : 99;
      if (scratch || (myGroup !== "Open" && myRemaining > 0)) {
        setWinner(opponent === "player1" ? "Player 1" : "Player 2");
      } else {
        setWinner(currentTurn === "player1" ? "Player 1" : "Player 2");
      }
      return;
    }

    let isLegalHit = false;
    const solidsBefore = ballsBeforeShotRef.current.solidsLeft;
    const stripesBefore = ballsBeforeShotRef.current.stripesLeft;

    if (tracking.firstHitNum > 0) {
      const hitType = BALL_TYPES[tracking.firstHitNum]?.type;
      if (myGroup === "Open") {
        isLegalHit = tracking.firstHitNum !== 8;
      } else if (myGroup === "Solids") {
        isLegalHit = solidsBefore > 0 ? hitType === "Solid" : tracking.firstHitNum === 8;
      } else if (myGroup === "Stripes") {
        isLegalHit = stripesBefore > 0 ? hitType === "Stripes" : tracking.firstHitNum === 8;
      }
    }

    let nextPlayerGroups = { ...playerGroups };

    if (scratch) {
      localFoulMsg = "🚨 FOUL - CUE BALL SCRATCH!";
      triggerFoulAlert(localFoulMsg);
      setIsBallInHand(true);
      setShowConfirmBtn(true);
      turnSwitched = true;
    } else if (!isLegalHit) {
      localFoulMsg = "🚨 FOUL - ILLEGAL TARGET HIT!";
      triggerFoulAlert(localFoulMsg);
      setIsBallInHand(true);
      setShowConfirmBtn(true);
      turnSwitched = true;
    } else {
      if (playerGroups.player1 === "Open") {
        const firstPottedTarget = tracking.pottedNum.find((n) => n !== 0 && n !== 8);
        if (firstPottedTarget) {
          const pottedType = BALL_TYPES[firstPottedTarget]?.type;
          if (pottedType === "Solid" || pottedType === "Stripes") {
            const assignedGroup = pottedType === "Solid" ? "Solids" : "Stripes";
            const otherGroup = assignedGroup === "Solids" ? "Stripes" : "Solids";
            nextPlayerGroups = {
              player1: currentTurn === "player1" ? assignedGroup : otherGroup,
              player2: currentTurn === "player2" ? assignedGroup : otherGroup,
            };
            setPlayerGroups(nextPlayerGroups);
          }
        }
      }

      const curGroupUpdated = nextPlayerGroups[currentTurn];
      const validPotted = tracking.pottedNum.some((n) => {
        const t = BALL_TYPES[n]?.type;
        if (curGroupUpdated === "Solids") return t === "Solid";
        if (curGroupUpdated === "Stripes") return t === "Stripes";
        return t === "Solid" || t === "Stripes";
      });

      if (!validPotted) {
        turnSwitched = true;
      }
    }

    const nextTurn = turnSwitched ? opponent : currentTurn;
    if (turnSwitched) setCurrentTurn(nextTurn);

    setSpinOffset({ x: 0, y: 0 });
    setUiPower(0);
    isDraggingPower.current = false;
    turnTrackingRef.current = { pottedNum: [], firstHitNum: -1, cueScratch: false };

    if (playMode === "online" && channelRef.current && didIShootRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "turn_sync",
        payload: {
          balls: ballsRef.current,
          nextTurn,
          groups: nextPlayerGroups,
          win: winner,
          foul: localFoulMsg
        },
      });
    }

  }, [currentTurn, playerGroups, playMode, winner]);

  useEffect(() => {
    if (playMode === "bot" && currentTurn === "player2" && !isMoving && !winner) {
      const timer = setTimeout(() => {
        const cueBall = ballsRef.current.find(b => b.num === 0 && !b.isPotted);
        if (!cueBall) return;

        const myGroup = playerGroups.player2;
        let validTargets = ballsRef.current.filter(b => !b.isPotted && b.num !== 0);

        if (myGroup === "Solids") validTargets = validTargets.filter(b => b.num >= 1 && b.num <= 7);
        else if (myGroup === "Stripes") validTargets = validTargets.filter(b => b.num >= 9 && b.num <= 15);
        
        if (validTargets.length === 0) validTargets = ballsRef.current.filter(b => b.num === 8 && !b.isPotted);
        
        if (validTargets.length > 0) {
          const target = validTargets[Math.floor(Math.random() * validTargets.length)];
          const aim = Math.atan2(target.y - cueBall.y, target.x - cueBall.x);
          
          ballsBeforeShotRef.current = {
            solidsLeft: ballsRef.current.filter((b) => b.num >= 1 && b.num <= 7 && !b.isPotted).length,
            stripesLeft: ballsRef.current.filter((b) => b.num >= 9 && b.num <= 15 && !b.isPotted).length,
          };

          if (isBallInHand) {
            setIsBallInHand(false);
            setShowConfirmBtn(false);
          }

          const power = 10 + Math.random() * 8;
          cueBall.vx = Math.cos(aim) * power;
          cueBall.vy = Math.sin(aim) * power;
          
          setIsMoving(true);
          soundEngine.playSFX("strike");
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [playMode, currentTurn, isMoving, winner, playerGroups, isBallInHand]);

  const initBalls = useCallback(() => {
    const balls: Ball[] = [];
    let idCounter = 1;

    balls.push({
      id: idCounter++, num: 0, x: TABLE_WIDTH / 2, y: HEAD_LINE_Y, vx: 0, vy: 0,
      uAx: 1, uAy: 0, uAz: 0, vAx: 0, vAy: 1, vAz: 0, wAx: 0, wAy: 0, wAz: 1,
      scale: 1, isPotted: false
    });

    const rackOrder = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    const startX = TABLE_WIDTH / 2;
    const startY = 180;
    let idx = 0;

    for (let col = 0; col < 5; col++) {
      for (let row = 0; row <= col; row++) {
        if (idx < rackOrder.length) {
          const rx = (Math.random() - 0.5) * 2;
          const ry = (Math.random() - 0.5) * 2;
          const rz = (Math.random() - 0.5) * 2;
          const lenV = Math.hypot(rx, ry, rz) || 1;

          const vAx = rx / lenV, vAy = ry / lenV, vAz = rz / lenV;
          const wAx = -vAy, wAy = vAx, wAz = 0;
          const lenW = Math.hypot(wAx, wAy, wAz) || 1;
          const normWAx = wAx / lenW, normWAy = wAy / lenW;

          const uAx = vAy * 0 - vAz * normWAy;
          const uAy = vAz * normWAx - vAx * 0;
          const uAz = vAx * normWAy - vAy * normWAx;

          balls.push({
            id: idCounter++, num: rackOrder[idx], x: startX - col * BALL_RADIUS + row * (BALL_RADIUS * 2), y: startY - col * (BALL_RADIUS * 1.8),
            vx: 0, vy: 0, uAx, uAy, uAz, vAx, vAy, vAz, wAx: normWAx, wAy: normWAy, wAz: 0,
            scale: 1, isPotted: false,
          });
          idx++;
        }
      }
    }

    ballsRef.current = balls;
    setCurrentTurn("player1");
    setPlayerGroups({ player1: "Open", player2: "Open" });
    setRemainingSolids(7);
    setRemainingStripes(7);
    setPocketedHistory([]);
    setWinner(null);
    setFoulMessage(null);
    setIsBallInHand(false);
    setShowConfirmBtn(false);
    setUiPower(0);
    setAimAngle(-Math.PI / 2);
    setSpinOffset({ x: 0, y: 0 });
    turnTrackingRef.current = { pottedNum: [], firstHitNum: -1, cueScratch: false };
  }, []);

  useEffect(() => {
    initBalls();
  }, [initBalls]);

  useEffect(() => {
    if (!showSpinModal || !spinCanvasRef.current) return;
    const canvas = spinCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const r = w / 2 - 10;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(w / 2 - r * 0.3, h / 2 - r * 0.3, r * 0.1, w / 2, h / 2, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.8, "#f1f5f9");
    grad.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(w / 2, 10); ctx.lineTo(w / 2, h - 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, h / 2); ctx.lineTo(w - 10, h / 2); ctx.stroke();
    ctx.setLineDash([]);

    const dotX = w / 2 + spinOffset.x * (r - 12);
    const dotY = h / 2 - spinOffset.y * (r - 12);

    ctx.beginPath();
    ctx.arc(dotX, dotY, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }, [showSpinModal, spinOffset]);

  const handleSpinCanvasInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = spinCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const radius = rect.width / 2 - 10;

    const clickX = e.clientX - rect.left - rect.width / 2;
    const clickY = e.clientY - rect.top - rect.height / 2;

    const dist = Math.hypot(clickX, clickY);
    const maxDist = radius - 12;

    let normX = clickX / maxDist;
    let normY = -clickY / maxDist;

    if (dist > maxDist) {
      const angle = Math.atan2(clickY, clickX);
      normX = Math.cos(angle);
      normY = -Math.sin(angle);
    }

    setSpinOffset({
      x: Math.max(-1, Math.min(1, normX)),
      y: Math.max(-1, Math.min(1, normY)),
    });
  };

  const handleSpinPointerUp = () => setShowSpinModal(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const engineLoop = () => {
      if (playMode === "menu" || playMode === "searching" || playMode === "confirmed" || playMode === "host" || playMode === "join") {
        animId = requestAnimationFrame(engineLoop);
        return;
      }

      const balls = ballsRef.current;
      let dynamicMotion = false;

      const SUB_STEPS = 4;
      const frictionFactor = Math.pow(0.985, 1 / SUB_STEPS);

      for (let step = 0; step < SUB_STEPS; step++) {
        balls.forEach((ball) => {
          if (ball.isPotted) return;
          pockets.forEach((p) => {
            // Require the ball centre to enter the actual pocket throat.
            if (Math.hypot(ball.x - p.x, ball.y - p.y) < BALL_RADIUS * 2.1) {
              ball.isPotted = true;
              ball.vx = 0;
              ball.vy = 0;
              ball.x = p.x;
              ball.y = p.y;

              if (ball.num === 0) {
                turnTrackingRef.current.cueScratch = true;
                setTimeout(() => {
                  ball.isPotted = false;
                  ball.scale = 1;
                  ball.x = TABLE_WIDTH / 2;
                  ball.y = HEAD_LINE_Y;
                  setIsBallInHand(true);
                  setShowConfirmBtn(true);
                }, 700);
              } else {
                turnTrackingRef.current.pottedNum.push(ball.num);
              }
            }
          });
        });

        balls.forEach((ball) => {
          if (ball.isPotted) {
            if (ball.scale && ball.scale > 0.1) {
              ball.scale -= 0.08 / SUB_STEPS;
              dynamicMotion = true;
            }
            ball.vx = 0;
            ball.vy = 0;
            return;
          }

          if (isBallInHand && ball.num === 0) {
            ball.vx = 0;
            ball.vy = 0;
            return;
          }

          ball.x += ball.vx / SUB_STEPS;
          ball.y += ball.vy / SUB_STEPS;

          const speed = Math.hypot(ball.vx, ball.vy);
          if (speed > 0.001) {
            const ax = -ball.vy / speed;
            const ay = ball.vx / speed;
            const dAngle = (speed / BALL_RADIUS) / SUB_STEPS;
            const cosA = Math.cos(dAngle);
            const sinA = Math.sin(dAngle);

            const newU = rotateVector(ball.uAx, ball.uAy, ball.uAz, ax, ay, cosA, sinA);
            ball.uAx = newU[0]; ball.uAy = newU[1]; ball.uAz = newU[2];

            const newV = rotateVector(ball.vAx, ball.vAy, ball.vAz, ax, ay, cosA, sinA);
            ball.vAx = newV[0]; ball.vAy = newV[1]; ball.vAz = newV[2];

            const newW = rotateVector(ball.wAx, ball.wAy, ball.wAz, ax, ay, cosA, sinA);
            ball.wAx = newW[0]; ball.wAy = newW[1]; ball.wAz = newW[2];
          }

          if (ball.num === 0 && (ball.spinY || ball.spinX)) {
            if (speed > 0.1) {
              const speedRatio = 1 + (ball.spinY || 0) * 0.003;
              ball.vx *= Math.max(0.95, Math.min(1.02, frictionFactor * speedRatio));
              ball.vy *= Math.max(0.95, Math.min(1.02, frictionFactor * speedRatio));
            } else {
              ball.spinX = 0;
              ball.spinY = 0;
            }
          } else {
            ball.vx *= frictionFactor;
            ball.vy *= frictionFactor;
          }

          if (speed < 0.05) {
            ball.vx = 0;
            ball.vy = 0;
          } else {
            dynamicMotion = true;
          }

          const boundX = 22 + BALL_RADIUS;
          const boundY = 22 + BALL_RADIUS;
          if (ball.x < boundX || ball.x > TABLE_WIDTH - boundX) {
            ball.vx *= -1;
            if (ball.num === 0 && ball.spinX) ball.vy += ball.spinX * 0.8;
            ball.x = ball.x < boundX ? boundX : TABLE_WIDTH - boundX;
          }
          if (ball.y < boundY || ball.y > TABLE_HEIGHT - boundY) {
            ball.vy *= -1;
            if (ball.num === 0 && ball.spinX) ball.vx += ball.spinX * 0.8;
            ball.y = ball.y < boundY ? boundY : TABLE_HEIGHT - boundY;
          }
        });

        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i];
            const b2 = balls[j];
            if (isBallInHand || b1.isPotted || b2.isPotted) continue;

            const dist = Math.hypot(b2.x - b1.x, b2.y - b1.y);
            if (dist < BALL_RADIUS * 2) {
              const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
              const overlap = BALL_RADIUS * 2 - dist;
              b1.x -= Math.cos(angle) * overlap * 0.5;
              b1.y -= Math.sin(angle) * overlap * 0.5;
              b2.x += Math.cos(angle) * overlap * 0.5;
              b2.y += Math.sin(angle) * overlap * 0.5;

              if (b1.num === 0 && turnTrackingRef.current.firstHitNum === -1) {
                turnTrackingRef.current.firstHitNum = b2.num;
              }

              const kx = b1.vx - b2.vx;
              const ky = b1.vy - b2.vy;
              const impulse = (2 * (Math.cos(angle) * kx + Math.sin(angle) * ky)) / 2;

              b1.vx -= impulse * Math.cos(angle);
              b1.vy -= impulse * Math.sin(angle);

              if (b1.num === 0 && b1.spinY && b1.spinY < -0.2) {
                const backPower = Math.abs(b1.spinY) * 0.65;
                b1.vx -= Math.cos(angle) * impulse * backPower;
                b1.vy -= Math.sin(angle) * impulse * backPower;
              }

              b2.vx += impulse * Math.cos(angle);
              b2.vy += impulse * Math.sin(angle);
            }
          }
        }
      }

      ballsRef.current = balls.filter((b) => b.num === 0 || !b.isPotted || (b.scale && b.scale > 0.1));

      setIsMoving((prev) => (prev !== dynamicMotion ? dynamicMotion : prev));

      if (wasMovingRef.current && !dynamicMotion) {
        evaluateTurnEnd();
      }
      wasMovingRef.current = dynamicMotion;

      ctx.fillStyle = "#3b1e08";
      ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

      ctx.fillStyle = "#1e130a";
      ctx.fillRect(10, 10, TABLE_WIDTH - 20, TABLE_HEIGHT - 20);

      ctx.fillStyle = isCyberTable ? "#09090b" : "#0f4c81";
      ctx.fillRect(18, 18, TABLE_WIDTH - 36, TABLE_HEIGHT - 36);

      pockets.forEach((p) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, BALL_RADIUS * 2.3, 0, Math.PI * 2);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.restore();
      });

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(18, HEAD_LINE_Y);
      ctx.lineTo(TABLE_WIDTH - 18, HEAD_LINE_Y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(TABLE_WIDTH / 2, HEAD_LINE_Y, 45, 0, Math.PI, false);
      ctx.stroke();

      ballsRef.current.forEach((ball) => {
        const r = BALL_RADIUS * (ball.scale ?? 1);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.x + 2, ball.y + 3, r * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fill();
        ctx.restore();
      });

      ballsRef.current.forEach((ball) => {
        const r = BALL_RADIUS * (ball.scale ?? 1);
        if (r <= 0.5) return;

        ctx.save();
        ctx.translate(ball.x, ball.y);

        const info = BALL_TYPES[ball.num] || BALL_TYPES[0];
        const isStripe = ball.num >= 9 && ball.num <= 15;

        const currentActiveGroup = playerGroups[currentTurn];
        let isTarget = false;

        if (currentActiveGroup === "Open" && ball.num >= 1 && ball.num <= 15 && ball.num !== 8) {
          isTarget = true;
        } else if (currentActiveGroup === "Solids" && ball.num >= 1 && ball.num <= 7) {
          isTarget = true;
        } else if (currentActiveGroup === "Stripes" && ball.num >= 9 && ball.num <= 15) {
          isTarget = true;
        } else if (
          ((currentActiveGroup === "Solids" && remainingSolids === 0) ||
           (currentActiveGroup === "Stripes" && remainingStripes === 0)) &&
          ball.num === 8
        ) {
          isTarget = true;
        }

        if (isTarget && !ball.isPotted && !dynamicMotion) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
          ctx.strokeStyle = "#00f0ff";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(0, 240, 255, 0.2)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
          ctx.stroke();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();

        if (ball.num === 0) {
          // Cue Ball
        } else if (isStripe) {
          const steps = 36;
          const h = 0.48;
          const r1 = Math.sqrt(1 - h * h);

          for (let i = 0; i < steps; i++) {
            const phi1 = (i / steps) * Math.PI * 2;
            const phi2 = ((i + 1) / steps) * Math.PI * 2;

            const cos1 = Math.cos(phi1), sin1 = Math.sin(phi1);
            const cos2 = Math.cos(phi2), sin2 = Math.sin(phi2);

            const p1x = h * ball.vAx + r1 * (cos1 * ball.uAx + sin1 * ball.wAx);
            const p1y = h * ball.vAy + r1 * (cos1 * ball.uAy + sin1 * ball.wAy);
            const p1z = h * ball.vAz + r1 * (cos1 * ball.uAz + sin1 * ball.wAz);

            const p2x = h * ball.vAx + r1 * (cos2 * ball.uAx + sin2 * ball.wAx);
            const p2y = h * ball.vAy + r1 * (cos2 * ball.uAy + sin2 * ball.wAy);
            const p2z = h * ball.vAz + r1 * (cos2 * ball.uAz + sin2 * ball.wAz);

            const p3x = -h * ball.vAx + r1 * (cos2 * ball.uAx + sin2 * ball.wAx);
            const p3y = -h * ball.vAy + r1 * (cos2 * ball.uAy + sin2 * ball.wAy);
            const p3z = -h * ball.vAz + r1 * (cos2 * ball.uAz + sin2 * ball.wAz);

            const p4x = -h * ball.vAx + r1 * (cos1 * ball.uAx + sin1 * ball.wAx);
            const p4y = -h * ball.vAy + r1 * (cos1 * ball.uAy + sin1 * ball.wAy);
            const p4z = -h * ball.vAz + r1 * (cos1 * ball.uAz + sin1 * ball.wAz);

            const avgZ = (p1z + p2z + p3z + p4z) / 4;

            if (avgZ >= -0.15) {
              ctx.beginPath();
              ctx.moveTo(p1x * r, p1y * r);
              ctx.lineTo(p2x * r, p2y * r);
              ctx.lineTo(p3x * r, p3y * r);
              ctx.lineTo(p4x * r, p4y * r);
              ctx.closePath();
              ctx.fillStyle = info.color;
              ctx.fill();
            }
          }
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = info.color;
          ctx.fill();
        }

        const spots = [
          { x: ball.wAx, y: ball.wAy, z: ball.wAz },
          { x: -ball.wAx, y: -ball.wAy, z: -ball.wAz }
        ];

        spots.forEach((spot) => {
          if (spot.z > 0.05 && ball.num !== 0) {
            ctx.save();
            const spotX = spot.x * r;
            const spotY = spot.y * r;
            const spotR = r * 0.42;

            const scaleX = 1;
            const scaleY = Math.max(0.15, spot.z);
            const rot = Math.atan2(spot.y, spot.x) + Math.PI / 2;

            ctx.translate(spotX, spotY);
            ctx.rotate(rot);
            ctx.scale(scaleX, scaleY);

            ctx.beginPath();
            ctx.arc(0, 0, spotR, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();

            ctx.fillStyle = "#000000";
            ctx.font = `bold ${Math.floor(spotR * 1.25)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(ball.num.toString(), 0, 0.5);

            ctx.restore();
          }
        });

        const lightGrad = ctx.createRadialGradient(
          -r * 0.35, -r * 0.35, r * 0.05,
          0, 0, r
        );
        lightGrad.addColorStop(0, "rgba(255, 255, 255, 0.55)");
        lightGrad.addColorStop(0.25, "rgba(255, 255, 255, 0.1)");
        lightGrad.addColorStop(0.85, "rgba(0, 0, 0, 0.2)");
        lightGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
        ctx.fillStyle = lightGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.restore();
      });

      const cueBall = balls.find((b) => b.num === 0);
      if (!cueBall) {
        animId = requestAnimationFrame(engineLoop);
        return;
      }

      const currentAimAngle = aimAngleRef.current;
      const currentUiPower = uiPowerRef.current;

      if (!dynamicMotion && !isBallInHand) {
        let closestDist = 999999;
        let hitBall: Ball | null = null;
        const cos = Math.cos(currentAimAngle);
        const sin = Math.sin(currentAimAngle);

        balls.forEach((b) => {
          if (b.num === 0 || b.isPotted) return;
          const toX = b.x - cueBall.x;
          const toY = b.y - cueBall.y;
          const projection = toX * cos + toY * sin;

          if (projection > 0) {
            const perpDist = Math.abs(-sin * toX + cos * toY);
            if (perpDist < BALL_RADIUS * 2) {
              const hitDist = projection - Math.sqrt(Math.pow(BALL_RADIUS * 2, 2) - Math.pow(perpDist, 2));
              if (hitDist > 0 && hitDist < closestDist) {
                closestDist = hitDist;
                hitBall = b;
              }
            }
          }
        });

        const myGroup = playerGroups[currentTurn];
        const solidsLeft = ballsRef.current.filter((b) => b.num >= 1 && b.num <= 7 && !b.isPotted).length;
        const stripesLeft = ballsRef.current.filter((b) => b.num >= 9 && b.num <= 15 && !b.isPotted).length;

        let isForbiddenHit = false;
        if (hitBall) {
          const hitType = BALL_TYPES[(hitBall as Ball).num]?.type;
          if (myGroup === "Solids") {
            isForbiddenHit = solidsLeft > 0 ? hitType !== "Solid" : (hitBall as Ball).num !== 8;
          } else if (myGroup === "Stripes") {
            isForbiddenHit = stripesLeft > 0 ? hitType !== "Stripes" : (hitBall as Ball).num !== 8;
          } else if (myGroup === "Open") {
            isForbiddenHit = (hitBall as Ball).num === 8;
          }
        }

        ctx.save();
        ctx.lineWidth = 1.2;
        if (hitBall) {
          const ghostX = cueBall.x + cos * closestDist;
          const ghostY = cueBall.y + sin * closestDist;

          if (!isForbiddenHit) {
            ctx.save();
            ctx.beginPath();
            ctx.arc((hitBall as Ball).x, (hitBall as Ball).y, BALL_RADIUS * 1.5, 0, Math.PI * 2);
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 2]);
            ctx.stroke();
            ctx.restore();
          }

          if (isForbiddenHit) {
            ctx.strokeStyle = "#ef4444";
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(ghostX, ghostY); ctx.stroke();

            ctx.save();
            ctx.translate(ghostX, ghostY);
            ctx.beginPath();
            ctx.arc(0, 0, BALL_RADIUS * 1.1, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
            ctx.fill();
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-BALL_RADIUS * 0.7, -BALL_RADIUS * 0.7);
            ctx.lineTo(BALL_RADIUS * 0.7, BALL_RADIUS * 0.7);
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
            ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(ghostX, ghostY); ctx.stroke();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(ghostX, ghostY, BALL_RADIUS, 0, Math.PI * 2); ctx.stroke();

            const targetAngle = Math.atan2((hitBall as Ball).y - ghostY, (hitBall as Ball).x - ghostX);
            ctx.strokeStyle = "#22d3ee";
            ctx.beginPath();
            ctx.moveTo((hitBall as Ball).x, (hitBall as Ball).y);
            ctx.lineTo((hitBall as Ball).x + Math.cos(targetAngle) * 90, (hitBall as Ball).y + Math.sin(targetAngle) * 90);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(cueBall.x + cos * 240, cueBall.y + sin * 240); ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        const stickOffset = 14 + currentUiPower * 0.45;
        const cueLength = 180;

        ctx.translate(cueBall.x, cueBall.y);
        ctx.rotate(currentAimAngle + Math.PI);

        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(stickOffset, -2, 3, 4);

        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(stickOffset + 3, -2.2, 5, 4.4);

        const shaftGrad = ctx.createLinearGradient(0, -3, 0, 3);
        shaftGrad.addColorStop(0, "#fef3c7");
        shaftGrad.addColorStop(0.5, "#d97706");
        shaftGrad.addColorStop(1, "#78350f");

        ctx.beginPath();
        ctx.moveTo(stickOffset + 8, -2.2);
        ctx.lineTo(stickOffset + 110, -3.5);
        ctx.lineTo(stickOffset + 110, 3.5);
        ctx.lineTo(stickOffset + 8, 2.2);
        ctx.closePath();
        ctx.fillStyle = shaftGrad;
        ctx.fill();

        const buttGrad = ctx.createLinearGradient(0, -4, 0, 4);
        buttGrad.addColorStop(0, "#334155");
        buttGrad.addColorStop(0.5, "#0f172a");
        buttGrad.addColorStop(1, "#020617");

        ctx.beginPath();
        ctx.moveTo(stickOffset + 110, -3.5);
        ctx.lineTo(stickOffset + cueLength, -4.5);
        ctx.lineTo(stickOffset + cueLength, 4.5);
        ctx.lineTo(stickOffset + 110, 3.5);
        ctx.closePath();
        ctx.fillStyle = buttGrad;
        ctx.fill();

        ctx.fillStyle = "#000000";
        ctx.fillRect(stickOffset + cueLength, -4.8, 4, 9.6);

        ctx.restore();
      }

      animId = requestAnimationFrame(engineLoop);
    };

    engineLoop();
    return () => cancelAnimationFrame(animId);
  }, [isBallInHand, evaluateTurnEnd, playerGroups, currentTurn, remainingSolids, remainingStripes, playMode, isCyberTable]);

  const handleCanvasInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMoving) return;
    if (playMode === "online" && ((currentTurn === "player1" && myPlayerRole !== 1) || (currentTurn === "player2" && myPlayerRole !== 2))) return;
    if (playMode === "bot" && currentTurn === "player2") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const clickX = ((e.clientX - rect.left) / rect.width) * TABLE_WIDTH;
    const clickY = ((e.clientY - rect.top) / rect.height) * TABLE_HEIGHT;

    const cueBall = ballsRef.current.find((b) => b.num === 0);
    if (!cueBall || cueBall.isPotted) return;

    if (isBallInHand) {
      const minX = 22 + BALL_RADIUS;
      const maxX = TABLE_WIDTH - 22 - BALL_RADIUS;
      const minY = 22 + BALL_RADIUS;
      const maxY = TABLE_HEIGHT - 22 - BALL_RADIUS;

      if (clickX >= minX && clickX <= maxX && clickY >= minY && clickY <= maxY) {
        let isOverlapping = false;
        ballsRef.current.forEach((b) => {
          if (b.num === 0 || b.isPotted) return;
          if (Math.hypot(clickX - b.x, clickY - b.y) < BALL_RADIUS * 2.1) isOverlapping = true;
        });

        if (!isOverlapping) {
          cueBall.x = clickX;
          cueBall.y = clickY;
        }
      }
    } else {
      if (isDraggingPower.current) return;
      if (e.buttons === 1 || e.pointerType === "touch") {
        setAimAngle(Math.atan2(clickY - cueBall.y, clickX - cueBall.x));
      }
    }
  };

  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMoving || isBallInHand) return;
    wheelDragStartY.current = e.clientY;
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wheelDragStartY.current === null) return;
    const deltaY = e.clientY - wheelDragStartY.current;
    wheelDragStartY.current = e.clientY;
    setAimAngle((prev) => prev + deltaY * 0.003);
    setWheelPos((prev) => prev + deltaY);
  };

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    wheelDragStartY.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
  };

  const handlePowerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMoving || isBallInHand) return;
    if (playMode === "online" && ((currentTurn === "player1" && myPlayerRole !== 1) || (currentTurn === "player2" && myPlayerRole !== 2))) return;
    if (playMode === "bot" && currentTurn === "player2") return;

    isDraggingPower.current = true;
    powerDragStartY.current = e.clientY;
    initialUiPower.current = uiPower;
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch (_) {}
  };

  const handlePowerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPower.current || powerDragStartY.current === null) return;
    const currentY = e.clientY;
    const deltaY = currentY - powerDragStartY.current;
    const calculatedChange = (deltaY / 180) * 100;
    let newPower = initialUiPower.current + calculatedChange;

    if (newPower < 0) newPower = 0;
    if (newPower > 100) newPower = 100;

    setUiPower(newPower);
  };

  const handlePowerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPower.current) return;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}

    const finalPower = uiPower;
    isDraggingPower.current = false;
    powerDragStartY.current = null;

    if (isMoving || finalPower < 5) {
      setUiPower(0);
      return;
    }

    const cueBall = ballsRef.current.find((b) => b.num === 0);
    if (!cueBall) return;

    ballsBeforeShotRef.current = {
      solidsLeft: ballsRef.current.filter((b) => b.num >= 1 && b.num <= 7 && !b.isPotted).length,
      stripesLeft: ballsRef.current.filter((b) => b.num >= 9 && b.num <= 15 && !b.isPotted).length,
    };

    const impulseSpeed = (finalPower / 100) * 22;
    const vx = Math.cos(aimAngle) * impulseSpeed;
    const vy = Math.sin(aimAngle) * impulseSpeed;

    cueBall.vx = vx;
    cueBall.vy = vy;
    cueBall.spinX = spinOffset.x;
    cueBall.spinY = spinOffset.y;

    setIsMoving(true);
    setUiPower(0);
    didIShootRef.current = true;
    soundEngine.playSFX("strike");

    if (playMode === "online" && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "shot_fired",
        payload: { vx, vy, spinX: spinOffset.x, spinY: spinOffset.y, cueX: cueBall.x, cueY: cueBall.y },
      });
    }

    setSpinOffset({ x: 0, y: 0 });
  };

  const startOnlineMatchmaking = async () => {
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    setShowMatchmaker(true);
  };

  const hostMatch = async () => {
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMatchId(code);
    setRoomCode(code);
    setMyPlayerRole(1);
    setPlayMode("host");
  };

  const joinMatch = async () => {
    if (!joinCode || joinCode.length < 6) return;
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    setMatchId(joinCode.toUpperCase());
    setMyPlayerRole(2);
    setPlayMode("join");
  };

  const enterBotMatch = () => {
    soundEngine.playSFX("click");
    setMatchId(`bot_match_${Date.now()}`);
    setMyPlayerRole(1);
    setPlayMode("bot");
    setToast({ msg: `Playing against ${localOpponent?.name || "Bot"}`, type: "success" });
  };

  const enterConfirmedMatch = () => {
    soundEngine.playSFX("click");
    if (pendingMatch) {
      setMatchId(pendingMatch.matchId);
      setMyPlayerRole(pendingMatch.role);
      
      if (pendingMatch.isBot) {
        setPlayMode("bot");
        setToast({ msg: `Playing against ${localOpponent?.name || 'Bot'}`, type: 'success' });
      } else {
        setPlayMode("online");
      }
    } else {
      enterBotMatch();
    }
  };

  const handleCopyCode = () => {
    soundEngine.playSFX("click");
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentActiveGroup = playerGroups[currentTurn];
  const isCurrentGroupCleared =
    (currentActiveGroup === "Solids" && remainingSolids === 0) ||
    (currentActiveGroup === "Stripes" && remainingStripes === 0);

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] bg-[#030712] flex flex-col justify-between items-center overflow-hidden touch-none select-none z-[9999] p-2 md:p-3 pt-safe pb-safe text-white">
      
      {showNoPointsModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-6 animate-fade-in touch-none">
          <div className="bg-[#18181b] border border-rose-500/30 rounded-[28px] p-6 w-full max-w-[340px] shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-rose-400">monetization_on</span>
            </div>
            <h3 className="font-headline font-black text-xl text-white uppercase tracking-tight mb-1">
              Insufficient Points
            </h3>
            <p className="text-xs text-neutral-400 font-medium leading-relaxed mb-4">
              You need <span className="text-[#CCFF00] font-bold">{entryFee} PTS</span> to play an online Pool match.
            </p>
            <div className="w-full bg-[#09090b] border border-white/10 rounded-2xl p-3 mb-6 flex justify-between items-center">
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Your Balance</span>
              <span className="text-sm font-black font-mono text-rose-400">
                {userPoints ?? 0} PTS
              </span>
            </div>
            <div className="w-full space-y-2">
              <button
                onClick={() => {
                  soundEngine.playSFX("click");
                  handleExitToHome();
                }}
                className="w-full bg-[#CCFF00] hover:bg-[#b3e600] text-black font-headline font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-1.5 touch-manipulation"
              >
                <span className="material-symbols-outlined text-base">shopping_cart</span>
                Visit Store / Buy Points
              </button>
              <button
                onClick={() => setShowNoPointsModal(false)}
                className="w-full bg-white/5 hover:bg-white/10 text-neutral-400 font-headline font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all border border-white/5 touch-manipulation"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {showMatchmaker && (
        <MatchmakingModal
          gameKey="pool" 
          gameName="8-Ball Pool"
          userId={myUserId || ""}
          onMatchFound={(matchData) => {
            setShowMatchmaker(false);
            setLocalOpponent(matchData.opponent);
            setPendingMatch({
              matchId: matchData.matchId || `bot_match_${Date.now()}`,
              role: (matchData.role as 1 | 2) || 1,
              isBot: matchData.opponent.isBot || false
            });
            setPlayMode("confirmed"); 
          }}
          onCancel={() => {
            soundEngine.playSFX("click");
            setShowMatchmaker(false);
          }}
        />
      )}

      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-[#09090b] flex items-center justify-center p-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-2xl text-[#38bdf8]">sports_bar</span>
              </div>
              <div>
                <h1 className="font-headline font-black text-xl tracking-tight text-white uppercase">
                  8-Ball Pool
                </h1>
                <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
              </div>
            </div>

            <button
              onClick={startOnlineMatchmaking}
              className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5 touch-manipulation"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-[#CCFF00]/10 rounded-xl flex items-center justify-center text-[#CCFF00]">
                  <span className="material-symbols-outlined text-xl">search</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-[#CCFF00]/10 text-[#CCFF00] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    {entryFee} PTS
                  </span>
                  <div className="w-7 h-7 rounded-full bg-[#CCFF00] flex items-center justify-center text-black opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                    <span className="material-symbols-outlined text-sm font-black">arrow_forward</span>
                  </div>
                </div>
              </div>
              <h3 className="font-headline font-black text-lg text-white mb-1 group-hover:text-[#CCFF00] transition-colors">
                Find Online Match
              </h3>
              <p className="text-xs text-neutral-400 font-medium leading-relaxed">
                Ranked & casual global<br />matchmaking
              </p>
            </button>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={hostMatch}
                className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px] touch-manipulation"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-400">
                    <span className="material-symbols-outlined text-lg">dns</span>
                  </div>
                  <span className="bg-teal-500/10 text-teal-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Private
                  </span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-sm text-white mb-0.5">Host Match</h3>
                  <p className="text-[10px] text-neutral-400 font-medium">Create room code</p>
                </div>
              </button>

              <button
                onClick={() => {
                  soundEngine.playSFX("click");
                  setPlayMode("local");
                }}
                className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px] touch-manipulation"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400">
                    <span className="material-symbols-outlined text-lg">sports_esports</span>
                  </div>
                  <span className="bg-pink-500/10 text-pink-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Offline
                  </span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-sm text-white mb-0.5">Pass & Play</h3>
                  <p className="text-[10px] text-neutral-400 font-medium">Local device</p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full mb-6">
              <div className="relative flex-1 min-w-0 flex items-center bg-[#09090b] border border-white/10 rounded-2xl p-1.5">
                <div className="pl-3 pr-2 text-neutral-500 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">vpn_key</span>
                </div>
                <input
                  type="text"
                  placeholder="ENTER ROOM CODE..."
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 min-w-0 bg-transparent text-sm font-headline font-bold text-white placeholder-neutral-600 focus:outline-none uppercase tracking-widest"
                  maxLength={6}
                />
              </div>
              <button
                onClick={joinMatch}
                disabled={joinCode.length < 6}
                className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5 uppercase touch-manipulation"
              >
                Join
              </button>
            </div>

            <button
              onClick={handleExitToHome}
              className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase touch-manipulation"
            >
              <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
            </button>
          </div>
        </div>
      )}

      {playMode === "confirmed" && (
        <div className="absolute inset-0 z-[60] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#CCFF00]/10 border border-[#CCFF00]/30 text-[#CCFF00] px-4 py-1.5 rounded-full font-headline font-black text-xs tracking-widest mb-10 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">auto_awesome</span> MATCH CONFIRMED
          </div>

          <div className="flex items-center gap-6 mb-8 relative">
            <div className="w-20 h-20 bg-[#18181b] rounded-2xl border border-white/10 flex items-center justify-center rotate-[-5deg] shadow-2xl relative z-10">
              <span className="material-symbols-outlined text-4xl text-white opacity-50">person</span>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#CCFF00] flex items-center justify-center z-20 shadow-[0_0_20px_rgba(204,255,0,0.4)]">
              <span className="material-symbols-outlined text-black text-sm font-black">close</span>
            </div>

            <div className="w-20 h-20 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center rotate-[5deg] shadow-2xl overflow-hidden relative z-10">
              <span className="material-symbols-outlined text-4xl text-indigo-400">
                {localOpponent?.avatarIcon || "person"}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase mb-1">Opposing Player</p>
          <h2 className="font-headline font-black text-3xl text-white mb-2">{localOpponent?.name || "Player 2"}</h2>
          <p className="text-sm text-neutral-400 flex items-center gap-2 mb-12">
            <span className="w-2 h-2 rounded-full bg-[#CCFF00]"></span> Ranked • {localOpponent?.elo || 1200} ELO
          </p>

          <button
            onClick={enterConfirmedMatch}
            className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)] uppercase touch-manipulation"
          >
            Enter Match <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}

      {(playMode === "host" || playMode === "join") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 relative z-10">
          <div className="bg-[#18181b] border border-white/10 rounded-[2.5rem] p-8 w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none"></div>
            <div className="w-16 h-16 rounded-full border-[3px] border-amber-900/30 border-t-amber-400 animate-spin mb-6 relative z-10"></div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase relative z-10 font-headline">
              {playMode === "join" ? "Syncing Matrix..." : "Awaiting Opponent"}
            </h2>

            {playMode === "host" && (
              <div className="mt-8 w-full relative z-10">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mb-2">Share This Room Code</p>
                <div className="bg-[#09090b] border border-white/10 p-2.5 rounded-2xl flex items-center justify-between shadow-inner">
                  <span className="text-amber-400 font-mono text-2xl font-black tracking-[0.25em] pl-4 pt-1">{roomCode}</span>
                  <button
                    onClick={handleCopyCode}
                    className={`h-11 px-5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm touch-manipulation ${
                      copied ? "bg-emerald-500 text-white" : "bg-white/10 text-white border border-white/10 hover:scale-[1.02] active:scale-95"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                soundEngine.playSFX("click");
                playMode === "host" ? setPlayMode("menu") : handleExitToHome();
              }}
              className="w-full mt-8 py-3.5 bg-white/5 text-neutral-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-white/5 relative z-10 touch-manipulation"
            >
              Cancel Match
            </button>
          </div>
        </div>
      )}

      {(playMode === "local" || playMode === "online" || playMode === "bot") && (
        <div className="w-full flex-1 flex flex-col justify-between items-center min-h-0 pt-safe pb-safe">
          
          {floatingEmojis.map((em) => {
            const isMine = em.role === myPlayerRole;
            return (
              <div key={em.id} className={`absolute z-40 text-4xl animate-float-up pointer-events-none ${
                isMine ? "right-10 bottom-10" : "left-10 top-10"
              }`}>
                {em.emoji}
              </div>
            );
          })}

          {foulMessage && (
            <div className="absolute top-16 z-[999999] bg-rose-600 border-2 border-white text-white font-black text-xs px-6 py-2 rounded-full shadow-2xl animate-bounce tracking-widest uppercase">
              {foulMessage}
            </div>
          )}

          {showSpinModal && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-[999999] flex justify-center items-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col items-center max-w-[280px] w-full shadow-2xl animate-fade-in">
                <h3 className="text-white text-xs font-black uppercase tracking-widest mb-3">Cue Ball Strike Point</h3>
                <canvas
                  ref={spinCanvasRef}
                  width={160}
                  height={160}
                  onPointerDown={handleSpinCanvasInteraction}
                  onPointerMove={(e) => {
                    if (e.buttons === 1) handleSpinCanvasInteraction(e);
                  }}
                  onPointerUp={handleSpinPointerUp}
                  className="bg-transparent cursor-crosshair rounded-full shadow-inner mb-4 touch-none"
                />
                <div className="text-[10px] text-neutral-400 font-mono text-center">
                  Spin (X: {spinOffset.x.toFixed(2)}, Y: {spinOffset.y.toFixed(2)})
                </div>
              </div>
            </div>
          )}

          {winner && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col justify-center items-center z-[999999] p-6 text-center animate-fade-in">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-2xl font-black text-amber-400 uppercase tracking-widest mb-2">{winner} Wins!</h2>
              <button
                onClick={initBalls}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer mt-4"
              >
                Play Again 🔄
              </button>
            </div>
          )}

          <div className="w-full max-w-[420px] flex justify-between items-center bg-[#0b1329]/90 border border-slate-800/80 p-2 px-3 rounded-2xl shadow-2xl relative shrink-0 my-1">
            <div className="relative">
              {currentTurn === "player1" && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-cyan-500 text-black font-black text-[8px] uppercase px-2.5 py-0.5 rounded-full tracking-widest shadow-lg animate-bounce z-10">
                  TURN
                </div>
              )}
              <div className={`flex flex-col items-start min-w-[70px] px-2 py-1 rounded-xl transition-all duration-300 ${currentTurn === "player1" ? "border-2 border-cyan-400/90 bg-cyan-950/40 shadow-[0_0_12px_rgba(34,211,238,0.3)] animate-pulse" : "bg-black/30 opacity-70"}`}>
                <span className={`text-[9px] font-black ${currentTurn === "player1" ? "text-cyan-400" : "text-slate-400"} tracking-wider uppercase`}>P1</span>
                <span className="text-[10px] font-black text-amber-400 uppercase truncate max-w-[70px]">{playerGroups.player1}</span>
              </div>
            </div>

            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md transition-colors ${
              timeLeft <= 5 ? "bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse" : "bg-[#18181b] border-white/10 text-[#CCFF00]"
            }`}>
              <span className="material-symbols-outlined text-[10px]">timer</span>
              <span className="font-mono font-black text-[10px]">{timeLeft}s</span>
            </div>

            <div className="flex items-center gap-1 bg-[#030712] px-2.5 py-1 rounded-full border border-slate-800">
              <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase">TARGET</span>
              {currentActiveGroup === "Open" || isCurrentGroupCleared ? (
                <PoolBallBadge num={8} size={16} />
              ) : currentActiveGroup === "Solids" ? (
                <PoolBallBadge num={1} size={16} />
              ) : (
                <PoolBallBadge num={9} size={16} />
              )}
            </div>

            <div className="relative">
              {currentTurn === "player2" && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-rose-500 text-white font-black text-[8px] uppercase px-2.5 py-0.5 rounded-full tracking-widest shadow-lg animate-bounce z-10">
                  TURN
                </div>
              )}
              <div className={`flex flex-col items-end min-w-[70px] px-2 py-1 rounded-xl transition-all duration-300 ${currentTurn === "player2" ? "border-2 border-rose-500/90 bg-rose-950/40 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse" : "bg-black/30 opacity-70"}`}>
                <span className={`text-[9px] font-black ${currentTurn === "player2" ? "text-rose-400" : "text-slate-400"} tracking-wider uppercase`}>{playMode === "bot" ? "BOT" : "P2"}</span>
                <span className="text-[10px] font-black text-amber-400 uppercase truncate max-w-[70px]">{playerGroups.player2}</span>
              </div>
            </div>

            <div className="relative">
              <button
                onClick={() => { soundEngine.playSFX("click"); setShowEmojiMenu(!showEmojiMenu); }}
                className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-sm active:scale-90 touch-manipulation ml-0.5"
              >
                <span className="material-symbols-outlined text-xs">add_reaction</span>
              </button>
              
              {showEmojiMenu && (
                <div className="absolute top-9 right-0 bg-[#18181b] border border-white/10 p-2 rounded-2xl shadow-xl flex gap-1 z-50">
                  {EMOJIS.map(em => (
                    <button
                      key={em}
                      onClick={() => sendEmoji(em)}
                      className="text-lg hover:scale-125 transition-transform p-1 touch-manipulation"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleExitToHome}
              className="bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-black px-2.5 py-1.5 rounded-full uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-md ml-0.5 touch-manipulation"
            >
              EXIT
            </button>
          </div>

          <div className="w-full max-w-[420px] flex justify-center items-center flex-1 my-0.5 relative min-h-0">
            <div className="flex flex-col items-center justify-between bg-[#091024]/80 py-3 px-1 rounded-2xl h-[55%] w-[40px] shadow-xl relative mr-1.5 self-center shrink-0">
              <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase mb-1">PULL</span>
              <div className="w-1.5 h-[80%] bg-slate-900 rounded-full relative flex items-center justify-center cursor-ns-resize">
                <div
                  onPointerDown={handlePowerPointerDown}
                  onPointerMove={handlePowerPointerMove}
                  onPointerUp={handlePowerPointerUp}
                  onPointerCancel={handlePowerPointerUp}
                  className="w-5 h-5 bg-amber-500 hover:bg-amber-400 rounded-full absolute shadow-lg border-2 border-amber-300 cursor-ns-resize transition-transform active:scale-110"
                  style={{ top: `${uiPower}%`, touchAction: "none" }}
                />
              </div>
            </div>

            <div className="relative flex-1 flex flex-col justify-center items-center h-full max-h-[580px]">
              <canvas
                ref={canvasRef}
                width={TABLE_WIDTH}
                height={TABLE_HEIGHT}
                onPointerDown={handleCanvasInteraction}
                onPointerMove={handleCanvasInteraction}
                className="w-full h-full max-h-[580px] rounded-2xl shadow-2xl bg-[#030712] object-contain cursor-crosshair touch-none"
              />

              {isBallInHand && showConfirmBtn && (
                <button
                  onClick={() => {
                    setIsBallInHand(false);
                    setShowConfirmBtn(false);
                  }}
                  className="absolute top-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase px-4 py-1.5 rounded-full shadow-2xl active:scale-95 transition-all cursor-pointer animate-bounce z-20"
                >
                  CONFIRM POSITION
                </button>
              )}
            </div>

            <div className="flex flex-col items-center justify-between bg-[#091024]/80 py-3 px-1 rounded-2xl h-[55%] w-[40px] shadow-xl relative ml-1.5 self-center shrink-0">
              <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase mb-1">TUNE</span>
              <div
                onPointerDown={handleWheelPointerDown}
                onPointerMove={handleWheelPointerMove}
                onPointerUp={handleWheelPointerUp}
                onPointerCancel={handleWheelPointerUp}
                className={`w-5 h-[65%] bg-slate-900 rounded-lg border border-slate-800 relative overflow-hidden cursor-ns-resize shadow-inner transition-opacity ${
                  isMoving || isBallInHand ? "opacity-40" : "opacity-100"
                }`}
              >
                <div
                  className="absolute inset-0 w-full h-[200%]"
                  style={{
                    background: "repeating-linear-gradient(to bottom, #1e293b, #1e293b 3px, #0f172a 3px, #0f172a 7px)",
                    transform: `translateY(${wheelPos % 7}px)`,
                  }}
                />
              </div>

              <button
                onClick={() => setShowSpinModal(true)}
                className="w-6 h-6 rounded-full bg-white border-2 border-sky-400 flex items-center justify-center shadow-lg active:scale-95 transition-all cursor-pointer"
                title="Set Spin"
              >
                <div className="w-2 h-2 rounded-full bg-red-600" />
              </button>
            </div>
          </div>

          <div className="w-full max-w-[420px] flex justify-end items-center mt-0.5 shrink-0 px-1">
            <button
              onClick={initBalls}
              className="bg-[#1e293b] hover:bg-slate-700 text-slate-200 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-lg touch-manipulation"
            >
              RESET MATCH
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
