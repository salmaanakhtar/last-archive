import * as THREE from 'three';
import type { WorldHandles } from '../core/engine';
import { monolithVert, monolithFrag } from '../shaders/monolith';
import { TAU } from '../core/renderer';

export interface ShardDef {
  id: string;
  name: string;
  caption: string;
  seed: number;
  pos: THREE.Vector3;
}

export const SHARDS: ShardDef[] = [
  { id: 'cartography', name: 'CARTOGRAPHY', caption: 'maps of a world that no longer has a shape — the last coastline drawn in ink that never dries.', seed: 11, pos: new THREE.Vector3(3.6, 2.0, 2.2) },
  { id: 'music', name: 'MUSIC', caption: 'nine hundred hours of song, folded into a single crystalline note that never stops playing.', seed: 22, pos: new THREE.Vector3(-3.0, 2.6, -1.8) },
  { id: 'botany', name: 'BOTANY', caption: 'a catalogue of flowers that grew nowhere else. The pollen still simulates sunrise every morning.', seed: 33, pos: new THREE.Vector3(2.0, 3.4, -3.2) },
  { id: 'language', name: 'LANGUAGE', caption: 'the last dictionary of a tongue that only the archive still speaks.', seed: 44, pos: new THREE.Vector3(-3.8, 1.7, 3.0) },
  { id: 'astronomy', name: 'ASTRONOMY', caption: 'star maps of a sky that has already changed. The constellations remember being wrong.', seed: 55, pos: new THREE.Vector3(4.0, 1.3, -2.6) },
  { id: 'medicine', name: 'MEDICINE', caption: 'cures for diseases that are gone, and names for the ones that came after.', seed: 66, pos: new THREE.Vector3(-1.8, 3.9, 2.6) },
  { id: 'origin', name: 'ORIGIN', caption: 'how they began. The first memory, sealed with seven runes. Everything else is a footnote.', seed: 77, pos: new THREE.Vector3(0.6, 4.6, 0.4) },
];

/**
 * The monolith — a single stone artifact that holds the whole archive.
 * It rises, breathes, remembers touch, and peels open its shards.
 */
