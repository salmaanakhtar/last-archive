import * as THREE from 'three';
import { createCanvasRenderer, createEffectComposer } from './renderer';
import { detectQuality, degrade } from './quality';
import type { QualitySettings } from './quality';
import { InputState } from './input';
import { Sound } from './sound';
import { Boot } from './boot';

export type Phase =
  | 'boot'
  | 'intro'
  | 'title'
  | 'shards'
  | 'runes'
  | 'recovered'
  | 'void';

export interface PhaseTransition {
  from: Phase;
  to: Phase;
  onEnter: () => void;
}

export interface WorldHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  input: InputState;
  quality: QualitySettings;
  time: number;
  phase: Phase;
  sound: Sound;
  notify: (msg: string, durationMs?: number) => void;
  transition: (to: Phase) => void;
  setShardCount: (n: number, total: number) => void;
  shardsOpenCount: () => number;
  awaken: () => void;
  finishBoot: () => void;
  triggerSwell: () => void;
}

interface Registered {
  scene: THREE.Scene;
  onFrame: ((w: WorldHandles, dt: number) => void) | null;
  onPhase: ((from: Phase, to: Phase) => void) | null;
  onPointer: ((e: PointerEvent) => void) | null;
  onWheel: ((e: WheelEvent) => void) | null;
  onKey: ((k: string, down: boolean) => void) | null;
  visible: boolean;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  quality: QualitySettings;
  camera: THREE.PerspectiveCamera;
  cameraRig: THREE.Object3D;
  input = new InputState();
  sound: Sound;
  boot = new Boot();
  phase: Phase = 'boot';

  private composer: ReturnType<typeof createEffectComposer> | null = null;
  private registered: Registered[] = [];
  private time = 0;
  private container: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private muteBtn: HTMLElement;
  private coordsEl: HTMLElement;
  private raf = 0;
  private frameStats = { fps: 60, ms: 16.7, frames: 0, acc: 0, last: performance.now() };
  private slowFrames = 0;
  private lastDegradeCheck = 0;
  private activity = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.quality = detectQuality();
    this.renderer = createCanvasRenderer(container, this.quality);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    this.cameraRig = new THREE.Object3D();
    this.cameraRig.add(this.camera);
    this.cameraRig.position.set(0, 0, 0);
    this.input = new InputState();
    this.sound = new Sound({
      ctx: null,
      muted: false,
      time: 0,
      pointer: this.input.pointer,
    });
    if (this.quality.post) {
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera();
      this.composer = createEffectComposer(this.renderer, scene, cam);
    }
    this.toastEl = document.getElementById('toast')!;
    this.muteBtn = document.getElementById('mute-btn')!;
    this.coordsEl = document.getElementById('hud-coords')!;

