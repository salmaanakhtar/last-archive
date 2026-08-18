export const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uReveal;
  uniform float uAwake;
  uniform vec3 uPointerWorld;
  uniform float uPointerActive;
  attribute float aScale;
  attribute float aPhase;
  attribute vec3 aVelocity;
  varying float vPhase;
  varying float vDist;

  void main() {
    vPhase = aPhase;
    vec3 pos = position;

    // drift — slow orbital wander through the vault
    pos.x += sin(uTime * 0.25 + aPhase * 6.2831) * 0.8;
    pos.y += sin(uTime * 0.18 + aPhase * 4.1) * 0.5 + uTime * 0.05;
    pos.z += cos(uTime * 0.22 + aPhase * 5.3) * 0.8;

    // pointer repulsion — dust shies away from the hand, then returns
    vec3 toP = pos - uPointerWorld;
    float d = length(toP);
    float force = 0.0;
    if (uPointerActive > 0.5) {
      force = exp(-d * 0.9) * 3.2 * aPhase;
      pos += normalize(toP + vec3(0.0001)) * force;
    }

    // reveal: dust condenses as the artifact rises
    pos.y -= (1.0 - uReveal) * 3.0;

    // awake: dust brightens and swirls
    pos.x += sin(uTime * 0.5 + aPhase * 2.0) * uAwake * 0.5;
    pos.y += cos(uTime * 0.45 + aPhase * 1.7) * uAwake * 0.4;

    vDist = d;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float size = aScale * (1.0 + force * 0.6) * (140.0 / -mv.z);
    gl_PointSize = clamp(size, 1.0, 6.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const dustFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAwake;
  uniform float uHover;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vPhase;
  varying float vDist;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d);

    // color: bone dust, with ember glints near the artifact
    float glint = smoothstep(2.0, 0.5, vDist) * uHover;
    vec3 col = mix(uColorA, uColorB, vPhase * 0.5 + 0.5);
    col += vec3(1.0, 0.6, 0.25) * glint * 0.6;
    col *= 0.7 + 0.6 * uAwake;

    float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + vPhase * 3.0) + vPhase * 40.0);
    gl_FragColor = vec4(col, alpha * twinkle * 0.8);
  }
`;
