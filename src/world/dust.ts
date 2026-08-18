import * as THREE from 'three';
import type { WorldHandles } from '../core/engine';
import { dustVert, dustFrag } from '../shaders/dust';
import { TAU } from '../core/renderer';

export class Dust {
  scene: THREE.Scene;
  points: THREE.Points | null = null;
  mat: THREE.ShaderMaterial | null = null;
  private time = 0;
  private pointerWorld = new THREE.Vector3(0, 0, 0);

  constructor(scene: THREE.Scene, count: number) {
    this.scene = scene;
    this.build(count);
  }

  private build(count: number) {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 2.5 + Math.random() * 30;
      const a = Math.random() * TAU;
      const y = 0.3 + Math.random() * 18;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
      vel[i * 3] = (Math.random() - 0.5) * 0.3;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      scale[i] = 0.5 + Math.random() * 2.2;
      phase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(vel, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: {
        uTime: { value: 0 },
        uHover: { value: 0 },
        uReveal: { value: 0 },
        uAwake: { value: 0 },
        uPointerWorld: { value: this.pointerWorld },
        uPointerActive: { value: 0 },
        uColorA: { value: new THREE.Color(0x9a948a) },
        uColorB: { value: new THREE.Color(0x4a4640) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  setPointerWorld(p: THREE.Vector3, active: boolean) {
    this.pointerWorld.copy(p);
    if (this.mat) this.mat.uniforms.uPointerActive.value = active ? 1 : 0;
  }

  update(_w: WorldHandles, dt: number, hover: number, reveal: number, awake: number) {
    this.time += dt;
    if (!this.mat || !this.points) return;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uHover.value = hover;
    this.mat.uniforms.uReveal.value = reveal;
    this.mat.uniforms.uAwake.value = awake;
    this.mat.uniforms.uPointerWorld.value.copy(this.pointerWorld);
  }

  rebuild(count: number) {
    if (!this.points) return;
    const old = this.points.geometry;
    this.build(count);
    // preserve the new geometry; dispose old
    this.scene.remove(this.points);
    old.dispose();
    this.scene.add(this.points!);
  }

  dispose() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      if (this.mat) this.mat.dispose();
    }
  }
}
