"use client";

export type GameAudioEffect =
  | "ping_pong_paddle"
  | "cue_shot"
  | "ball_pocket"
  | "cue_scratch"
  | "carrom_strike"
  | "carrom_pocket"
  | "chess_move";

/** High-frequency game events recreated with code from the supplied references. */
export type PhysicalAudioEffect =
  | "ping_pong_paddle"
  | "ping_pong_table"
  | "ping_pong_net"
  | "cue_shot"
  | "ball_pocket"
  | "cue_scratch"
  | "pool_ball_hit"
  | "pool_cushion"
  | "snooker_ball_hit"
  | "snooker_cushion"
  | "carrom_strike"
  | "carrom_pocket"
  | "carrom_hit"
  | "carrom_cushion"
  | "chess_move"
  | "card_place_light"
  | "card_place_heavy"
  | "dice_shake"
  | "dice_roll";

type GameplayClip =
  | "pingPongPaddle"
  | "pingPongTable"
  | "pingPongNet"
  | "cueStrike"
  | "ballCollision"
  | "railCollision"
  | "pocketEdge"
  | "pocketDrop"
  | "cueScratch"
  | "carromStrike"
  | "carromCollision"
  | "carromBoundary"
  | "carromPocket"
  | "chessDrop"
  | "cardSoft"
  | "cardPlace"
  | "cardSlap"
  | "diceImpact"
  | "diceShake";

type GameplayPlayback = {
  intensity?: number;
  position?: number;
  loop?: boolean;
};

type ClipDefinition = {
  files: readonly string[];
  minGain: number;
  maxGain: number;
  cooldownMs: number;
  maxVoices: number;
};

