"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";

// --- PHYSICS & GAME CONSTANTS ---
const BOARD_SIZE = 1000;
const HOLE_RADIUS = 55;
const STRIKER_RADIUS = 36;
const COIN_RADIUS = 24;
const FRICTION = 0.985;
const RESTITUTION = 0.8; // Bounciness

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

// 📐 PRECISION HEXAGONAL PACKING FOR 19 CARROM COINS
const generateInitialCoins = (): Coin[] => {
  const coins: Coin[] = [];
  const cx = BOARD_SIZE / 2;
  const cy = BOARD_SIZE / 2;
  const R = COIN_RADIUS * 2 + 0.5; // Distance between coin centers
  
  // 1. Striker (Placed on the bottom baseline)
  coins.push({ id: "striker", type: "striker", x: cx, y: 840, vx: 0, vy: 0, mass: 2, radius: STRIKER_RADIUS, active: true });
  
  // 2. Queen (Center)
  coins.push({ id: "queen", type: "queen", x: cx, y: cy, vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true });

  // 3. Inner Ring (6 Coins: Alternating W/B)
  for (let i = 0; i < 6; i++) {
    const angle = i * (Math.PI / 3);
    coins.push({
      id: `r1_${i}`,
      type: i % 2 === 0 ? "white" : "black",
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true
    });
  }

  // 4. Outer Ring (12 Coins: Corners and Edges)
  for (let i = 0; i < 6; i++) {
    // Corners of the hexagon
    const angleC = i * (Math.PI / 3);
    coins.push({
      id: `r2_c_${i}`,
      type: i % 2 === 0 ? "black" : "white",
      x: cx + (2 * R) * Math.cos(angleC),
      y: cy + (2 * R) * Math.sin(angleC),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true
    });
    
    // Edges of the hexagon
    const angleE = i * (Math.PI / 3) + (Math.PI / 6);
    const R3 = Math.sqrt(3) * R;
    coins.push({
      id: `r2_e_${i}`,
      type: i % 2 === 0 ? "white" : "black",
      x: cx + R3 * Math.cos(angleE),
      y: cy + R3 * Math.sin(angleE),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true
    });
  }
  
  return coins;
};

