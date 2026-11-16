// Short synthesized effects. Browsers only start audio after a click or key press.
class GameAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    const ctx = this.context();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  slash(critical: boolean): void {
    const ctx = this.context();
    const now = ctx.currentTime;
    this.whoosh(ctx, now, 0.11, 1600, 320, 0.2);
    this.tone(ctx, now, 0.05, "square", 210, 110, 0.06);
    if (critical) {
      this.tone(ctx, now + 0.02, 0.14, "square", 740, 740, 0.055);
      this.tone(ctx, now + 0.09, 0.16, "square", 1040, 1040, 0.045);
    }
  }

  fireball(): void {
    const ctx = this.context();
    const now = ctx.currentTime;
    this.whoosh(ctx, now, 0.16, 620, 160, 0.16);
    this.tone(ctx, now, 0.16, "sawtooth", 280, 80, 0.04);
  }

  explosion(): void {
    const ctx = this.context();
    const now = ctx.currentTime;
    this.whoosh(ctx, now, 0.24, 700, 70, 0.32);
    this.tone(ctx, now, 0.12, "sine", 90, 40, 0.08);
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) {
      return this.noise;
    }
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    this.noise = buffer;
    return buffer;
  }

  private whoosh(
    ctx: AudioContext,
    when: number,
    duration: number,
    from: number,
    to: number,
    gain: number,
  ): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(from, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), when + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    source.start(when);
    source.stop(when + duration + 0.02);
  }

  private tone(
    ctx: AudioContext,
    when: number,
    duration: number,
    type: OscillatorType,
    from: number,
    to: number,
    gain: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), when + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}

export const gameAudio = new GameAudio();