// These are game-ready derivatives of the player's supplied recordings. The
// originals are kept outside the app bundle and are never modified here.
const GAMEPLAY_CLIPS: Record<GameplayClip, ClipDefinition> = {
  pingPongPaddle: { files: ["/game-sfx/ping-paddle-1.m4a", "/game-sfx/ping-paddle-2.m4a", "/game-sfx/ping-paddle-3.m4a", "/game-sfx/ping-paddle-4.m4a"], minGain: 0.12, maxGain: 0.38, cooldownMs: 14, maxVoices: 6 },
  pingPongTable: { files: ["/game-sfx/ping-paddle-2.m4a", "/game-sfx/ping-paddle-4.m4a"], minGain: 0.07, maxGain: 0.23, cooldownMs: 28, maxVoices: 4 },
  pingPongNet: { files: ["/game-sfx/ping-paddle-3.m4a"], minGain: 0.06, maxGain: 0.18, cooldownMs: 55, maxVoices: 2 },
  cueStrike: { files: ["/game-sfx/cue-strike.m4a"], minGain: 0.14, maxGain: 0.43, cooldownMs: 42, maxVoices: 3 },
  ballCollision: { files: ["/game-sfx/ball-collision.m4a"], minGain: 0.05, maxGain: 0.30, cooldownMs: 12, maxVoices: 10 },
  railCollision: { files: ["/game-sfx/ball-collision.m4a"], minGain: 0.04, maxGain: 0.20, cooldownMs: 24, maxVoices: 6 },
  pocketEdge: { files: ["/game-sfx/pocket-edge.m4a"], minGain: 0.09, maxGain: 0.30, cooldownMs: 70, maxVoices: 4 },
  pocketDrop: { files: ["/game-sfx/pocket-drop.m4a"], minGain: 0.12, maxGain: 0.36, cooldownMs: 90, maxVoices: 4 },
  cueScratch: { files: ["/game-sfx/cue-scratch.m4a"], minGain: 0.12, maxGain: 0.34, cooldownMs: 160, maxVoices: 2 },
  carromStrike: { files: ["/game-sfx/carrom-hit-1.m4a", "/game-sfx/carrom-hit-2.m4a"], minGain: 0.12, maxGain: 0.38, cooldownMs: 50, maxVoices: 4 },
  carromCollision: { files: ["/game-sfx/carrom-hit-1.m4a", "/game-sfx/carrom-hit-2.m4a"], minGain: 0.05, maxGain: 0.27, cooldownMs: 14, maxVoices: 10 },
  carromBoundary: { files: ["/game-sfx/carrom-boundary.m4a"], minGain: 0.06, maxGain: 0.22, cooldownMs: 34, maxVoices: 5 },
  carromPocket: { files: ["/game-sfx/carrom-pocket.m4a"], minGain: 0.11, maxGain: 0.34, cooldownMs: 80, maxVoices: 4 },
  chessDrop: { files: ["/game-sfx/chess-drop.m4a"], minGain: 0.10, maxGain: 0.30, cooldownMs: 60, maxVoices: 3 },
  cardSoft: { files: ["/game-sfx/card-place-soft.m4a"], minGain: 0.07, maxGain: 0.18, cooldownMs: 42, maxVoices: 4 },
  cardPlace: { files: ["/game-sfx/card-place-1.m4a", "/game-sfx/card-place-2.m4a"], minGain: 0.09, maxGain: 0.25, cooldownMs: 38, maxVoices: 5 },
  cardSlap: { files: ["/game-sfx/card-place-slap.m4a"], minGain: 0.12, maxGain: 0.34, cooldownMs: 70, maxVoices: 3 },
  diceImpact: { files: ["/game-sfx/dice-impact.m4a"], minGain: 0.08, maxGain: 0.27, cooldownMs: 40, maxVoices: 6 },
  diceShake: { files: ["/game-sfx/dice-shake-loop.m4a"], minGain: 0.05, maxGain: 0.18, cooldownMs: 100, maxVoices: 1 },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSource: string | null = null;
  private lastCarromSound = new Map<string, number>();
  private gameplayBuffers = new Map<GameplayClip, AudioBuffer[]>();
  private gameplayLoads = new Map<GameplayClip, Promise<AudioBuffer[]>>();
  private activeGameplaySources = new Map<GameplayClip, AudioBufferSourceNode[]>();
  private clipCursor = new Map<GameplayClip, number>();
  private diceShakeSource: AudioBufferSourceNode | null = null;
  private outputPrimed = false;

  constructor() {
    // AudioContext is initialized lazily. A looping shake must never resume
    // unexpectedly after the app returns from the background.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stopDiceShake();
      });

      // WKWebView will keep Web Audio suspended if the context is created by a
      // game-screen preload rather than by a physical interaction. Listen in
      // the capture phase so the context is unlocked before a button, canvas,
      // or Phaser/Matter handler starts the first game action.
      const unlockFromGesture = () => this.unlockForUserGesture();
      document.addEventListener("pointerdown", unlockFromGesture, { capture: true, passive: true });
      document.addEventListener("touchend", unlockFromGesture, { capture: true, passive: true });
      document.addEventListener("keydown", unlockFromGesture, { capture: true });
    }
  }

  private initContext(resume = true) {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (resume && this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {
        // The first physical user gesture will resume audio on mobile browsers.
      });
    }
  }

  /**
   * Resume and prime the Web Audio output while a real user interaction is in
   * progress. This is required by iOS Safari/WKWebView; Android is more
   * forgiving, which is why the same game clips could work there only.
   */
  public unlockForUserGesture() {
    this.initContext(false);
    if (!this.ctx) return;

    const context = this.ctx;
    if (context.state === "suspended") {
      // Call resume synchronously from the gesture stack. Do not await it:
      // awaiting would lose iOS's user-activation allowance.
      const resume = context.resume();
      this.primeOutput(context);
      void resume.then(() => this.primeOutput(context)).catch(() => {
        // Another physical gesture will retry the unlock.
      });
      return;
    }

    this.primeOutput(context);
  }

  /** Starts one inaudible sample so iOS attaches the Web Audio graph to its output. */
  private primeOutput(context: AudioContext) {
    if (this.outputPrimed || context.state !== "running") return;
    try {
      const buffer = context.createBuffer(1, 1, context.sampleRate);
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      source.start(context.currentTime);
      source.stop(context.currentTime + 0.001);
      this.outputPrimed = true;
    } catch {
      // Safe to retry from the next physical gesture if the context is not
      // ready yet (for example immediately after returning from background).
    }
  }

  /** A tiny, original noise transient for physical impacts; no recorded samples are used. */
  private playNoiseBurst(now: number, duration: number, volume: number, frequency: number) {
    if (!this.ctx) return;
    const frameCount = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frameCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
    }

    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, now);
    filter.Q.setValueAtTime(0.8, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(now);
    source.stop(now + duration);
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== "undefined") localStorage.setItem("joeyoke_sound_enabled", muted ? "false" : "true");
    if (this.bgmAudio) this.bgmAudio.muted = muted;
    if (muted) this.stopDiceShake();
  }

  public restorePreference() {
    if (typeof window === "undefined") return;
    this.isMuted = localStorage.getItem("joeyoke_sound_enabled") === "false";
    if (this.bgmAudio) this.bgmAudio.muted = this.isMuted;
  }

  public getMutedState(): boolean {
    return this.isMuted;
  }

  private clipsForGameEffect(effect: GameAudioEffect): GameplayClip[] {
    const clips: Record<GameAudioEffect, GameplayClip[]> = {
      ping_pong_paddle: ["pingPongPaddle"],
      cue_shot: ["cueStrike"],
      ball_pocket: ["pocketEdge", "pocketDrop"],
      cue_scratch: ["cueScratch"],
      carrom_strike: ["carromStrike"],
      carrom_pocket: ["carromPocket"],
      chess_move: ["chessDrop"],
    };
    return clips[effect];
  }

  private loadGameplayClip(clip: GameplayClip): Promise<AudioBuffer[]> {
    const cached = this.gameplayBuffers.get(clip);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.gameplayLoads.get(clip);
    if (inFlight) return inFlight;
    if (!this.ctx || typeof window === "undefined") return Promise.resolve([]);

    const load = Promise.all(
      GAMEPLAY_CLIPS[clip].files.map(async (src) => {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Unable to load gameplay SFX: ${src}`);
        return this.ctx!.decodeAudioData(await response.arrayBuffer());
      })
    ).catch(() => [] as AudioBuffer[]).then((buffers) => {
      if (buffers.length) this.gameplayBuffers.set(clip, buffers);
      return buffers;
    });
    this.gameplayLoads.set(clip, load);
    return load;
  }

  /** Preloads source-derived SFX while the game screen is opening. */
  public preloadGameSFX(effects: readonly GameAudioEffect[]) {
    this.initContext(false);
    effects.flatMap((effect) => this.clipsForGameEffect(effect)).forEach((clip) => {
      void this.loadGameplayClip(clip);
    });
  }

  public preloadPhysicalSFX(effects: readonly PhysicalAudioEffect[]) {
    this.initContext(false);
    effects.map((effect) => this.clipForPhysicalEffect(effect)).forEach((clip) => {
      void this.loadGameplayClip(clip);
    });
  }

  private playClip(clip: GameplayClip, options: GameplayPlayback = {}) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    const definition = GAMEPLAY_CLIPS[clip];
    const nowMs = performance.now();
    const last = this.lastCarromSound.get(clip) ?? -Infinity;
    if (nowMs - last < definition.cooldownMs) return;
    this.lastCarromSound.set(clip, nowMs);

    const buffers = this.gameplayBuffers.get(clip);
    if (!buffers?.length) {
      void this.loadGameplayClip(clip);
      return;
    }
    const active = this.activeGameplaySources.get(clip) ?? [];
    while (active.length >= definition.maxVoices) active.shift()?.stop();
    const cursor = this.clipCursor.get(clip) ?? 0;
    const buffer = buffers[cursor % buffers.length];
    this.clipCursor.set(clip, cursor + 1);

    const intensity = Math.max(0, Math.min(1, options.intensity ?? 0.65));
    // A square-root curve keeps weak contacts audible without making a break
    // shot merely a linear 100% volume version of a soft collision.
    const gainValue = definition.minGain + (definition.maxGain - definition.minGain) * Math.sqrt(intensity);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = 0.985 + Math.random() * 0.03;
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    source.connect(gain);

    if (typeof options.position === "number" && "createStereoPanner" in this.ctx) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.position)), this.ctx.currentTime);
      gain.connect(panner);
      panner.connect(this.ctx.destination);
    } else {
      gain.connect(this.ctx.destination);
    }
    active.push(source);
    this.activeGameplaySources.set(clip, active);
    source.onended = () => {
      const sources = this.activeGameplaySources.get(clip);
      if (!sources) return;
      const index = sources.indexOf(source);
      if (index >= 0) sources.splice(index, 1);
      if (this.diceShakeSource === source) this.diceShakeSource = null;
    };
    source.start();
    return source;
  }

  public playCueStrike(power: number) { this.playClip("cueStrike", { intensity: power }); }
  public playBallCollision(relativeVelocity: number, position?: number) { this.playClip("ballCollision", { intensity: relativeVelocity / 12, position }); }
  public playRailCollision(relativeVelocity: number, position?: number) { this.playClip("railCollision", { intensity: relativeVelocity / 8, position }); }
  public playPocketEdge(velocity: number, position?: number) { this.playClip("pocketEdge", { intensity: velocity / 8, position }); }
  public playPocketDrop(velocity: number, position?: number) { this.playClip("pocketDrop", { intensity: velocity / 8, position }); }
  public playCueScratch(velocity: number, position?: number) { this.playClip("cueScratch", { intensity: velocity / 8, position }); }
  public playCarromStrike(power: number) { this.playClip("carromStrike", { intensity: power }); }
  public playCarromCollision(relativeVelocity: number, position?: number) { this.playClip("carromCollision", { intensity: relativeVelocity / 14, position }); }
  public playCarromBoundary(relativeVelocity: number, position?: number) { this.playClip("carromBoundary", { intensity: relativeVelocity / 10, position }); }
  public playCarromPocket(velocity: number, position?: number) { this.playClip("carromPocket", { intensity: velocity / 10, position }); }
  public playPaddleHit(relativeVelocity: number, position?: number) { this.playClip("pingPongPaddle", { intensity: relativeVelocity / 9, position }); }
  public playTableHit(relativeVelocity: number, position?: number) { this.playClip("pingPongTable", { intensity: relativeVelocity / 8, position }); }
  public playNetHit(relativeVelocity: number, position?: number) { this.playClip("pingPongNet", { intensity: relativeVelocity / 7, position }); }
  public playCardPlace(intensity = 0.6) {
    this.playClip(intensity < 0.35 ? "cardSoft" : intensity > 0.8 ? "cardSlap" : "cardPlace", { intensity });
  }
  public playChessPieceDrop(intensity = 0.65) { this.playClip("chessDrop", { intensity }); }
  public playDiceCollision(relativeVelocity: number, position?: number) { this.playClip("diceImpact", { intensity: relativeVelocity / 8, position }); }
  public startDiceShake(intensity = 0.6) {
    if (this.diceShakeSource) return;
    const source = this.playClip("diceShake", { intensity });
    if (source) this.diceShakeSource = source;
  }
  public stopDiceShake() {
    this.diceShakeSource?.stop();
    this.diceShakeSource = null;
  }

  /** Backward-compatible entry point for screens not yet migrated. */
  public playGameSFX(effect: GameAudioEffect) {
    const intensity = 0.7;
    switch (effect) {
      case "ping_pong_paddle": this.playPaddleHit(6); break;
      case "cue_shot": this.playCueStrike(intensity); break;
      case "ball_pocket": this.playPocketDrop(5); break;
      case "cue_scratch": this.playCueScratch(5); break;
      case "carrom_strike": this.playCarromStrike(intensity); break;
      case "carrom_pocket": this.playCarromPocket(5); break;
      case "chess_move": this.playChessPieceDrop(intensity); break;
    }
  }

  private clipForPhysicalEffect(effect: PhysicalAudioEffect): GameplayClip {
    const clips: Record<PhysicalAudioEffect, GameplayClip> = {
      ping_pong_paddle: "pingPongPaddle", ping_pong_table: "pingPongTable", ping_pong_net: "pingPongNet",
      cue_shot: "cueStrike", ball_pocket: "pocketDrop", cue_scratch: "cueScratch",
      pool_ball_hit: "ballCollision", pool_cushion: "railCollision", snooker_ball_hit: "ballCollision", snooker_cushion: "railCollision",
      carrom_strike: "carromStrike", carrom_pocket: "carromPocket", carrom_hit: "carromCollision", carrom_cushion: "carromBoundary",
      chess_move: "chessDrop", card_place_light: "cardSoft", card_place_heavy: "cardSlap", dice_shake: "diceShake", dice_roll: "diceImpact",
    };
    return clips[effect];
  }

  /** Backward-compatible physical API; migrated games should call semantic methods. */
  public playPhysicalSFX(effect: PhysicalAudioEffect) {
    if (effect === "dice_shake") { this.startDiceShake(); return; }
    if (effect === "dice_roll") { this.stopDiceShake(); this.playDiceCollision(5); return; }
    this.playClip(this.clipForPhysicalEffect(effect));
  }

  // --- SYNTHESIZED SFX GENERATOR (Zero External Assets Required) ---
  public playSFX(type: 
    | "click" 
    | "move" 
    | "capture" 
    | "card_flip" 
    | "strike" 
    | "dice_roll" 
    | "laser" 
    | "victory" 
    | "defeat" 
    | "beep"
    | "carrom_hit"
    | "carrom_cushion"
    | "carrom_pocket"
    | "carrom_strike"
    | "carrom_foul"
    | "carrom_win"
    | "snooker_break"
    | "snooker_hit"
    | "snooker_pocket"
    | "snooker_cushion"
  ) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const throttle = type === "carrom_hit" || type === "snooker_hit" ? 42 : type === "carrom_cushion" || type === "snooker_cushion" ? 55 : type === "carrom_pocket" || type === "snooker_pocket" ? 100 : 0;
    if (throttle) {
      const last = this.lastCarromSound.get(type) || 0;
      const nowMs = performance.now();
      if (nowMs - last < throttle) return;
      this.lastCarromSound.set(type, nowMs);
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
      case "carrom_hit": {
        // A short, warm wooden-disc click: transient + low body resonance.
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(210, now + 0.065);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now); osc.stop(now + 0.075);
        const body = this.ctx.createOscillator(); const bodyGain = this.ctx.createGain();
        body.type = "sine"; body.frequency.setValueAtTime(155, now);
        bodyGain.gain.setValueAtTime(0.1, now); bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        body.connect(bodyGain); bodyGain.connect(this.ctx.destination); body.start(now); body.stop(now + 0.115);
        break;
      }
      case "carrom_strike":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(115, now); osc.frequency.exponentialRampToValueAtTime(62, now + 0.12);
        gain.gain.setValueAtTime(0.32, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.start(now); osc.stop(now + 0.14);
        break;
      case "carrom_foul":
        osc.type = "sine";
        osc.frequency.setValueAtTime(240, now); osc.frequency.exponentialRampToValueAtTime(115, now + 0.22);
        gain.gain.setValueAtTime(0.16, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
        osc.start(now); osc.stop(now + 0.24);
        break;
      case "carrom_win":
        [392, 494, 587].forEach((frequency, index) => {
          const note = this.ctx!.createOscillator(); const noteGain = this.ctx!.createGain();
          note.type = "triangle"; note.frequency.setValueAtTime(frequency, now + index * 0.09);
          noteGain.gain.setValueAtTime(0.17, now + index * 0.09); noteGain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + 0.2);
          note.connect(noteGain); noteGain.connect(this.ctx!.destination); note.start(now + index * 0.09); note.stop(now + index * 0.09 + 0.21);
        });
        break;
      case "snooker_break": {
        // Layered cue strike and clustered rack response; entirely synthesized.
        this.playNoiseBurst(now, 0.075, 0.2, 1550);
        [95, 148, 235, 318].forEach((frequency, index) => {
          const rack = this.ctx!.createOscillator(); const rackGain = this.ctx!.createGain();
          rack.type = index < 2 ? "triangle" : "sine";
          rack.frequency.setValueAtTime(frequency, now + index * 0.012);
          rack.frequency.exponentialRampToValueAtTime(Math.max(45, frequency * 0.58), now + index * 0.012 + 0.12);
          rackGain.gain.setValueAtTime(index === 0 ? 0.27 : 0.13, now + index * 0.012); rackGain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.012 + 0.14);
          rack.connect(rackGain); rackGain.connect(this.ctx!.destination); rack.start(now + index * 0.012); rack.stop(now + index * 0.012 + 0.15);
        });
        break;
      }
      case "snooker_hit":
        this.playNoiseBurst(now, 0.025, 0.08, 2450);
        osc.type = "sine";
        osc.frequency.setValueAtTime(680, now); osc.frequency.exponentialRampToValueAtTime(270, now + 0.045);
        gain.gain.setValueAtTime(0.105, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.055);
        break;
      case "snooker_cushion":
        this.playNoiseBurst(now, 0.045, 0.07, 980);
        osc.type = "triangle";
        osc.frequency.setValueAtTime(210, now); osc.frequency.exponentialRampToValueAtTime(115, now + 0.075);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.085);
        break;
      case "snooker_pocket": {
        this.playNoiseBurst(now, 0.06, 0.1, 720);
        [360, 190].forEach((frequency, index) => {
          const drop = this.ctx!.createOscillator(); const dropGain = this.ctx!.createGain();
          drop.type = "sine"; drop.frequency.setValueAtTime(frequency, now + index * 0.045);
          dropGain.gain.setValueAtTime(0.12, now + index * 0.045); dropGain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.045 + 0.11);
          drop.connect(dropGain); dropGain.connect(this.ctx!.destination); drop.start(now + index * 0.045); drop.stop(now + index * 0.045 + 0.12);
        });
        break;
      }
      case "carrom_cushion":
        // Softer, lower knock for a disc rebounding from the board frame.
        osc.type = "sine";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.09);
        gain.gain.setValueAtTime(0.14, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.105);
        break;
      case "carrom_pocket": {
        // Descending two-tone drop, distinct from a generic victory/capture.
        [420, 245].forEach((frequency, index) => {
          const drop = this.ctx!.createOscillator(); const dropGain = this.ctx!.createGain();
          drop.type = "sine"; drop.frequency.setValueAtTime(frequency, now + index * 0.055);
          dropGain.gain.setValueAtTime(0.14, now + index * 0.055); dropGain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.055 + 0.13);
          drop.connect(dropGain); dropGain.connect(this.ctx!.destination); drop.start(now + index * 0.055); drop.stop(now + index * 0.055 + 0.14);
        });
        break;
      }
      case "click":
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;

      case "move":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;

      case "capture":
      case "strike":
        osc.type = "square";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
        break;

      case "card_flip":
        osc.type = "sine";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.06);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
        break;

      case "dice_roll":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(250, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;

      case "laser":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;

      case "victory":
        // Play an ascending 3-note chime
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const noteOsc = this.ctx!.createOscillator();
          const noteGain = this.ctx!.createGain();
          noteOsc.connect(noteGain);
          noteGain.connect(this.ctx!.destination);

          noteOsc.type = "triangle";
          noteOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
          noteGain.gain.setValueAtTime(0.25, now + idx * 0.1);
          noteGain.gain.linearRampToValueAtTime(0.01, now + idx * 0.1 + 0.25);

          noteOsc.start(now + idx * 0.1);
          noteOsc.stop(now + idx * 0.1 + 0.25);
        });
        break;

      case "defeat":
        // Play a descending tone
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        break;

      case "beep":
      default:
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
    }
  }

  // --- MP3 FILE PLAYBACK (For Custom Music or HD Sound Files) ---
  public playAudioFile(src: string, volume = 0.5) {
    if (this.isMuted) return;
    try {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.play().catch(() => {}); // Gracefully handle auto-play restrictions
    } catch (e) {
      console.warn("Audio file playback blocked:", e);
    }
  }

  // --- BACKGROUND MUSIC MANAGER ---
  public startBGM(src: string, volume = 0.3) {
    if (!src) return;
    if (this.bgmAudio && this.bgmSource === src) {
      this.bgmAudio.volume = volume;
      if (!this.isMuted) void this.bgmAudio.play().catch(() => {});
      return;
    }
    this.stopBGM();
    try {
      this.bgmAudio = new Audio(src);
      this.bgmSource = src;
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = volume;
      this.bgmAudio.muted = this.isMuted;
      this.bgmAudio.play().catch(() => {});
    } catch (e) {
      console.warn("BGM playback blocked:", e);
    }
  }

  public stopBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
      this.bgmSource = null;
    }
  }
}

export const soundEngine = new SoundEngine();
