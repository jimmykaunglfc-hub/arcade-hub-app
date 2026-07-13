"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";

// --- ENGINE DIMENSIONS & CONSTANTS ---
const BOARD_SIZE = 1000;
const HOLE_RADIUS = 36;       // Adjusted down for professional scale balance
const STRIKER_RADIUS = 34;    // Proportionate premium feel
const COIN_RADIUS = 22;       // Clear target footprint
const FRICTION = 0.982;       // Highly smooth velvet board glide
const RESTITUTION = 0.85;     // Clean bumper elasticity
const MAX_POWER = 180;        // Secure force capping threshold

type CoinType = "striker" | "white" | "black" | "queen";

interface Coin {
  id: string;
  type: CoinType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  active: boolean;
}

const generateInitialCoins = (): Coin[] => {
  const coins: Coin[] = [];
  const cx = BOARD_SIZE / 2;
  const cy = BOARD_SIZE / 2;
  const R = COIN_RADIUS * 2 + 0.5;
  
  // Striker base init
  coins.push({ id: "striker", type: "striker", x: cx, y: 840, vx: 0, vy: 0, mass: 2.5, radius: STRIKER_RADIUS, active: true });
  
  // Queen Core Center
  coins.push({ id: "queen", type: "queen", x: cx, y: cy, vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true });

  // Concentric Hexagonal Ring Configuration (9 White, 9 Black)
  for (let i = 0; i < 6; i++) {
    const angle = i * (Math.PI / 3);
    coins.push({
      id: `inner_${i}`,
      type: i % 2 === 0 ? "white" : "black",
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true
    });
  }

  for (let i = 0; i < 12; i++) {
    const angle = i * (Math.PI / 6);
    coins.push({
      id: `outer_${i}`,
      type: i % 2 === 0 ? "black" : "white",
      x: cx + (R * 1.9) * Math.cos(angle),
      y: cy + (R * 1.9) * Math.sin(angle),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true
    });
  }
  
  return coins;
};

// 🎨 AUTHENTIC SVG BASELINE DRAWING
const Baseline = ({ transform }: { transform?: string }) => (
  <g transform={transform} stroke="#70411d" strokeWidth="4" fill="none">
    <path d="M 220 820 L 780 820 A 20 20 0 0 1 780 860 L 220 860 A 20 20 0 0 1 220 820 Z" />
    <circle cx="220" cy="840" r="16" fill="#ebd097" />
    <circle cx="780" cy="840" r="16" fill="#ebd097" />
    <circle cx="220" cy="840" r="8" fill="#70411d" />
    <circle cx="780" cy="840" r="8" fill="#70411d" />
  </g>
);

