"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../lib/supabaseClient";

// --- HYPER-REALISTIC ENGINE CONSTANTS ---
const BOARD_SIZE = 1000;
const FRAME_THICKNESS = 35;   
const BOUND_MIN = FRAME_THICKNESS;
const BOUND_MAX = BOARD_SIZE - FRAME_THICKNESS;
const HOLE_POS = 42;          
const HOLE_RADIUS = 46;       
const POCKET_TRIGGER = 44;    
const STRIKER_RADIUS = 34;    
const COIN_RADIUS = 22;       
const FRICTION = 0.985;       
const RESTITUTION = 0.85;     
const MAX_POWER = 260;        

const EMOJIS = ["👍", "😂", "🔥", "😡", "😭", "🤯"];

type CoinType = "striker" | "white" | "black" | "queen";
type GameMode = "freestyle" | "classic";

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
  falling?: boolean; 
  scale?: number;    
}

// 🔊 ZERO-LATENCY PROCEDURAL AUDIO ENGINE
const playSound = (type: 'strike' | 'pocket' | 'foul' | 'bounce', intensity = 1) => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'strike') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(intensity * 0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(); 
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'bounce') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      gain.gain.setValueAtTime(intensity * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start(); 
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'pocket') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(); 
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'foul') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(); 
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch(e) { console.error("Audio engine context blocked by browser"); }
};

const generateInitialCoins = (): Coin[] => {
  const coins: Coin[] = [];
  const cx = BOARD_SIZE / 2;
  const cy = BOARD_SIZE / 2;
  const R = COIN_RADIUS * 2 + 1; 
  
  coins.push({ 
    id: "striker", type: "striker", x: cx, y: 840, vx: 0, vy: 0, 
    mass: 3, radius: STRIKER_RADIUS, active: true, scale: 1 
  });
  
  coins.push({ 
    id: "queen", type: "queen", x: cx, y: cy, vx: 0, vy: 0, 
    mass: 1, radius: COIN_RADIUS, active: true, scale: 1 
  });

  for (let i = 0; i < 6; i++) {
    const angle = i * (Math.PI / 3);
    coins.push({
      id: `inner_${i}`, 
      type: i % 2 === 0 ? "white" : "black",
      x: cx + R * Math.cos(angle), 
      y: cy + R * Math.sin(angle),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true, scale: 1
    });
  }

  for (let i = 0; i < 12; i++) {
    const angle = i * (Math.PI / 6);
    coins.push({
      id: `outer_${i}`, 
      type: i % 2 === 0 ? "black" : "white",
      x: cx + (R * 1.9) * Math.cos(angle), 
      y: cy + (R * 1.9) * Math.sin(angle),
      vx: 0, vy: 0, mass: 1, radius: COIN_RADIUS, active: true, scale: 1
    });
  }
  
  return coins;
};

const Baseline = ({ transform }: { transform?: string }) => (
  <g transform={transform} stroke="#70411d" strokeWidth="4" fill="none">
    <path d="M 220 800 L 780 800" />
    <path d="M 220 840 L 780 840" />
    <circle cx="220" cy="820" r="16" fill="#ebd097" />
    <circle cx="780" cy="820" r="16" fill="#ebd097" />
    <circle cx="220" cy="820" r="8" fill="#70411d" />
    <circle cx="780" cy="820" r="8" fill="#70411d" />
  </g>
);

const renderRealisticHole = (cx: number, cy: number) => (
  <g>
    <circle cx={cx} cy={cy} r={HOLE_RADIUS} fill="#0a0502" />
    <circle cx={cx} cy={cy} r={HOLE_RADIUS} fill="none" stroke="#2d1606" strokeWidth="4" />
    <circle cx={cx} cy={cy} r={HOLE_RADIUS - 2} fill="none" stroke="#000000" strokeWidth="4" opacity="0.5" />
  </g>
);

