export type Q = 'ultra' | 'high' | 'medium' | 'low';
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

export type ZType = 'zombie' | 'crimson' | 'tyrant' | 'dog' | 'lisa';
export type Kind = 'walker' | 'tyrant' | 'dog' | 'lisa';

/** head/body/legs = [height, forward offset, radius] of the hit spheres (hunched / four-legged bodies carry the head forward); bound = [height, radius].
 *  rate = seconds between attacks, reach = attack distance, headMul = headshot multiplier, stagger = speed factor while flinching (1 = never slowed). */
export interface ZDef { kind: Kind; hp: number; speed: number; dmg: number; rate: number; reach: number; scale: number; girth: number; score: number; headMul: number; stagger: number; tint: number;
  head: [number, number, number]; body: [number, number, number]; legs: [number, number, number]; bound: [number, number] }
const WALK = { head: [1.74, 0.05, 0.27], body: [1.15, 0, 0.46], legs: [0.45, 0, 0.4], bound: [1.5, 1.7] } as const;
const TYR = { head: [1.95, 0.05, 0.3], body: [1.3, 0, 0.6], legs: [0.5, 0, 0.45], bound: [1.6, 2.1] } as const;
const DOG = { head: [0.78, 0.62, 0.24], body: [0.66, 0, 0.5], legs: [0.3, 0, 0.3], bound: [0.7, 1.3] } as const;
const LISA = { head: [1.55, 0.75, 0.33], body: [1.2, 0.3, 0.6], legs: [0.5, 0, 0.45], bound: [1.3, 2.2] } as const;
/** Resident Evil (remake) roster. Zombies are slow and revive as Crimson Heads unless the head is destroyed; Crimson Heads are faster and hit harder;
 *  Cerberus dogs are the fastest enemies; Tyrants are tanks with a deadly claw; Lisa Trevor is the boss (one at a time, on a timer). */
export const ZOMBIES: Record<ZType, ZDef> = {
  zombie: { kind: 'walker', hp: 70, speed: 1.55, dmg: 10, rate: 1.3, reach: 1.45, scale: 1, girth: 1, score: 100, headMul: 2.5, stagger: 0.35, tint: 0xffffff, ...WALK },
  crimson: { kind: 'walker', hp: 60, speed: 3.5, dmg: 18, rate: 0.85, reach: 1.45, scale: 1, girth: 1, score: 250, headMul: 2.5, stagger: 0.5, tint: 0xffffff, ...WALK },
  tyrant: { kind: 'tyrant', hp: 480, speed: 2.0, dmg: 34, rate: 1.5, reach: 2.4, scale: 1.15, girth: 1, score: 700, headMul: 1.6, stagger: 0.85, tint: 0xffffff, ...TYR },
  dog: { kind: 'dog', hp: 30, speed: 6.4, dmg: 8, rate: 0.65, reach: 1.05, scale: 1, girth: 1, score: 120, headMul: 2, stagger: 0.2, tint: 0xffffff, ...DOG },
  lisa: { kind: 'lisa', hp: 1800, speed: 2.5, dmg: 40, rate: 1.1, reach: 2.7, scale: 1.3, girth: 1, score: 3000, headMul: 1.4, stagger: 0.95, tint: 0xffffff, ...LISA },
} as unknown as Record<ZType, ZDef>;

/** lamp = flashlight intensity multiplier, cone = half-angle (rad). Every weapon carries its own light. */
export interface WDef { id: 'rifle' | 'pistol' | 'knife'; name: string; auto: boolean; melee: boolean; rate: number; dmg: number;
  range: number; mag: number; reserve: number; reload: number; spread: number; recoil: number; lamp: number; cone: number }
export const WEAPONS: WDef[] = [
  { id: 'rifle', name: 'Assault rifle', auto: true, melee: false, rate: 0.095, dmg: 24, range: 200, mag: 30, reserve: 150, reload: 1.9, spread: 0.012, recoil: 0.014, lamp: 1, cone: 0.36 },
  { id: 'pistol', name: 'Pistol', auto: false, melee: false, rate: 0.16, dmg: 42, range: 150, mag: 12, reserve: 72, reload: 1.3, spread: 0.004, recoil: 0.03, lamp: 0.8, cone: 0.42 },
  { id: 'knife', name: 'Combat knife', auto: false, melee: true, rate: 0.5, dmg: 110, range: 2.4, mag: 0, reserve: 0, reload: 0, spread: 0, recoil: 0, lamp: 0.5, cone: 0.5 },
];