// 🎨 AUTHENTIC SVG BASELINE DRAWING
const Baseline = ({ transform }: { transform?: string }) => (
  <g transform={transform} stroke="#794420" strokeWidth="4" fill="none">
    <path d="M 220 820 L 780 820 A 20 20 0 0 1 780 860 L 220 860 A 20 20 0 0 1 220 820 Z" />
    <circle cx="220" cy="840" r="16" fill="#e6c387" />
    <circle cx="780" cy="840" r="16" fill="#e6c387" />
    <circle cx="220" cy="840" r="8" fill="#794420" />
    <circle cx="780" cy="840" r="8" fill="#794420" />
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
  
  // Scoring
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [winner, setWinner] = useState<1 | 2 | null>(null);

  // Physics State
  const coinsRef = useRef<Coin[]>(generateInitialCoins());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const isMovingRef = useRef(false);
  
  // Interaction State
  const [isAiming, setIsAiming] = useState(false);
  const [aimVector, setAimVector] = useState({ x: 0, y: 0 });
  const boardRef = useRef<SVGSVGElement>(null);

  // 🎉 Celebration Confetti Generator
  const confettiPieces = useMemo(() => {
    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'];
    return Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animDuration: `${2 + Math.random() * 3}s`,
      animDelay: `${Math.random() * 1.5}s`,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null));
  }, []);

  // 📡 REAL-TIME SYNCHRONIZATION
  useEffect(() => {
    if (playMode !== "online" && playMode !== "host") return;
    if (!matchId) return;

    const channel = supabase.channel(`carrom_${matchId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'shot_fired' }, (payload) => {
        const { vx, vy } = payload.payload;
        const striker = coinsRef.current.find(c => c.type === "striker");
        if (striker) {
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

  // --- PHYSICS ENGINE ---
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

      if (Math.abs(c1.vx) > 0.1 || Math.abs(c1.vy) > 0.1) moving = true;
      else { c1.vx = 0; c1.vy = 0; }

      // Wall Bounces
      if (c1.x - c1.radius < 0) { c1.x = c1.radius; c1.vx *= -RESTITUTION; }
      if (c1.x + c1.radius > BOARD_SIZE) { c1.x = BOARD_SIZE - c1.radius; c1.vx *= -RESTITUTION; }
      if (c1.y - c1.radius < 0) { c1.y = c1.radius; c1.vy *= -RESTITUTION; }
      if (c1.y + c1.radius > BOARD_SIZE) { c1.y = BOARD_SIZE - c1.radius; c1.vy *= -RESTITUTION; }

      // Pocket Detection
      const pockets = [
        {x: 45, y: 45}, {x: BOARD_SIZE - 45, y: 45}, 
        {x: 45, y: BOARD_SIZE - 45}, {x: BOARD_SIZE - 45, y: BOARD_SIZE - 45}
      ];
      
      for (const p of pockets) {
        const dist = Math.hypot(c1.x - p.x, c1.y - p.y);
        if (dist < HOLE_RADIUS) {
          if (c1.type === "striker") {
            c1.vx = 0; c1.vy = 0;
            c1.x = BOARD_SIZE / 2;
            c1.y = turn === 1 ? 840 : 160; 
          } else {
            c1.active = false;
          }
        }
      }

      // Coin Collisions
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
        if (c.type === "white") p1Points++;
        if (c.type === "black") p2Points++;
        if (c.type === "queen") {
            if (turn === 1) p1Points += 3; else p2Points += 3;
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

    const striker = coinsRef.current.find(c => c.type === "striker");
    if (striker) {
      striker.x = BOARD_SIZE / 2;
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
    const dx = striker.x - svgP.x;
    const dy = striker.y - svgP.y;
    setAimVector({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!isAiming) return;
    setIsAiming(false);
    
    const powerMultiplier = 0.15;
    const vx = aimVector.x * powerMultiplier;
    const vy = aimVector.y * powerMultiplier;
    
    if (Math.hypot(vx, vy) < 2) return;

    const striker = coinsRef.current.find(c => c.type === "striker");
    if (striker) {
      striker.vx = vx;
      striker.vy = vy;
      isMovingRef.current = true;
      
      if (playMode === "online") {
        supabase.channel(`carrom_${matchId}`).send({
          type: 'broadcast', event: 'shot_fired', payload: { vx, vy }
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
    setRenderTrigger(prev => prev + 1);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 🧭 FIXED: Board ONLY flips in Online Mode when you are Player 2.
  const shouldFlipBoard = playMode === "online" && myPlayerRole === 2;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors">
      
      {/* 🎊 CELEBRATION CONFETTI CSS */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg) scale(0.8); opacity: 0; }
        }
      `}</style>

      {/* 🛡️ MENU LOBBY */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-neutral-100/90 dark:bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 rounded-[2.5rem] p-6 w-full max-w-sm shadow-[0_20px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.4)] flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/10 dark:bg-amber-500/20 blur-3xl rounded-full pointer-events-none"></div>

            <div className="text-center pt-2 relative z-10">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/40 dark:to-amber-800/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center border border-amber-200/50 dark:border-amber-700/50 mb-3 shadow-[0_8px_16px_rgba(245,158,11,0.15)]">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>radio_button_checked</span>
              </div>
              <h2 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">Carrom Arena</h2>
              <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mt-1">Physics Engine Initialized</p>
            </div>
            
            <div className="space-y-3 relative z-10">
              <button onClick={hostMatch} className="group w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between px-5 rounded-2xl hover:opacity-90 transition-all active:scale-[0.98] shadow-[0_8px_20px_rgba(245,158,11,0.25)] border border-amber-400/50 dark:border-amber-400/20">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-100">language</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-white">Host Network Match</span>
                </div>
                <span className="material-symbols-outlined text-amber-200 group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>

              <button onClick={() => setPlayMode("local")} className="group w-full h-14 bg-neutral-50 dark:bg-neutral-800 flex items-center justify-between px-5 rounded-2xl border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all active:scale-[0.98] shadow-sm text-neutral-800 dark:text-neutral-200">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500">group</span>
                  <span className="font-bold text-xs uppercase tracking-wider">Local Pass & Play</span>
                </div>
                <span className="material-symbols-outlined text-neutral-400 dark:text-neutral-500 group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>
            </div>

            <div className="flex items-center gap-3 relative z-10">
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800"></div>
              <span className="text-[9px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">Or Join Room</span>
              <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800"></div>
            </div>
            
            <div className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded-[1.25rem] border border-neutral-200 dark:border-neutral-800 flex items-center shadow-inner relative z-10">
              <input type="text" maxLength={6} placeholder="CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} className="flex-1 bg-transparent text-center text-lg font-black tracking-[0.3em] placeholder-neutral-300 dark:placeholder-neutral-700 text-neutral-900 dark:text-white focus:outline-none uppercase"/>
              <button onClick={joinMatch} disabled={joinCode.length < 6} className={`h-11 px-6 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm ${joinCode.length === 6 ? "bg-neutral-900 dark:bg-white text-white dark:text-black hover:scale-[1.02] active:scale-95 cursor-pointer" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed border border-transparent"}`}>Join</button>
            </div>

            <div className="pt-2 relative z-10">
              <button onClick={onClose} className="w-full flex items-center justify-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500 font-bold uppercase tracking-widest hover:text-neutral-900 dark:hover:text-white transition-colors py-2">
                <span className="material-symbols-outlined text-sm">exit_to_app</span>
                Exit Arena
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚔️ HEADER HUD */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-30 shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 active:scale-90 transition-all shadow-sm">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Carrom Matrix</h1>
          <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 mt-0.5 ${playMode === "online" ? "text-emerald-500" : playMode === "host" || playMode === "join" ? "text-amber-500" : "text-neutral-400"}`}>
            {(playMode === "online" || playMode === "host" || playMode === "join") && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>}
            {playMode === "online" ? "Live Network" : playMode === "host" || playMode === "join" ? "Connecting..." : "Local Mode"}
          </span>
        </div>
        <div className="w-10" /> 
      </div>

      {/* --- HOSTING / JOINING WAITING SCREEN --- */}
      {(playMode === "host" || playMode === "join") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 relative">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-8 w-full shadow-[0_20px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.3)] flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/10 dark:bg-amber-500/20 blur-3xl rounded-full pointer-events-none"></div>
            <div className="w-16 h-16 rounded-full border-[3px] border-amber-100 dark:border-amber-900/30 border-t-amber-500 dark:border-t-amber-500 animate-spin mb-6 relative z-10"></div>
            <h2 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight uppercase relative z-10">
              {playMode === "join" ? "Syncing Matrix..." : "Awaiting Opponent"}
            </h2>
            
            {playMode === "host" && (
              <div className="mt-8 w-full relative z-10">
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-bold uppercase tracking-widest mb-2">Share This Room Code</p>
                <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 p-2.5 rounded-2xl flex items-center justify-between shadow-inner">
                  <span className="text-amber-600 dark:text-amber-400 font-mono text-2xl font-black tracking-[0.25em] pl-4 pt-1">{roomCode}</span>
                  <button 
                    onClick={handleCopyCode}
                    className={`h-11 px-5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                      copied 
                        ? "bg-emerald-500 text-white" 
                        : "bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:scale-[1.02] active:scale-95"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <button onClick={() => playMode === "host" ? setPlayMode("menu") : onClose()} className="w-full mt-8 py-3.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 relative z-10">
              Cancel Match
            </button>
          </div>
        </div>
      )}

      {/* 🎮 SCOREBOARD & BOARD */}
      {(playMode === "local" || playMode === "online") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col justify-start min-h-0 relative z-10">
          
          <div className="px-6 py-4 flex justify-between items-center shrink-0">
            <div className={`flex flex-col items-center transition-all ${turn === 2 ? "scale-105" : "opacity-60"}`}>
              <span className="text-xs font-black text-neutral-900 dark:text-white">{p2Score} PTS</span>
              <div className="w-10 h-10 rounded-full bg-neutral-900 border-2 border-neutral-700 flex items-center justify-center mt-1 text-white text-xs font-bold shadow-md">P2</div>
            </div>
            
            <div className="px-4 py-2 bg-white dark:bg-neutral-900 rounded-full shadow-sm border border-neutral-200 dark:border-neutral-800 text-[10px] font-black uppercase tracking-widest">
              {playMode === "online" ? (turn === myPlayerRole ? "Your Shot" : "Opponent Aiming") : `Player ${turn} Shot`}
            </div>

            <div className={`flex flex-col items-center transition-all ${turn === 1 ? "scale-105" : "opacity-60"}`}>
              <span className="text-xs font-black text-neutral-900 dark:text-white">{p1Score} PTS</span>
              <div className="w-10 h-10 rounded-full bg-[#f3ead3] border-2 border-[#dccfb4] flex items-center justify-center mt-1 text-[#8a7f6b] text-xs font-bold shadow-md">P1</div>
            </div>
          </div>

          <div className="flex-1 w-full flex items-center justify-center px-4 pb-6 min-h-0 relative">
            
            {/* 🎉 VICTORY CELEBRATION DIALOG */}
            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in overflow-hidden">
                <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-md rounded-[2.5rem]"></div>
                
                {confettiPieces.map(p => (
                  <div key={p.id} className="absolute top-0 z-[60] pointer-events-none" style={{
                    left: p.left, width: '6px', height: '14px', backgroundColor: p.color, borderRadius: '4px',
                    animation: `confetti-fall ${p.animDuration} linear ${p.animDelay} infinite`,
                  }} />
                ))}

                <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full shadow-[0_20px_40px_rgba(0,0,0,0.2)] flex flex-col items-center text-center z-50">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center mb-5 shadow-[0_4px_20px_rgba(245,158,11,0.4)] border-4 border-amber-200 dark:border-amber-900 animate-bounce">
                    <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
                  </div>
                  <h3 className="text-[10px] font-black text-amber-600 dark:text-amber-400 tracking-widest uppercase mb-1">Match Concluded</h3>
                  <h2 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight uppercase">Congratulations!</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium mt-3">
                    {playMode === "online" ? (winner === myPlayerRole ? "You cleared the board!" : "Your opponent won this round.") : `Player ${winner} has completely dominated the board.`}
                  </p>
                  
                  <div className="w-full flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-sm">Exit Arena</button>
                    <button onClick={handleRematch} className="flex-1 py-3.5 bg-amber-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-[0_4px_15px_rgba(245,158,11,0.3)] hover:bg-amber-600">Play Again</button>
                  </div>
                </div>
              </div>
            )}

            {/* 🎯 THE REALISTIC SVG PHYSICS BOARD */}
            <div 
              className="w-full max-h-full aspect-square rounded-[2rem] p-3 shadow-2xl relative overflow-hidden select-none touch-none"
              style={{ backgroundColor: '#2d1606', border: '16px solid #3e1f0e' }} // Authentic Thick Wood Frame
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              
              {/* Metallic Gold Corners */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-8 border-l-8 border-yellow-500/80 rounded-tl-xl z-10 shadow-lg pointer-events-none" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-8 border-r-8 border-yellow-500/80 rounded-tr-xl z-10 shadow-lg pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-8 border-l-8 border-yellow-500/80 rounded-bl-xl z-10 shadow-lg pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-8 border-r-8 border-yellow-500/80 rounded-br-xl z-10 shadow-lg pointer-events-none" />

              <svg 
                ref={boardRef}
                viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} 
                className={`w-full h-full rounded-lg shadow-inner transition-transform duration-500 ${shouldFlipBoard ? "rotate-180" : "rotate-0"}`}
                style={{ backgroundColor: '#e6c387' }} // Light Birch Wood Center
              >
                <defs>
                  <filter id="shadow">
                    <feDropShadow dx="3" dy="5" stdDeviation="4" floodOpacity="0.4" />
                  </filter>
                  <radialGradient id="gradWhite" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#e2d5c3" />
                  </radialGradient>
                  <radialGradient id="gradBlack" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#444444" />
                    <stop offset="100%" stopColor="#111111" />
                  </radialGradient>
                  <radialGradient id="gradRed" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#ff6b6b" />
                    <stop offset="100%" stopColor="#cc0000" />
                  </radialGradient>
                  <radialGradient id="gradStriker" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#fdfdfd" />
                    <stop offset="100%" stopColor="#d8ccb8" />
                  </radialGradient>
                </defs>

                {/* 4 Corner Pockets */}
                <circle cx="45" cy="45" r={HOLE_RADIUS} fill="#111" />
                <circle cx={BOARD_SIZE-45} cy="45" r={HOLE_RADIUS} fill="#111" />
                <circle cx="45" cy={BOARD_SIZE-45} r={HOLE_RADIUS} fill="#111" />
                <circle cx={BOARD_SIZE-45} cy={BOARD_SIZE-45} r={HOLE_RADIUS} fill="#111" />

                {/* Center Markings */}
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="180" fill="none" stroke="#794420" strokeWidth="4" />
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="165" fill="none" stroke="#794420" strokeWidth="2" />
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="28" fill="none" stroke="#794420" strokeWidth="4" />

                {/* 4 Arrow Baselines */}
                <Baseline />
                <Baseline transform={`rotate(90 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />
                <Baseline transform={`rotate(180 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />
                <Baseline transform={`rotate(270 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />

                {/* Aiming Vector Line */}
                {isAiming && (
                  <line 
                    x1={coinsRef.current.find(c=>c.type==="striker")?.x} 
                    y1={coinsRef.current.find(c=>c.type==="striker")?.y} 
                    x2={(coinsRef.current.find(c=>c.type==="striker")?.x || 0) + aimVector.x} 
                    y2={(coinsRef.current.find(c=>c.type==="striker")?.y || 0) + aimVector.y} 
                    stroke="rgba(255,255,255,0.6)" strokeWidth="8" strokeDasharray="12 12" strokeLinecap="round"
                  />
                )}

                {/* Coins Rendering */}
                {coinsRef.current.map(coin => {
                  if (!coin.active) return null;
                  
                  let grad = ""; let stroke = ""; let ringStroke = "";
                  if (coin.type === "striker") { grad = "url(#gradStriker)"; stroke = "#a39481"; ringStroke = "#8b7355"; }
                  if (coin.type === "queen") { grad = "url(#gradRed)"; stroke = "#7f1d1d"; ringStroke = "#5c1111"; }
                  if (coin.type === "white") { grad = "url(#gradWhite)"; stroke = "#c4b69d"; ringStroke = "#a39481"; }
                  if (coin.type === "black") { grad = "url(#gradBlack)"; stroke = "#000000"; ringStroke = "#333333"; }

                  return (
                    <g key={coin.id} transform={`translate(${coin.x}, ${coin.y})`} filter="url(#shadow)">
                      {/* Main Coin Body */}
                      <circle 
                        r={coin.radius} 
                        fill={grad} 
                        stroke={stroke} 
                        strokeWidth="2"
                        onPointerDown={(e) => handlePointerDown(e, coin.id)}
                        className={coin.type === "striker" && !isMovingRef.current ? "cursor-grab" : ""}
                      />
                      {/* Inner 3D Carved Rings */}
                      <circle r={coin.radius * 0.7} fill="none" stroke={ringStroke} strokeWidth="2" opacity="0.6" pointerEvents="none" />
                      <circle r={coin.radius * 0.4} fill="none" stroke={ringStroke} strokeWidth="1" opacity="0.6" pointerEvents="none" />
                      
                      {/* Intricate center detail for Striker */}
                      {coin.type === "striker" && (
                         <path d="M 0,-12 L 3,-3 L 12,0 L 3,3 L 0,12 L -3,3 L -12,0 L -3,-3 Z" fill={ringStroke} opacity="0.4" pointerEvents="none"/>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}