export default function Carrom({ onClose, preloadedMatchId }: { onClose: () => void; preloadedMatchId?: string | null; }) {
  
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online">(preloadedMatchId ? "join" : "menu");
  const [gameRuleMode, setGameRuleMode] = useState<GameMode>("freestyle");
  
  const [matchId, setMatchId] = useState("");
  const [roomCode, setRoomCode] = useState(""); 
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<1 | 2>(1);
  const [turn, setTurn] = useState<1 | 2>(1);
  
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1Color, setP1Color] = useState<"white" | "black" | null>(null);
  const [p2Color, setP2Color] = useState<"white" | "black" | null>(null);
  
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'foul' | 'info' | 'success'} | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const [floatingEmojis, setFloatingEmojis] = useState<{id: number, emoji: string, role: number}[]>([]);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  const coinsRef = useRef<Coin[]>(generateInitialCoins());
  const turnSnapshotRef = useRef<Coin[]>([]);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const isMovingRef = useRef(false);
  
  const [p1Slider, setP1Slider] = useState(500);
  const [p2Slider, setP2Slider] = useState(500); 
  
  const [isAiming, setIsAiming] = useState(false);
  const [aimVector, setAimVector] = useState({ x: 0, y: 0 });
  const boardRef = useRef<SVGSVGElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const channelRef = useRef<any>(null);

  const isMutedRef = useRef(isMuted);
  const turnRef = useRef(turn);
  const myPlayerRoleRef = useRef(myPlayerRole);
  const gameRuleModeRef = useRef(gameRuleMode);
  const matchIdRef = useRef(matchId);

  // 🧭 PERSPECTIVE LOGIC: Rotates the board 180 degrees ONLY for P2 in Online Mode
  const shouldFlipBoard = playMode === "online" && myPlayerRole === 2;

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { turnRef.current = turn; }, [turn]);
  useEffect(() => { myPlayerRoleRef.current = myPlayerRole; }, [myPlayerRole]);
  useEffect(() => { gameRuleModeRef.current = gameRuleMode; }, [gameRuleMode]);
  useEffect(() => { matchIdRef.current = matchId; }, [matchId]);

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

  // 🤝 SAFE RULE PARSER: Pulls game mode strictly from the match_id payload
  useEffect(() => {
    if (preloadedMatchId && myUserId) {
      const connectFromChat = async () => {
        let code = preloadedMatchId;
        let mode = "freestyle";
        
        if (preloadedMatchId.includes("_")) {
           const parts = preloadedMatchId.split("_");
           code = parts[0];
           mode = parts[1];
        }
        
        setGameRuleMode(mode as GameMode);

        const { data: msg } = await supabase
          .from('direct_messages')
          .select('*')
          .eq('match_id', preloadedMatchId)
          .maybeSingle();

        if (msg) {
           if (msg.sender_id === myUserId) {
              setMatchId(code); 
              setRoomCode(code); 
              setMyPlayerRole(1); 
              setPlayMode("host");
           } else {
              setMatchId(code); 
              setMyPlayerRole(2); 
              setPlayMode("join");
           }
        } else {
           setMatchId(code); 
           setMyPlayerRole(2); 
           setPlayMode("join");
        }
      };
      connectFromChat();
    }
  }, [preloadedMatchId, myUserId]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 🎶 ATMOSPHERIC LOW-TONE BGM ENGINE (Zero Dependency)
  useEffect(() => {
    if (isMuted || playMode === "menu" || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.type = 'sine'; 
      osc1.frequency.value = 65.41; // C2 Low Hum
      osc2.type = 'sine'; 
      osc2.frequency.value = 98.00; // G2 Fifth
      
      gainNode.gain.value = 0.04; 
      
      osc1.connect(gainNode); 
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(); 
      osc2.start();
      
      return () => {
        osc1.stop(); 
        osc2.stop(); 
        ctx.close();
      };
    } catch (e) { console.error("BGM Audio context failed"); }
  }, [playMode, isMuted]);

  // 🎚️ DYNAMIC SLIDER SYNC WITH FLIP CORRECTION
  useEffect(() => {
    if (isMovingRef.current) return;
    const strikerObj = coinsRef.current.find(c => c.type === "striker");
    if (strikerObj && strikerObj.active && !strikerObj.falling) {
      strikerObj.y = turn === 1 ? 840 : 160;
      let rawX = turn === 1 ? p1Slider : p2Slider;
      
      if (shouldFlipBoard) {
        rawX = 1000 - rawX;
      }
      
      strikerObj.x = rawX;
      setRenderTrigger(prev => prev + 1);
    }
  }, [p1Slider, p2Slider, turn, shouldFlipBoard]);

  // 📡 MULTIPLAYER REAL-TIME SYNC HUB
  useEffect(() => {
    if (!matchId || (playMode !== "host" && playMode !== "join" && playMode !== "online")) return;

    const channel = supabase.channel(`carrom_${matchId}`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'ping' }, (payload) => {
        if (payload.payload.role !== myPlayerRoleRef.current) {
          setPlayMode(prev => {
            if (prev === "host") {
              setToast({ msg: "Opponent joined the Arena!", type: "success" });
              channel.send({
                type: 'broadcast', 
                event: 'turn_sync', 
                payload: { 
                  coins: coinsRef.current, 
                  nextTurn: 1, 
                  p1S: 0, 
                  p2S: 0, 
                  win: null, 
                  p1C: null, 
                  p2C: null, 
                  msg: "", 
                  msgType: "info", 
                  rulesMode: gameRuleModeRef.current 
                }
              });
              return "online";
            }
            if (prev === "join") {
              setToast({ msg: "Connected to Host Matrix!", type: "success" });
              return "online";
            }
            return prev;
          });
        }
      })
      .on('broadcast', { event: 'change_rules' }, (payload) => {
         setGameRuleMode(payload.payload.mode);
         setToast({ msg: `Rule Updated: ${payload.payload.mode.toUpperCase()}`, type: 'info' });
      })
      .on('broadcast', { event: 'shot_fired' }, (payload) => {
        const { vx, vy, startX } = payload.payload;
        const strikerObj = coinsRef.current.find(c => c.type === "striker");
        if (strikerObj) {
          if(!isMutedRef.current) playSound('strike', Math.min(Math.hypot(vx, vy) / 50, 1));
          strikerObj.x = startX;
          strikerObj.y = turnRef.current === 1 ? 840 : 160;
          strikerObj.vx = vx;
          strikerObj.vy = vy;
          isMovingRef.current = true;
          turnSnapshotRef.current = JSON.parse(JSON.stringify(coinsRef.current));
          requestAnimationFrame(physicsLoop);
        }
      })
      .on('broadcast', { event: 'turn_sync' }, (payload) => {
        const { coins, nextTurn, p1S, p2S, win, p1C, p2C, msg, msgType, rulesMode } = payload.payload;
        coinsRef.current = coins;
        setTurn(nextTurn); 
        setP1Score(p1S); 
        setP2Score(p2S); 
        setWinner(win);
        setP1Color(p1C); 
        setP2Color(p2C);
        
        if (rulesMode) setGameRuleMode(rulesMode);
        
        setP1Slider(500); 
        setP2Slider(500);
        if (msg) setToast({ msg, type: msgType });
        setRenderTrigger(prev => prev + 1);
      })
      .on('broadcast', { event: 'emoji' }, (payload) => {
        const { emoji, role } = payload.payload;
        const newEmoji = { id: Date.now() + Math.random(), emoji, role };
        setFloatingEmojis((prev) => [...prev, newEmoji]);
        setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
      });

    let pingInterval: NodeJS.Timeout;
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
         pingInterval = setInterval(async () => {
            await channel.send({ type: 'broadcast', event: 'ping', payload: { role: myPlayerRoleRef.current } });
         }, 1000);
      }
    });

    return () => { 
      clearInterval(pingInterval);
      supabase.removeChannel(channel); 
      channelRef.current = null;
    };
  }, [matchId, playMode]);

  const updateOnlineRules = (mode: GameMode) => {
     setGameRuleMode(mode);
     if (channelRef.current) {
        channelRef.current.send({ type: 'broadcast', event: 'change_rules', payload: { mode } });
     }
  };

  const hostMatch = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMatchId(code); 
    setRoomCode(code); 
    setMyPlayerRole(1); 
    setPlayMode("host");
  };

  const joinMatch = () => {
    setMatchId(joinCode.toUpperCase()); 
    setMyPlayerRole(2); 
    setPlayMode("join");
  };

  const physicsLoop = () => {
    let moving = false;
    const coins = coinsRef.current;

    for (let i = 0; i < coins.length; i++) {
      let c1 = coins[i];
      if (!c1.active) continue;

      if (c1.falling) {
        c1.scale = (c1.scale || 1) * 0.85;
        const pockets = [
          {x: HOLE_POS, y: HOLE_POS}, 
          {x: BOARD_SIZE - HOLE_POS, y: HOLE_POS}, 
          {x: HOLE_POS, y: BOARD_SIZE - HOLE_POS}, 
          {x: BOARD_SIZE - HOLE_POS, y: BOARD_SIZE - HOLE_POS}
        ];
        let nearestP = pockets[0];
        let minDist = Infinity;
        for(let p of pockets) {
            let d = Math.hypot(c1.x - p.x, c1.y - p.y);
            if(d < minDist) { minDist = d; nearestP = p; }
        }

        c1.vx *= 0.5; 
        c1.vy *= 0.5;
        c1.x += (nearestP.x - c1.x) * 0.3; 
        c1.y += (nearestP.y - c1.y) * 0.3;
        moving = true;

        if (c1.scale < 0.1) {
          if (c1.type === "striker") {
            c1.falling = false; 
            c1.scale = 1; 
            c1.vx = 0; 
            c1.vy = 0;
            c1.x = 500; 
            c1.y = turnRef.current === 1 ? 840 : 160;
          } else {
            c1.active = false;
          }
        }
        continue; 
      }

      c1.x += c1.vx;
      c1.y += c1.vy;
      c1.vx *= FRICTION;
      c1.vy *= FRICTION;

      if (Math.abs(c1.vx) > 0.08 || Math.abs(c1.vy) > 0.08) moving = true;
      else { c1.vx = 0; c1.vy = 0; }

      let hitWall = false;
      if (c1.x - c1.radius < BOUND_MIN) { c1.x = BOUND_MIN + c1.radius; c1.vx *= -RESTITUTION; hitWall = true; }
      if (c1.x + c1.radius > BOUND_MAX) { c1.x = BOUND_MAX - c1.radius; c1.vx *= -RESTITUTION; hitWall = true; }
      if (c1.y - c1.radius < BOUND_MIN) { c1.y = BOUND_MIN + c1.radius; c1.vy *= -RESTITUTION; hitWall = true; }
      if (c1.y + c1.radius > BOUND_MAX) { c1.y = BOUND_MAX - c1.radius; c1.vy *= -RESTITUTION; hitWall = true; }
      if (hitWall && !isMutedRef.current && Math.hypot(c1.vx, c1.vy) > 2) playSound('bounce', 0.5);

      const pockets = [
        {x: HOLE_POS, y: HOLE_POS}, 
        {x: BOARD_SIZE - HOLE_POS, y: HOLE_POS}, 
        {x: HOLE_POS, y: BOARD_SIZE - HOLE_POS}, 
        {x: BOARD_SIZE - HOLE_POS, y: BOARD_SIZE - HOLE_POS}
      ];
      
      for (const p of pockets) {
        const dist = Math.hypot(c1.x - p.x, c1.y - p.y);
        if (dist < POCKET_TRIGGER && !c1.falling) {
          c1.falling = true;
          if(!isMutedRef.current) playSound(c1.type === "striker" ? 'foul' : 'pocket');
        }
      }

      if (c1.falling) continue;

      for (let j = i + 1; j < coins.length; j++) {
        let c2 = coins[j];
        if (!c2.active || c2.falling) continue;

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
          
          if (!isMutedRef.current && Math.abs(p) > 1) playSound('bounce', Math.min(Math.abs(p) / 10, 1));
        }
      }
    }

    setRenderTrigger(prev => prev + 1);

    if (moving) {
      requestAnimationFrame(physicsLoop);
    } else {
      isMovingRef.current = false;
      // 🛡️ AUTHORITATIVE TURN CALCULATION (Only the shooter evaluates rules)
      if (playMode !== "online" || turnRef.current === myPlayerRoleRef.current) {
        evaluateTurnEnd();
      }
    }
  };

  const evaluateTurnEnd = () => {
    const prevCoins = turnSnapshotRef.current;
    const currentCoins = coinsRef.current;
    
    const pocketedThisTurn = currentCoins.filter(c => !c.active && prevCoins.find(p => p.id === c.id)?.active);
    const strikerFoul = pocketedThisTurn.some(c => c.type === "striker");
    
    let newP1Score = p1Score; 
    let newP2Score = p2Score;
    let newP1Color = p1Color; 
    let newP2Color = p2Color;
    let nextTurn = turnRef.current; 
    let fouled = false;
    let validPocket = false;
    let turnMsg = ""; 
    let msgType: 'foul' | 'info' | 'success' = 'info';

    // Rule Resolution Engine
    if (strikerFoul) {
      fouled = true;
      if (turnRef.current === 1) newP1Score = Math.max(0, newP1Score - 5);
      else newP2Score = Math.max(0, newP2Score - 5);
    }

    pocketedThisTurn.forEach(c => {
      if (c.type === "queen") {
        validPocket = true;
        if (turnRef.current === 1) newP1Score += 5; else newP2Score += 5;
      } 
      else if (c.type === "white" || c.type === "black") {
        const pts = c.type === "white" ? 3 : 2;
        
        if (gameRuleModeRef.current === "freestyle") {
          validPocket = true;
          if (turnRef.current === 1) newP1Score += pts; else newP2Score += pts;
        } 
        else if (gameRuleModeRef.current === "classic") {
          if (!newP1Color) {
            validPocket = true;
            newP1Color = turnRef.current === 1 ? c.type : (c.type === "white" ? "black" : "white");
            newP2Color = newP1Color === "white" ? "black" : "white";
            if (turnRef.current === 1) newP1Score += pts; else newP2Score += pts;
          } else {
            const myColor = turnRef.current === 1 ? newP1Color : newP2Color;
            if (c.type === myColor) {
              validPocket = true;
              if (turnRef.current === 1) newP1Score += pts; else newP2Score += pts;
            } else {
              fouled = true; 
              if (turnRef.current === 1) newP2Score += pts; else newP1Score += pts;
            }
          }
        }
      }
    });

    if (fouled) {
      turnMsg = "Foul! Turn Lost.";
      msgType = "foul";
      nextTurn = turnRef.current === 1 ? 2 : 1;
    } else if (validPocket) {
      turnMsg = "Good Shot! Extra Turn.";
      msgType = "success";
      nextTurn = turnRef.current;
    } else {
      nextTurn = turnRef.current === 1 ? 2 : 1;
    }

    const strikerObj = currentCoins.find(c => c.type === "striker");
    if (strikerObj) {
      strikerObj.active = true; 
      strikerObj.vx = 0; 
      strikerObj.vy = 0;
      strikerObj.x = 500; 
      strikerObj.y = nextTurn === 1 ? 840 : 160;
    }
    setP1Slider(500); 
    setP2Slider(500);

    let win: 1 | 2 | null = null;
    const whitesLeft = currentCoins.filter(c => c.type === "white" && c.active).length;
    const blacksLeft = currentCoins.filter(c => c.type === "black" && c.active).length;
    
    if (gameRuleModeRef.current === "classic" && newP1Color) {
       if (newP1Color === "white" && whitesLeft === 0) win = 1;
       if (newP2Color === "white" && whitesLeft === 0) win = 2;
       if (newP1Color === "black" && blacksLeft === 0) win = 1;
       if (newP2Color === "black" && blacksLeft === 0) win = 2;
    } else if (whitesLeft === 0 && blacksLeft === 0) {
       win = newP1Score > newP2Score ? 1 : (newP2Score > newP1Score ? 2 : 1);
    }

    if (turnMsg) setToast({ msg: turnMsg, type: msgType });

    if (playMode === "online" && channelRef.current) {
       channelRef.current.send({
          type: 'broadcast', 
          event: 'turn_sync', 
          payload: { 
            coins: currentCoins, 
            nextTurn, 
            p1S: newP1Score, 
            p2S: newP2Score, 
            win, 
            p1C: newP1Color, 
            p2C: newP2Color, 
            msg: turnMsg, 
            msgType, 
            rulesMode: gameRuleModeRef.current 
          }
       });
    }

    setTurn(nextTurn); 
    setP1Score(newP1Score); 
    setP2Score(newP2Score);
    setP1Color(newP1Color); 
    setP2Color(newP2Color); 
    setWinner(win);
  };

  const handlePointerDown = (e: React.PointerEvent, coinId: string) => {
    if (coinId !== "striker" || isMovingRef.current || winner) return;
    if (playMode === "online" && turn !== myPlayerRole) return;
    setIsAiming(true);
  };

  // 🎯 REAL-TIME BOUNDING BOX TRANSLATION MECHANISM
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming || !boardRef.current) return;
    
    const rect = boardRef.current.getBoundingClientRect();
    let percentX = (e.clientX - rect.left) / rect.width;
    let percentY = (e.clientY - rect.top) / rect.height;
    
    let svgX = percentX * BOARD_SIZE;
    let svgY = percentY * BOARD_SIZE;

    if (shouldFlipBoard) {
      svgX = BOARD_SIZE - svgX;
      svgY = BOARD_SIZE - svgY;
    }

    const strikerObj = coinsRef.current.find(c => c.type === "striker")!;
    let dx = strikerObj.x - svgX; 
    let dy = strikerObj.y - svgY;
    
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
    
    const powerMultiplier = 0.22;
    const vx = aimVector.x * powerMultiplier;
    const vy = aimVector.y * powerMultiplier;
    
    if (Math.hypot(vx, vy) < 1.5) return;

    const strikerObj = coinsRef.current.find(c => c.type === "striker");
    if (strikerObj) {
      turnSnapshotRef.current = JSON.parse(JSON.stringify(coinsRef.current));
      strikerObj.vx = vx; 
      strikerObj.vy = vy;
      isMovingRef.current = true;
      if(!isMutedRef.current) playSound('strike', Math.min(Math.hypot(vx, vy) / 50, 1));
      
      if (playMode === "online" && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast', 
          event: 'shot_fired', 
          payload: { vx, vy, startX: strikerObj.x }
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
    setP1Slider(500); 
    setP2Slider(500);
    setP1Score(0); 
    setP2Score(0);
    setP1Color(null); 
    setP2Color(null);
    setRenderTrigger(prev => prev + 1);
  };

  const sendEmoji = (emoji: string) => {
    setShowEmojiMenu(false);
    if (playMode === "online" && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'emoji', payload: { emoji, role: myPlayerRole } });
    } else {
      const newEmoji = { id: Date.now(), emoji, role: turn };
      setFloatingEmojis((prev) => [...prev, newEmoji]);
      setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- DYNAMIC HUD VARIABLES ---
  const topRole: 1 | 2 = playMode === 'local' ? 2 : (myPlayerRole === 1 ? 2 : 1);
  const bottomRole: 1 | 2 = playMode === 'local' ? 1 : myPlayerRole as 1 | 2;
  const activeStriker = coinsRef.current.find(c => c.type === "striker");
  const aimDist = Math.hypot(aimVector.x, aimVector.y);
  const isMaxPower = aimDist >= MAX_POWER - 2;

  const renderPlayerHUD = (role: 1 | 2, position: 'top' | 'bottom') => {
    const isMyTurn = turn === role;
    const canUseSlider = isMyTurn && !winner && (playMode === 'local' || myPlayerRole === role);
    const currentSlider = role === 1 ? p1Slider : p2Slider;
    const setCurrentSlider = role === 1 ? setP1Slider : setP2Slider;
    const roleScore = role === 1 ? p1Score : p2Score;
    const roleColor = role === 1 ? p1Color : p2Color;

    let turnText = `Player ${turn} Turn`;
    if (playMode === "online") {
      if (isMyTurn) turnText = myPlayerRole === role ? "Your Shot" : "Opponent Aiming";
      else turnText = myPlayerRole === role ? "Wait" : "Opponent Aiming";
    }

    const headerContent = (
      <div className="w-full flex justify-between items-end px-2">
         <div className={`flex flex-col items-start transition-all ${isMyTurn ? "opacity-100" : "opacity-40 grayscale"}`}>
           <span className="text-sm font-black text-neutral-900 dark:text-white">{roleScore} PTS</span>
           <div className="flex items-center gap-2 mt-1">
             {role === 1 ? (
               <div className="w-8 h-8 rounded-full bg-[#f4ebd4] border-2 border-[#d6c7b0] flex items-center justify-center text-[#6b5f4c] text-[10px] font-bold shadow-md">P1</div>
             ) : (
               <div className="w-8 h-8 rounded-full bg-neutral-950 border-2 border-neutral-800 flex items-center justify-center text-white text-[10px] font-bold shadow-md">P2</div>
             )}
             {roleColor && <div className={`w-4 h-4 rounded-full border border-neutral-400 ${roleColor === 'white' ? 'bg-[#f3ead3]' : 'bg-[#141414]'}`}></div>}
           </div>
         </div>
         <div className="px-4 py-1.5 bg-white dark:bg-neutral-900 rounded-full shadow-sm border border-neutral-200 dark:border-neutral-800 text-[9px] font-black uppercase tracking-widest text-neutral-800 dark:text-neutral-200">
           {turnText}
         </div>
      </div>
    );

    const sliderContent = (
      <div className={`w-full max-w-[280px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-2.5 rounded-xl shadow-sm transition-opacity ${canUseSlider ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
         <input type="range" min={220} max={780} step={2} value={currentSlider} onChange={(e) => setCurrentSlider(Number(e.target.value))} disabled={isMovingRef.current || !canUseSlider} className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500" />
      </div>
    );

    return (
      <div className="w-full flex flex-col items-center px-4 gap-2 shrink-0">
        {position === 'top' ? <>{headerContent}{sliderContent}</> : <>{sliderContent}{headerContent}</>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-100 dark:bg-neutral-950 flex flex-col items-center justify-start pt-safe animate-fade-in overflow-hidden transition-colors select-none">
      
      <style>{`
        @keyframes confetti-fall { 
          0% { transform: translateY(-10vh) rotate(0deg) scale(1); opacity: 1; } 
          100% { transform: translateY(110vh) rotate(720deg) scale(0.7); opacity: 0; } 
        }
        @keyframes slide-down { 
          0% { transform: translateY(-20px); opacity: 0; } 
          100% { transform: translateY(0); opacity: 1; } 
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out forwards; }
      `}</style>

      {/* 🛡️ ARENA LOBBY PANEL */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-neutral-100/90 dark:bg-neutral-950/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 rounded-[2.5rem] p-6 w-full max-w-sm shadow-2xl flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/10 dark:bg-amber-500/20 blur-3xl rounded-full pointer-events-none"></div>

            <div className="text-center pt-2 relative z-10">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-2xl flex items-center justify-center mb-3 shadow-[0_8px_16px_rgba(245,158,11,0.15)]">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>radio_button_checked</span>
              </div>
              <h2 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">Carrom Arena</h2>
            </div>
            
            <div className="bg-neutral-100 dark:bg-neutral-800 p-1.5 rounded-xl flex items-center relative z-10">
              <button 
                onClick={() => setGameRuleMode("freestyle")} 
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${gameRuleMode === "freestyle" ? "bg-white dark:bg-neutral-900 text-amber-600 dark:text-amber-500 shadow-sm" : "text-neutral-500"}`}
              >
                Freestyle
              </button>
              <button 
                onClick={() => setGameRuleMode("classic")} 
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${gameRuleMode === "classic" ? "bg-white dark:bg-neutral-900 text-amber-600 dark:text-amber-500 shadow-sm" : "text-neutral-500"}`}
              >
                Classic
              </button>
            </div>

            <div className="space-y-3 relative z-10">
              <button 
                onClick={hostMatch} 
                className="group w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs uppercase tracking-wider rounded-2xl active:scale-95 shadow-md flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">language</span> 
                Host Network Match
              </button>
              <button 
                onClick={() => setPlayMode("local")} 
                className="group w-full h-14 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-xs uppercase tracking-wider rounded-2xl border border-neutral-200 dark:border-neutral-700 active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">group</span> 
                Local Pass & Play
              </button>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-950 p-2 rounded-[1.25rem] border border-neutral-200 dark:border-neutral-800 flex items-center relative z-10">
              <input 
                type="text" 
                maxLength={6} 
                placeholder="CODE" 
                value={joinCode} 
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())} 
                className="flex-1 bg-transparent text-center text-lg font-black tracking-widest focus:outline-none uppercase"
              />
              <button 
                onClick={joinMatch} 
                disabled={joinCode.length < 6} 
                className="h-11 px-6 bg-neutral-900 dark:bg-white text-white dark:text-black font-black text-xs uppercase rounded-xl disabled:opacity-50"
              >
                Join
              </button>
            </div>

            <button 
              onClick={onClose} 
              className="w-full py-2 text-[10px] font-bold text-neutral-500 uppercase tracking-widest relative z-10"
            >
              Exit Arena
            </button>
          </div>
        </div>
      )}

      {/* ⚔️ HEADER HUB */}
      {playMode !== "menu" && (
        <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md z-30 shrink-0">
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center active:scale-90 shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
          
          <div className="text-center flex flex-col items-center">
            <h1 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">Carrom Matrix</h1>
            
            {/* Live Room Rule selector for the Host */}
            {playMode === "online" && myPlayerRole === 1 ? (
               <div className="flex bg-neutral-200 dark:bg-neutral-800 p-0.5 rounded-md mt-1 scale-90 border border-neutral-300 dark:border-neutral-700">
                  <button 
                    onClick={() => updateOnlineRules("freestyle")} 
                    className={`px-2 py-0.5 text-[8px] uppercase tracking-wider font-bold rounded ${gameRuleMode === 'freestyle' ? 'bg-white dark:bg-neutral-900 text-amber-500 shadow-sm' : 'text-neutral-400'}`}
                  >
                    Freestyle
                  </button>
                  <button 
                    onClick={() => updateOnlineRules("classic")} 
                    className={`px-2 py-0.5 text-[8px] uppercase tracking-wider font-bold rounded ${gameRuleMode === 'classic' ? 'bg-white dark:bg-neutral-900 text-amber-500 shadow-sm' : 'text-neutral-400'}`}
                  >
                    Classic
                  </button>
               </div>
            ) : (
               <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${playMode === "online" ? "text-emerald-500 animate-pulse" : (playMode === "host" || playMode === "join") ? "text-amber-500 animate-pulse" : "text-neutral-400"}`}>
                 {playMode === "online" ? `● ${gameRuleMode.toUpperCase()}` : (playMode === "host" || playMode === "join") ? "Connecting..." : "Local Mode"}
               </span>
            )}
          </div>
          
          <div className="flex gap-2 relative">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-sm active:scale-90"
            >
              <span className="material-symbols-outlined text-lg">{isMuted ? "volume_off" : "volume_up"}</span>
            </button>
            <button 
              onClick={() => setShowEmojiMenu(!showEmojiMenu)} 
              className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-sm active:scale-90"
            >
              <span className="material-symbols-outlined text-lg">add_reaction</span>
            </button>
            
            {showEmojiMenu && (
              <div className="absolute top-12 right-0 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-2 rounded-2xl shadow-xl flex gap-1 z-50">
                {EMOJIS.map(em => (
                  <button 
                    key={em} 
                    onClick={() => sendEmoji(em)} 
                    className="text-xl hover:scale-125 transition-transform p-1"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
            
            <button 
              onClick={() => setShowRules(true)} 
              className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 shadow-sm"
            >
              <span className="material-symbols-outlined text-lg">info</span>
            </button>
          </div>
        </div>
      )}

      {/* --- WAITING SCREEN --- */}
      {(playMode === "host" || playMode === "join") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 relative z-10">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-8 w-full shadow-[0_20px_40px_rgba(0,0,0,0.05)] flex flex-col items-center text-center relative overflow-hidden">
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
                      copied ? "bg-emerald-500 text-white" : "bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:scale-[1.02] active:scale-95"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <button 
              onClick={() => playMode === "host" ? setPlayMode("menu") : onClose()} 
              className="w-full mt-8 py-3.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all relative z-10"
            >
              Cancel Match
            </button>
          </div>
        </div>
      )}

      {showRules && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-xl">
            <h3 className="text-base font-black uppercase tracking-wider text-neutral-900 dark:text-white">Carrom Guidelines</h3>
            <ul className="text-left text-xs space-y-3 text-neutral-600 dark:text-neutral-400 font-medium">
              {gameRuleMode === "freestyle" ? (
                <>
                  <li>🔸 <strong className="text-amber-500">Freestyle Points:</strong> White = 3, Black = 2, Queen = 5.</li>
                  <li>🔸 Potting ANY coin grants an extra turn.</li>
                </>
              ) : (
                <>
                  <li>🔸 <strong className="text-amber-500">Classic Colors:</strong> The first coin potted dictates your color.</li>
                  <li>🔸 Potting YOUR color grants an extra turn.</li>
                  <li>🔸 Potting OPPONENT color is a foul.</li>
                </>
              )}
              <li>🔸 Sinking the striker is a foul (-5 PTS) and ends your turn.</li>
            </ul>
            <button 
              onClick={() => setShowRules(false)} 
              className="w-full mt-2 py-3 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-xl"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 animate-slide-down pointer-events-none">
          <div className={`px-5 py-2.5 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-2 ${toast.type === 'foul' ? 'bg-red-500/90 border-red-400 text-white' : toast.type === 'success' ? 'bg-emerald-500/90 border-emerald-400 text-white' : 'bg-neutral-900/90 border-neutral-700 text-white'}`}>
            <span className="material-symbols-outlined text-sm">{toast.type === 'foul' ? 'warning' : toast.type === 'success' ? 'check_circle' : 'info'}</span>
            <span className="text-[10px] font-black uppercase tracking-widest">{toast.msg}</span>
          </div>
        </div>
      )}

      {(playMode === "local" || playMode === "online") && (
        <div className="flex-1 w-full flex flex-col justify-between min-h-0 relative z-10 py-4">
          
          {renderPlayerHUD(topRole, 'top')}

          <div className="flex-1 w-full flex items-center justify-center min-h-0 relative">
            
            {floatingEmojis.map((em) => {
              const isMine = em.role === myPlayerRole;
              return (
                <div key={em.id} className={`absolute z-40 text-4xl animate-float-up pointer-events-none ${isMine ? "right-10 bottom-10" : "left-10 top-10"}`}>
                  {em.emoji}
                </div>
              );
            })}

            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-md rounded-[2rem]"></div>
                {confettiPieces.map(p => (
                  <div 
                    key={p.id} 
                    className="absolute top-0 z-[60]" 
                    style={{ left: p.left, width: '7px', height: '15px', backgroundColor: p.color, borderRadius: '3px', animation: `confetti-fall ${p.duration} linear ${p.delay} infinite`}} 
                  />
                ))}
                <div className="relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center text-center z-50 animate-scale-up">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 text-white flex items-center justify-center mb-4 shadow-lg border-4 border-amber-200 dark:border-yellow-900 animate-bounce">
                    <span className="material-symbols-outlined text-3xl">emoji_events</span>
                  </div>
                  <h3 className="text-[10px] font-black text-amber-500 tracking-widest uppercase mb-1">Victory Sequence</h3>
                  <h2 className="text-3xl font-black tracking-tight uppercase">Arena Cleared!</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium mt-3 px-2 leading-relaxed">
                    {playMode === "online" ? (winner === myPlayerRole ? "Incredible skill! You claimed complete server victory." : "The opponent cleared the board.") : `Player ${winner} has completely pocketed their target roster!`}
                  </p>
                  <div className="w-full flex gap-3 mt-8">
                    <button 
                      onClick={onClose} 
                      className="flex-1 py-3 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold text-xs uppercase rounded-xl active:scale-95 transition-all shadow-sm"
                    >
                      Exit
                    </button>
                    <button 
                      onClick={handleRematch} 
                      className="flex-1 py-3 bg-amber-500 text-white font-bold text-xs uppercase rounded-xl active:scale-95 transition-all shadow-md hover:bg-amber-600"
                    >
                      Play Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PRECISION SVG CONTAINMENT */}
            <div className="relative w-full max-w-[95vw] aspect-square rounded-[2rem] bg-[#3e1f0e] shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-3 flex items-center justify-center">
              
              <div 
                className="relative w-full h-full bg-[#ebd097] rounded-[1rem] overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] border-[4px] border-[#2d1606] touch-none select-none"
                onPointerMove={handlePointerMove} 
                onPointerUp={handlePointerUp} 
                onPointerLeave={handlePointerUp}
              >
                <svg 
                  ref={boardRef} 
                  viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} 
                  className={`w-full h-full transition-transform duration-500 ${shouldFlipBoard ? "rotate-180" : "rotate-0"}`} 
                  style={{ display: 'block' }}
                >
                  <defs>
                    <filter id="c-shadow"><feDropShadow dx="3" dy="5" stdDeviation="4" floodOpacity="0.4" /></filter>
                    <radialGradient id="vWhite" cx="35%" cy="30%" r="70%"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#dfd0bd" /></radialGradient>
                    <radialGradient id="vBlack" cx="35%" cy="30%" r="70%"><stop offset="0%" stopColor="#4d4d4d" /><stop offset="100%" stopColor="#141414" /></radialGradient>
                    <radialGradient id="vRed" cx="35%" cy="30%" r="70%"><stop offset="0%" stopColor="#ff5959" /><stop offset="100%" stopColor="#ba0000" /></radialGradient>
                    <radialGradient id="vStriker" cx="35%" cy="30%" r="70%"><stop offset="0%" stopColor="#f7f9fa" /><stop offset="70%" stopColor="#e1e6eb" /><stop offset="100%" stopColor="#b5bec4" /></radialGradient>
                  </defs>

                  <rect x="0" y="0" width={BOARD_SIZE} height={BOARD_SIZE} fill="none" stroke="#2d1606" strokeWidth={FRAME_THICKNESS * 2} />

                  {renderRealisticHole(HOLE_POS, HOLE_POS)}
                  {renderRealisticHole(BOARD_SIZE - HOLE_POS, HOLE_POS)}
                  {renderRealisticHole(HOLE_POS, BOARD_SIZE - HOLE_POS)}
                  {renderRealisticHole(BOARD_SIZE - HOLE_POS, BOARD_SIZE - HOLE_POS)}

                  <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="160" fill="none" stroke="#70411d" strokeWidth="4" />
                  <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="148" fill="none" stroke="#70411d" strokeWidth="1.5" />
                  <circle cx={BOARD_SIZE/2} cy={BOARD_SIZE/2} r="26" fill="none" stroke="#70411d" strokeWidth="3" />

                  <Baseline />
                  <Baseline transform={`rotate(90 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />
                  <Baseline transform={`rotate(180 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />
                  <Baseline transform={`rotate(270 ${BOARD_SIZE/2} ${BOARD_SIZE/2})`} />

                  {isAiming && activeStriker && !activeStriker.falling && (
                    <>
                      <line 
                        x1={activeStriker.x} 
                        y1={activeStriker.y} 
                        x2={activeStriker.x + aimVector.x} 
                        y2={activeStriker.y + aimVector.y} 
                        stroke={isMaxPower ? "#ef4444" : "#4f46e5"} 
                        strokeWidth="8" 
                        strokeDasharray="12 12" 
                        strokeLinecap="round" 
                        opacity="0.8" 
                      />
                      <circle 
                        cx={activeStriker.x + aimVector.x} 
                        cy={activeStriker.y + aimVector.y} 
                        r={activeStriker.radius} 
                        fill={isMaxPower ? "#ef4444" : "#4f46e5"} 
                        opacity="0.2" 
                      />
                    </>
                  )}

                  {coinsRef.current.map(coin => {
                    if (!coin.active) return null;
                    let fillMat = ""; 
                    let edgeStroke = ""; 
                    let interiorRing = "";
                    
                    if (coin.type === "striker") { fillMat = "url(#vStriker)"; edgeStroke = "#8695a0"; interiorRing = "#61737e"; }
                    if (coin.type === "queen") { fillMat = "url(#vRed)"; edgeStroke = "#801515"; interiorRing = "#5c0b0b"; }
                    if (coin.type === "white") { fillMat = "url(#vWhite)"; edgeStroke = "#bdae98"; interiorRing = "#968875"; }
                    if (coin.type === "black") { fillMat = "url(#vBlack)"; edgeStroke = "#0a0a0a"; interiorRing = "#333333"; }

                    return (
                      <g key={coin.id} transform={`translate(${coin.x}, ${coin.y}) scale(${coin.scale || 1})`} filter={coin.falling ? "" : "url(#c-shadow)"}>
                        <circle 
                          r={coin.radius} 
                          fill={fillMat} 
                          stroke={edgeStroke} 
                          strokeWidth="1.5" 
                          onPointerDown={(e) => handlePointerDown(e, coin.id)} 
                          className={coin.type === "striker" && !isMovingRef.current && ((playMode === "online" && turn === myPlayerRole) || (playMode === "local" && turn === 1) || (playMode === "local" && turn === 2)) ? "cursor-grab active:cursor-grabbing" : ""} 
                        />
                        <circle r={coin.radius * 0.68} fill="none" stroke={interiorRing} strokeWidth="1.5" opacity="0.6" pointerEvents="none" />
                        <circle r={coin.radius * 0.36} fill="none" stroke={interiorRing} strokeWidth="1" opacity="0.5" pointerEvents="none" />
                        {coin.type === "striker" && <circle r="6" fill="#ef4444" opacity="0.7" pointerEvents="none"/>}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          {renderPlayerHUD(bottomRole, 'bottom')}

        </div>
      )}
    </div>
  );
}