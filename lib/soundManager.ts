"use client";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSource: string | null = null;

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
  ) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    switch (type) {
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
