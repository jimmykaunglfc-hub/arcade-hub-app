"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";
import { RealtimeChannel } from "@supabase/supabase-js";
import { soundEngine } from "../../lib/soundManager";
import { storeManager } from "../../lib/storeManager";
import { getRandomBotOpponent } from "../../lib/botUtils";

const BALL_TYPES = {
  Red: { points: 1, color: "#ff2a2a", spec: "#ffe4e4" },
  Yellow: { points: 2, color: "#eab308", spec: "#fef08a" },
  Green: { points: 3, color: "#10b981", spec: "#a7f3d0" },
  Brown: { points: 4, color: "#5c2e0b", spec: "#c68a4c" },
  Blue: { points: 5, color: "#06b6d4", spec: "#a5f3fc" },
  Pink: { points: 6, color: "#ec4899", spec: "#fbcfe8" },
  Black: { points: 7, color: "#1f2937", spec: "#9ca3af" },
};

const COLOR_SEQUENCE = ["Yellow", "Green", "Brown", "Blue", "Pink", "Black"];
const EMOJIS = ["👍", "😂", "🔥", "😡", "😭", "🤯"];

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinX?: number;
  spinY?: number;
  type: string;
  isCue?: boolean;
  scale?: number;
  isPotted?: boolean;
}

interface SnookerGameProps {
  onClose?: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; isBot: boolean } | null;
}

