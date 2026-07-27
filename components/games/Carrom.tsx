"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { RealtimeChannel } from '@supabase/supabase-js';
import { soundEngine } from "../../lib/soundManager";
import { storeManager } from "../../lib/storeManager";
import { getRandomBotOpponent } from "../../lib/botUtils";
import { processGameEntry, recordMatchResult } from "../../lib/matchManager";

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
const TURN_TIME_LIMIT = 30; // 30-second turn timer requirement

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

interface CarromProps {
  onClose: () => void;
  preloadedMatchId?: string | null;
  opponent?: { name: string; avatarIcon?: string; isBot: boolean } | null;
}

export default function Carrom({ onClose, preloadedMatchId, opponent }: CarromProps) {
  
  // 🛍️ STORE COSMETICS ENGINE SYNC
  const equippedCosmetic = storeManager.getEquippedCosmetic("carrom");
  const isNeonStriker = equippedCosmetic === "neon_glow_striker";

  // 💰 DYNAMIC POINTS & ENTRY FEE SYSTEM
  const [userPoints, setUserPoints] = useState<number | null>(null);
  const [entryFee, setEntryFee] = useState<number>(100);
  const [showNoPointsModal, setShowNoPointsModal] = useState(false);

  // 1. Detect bot mode synchronously
  const isBotMode = Boolean(opponent?.isBot || preloadedMatchId?.startsWith("bot_"));

  // 2. Direct state initialization based on detection
  const [playMode, setPlayMode] = useState<"menu" | "local" | "host" | "join" | "online" | "bot" | "searching" | "confirmed">(
    isBotMode ? "bot" : preloadedMatchId ? "join" : "menu"
  );
  const [gameRuleMode, setGameRuleMode] = useState<GameMode>("freestyle");
  
  const [localOpponent, setLocalOpponent] = useState<any>(
    opponent || getRandomBotOpponent()
  );

  const [matchId, setMatchId] = useState<string>(
    preloadedMatchId || (isBotMode ? `bot_match_${Date.now()}` : "")
  );

  // Match History ID tracked for recording final results
  const [historyMatchId, setHistoryMatchId] = useState<string | null>(null);

  const [roomCode, setRoomCode] = useState(""); 
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myPlayerRole, setMyPlayerRole] = useState<1 | 2>(1);
  const [turn, setTurn] = useState<1 | 2>(1);
  const [turnNonce, setTurnNonce] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(TURN_TIME_LIMIT);
  
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1Color, setP1Color] = useState<"white" | "black" | null>(null);
  const [p2Color, setP2Color] = useState<"white" | "black" | null>(null);
  
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'foul' | 'info' | 'success'} | null>(null);
  const [isMuted, setIsMuted] = useState(soundEngine.getMutedState());

  const [floatingEmojis, setFloatingEmojis] = useState<{id: number, emoji: string, role: number}[]>([]);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);

  const coinsRef = useRef<Coin[]>(generateInitialCoins());
  const turnSnapshotRef = useRef<Coin[]>([]);
  const [, setRenderTrigger] = useState(0);
  const isMovingRef = useRef(false);
  const didIShootRef = useRef(false); 
  
  const [p1Slider, setP1Slider] = useState(500);
  const [p2Slider, setP2Slider] = useState(500); 
  
  const [isAiming, setIsAiming] = useState(false);
  const [aimVector, setAimVector] = useState({ x: 0, y: 0 });
  const boardRef = useRef<SVGSVGElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const turnRef = useRef(turn);
  const myPlayerRoleRef = useRef(myPlayerRole);
  const gameRuleModeRef = useRef(gameRuleMode);
  const playModeRef = useRef(playMode);

  // 🔒 SCORE & COLOR REFS (PREVENTS STALE CLOSURES IN ANIMATION LOOPS)
  const p1ScoreRef = useRef(p1Score);
  const p2ScoreRef = useRef(p2Score);
  const p1ColorRef = useRef(p1Color);
  const p2ColorRef = useRef(p2Color);

  useEffect(() => { p1ScoreRef.current = p1Score; }, [p1Score]);
  useEffect(() => { p2ScoreRef.current = p2Score; }, [p2Score]);
  useEffect(() => { p1ColorRef.current = p1Color; }, [p1Color]);
  useEffect(() => { p2ColorRef.current = p2Color; }, [p2Color]);

  // 🧭 PERSPECTIVE LOGIC: Rotates board 180 degrees ONLY for P2 in Online Mode
  const shouldFlipBoard = playMode === "online" && myPlayerRole === 2;

  useEffect(() => { turnRef.current = turn; }, [turn]);
  useEffect(() => { myPlayerRoleRef.current = myPlayerRole; }, [myPlayerRole]);
  useEffect(() => { gameRuleModeRef.current = gameRuleMode; }, [gameRuleMode]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);

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

  // 📥 FETCH USER PROFILE BALANCE & CARROM ENTRY FEE FROM DATABASE
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

      // Fetch dynamic entry cost from `games` table
      const { data: gameData } = await supabase
        .from("games")
        .select("entry_fee")
        .ilike("title", "Carrom")
        .single();

      if (gameData && typeof gameData.entry_fee === "number") {
        setEntryFee(gameData.entry_fee);
      }
    };

    fetchGameData();
  }, []);

  // 🔒 CHECK POINTS & DEDUCT VIA CENTRAL MATCH MANAGER
  const checkPointsAndDeduct = async (): Promise<boolean> => {
    const result = await processGameEntry({
      gameTitle: "Carrom",
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

    if (result.updatedPoints !== undefined) {
      setUserPoints(result.updatedPoints);
    }

    if (result.matchId) {
      setHistoryMatchId(result.matchId);
    }

    return true;
  };

  // 🏆 RECORD MATCH RESULT WHEN WINNER IS DETERMINED
  useEffect(() => {
    if (winner === null || !historyMatchId) return;

    const isWin = winner === myPlayerRole;
    const outcomeResult = isWin ? "Win" : "Loss";
    const rewardPoints = isWin ? entryFee * 2 : 0;

    recordMatchResult(historyMatchId, outcomeResult, rewardPoints);
  }, [winner, historyMatchId, myPlayerRole, entryFee]);

  // 🤝 SAFE RULE PARSER & BOT HANDLER
  useEffect(() => {
    if (isBotMode) {
      if (localOpponent?.name) {
        setToast({ msg: `Playing against ${localOpponent.name}`, type: 'success' });
      }
      return;
    }

    if (preloadedMatchId && myUserId) {
      if (preloadedMatchId.startsWith("bot_")) return;
      
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
  }, [preloadedMatchId, myUserId, isBotMode, localOpponent]);

  // -------------------------------------------------------------
  // ⏱️ 30-SECOND TURN TIMER SYSTEM
  // -------------------------------------------------------------
  useEffect(() => {
    if (playMode === "menu" || playMode === "searching" || playMode === "confirmed" || winner) return;
    if (isMovingRef.current) return;

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
  }, [turn, turnNonce, winner, playMode]);

  const handleTimeOut = () => {
    if (isMovingRef.current || winner) return;
    soundEngine.playSFX("defeat");

    if (playMode === "bot" && turn === 2) {
      setToast({ msg: `${localOpponent?.name || "Bot"} timed out! Auto shooting...`, type: 'foul' });
      triggerBotShot();
    } else {
      const nextTurn = turn === 1 ? 2 : 1;
      setToast({ msg: "Time's up! Turn lost.", type: 'foul' });
      
      const currentCoins = coinsRef.current;
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

      if (playMode === "online" && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'turn_sync',
          payload: {
            coins: currentCoins,
            nextTurn,
            p1S: p1ScoreRef.current,
            p2S: p2ScoreRef.current,
            win: null,
            p1C: p1ColorRef.current,
            p2C: p2ColorRef.current,
            msg: "Time's up! Turn lost.",
            msgType: 'foul',
            rulesMode: gameRuleModeRef.current
          }
        });
      }

      setTurn(nextTurn);
      setTurnNonce(prev => prev + 1);
    }
  };

  // -------------------------------------------------------------
  // 🤖 LOCAL BOT ENGINE
  // -------------------------------------------------------------
  const triggerBotShot = useCallback(() => {
    if (isMovingRef.current) return;

    const currentCoins = coinsRef.current;
    const striker = currentCoins.find(c => c.type === "striker");
    if (!striker) return;

    let targetTypes = ["white", "black", "queen"];
    if (gameRuleMode === "classic" && p2ColorRef.current) {
      targetTypes = [p2ColorRef.current, "queen"];
    }
    
    const targets = currentCoins.filter(c => c.active && targetTypes.includes(c.type));
    if (targets.length === 0) return;

    const target = targets[Math.floor(Math.random() * targets.length)];
    
    const botX = Math.max(220, Math.min(780, target.x + (Math.random() * 40 - 20)));
    setP2Slider(botX);
    striker.x = botX; 
    striker.y = 160;

    setTimeout(() => {
      if (isMovingRef.current) return;

      const dx = target.x - botX;
      const dy = target.y - 160; 
      const dist = Math.hypot(dx, dy);
      
      const botPower = 180 + Math.random() * 80; 
      const powerMultiplier = 0.22;
      const vx = (dx / dist) * botPower * powerMultiplier;
      const vy = (dy / dist) * botPower * powerMultiplier;

      turnSnapshotRef.current = JSON.parse(JSON.stringify(coinsRef.current));
      striker.vx = vx;
      striker.vy = vy;
      isMovingRef.current = true;
      didIShootRef.current = true; 
      
      soundEngine.playSFX("strike");
      requestAnimationFrame(physicsLoop);

      if (Math.random() <= 0.25) {
        const reactionDelay = Math.floor(Math.random() * 1000) + 800;
        setTimeout(() => {
          const randomEmote = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
          const newEmoji = { id: Date.now() + Math.random(), emoji: randomEmote, role: 2 };
          setFloatingEmojis((prev) => [...prev, newEmoji]);
          setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
        }, reactionDelay);
      }
    }, 800);
  }, [gameRuleMode]);

  useEffect(() => {
    if (playMode === "bot" && turn === 2 && !winner) {
      const thinkingDelay = Math.floor(Math.random() * 1500) + 1200;

      const botActionDelay = setTimeout(() => {
        if (isMovingRef.current) return;
        triggerBotShot();
      }, thinkingDelay);

      return () => clearTimeout(botActionDelay);
    }
  }, [turn, turnNonce, playMode, winner, gameRuleMode, triggerBotShot]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  // 📡 STABILIZED MULTIPLAYER REAL-TIME SYNC HUB
  const shouldConnect = matchId && myUserId && playMode !== "menu" && playMode !== "local" && playMode !== "bot" && playMode !== "searching" && playMode !== "confirmed";

  useEffect(() => {
    if (!shouldConnect) return;

    const channel = supabase.channel(`carrom_${matchId}`, { 
      config: { 
        broadcast: { ack: false, self: false },
        presence: { key: myUserId }
      } 
    });
    
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const connectedPlayers = Object.keys(state).length;

        if (connectedPlayers === 2 && playModeRef.current === "host") {
          setPlayMode("online");
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
        } else if (connectedPlayers === 2 && playModeRef.current === "join") {
          setPlayMode("online");
          setToast({ msg: "Connected to Host Matrix!", type: "success" });
        } else if (connectedPlayers < 2 && playModeRef.current === "online") {
          setToast({ msg: "Opponent Disconnected! You Win.", type: "success" });
          setWinner(myPlayerRoleRef.current);
          soundEngine.playSFX("victory");
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
          soundEngine.playSFX("strike");
          strikerObj.x = startX;
          strikerObj.y = turnRef.current === 1 ? 840 : 160;
          strikerObj.vx = vx;
          strikerObj.vy = vy;
          isMovingRef.current = true;
          didIShootRef.current = false; 
          turnSnapshotRef.current = JSON.parse(JSON.stringify(coinsRef.current));
          requestAnimationFrame(physicsLoop);
        }
      })
      .on('broadcast', { event: 'turn_sync' }, (payload) => {
        const { coins, nextTurn, p1S, p2S, win, p1C, p2C, msg, msgType, rulesMode } = payload.payload;
        coinsRef.current = coins;
        setTurn(nextTurn); 
        setTurnNonce(prev => prev + 1);
        
        setP1Score(p1S); p1ScoreRef.current = p1S;
        setP2Score(p2S); p2ScoreRef.current = p2S;
        setP1Color(p1C); p1ColorRef.current = p1C;
        setP2Color(p2C); p2ColorRef.current = p2C;
        
        setWinner(win);
        
        if (rulesMode) setGameRuleMode(rulesMode);
        
        setP1Slider(500); 
        setP2Slider(500);
        if (msg) setToast({ msg, type: msgType });
        if (win) soundEngine.playSFX("victory");
        setRenderTrigger(prev => prev + 1);
      })
      .on('broadcast', { event: 'emoji' }, (payload) => {
        const { emoji, role } = payload.payload;
        const newEmoji = { id: Date.now() + Math.random(), emoji, role };
        setFloatingEmojis((prev) => [...prev, newEmoji]);
        setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== newEmoji.id)), 2500);
      });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
         await channel.track({ online_at: new Date().toISOString(), role: myPlayerRoleRef.current });
      }
    });

    return () => { 
      supabase.removeChannel(channel); 
      channelRef.current = null;
    };
  }, [shouldConnect]);

  const updateOnlineRules = (mode: GameMode) => {
     soundEngine.playSFX("click");
     setGameRuleMode(mode);
     if (channelRef.current) {
        channelRef.current.send({ type: 'broadcast', event: 'change_rules', payload: { mode } });
     }
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
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    setMatchId(joinCode.toUpperCase()); 
    setMyPlayerRole(2); 
    setPlayMode("join");
  };

  const startOnlineMatchmaking = async () => {
    soundEngine.playSFX("click");
    const canPlay = await checkPointsAndDeduct();
    if (!canPlay) return;

    setPlayMode("searching");
    setTimeout(() => {
      setPlayMode(prev => {
        if (prev === "searching") {
          setLocalOpponent(getRandomBotOpponent());
          return "confirmed";
        }
        return prev;
      });
    }, 2800);
  };

  const enterBotMatch = () => {
    soundEngine.playSFX("click");
    setMatchId(`bot_match_${Date.now()}`);
    setMyPlayerRole(1);
    setPlayMode("bot");
    setToast({ msg: `Playing against ${localOpponent?.name || 'Bot'}`, type: 'success' });
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
      if (hitWall && Math.hypot(c1.vx, c1.vy) > 2) {
        soundEngine.playSFX("move");
      }

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
          soundEngine.playSFX(c1.type === "striker" ? "defeat" : "capture");
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
          
          if (Math.abs(p) > 1) {
            soundEngine.playSFX("move");
          }
        }
      }
    }

    setRenderTrigger(prev => prev + 1);

    if (moving) {
      requestAnimationFrame(physicsLoop);
    } else {
      isMovingRef.current = false;
      if (playMode === "local" || playMode === "bot" || didIShootRef.current) {
        evaluateTurnEnd();
        didIShootRef.current = false;
      }
    }
  };

  // 🎯 EVALUATE TURN END (ACCURATE SCORE RETENTION VIA REFS)
  const evaluateTurnEnd = () => {
    const prevCoins = turnSnapshotRef.current;
    const currentCoins = coinsRef.current;
    
    const pocketedThisTurn = currentCoins.filter(c => !c.active && prevCoins.find(p => p.id === c.id)?.active);
    const strikerFoul = pocketedThisTurn.some(c => c.type === "striker");
    
    let newP1Score = p1ScoreRef.current; 
    let newP2Score = p2ScoreRef.current;
    let newP1Color = p1ColorRef.current; 
    let newP2Color = p2ColorRef.current;
    let nextTurn = turnRef.current; 
    let fouled = false;
    let validPocket = false;
    let turnMsg = ""; 
    let msgType: 'foul' | 'info' | 'success' = 'info';

    if (strikerFoul) {
      fouled = true;
      if (gameRuleModeRef.current === "freestyle") {
        if (turnRef.current === 1) newP1Score = Math.max(0, newP1Score - 5);
        else newP2Score = Math.max(0, newP2Score - 5);
      }
    }

    pocketedThisTurn.forEach(c => {
      if (c.type === "queen") {
        validPocket = true;
        if (gameRuleModeRef.current === "freestyle") {
          if (turnRef.current === 1) newP1Score += 5; else newP2Score += 5;
        }
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
            if (turnRef.current === 1) {
              newP1Color = c.type;
              newP2Color = c.type === "white" ? "black" : "white";
            } else {
              newP2Color = c.type;
              newP1Color = c.type === "white" ? "black" : "white";
            }
          } else {
            const myColor = turnRef.current === 1 ? newP1Color : newP2Color;
            if (c.type === myColor) {
              validPocket = true;
            } else {
              fouled = true;
            }
          }
        }
      }
    });

    if (fouled) {
      turnMsg = "Foul! Turn Lost.";
      msgType = "foul";
      soundEngine.playSFX("defeat");
      nextTurn = turnRef.current === 1 ? 2 : 1;
    } else if (validPocket) {
      turnMsg = "Good Shot! Extra Turn.";
      msgType = "success";
      soundEngine.playSFX("capture");
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

    // --- WIN CONDITION EVALUATION ---
    let win: 1 | 2 | null = null;
    const whitesLeft = currentCoins.filter(c => c.type === "white" && c.active).length;
    const blacksLeft = currentCoins.filter(c => c.type === "black" && c.active).length;
    
    if (gameRuleModeRef.current === "classic") {
       if (newP1Color) {
         const p1Left = newP1Color === "white" ? whitesLeft : blacksLeft;
         const p2Left = newP2Color === "white" ? whitesLeft : blacksLeft;
         if (p1Left === 0) win = 1;
         else if (p2Left === 0) win = 2;
       }
    } else {
       if (whitesLeft === 0 && blacksLeft === 0) {
         win = newP1Score > newP2Score ? 1 : (newP2Score > newP1Score ? 2 : 1);
       }
    }

    if (win) {
      soundEngine.playSFX("victory");
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
    setTurnNonce(prev => prev + 1);
    
    setP1Score(newP1Score); p1ScoreRef.current = newP1Score;
    setP2Score(newP2Score); p2ScoreRef.current = newP2Score;
    setP1Color(newP1Color); p1ColorRef.current = newP1Color;
    setP2Color(newP2Color); p2ColorRef.current = newP2Color;
    
    setWinner(win);
  };

  const handlePointerDown = (e: React.PointerEvent, coinId: string) => {
    if (coinId !== "striker" || isMovingRef.current || winner) return;
    if (playMode === "online" && turn !== myPlayerRole) return;
    if (playMode === "bot" && turn === 2) return;
    setIsAiming(true);
  };

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
      didIShootRef.current = true; 
      soundEngine.playSFX("strike");
      
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
    soundEngine.playSFX("click");
    coinsRef.current = generateInitialCoins();
    setWinner(null); 
    setTurn(1);
    setTurnNonce(0);
    setTimeLeft(TURN_TIME_LIMIT);
    setP1Slider(500); 
    setP2Slider(500);
    
    setP1Score(0); p1ScoreRef.current = 0;
    setP2Score(0); p2ScoreRef.current = 0;
    setP1Color(null); p1ColorRef.current = null;
    setP2Color(null); p2ColorRef.current = null;
    
    setRenderTrigger(prev => prev + 1);
  };

  const handleToggleMute = () => {
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  const sendEmoji = (emoji: string) => {
    soundEngine.playSFX("click");
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
    soundEngine.playSFX("click");
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExitGame = () => {
    soundEngine.playSFX("click");
    onClose();
  };

  // --- DYNAMIC HUD VARIABLES ---
  const topRole: 1 | 2 = playMode === 'local' || playMode === 'bot' ? 2 : (myPlayerRole === 1 ? 2 : 1);
  const bottomRole: 1 | 2 = playMode === 'local' || playMode === 'bot' ? 1 : myPlayerRole as 1 | 2;
  const activeStriker = coinsRef.current.find(c => c.type === "striker");
  const aimDist = Math.hypot(aimVector.x, aimVector.y);
  const isMaxPower = aimDist >= MAX_POWER - 2;

  const renderPlayerHUD = (role: 1 | 2, position: 'top' | 'bottom') => {
    const isMyTurn = turn === role;
    
    const isBot = role === 2 && (localOpponent?.isBot || playMode === "bot");
    const canUseSlider = isMyTurn && !winner && !isBot && (playMode === 'local' || myPlayerRole === role);
    const currentSlider = role === 1 ? p1Slider : p2Slider;
    const setCurrentSlider = role === 1 ? setP1Slider : setP2Slider;
    const roleScore = role === 1 ? p1Score : p2Score;
    const roleColor = role === 1 ? p1Color : p2Color;

    // Display Name Logic
    let roleName = role === 1 ? "You" : "Player 2";
    if (isBot) {
      roleName = localOpponent?.name || opponent?.name || "Apex Bot";
    } else if (playMode === "online") {
      roleName = myPlayerRole === role ? "You" : (localOpponent?.name || "Opponent");
    }

    let turnText = `Player ${turn} Turn`;
    if (playMode === "online" || playMode === "bot") {
      if (isMyTurn) turnText = myPlayerRole === role ? "Your Shot" : `${roleName} Aiming`;
      else turnText = myPlayerRole === role ? "Wait" : `${roleName} Aiming`;
    }

    let scoreDisplay = `${roleScore} PTS`;
    if (gameRuleMode === "classic") {
      if (!roleColor) {
        scoreDisplay = "UNASSIGNED";
      } else {
        const remaining = coinsRef.current.filter(c => c.type === roleColor && c.active).length;
        scoreDisplay = `${roleColor.toUpperCase()} (${remaining} LEFT)`;
      }
    }

    const headerContent = (
      <div className="w-full flex justify-between items-end px-2">
         <div className={`flex flex-col items-start transition-all ${isMyTurn ? "opacity-100" : "opacity-40 grayscale"}`}>
           <div className="flex items-center gap-1.5 mb-0.5">
             <span className="text-xs font-black text-white tracking-wider uppercase">{roleName}</span>
             {isBot && (
               <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[8px] px-1.5 py-0.2 rounded uppercase font-black tracking-wider shadow-sm">
                 BOT
               </span>
             )}
           </div>
           <span className="text-[11px] font-mono font-bold text-neutral-400">{scoreDisplay}</span>
           
           <div className="flex items-center gap-2 mt-1">
             {role === 1 ? (
               <div className="w-8 h-8 rounded-full bg-[#f4ebd4] border-2 border-[#d6c7b0] flex items-center justify-center text-[#6b5f4c] text-[10px] font-bold shadow-md">
                 P1
               </div>
             ) : (
               <div className="flex items-center gap-1.5">
                 <div className="w-8 h-8 rounded-full bg-indigo-500/20 border-2 border-indigo-500/40 flex items-center justify-center text-indigo-300 text-sm shadow-md">
                   <span className="material-symbols-outlined text-[16px]">
                     {isBot ? (localOpponent?.avatarIcon || "smart_toy") : "person"}
                   </span>
                 </div>
               </div>
             )}
             {roleColor && (
               <div className={`w-4 h-4 rounded-full border border-neutral-400 ${roleColor === 'white' ? 'bg-[#f3ead3]' : 'bg-[#141414]'}`}></div>
             )}
           </div>
         </div>

         {/* 30-SECOND TIMER & TURN STATUS BADGE */}
         <div className="flex flex-col items-end gap-1">
           {isMyTurn && (
             <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border shadow-sm backdrop-blur-md transition-colors ${
               timeLeft <= 5 ? "bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse" : "bg-[#18181b] border-white/10 text-[#CCFF00]"
             }`}>
               <span className="material-symbols-outlined text-xs">timer</span>
               <span className="font-mono font-black text-xs">{timeLeft}s</span>
             </div>
           )}
           <div className="px-3 py-1 bg-[#18181b] rounded-full shadow-sm border border-white/10 text-[9px] font-black uppercase tracking-widest text-neutral-200">
             {turnText}
           </div>
         </div>
      </div>
    );

    const sliderContent = (
      <div className={`w-full max-w-[280px] bg-[#18181b] border border-white/10 p-2.5 rounded-xl shadow-sm transition-opacity ${canUseSlider ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
         <input type="range" min={220} max={780} step={2} value={currentSlider} onChange={(e) => setCurrentSlider(Number(e.target.value))} disabled={isMovingRef.current || !canUseSlider} className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#CCFF00] touch-manipulation" />
      </div>
    );

    return (
      <div className="w-full flex flex-col items-center px-4 gap-2 shrink-0">
        {position === 'top' ? <>{headerContent}{sliderContent}</> : <>{sliderContent}{headerContent}</>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#09090b] flex flex-col items-center justify-center pt-safe animate-fade-in overflow-hidden transition-colors select-none">
      
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

      {/* 🚫 INSUFFICIENT POINTS MODAL */}
      {showNoPointsModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-6 animate-fade-in touch-none">
          <div className="bg-[#18181b] border border-rose-500/30 rounded-[28px] p-6 w-full max-w-[340px] shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-3xl text-rose-400">monetization_on</span>
            </div>

            <h3 className="font-headline font-black text-xl text-white uppercase tracking-tight mb-1">
              Insufficient Points
            </h3>
            
            <p className="text-xs text-neutral-400 font-medium leading-relaxed mb-4">
              You need <span className="text-[#CCFF00] font-bold">{entryFee} PTS</span> to play an online Carrom match.
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
                  onClose();
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

            <p className="text-[9px] text-neutral-500 mt-4">
              💡 Tip: Claim free daily login rewards or earn points in local practice!
            </p>
          </div>
        </div>
      )}

      {/* ARENA LOBBY PANEL */}
      {playMode === "menu" && (
        <div className="absolute inset-0 z-50 bg-[#09090b] flex items-center justify-center p-6">
          <div className="w-full max-w-[360px] bg-[#18181b] rounded-[32px] p-6 shadow-2xl border border-white/5 flex flex-col relative overflow-hidden">
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-2xl text-neutral-300">sports_esports</span>
              </div>
              <div>
                <h1 className="font-headline font-black text-xl tracking-tight text-white">Carrom Arena</h1>
                <p className="text-xs text-neutral-400 font-medium mt-0.5">Select engagement mode</p>
              </div>
            </div>

            <div className="bg-[#09090b] border border-white/5 p-1 rounded-xl flex items-center mb-6">
              <button 
                onClick={() => { soundEngine.playSFX("click"); setGameRuleMode("freestyle"); }} 
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all touch-manipulation ${gameRuleMode === "freestyle" ? "bg-[#18181b] text-white shadow-sm border border-white/10" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                Freestyle
              </button>
              <button 
                onClick={() => { soundEngine.playSFX("click"); setGameRuleMode("classic"); }} 
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all touch-manipulation ${gameRuleMode === "classic" ? "bg-[#18181b] text-white shadow-sm border border-white/10" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                Classic
              </button>
            </div>

            <button onClick={startOnlineMatchmaking} className="group relative w-full bg-[#09090b] border border-white/10 hover:border-[#CCFF00]/50 rounded-[24px] p-5 mb-4 text-left transition-all hover:bg-white/5 touch-manipulation">
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
              <h3 className="font-headline font-black text-lg text-white mb-1 group-hover:text-[#CCFF00] transition-colors">Find Online Match</h3>
              <p className="text-xs text-neutral-400 font-medium leading-relaxed">Ranked & casual global<br/>matchmaking</p>
            </button>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button onClick={hostMatch} className="group bg-[#09090b] border border-white/10 hover:border-teal-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px] touch-manipulation">
                <div className="flex justify-between items-start w-full">
                  <div className="w-9 h-9 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-400">
                    <span className="material-symbols-outlined text-lg">dns</span>
                  </div>
                  <span className="bg-teal-500/10 text-teal-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Private</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-sm text-white mb-0.5">Host Match</h3>
                  <p className="text-[10px] text-neutral-400 font-medium">Create room code</p>
                </div>
              </button>

              <button onClick={() => { soundEngine.playSFX("click"); setPlayMode("local"); }} className="group bg-[#09090b] border border-white/10 hover:border-pink-500/50 rounded-[24px] p-4 text-left transition-all hover:bg-white/5 flex flex-col justify-between min-h-[140px] touch-manipulation">
                <div className="flex justify-between items-start w-full">
                  <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center text-pink-400">
                    <span className="material-symbols-outlined text-lg">sports_esports</span>
                  </div>
                  <span className="bg-pink-500/10 text-pink-400 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">Offline</span>
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
                className="shrink-0 bg-[#18181b] hover:bg-white/10 disabled:opacity-50 text-white px-5 py-3.5 rounded-2xl font-headline font-bold text-xs tracking-wider transition-all border border-white/5 touch-manipulation"
              >
                Join
              </button>
            </div>

            <button onClick={handleExitGame} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors font-headline text-[10px] font-bold tracking-widest uppercase touch-manipulation">
              <span className="material-symbols-outlined text-sm">logout</span> EXIT ARENA
            </button>

          </div>
        </div>
      )}

      {/* LOCATING OPPONENT SCREEN */}
      {playMode === "searching" && (
        <div className="absolute inset-0 z-[60] bg-[#09090b] flex flex-col items-center justify-center p-6 animate-fade-in">
          <div className="relative w-32 h-32 flex items-center justify-center mb-8">
            <div className="absolute inset-0 border border-[#CCFF00]/30 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
            <div className="absolute inset-4 border border-[#CCFF00]/20 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
            <div className="absolute inset-8 border border-[#CCFF00]/10 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }}></div>
            <div className="w-16 h-16 bg-[#CCFF00]/10 rounded-full flex items-center justify-center border border-[#CCFF00]/20 relative z-10">
              <span className="material-symbols-outlined text-3xl text-[#CCFF00]">search</span>
            </div>
          </div>
          <h2 className="font-headline font-black text-2xl text-white mb-2 uppercase">Locating Opponent</h2>
          <p className="text-sm text-[#CCFF00] font-bold mb-12 animate-pulse">Searching global matchmaking pool...</p>
          <button onClick={() => { soundEngine.playSFX("click"); setPlayMode("menu"); }} className="bg-[#18181b] text-white px-8 py-3 rounded-full font-headline font-bold text-sm border border-white/10 hover:bg-white/10 transition-colors active:scale-95 uppercase touch-manipulation">
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

          <button onClick={enterBotMatch} className="w-full max-w-[280px] bg-[#CCFF00] hover:bg-[#b3e600] text-black py-4 rounded-2xl font-headline font-black text-lg flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_30px_rgba(204,255,0,0.2)] touch-manipulation">
            Enter Match <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}

      {/* HEADER HUB */}
      {playMode !== "menu" && playMode !== "searching" && playMode !== "confirmed" && (
        <div className="w-full max-w-md px-6 py-4 flex items-center justify-between border-b border-white/10 bg-[#18181b]/80 backdrop-blur-md z-30 shrink-0">
          <button 
            onClick={handleExitGame} 
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 shadow-sm touch-manipulation"
          >
            <span className="material-symbols-outlined text-lg text-white">close</span>
          </button>
          
          <div className="text-center flex flex-col items-center">
            <h1 className="text-sm font-black uppercase tracking-widest text-white">Carrom Matrix</h1>
            
            {playMode === "online" && myPlayerRole === 1 ? (
               <div className="flex bg-[#09090b] p-0.5 rounded-md mt-1 scale-90 border border-white/10">
                  <button 
                    onClick={() => updateOnlineRules("freestyle")} 
                    className={`px-2 py-0.5 text-[8px] uppercase tracking-wider font-bold rounded ${gameRuleMode === 'freestyle' ? 'bg-[#18181b] text-[#CCFF00] shadow-sm' : 'text-neutral-400'}`}
                  >
                    Freestyle
                  </button>
                  <button 
                    onClick={() => updateOnlineRules("classic")} 
                    className={`px-2 py-0.5 text-[8px] uppercase tracking-wider font-bold rounded ${gameRuleMode === 'classic' ? 'bg-[#18181b] text-[#CCFF00] shadow-sm' : 'text-neutral-400'}`}
                  >
                    Classic
                  </button>
               </div>
            ) : (
               <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${playMode === "online" || playMode === "bot" ? "text-emerald-500 animate-pulse" : (playMode === "host" || playMode === "join") ? "text-amber-500 animate-pulse" : "text-neutral-400"}`}>
                 {playMode === "online" || playMode === "bot" ? `● ${gameRuleMode.toUpperCase()}` : (playMode === "host" || playMode === "join") ? "Connecting..." : "Local Mode"}
               </span>
            )}
          </div>
          
          <div className="flex gap-2 relative">
            <button 
              onClick={handleToggleMute} 
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-sm active:scale-90 touch-manipulation"
            >
              <span className="material-symbols-outlined text-lg">{isMuted ? "volume_off" : "volume_up"}</span>
            </button>
            <button 
              onClick={() => { soundEngine.playSFX("click"); setShowEmojiMenu(!showEmojiMenu); }} 
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-sm active:scale-90 touch-manipulation"
            >
              <span className="material-symbols-outlined text-lg">add_reaction</span>
            </button>
            
            {showEmojiMenu && (
              <div className="absolute top-12 right-0 bg-[#18181b] border border-white/10 p-2 rounded-2xl shadow-xl flex gap-1 z-50">
                {EMOJIS.map(em => (
                  <button 
                    key={em} 
                    onClick={() => sendEmoji(em)} 
                    className="text-xl hover:scale-125 transition-transform p-1 touch-manipulation"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
            
            <button 
              onClick={() => { soundEngine.playSFX("click"); setShowRules(true); }} 
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400 shadow-sm touch-manipulation"
            >
              <span className="material-symbols-outlined text-lg">info</span>
            </button>
          </div>
        </div>
      )}

      {/* WAITING SCREEN */}
      {(playMode === "host" || playMode === "join") && (
        <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center p-6 relative z-10">
          <div className="bg-[#18181b] border border-white/10 rounded-[2.5rem] p-8 w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/20 blur-3xl rounded-full pointer-events-none"></div>
            <div className="w-16 h-16 rounded-full border-[3px] border-amber-500/20 border-t-amber-500 animate-spin mb-6 relative z-10"></div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase relative z-10">
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
                      copied ? "bg-emerald-500 text-white" : "bg-white/10 text-white border border-white/10 hover:bg-white/20 active:scale-95"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <button 
              onClick={() => { soundEngine.playSFX("click"); playMode === "host" ? setPlayMode("menu") : onClose(); }} 
              className="w-full mt-8 py-3.5 bg-white/5 hover:bg-white/10 text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all relative z-10 touch-manipulation"
            >
              Cancel Match
            </button>
          </div>
        </div>
      )}

      {showRules && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#18181b] border border-white/10 rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-xl">
            <h3 className="text-base font-black uppercase tracking-wider text-white">Carrom Guidelines</h3>
            <ul className="text-left text-xs space-y-3 text-neutral-400 font-medium">
              {gameRuleMode === "freestyle" ? (
                <>
                  <li>🔸 <strong className="text-[#CCFF00]">Freestyle Points:</strong> White = 3, Black = 2, Queen = 5.</li>
                  <li>🔸 Potting ANY coin grants an extra turn.</li>
                </>
              ) : (
                <>
                  <li>🔸 <strong className="text-[#CCFF00]">Classic Mode:</strong> Potting the first coin dictates your assigned color.</li>
                  <li>🔸 Clear all your assigned color pieces to win!</li>
                  <li>🔸 Potting OPPONENT color is a foul.</li>
                </>
              )}
              <li>🔸 Sinking the striker is a foul (-5 PTS in Freestyle) and ends your turn.</li>
            </ul>
            <button 
              onClick={() => { soundEngine.playSFX("click"); setShowRules(false); }} 
              className="w-full mt-2 py-3 bg-[#CCFF00] text-black font-bold text-xs uppercase tracking-wider rounded-xl touch-manipulation"
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 animate-slide-down pointer-events-none">
          <div className={`px-5 py-2.5 rounded-full shadow-lg border backdrop-blur-md flex items-center gap-2 ${toast.type === 'foul' ? 'bg-rose-500/90 border-rose-400 text-white' : toast.type === 'success' ? 'bg-[#CCFF00]/90 border-[#CCFF00] text-black' : 'bg-[#18181b]/90 border-white/10 text-white'}`}>
            <span className="material-symbols-outlined text-sm">{toast.type === 'foul' ? 'warning' : toast.type === 'success' ? 'check_circle' : 'info'}</span>
            <span className={`text-[10px] font-black uppercase tracking-widest ${toast.type === 'success' ? 'text-black' : 'text-white'}`}>{toast.msg}</span>
          </div>
        </div>
      )}

      {(playMode === "local" || playMode === "online" || playMode === "bot") && (
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
                <div className="relative bg-[#18181b] border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center text-center z-50 animate-scale-up">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#CCFF00] to-emerald-500 text-black flex items-center justify-center mb-4 shadow-lg border-4 border-[#CCFF00] animate-bounce">
                    <span className="material-symbols-outlined text-3xl">emoji_events</span>
                  </div>
                  <h3 className="text-[10px] font-black text-[#CCFF00] tracking-widest uppercase mb-1">Victory Sequence</h3>
                  <h2 className="text-3xl font-black tracking-tight uppercase text-white">Arena Cleared!</h2>
                  <p className="text-xs text-neutral-400 font-medium mt-3 px-2 leading-relaxed">
                    {playMode === "online" || playMode === "bot" ? (winner === myPlayerRole ? "Incredible skill! You claimed complete server victory." : "The opponent cleared the board.") : `Player ${winner} has completely pocketed their target roster!`}
                  </p>
                  <div className="w-full flex gap-3 mt-8">
                    <button 
                      onClick={handleExitGame} 
                      className="flex-1 py-3 bg-white/5 border border-white/10 text-neutral-300 font-bold text-xs uppercase rounded-xl active:scale-95 transition-all shadow-sm touch-manipulation"
                    >
                      Exit
                    </button>
                    <button 
                      onClick={handleRematch} 
                      className="flex-1 py-3 bg-[#CCFF00] text-black font-bold text-xs uppercase rounded-xl active:scale-95 transition-all shadow-md hover:bg-[#b3e600] touch-manipulation"
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
                    
                    {/* Neon Glow Striker Cosmetic Gradient */}
                    <radialGradient id="vNeonStriker" cx="35%" cy="30%" r="70%">
                      <stop offset="0%" stopColor="#CCFF00" />
                      <stop offset="60%" stopColor="#88cc00" />
                      <stop offset="100%" stopColor="#334400" />
                    </radialGradient>
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
                        stroke={isMaxPower ? "#ef4444" : (isNeonStriker ? "#CCFF00" : "#4f46e5")} 
                        strokeWidth="8" 
                        strokeDasharray="12 12" 
                        strokeLinecap="round" 
                        opacity="0.8" 
                      />
                      <circle 
                        cx={activeStriker.x + aimVector.x} 
                        cy={activeStriker.y + aimVector.y} 
                        r={activeStriker.radius} 
                        fill={isMaxPower ? "#ef4444" : (isNeonStriker ? "#CCFF00" : "#4f46e5")} 
                        opacity="0.2" 
                      />
                    </>
                  )}

                  {coinsRef.current.map(coin => {
                    if (!coin.active) return null;
                    let fillMat = ""; 
                    let edgeStroke = ""; 
                    let interiorRing = "";
                    
                    if (coin.type === "striker") { 
                      fillMat = isNeonStriker ? "url(#vNeonStriker)" : "url(#vStriker)"; 
                      edgeStroke = isNeonStriker ? "#CCFF00" : "#8695a0"; 
                      interiorRing = isNeonStriker ? "#a3e600" : "#61737e"; 
                    }
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
                          className={coin.type === "striker" && !isMovingRef.current && ((playMode === "online" && turn === myPlayerRole) || (playMode === "local" && turn === 1) || (playMode === "local" && turn === 2) || (playMode === "bot" && turn === 1)) ? "cursor-grab active:cursor-grabbing" : ""} 
                        />
                        <circle r={coin.radius * 0.68} fill="none" stroke={interiorRing} strokeWidth="1.5" opacity="0.6" pointerEvents="none" />
                        <circle r={coin.radius * 0.36} fill="none" stroke={interiorRing} strokeWidth="1" opacity="0.5" pointerEvents="none" />
                        {coin.type === "striker" && <circle r="6" fill={isNeonStriker ? "#000000" : "#ef4444"} opacity="0.8" pointerEvents="none"/>}
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