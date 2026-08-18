export const monolithVert = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uReveal;
  uniform float uSelect;
  uniform float uAwake;
  uniform float uNoiseAmp;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  // classic simplex noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5 * snoise(p);
    f += 0.25 * snoise(p * 2.7 + 3.1);
    f += 0.125 * snoise(p * 5.9 + 7.7);
    return f;
  }

  void main() {
    vUv = uv;
    vNormal = normal;
    vPos = position;

    float n = fbm(position * 0.9 + uTime * 0.06);

    // hover: the stone leans toward the pointer — a slow breath
    float breathe = uHover * sin(uTime * 1.4) * 0.12;

    // selection: shards peel outward along their normal
    float select = uSelect * 0.16;

    // awakening: the form breathes and light blooms
    float awake = uAwake * (0.5 + 0.5 * sin(uTime * 1.2));

    vec3 dir = normalize(normal + vec3(0.0, 0.2, 0.0));
    vec3 displaced = position + dir * (n * uNoiseAmp + breathe * 0.08 + select + awake * 0.05);

    // reveal: rise from the floor
    displaced.y -= (1.0 - uReveal) * 2.6;

    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    vNormal = normalize(normalMatrix * normal);

    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
  }
`;

export const monolithFrag = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uHover;
  uniform float uReveal;
  uniform float uAwake;
  uniform float uSelect;
  uniform vec3 uPointerWorld;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSeed;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7) + uSeed)) * 43758.5453);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndv = max(dot(N, V), 0.0);

    // base: dark stone with a slow moving band of warm light
    float band = 0.5 + 0.5 * sin(vWorldPos.y * 1.7 + uTime * 0.35 + vWorldPos.x * 0.6);
    vec3 col = mix(uColorA, uColorB, band * 0.5 + 0.5);

    // pointer proximity light — the stone remembers being touched
    float distToPointer = distance(vWorldPos, uPointerWorld);
    float touch = exp(-distToPointer * 0.9) * (0.35 + uHover * 0.6);
    col += vec3(1.0, 0.62, 0.25) * touch;

    // fine etched grain — every surface holds data
    float g = hash(vUv * 900.0);
    col *= 0.86 + 0.14 * g;

    // carved rune lines — faint at rest, brighter when awake
    float runes = 0.0;
    for (int i = 0; i < 6; i++) {
      vec2 fp = vUv * vec2(5.0, 9.0) + vec2(float(i) * 7.3, float(i) * 3.7);
      float line = smoothstep(0.82, 0.86, abs(fract(fp.x) - 0.5));
      runes = max(runes, line * smoothstep(0.5, 0.9, abs(fract(fp.y) - 0.5)));
    }
    float runeGlow = runes * (0.08 + uAwake * 0.8);
    col += vec3(0.5, 0.95, 0.9) * runeGlow;

    // edge light from behind
    float rim = pow(1.0 - max(ndv, 0.0), 2.4);
    col += vec3(0.35, 0.75, 0.7) * rim * (0.15 + uAwake * 0.5);

    // subtle fresnel for depth
    col *= 0.82 + 0.3 * ndv;

    gl_FragColor = vec4(col, 1.0);
  }
`;
