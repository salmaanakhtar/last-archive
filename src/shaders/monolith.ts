export const monolithVert = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uReveal;
  uniform float uSelect;
  uniform float uAwake;
  uniform float uNoiseAmp;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying float vCarve;

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
    f += 0.3 * snoise(p * 2.3 + 3.1);
    f += 0.2 * snoise(p * 5.1 + 7.7);
    return f;
  }

  // vertical fluting — grooves that wrap the obelisk
  float flute(vec3 p) {
    float a = atan(p.x, p.z);
    return abs(sin(a * 16.0)) * 0.16;
  }

  // the displacement field — everything that shapes the stone
  float h(vec3 p, out float carveAmt) {
    float n = fbm(p * 0.55 + uTime * 0.045);
    float fl = flute(p);

    // horizontal inscription bands: recessed channels
    float carve = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 fp = p.yz * 0.9 + vec2(float(i) * 3.7, float(i) * 2.1);
      float line = smoothstep(0.94, 0.78, abs(fract(fp.x) - 0.5));
      carve = max(carve, line * smoothstep(0.3, 0.9, abs(fract(fp.y) - 0.5)));
    }
    carveAmt = carve * 0.4;

    float breathe = uHover * sin(uTime * 1.4) * 0.1;
    float awake = uAwake * (0.5 + 0.5 * sin(uTime * 1.2));
    float amp = uNoiseAmp + uHover * 0.06 + uAwake * 0.08;

    return n * amp - fl - carveAmt + breathe * 0.08 + uSelect * 0.16 + awake * 0.05;
  }

  void main() {
    vUv = uv;
    vPos = position;

    float ca = 0.0;
    float disp = h(position, ca);
    vCarve = ca;

    // analytic-ish surface normals from the displacement field —
    // offsets along the local tangent frame give faceted self-shadowing
    vec3 ref = abs(position.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 t1 = normalize(cross(position, ref));
    vec3 t2 = normalize(cross(position, t1));
    float e = 0.09;
    float c0 = ca;
    float h1 = h(position + t1 * e, c0);
    float h2 = h(position + t2 * e, c0);
    vec3 dir = normalize(position + vec3(0.0, 0.12, 0.0));
    vec3 displaced = position + dir * disp;
    vec3 p1 = position + t1 * e + dir * h1;
    vec3 p2 = position + t2 * e + dir * h2;
    vec3 nrm = normalize(cross(p1 - displaced, p2 - displaced));

    // reveal: rise from the floor
    displaced.y -= (1.0 - uReveal) * 2.6;

    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    vNormal = normalize(normalMatrix * nrm);

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
  varying float vCarve;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7) + uSeed)) * 43758.5453);
  }

  // value noise for stone mottling
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndv = max(dot(N, V), 0.0);

    // mottled stone base — two scales of value noise
    float m1 = vnoise(vWorldPos.xy * 1.4 + vWorldPos.z * 0.8);
    float m2 = vnoise(vWorldPos.xy * 5.2 + vWorldPos.z * 3.1 + 11.0);
    vec3 col = mix(uColorA, uColorB, m1 * 0.65 + m2 * 0.35);

    // broad warm band drifting with time
    float band = 0.5 + 0.5 * sin(vWorldPos.y * 1.2 + uTime * 0.3 + vWorldPos.x * 0.5);
    col *= 0.9 + 0.25 * band;

    // key light: cool moonlight from above-front
    float ndl = max(dot(N, normalize(vec3(0.55, 0.8, 0.35))), 0.0);
    col += vec3(0.6, 0.72, 0.88) * ndl * 0.55;
    // warm fill from behind-left
    float ndw = max(dot(N, normalize(vec3(-0.5, 0.15, -0.35))), 0.0);
    col += vec3(1.0, 0.55, 0.22) * ndw * 0.24;

    // pointer proximity light — the stone remembers being touched
    float distToPointer = distance(vWorldPos, uPointerWorld);
    float touch = exp(-distToPointer * 0.9) * (0.5 + uHover * 0.9);
    col += vec3(1.0, 0.62, 0.25) * touch * 0.5;

    // fluting + inscription grooves: recessed channels hold shadow,
    // their lower edges catch warm light
    float fl = abs(sin(atan(vWorldPos.x, vWorldPos.z) * 16.0)) * 0.5;
    col *= 1.0 - (vCarve * 0.8 + fl * 0.35);
    col += vec3(1.0, 0.55, 0.25) * (vCarve * 0.3 + fl * 0.12) * ndw;

    // carved rune bands — dark channels that glow teal when awake
    float runes = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2 fp = vUv * vec2(2.6, 4.6) + vec2(float(i) * 9.3, float(i) * 4.7);
      float line = smoothstep(0.95, 0.8, abs(fract(fp.x) - 0.5));
      runes = max(runes, line * smoothstep(0.3, 0.9, abs(fract(fp.y) - 0.5)));
    }
    col *= 1.0 - runes * 0.65;
    col += vec3(0.5, 0.95, 0.9) * runes * (0.25 + uAwake * 1.2);

    // edge light from behind
    float rim = pow(1.0 - max(ndv, 0.0), 2.4);
    col += vec3(0.35, 0.75, 0.7) * rim * (0.3 + uAwake * 0.5);

    // subtle fresnel for depth
    col *= 0.85 + 0.35 * ndv;

    gl_FragColor = vec4(col, 1.0);
  }
`;
