"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";

// --- PHYSICS & GAME CONSTANTS ---
const BOARD_SIZE = 1000;
const HOLE_RADIUS = 45;
const STRIKER_RADIUS = 35;
const COIN_RADIUS = 25;
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

// Generates the standard central Carrom formation
const generateInitialCoins = (): Coin[] => {
  const coins: Coin[] = [];
  const cx = BOARD_SIZE / 2;
  const cy = BOARD_SIZE / 2;
  
  // Striker
  coins.push({ id: "striker", type: "striker", x: cx, y: BOARD_SIZE - 150, vx: 0, vy: 0, mass: 2, radius: STRIKER_RADIUS, active: true });
  
  // Queen
  coins.push({ id: "queen", type: "queen", x: cx, y: cy, vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true });

  // Outer Ring (Simplified 4 White, 4 Black for fast mobile play)
  const dist = COIN_RADIUS * 2.2;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    coins.push({
      id: `coin_${i}`,
      type: i % 2 === 0 ? "white" : "black",
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true
    });
  }
  return coins;
};

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

      // Apply Velocity & Friction
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
        {x: 0, y: 0}, {x: BOARD_SIZE, y: 0}, 
        {x: 0, y: BOARD_SIZE}, {x: BOARD_SIZE, y: BOARD_SIZE}
      ];
      
      for (const p of pockets) {
        const dist = Math.hypot(c1.x - p.x, c1.y - p.y);
        if (dist < HOLE_RADIUS) {
          if (c1.type === "striker") {
            // Foul! Striker pocketed. Reset it.
            c1.vx = 0; c1.vy = 0;
            c1.x = BOARD_SIZE / 2;
            c1.y = turn === 1 ? BOARD_SIZE - 150 : 150; 
          } else {
            c1.active = false; // Pocketed!
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
          // Resolve Overlap
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          c1.x -= nx * (overlap / 2);
          c1.y -= ny * (overlap / 2);
          c2.x += nx * (overlap / 2);
          c2.y += ny * (overlap / 2);

          // Momentum Transfer
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
            // Simplified rule: Queen gives 3 points to the current turn player
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

    // Reset Striker Position for next turn
    const striker = coinsRef.current.find(c => c.type === "striker");
    if (striker) {
      striker.x = BOARD_SIZE / 2;
      striker.y = nextTurn === 1 ? BOARD_SIZE - 150 : 150;
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

  // --- INTERACTION ---
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
    // Calculate pull-back vector
    const dx = striker.x - svgP.x;
    const dy = striker.y - svgP.y;
    setAimVector({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!isAiming) return;
    setIsAiming(false);
    
    const powerMultiplier = 0.15; // Tuning the pull back power
    const vx = aimVector.x * powerMultiplier;
    const vy = aimVector.y * powerMultiplier;
    
    // Ignore tiny taps
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

  // Rendering Helpers
  const shouldFlipBoard = playMode === "local" ? turn === 2 : myPlayerRole === 2;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden">
      
      {/* 🛡️ MENU LOBBY (Identical to Checkers for Consistency) */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-neutral-100/90 dark:bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 rounded-[2.5rem] p-6 w-full max-w-sm shadow-2xl flex flex-col gap-6 relative overflow-hidden">
            <div className="text-center pt-2 relative z-10">
              <div className="w-16 h-16 mx-auto bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center border border-amber-200/50 dark:border-amber-700/50 mb-3">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>radio_button_checked</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight">Carrom Striker</h2>
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-1">Physics Engine Initialized</p>
            </div>
            
            <div className="space-y-3 relative z-10">
              <button onClick={hostMatch} className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs uppercase tracking-wider rounded-2xl active:scale-95 shadow-md">Host Network Match</button>
              <button onClick={() => setPlayMode("local")} className="w-full h-14 bg-neutral-50 dark:bg-neutral-800 font-bold text-xs uppercase tracking-wider rounded-2xl border border-neutral-200 dark:border-neutral-700 active:scale-95">Local Pass & Play</button>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded-[1.25rem] border border-neutral-200 dark:border-neutral-800 flex items-center relative z-10">
              <input type="text" maxLength={6} placeholder="CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} className="flex-1 bg-transparent text-center text-lg font-black tracking-widest focus:outline-none uppercase"/>
              <button onClick={joinMatch} disabled={joinCode.length < 6} className="h-11 px-6 bg-neutral-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase rounded-xl disabled:opacity-50">Join</button>
            </div>

            <button onClick={onClose} className="w-full py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Exit Arena</button>
          </div>
        </div>
      )}

      {/* ⚔️ HEADER HUD */}
      <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-30 shrink-0">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center active:scale-90">
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Carrom</h1>
          <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest">
            {playMode === "online" ? "Live Network" : "Local Physics"}
          </span>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* 🎮 SCOREBOARD */}
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

          {/* 🎯 THE PHYSICS BOARD */}
          <div className="flex-1 w-full flex items-center justify-center px-4 pb-6 min-h-0 relative">
            
            {/* Victory Overlay */}
            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-white/60 dark:bg-black/60 backdrop-blur-md rounded-[2.5rem]">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full shadow-2xl flex flex-col items-center text-center">
                  <h2 className="text-3xl font-black uppercase">Player {winner} Wins!</h2>
                  <button onClick={handleRematch} className="mt-6 w-full py-3 bg-amber-500 text-white font-bold uppercase rounded-xl">Play Again</button>
                </div>
              </div>
            )}

            {/* SVG PHYSICS RENDERER */}
            <div 
              className="w-full max-h-full aspect-square bg-[#d4a373] rounded-[1.5rem] p-4 shadow-2xl border-2 border-[#bc8a5f] relative overflow-hidden select-none touch-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <svg 
                ref={boardRef}
                viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} 
                className={`w-full h-full border-4 border-[#5c3a21] bg-[#e6cc98] shadow-inner transition-transform duration-500 ${shouldFlipBoard ? "rotate-180" : "rotate-0"}`}
              >
                {/* Board Markings */}
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="150" fill="none" stroke="#bc8a5f" strokeWidth="4" />
                <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="20" fill="#bc8a5f" />
                
                {/* 4 Pockets */}
                <circle cx="0" cy="0" r={HOLE_RADIUS} fill="#24160d" />
                <circle cx={BOARD_SIZE} cy="0" r={HOLE_RADIUS} fill="#24160d" />
                <circle cx="0" cy={BOARD_SIZE} r={HOLE_RADIUS} fill="#24160d" />
                <circle cx={BOARD_SIZE} cy={BOARD_SIZE} r={HOLE_RADIUS} fill="#24160d" />

                {/* Aiming Vector Line */}
                {isAiming && (
                  <line 
                    x1={coinsRef.current.find(c=>c.type==="striker")?.x} 
                    y1={coinsRef.current.find(c=>c.type==="striker")?.y} 
                    x2={(coinsRef.current.find(c=>c.type==="striker")?.x || 0) + aimVector.x} 
                    y2={(coinsRef.current.find(c=>c.type==="striker")?.y || 0) + aimVector.y} 
                    stroke="rgba(255,255,255,0.5)" strokeWidth="6" strokeDasharray="10 10" 
                  />
                )}

                {/* Coins Rendering */}
                {coinsRef.current.map(coin => {
                  if (!coin.active) return null;
                  
                  // Styling based on piece type
                  let fill = ""; let stroke = ""; let strokeW = "4";
                  if (coin.type === "striker") { fill = "#38bdf8"; stroke = "#1e3a8a"; strokeW = "6"; } // Blue Striker
                  if (coin.type === "queen") { fill = "#ef4444"; stroke = "#7f1d1d"; } // Red Queen
                  if (coin.type === "white") { fill = "#f3ead3"; stroke = "#dccfb4"; }
                  if (coin.type === "black") { fill = "#262626"; stroke = "#000000"; }

                  return (
                    <g key={coin.id} transform={`translate(${coin.x}, ${coin.y})`}>
                      <circle 
                        r={coin.radius} 
                        fill={fill} 
                        stroke={stroke} 
                        strokeWidth={strokeW}
                        onPointerDown={(e) => handlePointerDown(e, coin.id)}
                        className={coin.type === "striker" && !isMovingRef.current ? "cursor-grab" : ""}
                      />
                      {/* Carved inner ring detail */}
                      <circle r={coin.radius * 0.5} fill="none" stroke={stroke} strokeWidth="2" opacity="0.5" pointerEvents="none" />
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