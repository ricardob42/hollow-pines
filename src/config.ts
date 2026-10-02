export type Q = 'ultra' | 'high' | 'medium' | 'low';
export type ZType = 'normal' | 'fast' | 'tank' | 'big';

export const QUALITY: Record<Q, { pr: number; shadow: number; trees: number; grass: number; cap: number }> = {
  ultra: { pr: 2, shadow: 4096, trees: 1700, grass: 9000, cap: 120 },
  high: { pr: 1.5, shadow: 2048, trees: 1300, grass: 5000, cap: 90 },
  medium: { pr: 1.25, shadow: 1024, trees: 850, grass: 2000, cap: 60 },
  low: { pr: 1, shadow: 0, trees: 450, grass: 0, cap: 36 },
};

export const CFG = {
  world: { half: 180, seg: 140, cell: 8 },
  player: { hp: 100, walk: 5, sprint: 8.2, crouchSpeed: 2.6, jump: 6.5, gravity: 20, eye: 1.7, eyeCrouch: 1.1, radius: 0.4 },
  // Horde target = base + soft*(1-e^(-t/tau)) + t/lin, clamped to the quality cap: grows fast early, then flattens.
  horde: { base: 5, soft: 30, tau: 420, lin: 120, int0: 2.4, minInt: 0.5, intTau: 360, surgeEvery: 90, burst: 8,
    minDist: 32, maxDist: 52, hideAngle: 1.35, despawn: 90, specialRate: 900, hpGrow: 900, spdGrow: 1200 },
};

export const ZOMBIES: Record<ZType, { hp: number; speed: number; dmg: number; scale: number; score: number; skin: number; cloth: number }> = {
  normal: { hp: 60, speed: 2.1, dmg: 10, scale: 1, score: 100, skin: 0x7d8f6a, cloth: 0x3b4252 },
  fast: { hp: 35, speed: 4.3, dmg: 7, scale: 0.92, score: 150, skin: 0x9aa07a, cloth: 0x5a2e2a },
  tank: { hp: 170, speed: 1.7, dmg: 16, scale: 1.12, score: 250, skin: 0x667a5c, cloth: 0x2a2f2a },
  big: { hp: 340, speed: 1.4, dmg: 28, scale: 1.55, score: 500, skin: 0x6f6f5a, cloth: 0x4a3a2a },
};

export interface WDef { id: 'rifle' | 'pistol' | 'knife'; name: string; auto: boolean; melee: boolean; rate: number; dmg: number;
  range: number; mag: number; reserve: number; reload: number; spread: number; recoil: number }
export const WEAPONS: WDef[] = [
  { id: 'rifle', name: 'Assault rifle', auto: true, melee: false, rate: 0.095, dmg: 24, range: 200, mag: 30, reserve: 150, reload: 1.9, spread: 0.012, recoil: 0.014 },
  { id: 'pistol', name: 'Pistol', auto: false, melee: false, rate: 0.16, dmg: 42, range: 150, mag: 12, reserve: 72, reload: 1.3, spread: 0.004, recoil: 0.03 },
  { id: 'knife', name: 'Knife', auto: false, melee: true, rate: 0.5, dmg: 110, range: 2.4, mag: 0, reserve: 0, reload: 0, spread: 0, recoil: 0 },
];
