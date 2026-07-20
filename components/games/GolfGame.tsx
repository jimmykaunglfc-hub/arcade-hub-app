"use client";

import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import { supabase } from "../../lib/supabaseClient";

// --- COURSE BLUEPRINTS ---
const COURSE = [
  {
    id: 1,
    name: "The Basics",
    par: 2,
    ball: { x: 0.5, y: 0.85 },
    hole: { x: 0.5, y: 0.15 },
    obstacles: [
      { type: 'sand', x: 0.2, y: 0.5, w: 0.35, h: 0.15 },
      { type: 'sand', x: 0.8, y: 0.5, w: 0.35, h: 0.15 }
    ]
  },
  {
    id: 2,
    name: "Bank Shot",
    par: 3,
    ball: { x: 0.5, y: 0.85 },
    hole: { x: 0.5, y: 0.15 },
    obstacles: [
      { type: 'wall', x: 0.5, y: 0.5, w: 0.6, h: 0.04 },
      { type: 'water', x: 0.5, y: 0.35, w: 0.45, h: 0.12 }
    ]
  },
  {
    id: 3,
    name: "Island Green",
    par: 3,
    ball: { x: 0.5, y: 0.9 },
    hole: { x: 0.5, y: 0.2 },
    obstacles: [
      { type: 'water', x: 0.5, y: 0.55, w: 1.0, h: 0.2 },
      { type: 'water', x: 0.15, y: 0.2, w: 0.3, h: 0.4 },
      { type: 'water', x: 0.85, y: 0.2, w: 0.3, h: 0.4 }
    ]
  }
];

