export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  tier: QualityTier;
  dprCap: number;
  particleCount: number;
  shadows: boolean;
  post: boolean;
  msaa: number;
  starCount: number;
  raycastMonolith: boolean;
}

export function detectQuality(): QualitySettings {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  const touch = navigator.maxTouchPoints > 0;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let tier: QualityTier = 'high';
  if (reduced || mem <= 2 || cores <= 2) tier = 'low';
  else if (small || touch || mem <= 4 || cores <= 4 || dpr > 2) tier = 'medium';

  const map: Record<QualityTier, QualitySettings> = {
    high: {
      tier,
      dprCap: 2,
      particleCount: 4200,
      shadows: true,
      post: true,
      msaa: 4,
      starCount: 900,
      raycastMonolith: true,
    },
    medium: {
      tier,
      dprCap: 1.6,
      particleCount: 2200,
      shadows: false,
      post: true,
      msaa: 2,
      starCount: 500,
      raycastMonolith: true,
    },
    low: {
      tier,
      dprCap: 1.15,
      particleCount: 900,
      shadows: false,
      post: false,
      msaa: 0,
      starCount: 240,
      raycastMonolith: false,
    },
  };

  return map[tier];
}

export function degrade(q: QualitySettings): QualitySettings | null {
  if (q.tier === 'high') return { ...q, ...detectQuality(), tier: 'medium' };
  if (q.tier === 'medium') return { ...q, ...detectQuality(), tier: 'low' };
  return null;
}
