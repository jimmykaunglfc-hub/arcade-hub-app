"use client";

import { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

export default function PracticeMode() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  // UI States for Aiming
  const [isAiming, setIsAiming] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentDrag, setCurrentDrag] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!sceneRef.current) return;

    // 1. Setup Engine & World
    const engine = Matter.Engine.create();
    // Golf is top-down usually, but if side-view, keep gravity. 
    // Let's assume a top-down view (0 gravity on Y axis, friction acts as the ground).
    engine.world.gravity.y = 0; 
    engine.world.gravity.x = 0;
    engineRef.current = engine;

    // 2. Setup Renderer
    const render = Matter.Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: 800,
        height: 600,
        wireframes: false,
        background: '#2d5a27', // Grass green
      }
    });
    renderRef.current = render;

    // 3. Create the Golf Ball
    const ball = Matter.Bodies.circle(400, 500, 10, {
      restitution: 0.8, // Bounciness
      friction: 0.01,
      frictionAir: 0.03, // Rolling resistance (grass)
      density: 0.04,
      render: { fillStyle: '#ffffff' }
    });
    ballRef.current = ball;

    // 4. Create Course Boundaries (Walls)
    const walls = [
      Matter.Bodies.rectangle(400, 0, 800, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), // Top
      Matter.Bodies.rectangle(400, 600, 800, 50, { isStatic: true, render: { fillStyle: '#1a3317' } }), // Bottom
      Matter.Bodies.rectangle(800, 300, 50, 600, { isStatic: true, render: { fillStyle: '#1a3317' } }), // Right
      Matter.Bodies.rectangle(0, 300, 50, 600, { isStatic: true, render: { fillStyle: '#1a3317' } })  // Left
    ];

    // 5. Add bodies to world and start
    Matter.World.add(engine.world, [ball, ...walls]);
    Matter.Render.run(render);
    
    // Create a runner for smooth 60fps updates
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    // Cleanup on unmount
    return () => {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) render.canvas.remove();
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, []);

  // --- INPUT HANDLING (Aim & Shoot) ---
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!ballRef.current) return;
    setIsAiming(true);
    
    // Capture the exact starting coordinates of the drag
    const rect = sceneRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setCurrentDrag({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isAiming) return;
    const rect = sceneRef.current?.getBoundingClientRect();
    if (rect) {
      setCurrentDrag({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handlePointerUp = () => {
    if (!isAiming || !ballRef.current) return;
    setIsAiming(false);

    // Calculate vector (direction and distance)
    const dx = dragStart.x - currentDrag.x;
    const dy = dragStart.y - currentDrag.y;
    
    // Calculate Force multiplier (simulating club power)
    const forceMultiplier = 0.0005; 
    
    // Apply the physical force to the ball
    Matter.Body.applyForce(ballRef.current, ballRef.current.position, {
      x: dx * forceMultiplier,
      y: dy * forceMultiplier
    });
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[#111c33] min-h-screen">
      <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-4">Practice Range</h2>
      
      {/* Physics Canvas Container */}
      <div 
        ref={sceneRef} 
        className="rounded-2xl overflow-hidden shadow-2xl border-4 border-white/10 relative cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Draw Aiming Line UI Overlay */}
        {isAiming && (
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
            <line 
              x1={dragStart.x} 
              y1={dragStart.y} 
              x2={currentDrag.x} 
              y2={currentDrag.y} 
              stroke="#c3f400" 
              strokeWidth="4" 
              strokeDasharray="8 8"
            />
            {/* Draw Ball Origin Indicator */}
            <circle cx={dragStart.x} cy={dragStart.y} r="15" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>

      <p className="text-white/50 text-xs font-bold uppercase tracking-widest mt-6">
        Click and drag backward to aim and power your shot. Release to swing.
      </p>
    </div>
  );
}