export default function GolfGame() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [earnedCredits, setEarnedCredits] = useState(0);

  const [isAiming, setIsAiming] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentDrag, setCurrentDrag] = useState({ x: 0, y: 0 });
  
  const [currentHole, setCurrentHole] = useState(0);
  const [holeStrokes, setHoleStrokes] = useState(0);
  const [totalStrokes, setTotalStrokes] = useState(0);
  
  const [holeCompleted, setHoleCompleted] = useState(false);
  const [courseCompleted, setCourseCompleted] = useState(false);
  
  const lastShotPos = useRef({ x: 400, y: 500 });
  const holeCompletedRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserId(session.user.id);
    });
  }, []);

  const initGame = (holeIndex: number) => {
    if (typeof window === "undefined" || !sceneRef.current) return;

    if (engineRef.current) {
      Matter.Engine.clear(engineRef.current);
      if (renderRef.current) {
        Matter.Render.stop(renderRef.current);
        renderRef.current.canvas.remove();
      }
    }

    const engine = Matter.Engine.create();
    engine.world.gravity.y = 0; 
    engine.world.gravity.x = 0;
    engineRef.current = engine;

    const w = window.innerWidth > 800 ? 800 : window.innerWidth;
    const h = window.innerHeight > 600 ? 600 : window.innerHeight - 150;
    
    const level = COURSE[holeIndex];
    lastShotPos.current = { x: w * level.ball.x, y: h * level.ball.y };

    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: w,
        height: h,
        wireframes: false,
        background: 'transparent', // Transparent to show the CSS grass behind it!
      }
    });
    renderRef.current = render;

    // 1. Visually enhanced Ball
    const ball = Matter.Bodies.circle(w * level.ball.x, h * level.ball.y, 11, {
      label: 'ball', restitution: 0.8, friction: 0.01, frictionAir: 0.03, density: 0.04, 
      render: { fillStyle: '#ffffff', strokeStyle: '#cccccc', lineWidth: 1 }
    });
    ballRef.current = ball;

    // 2. Visually enhanced Hole (Cup Rim + Dark Center)
    const holeRim = Matter.Bodies.circle(w * level.hole.x, h * level.hole.y, 18, {
      isStatic: true, isSensor: true, render: { fillStyle: '#e5e7eb' }
    });
    const hole = Matter.Bodies.circle(w * level.hole.x, h * level.hole.y, 14, {
      label: 'hole', isStatic: true, isSensor: true, render: { fillStyle: '#111827' }
    });

    // 3. Organic Obstacles using `chamfer` (rounded edges)
    const dynamicObstacles = level.obstacles.map(obs => {
      if (obs.type === 'sand') {
        return Matter.Bodies.rectangle(w * obs.x, h * obs.y, w * obs.w, h * obs.h, { 
          label: 'sand', isStatic: true, isSensor: true, chamfer: { radius: 25 },
          render: { fillStyle: '#DEB887' } // Richer sand color
        });
      } else if (obs.type === 'water') {
        return Matter.Bodies.rectangle(w * obs.x, h * obs.y, w * obs.w, h * obs.h, { 
          label: 'water', isStatic: true, isSensor: true, chamfer: { radius: 20 },
          render: { fillStyle: '#3BA4D4' } // Pool water blue
        });
      } else {
        // Wooden inner walls
        return Matter.Bodies.rectangle(w * obs.x, h * obs.y, w * obs.w, h * obs.h, { 
          label: 'wall', isStatic: true, restitution: 0.6, chamfer: { radius: 8 },
          render: { fillStyle: '#8B5A2B' } // Wood tone
        });
      }
    });

    // 4. Wooden Outer Bumpers
    const wallOptions = { isStatic: true, render: { fillStyle: '#5C4033' } };
    const walls = [
      Matter.Bodies.rectangle(w/2, 0, w, 50, wallOptions), 
      Matter.Bodies.rectangle(w/2, h, w, 50, wallOptions), 
      Matter.Bodies.rectangle(w, h/2, 50, h, wallOptions), 
      Matter.Bodies.rectangle(0, h/2, 50, h, wallOptions)  
    ];

    Matter.World.add(engine.world, [holeRim, hole, ball, ...dynamicObstacles, ...walls]);
    Matter.Render.run(render);
    Matter.Runner.run(Matter.Runner.create(), engine);

    Matter.Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        
        if ((bodyA.label === 'ball' && bodyB.label === 'hole') || (bodyB.label === 'ball' && bodyA.label === 'hole')) {
          if (!holeCompletedRef.current) {
            holeCompletedRef.current = true;
            setHoleCompleted(true);
            Matter.Body.setVelocity(ballRef.current!, { x: 0, y: 0 });
          }
        }
        if ((bodyA.label === 'ball' && bodyB.label === 'sand') || (bodyB.label === 'ball' && bodyA.label === 'sand')) {
          if (ballRef.current) ballRef.current.frictionAir = 0.15; 
        }
        if ((bodyA.label === 'ball' && bodyB.label === 'water') || (bodyB.label === 'ball' && bodyA.label === 'water')) {
          setHoleStrokes(prev => prev + 1);
          Matter.Body.setVelocity(ballRef.current!, { x: 0, y: 0 });
          Matter.Body.setPosition(ballRef.current!, { x: lastShotPos.current.x, y: lastShotPos.current.y });
        }
      }
    });

    Matter.Events.on(engine, 'collisionEnd', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        if ((bodyA.label === 'ball' && bodyB.label === 'sand') || (bodyB.label === 'ball' && bodyA.label === 'sand')) {
          if (ballRef.current) ballRef.current.frictionAir = 0.03; 
        }
      }
    });

    return { render, engine };
  };

  useEffect(() => {
    holeCompletedRef.current = false;
    const gameSetup = initGame(currentHole);
    return () => {
      if (gameSetup) {
        Matter.Render.stop(gameSetup.render);
        if (gameSetup.render.canvas) gameSetup.render.canvas.remove();
        Matter.World.clear(gameSetup.engine.world, false);
        Matter.Engine.clear(gameSetup.engine);
      }
    };
  }, [currentHole]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ballRef.current || holeCompleted || courseCompleted) return;
    setIsAiming(true);
    const rect = sceneRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setCurrentDrag({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming) return;
    const rect = sceneRef.current?.getBoundingClientRect();
    if (rect) setCurrentDrag({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerUp = () => {
    if (!isAiming || !ballRef.current || holeCompleted || courseCompleted) return;
    setIsAiming(false);
    
    const dx = dragStart.x - currentDrag.x;
    const dy = dragStart.y - currentDrag.y;
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      lastShotPos.current = { x: ballRef.current.position.x, y: ballRef.current.position.y };
      setHoleStrokes(prev => prev + 1);
      Matter.Body.applyForce(ballRef.current, ballRef.current.position, { x: dx * 0.0005, y: dy * 0.0005 });
    }
  };

  const calculateCourseRewards = async (finalTotalStrokes: number) => {
    if (!userId) return;
    setIsSyncing(true);
    const totalPar = COURSE.reduce((sum, hole) => sum + hole.par, 0);
    let creditsToAward = 15; 
    
    if (finalTotalStrokes === COURSE.length) creditsToAward = 100; 
    else if (finalTotalStrokes <= totalPar - 2) creditsToAward = 50; 
    else if (finalTotalStrokes < totalPar) creditsToAward = 30; 
    else if (finalTotalStrokes > totalPar + 3) creditsToAward = 5; 

    setEarnedCredits(creditsToAward);

    try {
      const { data: profile } = await supabase.from("profiles").select("points").eq("id", userId).single();
      await supabase.from("profiles").update({ points: (profile?.points ?? 0) + creditsToAward }).eq("id", userId);
      await supabase.from("transactions").insert({
        user_id: userId, amount: creditsToAward, transaction_type: "match_reward",
        description: `Golf Practice Mode: Scored ${finalTotalStrokes} on a Par ${totalPar} course.`
      });
    } catch (err) {
      console.error("Ledger sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const advanceToNextHole = () => {
    const newTotal = totalStrokes + holeStrokes;
    setTotalStrokes(newTotal);
    setHoleStrokes(0);
    setHoleCompleted(false);

    if (currentHole + 1 < COURSE.length) setCurrentHole(prev => prev + 1);
    else {
      setCourseCompleted(true);
      calculateCourseRewards(newTotal);
    }
  };

  const restartCourse = () => {
    setCourseCompleted(false);
    setHoleCompleted(false);
    setTotalStrokes(0);
    setHoleStrokes(0);
    setEarnedCredits(0);
    setCurrentHole(0);
  };

  const getAimColor = () => {
    const dist = Math.sqrt(Math.pow(dragStart.x - currentDrag.x, 2) + Math.pow(dragStart.y - currentDrag.y, 2));
    if (dist > 150) return "#ef4444";
    if (dist > 100) return "#f97316";
    if (dist > 50) return "#eab308";
    return "#ffffff"; // Modern white aiming line transitioning to heat colors
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full text-white bg-black font-body">
      
      {/* --- PREMIUM HUD --- */}
      <div className="absolute top-[80px] left-4 right-4 z-[101] flex justify-between items-start pointer-events-none">
        
        {/* Left Side: Course Info */}
        <div className="bg-white/10 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/20 shadow-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center text-indigo-300 font-black">
            {currentHole + 1}
          </div>
          <div>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Par {COURSE[currentHole].par}</p>
            <p className="text-sm font-black text-white">{COURSE[currentHole].name}</p>
          </div>
        </div>

        {/* Right Side: Scores */}
        <div className="bg-white/10 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-white/20 shadow-2xl flex items-center gap-5">
          <div className="flex flex-col items-center">
            <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest mb-0.5">Strokes</p>
            <p className="text-2xl font-black text-white leading-none">{holeStrokes}</p>
          </div>
          <div className="w-[1px] h-8 bg-white/20"></div>
          <div className="flex flex-col items-center">
            <p className="text-[9px] text-white/50 font-bold uppercase tracking-widest mb-0.5">Total</p>
            <p className="text-2xl font-black text-indigo-400 leading-none">{totalStrokes}</p>
          </div>
        </div>
      </div>

      {/* --- MOWED GRASS RENDERER --- */}
      <div 
        ref={sceneRef} 
        // This CSS creates the alternating mowed lawn pattern behind the transparent physics engine
        className="rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] border-4 border-[#3c2a21] relative touch-none mt-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, #4d8c39, #4d8c39 40px, #468034 40px, #468034 80px)'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {isAiming && (
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10" style={{ filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.5))' }}>
            <line x1={dragStart.x} y1={dragStart.y} x2={currentDrag.x} y2={currentDrag.y} stroke={getAimColor()} strokeWidth="3" strokeDasharray="6 6" />
            <circle cx={dragStart.x} cy={dragStart.y} r="18" stroke="rgba(255,255,255,0.8)" strokeWidth="2" fill="none" />
            <circle cx={dragStart.x} cy={dragStart.y} r="2" fill="white" />
          </svg>
        )}

        {/* OVERLAYS */}
        {holeCompleted && !courseCompleted && (
          <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in">
            <h2 className="text-5xl font-black text-white mb-2 tracking-tighter drop-shadow-lg">HOLE IN {holeStrokes}!</h2>
            <div className="h-1 w-12 bg-indigo-500 rounded-full mb-6"></div>
            <button 
              onClick={advanceToNextHole}
              className="bg-white text-neutral-900 px-8 py-3.5 rounded-full font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-xl"
            >
              Next Hole
            </button>
          </div>
        )}

        {courseCompleted && (
          <div className="absolute inset-0 z-20 bg-gradient-to-b from-[#091428]/90 to-black/90 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in p-6 text-center border border-indigo-500/30">
            <div className="w-16 h-16 bg-amber-400/20 rounded-full flex items-center justify-center mb-4 border border-amber-400/50 shadow-[0_0_30px_rgba(251,191,36,0.3)]">
              <span className="material-symbols-outlined text-4xl text-amber-400">emoji_events</span>
            </div>
            
            <h2 className="text-3xl font-black text-white tracking-tight">COURSE CLEARED</h2>
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-2 mb-6">Completed in {totalStrokes} Strokes</p>
            
            <div className="w-full max-w-[200px] bg-white/5 border border-white/10 px-6 py-4 rounded-2xl flex flex-col items-center mb-8 shadow-inner">
              <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mb-1">Match Reward</span>
              {isSyncing ? (
                <span className="text-white font-black text-xl animate-pulse">Syncing...</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-400 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>monetization_on</span>
                  <span className="text-white font-black text-3xl">+{earnedCredits}</span>
                </div>
              )}
            </div>
            
            <button 
              onClick={restartCourse}
              disabled={isSyncing}
              className="w-full max-w-[200px] bg-indigo-600 text-white px-6 py-4 rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_10px_20px_rgba(79,70,229,0.3)] disabled:opacity-50"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
      
    </div>
  );
}