export default function Carrom({ 
  onClose, 
  preloadedMatchId 
}: { 
  onClose: () => void;
  preloadedMatchId?: string | null;
}) {
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online">(preloadedMatchId ? "join" : "menu");
  const [matchId, setMatchId] = useState("");
  const [roomCode, setRoomCode] = useState(""); 
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false); 
  
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<1 | 2>(1);
  const [turn, setTurn] = useState<1 | 2>(1);
  
  // Rule System Points Setup
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [showRules, setShowRules] = useState(false);

  // Mechanical Core States
  const coinsRef = useRef<Coin[]>(generateInitialCoins());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const isMovingRef = useRef(false);
  const [strikerBaselinePos, setStrikerBaselinePos] = useState(500); // Horizontal slider track
  
  // Vector Aiming States
  const [isAiming, setIsAiming] = useState(false);
  const [aimVector, setAimVector] = useState({ x: 0, y: 0 });
  const boardRef = useRef<SVGSVGElement>(null);

  const confettiPieces = useMemo(() => {
    const colors = ['#f59e0b', '#10b981', '#4f46e5', '#ec4899', '#3b82f6'];
    return Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      duration: `${1.8 + Math.random() * 2}s`,
      delay: `${Math.random() * 1}s`,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null));
  }, []);

  // Sync Slider State directly with Striker entity coordinates prior to physics execution
  useEffect(() => {
    if (isMovingRef.current) return;
    const striker = coinsRef.current.find(c => c.type === "striker");
    if (striker) {
      striker.x = strikerBaselinePos;
      striker.y = turn === 1 ? 840 : 160;
      setRenderTrigger(prev => prev + 1);
    }
  }, [strikerBaselinePos, turn]);

  // 📡 MULTIPLAYER REAL-TIME WIRE
  useEffect(() => {
    if (playMode !== "online" && playMode !== "host") return;
    if (!matchId) return;

    const channel = supabase.channel(`carrom_${matchId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'shot_fired' }, (payload) => {
        const { vx, vy, startX } = payload.payload;
        const striker = coinsRef.current.find(c => c.type === "striker");
        if (striker) {
          striker.x = startX;
          striker.y = turn === 1 ? 840 : 160;
          striker.vx = vx;
          striker.vy = vy;
          isMovingRef.current = true;
          requestAnimationFrame(physicsLoop);
        }
      })
      .on('broadcast', { event: 'turn_sync' }, (payload) => {
        const { coins, nextTurn, p1S, p2S, win } = payload.payload;
        coinsRef.current = coins;
        setTurn(nextTurn);
        setP1Score(p1S);
        setP2Score(p2S);
        setWinner(win);
        setStrikerBaselinePos(500);
        setRenderTrigger(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId, playMode]);

  const hostMatch = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMatchId(code); setRoomCode(code); setMyPlayerRole(1); setPlayMode("host");
  };

  const joinMatch = () => {
    setMatchId(joinCode.toUpperCase()); setMyPlayerRole(2); setPlayMode("online");
  };

  // --- 2D VECTOR MATH COLLISION PHYSICS ---
  const physicsLoop = () => {
    let moving = false;
    const coins = coinsRef.current;

    for (let i = 0; i < coins.length; i++) {
      let c1 = coins[i];
      if (!c1.active) continue;

      c1.x += c1.vx;
      c1.y += c1.vy;
      c1.vx *= FRICTION;
      c1.vy *= FRICTION;

      if (Math.abs(c1.vx) > 0.08 || Math.abs(c1.vy) > 0.08) moving = true;
      else { c1.vx = 0; c1.vy = 0; }

      // Wall Inset Bounds Verification
      if (c1.x - c1.radius < 0) { c1.x = c1.radius; c1.vx *= -RESTITUTION; }
      if (c1.x + c1.radius > BOARD_SIZE) { c1.x = BOARD_SIZE - c1.radius; c1.vx *= -RESTITUTION; }
      if (c1.y - c1.radius < 0) { c1.y = c1.radius; c1.vy *= -RESTITUTION; }
      if (c1.y + c1.radius > BOARD_SIZE) { c1.y = BOARD_SIZE - c1.radius; c1.vy *= -RESTITUTION; }

      // Precision Pocket Coordinate Drop Checks
      const pockets = [
        {x: 64, y: 64}, {x: BOARD_SIZE - 64, y: 64}, 
        {x: 64, y: BOARD_SIZE - 64}, {x: BOARD_SIZE - 64, y: BOARD_SIZE - 64}
      ];
      
      for (const p of pockets) {
        const dist = Math.hypot(c1.x - p.x, c1.y - p.y);
        if (dist < HOLE_RADIUS + 4) {
          if (c1.type === "striker") {
            c1.vx = 0; c1.vy = 0;
            c1.x = 500;
            c1.y = turn === 1 ? 840 : 160; 
          } else {
            c1.active = false;
          }
        }
      }

      // Sphere-to-Sphere Elastic Momentum Exchanges
      for (let j = i + 1; j < coins.length; j++) {
        let c2 = coins[j];
        if (!c2.active) continue;

        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = c1.radius + c2.radius;

        if (dist < minDist) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          c1.x -= nx * (overlap / 2);
          c1.y -= ny * (overlap / 2);
          c2.x += nx * (overlap / 2);
          c2.y += ny * (overlap / 2);

          const kx = c1.vx - c2.vx;
          const ky = c1.vy - c2.vy;
          const p = 2 * (nx * kx + ny * ky) / (c1.mass + c2.mass);
          
          c1.vx -= p * c2.mass * nx * RESTITUTION;
          c1.vy -= p * c2.mass * ny * RESTITUTION;
          c2.vx += p * c1.mass * nx * RESTITUTION;
          c2.vy += p * c1.mass * ny * RESTITUTION;
        }
      }
    }

    setRenderTrigger(prev => prev + 1);

    if (moving) {
      requestAnimationFrame(physicsLoop);
    } else {
      isMovingRef.current = false;
      evaluateTurnEnd();
    }
  };

  const evaluateTurnEnd = () => {
    let p1Points = 0;
    let p2Points = 0;
    let whitesLeft = 0;
    let blacksLeft = 0;

    coinsRef.current.forEach(c => {
      if (!c.active) {
        if (c.type === "white") p1Points += 10;
        if (c.type === "black") p2Points += 10;
        if (c.type === "queen") {
          if (turn === 1) p1Points += 30; else p2Points += 30;
        }
      } else {
        if (c.type === "white") whitesLeft++;
        if (c.type === "black") blacksLeft++;
      }
    });

    let nextTurn = turn === 1 ? 2 : 1 as 1 | 2;
    let win: 1 | 2 | null = null;

    if (whitesLeft === 0) win = 1;
    if (blacksLeft === 0) win = 2;

    // Reposition back safely to baseline center limits
    setStrikerBaselinePos(500);
    const striker = coinsRef.current.find(c => c.type === "striker");
    if (striker) {
      striker.vx = 0; striker.vy = 0;
      striker.x = 500;
      striker.y = nextTurn === 1 ? 840 : 160;
    }

    if (playMode === "online" && turn === myPlayerRole) {
       supabase.channel(`carrom_${matchId}`).send({
          type: 'broadcast', event: 'turn_sync', 
          payload: { coins: coinsRef.current, nextTurn, p1S: p1Points, p2S: p2Points, win }
       });
    }

    setTurn(nextTurn);
    setP1Score(p1Points);
    setP2Score(p2Points);
    setWinner(win);
  };

  // --- CONTROLLER EVENTS ---
  const handlePointerDown = (e: React.PointerEvent, coinId: string) => {
    if (coinId !== "striker" || isMovingRef.current || winner) return;
    if (playMode === "online" && turn !== myPlayerRole) return;
    setIsAiming(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming || !boardRef.current) return;
    const pt = boardRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgP = pt.matrixTransform(boardRef.current.getScreenCTM()?.inverse());
    
    const striker = coinsRef.current.find(c => c.type === "striker")!;
    let dx = striker.x - svgP.x;
    let dy = striker.y - svgP.y;

    // Apply strict force capping vectors
    const distance = Math.hypot(dx, dy);
    if (distance > MAX_POWER) {
      dx = (dx / distance) * MAX_POWER;
      dy = (dy / distance) * MAX_POWER;
    }

    setAimVector({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!isAiming) return;
    setIsAiming(false);
    
    const powerMultiplier = 0.16;
    const vx = aimVector.x * powerMultiplier;
    const vy = aimVector.y * powerMultiplier;
    
    if (Math.hypot(vx, vy) < 1.5) return;

    const striker = coinsRef.current.find(c => c.type === "striker");
    if (striker) {
      striker.vx = vx;
      striker.vy = vy;
      isMovingRef.current = true;
      
      if (playMode === "online") {
        supabase.channel(`carrom_${matchId}`).send({
          type: 'broadcast', event: 'shot_fired', payload: { vx, vy, startX: striker.x }
        });
      }
      
      requestAnimationFrame(physicsLoop);
    }
    setAimVector({ x: 0, y: 0 });
  };

  const handleRematch = () => {
    coinsRef.current = generateInitialCoins();
    setWinner(null);
    setTurn(1);
    setStrikerBaselinePos(500);
    setP1Score(0);
    setP2Score(0);
    setRenderTrigger(prev => prev + 1);
  };

  // 🧭 PERSPECTIVE LOGIC: Flipped match orientation occurs exclusively for P2 in Online environments
  const shouldFlipBoard = playMode === "online" && myPlayerRole === 2;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors select-none">
      
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg) scale(0.7); opacity: 0; }
        }
      `}</style>

      {/* 🛡️ ARENA LOBBY PANEL */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-neutral-100/90 dark:bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 rounded-[2.5rem] p-6 w-full max-w-sm shadow-2xl flex flex-col gap-6 relative overflow-hidden">
            <div className="text-center pt-2">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-2xl flex items-center justify-center mb-3 shadow-md">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>radio_button_checked</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight">Carrom Arena</h2>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1">Multiplayer System Ready</p>
            </div>
            
            <div className="space-y-3">
              <button onClick={hostMatch} className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs uppercase tracking-wider rounded-2xl active:scale-95 shadow-md">Host Network Match</button>
              <button onClick={() => setPlayMode("local")} className="w-full h-14 bg-neutral-50 dark:bg-neutral-800 font-bold text-xs uppercase tracking-wider rounded-2xl border border-neutral-200 dark:border-neutral-700 active:scale-95">Local Pass & Play</button>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded-[1.25rem] border border-neutral-200 dark:border-neutral-800 flex items-center">
              <input type="text" maxLength={6} placeholder="CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} className="flex-1 bg-transparent text-center text-lg font-black tracking-widest focus:outline-none uppercase"/>
              <button onClick={joinMatch} disabled={joinCode.length < 6} className="h-11 px-6 bg-neutral-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase rounded-xl disabled:opacity-50">Join</button>
            </div>

            <button onClick={onClose} className="w-full py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Exit Arena</button>
          </div>
        </div>
      )}

      {/* ⚔️ GENERAL HUB HEADER */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-30 shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center active:scale-90 shadow-sm">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Carrom Matrix</h1>
          <span className={`text-[9px] font-bold uppercase tracking-widest ${playMode === "online" ? "text-emerald-500 animate-pulse" : "text-neutral-400"}`}>
            {playMode === "online" ? "● Live Network" : "Local Mode"}
          </span>
        </div>
        <button onClick={() => setShowRules(true)} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500">
          <span className="material-symbols-outlined text-lg">info</span>
        </button>
      </div>

      {/* RULES INFO OVERLAY MODAL */}
      {showRules && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-xl">
            <h3 className="text-base font-black uppercase tracking-wider">Carrom Guidelines</h3>
            <ul className="text-left text-xs space-y-2 text-neutral-600 dark:text-neutral-400 font-medium">
              <li>🔸 White Coins Pocketed = +10 Points (P1 targets White)</li>
              <li>🔸 Black Coins Pocketed = +10 Points (P2 targets Black)</li>
              <li>🔸 Sinking the Red Queen yields +30 Points.</li>
              <li>🔸 Adjust the slider baseline before dragging the striker back to aim and trigger a shot.</li>
            </ul>
            <button onClick={() => setShowRules(false)} className="w-full py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-xl">Got It</button>
          </div>
        </div>
      )}

      {/* 🎮 SCOREBOARD DISPLAY HUGS ENGINE VIEW */}
      {(playMode === "local" || playMode === "online") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col justify-start min-h-0 relative z-10 px-4">
          
          <div className="py-4 flex justify-between items-center shrink-0 w-full">
            <div className={`flex flex-col items-center transition-all ${turn === 2 ? "scale-105" : "opacity-50"}`}>
              <span className="text-xs font-black text-neutral-900 dark:text-white">{p2Score} PTS</span>
              <div className="w-11 h-11 rounded-full bg-neutral-950 border-2 border-neutral-800 flex items-center justify-center mt-1 text-white text-xs font-bold shadow-md">P2</div>
            </div>
            
            <div className="px-4 py-1.5 bg-white dark:bg-neutral-900 rounded-full shadow-sm border border-neutral-200 dark:border-neutral-800 text-[9px] font-black uppercase tracking-widest text-neutral-800 dark:text-neutral-200">
              {playMode === "online" ? (turn === myPlayerRole ? "Your Shot" : "Opponent Turn") : `Player ${turn} Turn`}
            </div>

            <div className={`flex flex-col items-center transition-all ${turn === 1 ? "scale-105" : "opacity-50"}`}>
              <span className="text-xs font-black text-neutral-900 dark:text-white">{p1Score} PTS</span>
              <div className="w-11 h-11 rounded-full bg-[#f4ebd4] border-2 border-[#d6c7b0] flex items-center justify-center mt-1 text-[#6b5f4c] text-xs font-bold shadow-md">P1</div>
            </div>
          </div>

          {/* 🎯 INTEGRATED CARROM STAGE FRAME (CONTAINED TO AVOID BOTTOM CUTTING) */}
          <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0 pb-4">
            
            {/* WINS CELEBRATION BOX OVERLAY */}
            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-md rounded-[2rem]"></div>
                
                {confettiPieces.map(p => (
                  <div key={p.id} className="absolute top-0 z-[60]" style={{
                    left: p.left, width: '7px', height: '15px', backgroundColor: p.color, borderRadius: '3px',
                    animation: `confetti-fall ${p.duration} linear ${p.delay} infinite`
                  }} />
                ))}

                <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full shadow-2xl flex flex-col items-center text-center z-50 animate-scale-up">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 text-white flex items-center justify-center mb-4 shadow-lg border-4 border-amber-200 dark:border-yellow-900 animate-bounce">
                    <span className="material-symbols-outlined text-3xl">emoji_events</span>
                  </div>
                  <h3 className="text-[10px] font-black text-amber-500 tracking-widest uppercase mb-1">Victory Sequence</h3>
                  <h2 className="text-3xl font-black tracking-tight uppercase">Arena Cleared!</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-3 px-2 leading-relaxed">
                    {playMode === "online" ? (winner === myPlayerRole ? "Incredible skill! You claimed complete server victory." : "The opponent cleared the board.") : `Player ${winner} has completely pocketed their target roster!`}
                  </p>
                  
                  <div className="w-full flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase rounded-xl active:scale-95 transition-all shadow-sm">Exit</button>
                    <button onClick={handleRematch} className="flex-1 py-3 bg-amber-500 text-white font-bold text-xs uppercase rounded-xl active:scale-95 transition-all shadow-md hover:bg-amber-600">Play Next</button>
                  </div>
                </div>
              </div>
            )}

            {/* CASINO-GRADE RESPONSIVE CARROM FRAME */}
            <div 
              className="w-full max-w-[92vw] aspect-square rounded-[2rem] p-2.5 shadow-2xl relative select-none touch-none flex items-center justify-center border-[14px] border-[#3e1f0e]"
              style={{ backgroundColor: '#2d1606' }} 
            >
              {/* Gold Plated Metallic Corner Mounts */}
              <div className="absolute top-0 left-0 w-8 h-10 border-t-[6px] border-l-[6px] border-amber-500/80 rounded-tl-lg pointer-events-none" />
              <div className="absolute top-0 right-0 w-8 h-10 border-t-[6px] border-r-[6px] border-amber-500/80 rounded-tr-lg pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-8 h-10 border-b-[6px] border-l-[6px] border-amber-500/80 rounded-bl-lg pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-8 h-10 border-b-[6px] border-r-[6px] border-amber-500/80 rounded-br-lg pointer-events-none" />

              <svg 
                ref={boardRef}
                viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} 
                className={`w-full h-full rounded-xl shadow-inner transition-transform duration-500 ${shouldFlipBoard ? "rotate-180" : "rotate-0"}`}
                style={{ backgroundColor: '#ebd097' }} 
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <defs>
                  <filter id="c-shadow">
                    <feDropShadow dx="2" dy="4" stdDeviation="3" floodOpacity="0.4" />
                  </filter>
                  <radialGradient id="vWhite" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#dfd0bd" />
                  </radialGradient>
                  <radialGradient id="vBlack" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#4d4d4d" />
                    <stop offset="100%" stopColor="#141414" />
                  </radialGradient>
                  <radialGradient id="vRed" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#ff5959" />
                    <stop offset="100%" stopColor="#ba0000" />
                  </radialGradient>
                  <radialGradient id="vStriker" cx="35%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#f7f9fa" />
                    <stop offset="70%" stopColor="#e1e6eb" />
                    <stop offset="100%" stopColor="#b5bec4" />
                  </radialGradient>
                </defs>

                {/* 4 Boundary Pockets */}
                <circle cx="65" cy="64" r={HOLE_RADIUS} fill="#180f08" />
                <circle cx={BOARD_SIZE-65} cy="64" r={HOLE_RADIUS} fill="#180f08" />
                <circle cx="65" cy={BOARD_SIZE-64} r={HOLE_RADIUS} fill="#180f08" />
                <circle cx={BOARD_SIZE-65} cy={BOARD_SIZE-64} r={HOLE_RADIUS} fill="#180f08" />

                {/* Concentric Center Graphics */}
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="160" fill="none" stroke="#70411d" strokeWidth="4" />
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="148" fill="none" stroke="#70411d" strokeWidth="1.5" />
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="26" fill="none" stroke="#70411d" strokeWidth="3" />

                {/* 4 Tournament Guideline Tracks */}
                <Baseline />
                <Baseline transform={`rotate(90 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />
                <Baseline transform={`rotate(180 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />
                <Baseline transform={`rotate(270 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />

                {/* Vector Aiming Indicator Dash Overlay */}
                {isAiming && (
                  <line 
                    x1={coinsRef.current.find(c=>c.type==="striker")?.x} 
                    y1={coinsRef.current.find(c=>c.type==="striker")?.y} 
                    x2={(coinsRef.current.find(c=>c.type==="striker")?.x || 0) + aimVector.x} 
                    y2={(coinsRef.current.find(c=>c.type==="striker")?.y || 0) + aimVector.y} 
                    stroke="#4f46e5" strokeWidth="6" strokeDasharray="10 10" strokeLinecap="round"
                  />
                )}

                {/* Active Playing Pieces Render */}
                {coinsRef.current.map(coin => {
                  if (!coin.active) return null;
                  
                  let fillMat = ""; let edgeStroke = ""; let interiorRing = "";
                  if (coin.type === "striker") { fillMat = "url(#vStriker)"; edgeStroke = "#8695a0"; interiorRing = "#61737e"; }
                  if (coin.type === "queen") { fillMat = "url(#vRed)"; edgeStroke = "#801515"; interiorRing = "#5c0b0b"; }
                  if (coin.type === "white") { fillMat = "url(#vWhite)"; edgeStroke = "#bdae98"; interiorRing = "#968875"; }
                  if (coin.type === "black") { fillMat = "url(#vBlack)"; edgeStroke = "#0a0a0a"; interiorRing = "#333333"; }

                  return (
                    <g key={coin.id} transform={`translate(${coin.x}, ${coin.y})`} filter="url(#c-shadow)">
                      <circle 
                        r={coin.radius} 
                        fill={fillMat} 
                        stroke={edgeStroke} 
                        strokeWidth="1.5"
                        onPointerDown={(e) => handlePointerDown(e, coin.id)}
                        className={coin.type === "striker" && !isMovingRef.current && ((playMode === "online" && turn === myPlayerRole) || playMode !== "online") ? "cursor-grab active:cursor-grabbing" : ""}
                      />
                      <circle r={coin.radius * 0.68} fill="none" stroke={interiorRing} strokeWidth="1.5" opacity="0.6" pointerEvents="none" />
                      <circle r={coin.radius * 0.36} fill="none" stroke={interiorRing} strokeWidth="1" opacity="0.5" pointerEvents="none" />
                      {coin.type === "striker" && (
                         <circle r="6" fill="#ef4444" opacity="0.7" pointerEvents="none"/>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 🎚️ FIXED BASELINE SLIDER ACTION CONTROLLER */}
            <div className="w-full max-w-[88vw] mt-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-3 rounded-2xl shadow-sm shrink-0 flex flex-col gap-1.5">
              <div className="flex justify-between items-center px-1">
                <span className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Striker Adjustment Track</span>
                <span className="text-[9px] font-bold px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-md border border-neutral-200/50 dark:border-neutral-700/50">
                  X: {Math.round(strikerBaselinePos)}
                </span>
              </div>
              <input 
                type="range" 
                min={240} 
                max={760} 
                step={2}
                value={strikerBaselinePos}
                disabled={isMovingRef.current || !!winner || (playMode === "online" && turn !== myPlayerRole)}
                onChange={(e) => setStrikerBaselinePos(Number(e.target.value))}
                className="w-full h-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

          </div>
        </div>
      )}
    </div>
  );
}