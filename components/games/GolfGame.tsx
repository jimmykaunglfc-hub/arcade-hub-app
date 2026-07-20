"use client";

import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

// --- COURSE BLUEPRINTS ---
// We use multipliers (0.0 to 1.0) so the course scales perfectly to any phone screen size.
const COURSE = [
  {
    id: 1,
    name: "The Basics",
    ball: { x: 0.5, y: 0.85 },
    hole: { x: 0.5, y: 0.15 },
    obstacles: [
      { type: 'sand', x: 0.2, y: 0.5, w: 0.3, h: 0.15 },
      { type: 'sand', x: 0.8, y: 0.5, w: 0.3, h: 0.15 }
    ]
  },
  {
    id: 2,
    name: "Bank Shot",
    ball: { x: 0.5, y: 0.85 },
    hole: { x: 0.5, y: 0.15 },
    obstacles: [
      { type: 'wall', x: 0.5, y: 0.5, w: 0.6, h: 0.05 },
      { type: 'water', x: 0.5, y: 0.3, w: 0.4, h: 0.1 }
    ]
  },
  {
    id: 3,
    name: "Island Green",
    ball: { x: 0.5, y: 0.9 },
    hole: { x: 0.5, y: 0.2 },
    obstacles: [
      { type: 'water', x: 0.5, y: 0.5, w: 1.0, h: 0.2 },
      { type: 'water', x: 0.2, y: 0.2, w: 0.3, h: 0.4 },
      { type: 'water', x: 0.8, y: 0.2, w: 0.3, h: 0.4 }
    ]
  }
];

