"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";

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
}

export default function SnookerGame({ onClose, preloadedMatchId }: SnookerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 🎮 VIEW & MATCHMAKING STATES
  const [view, setView] = useState<"menu" | "host" | "play">(
    preloadedMatchId ? "play" : "menu"
  );
  const [matchId, setMatchId] = useState<string | null>(preloadedMatchId || null);
  const [joinInput, setJoinInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 🌐 MULTIPLAYER NETWORK STATES
  const [channel, setChannel] = useState<any>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"player1" | "player2">("player1");
  const [opponentConnected, setOpponentConnected] = useState(false);
 
  // 🎱 GAME LOGIC STATES
  const [scores, setScores] = useState({ player1: 0, player2: 0 });
  const [currentTurn, setCurrentTurn] = useState<"player1" | "player2">("player1");
  const [nextRequiredBall, setNextRequiredBall] = useState<string>("Red");
  const [targetedColor, setTargetedColor] = useState<string>("Red");
 
  const [gamePhase, setGamePhase] = useState<"REDS" | "LAST_RED_COLOR" | "COLORS_SEQUENCE">("REDS");
  const [colorSeqIndex, setColorSeqIndex] = useState<number>(0);
 
  const [isMoving, setIsMoving] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
 
  const [isBallInHand, setIsBallInHand] = useState(true);
  const [aimAngle, setAimAngle] = useState(0);
  const [uiPower, setUiPower] = useState(0);  

  // Spin States [-1.0 to 1.0]
  const [spinOffset, setSpinOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showSpinModal, setShowSpinModal] = useState(false);
  const spinCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Screen Orientation State
  const [isPortrait, setIsPortrait] = useState(false);

  // Wheel Drag State
  const [wheelPos, setWheelPos] = useState(0);
  const wheelDragStartY = useRef<number | null>(null);

  // Power Drag States
  const isDraggingPower = useRef(false);
  const powerDragStartY = useRef<number | null>(null);
  const initialUiPower = useRef<number>(0);

  const ballsRef = useRef<Ball[]>([]);
  const turnTrackingRef = useRef({ redsPotted: 0, colorsPotted: [] as string[], firstHitBallType: "" });
  const wasMovingRef = useRef(false);
 
  const tableWidth = 720;
  const tableHeight = 360;
  const ballRadius = 9;

  const baulkLineX = 170;
  const dZoneRadius = 55;

  const pockets = [
    { x: 20, y: 20 },
    { x: tableWidth / 2, y: 15 },
    { x: tableWidth - 20, y: 20 },
    { x: 20, y: tableHeight - 20 },
    { x: tableWidth / 2, y: tableHeight - 15 },
    { x: tableWidth - 20, y: tableHeight - 20 }
  ];

  const showToastMessage = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setMyUserId(session.user.id);
    });
  }, []);

  // Supabase Realtime Synchronization
  useEffect(() => {
    if (!matchId || !myUserId) return;

    const matchChannel = supabase.channel(`snooker_match_${matchId}`, {
      config: { broadcast: { self: false }, presence: { key: myUserId } },
    });

    matchChannel
      .on("broadcast", { event: "shot" }, (payload) => {
        const { angle, power, spin, cueX, cueY } = payload.payload;
        setAimAngle(angle);
        setSpinOffset(spin);

        const cueBall = ballsRef.current.find(b => b.isCue);
        if (cueBall) {
          cueBall.x = cueX;
          cueBall.y = cueY;
          const impulseSpeed = (power / 100) * 22;
          cueBall.vx = Math.cos(angle) * impulseSpeed;
          cueBall.vy = Math.sin(angle) * impulseSpeed;
          cueBall.spinX = spin.x;
          cueBall.spinY = spin.y;
        }

        setIsBallInHand(false);
        setIsMoving(true);
      })
      .on("broadcast", { event: "cue_place" }, (payload) => {
        const { x, y } = payload.payload;
        const cueBall = ballsRef.current.find(b => b.isCue);
        if (cueBall) {
          cueBall.x = x;
          cueBall.y = y;
        }
      })
      .on("broadcast", { event: "table_sync" }, (payload) => {
        const { balls, scores, currentTurn, nextRequiredBall, gamePhase, colorSeqIndex } = payload.payload;
        if (balls) ballsRef.current = balls;
        if (scores) setScores(scores);
        if (currentTurn) setCurrentTurn(currentTurn);
        if (nextRequiredBall) setNextRequiredBall(nextRequiredBall);
        if (gamePhase) setGamePhase(gamePhase);
        if (colorSeqIndex !== undefined) setColorSeqIndex(colorSeqIndex);
      })
      .on("presence", { event: "sync" }, () => {
        const state = matchChannel.presenceState();
        const users = Object.keys(state);
        setOpponentConnected(users.length > 1);
        if (users.length > 0) {
          setMyRole(users.sort()[0] === myUserId ? "player1" : "player2");
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await matchChannel.track({ online_at: new Date().toISOString() });
        }
      });

    setChannel(matchChannel);
    return () => {
      matchChannel.untrack();
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, myUserId]);

  useEffect(() => {
    if (view === "host" && opponentConnected) setView("play");
  }, [opponentConnected, view]);

  const handleExit = () => {
    if (matchId) setMatchId(null);
    setView("menu");
    if (onClose) onClose();
  };

  const respotColorBall = useCallback((colorName: string) => {
    const spots: Record<string, { x: number; y: number }> = {
      Yellow: { x: baulkLineX, y: tableHeight / 2 - 55 },
      Green: { x: baulkLineX, y: tableHeight / 2 + 55 },
      Brown: { x: baulkLineX, y: tableHeight / 2 },
      Blue: { x: tableWidth / 2, y: tableHeight / 2 },
      Pink: { x: 450, y: tableHeight / 2 },
      Black: { x: 670, y: tableHeight / 2 },
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
  }, [baulkLineX, tableHeight, tableWidth]);

  // SNOOKER RULE ENGINE
  const evaluateTurnEnd = useCallback(() => {
    const tracking = turnTrackingRef.current;
    const opponent = currentTurn === "player1" ? "player2" : "player1";
    let turnSwitched = false;
    let penalty = 0;

    const redsLeft = ballsRef.current.filter(b => b.type === "Red" && !b.isPotted).length;
    const activeBalls = ballsRef.current.filter(b => !b.isPotted);

    if (activeBalls.length === 1 && activeBalls[0].isCue) {
      if (scores.player1 > scores.player2) setWinner("Player 1");
      else if (scores.player2 > scores.player1) setWinner("Player 2");
      else setWinner("Draw Match");
      return;
    }

    const isCuePotted = tracking.firstHitBallType === "FOUL_SCRATCH";
    const isFoul = isCuePotted || tracking.firstHitBallType === "";

    let newScores = { ...scores };
    let newTurn = currentTurn;
    let newNextBall = nextRequiredBall;
    let newPhase = gamePhase;
    let newSeqIndex = colorSeqIndex;

    if (gamePhase === "REDS") {
      if (isFoul) {
        if (tracking.colorsPotted.length > 0) {
          tracking.colorsPotted.forEach(c => respotColorBall(c));
        }
        penalty = 4; turnSwitched = true; newNextBall = "Red";
      } else if (nextRequiredBall === "Red") {
        if (tracking.firstHitBallType !== "Red") {
          if (tracking.colorsPotted.length > 0) {
            tracking.colorsPotted.forEach(c => respotColorBall(c));
          }
          penalty = 4; turnSwitched = true; newNextBall = "Red";
        } else if (tracking.colorsPotted.length > 0) {
          tracking.colorsPotted.forEach(c => respotColorBall(c));
          penalty = 4; turnSwitched = true; newNextBall = "Red";
        } else if (tracking.redsPotted > 0) {
          newScores[currentTurn] += tracking.redsPotted;
          if (redsLeft === 0) {
            newPhase = "LAST_RED_COLOR";
            newNextBall = "Color";
          } else {
            newNextBall = "Color";
          }
        } else {
          turnSwitched = true; newNextBall = "Red";
        }
      } else {
        if (tracking.firstHitBallType === "Red" || tracking.redsPotted > 0 || tracking.colorsPotted.length !== 1) {
          if (tracking.colorsPotted.length > 0) {
            tracking.colorsPotted.forEach(c => respotColorBall(c));
          }
          penalty = 4; turnSwitched = true; newNextBall = "Red";
        } else {
          const colorName = tracking.colorsPotted[0];
          const pts = BALL_TYPES[colorName as keyof typeof BALL_TYPES]?.points || 2;
          newScores[currentTurn] += pts;
          respotColorBall(colorName);
          newNextBall = "Red";
        }
      }
    } else if (gamePhase === "LAST_RED_COLOR") {
      if (isFoul || tracking.colorsPotted.length !== 1) {
        if (tracking.colorsPotted.length > 0) {
          tracking.colorsPotted.forEach(c => respotColorBall(c));
        }
        penalty = 4; turnSwitched = true;
        newPhase = "COLORS_SEQUENCE";
        newSeqIndex = 0;
        newNextBall = "Yellow";
      } else {
        const colorName = tracking.colorsPotted[0];
        const pts = BALL_TYPES[colorName as keyof typeof BALL_TYPES]?.points || 2;
        newScores[currentTurn] += pts;
        respotColorBall(colorName);
        newPhase = "COLORS_SEQUENCE";
        newSeqIndex = 0;
        newNextBall = "Yellow";
      }
    } else if (gamePhase === "COLORS_SEQUENCE") {
      const targetColor = COLOR_SEQUENCE[colorSeqIndex];
     
      if (isFoul || tracking.firstHitBallType !== targetColor || tracking.colorsPotted.length > 1) {
        if (tracking.colorsPotted.length > 0) {
          tracking.colorsPotted.forEach(c => respotColorBall(c));
        }
        penalty = 4; turnSwitched = true;
      } else if (tracking.colorsPotted.length === 1 && tracking.colorsPotted[0] === targetColor) {
        const pts = BALL_TYPES[targetColor as keyof typeof BALL_TYPES]?.points || 2;
        newScores[currentTurn] += pts;
        const nextIdx = colorSeqIndex + 1;
        newSeqIndex = nextIdx;
        if (nextIdx < COLOR_SEQUENCE.length) {
          newNextBall = COLOR_SEQUENCE[nextIdx];
        }
      } else {
        if (tracking.colorsPotted.length > 0) {
          tracking.colorsPotted.forEach(c => respotColorBall(c));
        }
        turnSwitched = true;
      }
    }

    if (turnSwitched) {
      newScores[opponent] += penalty;
      newTurn = opponent;
    }

    setScores(newScores);
    setCurrentTurn(newTurn);
    setNextRequiredBall(newNextBall);
    setGamePhase(newPhase);
    setColorSeqIndex(newSeqIndex);

    setUiPower(0);
    isDraggingPower.current = false;
    turnTrackingRef.current = { redsPotted: 0, colorsPotted: [], firstHitBallType: "" };

    // Synchronize full state over Supabase broadcast
    if (channel && matchId) {
      channel.send({
        type: "broadcast",
        event: "table_sync",
        payload: {
          balls: ballsRef.current,
          scores: newScores,
          currentTurn: newTurn,
          nextRequiredBall: newNextBall,
          gamePhase: newPhase,
          colorSeqIndex: newSeqIndex
        }
      });
    }
  }, [currentTurn, nextRequiredBall, gamePhase, colorSeqIndex, scores, respotColorBall, channel, matchId]);

  const initBalls = useCallback(() => {
    const balls: Ball[] = [];
    let idCounter = 1;

    balls.push({ id: idCounter++, x: baulkLineX - 20, y: tableHeight / 2, vx: 0, vy: 0, type: "White", isCue: true, scale: 1, isPotted: false });

    const startX = 480;
    const startY = tableHeight / 2;
    let redCount = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j <= i; j++) {
        if (redCount < 15) {
          balls.push({
            id: idCounter++,
            x: startX + i * (ballRadius * 1.75),
            y: startY - (i * ballRadius) + (j * ballRadius * 2),
            vx: 0, vy: 0, type: "Red",
            scale: 1, isPotted: false
          });
          redCount++;
        }
      }
    }

    balls.push({ id: idCounter++, x: baulkLineX, y: tableHeight / 2 - 55, vx: 0, vy: 0, type: "Yellow", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: baulkLineX, y: tableHeight / 2 + 55, vx: 0, vy: 0, type: "Green", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: baulkLineX, y: tableHeight / 2, vx: 0, vy: 0, type: "Brown", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: tableWidth / 2, y: tableHeight / 2, vx: 0, vy: 0, type: "Blue", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: 450, y: tableHeight / 2, vx: 0, vy: 0, type: "Pink", scale: 1, isPotted: false });
    balls.push({ id: idCounter++, x: 670, y: tableHeight / 2, vx: 0, vy: 0, type: "Black", scale: 1, isPotted: false });

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
    setAimAngle(0);
    setSpinOffset({ x: 0, y: 0 });
    turnTrackingRef.current = { redsPotted: 0, colorsPotted: [], firstHitBallType: "" };
  }, []);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, []);

  useEffect(() => {
    if (view === "play") {
      const timer = setTimeout(() => {
        initBalls();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [view, initBalls]);

  // Spin Canvas Render
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
    ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
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
      y: Math.max(-1, Math.min(1, normY))
    });
  };

  // Canvas Physics Engine Loop
  useEffect(() => {
    if (view !== "play") return;
    const canvas = canvasRef.current;
    if (!canvas || isPortrait) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const engineLoop = () => {
      const balls = ballsRef.current;
      let dynamicMotion = false;

      const SUB_STEPS = 4;
      const frictionFactor = Math.pow(0.984, 1 / SUB_STEPS);

      for (let step = 0; step < SUB_STEPS; step++) {
        balls.forEach(ball => {
          if (ball.isPotted) return;
          pockets.forEach(p => {
            if (Math.hypot(ball.x - p.x, ball.y - p.y) < ballRadius * 3.2) {
              ball.isPotted = true;
              ball.vx = 0; ball.vy = 0;
              ball.x = p.x; ball.y = p.y;

              if (ball.isCue) {
                turnTrackingRef.current.firstHitBallType = "FOUL_SCRATCH";
                setTimeout(() => {
                  ball.isPotted = false; ball.scale = 1;
                  ball.x = baulkLineX - 20; ball.y = tableHeight / 2;
                  setIsBallInHand(true);
                }, 800);
              } else {
                if (ball.type === "Red") turnTrackingRef.current.redsPotted += 1;
                else turnTrackingRef.current.colorsPotted.push(ball.type);
              }
            }
          });
        });

        balls.forEach(ball => {
          if (ball.isPotted) {
            if (ball.scale && ball.scale > 0.1) {
              ball.scale -= 0.08 / SUB_STEPS;
              dynamicMotion = true;
            }
            ball.vx = 0; ball.vy = 0;
            return;
          }

          if (isBallInHand && !ball.isCue) {
            ball.vx = 0; ball.vy = 0;
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
              ball.spinX = 0; ball.spinY = 0;
            }
          } else {
            ball.vx *= frictionFactor;
            ball.vy *= frictionFactor;
          }

          if (Math.hypot(ball.vx, ball.vy) < 0.05) {
            ball.vx = 0; ball.vy = 0;
          } else {
            dynamicMotion = true;
          }

          const boundX = 25 + ballRadius;
          const boundY = 25 + ballRadius;
          if (ball.x < boundX || ball.x > tableWidth - boundX) {
            ball.vx *= -1;
            if (ball.isCue && ball.spinX) ball.vy += ball.spinX * 0.8;
            ball.x = ball.x < boundX ? boundX : tableWidth - boundX;
          }
          if (ball.y < boundY || ball.y > tableHeight - boundY) {
            ball.vy *= -1;
            if (ball.isCue && ball.spinX) ball.vx += ball.spinX * 0.8;
            ball.y = ball.y < boundY ? boundY : tableHeight - boundY;
          }
        });

        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i]; const b2 = balls[j];
            if (isBallInHand || b1.isPotted || b2.isPotted) continue;

            const dist = Math.hypot(b2.x - b1.x, b2.y - b1.y);
            if (dist < ballRadius * 2) {
              const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
              const overlap = ballRadius * 2 - dist;
              b1.x -= Math.cos(angle) * overlap * 0.5; b1.y -= Math.sin(angle) * overlap * 0.5;
              b2.x += Math.cos(angle) * overlap * 0.5; b2.y += Math.sin(angle) * overlap * 0.5;

              if (b1.isCue && turnTrackingRef.current.firstHitBallType === "") {
                turnTrackingRef.current.firstHitBallType = b2.type;
              }

              const kx = b1.vx - b2.vx; const ky = b1.vy - b2.vy;
              const impulse = 2 * (Math.cos(angle) * kx + Math.sin(angle) * ky) / 2;
             
              b1.vx -= impulse * Math.cos(angle);
              b1.vy -= impulse * Math.sin(angle);
             
              if (b1.isCue && b1.spinY && b1.spinY < -0.2) {
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

      ballsRef.current = balls.filter(b => b.isCue || !b.isPotted || (b.scale && b.scale > 0.1));

      setIsMoving(dynamicMotion);

      if (wasMovingRef.current && !dynamicMotion) {
        evaluateTurnEnd();
      }
      wasMovingRef.current = dynamicMotion;

      // DRAW TABLE
      ctx.fillStyle = "#2b1408";
      ctx.fillRect(0, 0, tableWidth, tableHeight);
     
      ctx.strokeStyle = "#4a2410"; ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, tableWidth - 4, tableHeight - 4);

      ctx.fillStyle = "#084420";
      ctx.fillRect(18, 18, tableWidth - 36, tableHeight - 36);

      ctx.fillStyle = "#0c5827";
      ctx.fillRect(25, 25, tableWidth - 50, tableHeight - 50);
      ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2;
      ctx.strokeRect(25, 25, tableWidth - 50, tableHeight - 50);

      pockets.forEach(p => {
        const pocketRadius = ballRadius * 2.5;
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y, pocketRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#030507"; ctx.fill();
        ctx.restore();
      });

      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(baulkLineX, 25); ctx.lineTo(baulkLineX, tableHeight - 25); ctx.stroke();
      ctx.beginPath(); ctx.arc(baulkLineX, tableHeight / 2, dZoneRadius, Math.PI / 2, -Math.PI / 2, false); ctx.stroke();

      ballsRef.current.forEach(ball => {
        const currentRadius = ballRadius * (ball.scale ?? 1);
        ctx.save(); ctx.beginPath(); ctx.arc(ball.x + 2, ball.y + 3, currentRadius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)"; ctx.fill(); ctx.restore();
      });

      ballsRef.current.forEach(ball => {
        const currentRadius = ballRadius * (ball.scale ?? 1);
        if (currentRadius <= 0.5) return;
        ctx.save(); ctx.beginPath(); ctx.arc(ball.x, ball.y, currentRadius, 0, Math.PI * 2);
        const baseColor = ball.isCue ? "#ffffff" : BALL_TYPES[ball.type as keyof typeof BALL_TYPES]?.color || "#fff";
        const specColor = ball.isCue ? "#ffffff" : BALL_TYPES[ball.type as keyof typeof BALL_TYPES]?.spec || "#fff";
        const sphereGrad = ctx.createRadialGradient(ball.x - currentRadius * 0.3, ball.y - currentRadius * 0.3, currentRadius * 0.05, ball.x, ball.y, currentRadius);
        sphereGrad.addColorStop(0, specColor); sphereGrad.addColorStop(0.2, baseColor); sphereGrad.addColorStop(1, "#000");
        ctx.fillStyle = sphereGrad; ctx.fill(); ctx.restore();
      });

      const cueBall = balls.find(b => b.isCue);
      if (!cueBall) {
        animId = requestAnimationFrame(engineLoop);
        return;
      }

      if (!dynamicMotion && !isBallInHand) {
        let closestDist = 999999;
        let hitBall: Ball | null = null;
        const cos = Math.cos(aimAngle);
        const sin = Math.sin(aimAngle);

        balls.forEach(b => {
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

        ctx.save(); ctx.lineWidth = 1.2;
        if (hitBall) {
          const ghostX = cueBall.x + cos * closestDist;
          const ghostY = cueBall.y + sin * closestDist;

          ctx.strokeStyle = "rgba(255, 255, 255, 0.65)"; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(ghostX, ghostY); ctx.stroke();

          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)"; ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(ghostX, ghostY, ballRadius, 0, Math.PI * 2); ctx.stroke();

          const targetAngle = Math.atan2((hitBall as Ball).y - ghostY, (hitBall as Ball).x - ghostX);
          ctx.strokeStyle = "#22d3ee";
          ctx.beginPath();
          ctx.moveTo((hitBall as Ball).x, (hitBall as Ball).y);
          ctx.lineTo((hitBall as Ball).x + Math.cos(targetAngle) * 90, (hitBall as Ball).y + Math.sin(targetAngle) * 90);
          ctx.stroke();

          const isRightSide = (-sin * ((hitBall as Ball).y - cueBall.y) - cos * ((hitBall as Ball).x - cueBall.x)) > 0;
          const cueAngle = targetAngle + (isRightSide ? Math.PI / 2 : -Math.PI / 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.moveTo(ghostX, ghostY);
          ctx.lineTo(ghostX + Math.cos(cueAngle) * 45, ghostY + Math.sin(cueAngle) * 45);
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.35)"; ctx.setLineDash([5, 4]);
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

        ctx.strokeStyle = "#d97706"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(startX - cos * 5, startY - sin * 5); ctx.lineTo(startX - cos * 100, startY - sin * 100); ctx.stroke();

        ctx.strokeStyle = "#111827"; ctx.lineWidth = 5.5;
        ctx.beginPath(); ctx.moveTo(startX - cos * 100, startY - sin * 100); ctx.lineTo(endX, endY); ctx.stroke();

        ctx.restore();
      }

      animId = requestAnimationFrame(engineLoop);
    };

    engineLoop();
    return () => cancelAnimationFrame(animId);
  }, [aimAngle, uiPower, nextRequiredBall, isBallInHand, isMoving, isPortrait, view, evaluateTurnEnd]);

  const isMyTurnActive = matchId ? currentTurn === myRole : true;

  const handleCanvasInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMoving || !isMyTurnActive) return;
    if (matchId && !opponentConnected) {
      showToastMessage("Waiting for opponent to join!");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
   
    const clickX = ((e.clientX - rect.left) / rect.width) * tableWidth;
    const clickY = ((e.clientY - rect.top) / rect.height) * tableHeight;

    const cueBall = ballsRef.current.find(b => b.isCue);
    if (!cueBall || cueBall.isPotted) return;

    if (isBallInHand) {
      const distToDCenter = Math.hypot(clickX - baulkLineX, clickY - tableHeight / 2);
      if (clickX <= baulkLineX && distToDCenter <= dZoneRadius - ballRadius) {
        let isOverlapping = false;
        let overlapBall: Ball | null = null;
       
        ballsRef.current.forEach(b => {
          if (b.isCue || b.isPotted) return;
          const currentDistance = Math.hypot(clickX - b.x, clickY - b.y);
          if (currentDistance < ballRadius * 2) { isOverlapping = true; overlapBall = b; }
        });

        let newX = clickX;
        let newY = clickY;

        if (isOverlapping && overlapBall) {
          const angle = Math.atan2(clickY - (overlapBall as Ball).y, clickX - (overlapBall as Ball).x);
          newX = (overlapBall as Ball).x + Math.cos(angle) * (ballRadius * 2);
          newY = (overlapBall as Ball).y + Math.sin(angle) * (ballRadius * 2);
        }

        cueBall.x = newX;
        cueBall.y = newY;

        if (channel && matchId) {
          channel.send({
            type: "broadcast",
            event: "cue_place",
            payload: { x: newX, y: newY }
          });
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
    if (isMoving || isBallInHand || !isMyTurnActive) return;
    wheelDragStartY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (wheelDragStartY.current === null) return;
    const deltaY = e.clientY - wheelDragStartY.current;
    wheelDragStartY.current = e.clientY;
    setAimAngle(prev => prev + deltaY * 0.0012);
    setWheelPos(prev => prev + deltaY);
  };

  const handleWheelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    wheelDragStartY.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handlePowerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMoving || isBallInHand || !isMyTurnActive) return;
    if (matchId && !opponentConnected) {
      showToastMessage("Waiting for opponent to connect!");
      return;
    }
    isDraggingPower.current = true;
    powerDragStartY.current = e.clientY;
    initialUiPower.current = uiPower;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePowerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPower.current || powerDragStartY.current === null) return;
    const currentY = e.clientY;
    const deltaY = currentY - powerDragStartY.current;
    const calculatedChange = (deltaY / 220) * 100;
    let newPower = initialUiPower.current + calculatedChange;
   
    if (newPower < 0) newPower = 0;
    if (newPower > 100) newPower = 100;
   
    setUiPower(newPower);
  };

  const handlePowerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingPower.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
   
    const finalPower = uiPower;
    isDraggingPower.current = false;
    powerDragStartY.current = null;

    if (isMoving || finalPower < 10) {
      setUiPower(0);
      return;
    }

    if (isBallInHand) setIsBallInHand(false);
    const cueBall = ballsRef.current.find(b => b.isCue);
    if (!cueBall) return;

    const impulseSpeed = (finalPower / 100) * 22;
    cueBall.vx = Math.cos(aimAngle) * impulseSpeed;
    cueBall.vy = Math.sin(aimAngle) * impulseSpeed;
   
    cueBall.spinX = spinOffset.x;
    cueBall.spinY = spinOffset.y;

    if (channel && matchId) {
      channel.send({
        type: "broadcast",
        event: "shot",
        payload: {
          angle: aimAngle,
          power: finalPower,
          spin: spinOffset,
          cueX: cueBall.x,
          cueY: cueBall.y
        }
      });
    }

    setIsMoving(true);
    setUiPower(0);
  };

  const currentDisplayBallColor = nextRequiredBall === "Red"
    ? BALL_TYPES.Red.color
    : (BALL_TYPES[targetedColor as keyof typeof BALL_TYPES]?.color || BALL_TYPES.Yellow.color);

  // 1️⃣ LOBBY / MENU VIEW
  if (view === "menu") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center font-body text-white px-6">
        <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col items-center relative overflow-hidden">
          <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mb-4 border border-cyan-500/20 shadow-inner">
            <span className="material-symbols-outlined text-3xl text-cyan-400">sports_bar</span>
          </div>
          <h1 className="font-headline font-black text-2xl tracking-tight mb-1">Snooker Arena</h1>
          <p className="font-caps text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-8 uppercase">Select Engagement Mode</p>
          
          <div className="w-full space-y-3">
            <button
              onClick={() => {
                setMatchId(Math.random().toString(36).substring(2, 8).toUpperCase());
                setView("host");
              }}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg">language</span>
                <span className="font-headline font-bold text-sm tracking-wide">HOST NETWORK MATCH</span>
              </div>
              <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </button>

            <button
              onClick={() => {
                setMatchId(null);
                setView("play");
              }}
              className="w-full bg-white/5 hover:bg-white/10 text-white rounded-2xl py-4 px-5 flex items-center justify-between transition-all active:scale-95 border border-white/5"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-lg text-neutral-400">group</span>
                <span className="font-headline font-bold text-sm tracking-wide text-neutral-200">LOCAL PASS & PLAY</span>
              </div>
              <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </button>
          </div>

          <div className="w-full flex items-center gap-4 my-6 opacity-40">
            <div className="flex-1 h-px bg-white/20"></div>
            <span className="font-caps text-[9px] font-bold tracking-widest uppercase">Or Join Room</span>
            <div className="flex-1 h-px bg-white/20"></div>
          </div>

          <div className="w-full flex gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/5">
            <input
              type="text"
              placeholder="CODE"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              className="flex-1 bg-transparent border-none text-center font-headline font-bold tracking-widest text-white placeholder-neutral-600 focus:outline-none uppercase"
              maxLength={8}
            />
            <button
              onClick={() => {
                if (joinInput.length >= 4) {
                  setMatchId(joinInput.trim().toUpperCase());
                  setView("play");
                }
              }}
              disabled={joinInput.length < 4}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white px-5 py-3 rounded-xl font-headline font-bold text-xs tracking-wider transition-all"
            >
              JOIN
            </button>
          </div>

          <button onClick={handleExit} className="mt-8 flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-caps text-[10px] font-bold tracking-widest">
            <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
          </button>
        </div>
      </div>
    );
  }

  // 2️⃣ HOST WAITING VIEW
  if (view === "host") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col font-body text-white">
        <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/50 to-transparent">
          <button onClick={handleExit} className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          <div className="text-center">
            <h2 className="font-headline font-black text-sm uppercase tracking-widest">Snooker Room</h2>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="font-caps text-[9px] font-bold tracking-widest text-cyan-400">CONNECTING...</span>
            </div>
          </div>
          <div className="w-10 h-10"></div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-8 shadow-2xl border border-white/5 flex flex-col items-center text-center">
            <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-cyan-400 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h3 className="font-headline font-black text-xl tracking-tight mb-8">AWAITING OPPONENT</h3>
            <p className="font-caps text-[10px] font-bold tracking-[0.2em] text-neutral-500 mb-3 uppercase">Share This Room Code</p>
            
            <div className="w-full flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-2 pl-6 mb-6">
              <span className="font-headline font-bold text-2xl tracking-[0.3em] text-cyan-300">{matchId}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(matchId!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-xl transition-colors text-xs font-bold tracking-wider"
              >
                <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>

            <button onClick={handleExit} className="w-full bg-white/5 hover:bg-white/10 text-neutral-300 rounded-2xl py-4 font-headline font-bold text-sm tracking-wide transition-all border border-white/5">
              CANCEL MATCH
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3️⃣ GAMEPLAY CANVAS ARENA
  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-950 flex flex-col justify-center items-center overflow-hidden touch-none select-none z-[9999] p-2 md:p-4">
      
      {toast && (
        <div className="absolute top-16 z-[99999] bg-red-500/90 backdrop-blur-md text-white px-6 py-2.5 rounded-2xl font-headline font-bold text-xs shadow-2xl animate-fade-in border border-red-400">
          {toast}
        </div>
      )}

      {/* SPIN SELECTOR MODAL */}
      {showSpinModal && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-[999999] flex justify-center items-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col items-center max-w-[280px] w-full shadow-2xl animate-fade-in">
            <h3 className="text-white text-xs font-black uppercase tracking-widest mb-3">Cue Ball Strike Point</h3>
           
            <canvas
              ref={spinCanvasRef}
              width={160}
              height={160}
              onPointerDown={handleSpinCanvasInteraction}
              onPointerMove={(e) => { if(e.buttons === 1) handleSpinCanvasInteraction(e); }}
              className="bg-transparent cursor-crosshair rounded-full shadow-inner mb-4 touch-none"
            />

            <div className="text-[10px] text-neutral-400 font-mono mb-4 text-center">
              Spin (X: {spinOffset.x.toFixed(2)}, Y: {spinOffset.y.toFixed(2)})
            </div>

            <button
              onClick={() => setShowSpinModal(false)}
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase text-xs rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              Done ✅
            </button>
          </div>
        </div>
      )}

      {/* WINNER MODAL */}
      {winner && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col justify-center items-center z-[999999] p-6 text-center animate-fade-in">
          <div className="text-5xl mb-4">🏆</div>
          <h2 className="text-3xl font-black text-amber-400 uppercase tracking-widest mb-2">{winner} Wins!</h2>
          <p className="text-slate-300 text-sm mb-6">Match Completed! Score: Player 1 ({scores.player1} pts) - Player 2 ({scores.player2} pts)</p>
          <button
            onClick={initBalls}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wider rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer"
          >
            Play Again 🔄
          </button>
        </div>
      )}

      {/* PORTRAIT OVERLAY */}
      {isPortrait && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col justify-center items-center z-[99999] p-6 text-center">
          <div className="w-16 h-24 border-4 border-slate-700 rounded-2xl relative mb-6 flex items-center justify-center">
            <div className="w-1 h-1 bg-slate-500 rounded-full absolute bottom-1"></div>
            <span className="text-2xl text-cyan-400 rotate-90 block">🔄</span>
          </div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider mb-2">Landscape Mode Required</h2>
          <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
            Please rotate your mobile device sideways (Horizontal) to get the optimal professional snooker gameplay view.
          </p>
        </div>
      )}

      {/* HUD HEADER */}
      <div className="w-full max-w-[840px] flex justify-between items-center bg-slate-900 border border-slate-700/60 p-2 px-4 rounded-xl shadow-xl mb-2 text-white flex-shrink-0">
        <div className="text-center min-w-[80px]">
          <span className={`text-[9px] uppercase tracking-wider block font-black ${currentTurn === "player1" ? "text-cyan-400 animate-pulse" : "text-neutral-500"}`}>
            {matchId ? (myRole === "player1" ? "You (P1)" : "Opponent (P1)") : "Player 1"}
          </span>
          <p className="text-base font-black font-mono">{scores.player1} <span className="text-[10px] text-neutral-400 font-normal">pts</span></p>
        </div>

        <div className="flex items-center gap-2 bg-black/50 px-4 py-1.5 rounded-lg border border-white/5">
          <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-widest">
            {matchId && !opponentConnected ? "WAITING..." : "TARGET"}
          </span>
          <div
            className="w-5 h-5 rounded-full shadow-md transition-colors duration-200 border border-white/20"
            style={{
              background: `radial-gradient(circle at 6px 6px, #ffffff, ${currentDisplayBallColor} 40%, #000000 100%)`
            }}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center min-w-[80px]">
            <span className={`text-[9px] uppercase tracking-wider block font-black ${currentTurn === "player2" ? "text-pink-400 animate-pulse" : "text-neutral-500"}`}>
              {matchId ? (myRole === "player2" ? "You (P2)" : "Opponent (P2)") : "Player 2"}
            </span>
            <p className="text-base font-black font-mono">{scores.player2} <span className="text-[10px] text-neutral-400 font-normal">pts</span></p>
          </div>
         
          <button
            onClick={handleExit}
            className="pointer-events-auto bg-rose-600 border border-rose-500 hover:bg-rose-500 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all text-white cursor-pointer shadow-md flex items-center gap-1"
          >
            EXIT ❌
          </button>
        </div>
      </div>

      {/* WORKSPACE GRID */}
      <div className="w-full max-w-[860px] flex justify-center items-center gap-2 md:gap-4 flex-1 overflow-hidden">
       
        {/* PULL POWER CONTROLLER */}
        <div className="flex flex-col items-center justify-center bg-slate-900 border border-slate-700/60 px-2 py-4 rounded-xl h-[70vh] max-h-[340px] w-[45px] md:w-[50px] shadow-lg relative flex-shrink-0">
          <span className="text-[7px] font-bold text-neutral-400 uppercase tracking-widest mb-2">PULL</span>
         
          <div className="h-[75%] w-[12px] bg-slate-950 rounded-full border border-slate-800 relative shadow-inner flex items-start justify-center cursor-ns-resize">
            <div
              className="w-full bg-gradient-to-b from-slate-600 via-amber-500 to-red-500 rounded-full absolute top-0 transition-all duration-75"
              style={{ height: `${uiPower}%` }}
            />
            <div
              onPointerDown={handlePowerPointerDown}
              onPointerMove={handlePowerPointerMove}
              onPointerUp={handlePowerPointerUp}
              onPointerCancel={handlePowerPointerUp}
              className={`w-[26px] h-[26px] bg-amber-500 hover:bg-amber-400 border-[3px] border-slate-900 rounded-full absolute shadow-md active:scale-95 transition-transform ${!isMyTurnActive ? 'opacity-30 cursor-not-allowed' : ''}`}
              style={{
                top: `calc(${uiPower}% - 13px)`,
                touchAction: "none"
              }}
            />
          </div>
        </div>

        {/* CANVAS TABLE */}
        <div className="relative flex-1 flex justify-center items-center max-w-[720px] h-full">
          <canvas
            ref={canvasRef}
            width={tableWidth}
            height={tableHeight}
            onPointerDown={handleCanvasInteraction}
            onPointerMove={handleCanvasInteraction}
            onPointerUp={() => { if(isBallInHand && isMyTurnActive) setIsBallInHand(false); }}
            className="w-full h-auto shadow-2xl rounded-xl border-2 border-amber-950 bg-emerald-900 cursor-crosshair max-h-[74vh] object-contain"
          />
          {isBallInHand && isMyTurnActive && (
            <div className="absolute top-2 bg-amber-500/90 text-black font-black text-[9px] md:text-[10px] uppercase px-4 py-1.5 rounded-full pointer-events-none tracking-widest animate-pulse shadow-lg">
              🖐️ PLACE CUE BALL INSIDE D-ZONE
            </div>
          )}
        </div>

        {/* TUNE WHEEL & SPIN CONTROLLER */}
        <div className="flex flex-col items-center justify-between bg-slate-900 border border-slate-700/60 px-2 py-3 rounded-xl h-[70vh] max-h-[340px] w-[45px] md:w-[50px] shadow-lg relative flex-shrink-0">
          <span className="text-[7px] font-bold text-neutral-400 uppercase tracking-widest mb-1">TUNE</span>
         
          <div
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={handleWheelPointerUp}
            onPointerCancel={handleWheelPointerUp}
            className={`h-[65%] w-[30px] rounded-lg border-[3px] border-slate-700 bg-slate-800 overflow-hidden cursor-ns-resize shadow-inner relative transition-opacity ${isBallInHand || isMoving || !isMyTurnActive ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
          >
            <div
              className="absolute inset-0 w-full h-[200%]"
              style={{
                background: "repeating-linear-gradient(to bottom, #334155, #334155 4px, #0f172a 4px, #0f172a 8px)",
                transform: `translateY(${wheelPos % 8}px)`
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70 pointer-events-none" />
          </div>

          <button
            onClick={() => { if(isMyTurnActive) setShowSpinModal(true); }}
            disabled={!isMyTurnActive}
            className={`w-8 h-8 rounded-full bg-slate-800 border-2 border-cyan-400 flex items-center justify-center active:scale-95 transition-all shadow-md relative group mt-1 cursor-pointer ${!isMyTurnActive ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Set Spin / English"
          >
            <div className="w-4 h-4 rounded-full bg-white relative flex items-center justify-center">
              <div
                className="w-1.5 h-1.5 rounded-full bg-red-500 absolute"
                style={{
                  transform: `translate(${spinOffset.x * 3}px, ${-spinOffset.y * 3}px)`
                }}
              />
            </div>
          </button>
        </div>

      </div>

      {/* FOOTER */}
      <div className="w-full max-w-[840px] flex justify-between items-center mt-2 px-1 flex-shrink-0">
        <button
          onClick={initBalls}
          className="ml-auto px-4 py-1 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-neutral-300 text-[9px] font-black uppercase tracking-widest rounded-lg active:scale-95 transition-transform cursor-pointer"
        >
          Reset Match
        </button>
      </div>

    </div>
  );
}