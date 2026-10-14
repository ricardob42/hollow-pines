export type Q = 'ultra' | 'high' | 'medium' | 'low';
export type ZType = 'normal' | 'fast' | 'tank' | 'big';
export type Kind = 'walker' | 'ghoul';

/** shadow = flashlight shadow map, moon = moonlight shadow map, post: 0 direct, 1 grade, 2 grade + bloom, msaa = composer samples. */
export const QUALITY: Record<Q, { pr: number; shadow: number; moon: number; trees: number; grass: number; cap: number; post: number; msaa: number; dust: number; mist: number }> = {
  ultra: { pr: 2, shadow: 2048, moon: 2048, trees: 1500, grass: 7000, cap: 120, post: 2, msaa: 4, dust: 520, mist: 110 },
  high: { pr: 1.5, shadow: 1024, moon: 1024, trees: 1150, grass: 4200, cap: 90, post: 2, msaa: 4, dust: 380, mist: 80 },
  medium: { pr: 1.25, shadow: 1024, moon: 0, trees: 760, grass: 1800, cap: 60, post: 1, msaa: 0, dust: 220, mist: 50 },
  low: { pr: 1, shadow: 0, moon: 0, trees: 420, grass: 600, cap: 36, post: 0, msaa: 0, dust: 0, mist: 0 },
};

export const CFG = {
  world: { half: 180, seg: 140, cell: 8 },
  player: { hp: 100, walk: 5, sprint: 8.2, crouchSpeed: 2.6, jump: 6.5, gravity: 20, eye: 1.7, eyeCrouch: 1.1, radius: 0.4 },
  // Horde target = base + soft*(1-e^(-t/tau)) + t/lin, clamped to the quality cap: grows fast early, then flattens.
  horde: { base: 5, soft: 30, tau: 420, lin: 120, int0: 2.4, minInt: 0.5, intTau: 360, surgeEvery: 90, burst: 8,
    minDist: 32, maxDist: 52, hideAngle: 1.35, despawn: 90, specialRate: 900, hpGrow: 900, spdGrow: 1200 },
  // Look: everything about the night. Tune these first when it feels too dark / too bright.
  night: { fog: 0.027, fogColor: 0x080d10, moon: 0.34, moonColor: 0x7d9bc6, hemi: 0.16, exposure: 1.25 },
  light: { power: 140, decay: 1.7, dist: 62, penumbra: 0.62, color: 0xfff1d8 },
};

/** head/body/legs = [height, forward offset, radius] of the hit spheres (hunched ghouls carry their head forward); bound = [height, radius]. */
export interface ZDef { kind: Kind; hp: number; speed: number; dmg: number; scale: number; girth: number; score: number; tint: number;
  head: [number, number, number]; body: [number, number, number]; legs: [number, number, number]; bound: [number, number] }
const WALK = { head: [1.74, 0.05, 0.27], body: [1.15, 0, 0.46], legs: [0.45, 0, 0.4], bound: [1.5, 1.7] } as const;
const GHOUL = { head: [1.25, 0.6, 0.27], body: [1.05, 0.3, 0.5], legs: [0.45, 0, 0.4], bound: [1.1, 1.8] } as const;
export const ZOMBIES: Record<ZType, ZDef> = {
  normal: { kind: 'walker', hp: 60, speed: 2.1, dmg: 10, scale: 1, girth: 1, score: 100, tint: 0xffffff, ...WALK },
  fast: { kind: 'ghoul', hp: 35, speed: 4.3, dmg: 7, scale: 0.92, girth: 0.9, score: 150, tint: 0xf0f0f0, ...GHOUL },
  tank: { kind: 'walker', hp: 170, speed: 1.7, dmg: 16, scale: 1.1, girth: 1.28, score: 250, tint: 0xb8b8b0, ...WALK },
  big: { kind: 'ghoul', hp: 340, speed: 1.4, dmg: 28, scale: 1.5, girth: 1.18, score: 500, tint: 0xc8c4bc, ...GHOUL },
} as unknown as Record<ZType, ZDef>;

/** lamp = flashlight intensity multiplier, cone = half-angle (rad). Every weapon carries its own light. */
export interface WDef { id: 'rifle' | 'pistol' | 'knife'; name: string; auto: boolean; melee: boolean; rate: number; dmg: number;
  range: number; mag: number; reserve: number; reload: number; spread: number; recoil: number; lamp: number; cone: number }
export const WEAPONS: WDef[] = [
  { id: 'rifle', name: 'Assault rifle', auto: true, melee: false, rate: 0.095, dmg: 24, range: 200, mag: 30, reserve: 150, reload: 1.9, spread: 0.012, recoil: 0.014, lamp: 1, cone: 0.36 },
  { id: 'pistol', name: 'Pistol', auto: false, melee: false, rate: 0.16, dmg: 42, range: 150, mag: 12, reserve: 72, reload: 1.3, spread: 0.004, recoil: 0.03, lamp: 0.8, cone: 0.42 },
  { id: 'knife', name: 'Combat knife', auto: false, melee: true, rate: 0.5, dmg: 110, range: 2.4, mag: 0, reserve: 0, reload: 0, spread: 0, recoil: 0, lamp: 0.5, cone: 0.5 },
];
