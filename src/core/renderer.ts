import * as THREE from 'three';
import type { QualitySettings } from '../core/quality';

export const TAU = Math.PI * 2;

export const gld = (gl: WebGLRenderingContext, name: string): any =>
  gl.getExtension(name) ?? gl.getExtension('WEBGL_' + name);

export function createCanvasRenderer(container: HTMLElement, q: QualitySettings) {
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: q.msaa > 0,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  if (q.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return renderer;
}

export function createEffectComposer(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const size = { w, h };

  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    samples: 0,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: rt.texture },
        tDepth: { value: null },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(w, h) },
        noiseSeed: { value: Math.random() * 1000 },
        vignette: { value: 0.55 },
        chroma: { value: 1 },
        scan: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform vec2 resolution;
        uniform float noiseSeed;
        uniform float vignette;
        uniform float chroma;
        uniform float scan;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7)) + noiseSeed) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;
          vec3 col = texture2D(tDiffuse, uv).rgb;

          // chromatic offset — strongest at the edges of the frame
          float cd = chroma * (0.0009 + 0.0009 * pow(length(uv - 0.5) * 1.4, 2.0));
          col.r = texture2D(tDiffuse, uv + vec2(cd, 0.0)).r;
          col.b = texture2D(tDiffuse, uv - vec2(cd, 0.0)).b;

          // grain
          float g = hash(uv * resolution * 3.1 + fract(time * 0.7) * 777.0);
          col += (g - 0.5) * 0.045;

          // vignette
          float d = length(uv - 0.5) * 1.5;
          col *= 1.0 - vignette * smoothstep(0.45, 1.15, d);

          // scanlines — faint, only near edges
          float sl = sin(uv.y * resolution.y * 0.5) * 0.5 + 0.5;
          col *= 1.0 - 0.035 * sl * smoothstep(0.4, 0.7, d);

          // color grade: cool shadows, warm highlight pull
          col = pow(col, vec3(0.96, 0.985, 1.045));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: false,
      depthTest: false,
    }),
  );
  const scene2 = new THREE.Scene();
  scene2.add(quad);
  return { rt, quad, scene: scene2, size };
}

export function safeDelete<T extends THREE.Object3D>(obj: T | null) {
  if (!obj) return;
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}
