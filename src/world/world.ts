import * as THREE from 'three';
import { Engine } from '../core/engine';
import type { Phase, WorldHandles } from '../core/engine';
import { Vault } from './vault';
import { Monolith, SHARDS } from './monolith';
import type { ShardDef } from './monolith';
import { Dust } from './dust';

const PHASE_CAM: Record<Phase, THREE.Vector3> = {
  boot: new THREE.Vector3(0, 9.5, 23),
  intro: new THREE.Vector3(0, 9.5, 23),
  title: new THREE.Vector3(0, 4.4, 10.5),
  shards: new THREE.Vector3(0, 4.6, 8.6),
  runes: new THREE.Vector3(3.4, 5.2, 9.8),
  recovered: new THREE.Vector3(0, 8.5, 18),
  void: new THREE.Vector3(0, 4.4, 10.5),
};

export class World {
  private engine: Engine;
  private vault: Vault;
  private monolith: Monolith;
  private dust: Dust;
  private camLook = new THREE.Vector3(0, 3.2, 0);
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private phase: Phase = 'boot';
  private introLinesPlayed = false;
  private introFinished = false;
  private awake = 0;
  
  private raycaster = new THREE.Raycaster();
  
  private lastRaycast = 0;
  private shardOpened = new Set<string>();
  private openedCount = 0;
  private currentShard: ShardDef | null = null;
  private recoveredShown = false;
  private dragRotY = 0;
  private dragRotX = 0;
  private dragging = false;
  private downAt = { x: 0, y: 0, t: 0 };
  private titleCapEl: HTMLElement;
  private shardsUi: HTMLElement;
  private shardNameEl: HTMLElement;
  private shardCaptionEl: HTMLElement;
  private pagerEl: HTMLElement;
  private runesUi: HTMLElement;
  private runesFeedbackEl: HTMLElement;
  private recoveredEl: HTMLElement;
  private introEl: HTMLElement;
  private titleEl: HTMLElement;

  constructor(engine: Engine) {
    this.engine = engine;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04050a);
    scene.fog = new THREE.FogExp2(0x05060b, 0.011);

    this.vault = new Vault(scene);
    this.monolith = new Monolith(scene);
    this.dust = new Dust(scene, engine.quality.particleCount);
    const amb = new THREE.AmbientLight(0x39415a, 1.6);
    scene.add(amb);
    const key = new THREE.DirectionalLight(0xb0c4e8, 2.2);
    key.position.set(6, 10, 4);
    scene.add(key);
    const warm = new THREE.DirectionalLight(0xff9a3d, 0.85);
    warm.position.set(-6, 4, -6);
    scene.add(warm);
    const fill = new THREE.DirectionalLight(0x9fc0c9, 0.7);
    fill.position.set(-4, 2, 8);
    scene.add(fill);

    this.camTarget.copy(PHASE_CAM.intro);
    this.camPos.copy(PHASE_CAM.intro);
    engine.camera.position.copy(this.camPos);
    engine.camera.lookAt(this.camLook);

    this.titleCapEl = document.getElementById('title-cap')!;
    this.shardsUi = document.getElementById('shards-ui')!;
    this.shardNameEl = document.getElementById('shards-name')!;
    this.shardCaptionEl = document.getElementById('shards-caption')!;
    this.pagerEl = document.getElementById('shards-pager')!;
    this.runesUi = document.getElementById('runes-ui')!;
    this.runesFeedbackEl = document.getElementById('runes-feedback')!;
    this.recoveredEl = document.getElementById('recovered')!;
    this.introEl = document.getElementById('intro')!;
    this.titleEl = document.getElementById('title')!;

    for (let i = 0; i < 7; i++) {
      const d = document.createElement('div');
      d.className = 'pg';
      d.dataset.idx = String(i);
      d.addEventListener('click', () => this.jumpToShard(i));
      this.pagerEl.appendChild(d);
    }

    this.monolith.setHandlers((def) => this.openShard(def));

