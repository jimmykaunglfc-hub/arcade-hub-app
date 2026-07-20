"use client";

import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

export default function GolfGame() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  // Game States
  const [isAiming, setIsAiming] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentDrag, setCurrentDrag] = useState({ x: 0, y: 0 });
  const [strokes, setStrokes] = useState(0);
  const [gameWon, setGameWon] = useState(false);

  // Initialize the physics engine
  const initGame = () => {
    if (typeof window === "undefined" || !sceneRef.current) return;

    // Clear old engine if restarting
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

    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: window.innerWidth > 800 ? 800 : window.innerWidth,
        height: window.innerHeight > 600 ? 600 : window.innerHeight - 150,
        wireframes: false,
        background: '#2d5a27', 
      }
    });
    renderRef.current = render;

    const w = render.options.width || 800;
    const h = render.options.height || 600;

    // 1. Create the Ball
    const ball = Matter.Bodies.circle(w / 2, h - 100, 10, {
      label: 'ball',
      restitution: 0.8, 
      friction: 0.01,
      frictionAir: 0.03, 
      density: 0.04,
      render: { fillStyle: '#ffffff' }
    });
    ballRef.current = ball;

    // 2. Create the Hole (isSensor means it doesn't bounce the ball away)
    const hole = Matter.Bodies.circle(w / 2, 100, 16, {
      label: 'hole',
      isStatic: true,
      isSensor: true, 
      render: { fillStyle: '#000000' }
    });

    // 3. Create Walls
    const walls = [
      Matter.Bodies.rectangle(w/2, 0, w, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(w/2, h, w, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(w, h/2, 50, h, { isStatic: true, render: { fillStyle: '#1a3317' } }), 
      Matter.Bodies.rectangle(0, h/2, 50, h, { isStatic: true, render: { fillStyle: '#1a3317' } })  
    ];

    Matter.World.add(engine.world, [hole, ball, ...walls]);
    Matter.Render.run(render);
    
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    // 4. Collision Detection (Did ball hit hole?)
    Matter.Events.on(engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const { bodyA, bodyB } = pairs[i];
        if (
          (bodyA.label === 'ball' && bodyB.label === 'hole') ||
          (bodyB.label === 'ball' && bodyA.label === 'hole')
        ) {
          setGameWon(true);
          Matter.Body.setVelocity(ballRef.current!, { x: 0, y: 0 }); // Stop the ball
        }
      }
    });

    return { render, runner, engine };
  };

  useEffect(() => {
    const gameSetup = initGame();
    return () => {
      if (gameSetup) {
        Matter.Render.stop(gameSetup.render);
        Matter.Runner.stop(gameSetup.runner);
        if (gameSetup.render.canvas) gameSetup.render.canvas.remove();
        Matter.World.clear(gameSetup.engine.world, false);
        Matter.Engine.clear(gameSetup.engine);
      }
    };
  }, []);

  // Controls
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ballRef.current || gameWon) return;
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
    if (!isAiming || !ballRef.current || gameWon) return;
    setIsAiming(false);
    
    const dx = dragStart.x - currentDrag.x;
    const dy = dragStart.y - currentDrag.y;
    
    // Only count as a stroke if they actually pulled back
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      setStrokes(prev => prev + 1);
      Matter.Body.applyForce(ballRef.current, ballRef.current.position, {
        x: dx * 0.0005,
        y: dy * 0.0005
      });
    }
  };

  const restartGame = () => {
    setGameWon(false);
    setStrokes(0);
    initGame();
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full h-full text-white">
      
      {/* Score HUD */}
      <div className="absolute top-8 right-8 z-[101] bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg">
        <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest text-center">Strokes</p>
        <p className="text-2xl font-black text-white text-center leading-none">{strokes}</p>
      </div>

      <div 
        ref={sceneRef} 
        className="rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 relative touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {isAiming && (
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
            <line x1={dragStart.x} y1={dragStart.y} x2={currentDrag.x} y2={currentDrag.y} stroke="#c3f400" strokeWidth="4" strokeDasharray="8 8" />
            <circle cx={dragStart.x} cy={dragStart.y} r="15" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
          </svg>
        )}

        {/* Win Overlay */}
        {gameWon && (
          <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
            <h2 className="text-4xl font-black text-white mb-2 tracking-tight">HOLE IN {strokes}!</h2>
            <p className="text-white/70 text-sm font-bold uppercase tracking-widest mb-6">Course Completed</p>
            <button 
              onClick={restartGame}
              className="bg-[#c3f400] text-black px-6 py-3 rounded-full font-black text-sm uppercase tracking-widest hover:scale-105 transition-transform shadow-[0_0_20px_rgba(195,244,0,0.4)]"
            >
              Play Again
            </button>
          </div>
        )}
      </div>
      
      {!gameWon && (
        <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mt-6 text-center z-10">
          Drag backwards to aim and swing.
        </p>
      )}
    </div>
  );
}