export default function SnookerGame({ onClose, preloadedMatchId, opponent }: SnookerGameProps) {
  // 🛍️ STORE COSMETICS ENGINE SYNC
  const equippedTheme = storeManager.getEquippedCosmetic("snooker");
  const isCyberTable = equippedTheme === "cyber_snooker_table" || true;

  // 1. Detect bot mode synchronously
  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  // 2. Play Mode Initialization
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online" | "bot" | "searching" | "confirmed">(
    isBotMode ? "bot" : preloadedMatchId ? "join" : "menu"
  );

  const [localOpponent, setLocalOpponent] = useState<any>(opponent || null);
  const [matchId, setMatchId] = useState<string>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : "")
  );

  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "foul" | "info" | "success" } | null>(null);

  // 🌐 MULTIPLAYER NETWORK STATES
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<1 | 2>(1);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // 🎮 GAME STATES
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [scores, setScores] = useState({ player1: 0, player2: 0 });
  const [currentTurn, setCurrentTurn] = useState<"player1" | "player2">("player1");
  const [nextRequiredBall, setNextRequiredBall] = useState<string>("Red");
  const [targetedColor, setTargetedColor] = useState<string>("Red");

  const [gamePhase, setGamePhase] = useState<"REDS" | "LAST_RED_COLOR" | "COLORS_SEQUENCE">("REDS");
  const [colorSeqIndex, setColorSeqIndex] = useState<number>(0);

  const [isMoving, setIsMoving] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const [isBallInHand, setIsBallInHand] = useState(true);
  const [aimAngle, setAimAngle] = useState(-Math.PI / 2);
  const [uiPower, setUiPower] = useState(0);

  const [containerScale, setContainerScale] = useState({ width: 360, height: 720 });

  // Spin States
  const [spinOffset, setSpinOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showSpinModal, setShowSpinModal] = useState(false);
  const spinCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [wheelPos, setWheelPos] = useState(0);
  const wheelDragStartY = useRef<number | null>(null);

  const isDraggingPower = useRef(false);
  const powerDragStartY = useRef<number | null>(null);
  const initialUiPower = useRef<number>(0);

  const ballsRef = useRef<Ball[]>([]);
  const turnTrackingRef = useRef({ redsPotted: 0, colorsPotted: [] as string[], firstHitBallType: "" });
  const wasMovingRef = useRef(false);
  const didIShootRef = useRef(false);

  // 🤩 Live Emojis
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; role: number }[]>([]);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  const tableWidth = 360;
  const tableHeight = 720;
  const ballRadius = 9;

  const baulkLineY = 550;
  const dZoneRadius = 55;

  const pockets = [
    { x: 20, y: 20 },
    { x: tableWidth - 20, y: 20 },
    { x: 15, y: tableHeight / 2 },
    { x: tableWidth - 15, y: tableHeight / 2 },
    { x: 20, y: tableHeight - 20 },
    { x: tableWidth - 20, y: tableHeight - 20 },
  ];

  const confettiPieces = useMemo(() => {
    const colors = ["#f59e0b", "#10b981", "#4f46e5", "#ec4899", "#3b82f6"];
    return Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      duration: `${1.8 + Math.random() * 2}s`,
      delay: `${Math.random() * 1}s`,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 🤝 SAFE RULE PARSER & BOT HANDLER
  useEffect(() => {
    if (isBotMode && localOpponent?.name) {
      setToast({ msg: `Playing against ${localOpponent.name}`, type: "success" });
    }
  }, [isBotMode, localOpponent]);

  // 📡 STABILIZED MULTIPLAYER REAL-TIME SYNC HUB
  const shouldConnect = matchId && myUserId && playMode !== "menu" && playMode !== "local" && playMode !== "bot" && playMode !== "searching" && playMode !== "confirmed";

  useEffect(() => {
    if (!shouldConnect) return;

    const channel = supabase.channel(`snooker_${matchId}`, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: myUserId },
      },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const connectedPlayers = Object.keys(state).length;

        if (connectedPlayers === 2 && playMode === "host") {
          setPlayMode("online");
          setToast({ msg: "Opponent joined the Arena!", type: "success" });
        } else if (connectedPlayers === 2 && playMode === "join") {
          setPlayMode("online");
          setToast({ msg: "Connected to Host Matrix!", type: "success" });
        } else if (connectedPlayers < 2 && playMode === "online") {
          setToast({ msg: "Opponent Disconnected! You Win.", type: "success" });
          setWinner(myPlayerRole === 1 ? "Player 1" : "Player 2");
          soundEngine.playSFX("victory");
        }
      })
      .on("broadcast", { event: "shot_fired" }, (payload) => {
        const { vx, vy, spinX, spinY, cueX, cueY } = payload.payload;
        const cueBall = ballsRef.current.find((b) => b.isCue);
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
        const { balls, nextTurn, newScores, phase, nextReq, win } = payload.payload;
        ballsRef.current = balls;
        setCurrentTurn(nextTurn);
        setScores(newScores);
        setGamePhase(phase);
        setNextRequiredBall(nextReq);
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
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString(), role: myPlayerRole });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [shouldConnect, matchId, myUserId, playMode, myPlayerRole]);

  // 🤖 LOCAL BOT ENGINE
  useEffect(() => {
    if (playMode === "bot" && currentTurn === "player2" && !winner && !isMoving) {
      const thinkingDelay = Math.floor(Math.random() * 2000) + 1500;

      const botTimer = setTimeout(() => {
        const cueBall = ballsRef.current.find((b) => b.isCue);
        if (!cueBall) return;

        let activeTargets = ballsRef.current.filter((b) => !b.isCue && !b.isPotted);
        if (nextRequiredBall === "Red") {
          activeTargets = activeTargets.filter((b) => b.type === "Red");
        } else if (nextRequiredBall === "Color") {
          activeTargets = activeTargets.filter((b) => b.type !== "Red");
        } else {
          activeTargets = activeTargets.filter((b) => b.type === nextRequiredBall);
        }

        if (activeTargets.length === 0) return;

        const target = activeTargets[Math.floor(Math.random() * activeTargets.length)];
        const dx = target.x - cueBall.x;
        const dy = target.y - cueBall.y;
        const shotAngle = Math.atan2(dy, dx) + (Math.random() * 0.1 - 0.05);

        const power = 10 + Math.random() * 8;
        cueBall.vx = Math.cos(shotAngle) * power;
        cueBall.vy = Math.sin(shotAngle) * power;

        setIsBallInHand(false);
        setIsMoving(true);
        didIShootRef.current = true;
        soundEngine.playSFX("strike");

        if (Math.random() <= 0.25) {
          const reactionDelay = Math.floor(Math.random() * 1000) + 800;
          setTimeout(() => {
            const randomEmote = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            const newEmoji = { id: Date.now() + Math.random(), emoji: randomEmote, role: 2 };
            setFloatingEmojis((prev) => [...prev, newEmoji]);
            setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
          }, reactionDelay);
        }
      }, thinkingDelay);

      return () => clearTimeout(botTimer);
    }
  }, [currentTurn, playMode, winner, isMoving, nextRequiredBall]);

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      const reservedSideWidth = 90;
      const availW = Math.max(160, rect.width - reservedSideWidth);
      const availH = Math.max(300, rect.height);

      let targetH = availH;
      let targetW = availH / 2;

      if (targetW > availW) {
        targetW = availW;
        targetH = availW * 2;
      }

      setContainerScale({ width: targetW, height: targetH });
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const respotColorBall = useCallback((colorName: string) => {
    const spots: Record<string, { x: number; y: number }> = {
      Yellow: { x: tableWidth / 2 - 55, y: baulkLineY },
      Green: { x: tableWidth / 2 + 55, y: baulkLineY },
      Brown: { x: tableWidth / 2, y: baulkLineY },
      Blue: { x: tableWidth / 2, y: tableHeight / 2 },
      Pink: { x: tableWidth / 2, y: 270 },
      Black: { x: tableWidth / 2, y: 50 },
    };
    const spot = spots[colorName];
    if (spot) {
      setTimeout(() => {
        ballsRef.current.push({
          id: Date.now() + Math.random(),
          x: spot.x,
          y: spot.y,
          vx: 0,
          vy: 0,
          type: colorName,
          scale: 1,
          isPotted: false,
        });
      }, 300);
    }
  }, [baulkLineY, tableHeight, tableWidth]);

  const evaluateTurnEnd = useCallback(() => {
    const tracking = turnTrackingRef.current;
    const opponent = currentTurn === "player1" ? "player2" : "player1";
    let turnSwitched = false;
    let penalty = 0;

    const redsLeft = ballsRef.current.filter((b) => b.type === "Red" && !b.isPotted).length;
    const activeBalls = ballsRef.current.filter((b) => !b.isPotted);

    if (activeBalls.length === 1 && activeBalls[0].isCue) {
      const winState = scores.player1 > scores.player2 ? "Player 1" : scores.player2 > scores.player1 ? "Player 2" : "Draw Match";
      setWinner(winState);
      soundEngine.playSFX("victory");
      return;
    }

    const isCuePotted = tracking.firstHitBallType === "FOUL_SCRATCH";
    const isFoul = isCuePotted || tracking.firstHitBallType === "";

    let newScores = { ...scores };
    let newPhase = gamePhase;
    let newNextReq = nextRequiredBall;
    let nextTurn = currentTurn;

    if (gamePhase === "REDS") {
      if (isFoul) {
        if (tracking.colorsPotted.length > 0) tracking.colorsPotted.forEach((c) => respotColorBall(c));
        penalty = 4; turnSwitched = true; newNextReq = "Red";
        soundEngine.playSFX("defeat");
      } else if (nextRequiredBall === "Red") {
        if (tracking.firstHitBallType !== "Red") {
          if (tracking.colorsPotted.length > 0) tracking.colorsPotted.forEach((c) => respotColorBall(c));
          penalty = 4; turnSwitched = true; newNextReq = "Red";
          soundEngine.playSFX("defeat");
        } else if (tracking.colorsPotted.length > 0) {
          tracking.colorsPotted.forEach((c) => respotColorBall(c));
          penalty = 4; turnSwitched = true; newNextReq = "Red";
          soundEngine.playSFX("defeat");
        } else if (tracking.redsPotted > 0) {
          newScores[currentTurn] += tracking.redsPotted;
          soundEngine.playSFX("capture");
          if (redsLeft === 0) {
            newPhase = "LAST_RED_COLOR";
            newNextReq = "Color";
          } else {
            newNextReq = "Color";
          }
        } else {
          turnSwitched = true; newNextReq = "Red";
        }
      } else {
        if (tracking.firstHitBallType === "Red" || tracking.redsPotted > 0 || tracking.colorsPotted.length !== 1) {
          if (tracking.colorsPotted.length > 0) tracking.colorsPotted.forEach((c) => respotColorBall(c));
          penalty = 4; turnSwitched = true; newNextReq = "Red";
          soundEngine.playSFX("defeat");
        } else {
          const colorName = tracking.colorsPotted[0];
          const pts = BALL_TYPES[colorName as keyof typeof BALL_TYPES]?.points || 2;
          newScores[currentTurn] += pts;
          soundEngine.playSFX("capture");
          respotColorBall(colorName);
          newNextReq = "Red";
        }
      }
    } else if (gamePhase === "LAST_RED_COLOR") {
      if (isFoul || tracking.colorsPotted.length !== 1) {
        if (tracking.colorsPotted.length > 0) tracking.colorsPotted.forEach((c) => respotColorBall(c));
        penalty = 4; turnSwitched = true;
        newPhase = "COLORS_SEQUENCE";
        setColorSeqIndex(0);
        newNextReq = "Yellow";
        soundEngine.playSFX("defeat");
      } else {
        const colorName = tracking.colorsPotted[0];
        const pts = BALL_TYPES[colorName as keyof typeof BALL_TYPES]?.points || 2;
        newScores[currentTurn] += pts;
        soundEngine.playSFX("capture");
        respotColorBall(colorName);
        newPhase = "COLORS_SEQUENCE";
        setColorSeqIndex(0);
        newNextReq = "Yellow";
      }
    } else if (gamePhase === "COLORS_SEQUENCE") {
      const targetColor = COLOR_SEQUENCE[colorSeqIndex];
      if (isFoul || tracking.firstHitBallType !== targetColor || tracking.colorsPotted.length > 1) {
        if (tracking.colorsPotted.length > 0) tracking.colorsPotted.forEach((c) => respotColorBall(c));
        penalty = 4; turnSwitched = true;
        soundEngine.playSFX("defeat");
      } else if (tracking.colorsPotted.length === 1 && tracking.colorsPotted[0] === targetColor) {
        const pts = BALL_TYPES[targetColor as keyof typeof BALL_TYPES]?.points || 2;
        newScores[currentTurn] += pts;
        soundEngine.playSFX("capture");
        const nextIdx = colorSeqIndex + 1;
        setColorSeqIndex(nextIdx);
        if (nextIdx < COLOR_SEQUENCE.length) {
          newNextReq = COLOR_SEQUENCE[nextIdx];
        }
      } else {
        if (tracking.colorsPotted.length > 0) tracking.colorsPotted.forEach((c) => respotColorBall(c));
        turnSwitched = true;
      }
    }

    if (turnSwitched) {
      newScores[opponent] += penalty;
      nextTurn = opponent;
    }

    setScores(newScores);
    setCurrentTurn(nextTurn);
    setGamePhase(newPhase);
    setNextRequiredBall(newNextReq);

    setUiPower(0);
    isDraggingPower.current = false;
    turnTrackingRef.current = { redsPotted: 0, colorsPotted: [], firstHitBallType: "" };

    if (playMode === "online" && channelRef.current && didIShootRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "turn_sync",
        payload: {
          balls: ballsRef.current,
          nextTurn,
          newScores,
          phase: newPhase,
          nextReq: newNextReq,
          win: winner,
        },
      });
    }
  }, [currentTurn, nextRequiredBall, gamePhase, colorSeqIndex, scores, respotColorBall, playMode, winner]);

  const initBalls = useCallback(() => {
    soundEngine.playSFX("click");
    const balls: Ball[] = [];
    let idCounter = 1;

    balls.push({ id: idCounter++, x: tableWidth / 2, y: baulkLineY + 20, vx: 0, vy: 0, type: "White", isCue: true, scale: 1, isPotted: false });

    const startX = tableWidth / 2;
    const startY = 240;
    let redCount = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j <= i; j++) {
        if (redCount < 15) {
          balls.push({
            id: idCounter++,
            x: startX - i * ballRadius + j * ballRadius * 2,
            y: startY - i * (ballRadius * 1.75),
            vx: 0,
            vy: 0,
            type: "Red",
            scale: 1,
            isPotted: false,
          });
          redCount++;
        }
      }
    }

    balls.push({ id: idCounter++, x: tableWidth / 2 - 55, y: baulkLineY, vx: 0, vy: 0, type: "Yellow", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: tableWidth / 2 + 55, y: baulkLineY, vx: 0, vy: 0, type: "Green", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: tableWidth / 2, y: baulkLineY, vx: 0, vy: 0, type: "Brown", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: tableWidth / 2, y: tableHeight / 2, vx: 0, vy: 0, type: "Blue", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: tableWidth / 2, y: 270, vx: 0, vy: 0, type: "Pink", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: tableWidth / 2, y: 50, vx: 0, vy: 0, type: "Black", scale: 1, isPotted: false });

    ballsRef.current = balls;
    setScores({ player1: 0, player2: 0 });
    setCurrentTurn("player1");
    setGamePhase("REDS");
    setNextRequiredBall("Red");
    setTargetedColor("Red");
    setColorSeqIndex(0);
    setWinner(null);
    setIsBallInHand(true);
    setUiPower(0);
    setAimAngle(-Math.PI / 2);
    setSpinOffset({ x: 0, y: 0 });
    turnTrackingRef.current = { redsPotted: 0, colorsPotted: [], firstHitBallType: "" };
  }, [baulkLineY, tableHeight, tableWidth]);

  useEffect(() => {
    const timer = setTimeout(() => {
      initBalls();
    }, 0);
    return () => clearTimeout(timer);
  }, [initBalls]);

  // Spin Canvas Modal Interaction
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
    grad.addColorStop(0.7, "#e2e8f0");
    grad.addColorStop(1, "#94a3b8");
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const engineLoop = () => {
      const balls = ballsRef.current;
      let dynamicMotion = false;

      const SUB_STEPS = 4;
      const frictionFactor = Math.pow(0.984, 1 / SUB_STEPS);

      for (let step = 0; step < SUB_STEPS; step++) {
        balls.forEach((ball) => {
          if (ball.isPotted) return;
          pockets.forEach((p) => {
            if (Math.hypot(ball.x - p.x, ball.y - p.y) < ballRadius * 3.2) {
              ball.isPotted = true;
              ball.vx = 0;
              ball.vy = 0;
              ball.x = p.x;
              ball.y = p.y;

              soundEngine.playSFX(ball.isCue ? "defeat" : "capture");

              if (ball.isCue) {
                turnTrackingRef.current.firstHitBallType = "FOUL_SCRATCH";
                setTimeout(() => {
                  ball.isPotted = false;
                  ball.scale = 1;
                  ball.x = tableWidth / 2;
                  ball.y = baulkLineY + 20;
                  setIsBallInHand(true);
                }, 800);
              } else {
                if (ball.type === "Red") turnTrackingRef.current.redsPotted += 1;
                else turnTrackingRef.current.colorsPotted.push(ball.type);
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

          if (isBallInHand && !ball.isCue) {
            ball.vx = 0;
            ball.vy = 0;
            return;
          }

          ball.x += ball.vx / SUB_STEPS;
          ball.y += ball.vy / SUB_STEPS;

          if (ball.isCue && (ball.spinY || ball.spinX)) {
            const currentSpeed = Math.hypot(ball.vx, ball.vy);
            if (currentSpeed > 0.1) {
              const spinYEffect = (ball.spinY || 0) * 0.003;
              const speedRatio = 1 + spinYEffect;
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

          if (Math.hypot(ball.vx, ball.vy) < 0.05) {
            ball.vx = 0;
            ball.vy = 0;
          } else {
            dynamicMotion = true;
          }

          const boundX = 25 + ballRadius;
          const boundY = 25 + ballRadius;
          let hitWall = false;
          if (ball.x < boundX || ball.x > tableWidth - boundX) {
            ball.vx *= -1;
            if (ball.isCue && ball.spinX) ball.vy += ball.spinX * 0.8;
            ball.x = ball.x < boundX ? boundX : tableWidth - boundX;
            hitWall = true;
          }
          if (ball.y < boundY || ball.y > tableHeight - boundY) {
            ball.vy *= -1;
            if (ball.isCue && ball.spinX) ball.vx += ball.spinX * 0.8;
            ball.y = ball.y < boundY ? boundY : tableHeight - boundY;
            hitWall = true;
          }
          if (hitWall && Math.hypot(ball.vx, ball.vy) > 2) {
            soundEngine.playSFX("move");
          }
        });

        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i];
            const b2 = balls[j];
            if (isBallInHand || b1.isPotted || b2.isPotted) continue;

            const dist = Math.hypot(b2.x - b1.x, b2.y - b1.y);
            if (dist < ballRadius * 2) {
              const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
              const overlap = ballRadius * 2 - dist;
              b1.x -= Math.cos(angle) * overlap * 0.5;
              b1.y -= Math.sin(angle) * overlap * 0.5;
              b2.x += Math.cos(angle) * overlap * 0.5;
              b2.y += Math.sin(angle) * overlap * 0.5;

              if (b1.isCue && turnTrackingRef.current.firstHitBallType === "") {
                turnTrackingRef.current.firstHitBallType = b2.type;
              }

              const kx = b1.vx - b2.vx;
              const ky = b1.vy - b2.vy;
              const impulse = (2 * (Math.cos(angle) * kx + Math.sin(angle) * ky)) / 2;

              b1.vx -= impulse * Math.cos(angle);
              b1.vy -= impulse * Math.sin(angle);

              if (b1.isCue && b1.spinY && b1.spinY < -0.2) {
                const backPower = Math.abs(b1.spinY) * 0.65;
                b1.vx -= Math.cos(angle) * impulse * backPower;
                b1.vy -= Math.sin(angle) * impulse * backPower;
              }

              b2.vx += impulse * Math.cos(angle);
              b2.vy += impulse * Math.sin(angle);

              if (Math.abs(impulse) > 1) soundEngine.playSFX("move");
            }
          }
        }
      }

      ballsRef.current = balls.filter((b) => b.isCue || !b.isPotted || (b.scale && b.scale > 0.1));

      setIsMoving(dynamicMotion);

      if (wasMovingRef.current && !dynamicMotion) {
        evaluateTurnEnd();
      }
      wasMovingRef.current = dynamicMotion;

      ctx.fillStyle = "#2b1408";
      ctx.fillRect(0, 0, tableWidth, tableHeight);

      ctx.strokeStyle = "#4a2410";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, tableWidth - 4, tableHeight - 4);

      ctx.fillStyle = isCyberTable ? "#09090b" : "#084420";
      ctx.fillRect(18, 18, tableWidth - 36, tableHeight - 36);

      ctx.fillStyle = isCyberTable ? "#18181b" : "#0c5827";
      ctx.fillRect(25, 25, tableWidth - 50, tableHeight - 50);
      ctx.strokeStyle = isCyberTable ? "rgba(204,255,0,0.3)" : "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(25, 25, tableWidth - 50, tableHeight - 50);

      pockets.forEach((p) => {
        const pocketRadius = ballRadius * 2.5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, pocketRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#030507";
        ctx.fill();
        ctx.restore();
      });

      ctx.strokeStyle = isCyberTable ? "rgba(204,255,0,0.25)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(25, baulkLineY); ctx.lineTo(tableWidth - 25, baulkLineY); ctx.stroke();
      ctx.beginPath(); ctx.arc(tableWidth / 2, baulkLineY, dZoneRadius, 0, Math.PI, false); ctx.stroke();

      ballsRef.current.forEach((ball) => {
        const currentRadius = ballRadius * (ball.scale ?? 1);
        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.x + 2, ball.y + 3, currentRadius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fill();
        ctx.restore();
      });

      const now = Date.now();
      const pulseScale = 1 + Math.sin(now * 0.008) * 0.25;

      ballsRef.current.forEach((ball) => {
        if (ball.isCue || ball.isPotted) return;

        let isTarget = false;
        if (nextRequiredBall === "Red") {
          isTarget = ball.type === "Red";
        } else if (nextRequiredBall === "Color") {
          isTarget = ball.type !== "Red";
        } else {
          isTarget = ball.type === nextRequiredBall;
        }

        if (isTarget && !dynamicMotion) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, (ballRadius + 4) * pulseScale, 0, Math.PI * 2);
          ctx.strokeStyle = "#CCFF00";
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.restore();
        }
      });

      ballsRef.current.forEach((ball) => {
        const currentRadius = ballRadius * (ball.scale ?? 1);
        if (currentRadius <= 0.5) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, currentRadius, 0, Math.PI * 2);
        const baseColor = ball.isCue ? "#ffffff" : BALL_TYPES[ball.type as keyof typeof BALL_TYPES]?.color || "#fff";
        const specColor = ball.isCue ? "#ffffff" : BALL_TYPES[ball.type as keyof typeof BALL_TYPES]?.spec || "#fff";
        const sphereGrad = ctx.createRadialGradient(
          ball.x - currentRadius * 0.3,
          ball.y - currentRadius * 0.3,
          currentRadius * 0.05,
          ball.x,
          ball.y,
          currentRadius
        );
        sphereGrad.addColorStop(0, specColor);
        sphereGrad.addColorStop(0.2, baseColor);
        sphereGrad.addColorStop(1, "#000");
        ctx.fillStyle = sphereGrad;
        ctx.fill();
        ctx.restore();
      });

      const cueBall = balls.find((b) => b.isCue);
      if (!cueBall) {
        animId = requestAnimationFrame(engineLoop);
        return;
      }

      if (!dynamicMotion && !isBallInHand) {
        let closestDist = 999999;
        let hitBall: Ball | null = null;
        const cos = Math.cos(aimAngle);
        const sin = Math.sin(aimAngle);

        balls.forEach((b) => {
          if (b.isCue || b.isPotted) return;
          const toX = b.x - cueBall.x;
          const toY = b.y - cueBall.y;
          const projection = toX * cos + toY * sin;

          if (projection > 0) {
            const perpDist = Math.abs(-sin * toX + cos * toY);
            if (perpDist < ballRadius * 2) {
              const hitDist = projection - Math.sqrt(Math.pow(ballRadius * 2, 2) - Math.pow(perpDist, 2));
              if (hitDist > 0 && hitDist < closestDist) {
                closestDist = hitDist;
                hitBall = b;
              }
            }
          }
        });

        if (hitBall) {
          setTargetedColor((hitBall as Ball).type);
        } else {
          setTargetedColor(nextRequiredBall === "Color" ? "Yellow" : nextRequiredBall);
        }

        ctx.save();
        ctx.lineWidth = 1.2;
        if (hitBall) {
          const ghostX = cueBall.x + cos * closestDist;
          const ghostY = cueBall.y + sin * closestDist;

          ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(ghostX, ghostY); ctx.stroke();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(ghostX, ghostY, ballRadius, 0, Math.PI * 2); ctx.stroke();

          const targetAngle = Math.atan2((hitBall as Ball).y - ghostY, (hitBall as Ball).x - ghostX);
          ctx.strokeStyle = "#CCFF00";
          ctx.beginPath();
          ctx.moveTo((hitBall as Ball).x, (hitBall as Ball).y);
          ctx.lineTo((hitBall as Ball).x + Math.cos(targetAngle) * 90, (hitBall as Ball).y + Math.sin(targetAngle) * 90);
          ctx.stroke();

          const isRightSide = -sin * ((hitBall as Ball).y - cueBall.y) - cos * ((hitBall as Ball).x - cueBall.x) > 0;
          const cueAngle = targetAngle + (isRightSide ? Math.PI / 2 : -Math.PI / 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.moveTo(ghostX, ghostY);
          ctx.lineTo(ghostX + Math.cos(cueAngle) * 45, ghostY + Math.sin(cueAngle) * 45);
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
          ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(cueBall.x + cos * 240, cueBall.y + sin * 240); ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        const stickDist = 18 + uiPower * 0.4;
        const stickLen = 160;

        const startX = cueBall.x - cos * stickDist;
        const startY = cueBall.y - sin * stickDist;
        const endX = cueBall.x - cos * (stickDist + stickLen);
        const endY = cueBall.y - sin * (stickDist + stickLen);

        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX - cos * 5, startY - sin * 5); ctx.stroke();

        ctx.strokeStyle = isCyberTable ? "#CCFF00" : "#d97706"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(startX - cos * 5, startY - sin * 5); ctx.lineTo(startX - cos * 100, startY - sin * 100); ctx.stroke();

        ctx.strokeStyle = "#111827"; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(startX - cos * 100, startY - sin * 100); ctx.lineTo(endX, endY); ctx.stroke();

        ctx.restore();
      }

      animId = requestAnimationFrame(engineLoop);
    };

    engineLoop();
    return () => cancelAnimationFrame(animId);
  }, [aimAngle, uiPower, nextRequiredBall, isBallInHand, isMoving, evaluateTurnEnd, baulkLineY, isCyberTable]);

  const handleCanvasInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMoving) return;
    if (playMode === "online" && ((currentTurn === "player1" && myPlayerRole !== 1) || (currentTurn === "player2" && myPlayerRole !== 2))) return;
    if (playMode === "bot" && currentTurn === "player2") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const clickX = ((e.clientX - rect.left) / rect.width) * tableWidth;
    const clickY = ((e.clientY - rect.top) / rect.height) * tableHeight;

    const cueBall = ballsRef.current.find((b) => b.isCue);
    if (!cueBall || cueBall.isPotted) return;

    if (isBallInHand) {
      const distToDCenter = Math.hypot(clickX - tableWidth / 2, clickY - baulkLineY);
      if (clickY >= baulkLineY && distToDCenter <= dZoneRadius - ballRadius) {
        let isOverlapping = false;
        let overlapBall: Ball | null = null;

        ballsRef.current.forEach((b) => {
          if (b.isCue || b.isPotted) return;
          const currentDistance = Math.hypot(clickX - b.x, clickY - b.y);
          if (currentDistance < ballRadius * 2) {
            isOverlapping = true;
            overlapBall = b;
          }
        });

        if (!isOverlapping) {
          cueBall.x = clickX;
          cueBall.y = clickY;
        } else if (overlapBall) {
          const angle = Math.atan2(clickY - (overlapBall as Ball).y, clickX - (overlapBall as Ball).x);
          cueBall.x = (overlapBall as Ball).x + Math.cos(angle) * (ballRadius * 2);
          cueBall.y = (overlapBall as Ball).y + Math.sin(angle) * (ballRadius * 2);
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
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wheelDragStartY.current === null) return;
    const deltaY = e.clientY - wheelDragStartY.current;
    wheelDragStartY.current = e.clientY;
    setAimAngle((prev) => prev + deltaY * 0.0012);
    setWheelPos((prev) => prev + deltaY);
  };

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    wheelDragStartY.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePowerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMoving || isBallInHand) return;
    if (playMode === "online" && ((currentTurn === "player1" && myPlayerRole !== 1) || (currentTurn === "player2" && myPlayerRole !== 2))) return;
    if (playMode === "bot" && currentTurn === "player2") return;

    isDraggingPower.current = true;
    powerDragStartY.current = e.clientY;
    initialUiPower.current = uiPower;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePowerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPower.current || powerDragStartY.current === null) return;
    const currentY = e.clientY;
    const deltaY = currentY - powerDragStartY.current;
    const calculatedChange = (deltaY / 140) * 100;
    let newPower = initialUiPower.current + calculatedChange;

    if (newPower < 0) newPower = 0;
    if (newPower > 100) newPower = 100;

    setUiPower(newPower);
  };

  const handlePowerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPower.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);

    const finalPower = uiPower;
    isDraggingPower.current = false;
    powerDragStartY.current = null;

    if (isMoving || finalPower < 10) {
      setUiPower(0);
      return;
    }

    if (isBallInHand) setIsBallInHand(false);
    const cueBall = ballsRef.current.find((b) => b.isCue);
    if (!cueBall) return;

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

  const startOnlineMatchmaking = () => {
    soundEngine.playSFX("click");
    setPlayMode("searching");
    setTimeout(() => {
      setPlayMode((prev) => {
        if (prev === "searching") {
          setLocalOpponent(getRandomBotOpponent());
          return "confirmed";
        }
        return prev;
      });
    }, 2800);
  };

  const hostMatch = () => {
    soundEngine.playSFX("click");
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMatchId(code);
    setRoomCode(code);
    setMyPlayerRole(1);
    setPlayMode("host");
  };

  const joinMatch = () => {
    soundEngine.playSFX("click");
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

  const handleCopyCode = () => {
    soundEngine.playSFX("click");
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const handleExitToHome = () => {
    soundEngine.playSFX("click");
    if (onClose) {
      onClose();
    } else if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  const currentDisplayBallColor =
    nextRequiredBall === "Red"
      ? BALL_TYPES.Red.color
      : BALL_TYPES[targetedColor as keyof typeof BALL_TYPES]?.color || BALL_TYPES.Yellow.color;

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#09090b] text-white flex flex-col justify-between items-center overflow-hidden touch-none select-none z-[100] p-1 md:p-2 font-sans">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg) scale(0.7); opacity: 0; }
        }
      `}</style>

      {/* LOBBY MENU */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-[#09090b] flex items-center justify-center p-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-2xl text-neutral-300">sports_bar</span>
              </div>
              <div>
                <h1 className="font-headline font-black text-xl tracking-tight text-white uppercase">
                  Snooker Matrix
                </h1>
                <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
              </div>
            </div>

            <button
              onClick={startOnlineMatchmaking}
              className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-[#CCFF00]/10 rounded-xl flex items-center justify-center text-[#CCFF00]">
                  <span className="material-symbols-outlined text-xl">search</span>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="bg-[#CCFF00]/10 text-[#CCFF00] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                    Popular
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
                className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]"
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
                className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px]"
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
                className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5 uppercase"
              >
                Join
              </button>
            </div>

            <button
              onClick={handleExitToHome}
              className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase"
            >
              <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
            </button>
          </div>
        </div>
      )}

      {/* LOCATING OPPONENT SCREEN */}
      {playMode === "searching" && (
        <div className="absolute inset-0 z-[60] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="relative w-32 h-32 flex items-center justify-center mb-8">
            <div className="absolute inset-0 border border-[#CCFF00]/30 rounded-full animate-ping" style={{ animationDuration: "2s" }}></div>
            <div className="absolute inset-4 border border-[#CCFF00]/20 rounded-full animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }}></div>
            <div className="absolute inset-8 border border-[#CCFF00]/10 rounded-full animate-ping" style={{ animationDuration: "2s", animationDelay: "1s" }}></div>
            <div className="w-16 h-16 bg-[#CCFF00]/10 rounded-full flex items-center justify-center border border-[#CCFF00]/20 relative z-10">
              <span className="material-symbols-outlined text-3xl text-[#CCFF00]">search</span>
            </div>
          </div>
          <h2 className="font-headline font-black text-2xl text-white mb-2 uppercase">Locating Opponent</h2>
          <p className="text-sm text-[#CCFF00] font-bold mb-12 animate-pulse">Searching global matchmaking pool...</p>
          <button
            onClick={() => {
              soundEngine.playSFX("click");
              setPlayMode("menu");
            }}
            className="bg-[#18181b] text-white px-8 py-3 rounded-full font-headline font-bold text-sm border border-white/10 hover:bg-white/10 transition-colors active:scale-95 uppercase"
          >
            Abort Search
          </button>
        </div>
      )}

      {/* MATCH CONFIRMED SCREEN */}
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
            onClick={enterBotMatch}
            className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)] uppercase"
          >
            Enter Match <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}

      {/* WAITING SCREEN */}
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
                    className={`h-11 px-5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
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
              className="w-full mt-8 py-3.5 bg-white/5 text-neutral-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-white/5 relative z-10"
            >
              Cancel Match
            </button>
          </div>
        </div>
      )}

      {/* 🎯 SPIN SELECTOR MODAL */}
      {showSpinModal && (
        <div
          onClick={() => setShowSpinModal(false)}
          className="absolute inset-0 bg-black/80 backdrop-blur-md z-[999999] flex justify-center items-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#18181b] border border-white/10 rounded-2xl p-4 flex flex-col items-center max-w-[220px] w-full shadow-2xl"
          >
            <h3 className="text-white text-[10px] font-black uppercase tracking-widest mb-2 font-headline">
              Cue Ball Strike Point
            </h3>

            <canvas
              ref={spinCanvasRef}
              width={160}
              height={160}
              onPointerDown={handleSpinCanvasInteraction}
              onPointerMove={(e) => {
                if (e.buttons === 1) handleSpinCanvasInteraction(e);
              }}
              onPointerUp={() => setShowSpinModal(false)}
              className="bg-transparent cursor-crosshair rounded-full shadow-inner touch-none"
            />
          </div>
        </div>
      )}

      {/* WINNER MODAL */}
      {winner && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col justify-center items-center z-[999999] p-6 text-center animate-fade-in">
          {confettiPieces.map((p) => (
            <div
              key={p.id}
              className="absolute top-0 z-[60]"
              style={{
                left: p.left,
                width: "7px",
                height: "15px",
                backgroundColor: p.color,
                borderRadius: "3px",
                animation: `confetti-fall ${p.duration} linear ${p.delay} infinite`,
              }}
            />
          ))}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#CCFF00] to-green-500 text-black flex items-center justify-center mb-4 shadow-lg border-4 border-[#CCFF00] animate-bounce">
            <span className="material-symbols-outlined text-4xl">emoji_events</span>
          </div>
          <h2 className="text-3xl font-black text-[#CCFF00] uppercase tracking-widest mb-2 font-headline">{winner} Wins!</h2>
          <p className="text-neutral-300 text-xs mb-6">
            Match Completed! Score: Player 1 ({scores.player1} pts) - Player 2 ({scores.player2} pts)
          </p>
          <button
            onClick={initBalls}
            className="px-8 py-3.5 bg-[#CCFF00] hover:bg-[#b3e600] text-black font-black uppercase tracking-wider rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer text-xs"
          >
            Play Again 🔄
          </button>
        </div>
      )}

      {/* HEADER SCOREBOARD HUD */}
      {playMode !== "menu" && playMode !== "searching" && playMode !== "confirmed" && (
        <div className="w-full max-w-[480px] flex justify-between items-center bg-[#18181b] border border-white/10 p-1.5 px-3 rounded-xl shadow-xl text-white shrink-0 z-10">
          {/* PLAYER 1 SCORECARD */}
          <div
            className={`text-center min-w-[70px] p-1 rounded-lg transition-all duration-300 relative ${
              currentTurn === "player1"
                ? "bg-[#CCFF00]/10 border-2 border-[#CCFF00] shadow-[0_0_12px_rgba(204,255,0,0.4)] animate-pulse"
                : "opacity-60 border border-transparent"
            }`}
          >
            {currentTurn === "player1" && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#CCFF00] text-black text-[6px] font-black uppercase px-1.5 py-0.2 rounded-full animate-bounce">
                TURN
              </span>
            )}
            <span
              className={`text-[8px] md:text-[9px] uppercase tracking-wider block font-black ${
                currentTurn === "player1" ? "text-[#CCFF00]" : "text-neutral-500"
              }`}
            >
              Player 1
            </span>
            <p className="text-xs md:text-base font-black font-mono leading-tight">
              {scores.player1} <span className="text-[8px] text-neutral-400 font-normal">pts</span>
            </p>
          </div>

          {/* TARGET BALL INDICATOR */}
          <div className="flex items-center gap-1.5 bg-black/50 px-2.5 py-1 rounded-lg border border-white/5">
            <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-widest">TARGET</span>
            <div
              className="w-3.5 h-3.5 md:w-5 md:h-5 rounded-full shadow-md transition-colors duration-200 border border-white/20"
              style={{
                background: `radial-gradient(circle at 6px 6px, #ffffff, ${currentDisplayBallColor} 40%, #000000 100%)`,
              }}
            />
          </div>

          {/* PLAYER 2 SCORECARD */}
          <div className="flex items-center gap-2">
            <div
              className={`text-center min-w-[70px] p-1 rounded-lg transition-all duration-300 relative ${
                currentTurn === "player2"
                  ? "bg-rose-500/10 border-2 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse"
                  : "opacity-60 border border-transparent"
              }`}
            >
              {currentTurn === "player2" && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-rose-400 text-black text-[6px] font-black uppercase px-1.5 py-0.2 rounded-full animate-bounce">
                  TURN
                </span>
              )}
              <span
                className={`text-[8px] md:text-[9px] uppercase tracking-wider block font-black ${
                  currentTurn === "player2" ? "text-rose-400" : "text-neutral-500"
                }`}
              >
                {playMode === "bot" ? localOpponent?.name || "Bot" : "Player 2"}
              </span>
              <p className="text-xs md:text-base font-black font-mono leading-tight">
                {scores.player2} <span className="text-[8px] text-neutral-400 font-normal">pts</span>
              </p>
            </div>

            <button
              onClick={() => setShowEmojiMenu(!showEmojiMenu)}
              className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-neutral-300 active:scale-90 transition-all shadow-sm hover:bg-white/10"
            >
              <span className="material-symbols-outlined text-sm">add_reaction</span>
            </button>

            {showEmojiMenu && (
              <div className="absolute top-14 right-10 bg-[#18181b] border border-white/10 p-2 rounded-2xl shadow-2xl flex gap-1 z-50">
                {EMOJIS.map((em) => (
                  <button key={em} onClick={() => sendEmoji(em)} className="text-xl hover:scale-125 transition-transform p-1">
                    {em}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleExitToHome}
              className="pointer-events-auto bg-rose-600 border border-rose-500 hover:bg-rose-500 px-2 py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all text-white cursor-pointer shadow-md flex items-center gap-1"
            >
              EXIT
            </button>
          </div>
        </div>
      )}

      {/* FLOATING EMOJI LAYER */}
      {floatingEmojis.map((em) => {
        const isMine = em.role === myPlayerRole;
        return (
          <div key={em.id} className={`absolute z-40 text-4xl animate-float-up pointer-events-none ${isMine ? "right-10 bottom-10" : "left-10 top-10"}`}>
            {em.emoji}
          </div>
        );
      })}

      {/* VERTICAL GAME WORKSPACE */}
      {playMode !== "menu" && playMode !== "searching" && playMode !== "confirmed" && (
        <div ref={containerRef} className="w-full flex-1 flex justify-center items-center min-h-0 min-w-0 overflow-hidden py-0.5 relative">
          <div
            style={{ height: `${containerScale.height}px` }}
            className="flex items-end justify-center gap-1 md:gap-2 max-w-full relative transition-all duration-100"
          >
            {/* 1. LEFT PULL POWER CONTROLLER */}
            <div className="flex flex-col items-center justify-between bg-[#18181b] border border-white/10 p-1 rounded-xl h-[50%] w-[28px] sm:w-[32px] md:w-[38px] shadow-lg relative shrink-0">
              <span className="text-[5px] md:text-[7px] font-bold text-neutral-400 uppercase tracking-widest">PULL</span>

              <div className="h-[75%] w-[6px] md:w-[8px] bg-[#09090b] rounded-full border border-white/5 relative shadow-inner flex items-start justify-center cursor-ns-resize">
                <div
                  className="w-full bg-gradient-to-b from-[#CCFF00] via-amber-500 to-rose-500 rounded-full absolute top-0 transition-all duration-75"
                  style={{ height: `${uiPower}%` }}
                />
                <div
                  onPointerDown={handlePowerPointerDown}
                  onPointerMove={handlePowerPointerMove}
                  onPointerUp={handlePowerPointerUp}
                  onPointerCancel={handlePowerPointerUp}
                  className="w-[16px] h-[16px] sm:w-[20px] sm:h-[20px] md:w-[22px] md:h-[22px] bg-[#CCFF00] hover:bg-[#b3e600] border-[2px] border-black rounded-full absolute shadow-md active:scale-95 transition-transform cursor-grab active:cursor-grabbing"
                  style={{
                    top: `calc(${uiPower}% - 8px)`,
                    touchAction: "none",
                  }}
                />
              </div>
            </div>

            {/* 2. VERTICAL SNOOKER TABLE CANVAS */}
            <div
              style={{ width: `${containerScale.width}px`, height: `${containerScale.height}px` }}
              className="relative flex justify-center items-center shrink-0"
            >
              <canvas
                ref={canvasRef}
                width={tableWidth}
                height={tableHeight}
                onPointerDown={handleCanvasInteraction}
                onPointerMove={handleCanvasInteraction}
                onPointerUp={() => {
                  if (isBallInHand) setIsBallInHand(false);
                }}
                className="w-full h-full shadow-2xl rounded-xl border-2 border-white/10 bg-[#09090b] cursor-crosshair"
              />
              {isBallInHand && (
                <div className="absolute bottom-6 bg-[#CCFF00] text-black font-black text-[7px] md:text-[10px] uppercase px-3 py-1 rounded-full pointer-events-none tracking-widest animate-pulse shadow-lg z-20">
                  🖐️ PLACE CUE BALL INSIDE D-ZONE
                </div>
              )}
            </div>

            {/* 3. RIGHT TUNE WHEEL & SPIN CONTROLLER */}
            <div className="flex flex-col items-center justify-between bg-[#18181b] border border-white/10 p-1 rounded-xl h-[50%] w-[28px] sm:w-[32px] md:w-[38px] shadow-lg relative shrink-0">
              <span className="text-[5px] md:text-[7px] font-bold text-neutral-400 uppercase tracking-widest">TUNE</span>

              <div
                onPointerDown={handleWheelPointerDown}
                onPointerMove={handleWheelPointerMove}
                onPointerUp={handleWheelPointerUp}
                onPointerCancel={handleWheelPointerUp}
                className={`h-[55%] w-[18px] sm:w-[22px] md:w-[26px] rounded-lg border-[2px] border-white/10 bg-[#09090b] overflow-hidden cursor-ns-resize shadow-inner relative transition-opacity ${
                  isBallInHand || isMoving ? "opacity-40" : "opacity-100"
                }`}
              >
                <div
                  className="absolute inset-0 w-full h-[200%]"
                  style={{
                    background: "repeating-linear-gradient(to bottom, #27272a, #27272a 4px, #09090b 4px, #09090b 8px)",
                    transform: `translateY(${wheelPos % 8}px)`,
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70 pointer-events-none" />
              </div>

              <button
                onClick={() => setShowSpinModal(true)}
                className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full bg-[#18181b] border-2 border-[#CCFF00] flex items-center justify-center active:scale-95 transition-all shadow-md relative group cursor-pointer shrink-0"
                title="Set Spin / English"
              >
                <div className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full bg-white relative flex items-center justify-center">
                  <div
                    className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-rose-500 absolute"
                    style={{
                      transform: `translate(${spinOffset.x * 2}px, ${-spinOffset.y * 2}px)`,
                    }}
                  />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      {playMode !== "menu" && playMode !== "searching" && playMode !== "confirmed" && (
        <div className="w-full max-w-[480px] flex justify-between items-center px-1 shrink-0">
          <button
            onClick={initBalls}
            className="ml-auto px-3 py-1 bg-[#18181b] border border-white/10 hover:bg-white/10 text-neutral-300 text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-lg active:scale-95 transition-transform cursor-pointer"
          >
            Reset Match
          </button>
        </div>
      )}
    </div>
  );
}