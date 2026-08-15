"use client";

const GAME_AUDIO_EFFECTS = {
  ping_pong_paddle: { src: "/game-sfx/ping-pong-paddle.mp3", volume: 0.34, cooldownMs: 35, voices: 1 },
  cue_shot: { src: "/game-sfx/cue-shot.mp3", volume: 0.42, cooldownMs: 42, voices: 1 },
  ball_pocket: { src: "/game-sfx/ball-pocket.mp3", volume: 0.38, cooldownMs: 110, voices: 2 },
  cue_scratch: { src: "/game-sfx/cue-scratch.mp3", volume: 0.4, cooldownMs: 250, voices: 1 },
  carrom_strike: { src: "/game-sfx/carrom-strike.mp3", volume: 0.36, cooldownMs: 120, voices: 2 },
  carrom_pocket: { src: "/game-sfx/carrom-pocket.mp3", volume: 0.38, cooldownMs: 125, voices: 2 },
  chess_move: { src: "/game-sfx/chess-move.mp3", volume: 0.34, cooldownMs: 90, voices: 2 },
} as const;

export type GameAudioEffect = keyof typeof GAME_AUDIO_EFFECTS;

/** High-frequency game events mapped to the supplied reference recordings. */
export type PhysicalAudioEffect =
  | "ping_pong_paddle"
  | "ping_pong_table"
  | "ping_pong_net"
  | "pool_ball_hit"
  | "pool_cushion"
  | "snooker_ball_hit"
  | "snooker_cushion"
  | "carrom_hit"
  | "carrom_cushion";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSource: string | null = null;
  private lastCarromSound = new Map<string, number>();
  private gameAudioPools = new Map<GameAudioEffect, HTMLAudioElement[]>();
  private gameAudioBuffers = new Map<GameAudioEffect, AudioBuffer>();
  private gameAudioBufferLoads = new Map<GameAudioEffect, Promise<AudioBuffer | null>>();
  private activeGameSources = new Map<GameAudioEffect, AudioBufferSourceNode[]>();
  private lastGameAudioAt = new Map<GameAudioEffect, number>();

  constructor() {
    // AudioContext will be initialized on first user interaction
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
  }

  public restorePreference() {
    if (typeof window === "undefined") return;
    this.isMuted = localStorage.getItem("joeyoke_sound_enabled") === "false";
    if (this.bgmAudio) this.bgmAudio.muted = this.isMuted;
  }

  public getMutedState(): boolean {
    return this.isMuted;
  }

  /**
   * Prepares short recorded gameplay effects after a game screen mounts.
   * Audio remains subject to the platform's normal user-gesture policy.
   */
  public preloadGameSFX(effects: readonly GameAudioEffect[]) {
    if (typeof window === "undefined") return;
    this.initContext(false);
    effects.forEach((effect) => {
      if (this.gameAudioPools.has(effect)) return;
      const config = GAME_AUDIO_EFFECTS[effect];
      const voices = Array.from({ length: config.voices }, () => {
        const audio = new Audio(config.src);
        audio.preload = "auto";
        audio.volume = config.volume;
        return audio;
      });
      this.gameAudioPools.set(effect, voices);
      void this.loadGameAudioBuffer(effect);
    });
  }

  private loadGameAudioBuffer(effect: GameAudioEffect): Promise<AudioBuffer | null> {
    const cached = this.gameAudioBuffers.get(effect);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.gameAudioBufferLoads.get(effect);
    if (inFlight) return inFlight;
    if (!this.ctx || typeof window === "undefined") return Promise.resolve(null);

    const load = fetch(GAME_AUDIO_EFFECTS[effect].src)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((bytes) => (bytes ? this.ctx!.decodeAudioData(bytes) : null))
      .then((buffer) => {
        if (buffer) this.gameAudioBuffers.set(effect, buffer);
        return buffer;
      })
      .catch(() => null);
    this.gameAudioBufferLoads.set(effect, load);
    return load;
  }

  private playHtmlAudioFallback(effect: GameAudioEffect) {
    const voices = this.gameAudioPools.get(effect);
    if (!voices?.length) return;
    const voice = voices.find((audio) => audio.paused || audio.ended) ?? voices[0];
    voice.pause();
    voice.currentTime = 0;
    voice.volume = GAME_AUDIO_EFFECTS[effect].volume;
    void voice.play().catch(() => {});
  }

  /** Plays a supplied game recording with a small voice pool for rapid physics events. */
  public playGameSFX(effect: GameAudioEffect) {
    if (this.isMuted || typeof window === "undefined") return;
    this.preloadGameSFX([effect]);

    const config = GAME_AUDIO_EFFECTS[effect];
    const now = performance.now();
    const lastPlayedAt = this.lastGameAudioAt.get(effect) ?? -Infinity;
    if (now - lastPlayedAt < config.cooldownMs) return;
    this.lastGameAudioAt.set(effect, now);

    const buffer = this.gameAudioBuffers.get(effect);
    if (!buffer || !this.ctx) {
      this.playHtmlAudioFallback(effect);
      return;
    }

    const activeSources = this.activeGameSources.get(effect) ?? [];
    while (activeSources.length >= config.voices) {
      activeSources.shift()?.stop();
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(config.volume, this.ctx.currentTime);
    source.connect(gain);
    gain.connect(this.ctx.destination);
    activeSources.push(source);
    this.activeGameSources.set(effect, activeSources);
    source.onended = () => {
      const sources = this.activeGameSources.get(effect);
      if (!sources) return;
      const index = sources.indexOf(source);
      if (index >= 0) sources.splice(index, 1);
    };
    source.start();
  }

  /** Replays an exact supplied reference recording for every valid contact. */
  public playPhysicalSFX(effect: PhysicalAudioEffect) {
    const references: Record<PhysicalAudioEffect, GameAudioEffect> = {
      ping_pong_paddle: "ping_pong_paddle",
      ping_pong_table: "ping_pong_paddle",
      ping_pong_net: "ping_pong_paddle",
      pool_ball_hit: "cue_shot",
      pool_cushion: "cue_shot",
      snooker_ball_hit: "cue_shot",
      snooker_cushion: "cue_shot",
      carrom_hit: "carrom_strike",
      carrom_cushion: "carrom_strike",
    };
    this.playGameSFX(references[effect]);
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
