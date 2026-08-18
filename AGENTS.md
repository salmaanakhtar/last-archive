# THE LAST ARCHIVE

The final surviving digital archive of a lost civilization. An interactive Three.js descent.

## Setup

```bash
npm install
npm run dev     # serves on http://localhost:5178
npm run build   # tsc && vite build
```

## Architecture

- `src/main.ts` — entry: creates Engine + World, starts the render loop.
- `src/core/` — engine foundation:
  - `engine.ts` — renderer, camera, phase state machine, post (chromatic aberration, vignette, grain), input routing, auto-degrade on sustained low FPS.
  - `quality.ts` — device-tier detection (high/medium/low) with particle budgets, DPR caps, shadow/post toggles.
  - `input.ts`, `sound.ts`, `boot.ts`, `renderer.ts` — pointer/scroll state, procedural WebAudio, boot sequence, composer.
- `src/world/` — the experience:
  - `world.ts` — phase choreography (boot → intro → title → shards → runes → recovered), camera rig, click/hover raycasts.
  - `vault.ts` — the crypt: columns, vein-lit floor, light pool, overhead embers.
  - `monolith.ts` — the Archive artifact: shader-driven stone, 7 orbiting data shards, 7 rune seals, pointer-trail.
  - `dust.ts` — particle field; repelled by the pointer, glints near the artifact.
- `src/shaders/` — monolith displacement/surface + dust points shaders.

## Interaction model

- **Boot** — fades in, then the vault is revealed.
- **Intro scroll** — user descends toward the Archive; headline lines reveal.
- **Title** — idle drift; caption invites touch.
- **Shards** — drag to orbit the artifact; hover shards to glow; click to restore a memory (7 total).
- **Runes** — after 4 shards, seals appear on the stone; click to open all 7.
- **Recovered** — the Archive awakens: light blooms, floor veins pulse, ending overlay.

Sound is fully procedural (WebAudio oscillators + noise) — no asset downloads. Mute toggle top-right.

## Performance

- Auto-degrade: sustained <42fps drops tier (dpr, particles, shadows, post).
- Particles adapt to tier (4200 / 2200 / 900). Post-processing uses half-float RT.
- HUD shows live fps/ms/tier for profiling.