export default function GolfGame() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  // Game States
  const [isAiming, setIsAiming] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentDrag, setCurrentDrag] = useState({ x: 0, y: 0 });
  
  const [currentHole, setCurrentHole] = useState(0);
  const [holeStrokes, setHoleStrokes] = useState(0);
  const [totalStrokes, setTotalStrokes] = useState(0);
  
  const [holeCompleted, setHoleCompleted] = useState(false);
  const [courseCompleted, setCourseCompleted] = useState(false);
  
  // Refs to avoid stale closures in Matter.js event listeners
  const lastShotPos = useRef({ x: 400, y: 500 });
  const holeCompletedRef = useRef(false);

  const initGame = (holeIndex: number) => {
    if (typeof window === "undefined" || !sceneRef.current) return;

    // Clean up previous level
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
        background: '#2d5a27', 
      }
    });
    renderRef.current = render;

    // 1. The Ball
    const ball = Matter.Bodies.circle(w * level.ball.x, h * level.ball.y, 10, {
      label: 'ball',
      restitution: 0.8, 
      friction: 0.01,
      frictionAir: 0.03, 
      density: 0.04,
      render: { fillStyle: '#ffffff' }
    });
    ballRef.current = ball;

    // 2. The Hole
    const hole = Matter.Bodies.circle(w * level.hole.x, h * level.hole.y, 16, {
      label: 'hole',
      isStatic: true,
      isSensor: true, 
      render: { fillStyle: '#000000' }
    });

    // 3. Generate Level Obstacles Dynamically
    const dynamicObstacles = level.obstacles.map(obs => {
      if (obs.type === 'sand') {
        return Matter.Bodies.rectangle(w * obs.x, h * obs.y, w * obs.w, h * obs.h, {
          label: 'sand', isStatic: true, isSensor: true, render: { fillStyle: '#e6c27a' }
        });
      } else if (obs.type === 'water') {
        return Matter.Bodies.rectangle(w * obs.x, h * obs.y, w * obs.w, h * obs.h, {
          label: 'water', isStatic: true, isSensor: true, render: { fillStyle: '#3498db' }
        });
      } else {
        // Solid Wall
        return Matter.Bodies.rectangle(w * obs.x, h * obs.y, w * obs.w, h * obs.h, {
          label: 'wall', isStatic: true, restitution: 0.6, render: { fillStyle: '#1a3317' }
        });
      }
    });

    // 4. Outer Boundaries
    const walls = [
      Matter.Bodies.rectangle(w/2, 0, w, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(w/2, h, w, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(w, h/2, 50, h, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(0, h/2, 50, h, { isStatic: true, render: { fillStyle: '#1a3317' } })  
    ];

    Matter.World.add(engine.world, [hole, ball, ...dynamicObstacles, ...walls]);
    Matter.Render.run(render);
    
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    // --- PHYSICS RULES & COLLISION EVENTS ---
    Matter.Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        
        // WIN CONDITION: Ball hits Hole
        if ((bodyA.label === 'ball' && bodyB.label === 'hole') || (bodyB.label === 'ball' && bodyA.label === 'hole')) {
          if (!holeCompletedRef.current) {
            holeCompletedRef.current = true;
            setHoleCompleted(true);
            Matter.Body.setVelocity(ballRef.current!, { x: 0, y: 0 });
          }
        }

        // SAND TRAP: Increase friction heavily
        if ((bodyA.label === 'ball' && bodyB.label === 'sand') || (bodyB.label === 'ball' && bodyA.label === 'sand')) {
          if (ballRef.current) ballRef.current.frictionAir = 0.15; 
        }

        // WATER HAZARD: +1 Penalty and Reset Position
        if ((bodyA.label === 'ball' && bodyB.label === 'water') || (bodyB.label === 'ball' && bodyA.label === 'water')) {
          setHoleStrokes(prev => prev + 1); // Penalty stroke
          Matter.Body.setVelocity(ballRef.current!, { x: 0, y: 0 });
          Matter.Body.setPosition(ballRef.current!, { 
            x: lastShotPos.current.x, 
            y: lastShotPos.current.y 
          });
        }
      }
    });

    // Leaving Sand Trap: Restore normal friction
    Matter.Events.on(engine, 'collisionEnd', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        if ((bodyA.label === 'ball' && bodyB.label === 'sand') || (bodyB.label === 'ball' && bodyA.label === 'sand')) {
          if (ballRef.current) ballRef.current.frictionAir = 0.03; 
        }
      }
    });

    return { render, runner, engine };
  };

  // Re-initialize engine whenever the current hole changes
  useEffect(() => {
    holeCompletedRef.current = false;
    const gameSetup = initGame(currentHole);
    return () => {
      if (gameSetup) {
        Matter.Render.stop(gameSetup.render);
        Matter.Runner.stop(gameSetup.runner);
        if (gameSetup.render.canvas) gameSetup.render.canvas.remove();
        Matter.World.clear(gameSetup.engine.world, false);
        Matter.Engine.clear(gameSetup.engine);
      }
    };
  }, [currentHole]);

  // --- CONTROLS ---
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
      // Save position for water resets BEFORE shooting
      lastShotPos.current = { x: ballRef.current.position.x, y: ballRef.current.position.y };
      
      setHoleStrokes(prev => prev + 1);
      
      // Calculate Force
      let forceX = dx * 0.0005;
      let forceY = dy * 0.0005;
      
      Matter.Body.applyForce(ballRef.current, ballRef.current.position, { x: forceX, y: forceY });
    }
  };

  // --- LEVEL PROGRESSION ---
  const advanceToNextHole = () => {
    setTotalStrokes(prev => prev + holeStrokes);
    setHoleStrokes(0);
    setHoleCompleted(false);

    if (currentHole + 1 < COURSE.length) {
      setCurrentHole(prev => prev + 1);
    } else {
      setCourseCompleted(true);
    }
  };

  const restartCourse = () => {
    setCourseCompleted(false);
    setHoleCompleted(false);
    setTotalStrokes(0);
    setHoleStrokes(0);
    setCurrentHole(0);
  };

  const getAimColor = () => {
    const dist = Math.sqrt(Math.pow(dragStart.x - currentDrag.x, 2) + Math.pow(dragStart.y - currentDrag.y, 2));
    if (dist > 150) return "#ff3333"; // Red (Max Power)
    if (dist > 100) return "#ff9933"; // Orange
    if (dist > 50) return "#ffff33";  // Yellow
    return "#33ff33";                 // Green (Low Power)
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full h-full text-white">
      
      {/* 🏆 MULTI-HOLE HUD */}
      <div className="absolute top-16 left-6 right-6 z-[101] flex justify-between items-start pointer-events-none">
        
        <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
          <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest text-center">Hole {currentHole + 1} / {COURSE.length}</p>
          <p className="text-sm font-black text-white text-center">{COURSE[currentHole].name}</p>
        </div>

        <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg pointer-events-auto flex gap-4">
          <div>
            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest text-center">Strokes</p>
            <p className="text-xl font-black text-white text-center leading-none">{holeStrokes}</p>
          </div>
          <div className="w-[1px] bg-white/20"></div>
          <div>
            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest text-center">Total</p>
            <p className="text-xl font-black text-indigo-400 text-center leading-none">{totalStrokes}</p>
          </div>
        </div>

      </div>

      {/* 🎮 PHYSICS CANVAS */}
      <div 
        ref={sceneRef} 
        className="rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 relative touch-none mt-10"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {isAiming && (
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
            <line 
              x1={dragStart.x} y1={dragStart.y} 
              x2={currentDrag.x} y2={currentDrag.y} 
              stroke={getAimColor()} 
              strokeWidth="4" 
              strokeDasharray="8 8" 
            />
            <circle cx={dragStart.x} cy={dragStart.y} r="15" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
          </svg>
        )}

        {/* 🟢 HOLE COMPLETED OVERLAY */}
        {holeCompleted && !courseCompleted && (
          <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
            <h2 className="text-4xl font-black text-white mb-2 tracking-tight">HOLE IN {holeStrokes}!</h2>
            <button 
              onClick={advanceToNextHole}
              className="mt-6 bg-[#c3f400] text-black px-6 py-3 rounded-full font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_0_20px_rgba(195,244,0,0.4)]"
            >
              Next Hole
            </button>
          </div>
        )}

        {/* 🏁 COURSE COMPLETED OVERLAY (Prep for Phase 3) */}
        {courseCompleted && (
          <div className="absolute inset-0 z-20 bg-[#091428] backdrop-blur-lg flex flex-col items-center justify-center animate-fade-in border border-indigo-500/30">
            <span className="material-symbols-outlined text-5xl text-amber-400 mb-2">emoji_events</span>
            <h2 className="text-3xl font-black text-white tracking-tight">COURSE CLEARED</h2>
            <p className="text-white/70 text-sm font-bold uppercase tracking-widest mb-6 mt-1">Final Score: {totalStrokes + holeStrokes} Strokes</p>
            
            <button 
              onClick={restartCourse}
              className="bg-indigo-600 text-white px-6 py-3 rounded-full font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_0_20px_rgba(79,70,229,0.5)]"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
      
    </div>
  );
}