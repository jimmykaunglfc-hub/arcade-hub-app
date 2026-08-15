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

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSource: string | null = null;
  private lastCarromSound = new Map<string, number>();

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

  /** Keeps the existing game-screen API; effects are generated on demand. */
  public preloadGameSFX(effects: readonly GameAudioEffect[]) {
    // Gameplay effects are generated in code from the reference envelopes;
    // no packaged audio sample is loaded or played.
    void effects;
  }

  /** Plays the code-only gameplay effect matching the game action. */
  public playGameSFX(effect: GameAudioEffect) {
    const mappedEffect: Record<GameAudioEffect, PhysicalAudioEffect> = {
      ping_pong_paddle: "ping_pong_paddle",
      cue_shot: "cue_shot",
      ball_pocket: "ball_pocket",
      cue_scratch: "cue_scratch",
      carrom_strike: "carrom_strike",
      carrom_pocket: "carrom_pocket",
      chess_move: "chess_move",
    };
    this.playPhysicalSFX(mappedEffect[effect]);
  }

  /**
   * Code-only effects shaped from the supplied reference categories. Every
   * event creates its own AudioBufferSource, so rapid consecutive contacts
   * cannot be blocked by a previous sound's playback duration.
   */
  public playPhysicalSFX(effect: PhysicalAudioEffect) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;
    const cooldowns: Record<PhysicalAudioEffect, number> = {
      ping_pong_paddle: 32, ping_pong_table: 45, ping_pong_net: 80,
      cue_shot: 110, ball_pocket: 150, cue_scratch: 220,
      pool_ball_hit: 40, pool_cushion: 70, snooker_ball_hit: 40,
      snooker_cushion: 70, carrom_hit: 42, carrom_cushion: 68,
      carrom_strike: 120, carrom_pocket: 160,
      chess_move: 80, card_place_light: 65, card_place_heavy: 130,
      dice_shake: 180, dice_roll: 120,
    };
    const nowMs = performance.now();
    const last = this.lastCarromSound.get(effect) ?? -Infinity;
    if (nowMs - last < cooldowns[effect]) return;
    this.lastCarromSound.set(effect, nowMs);
    const now = this.ctx.currentTime;
    const designs: Record<PhysicalAudioEffect, [number, number, number, number, number]> = {
      ping_pong_paddle: [1950, 680, .045, .12, .020],
      ping_pong_table: [720, 220, .055, .09, .014],
      ping_pong_net: [370, 95, .085, .075, .012],
      cue_shot: [980, 220, .090, .13, .035],
      ball_pocket: [480, 80, .200, .11, .040],
      cue_scratch: [240, 55, .260, .10, .040],
      pool_ball_hit: [1150, 420, .045, .105, .020],
      pool_cushion: [260, 78, .080, .10, .026],
      snooker_ball_hit: [1420, 560, .038, .09, .016],
      snooker_cushion: [235, 72, .080, .085, .022],
      carrom_strike: [520, 120, .120, .13, .035],
      carrom_pocket: [290, 70, .160, .11, .030],
      carrom_hit: [690, 160, .065, .12, .028],
      carrom_cushion: [220, 65, .085, .10, .023],
      chess_move: [480, 150, .095, .13, .010],
      card_place_light: [760, 250, .060, .085, .012],
      card_place_heavy: [390, 110, .135, .12, .022],
      dice_shake: [310, 105, .110, .07, .040],
      dice_roll: [640, 145, .180, .11, .050],
    };
    const [pitch, tail, duration, volume, noise] = designs[effect];
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = effect === "chess_move" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(pitch, now);
    oscillator.frequency.exponentialRampToValueAtTime(tail, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain); gain.connect(this.ctx.destination);
    oscillator.start(now); oscillator.stop(now + duration + .01);
    this.playNoiseBurst(now, Math.min(duration, .045), noise, pitch * 1.25);
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