    this.muteBtn.addEventListener('click', () => {
      this.sound.ensure();
      this.sound.setMuted(!this.sound.muted);
    });

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerdown', () => {
      this.input.pointer.down = true;
      this.sound.ensure();
    });
    window.addEventListener('pointerup', () => (this.input.pointer.down = false));
    window.addEventListener('wheel', (e) => {
      this.input.scroll.wheel = e.deltaY;
      for (const r of this.registered) r.onWheel?.(e);
    }, { passive: true });

    this.onResize();
  }

  get scene() {
    return this.registered.length ? this.registered[this.registered.length - 1].scene : null;
  }

  register(o: Registered) {
    this.registered.push(o);
  }

  unregister(o: Registered) {
    const i = this.registered.indexOf(o);
    if (i >= 0) this.registered.splice(i, 1);
  }

  transition(to: Phase) {
    const from = this.phase;
    if (from === to) return;
    this.phase = to;
    for (const r of this.registered) r.onPhase?.(from, to);
  }

  /** called by the world once the boot is finished */
  bootFinished() {
    this.boot.fadeOut();
  }

  notify(msg: string, durationMs = 3200) {
    this.toastEl.innerHTML = `<div class="toast-msg">${msg}</div>`;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), durationMs);
  }

  setShardCount(n: number, total: number) {
    const el = document.getElementById('runes-count');
    if (el) el.textContent = `SEALS ${n}/${total}`;
  }

  shardsOpenCount() {
    return 0;
  }

  awaken() {
    const t = document.getElementById('title');
    t?.classList.add('awake');
  }

  finishBoot() {
    this.boot.fadeOut();
  }

  triggerSwell() {
    this.sound.swell();
  }

  private onPointerMove(e: PointerEvent) {
    const p = this.input.pointer;
    const rect = this.renderer.domElement.getBoundingClientRect();
    p.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    p.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    p.active = true;
    const dt = Math.max(0.001, (performance.now() - p.lastMoveAt) / 1000);
    const prev = p.velocity.clone();
    p.velocity.x = p.ndc.x - prev.x;
    p.velocity.y = p.ndc.y - prev.y;
    p.speed = p.velocity.length() / dt;
    p.lastMoveAt = performance.now();
    for (const r of this.registered) r.onPointer?.(e);
  }

  private onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.size.w = w;
      this.composer.size.h = h;
      this.composer.rt.setSize(w, h);
      this.composer.quad.material.uniforms.resolution.value.set(w, h);
    }
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.frameStats.last) / 1000);
    this.frameStats.last = now;
    this.time += dt;
    this.activity = Math.max(0, this.activity - dt * 0.5);

    // boot progress handled by the world, but always advance in case
    if (!this.boot.done) {
      this.boot.feed(dt * 0.5);
    }

    // pointer world-space ray (approximate using camera)
    void 0;

    const handles: WorldHandles = {
      scene: this.scene!,
      camera: this.camera,
      input: this.input,
      quality: this.quality,
      time: this.time,
      phase: this.phase,
      sound: this.sound,
      notify: (m, d) => this.notify(m, d),
      transition: (to) => this.transition(to),
      setShardCount: (n, total) => this.setShardCount(n, total),
      shardsOpenCount: () => this.shardsOpenCount(),
      awaken: () => this.awaken(),
      finishBoot: () => this.finishBoot(),
      triggerSwell: () => this.triggerSwell(),
    };

    for (const r of this.registered) {
      if (r.scene) r.onFrame?.(handles, dt);
    }

    // post
    if (this.composer) {
      this.composer.quad.material.uniforms.time.value = this.time;
      this.composer.quad.material.uniforms.chroma.value = 1;
      const cur = this.scene;
      if (cur) {
        this.renderer.setRenderTarget(this.composer.rt);
        this.renderer.render(cur, this.camera);
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.composer.scene, this.camera);
      }
    } else if (this.scene) {
      this.renderer.render(this.scene, this.camera);
    }

    // stats + auto-degrade
    this.frameStats.frames++;
    this.frameStats.acc += dt;
    if (this.frameStats.acc >= 1) {
      this.frameStats.fps = this.frameStats.frames / this.frameStats.acc;
      this.frameStats.ms = (this.frameStats.acc * 1000) / this.frameStats.frames;
      if (this.frameStats.fps < 42) this.slowFrames++;
      else this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.frameStats.frames = 0;
      this.frameStats.acc = 0;
      const nowMs = now;
      if (this.slowFrames > 5 && nowMs - this.lastDegradeCheck > 8000) {
        this.lastDegradeCheck = nowMs;
        const next = degrade(this.quality);
        if (next) this.applyQuality(next);
      }
      if (this.coordsEl) {
        this.coordsEl.textContent = `${this.frameStats.fps.toFixed(0)}fps · ${this.frameStats.ms.toFixed(1)}ms · ${this.quality.tier}`;
      }
    }

    this.sound.update(this.time, dt, this.input.pointer, this.activity);
  }

  private applyQuality(q: QualitySettings) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight, false);
    // particle systems read quality every frame via handles.quality
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
