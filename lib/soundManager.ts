"use client";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSource: string | null = null;
  private lastCarromSound = new Map<string, number>();

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
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
  ) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const throttle = type === "carrom_hit" ? 42 : type === "carrom_cushion" ? 55 : type === "carrom_pocket" ? 100 : 0;
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
