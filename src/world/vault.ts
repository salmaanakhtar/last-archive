import * as THREE from 'three';
import type { WorldHandles } from '../core/engine';
import { TAU } from '../core/renderer';

/**
 * The vault: a vast dark hall. Worn columns, a reflective floor that
 * carries veins of light toward the Archive, and a starless "sky" of
 * slow embers above. Everything is procedural.
 */
export class Vault {
  scene: THREE.Scene;
  private group = new THREE.Group();
  private stars: THREE.Points | null = null;
  private starsMat: THREE.PointsMaterial | null = null;
  private floorMat: THREE.MeshStandardMaterial | null = null;
  private pool: THREE.Mesh | null = null;
  private poolMat: THREE.MeshBasicMaterial | null = null;
  private glow: THREE.Mesh | null = null;
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private colMats: THREE.MeshStandardMaterial[] = [];
  private trail: THREE.Line | null = null;
  private trailMat: THREE.LineBasicMaterial | null = null;
  private floorSides: THREE.Mesh[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.group);
    this.build();
  }

  private build() {
    const g = this.group;

    // — floor: dark stone with faint veins of light —
    const floorGeo = new THREE.PlaneGeometry(140, 140, 1, 1);
    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d26,
      roughness: 0.92,
      metalness: 0.05,
    });
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    g.add(floor);

    // veins: concentric arcs of faint teal light leading to the center
    const veinCount = 5;
    const veinGeo = new THREE.BufferGeometry();
    const pts: THREE.Vector3[] = [];
    for (let ring = 0; ring < veinCount; ring++) {
      const r = 2.4 + ring * 3.4;
      const segs = 90;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU + ring * 1.3;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pts.push(new THREE.Vector3(x, 0.02, z));
      }
    }
    veinGeo.setFromPoints(pts);
    this.trailMat = new THREE.LineBasicMaterial({
      color: 0x2f8a80,
      transparent: true,
      opacity: 0.95,
    });
    this.trail = new THREE.Line(veinGeo, this.trailMat);
    g.add(this.trail);

    // — side walls — far planes that catch the rim light
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x10131a,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    });
    const wallGeo = new THREE.BoxGeometry(160, 30, 160);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 14;
    g.add(walls);
    this.floorSides.push(walls);

    // — worn columns flanking the path —
    const colGeo = new THREE.CylinderGeometry(0.9, 1.15, 11, 12, 1, false);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const z = -14 + i * 9;
        const mat = new THREE.MeshStandardMaterial({
          color: 0x3a3f4d,
          roughness: 0.9,
          metalness: 0.05,
        });
        const col = new THREE.Mesh(colGeo, mat);
        col.position.set(side * 11, 5.4, z);
        col.rotation.y = (i * 0.7 + side) * 0.4;
        col.receiveShadow = true;
        g.add(col);
        this.colMats.push(mat);
      }
    }

    // — overhead embers: a sparse dusting high above —
    const starCount = 900;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * TAU;
      const r = 30 + Math.random() * 70;
      starPos[i * 3] = Math.cos(a) * r;
      starPos[i * 3 + 1] = 22 + Math.random() * 24;
      starPos[i * 3 + 2] = Math.sin(a) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starsMat = new THREE.PointsMaterial({
      color: 0xa9a296,
      size: 0.42,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.stars = new THREE.Points(starGeo, this.starsMat);
    g.add(this.stars);

    // — light pool beneath the Archive —
    this.poolMat = new THREE.MeshBasicMaterial({
      color: 0x1e8a80,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9, 1, 1), this.poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    g.add(this.pool);

    // — volumetric fake: a soft column of light from above —
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x3a8a80,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 26, 24, 1, true), this.glowMat);
    this.glow.position.y = 13;
    g.add(this.glow);

    // — a single point light above the archive — the archive's own light —
    const beacon = new THREE.PointLight(0x7fe0d2, 30, 60, 1.8);
    beacon.position.set(0, 16, 0);
    g.add(beacon);
  }

  update(w: WorldHandles, dt: number, awake: number) {
    this.time += dt;

    // floor veins: pulse with the archive's heartbeat, stronger when awake
    if (this.trailMat) {
      const pulse = 0.4 + 0.15 * Math.sin(this.time * 0.8);
      this.trailMat.opacity = 0.55 + pulse * 0.3 + awake * 0.45;
    }

    // light pool breathes and follows the pointer's world position softly
    if (this.pool && this.poolMat) {
      const target = w.input.pointer.worldPlane;
      const ease = 1 - Math.exp(-dt * 1.8);
      this.pool.position.x += (target.x * 0.55 - this.pool.position.x) * ease;
      this.pool.position.z += (target.z * 0.55 - this.pool.position.z) * ease;
      this.poolMat.opacity = 0.7 + 0.3 * Math.sin(this.time * 1.3) + awake * 0.3;
      const s = 9 + 3 * Math.sin(this.time * 0.5) + awake * 3;
      this.pool.scale.set(s, s, 1);
    }

    // glow column flickers like old light
    if (this.glow && this.glowMat) {
      this.glowMat.opacity = 0.2 + 0.08 * Math.sin(this.time * 0.9) + awake * 0.15;
      this.glow.rotation.y += dt * 0.02;
    }

    // stars: slow rotation, slight parallax
    if (this.stars) {
      this.stars.rotation.y += dt * 0.008;
      this.stars.position.x = w.camera.position.x * 0.03;
      this.stars.position.z = w.camera.position.z * 0.03;
    }

    // columns: barely visible shift of color with the light
    for (let i = 0; i < this.colMats.length; i++) {
      const mat = this.colMats[i];
      mat.color.setHSL(0.02 + i * 0.001, 0.1, 0.09 + 0.008 * Math.sin(this.time * 0.4 + i));
    }
  }

  setQuality(particleBudget: number) {
    if (this.stars) {
      this.stars.geometry.attributes.position.needsUpdate = true;
      const count = Math.min(particleBudget, 900);
      // rebuild star positions with budget
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const r = 30 + Math.random() * 70;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = 22 + Math.random() * 24;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      this.stars.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    }
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
