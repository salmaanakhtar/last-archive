import type { PointerState } from './input';

export interface AudioState {
  ctx: AudioContext | null;
  muted: boolean;
  time: number;
  pointer: PointerState;
}

function mkOsc(ctx: AudioContext, type: OscillatorType, freq: number, gain: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  return { osc, g };
}

/**
 * All sound is synthesized — a machine left humming in the dark.
 * No samples, no network fetches.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: { osc: OscillatorNode; g: GainNode }[] = [];
  private droneDepth = 0;
  muted = false;

  constructor(st: AudioState) {
    this.st = st;
  }

  private st: AudioState;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.buildDrone();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  private buildDrone() {
    const ctx = this.ctx!;
    const [a, b] = [
      mkOsc(ctx, 'sine', 55.5, 0.16),
      mkOsc(ctx, 'sine', 55.5 * 1.005, 0.1),
    ];
    a.g.connect(this.master!);
    b.g.connect(this.master!);
    a.osc.start();
    b.osc.start();

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.7;
    lp.connect(this.master!);

    const lfo = mkOsc(ctx, 'sine', 0.05, 0.5);
    lfo.g.gain.value = 90;
    lfo.g.connect(lp.frequency);
    lfo.osc.start();

    this.drone = [a, b];
    this.droneDepth = 0;
  }

  private isOn() {
    return this.ctx && this.master && !this.muted && this.ctx.state === 'running';
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.55, this.ctx.currentTime + 0.5);
    }
    document.body.classList.toggle('muted', m);
  }

  /** ambient hum + pointer-proximity shimmer, called every frame */
  update(t: number, dt: number, pointer: PointerState, activity: number) {
    this.st.time = t;
    if (!this.isOn()) return;
    const ctx = this.ctx!;

    const proximity = pointer.worldPlane.length();
    const shimmer = Math.max(0, 1 - proximity / 14);
    const targetDepth = 0.3 + shimmer * 1.1 + activity * 0.4;
    this.droneDepth += (targetDepth - this.droneDepth) * Math.min(1, dt * 2.2);

    const spd = Math.min(1, pointer.speed * 3);
    const breathe = 1 + 0.03 * Math.sin(t * 0.4) + 0.02 * Math.sin(t * 1.7);
    for (let i = 0; i < this.drone.length; i++) {
      const d = this.drone[i];
      const wob = 1 + 0.0025 * Math.sin(t * (2 + i * 3.3));
      d.osc.frequency.setTargetAtTime(55.5 * (i === 0 ? 1 : 1.005) * wob, ctx.currentTime, 0.2);
      d.g.gain.setTargetAtTime((i === 0 ? 0.14 : 0.09) * breathe + this.droneDepth * 0.02, ctx.currentTime, 0.25);
    }

    // pointer shimmer — a soft high harmonic that appears near the artifact
    const hf = this.droneHigh;
    if (shimmer > 0.05) {
      if (!hf) this.buildHigh();
      this.highGain!.gain.setTargetAtTime(0.015 + shimmer * 0.05 + spd * 0.05, ctx.currentTime, 0.3);
      this.highOsc!.frequency.setTargetAtTime(880 + shimmer * 220 + pointer.worldPlane.y * 30, ctx.currentTime, 0.4);
    } else if (hf) {
      this.highGain!.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    }
  }

  private droneHigh: boolean = false;
  private highOsc: OscillatorNode | null = null;
  private highGain: GainNode | null = null;

  private buildHigh() {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 1200;
    lp.Q.value = 2;
    osc.type = 'sine';
    osc.frequency.value = 960;
    g.gain.value = 0;
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master!);
    osc.start();
    this.droneHigh = true;
    this.highOsc = osc;
    this.highGain = g;
  }

  /** quick metallic tick — clicking a shard, opening a seal */
  tick(pitch = 1) {
    if (!this.isOn()) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 1800 * pitch;
    lp.Q.value = 6;
    o.type = 'triangle';
    o.frequency.value = 620 * pitch;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master!);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  }

  /** deep swell — a seal opening / the archive awakening */
  swell() {
    if (!this.isOn()) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 2.2);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.4);
    lfo.frequency.value = 0.4;
    lfoG.gain.value = 28;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    o.connect(g);
    lfo.start();
    lfo.stop(ctx.currentTime + 3.6);
    g.connect(this.master!);
    o.start();
    o.stop(ctx.currentTime + 3.6);
  }

  /** soft passing sound — brushing a surface */
  brush(intensity = 0.5) {
    if (!this.isOn()) return;
    const ctx = this.ctx!;
    const dur = 0.5 + intensity * 0.4;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const n = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
      data[i] = n * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.02 + intensity * 0.05;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master!);
    src.start();
  }
}