export class Monolith {
  scene: THREE.Scene;
  group = new THREE.Group();
  mesh: THREE.Mesh | null = null;
  mat: THREE.ShaderMaterial | null = null;
  shards: THREE.Object3D[] = [];
  shardMats: THREE.MeshBasicMaterial[] = [];
  runeGroup = new THREE.Group();
  runeMeshes: THREE.Mesh[] = [];
  runeMats: THREE.MeshBasicMaterial[] = [];
  light: THREE.PointLight | null = null;
  trail: THREE.Line | null = null;
  trailMat: THREE.LineBasicMaterial | null = null;
  hover = 0;
  reveal = 0;
  private select = 0;
  private awake = 0;
  private trailPts: THREE.Vector3[] = [];
  private pointerWorld = new THREE.Vector3(0, 0, 0);
  private time = 0;
  private hovered = false;
  private raycaster = new THREE.Raycaster();
  private target: THREE.Object3D | null = null;
  private onShardSelected: ((def: ShardDef) => void) | null = null;
  private selectedShard: THREE.Object3D | null = null;
  private runeStates = new Map<number, boolean>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);
    this.build();
  }

  private build() {
    const g = this.group;

    // — the stone —
    const geo = new THREE.IcosahedronGeometry(1.55, 3);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: monolithVert,
      fragmentShader: monolithFrag,
      uniforms: {
        uTime: { value: 0 },
        uHover: { value: 0 },
        uReveal: { value: 0 },
        uSelect: { value: 0 },
        uAwake: { value: 0 },
        uNoiseAmp: { value: 0.12 },
        uPointerWorld: { value: this.pointerWorld },
        uColorA: { value: new THREE.Color(0x565e6e) },
        uColorB: { value: new THREE.Color(0x2a2e3a) },
        uSeed: { value: Math.random() * 1000 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 3.4;
    g.add(this.mesh);

    // — data shards orbit the stone —
    for (let i = 0; i < SHARDS.length; i++) {
      const def = SHARDS[i];
      const sg = new THREE.ConeGeometry(0.14, 0.62, 6);
      const sm = new THREE.MeshBasicMaterial({
        color: 0x2a3238,
        transparent: true,
        opacity: 0.85,
        wireframe: false,
      });
      const sh = new THREE.Mesh(sg, sm);
      sh.position.copy(def.pos);
      sh.userData = { def, base: def.pos.clone(), orbit: (i % 3) * TAU / 3, speed: 0.14 + (i % 5) * 0.05 };
      sh.rotation.z = Math.random() * TAU;
      g.add(sh);
      this.shards.push(sh);
      this.shardMats.push(sm);
    }

    // — runes on the stone's face (floating glyphs, revealed on hover) —
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x0a0c10,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
      const a = (i / 7) * TAU + 0.4;
      r.position.set(Math.cos(a) * 1.75, 3.4 + Math.sin(a * 2.2) * 0.5, Math.sin(a) * 1.75);
      r.lookAt(0, 3.4, 0);
      r.userData = { i, opened: false, base: r.position.clone() };
      g.add(r);
      this.runeMeshes.push(r);
      this.runeMats.push(mat);
    }
    g.add(this.runeGroup);

    // — the light that blooms from the stone when awake —
    this.light = new THREE.PointLight(0x1d5a54, 0, 40, 2);
    this.light.position.y = 4;
    g.add(this.light);

    // — a thin trail that responds to touch —
    const lineGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(64 * 3);
    for (let i = 0; i < 64; i++) pos[i * 3 + 1] = -999;
    lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trailMat = new THREE.LineBasicMaterial({
      color: 0x7fe0d2,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    this.trail = new THREE.Line(lineGeo, this.trailMat);
    g.add(this.trail);
  }

  setHandlers(onShard: (def: ShardDef) => void) {
    this.onShardSelected = onShard;
  }

  setPointerWorld(p: THREE.Vector3) {
    this.pointerWorld.copy(p);
  }

  /** world-space ray intersection with the monolith + shards; returns shard or null */
  raycast(ray: THREE.Ray): THREE.Object3D | null {
    this.raycaster.ray.copy(ray);
    const meshes: THREE.Object3D[] = [this.mesh!, ...this.shards];
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const first = hits[0];
    if (first.object === this.mesh) return this.mesh;
    return first.object;
  }

  hoverMesh(o: THREE.Object3D | null) {
    this.hovered = o === this.mesh;
    if (o && o !== this.mesh && this.shards.includes(o)) {
      this.target = o;
    } else {
      this.target = null;
    }
  }

  isShard(o: THREE.Object3D): o is THREE.Mesh {
    return this.shards.includes(o);
  }

  isRune(o: THREE.Object3D): o is THREE.Mesh {
    return this.runeMeshes.includes(o as THREE.Mesh);
  }

  click(obj: THREE.Object3D | null) {
    if (!obj) return;
    if (this.shards.includes(obj)) {
      const def = obj.userData.def as ShardDef;
      this.onShardSelected?.(def);
    }
  }

  openRune(i: number) {
    if (this.runeStates.get(i)) return;
    this.runeStates.set(i, true);
    const r = this.runeMeshes[i];
    if (r) {
      this.runeMats[i].color.set(0x7fe0d2);
      this.runeMats[i].opacity = 0.9;
      r.userData.opened = true;
    }
  }

  get openedRuneCount() {
    return this.runeStates.size;
  }

  isRuneOpened(i: number) {
    return !!this.runeStates.get(i);
  }

  setReveal(v: number) {
    this.reveal = v;
  }

  setAwake(v: number) {
    this.awake = v;
  }

  update(w: WorldHandles, dt: number) {
    this.time += dt;
    const t = this.time;

    // reveal eases toward 1 (set externally)
    this.reveal += (1 - this.reveal) * (1 - Math.exp(-dt * 0.9));

    this.hover += ((this.hovered ? 1 : 0) - this.hover) * (1 - Math.exp(-dt * 4));
    this.select += ((this.selectedShard ? 1 : 0) - this.select) * (1 - Math.exp(-dt * 3));
    this.awake += ((this.awakeTarget ?? 0) - this.awake) * (1 - Math.exp(-dt * 1.2));

    if (this.mat) {
      this.mat.uniforms.uTime.value = t;
      this.mat.uniforms.uHover.value = this.hover;
      this.mat.uniforms.uReveal.value = this.reveal;
      this.mat.uniforms.uSelect.value = this.select;
      this.mat.uniforms.uAwake.value = this.awake;
      this.mat.uniforms.uPointerWorld.value.copy(this.pointerWorld);
    }

    // shards orbit slowly, tilting toward the pointer
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      const def = s.userData.def as ShardDef;
      const orbit = s.userData.orbit;
      s.userData.orbit += dt * s.userData.speed;
      const base = def.pos;
      const r = Math.hypot(base.x, base.z);
      const a = Math.atan2(base.z, base.x) + orbit;
      const targetX = Math.cos(a) * r;
      const targetZ = Math.sin(a) * r;
      const targetY = base.y + Math.sin(t * 0.4 + i) * 0.3;

      const isSel = s === this.selectedShard;
      // selected shard: held out toward the camera — the user "reads" it
      let ox = targetX, oy = targetY, oz = targetZ;
      if (isSel) {
        const dir = new THREE.Vector3(0, 0.3, 1).normalize();
        ox = targetX + dir.x * 0.8;
        oy = targetY + dir.y * 0.8;
        oz = targetZ + dir.z * 0.8;
      }

      s.position.x += (ox - s.position.x) * (1 - Math.exp(-dt * 3));
      s.position.y += (oy - s.position.y) * (1 - Math.exp(-dt * 3));
      s.position.z += (oz - s.position.z) * (1 - Math.exp(-dt * 3));
      s.rotation.y += dt * (isSel ? 3 : 0.4);
      s.rotation.x = Math.sin(t * 0.6 + i) * 0.2;

      // hover: shard glows
      const shM = this.shardMats[i];
      const isHover = s === this.target && !isSel;
      const glow = (isHover ? 1 : 0) * 0.85 + this.awake * 0.4;
      shM.color.set(isHover || this.awake > 0.3 ? 0x7fe0d2 : 0x2a3238);
      shM.opacity = 0.6 + glow * 0.35;
    }

    // runes: float, glow with the archive's wakefulness
    for (let i = 0; i < this.runeMeshes.length; i++) {
      const r = this.runeMeshes[i];
      const opened = this.runeStates.get(i);
      const mat = this.runeMats[i];
      const targetOpacity = opened ? 0.95 : this.hover > 0.5 ? 0.5 : 0;
      mat.opacity += (targetOpacity - mat.opacity) * (1 - Math.exp(-dt * 3));
      if (opened) {
        mat.color.setHSL(0.47 + Math.sin(t * 2 + i) * 0.02, 0.85, 0.55);
      }
      r.position.y = r.userData.base.y + Math.sin(t * 0.8 + i * 1.7) * 0.06;
      r.rotation.y += dt * 0.3;
    }

    // light blooms when awake
    if (this.light) {
      this.light.intensity = this.awake * 12 + this.hover * 4;
    }

    // trail: keep the last 64 pointer positions
    if (this.trail && w.input.pointer.active) {
      this.trailPts.push(this.pointerWorld.clone());
      if (this.trailPts.length > 64) this.trailPts.shift();
      const posAttr = this.trail.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < 64; i++) {
        const p = this.trailPts[i];
        if (p) {
          arr[i * 3] = p.x;
          arr[i * 3 + 1] = p.y;
          arr[i * 3 + 2] = p.z;
        } else {
          arr[i * 3 + 1] = -999;
        }
      }
      posAttr.needsUpdate = true;
      this.trailMat!.opacity = 0.12 + this.awake * 0.2 + Math.min(0.4, this.hover * 0.4);
    }
  }

  awakeTarget: number | null = null;

  awaken() {
    this.awakeTarget = 1;
  }

  selectShard(def: ShardDef | null) {
    this.selectedShard = def
      ? this.shards.find((s) => s.userData.def.id === def.id) ?? null
      : null;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as THREE.Mesh).material;
      if (mat && !Array.isArray(mat)) mat.dispose();
    });
  }
}