    window.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragging = false;
      this.engine.sound.ensure();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.engine.input.pointer.down) return;
      if (!this.dragging && this.phase !== 'intro' && this.phase !== 'boot') {
        const dx = e.clientX - this.downAt.x;
        const dy = e.clientY - this.downAt.y;
        if (Math.hypot(dx, dy) > 7) this.dragging = true;
      }
      if (this.dragging) {
        this.dragRotY -= e.movementX * 0.005;
        this.dragRotX = THREE.MathUtils.clamp(this.dragRotX - e.movementY * 0.003, -0.35, 0.35);
      }
    });
    window.addEventListener('pointerup', (e) => {
      const dt = performance.now() - this.downAt.t;
      if (!this.dragging && dt < 320 && this.phase !== 'intro' && this.phase !== 'boot') {
        this.handleClick(e);
      }
      this.dragging = false;
    });

    engine.register({
      scene,
      onFrame: (w, dt) => this.frame(w, dt),
      onPhase: (from, to) => this.onPhase(from, to),
      onPointer: () => {},
      onWheel: (e) => this.onWheel(e),
      onKey: () => {},
      visible: true,
    });
  }

  private onPhase(from: Phase, to: Phase) {
    this.phase = to;
    if (to === 'shards' && from === 'title') {
      this.monolith.setReveal(1);
      
    }
    if (to === 'runes') {
      this.shardsUi.classList.add('hidden');
      this.runesUi.classList.remove('hidden');
      this.engine.notify('the archive is watching you back');
    }
    if (to === 'recovered') {
      this.recoveredEl.classList.add('entered');
    }
  }

  private onWheel(e: WheelEvent) {
    if (this.phase === 'intro' && !this.engine.boot.done) return;
    if (this.phase === 'intro') {
      const s = this.engine.input.scroll;
      s.target = THREE.MathUtils.clamp(s.target + e.deltaY / 1600, 0, 1);
    }
  }

  private handleClick(e: PointerEvent | MouseEvent) {
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.engine.camera);

    if (this.phase === 'shards' || this.phase === 'runes') {
      const hit = this.raycastAll();
      if (hit) {
        if (this.phase === 'shards') {
          if (this.monolith.isShard(hit)) {
            const def = hit.userData.def as ShardDef;
            this.openShard(def);
            return;
          }
        }
        if (this.phase === 'runes') {
          if (this.monolith.isRune(hit)) {
            this.openRune(hit.userData.i as number);
            return;
          }
        }
      }
    }
  }

  private raycastAll(): THREE.Object3D | null {
    const meshes: THREE.Object3D[] = [
      this.monolith.mesh!,
      ...this.monolith.shards,
      ...this.monolith.runeMeshes,
    ];
    const hits = this.raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object : null;
  }

  private openRune(i: number) {
    if (this.phase !== 'runes') return;
    if (this.monolith.isRuneOpened(i)) {
      this.engine.notify('this seal is already open');
      return;
    }
    this.monolith.openRune(i);
    const count = this.monolith.openedRuneCount;
    this.engine.setShardCount(count, 7);
    this.engine.sound.tick(1.3 + i * 0.1);
    const words = ['memory', 'breath', 'name', 'song', 'map', 'root', 'dawn'];
    this.runesFeedbackEl.textContent = `seal ${i + 1} — ${words[i]} restored`;
    this.runesFeedbackEl.style.opacity = '1';
    setTimeout(() => (this.runesFeedbackEl.style.opacity = '0.35'), 1600);

    if (count >= 7) {
      this.engine.transition('recovered');
      this.engine.triggerSwell();
      this.monolith.awaken();
    }
  }

  private openShard(def: ShardDef) {
    if (this.phase !== 'shards') return;
    if (this.shardOpened.has(def.id)) {
      this.selectShard(def);
      this.engine.sound.brush(0.4);
      return;
    }
    this.shardOpened.add(def.id);
    this.openedCount++;
    this.engine.sound.tick(1 + this.openedCount * 0.08);
    this.engine.notify(`memory restored — ${def.name}`);
    this.selectShard(def);

    if (this.openedCount >= 4) {
      setTimeout(() => {
        if (this.phase === 'shards') {
          this.engine.transition('runes');
          this.engine.notify('the archive is watching you back');
        }
      }, 1400);
    }
  }

  private selectShard(def: ShardDef) {
    this.currentShard = def;
    this.monolith.selectShard(def);
    this.shardNameEl.textContent = def.name;
    this.shardCaptionEl.textContent = def.caption;
    this.shardNameEl.classList.add('show');
    this.shardCaptionEl.classList.add('show');
    this.updatePager();
  }

  private updatePager() {
    const children = this.pagerEl.children;
    const def = this.currentShard;
    for (let i = 0; i < children.length; i++) {
      const el = children[i] as HTMLElement;
      const s = SHARDS[i];
      const on = def?.id === s.id;
      el.classList.toggle('on', !!on);
      if (this.shardOpened.has(s.id)) el.style.background = 'rgba(127,224,210,0.7)';
    }
  }

  private jumpToShard(i: number) {
    if (this.phase !== 'shards') return;
    const def = SHARDS[i];
    this.selectShard(def);
    // swing the camera toward the shard's side
    const a = Math.atan2(def.pos.x, def.pos.z);
    this.dragRotY = -a;
  }

  private frame(w: WorldHandles, dt: number) {
    const t = w.time;

    // — boot: wait for the boot sequence, then descend —
    if (this.phase === 'boot' && this.engine.boot.done) {
      this.engine.transition('intro');
      document.getElementById('intro')!.classList.remove('hidden');
      this.engine.bootFinished();
    }

    // — intro: scroll descends toward the archive —
    if (this.phase === 'intro') {
      const s = this.engine.input.scroll;
      s.progress += (s.target - s.progress) * (1 - Math.exp(-dt * 2.4));
      const p = s.progress;
      this.camTarget.lerpVectors(PHASE_CAM.intro, PHASE_CAM.title, p);
      this.camTarget.x += Math.sin(p * 3) * 0.7 * p;
      this.monolith.setReveal(p);

      if (p > 0.12 && !this.introLinesPlayed) {
        this.introLinesPlayed = true;
        const lines = document.querySelectorAll('.intro-title .t-line');
        lines.forEach((l, i) => setTimeout(() => l.classList.add('in'), 100 + i * 240));
      }
      if (p >= 0.98 && !this.introFinished) {
        this.introFinished = true;
        this.engine.transition('title');
        this.introEl.classList.add('hidden');
        this.titleEl.classList.remove('hidden');
        this.titleEl.classList.add('entered');
        setTimeout(() => this.shardsUi.classList.remove('hidden'), 2600);
        this.engine.sound.swell();
      }
    }

    // — title: slow idle drift, reveal caption once —
    if (this.phase === 'title') {
      this.camTarget.x = Math.sin(t * 0.13) * 0.5;
      this.camTarget.y = PHASE_CAM.title.y + Math.sin(t * 0.1) * 0.25;
      this.camTarget.z = PHASE_CAM.title.z;
      if (!this.titleCapEl.textContent) {
        this.titleCapEl.textContent = '— seven shards orbit the stone · touch them —';
      }
    }

    // — shards: camera drifts subtly —
    if (this.phase === 'shards') {
      this.camTarget.x = Math.sin(t * 0.11) * 0.6;
      this.camTarget.y = PHASE_CAM.shards.y + Math.sin(t * 0.08) * 0.2;
      this.camTarget.z = PHASE_CAM.shards.z;
    }

    // — runes —
    if (this.phase === 'runes') {
      const count = this.monolith.openedRuneCount;
      this.engine.setShardCount(count, 7);
      this.camTarget.x = PHASE_CAM.runes.x + Math.sin(t * 0.1) * 0.4;
      this.camTarget.y = PHASE_CAM.runes.y;
      this.camTarget.z = PHASE_CAM.runes.z;
      const lookX = Math.sin(this.dragRotY) * 2;
      this.camLook.x += (lookX - this.camLook.x) * (1 - Math.exp(-dt * 2));
    }

    // — recovered —
    if (this.phase === 'recovered') {
      this.awake = Math.min(1, this.awake + dt * 0.35);
      this.monolith.setAwake(this.awake);
      this.monolith.awaken();
      this.camTarget.x = Math.sin(t * 0.2) * 1.5;
      this.camTarget.y = PHASE_CAM.recovered.y + Math.sin(t * 0.15) * 0.4;
      this.camTarget.z = PHASE_CAM.recovered.z;
      if (this.awake > 0.85 && !this.recoveredShown) {
        this.recoveredShown = true;
        this.recoveredEl.classList.add('entered');
        this.engine.triggerSwell();
        this.engine.notify('the archive is awake');
      }
    }

    // — camera easing —
    this.camPos.lerp(this.camTarget, 1 - Math.exp(-dt * 2.0));
    w.camera.position.copy(this.camPos);
    const lookTarget = new THREE.Vector3(0, 3.1, 0);
    lookTarget.x += Math.sin(this.dragRotY) * 2.4;
    lookTarget.z += Math.cos(this.dragRotY) * 2.4;
    this.camLook.lerp(lookTarget, 1 - Math.exp(-dt * 3));
    w.camera.lookAt(this.camLook);
    w.camera.rotation.z = this.dragRotX * 0.4;

    // — hover raycast —
    if (this.phase === 'shards' || this.phase === 'runes') {
      const now = performance.now();
      if (now - this.lastRaycast > 40) {
        this.lastRaycast = now;
        const hit = this.raycastAll();
        this.monolith.hoverMesh(hit);
        const readable = hit && (this.monolith.isShard(hit) || this.monolith.isRune(hit));
        document.body.classList.toggle('cursor-read', !!readable);
      }
    } else {
      this.monolith.hoverMesh(null);
    }

    // — pointer world-plane position for the dust field —
    const ndc = w.input.pointer.ndc;
    if (w.input.pointer.active) {
      const v = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(w.camera);
      const dir = v.sub(w.camera.position).normalize();
      const tHit = (3.4 - w.camera.position.y) / dir.y;
      if (tHit > 0) {
        w.input.pointer.worldPlane
          .copy(w.camera.position)
          .addScaledVector(dir, tHit);
      }
    }

    this.vault.update(w, dt, this.awake);
    this.monolith.update(w, dt);
    this.monolith.setPointerWorld(w.input.pointer.worldPlane);
    this.dust.setPointerWorld(w.input.pointer.worldPlane, w.input.pointer.active);
    this.dust.update(w, dt, this.monolith.hover, this.monolith.reveal, this.awake);
  }

  

  dispose() {
    this.vault.dispose();
    this.monolith.dispose();
    this.dust.dispose();
  }
}
