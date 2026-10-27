import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, ZOMBIES, type ZType, type Kind } from './config';
import { heightAt, type World } from './world';
import { sfx } from './audio';
import { flesh } from './tex';

// ---------- procedural bodies: every part is merged into one vertex-coloured mesh (6 meshes + a glowing-eyes mesh per enemy) ----------
type G = THREE.BufferGeometry; const V3 = THREE.Vector3;
const tint = (g: G, hex: number) => {
  const k = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const at = (g: G, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz))); return g;
};
const sph = (r: number, hex: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 10) => tint(at(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), x, y, z, 0, 0, 0, sx, sy, sz), hex);
const bx = (w: number, h: number, d: number, hex: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => tint(at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), hex);
const cone = (r: number, h: number, hex: number, x: number, y: number, z: number, rx = 0, rz = 0) => tint(at(new THREE.ConeGeometry(r, h, 5), x, y, z, rx, 0, rz), hex);
/** r0 = bottom radius, r1 = top radius. */
const cyl = (r0: number, r1: number, l: number, hex: number, x: number, y: number, z: number, seg = 8) => tint(at(new THREE.CylinderGeometry(r1, r0, l, seg), x, y, z), hex);
type P3 = [number, number, number];
/** Tapered limb segment from point a (radius r0) to point b (radius r1). */
const lm = (a: P3, b: P3, r0: number, r1: number, hex: number, seg = 7) => {
  const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1))); return tint(g, hex);
};
const join = (gs: G[]) => mergeGeometries(gs, false)!;
const eyeG = (r: number, pts: P3[]) => join(pts.map((p) => at(new THREE.SphereGeometry(r, 8, 6), p[0], p[1], p[2])));
/** Organic irregularity: push vertices along their normals with a smooth deterministic wobble. */
const warp = (g: G, amt: number, s: number) => {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = ((Math.sin(x * 23 + s) + Math.sin(y * 19 + s * 1.7) + Math.sin(z * 29 + s * 0.6)) / 3) * amt; p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k); }
  return g;
};
/** torso/head/aL/aR = body parts; leg = shared by both (hind) legs; for dogs aL/aR are the front legs. eyes = glowing mesh parented to the head. */
interface Parts { torso: G; head: G; aL: G; aR: G; leg: G; eyes: G }
const SK = [0x8d9784, 0xa09a88, 0x7f8c7a], CR = [0xa63a2c, 0x93301f, 0xb24c3a], JK = [0x4a5140, 0x3a3e45, 0x4e3b2d], PT = [0x2b2824, 0x1f2326, 0x3a3128];
const BLOOD = 0x5c1010, DARK = 0x150d0d, SHIRT = 0xb9b4a2, BONE = 0xcfc8b4, S2 = [-1, 1];

/** Zombie (remake): torn jacket over an open bloodied shirt, pale grey-green skin, milky eyes, bare feet, arms reaching.
 *  Crimson Head (cr = true): the same body skinned raw red, with long dark claws and bone-white glowing eyes. */
function walker(v: number, cr: boolean): Parts {
  const jc = JK[v], sk = cr ? CR[v] : SK[v], pc = PT[v], shirt = cr ? 0x8c5046 : SHIRT, bl = cr ? 0x3a0707 : BLOOD, fl = cr ? 0.12 : 0.07;
  const t: G[] = [tint(at(new THREE.CylinderGeometry(0.2, 0.165, 0.62, 10), 0, 0.31, 0, 0, 0, 0, 1, 1, 0.68), jc), cyl(0.05, 0.055, 0.12, sk, 0, 0.7, 0), bx(0.12, 0.5, 0.02, shirt, 0, 0.33, 0.118), bx(0.2, 0.05, 0.08, jc, 0, 0.64, -0.02),
    bx(0.33, 0.15, 0.2, pc, 0, -0.03, 0), bx(0.34, 0.03, 0.205, 0x1a1512, 0, 0.05, 0), sph(0.055, bl, 0.06, 0.3, 0.125, 1, 1, 0.35), sph(0.04, 0x3a0808, -0.05, 0.42, 0.13, 1, 1, 0.3)];
  for (const s of S2) t.push(sph(0.095, jc, s * 0.215, 0.585, 0, 1, 1, 0.9), bx(0.06, 0.36, 0.02, jc, s * 0.075, 0.4, 0.124, 0, 0, -s * 0.22));
  for (let i = 0; i < 3; i++) t.push(bx(0.07, 0.012, 0.01, BONE, 0.06, 0.27 + i * 0.03, 0.137, 0, 0, 0.15));
  const h: G[] = [sph(0.115, sk, 0, 0.13, 0, 0.95, 1.12, 1, 12), sph(0.075, sk, 0, 0.07, 0.03, 1, 0.9, 1), bx(0.07, cr ? 0.032 : 0.022, 0.02, 0x2b0b0b, 0, 0.045, 0.095), bx(0.058, 0.008, 0.01, 0xcbc4a8, 0, 0.056, 0.1),
    bx(0.014, 0.04, 0.014, sk, 0, 0.1, 0.112, 0.3), sph(0.04, bl, -0.04, 0.215, 0.03, 1, 0.5, 1), sph(0.03, 0x3a0808, 0.06, 0.19, -0.02, 1, 0.5, 1), bx(0.08, 0.03, 0.02, bl, 0, 0.03, 0.095)];
  for (const s of S2) h.push(sph(0.03, DARK, s * 0.042, 0.145, 0.09, 1, 0.9, 0.5), sph(0.025, sk, s * 0.11, 0.12, 0, 0.5, 1, 0.8));
  const arm = (s: number) => {
    const E: P3 = [s * 0.02, -0.28, 0], M: P3 = [s * 0.02, -0.4, 0.06], W: P3 = [s * 0.02, -0.5, 0.16];
    const a: G[] = [lm([0, 0, 0], E, 0.05, 0.042, jc), lm(E, M, 0.042, 0.036, jc), lm(M, W, 0.034, 0.028, sk), sph(0.04, sk, W[0], W[1], W[2] + 0.02, 0.8, 1, 1.2), sph(0.028, bl, s * 0.02, -0.45, 0.1, 1, 1, 0.6)];
    for (let i = 0; i < 4; i++) a.push(lm(W, [W[0] + (i - 1.5) * 0.014, W[1] - fl, W[2] + fl], 0.012, 0.006, cr ? 0x2a1a14 : sk, 5));
    return warp(join(a), 0.006, v + s);
  };
  const L: G[] = [lm([0, 0, 0], [0, -0.46, 0.02], 0.078, 0.064, pc), lm([0, -0.46, 0.02], [0, -0.74, 0], 0.064, 0.052, pc), lm([0, -0.74, 0], [0, -0.9, 0], 0.042, 0.034, sk), bx(0.075, 0.04, 0.18, sk, 0, -0.91, 0.05)];
  for (let i = 0; i < 5; i++) L.push(bx(0.012, 0.012, 0.03, sk, (i - 2) * 0.014, -0.91, 0.15));
  return { torso: warp(join(t), 0.012, v), head: warp(join(h), 0.006, v + 5), aL: arm(-1), aR: arm(1), leg: join(L), eyes: eyeG(0.018, [[-0.042, 0.145, 0.108], [0.042, 0.145, 0.108]]) };
}

/** Tyrant: towering pale bruiser, red vein network, bare skull with an exposed patch, one huge arm ending in three long claws. */
function tyrant(): Parts {
  const sk = 0x9a8e8a, vn = 0x7c1d1d, dk = 0x1d1a18, claw = 0xb8b0a0;
  const t: G[] = [sph(0.27, sk, 0, 0.48, 0, 1.3, 1.1, 0.75, 12), cyl(0.17, 0.22, 0.3, sk, 0, 0.16, 0, 10), bx(0.46, 0.2, 0.3, dk, 0, -0.02, 0), cyl(0.09, 0.11, 0.16, sk, 0, 0.78, 0), sph(0.07, 0x5a1010, -0.1, 0.74, 0.04, 1, 1, 0.5)];
  for (const s of S2) t.push(sph(0.12, sk, s * 0.3, 0.68, -0.02, 1.2, 1, 1), sph(0.12, sk, s * 0.13, 0.52, 0.15, 1, 0.8, 0.6));
  for (let i = 0; i < 6; i++) for (const s of S2) t.push(bx(0.012, 0.28, 0.01, vn, s * (0.04 + i * 0.045), 0.45, 0.2, 0, 0, s * (0.15 + i * 0.05)));
  for (let i = 0; i < 5; i++) t.push(cone(0.03, 0.09, 0x6a5a56, 0, 0.35 + i * 0.09, -0.2, -Math.PI / 2));
  const h: G[] = [sph(0.13, sk, 0, 0.14, 0, 0.95, 1.2, 1.05, 12), bx(0.1, 0.03, 0.03, 0x2a0707, 0, 0.02, 0.12), bx(0.1, 0.04, 0.09, sk, 0, -0.03, 0.06, 0.3), sph(0.07, 0x8a3a3a, 0, 0.27, -0.04, 1, 0.7, 1), sph(0.03, 0x1a0f0f, -0.045, 0.16, 0.115, 1, 0.9, 0.5), sph(0.03, 0x1a0f0f, 0.045, 0.16, 0.115, 1, 0.9, 0.5)];
  for (let i = 0; i < 4; i++) for (const s of S2) h.push(bx(0.012, 0.1, 0.01, vn, s * (0.03 + i * 0.025), 0.22, 0.1, 0.5));
  for (let i = 0; i < 5; i++) h.push(bx(0.008, 0.02, 0.01, 0xd8d2b8, (i - 2) * 0.016, 0.0, 0.14));
  const arm = (s: number) => {
    const big = s > 0, E: P3 = [s * 0.03, big ? -0.4 : -0.36, 0.03], W: P3 = [s * 0.03, big ? -0.85 : -0.72, big ? 0.12 : 0.1];
    const a: G[] = [lm([0, 0, 0], E, big ? 0.115 : 0.1, 0.09, sk), lm(E, W, 0.09, big ? 0.06 : 0.07, sk), sph(0.07, sk, W[0], W[1] - 0.02, W[2] + 0.02, 1, 1, 1.1), sph(0.05, 0x5a1010, s * 0.05, -0.55, 0.08, 1, 1, 0.6)];
    for (let i = 0; i < 4; i++) a.push(bx(0.012, 0.3, 0.01, vn, s * 0.07, -0.2 - i * 0.05, 0.05 + i * 0.01, 0, 0, 0.1 * i));
    if (big) for (let i = 0; i < 3; i++) { const dx = (i - 1) * 0.04; a.push(lm(W, [W[0] + dx, W[1] - 0.16, W[2] + 0.1], 0.02, 0.014, claw, 5), lm([W[0] + dx, W[1] - 0.16, W[2] + 0.1], [W[0] + dx * 1.3, W[1] - 0.36, W[2] + 0.24], 0.014, 0.004, claw, 5)); }
    else for (let i = 0; i < 4; i++) a.push(lm(W, [W[0] + (i - 1.5) * 0.02, W[1] - 0.12, W[2] + 0.05], 0.016, 0.006, claw, 5));
    return warp(join(a), 0.008, s + 3);
  };
  const L: G[] = [lm([0, 0, 0], [0, -0.28, 0.02], 0.11, 0.1, dk), lm([0, -0.28, 0.02], [0, -0.5, 0.03], 0.1, 0.09, sk), lm([0, -0.5, 0.03], [0, -0.94, 0], 0.08, 0.05, sk), bx(0.09, 0.04, 0.22, sk, 0, -0.96, 0.06), sph(0.04, 0x5a1010, 0.05, -0.62, 0.05, 1, 1, 0.5)];
  for (let i = 0; i < 5; i++) L.push(bx(0.014, 0.014, 0.035, sk, (i - 2) * 0.017, -0.96, 0.18));
  return { torso: warp(join(t), 0.01, 1), head: warp(join(h), 0.006, 2), aL: arm(-1), aR: arm(1), leg: join(L), eyes: eyeG(0.014, [[-0.045, 0.16, 0.12], [0.045, 0.16, 0.12]]) };
}

/** Cerberus: infected Doberman. Dark fur with tan legs, raw flesh and exposed ribs on the back, bared fangs, amber eyes. Front legs are aL/aR, hind legs `leg`. */
function dog(v: number): Parts {
  const fur = [0x2b1e18, 0x211a16][v % 2], tan = 0x7b5a3a, raw = 0x6a1410, tooth = 0xe2dcc6;
  const t: G[] = [sph(0.3, fur, 0, 0, 0, 0.8, 0.9, 1.75, 12), sph(0.24, fur, 0, 0.02, -0.35, 0.85, 0.9, 1.1), sph(0.2, tan, 0, 0.02, 0.3, 0.9, 1, 1.1), lm([0, 0.08, 0.36], [0, 0.14, 0.5], 0.14, 0.1, fur),
    lm([0, 0.08, -0.48], [0, 0, -0.82], 0.045, 0.018, fur, 5), sph(0.12, raw, 0, 0.22, -0.05, 1, 0.35, 1.5), sph(0.09, 0x4a0c0c, 0.1, 0.2, 0.2, 1, 0.4, 1), sph(0.08, raw, -0.12, 0.1, -0.3, 0.5, 1, 1)];
  for (let i = 0; i < 6; i++) { const z = 0.38 - i * 0.14; t.push(sph(0.02, BONE, 0, 0.27 * Math.sqrt(Math.max(0.1, 1 - (z / 0.525) ** 2)), z)); }
  for (let i = 0; i < 5; i++) for (const s of S2) t.push(bx(0.012, 0.11, 0.02, BONE, s * 0.215, 0.02, 0.2 - i * 0.07, 0, 0, s * 0.25));
  const h: G[] = [sph(0.12, fur, 0, 0.02, 0.08, 0.85, 0.85, 1.15), lm([0, -0.01, 0.15], [0, -0.04, 0.37], 0.08, 0.05, fur), sph(0.03, 0x111111, 0, -0.03, 0.38), lm([0, -0.07, 0.14], [0, -0.17, 0.33], 0.05, 0.035, tan),
    bx(0.03, 0.01, 0.1, 0x8a2a30, 0, -0.1, 0.27, 0.4), cone(0.045, 0.12, fur, -0.06, 0.16, 0, 0.2, 0.2), cone(0.045, 0.12, fur, 0.06, 0.16, 0, 0.2, -0.2)];
  for (let i = 0; i < 4; i++) for (const s of S2) h.push(bx(0.008, 0.035, 0.008, tooth, s * 0.04, -0.07 - (i % 2) * 0.01, 0.2 + i * 0.045), bx(0.008, 0.03, 0.008, tooth, s * 0.03, -0.12, 0.22 + i * 0.04));
  const arm = (s: number) => join([lm([0, 0, 0], [0, -0.2, -0.04], 0.07, 0.055, fur), lm([0, -0.2, -0.04], [0, -0.4, 0.04], 0.055, 0.035, tan), lm([0, -0.4, 0.04], [0, -0.57, 0.08], 0.035, 0.03, tan), bx(0.05, 0.03, 0.09, tan, 0, -0.59, 0.1), sph(0.035, raw, s * 0.04, -0.12, 0, 1, 1, 0.6)]);
  const L = join([sph(0.1, fur, 0, -0.05, 0, 0.8, 1.2, 1.4), lm([0, 0, 0], [0, -0.2, 0.12], 0.08, 0.055, fur), lm([0, -0.2, 0.12], [0, -0.42, -0.06], 0.055, 0.035, tan), lm([0, -0.42, -0.06], [0, -0.58, 0.05], 0.035, 0.03, tan), bx(0.05, 0.03, 0.09, tan, 0, -0.6, 0.08)]);
  return { torso: warp(join(t), 0.008, v), head: warp(join(h), 0.005, v + 1), aL: arm(-1), aR: arm(1), leg: L, eyes: eyeG(0.017, [[-0.055, 0.06, 0.17], [0.055, 0.06, 0.17]]) };
}

/** Lisa Trevor: hunched mass of raw flesh draped in flayed skin sheets, a skin hood over a ruined face, huge hooked hands, chains dragging from her arm. */
function lisa(): Parts {
  const sk = 0x9a7c62, fl = 0x7a3426, hide = 0x6f5640, st = 0x5a5f63, hook = 0xb3a88f;
  const t: G[] = [sph(0.32, fl, 0, 0.5, 0, 1.1, 1.15, 0.9, 12), sph(0.26, sk, 0, 0.12, 0, 0.9, 1.4, 0.8), bx(0.4, 0.2, 0.26, 0x4a3626, 0, -0.03, 0), sph(0.3, sk, 0, 0.62, -0.2, 1.1, 1, 0.9), lm([0, 0.7, 0.04], [0, 0.82, 0.1], 0.1, 0.08, sk),
    bx(0.55, 0.75, 0.04, hide, 0, 0.38, -0.36, 0.25), sph(0.28, hide, 0, 0.86, -0.1, 1.4, 0.5, 1.2), sph(0.09, 0x4a0c0c, 0.12, 0.35, 0.22, 1, 1, 0.5), sph(0.08, 0x4a0c0c, -0.14, 0.55, 0.24, 1, 1, 0.5)];
  for (let i = 0; i < 6; i++) t.push(bx(0.2 + (i % 2) * 0.06, 0.5, 0.03, i % 2 ? sk : hide, -0.27 + i * 0.11, 0.25, -0.31 - (i % 2) * 0.05, 0.1, 0, 0.15 * (i - 2.5)));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; t.push(bx(0.045, 0.014, 0.03, st, Math.sin(a) * 0.33, 0.1, Math.cos(a) * 0.24, 0, a, i % 2 ? 1.4 : 0)); }
  const h: G[] = [sph(0.14, sk, 0, 0.12, 0, 0.9, 1.15, 1), sph(0.17, hide, 0, 0.17, -0.05, 1, 0.9, 1.1), bx(0.12, 0.05, 0.03, 0x2a0707, 0, 0, 0.12), bx(0.1, 0.04, 0.1, sk, 0, -0.06, 0.06, 0.5), sph(0.035, DARK, -0.05, 0.12, 0.12, 1, 1.2, 0.5), sph(0.035, DARK, 0.05, 0.12, 0.12, 1, 1.2, 0.5)];
  for (let i = 0; i < 6; i++) h.push(bx(0.01, 0.03, 0.01, 0xd8d2b8, (i - 2.5) * 0.017, 0.015, 0.138));
  for (const s of S2) for (let k = 0; k < 2; k++) h.push(lm([s * (0.08 + k * 0.04), 0.25, -0.05], [s * (0.1 + k * 0.05), -0.1 - k * 0.05, -0.12], 0.012, 0.006, 0x3a2418, 4));
  const arm = (s: number) => {
    const E: P3 = [s * 0.04, -0.45, 0.05], W: P3 = [s * 0.03, -0.95, 0.15];
    const a: G[] = [lm([0, 0, 0], E, 0.12, 0.09, sk), lm(E, W, 0.09, 0.06, sk), sph(0.06, fl, W[0], W[1], W[2], 1, 1, 1.1), sph(0.05, 0x4a0c0c, s * 0.05, -0.6, 0.08, 1, 1, 0.6), lm([0, 0.02, 0], E, 0.05, 0.04, hide)];
    for (let i = 0; i < 4; i++) { const m: P3 = [W[0] + (i - 1.5) * 0.025, W[1] - 0.14, W[2] + 0.09]; a.push(lm(W, m, 0.02, 0.014, hook, 5), lm(m, [m[0] + (i - 1.5) * 0.01, m[1] - 0.12, m[2] - 0.05], 0.014, 0.005, hook, 5)); }
    if (s < 0) for (let i = 0; i < 9; i++) a.push(bx(0.03, 0.012, 0.045, st, W[0], W[1] - 0.05 - i * 0.05, W[2] + 0.05 + i * 0.012, 0, i % 2 ? 1.57 : 0, 0));
    return warp(join(a), 0.01, s + 7);
  };
  const L: G[] = [lm([0, 0, 0], [0, -0.34, 0.22], 0.12, 0.09, sk), lm([0, -0.34, 0.22], [0, -0.8, 0.02], 0.085, 0.05, sk), bx(0.09, 0.04, 0.22, sk, 0, -0.82, 0.12), sph(0.05, fl, 0.06, -0.2, 0.18, 1, 1, 0.5)];
  for (let i = 0; i < 5; i++) L.push(bx(0.013, 0.013, 0.035, sk, (i - 2) * 0.016, -0.82, 0.25));
  return { torso: warp(join(t), 0.012, 3), head: warp(join(h), 0.008, 4), aL: arm(-1), aR: arm(1), leg: join(L), eyes: eyeG(0.016, [[-0.05, 0.12, 0.135], [0.05, 0.12, 0.135]]) };
}
const cache = new Map<string, Parts>();
const parts = (type: ZType, v: number): Parts => {
  const k = type + v; let p = cache.get(k);
  if (!p) cache.set(k, (p = type === 'zombie' ? walker(v, false) : type === 'crimson' ? walker(v, true) : type === 'tyrant' ? tyrant() : type === 'dog' ? dog(v) : lisa()));
  return p;
};
/** hip = body pivot height, leg/legZ = hind (or hip) leg offset, sh = shoulder (front-leg) offset in body space, neck = head pivot in body space. */
const KS = {
  walker: { hip: 0.93, leg: 0.1, legZ: 0, sh: [0.25, 0.58, 0], neck: [0, 0.72, 0], rad: 0.4, fr: 3 },
  tyrant: { hip: 0.98, leg: 0.15, legZ: 0, sh: [0.36, 0.7, 0], neck: [0, 0.86, 0], rad: 0.5, fr: 1.6 },
  dog: { hip: 0.62, leg: 0.11, legZ: -0.4, sh: [0.12, 0.03, 0.36], neck: [0, 0.14, 0.5], rad: 0.3, fr: 4 },
  lisa: { hip: 0.95, leg: 0.15, legZ: 0, sh: [0.34, 0.7, 0.02], neck: [0, 0.85, 0.1], rad: 0.55, fr: 1 },
} as const;
const glowMat = (r: number, g: number, b: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
/** Eyes are unlit so they glow in the dark (HDR values feed the bloom): milky zombies, white-hot Crimson Heads, amber dogs. */
const EYES: Record<ZType, THREE.Material> = { zombie: glowMat(0.55, 0.6, 0.5), crimson: glowMat(3, 2.8, 2.5), tyrant: glowMat(1.6, 0.25, 0.2), dog: glowMat(2.2, 1.1, 0.3), lisa: glowMat(1.5, 1.4, 1.1) };

let uid = 0;
interface Hit { z: Zombie | null; t: number; head: boolean }

export class Zombie {
  readonly group = new THREE.Group(); readonly id = uid++;
  readonly mat: THREE.MeshStandardMaterial;
  active = false; dying = false; down = false; type: ZType = 'zombie'; kind: Kind = 'walker'; hp = 0; maxHp = 1; hpM = 1; spdM = 1; speed = 0; dmg = 0; rate = 1; s = 1; t = 0; atk = 0; hurt = 0;
  flank = 0; phase = 0; yaw = 0; groan = 0; swing = 0; reach = 1.4; rise = 25; sep = 1.2; rad = 0.4; fr = 3;
  private body = new THREE.Group(); private torso: THREE.Mesh; private head: THREE.Mesh; private aL: THREE.Mesh; private aR: THREE.Mesh; private lL: THREE.Mesh; private lR: THREE.Mesh; eyes: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const F = flesh(); this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: F.map, bumpMap: F.bump, bumpScale: 1.5, roughness: 0.78 });
    const mk = (parent: THREE.Object3D) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); m.castShadow = true; parent.add(m); return m; };
    this.lL = mk(this.group); this.lR = mk(this.group); this.group.add(this.body);
    this.torso = mk(this.body); this.head = mk(this.body); this.aL = mk(this.body); this.aR = mk(this.body);
    this.eyes = new THREE.Mesh(new THREE.BufferGeometry(), EYES.zombie); this.head.add(this.eyes);
    this.group.rotation.order = 'YXZ'; this.group.visible = false; scene.add(this.group);
  }
  get pos(): THREE.Vector3 { return this.group.position; }
  init(type: ZType, x: number, z: number, hpM: number, spdM: number): void {
    const c = ZOMBIES[type], K = KS[c.kind], P = parts(type, (Math.random() * (c.kind === 'dog' ? 2 : 3)) | 0);
    this.type = type; this.kind = c.kind; this.hpM = hpM; this.spdM = spdM; this.hp = this.maxHp = c.hp * hpM; this.speed = c.speed * spdM * (0.9 + Math.random() * 0.2);
    this.dmg = c.dmg; this.rate = c.rate; this.reach = c.reach; this.s = c.scale; this.rad = K.rad * c.scale; this.fr = K.fr; this.sep = c.kind === 'dog' ? 0.75 : 1.2 * c.scale;
    this.torso.geometry = P.torso; this.head.geometry = P.head; this.aL.geometry = P.aL; this.aR.geometry = P.aR; this.lL.geometry = this.lR.geometry = P.leg; this.eyes.geometry = P.eyes;
    this.eyes.material = EYES[type]; this.eyes.visible = true; this.mat.roughness = type === 'crimson' || type === 'dog' ? 0.45 : 0.78;
    this.mat.color.setHex(c.tint).multiplyScalar(0.85 + Math.random() * 0.3);
    this.lL.position.set(-K.leg, K.hip, K.legZ); this.lR.position.set(K.leg, K.hip, K.legZ); this.body.position.set(0, K.hip, 0); this.head.position.set(K.neck[0], K.neck[1], K.neck[2]);
    this.aL.position.set(-K.sh[0], K.sh[1], K.sh[2]); this.aR.position.set(K.sh[0], K.sh[1], K.sh[2]);
    this.group.scale.set(c.girth * c.scale, c.scale, c.girth * c.scale);
    this.group.position.set(x, heightAt(x, z), z); this.group.rotation.set(0, 0, 0);
    this.active = true; this.dying = this.down = false; this.t = 0; this.atk = 0.6; this.hurt = 0; this.swing = 0; this.yaw = 0;
    this.flank = Math.random() * 6.28; this.groan = 1 + Math.random() * 4; this.group.visible = true; this.pose(0);
  }
  pose(ph: number): void {
    const sw = this.swing, K = KS[this.kind];
    switch (this.kind) {
      case 'walker': {
        const cr = this.type === 'crimson';
        this.lL.rotation.x = Math.sin(ph) * (cr ? 0.9 : 0.6); this.lR.rotation.x = -Math.sin(ph) * (cr ? 0.9 : 0.6);
        this.body.rotation.set((cr ? 0.28 : 0.1) + Math.sin(ph * 2) * 0.02, 0, Math.sin(ph) * (cr ? 0.1 : 0.05)); this.head.rotation.set(cr ? 0.1 : 0.25, 0, (cr ? 0.15 : 0.35) + Math.sin(ph * 0.7) * 0.08);
        const a = (cr ? -0.9 : -1.25) + Math.sin(ph * (cr ? 1.2 : 0.5)) * (cr ? 0.5 : 0.12) - sw * (cr ? 1.2 : 0.9); this.aL.rotation.set(a, 0, -0.12); this.aR.rotation.set(cr ? a + Math.sin(ph) * 0.6 : a, 0, 0.12);
        break;
      }
      case 'tyrant':
        this.lL.rotation.x = Math.sin(ph) * 0.55; this.lR.rotation.x = -Math.sin(ph) * 0.55; this.body.rotation.set(0.18 + Math.sin(ph * 2) * 0.02, 0, Math.sin(ph) * 0.04); this.head.rotation.set(0.1, 0, Math.sin(ph * 0.5) * 0.05);
        this.aL.rotation.set(-0.25 - Math.sin(ph) * 0.35, 0, -0.1); this.aR.rotation.set(-0.15 + Math.sin(ph) * 0.35 - sw * 1.7, 0, 0.1); break;
      case 'dog': {
        const g = Math.sin(ph);
        this.aL.rotation.x = g * 0.9; this.aR.rotation.x = Math.sin(ph + 0.5) * 0.9; this.lL.rotation.x = -Math.sin(ph + 0.3) * 0.9; this.lR.rotation.x = -Math.sin(ph + 0.8) * 0.9;
        this.body.position.set(0, K.hip + Math.abs(g) * 0.06, sw * 0.25); this.body.rotation.set(g * 0.06, 0, 0); this.head.rotation.set(0.12 + Math.sin(ph * 2) * 0.05 - sw * 0.5, 0, 0);
        break;
      }
      case 'lisa':
        this.lL.rotation.x = Math.sin(ph) * 0.7; this.lR.rotation.x = -Math.sin(ph) * 0.7; this.body.rotation.set(0.8 + Math.sin(ph * 1.6) * 0.05, 0, Math.sin(ph) * 0.08); this.body.position.y = K.hip + Math.abs(Math.sin(ph)) * 0.05;
        this.head.rotation.set(-0.55 + Math.sin(ph * 2) * 0.05, 0, Math.sin(ph * 0.5) * 0.2 + Math.sin(ph * 7) * 0.03);
        this.aL.rotation.set(-0.3 - Math.sin(ph) * 0.4, 0, -0.15); this.aR.rotation.set(-0.35 + Math.sin(ph) * 0.4 - sw * 1.5, 0, 0.15); break;
    }
  }
  /** Collapse (dogs roll onto their side, everything else falls backwards); limbs go slack as k goes 0 -> 1. */
  fall(k: number): void {
    const gy = heightAt(this.pos.x, this.pos.z);
    if (this.kind === 'dog') { this.group.rotation.z = k * 1.45; this.group.position.y = gy + k * 0.12; this.aL.rotation.x = this.aR.rotation.x = 0.4 * k; this.lL.rotation.x = this.lR.rotation.x = -0.3 * k; return; }
    this.group.rotation.x = -k * 1.5; this.group.position.y = gy + k * 0.15 * this.s;
    this.aL.rotation.set(-0.3 * k, 0, -0.5 * k); this.aR.rotation.set(-0.3 * k, 0, 0.5 * k); this.lL.rotation.x = 0.2 * k; this.lR.rotation.x = -0.1 * k;
  }
  /** Warning before a downed zombie rises as a Crimson Head: it shudders and its eyes light up. */
  twitch(): void {
    this.eyes.visible = true; this.eyes.material = EYES.crimson; this.group.rotation.z = Math.sin(this.t * 45) * 0.05; this.aL.rotation.x = -0.3 + Math.sin(this.t * 30) * 0.3; this.aR.rotation.x = -0.3 + Math.sin(this.t * 27) * 0.3;
  }
}

/** Fixed pool of enemies. `live` holds the active ones (alive or lying dead); nothing is created or destroyed during play. */
export class Zombies {
  readonly all: Zombie[] = []; readonly live: Zombie[] = [];
  readonly hit: Hit = { z: null, t: 0, head: false };
  note: string | null = null; private frame = 0; private risen = 0;
  constructor(scene: THREE.Scene, n: number) { for (let i = 0; i < n; i++) this.all.push(new Zombie(scene)); }

  /** Enemies still on their feet (corpses waiting to rise do not count against the horde size). */
  get alive(): number { let n = 0; for (const z of this.live) if (!z.dying) n++; return n; }
  count(type: ZType): number { let n = 0; for (const z of this.live) if (z.type === type && !z.dying) n++; return n; }
  boss(): Zombie | null { for (const z of this.live) if (z.type === 'lisa' && !z.dying) return z; return null; }

  spawn(type: ZType, x: number, z: number, hpM: number, spdM: number): Zombie | null {
    for (const q of this.all) if (!q.active) { q.init(type, x, z, hpM, spdM); this.live.push(q); return q; }
    return null;
  }
  private release(k: number): void {
    const z = this.live[k]; z.active = false; z.group.visible = false;
    this.live[k] = this.live[this.live.length - 1]; this.live.pop();
  }
  reset(): void { for (let k = this.live.length - 1; k >= 0; k--) this.release(k); this.note = null; this.risen = 0; }
  /** The Crimson Head mechanic: a zombie not killed by a headshot gets back up, faster and deadlier. */
  private revive(z: Zombie): void {
    const x = z.pos.x, zz = z.pos.z, yaw = z.yaw; z.init('crimson', x, zz, z.hpM * 0.8, z.spdM); z.yaw = yaw; z.group.rotation.y = yaw; z.atk = 0.5; sfx.groan(z.pos, 'crimson');
    if (!this.risen++) this.note = 'The dead get back up. Aim for the head.';
  }

  update(dt: number, pl: THREE.Vector3, w: World, onHit: (d: number) => void): void {
    this.frame++;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const z = this.live[k], p = z.pos;
      z.hurt = Math.max(0, z.hurt - dt); z.mat.emissive.setRGB(z.hurt * 2.5, 0, 0);
      if (z.dying) {
        z.t += dt; z.fall(Math.min(1, z.t * z.fr));
        if (z.down) { if (z.t > z.rise - 3.2) z.twitch(); if (z.t > z.rise) this.revive(z); }
        else if (z.t > (z.type === 'lisa' ? 5 : 2.5)) this.release(k);
        continue;
      }
      const dx = pl.x - p.x, dz = pl.z - p.z, d2 = dx * dx + dz * dz, far = d2 > 1600;
      if (far && (this.frame + z.id) % 3) continue;            // distant AI ticks at 1/3 rate
      const h = far ? dt * 3 : dt, d = Math.sqrt(d2) || 1e-3;
      let tx = dx / d, tz = dz / d;
      if (d > 6 && z.kind !== 'lisa') {                         // flank: aim at a point on a ring around the player
        const ox = pl.x + Math.cos(z.flank) * 3.2 - p.x, oz = pl.z + Math.sin(z.flank) * 3.2 - p.z, m = Math.hypot(ox, oz) || 1; tx = ox / m; tz = oz / m;
      }
      let sx = 0, sz = 0;                                       // separation from other enemies
      for (const o of this.live) {
        if (o === z || o.dying) continue;
        const ex = p.x - o.pos.x, ez = p.z - o.pos.z, e2 = ex * ex + ez * ez, r = z.sep;
        if (e2 < r * r && e2 > 1e-4) { const e = Math.sqrt(e2), f = (r - e) / e; sx += ex * f; sz += ez * f; }
      }
      const sp = d < z.reach ? 0 : z.speed * (z.hurt > 0 ? ZOMBIES[z.type].stagger : 1);
      p.x += (tx * sp + sx * 1.6) * h; p.z += (tz * sp + sz * 1.6) * h; w.push(p, z.rad); p.y = heightAt(p.x, p.z);
      const ty = Math.atan2(dx, dz), df = Math.atan2(Math.sin(ty - z.yaw), Math.cos(ty - z.yaw));
      z.yaw += df * Math.min(1, h * 8); z.group.rotation.y = z.yaw;
      z.phase += h * z.speed * (z.kind === 'dog' ? 2.2 : 3); z.atk -= h; z.swing = Math.max(0, z.swing - h * 3);
      if (d < z.reach + 0.15 && z.atk <= 0) { z.atk = z.rate; z.swing = 1; onHit(z.dmg); }
      z.pose(z.phase);
      z.groan -= h; if (z.groan <= 0) { z.groan = z.kind === 'dog' ? 2 + Math.random() * 3 : 4 + Math.random() * 6; if (d < 50) sfx.groan(p, z.type); }
    }
  }

  private sph(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number, max: number): number {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
    if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 && t < max ? t : -1;
  }
  /** Hitscan against head/torso/legs spheres placed per body design. Corpses waiting to rise only expose the head, lying on the ground: destroy it to keep them down. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, max: number): Hit | null {
    this.hit.z = null; let best = max;
    for (const z of this.live) {
      const p = z.pos, s = z.s, D = ZOMBIES[z.type], fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
      if (z.dying) {
        if (!z.down) continue;
        const t = this.sph(o, d, p.x - fx * 1.65 * s, p.y + 0.3 * s, p.z - fz * 1.65 * s, 0.32 * s, best);
        if (t >= 0) { best = t; this.hit.z = z; this.hit.head = true; this.hit.t = t; } continue;
      }
      if (this.sph(o, d, p.x, p.y + D.bound[0] * s, p.z, D.bound[1] * s, best) < 0) continue;
      const th = this.sph(o, d, p.x + fx * D.head[1] * s, p.y + D.head[0] * s, p.z + fz * D.head[1] * s, D.head[2] * s, best);
      const tb = this.sph(o, d, p.x + fx * D.body[1] * s, p.y + D.body[0] * s, p.z + fz * D.body[1] * s, D.body[2] * s, best), tl = this.sph(o, d, p.x, p.y + D.legs[0] * s, p.z, D.legs[2] * s, best);
      const m = tb < 0 ? tl : tl < 0 ? tb : Math.min(tb, tl);
      if (th >= 0 && (m < 0 || th <= m + 0.25)) { best = th; this.hit.z = z; this.hit.head = true; this.hit.t = th; }
      else if (m >= 0) { best = m; this.hit.z = z; this.hit.head = false; this.hit.t = m; }
    }
    return this.hit.z ? this.hit : null;
  }
  melee(o: THREE.Vector3, d: THREE.Vector3, range: number): Zombie | null {
    let best: Zombie | null = null, bd = 1e9;
    for (const z of this.live) {
      if (z.dying && !z.down) continue;
      const s = z.s, fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
      const vx = (z.down ? z.pos.x - fx * 1.65 * s : z.pos.x) - o.x, vy = (z.down ? z.pos.y + 0.3 * s : z.pos.y + ZOMBIES[z.type].body[0] * s) - o.y, vz = (z.down ? z.pos.z - fz * 1.65 * s : z.pos.z) - o.z, l = Math.hypot(vx, vy, vz);
      if (l < range + 0.5 * s && (vx * d.x + vy * d.y + vz * d.z) / l > (z.down ? 0.2 : 0.55) && l < bd) { bd = l; best = z; }
    }
    return best;
  }
  /** Returns true if the enemy died now (hitting a corpse's head just destroys it for good and scores nothing). */
  damage(z: Zombie, dmg: number, head: boolean, dir: THREE.Vector3): boolean {
    if (z.dying) { if (z.down) { z.down = false; z.group.rotation.z = 0; z.t = 1.2; } return false; }
    const D = ZOMBIES[z.type], heavy = D.stagger > 0.8;
    z.hp -= dmg * (head ? D.headMul : 1); z.hurt = heavy ? 0.08 : 0.2; if (!heavy) { z.pos.x += dir.x * 0.15; z.pos.z += dir.z * 0.15; }
    if (z.hp <= 0) { z.dying = true; z.t = 0; z.down = z.type === 'zombie' && !head; z.rise = 22 + Math.random() * 10; z.eyes.visible = false; return true; }
    return false;
  }
}

/** Infinite, adaptive spawner. Concurrent enemies are bounded by the quality cap and the performance scale.
 *  Zombies from the start; Crimson Heads, dog packs and Tyrants join as time passes; Lisa Trevor arrives on a six-minute timer, one at a time. */
export class Horde {
  t = 0; capScale = 1; note: string | null = null;
  private sp = 2; private burst = 0; private lastSurge = 0; private rc = 1; private bossAt = 360; private bosses = 0; private v = new THREE.Vector3(); private out = new THREE.Vector3();
  reset(): void { this.t = 0; this.sp = 2; this.burst = 0; this.lastSurge = 0; this.rc = 1; this.bossAt = 360; this.bosses = 0; this.note = null; }
  update(dt: number, zs: Zombies, pl: THREE.Vector3, cam: THREE.Camera, w: World, cap: number): void {
    const H = CFG.horde; this.t += dt;
    const hard = Math.max(4, Math.floor(cap * this.capScale)), alive = zs.alive;
    const target = Math.min(hard, Math.floor(H.base + H.soft * (1 - Math.exp(-this.t / H.tau)) + this.t / H.lin));
    const hpM = 1 + Math.min(1.2, this.t / H.hpGrow), spdM = Math.min(1.35, 1 + this.t / H.spdGrow);
    const sn = Math.floor(this.t / H.surgeEvery); if (sn > this.lastSurge) { this.lastSurge = sn; this.burst = H.burst; }
    if (this.t >= this.bossAt && !zs.boss()) {                  // the final boss, again and again, each time tougher
      this.bossAt = this.t + 360; this.place(pl, cam, w);
      if (zs.spawn('lisa', this.out.x, this.out.z, 1 + this.bosses++ * 0.5 + Math.min(1, this.t / H.hpGrow) * 0.5, 1)) this.note = 'Chains drag through the trees. Lisa is hunting you.';
    }
    this.sp -= dt;
    if (this.sp <= 0 && alive < hard && (alive < target || this.burst > 0)) {
      this.sp = this.burst > 0 ? 0.3 : Math.max(H.minInt, H.int0 * Math.exp(-this.t / H.intTau)); if (this.burst > 0) this.burst--;
      this.place(pl, cam, w); const ty = this.pick(zs);
      for (let i = 0, n = ty === 'dog' ? 2 + ((Math.random() * 2) | 0) : 1; i < n; i++) zs.spawn(ty, this.out.x + (Math.random() - 0.5) * 3, this.out.z + (Math.random() - 0.5) * 3, hpM, spdM);
    }
    this.rc -= dt;                                              // recycle stragglers that fell far behind (never the boss)
    if (this.rc <= 0) {
      this.rc = 1;
      for (const z of zs.live) if (!z.dying && z.type !== 'lisa' && (z.pos.x - pl.x) ** 2 + (z.pos.z - pl.z) ** 2 > H.despawn ** 2) {
        this.place(pl, cam, w); z.pos.set(this.out.x, heightAt(this.out.x, this.out.z), this.out.z);
      }
    }
  }
  private pick(zs: Zombies): ZType {
    const t = this.t, r = Math.random(), wt = Math.min(0.07, Math.max(0, t - 200) / 6000), wc = Math.min(0.22, Math.max(0, t - 75) / 1600), wd = Math.min(0.2, Math.max(0, t - 45) / 1200);
    if (r < wt && zs.count('tyrant') < 2) return 'tyrant';
    if (r < wt + wd && zs.count('dog') < 6) return 'dog';
    if (r < wt + wd + wc) return 'crimson';
    return 'zombie';
  }
  /** Spawn point outside the camera's view cone, 32-52 m away. */
  private place(pl: THREE.Vector3, cam: THREE.Camera, w: World): void {
    const H = CFG.horde; cam.getWorldDirection(this.v); const fa = Math.atan2(this.v.x, this.v.z); let a = fa + Math.PI;
    for (let i = 0; i < 10; i++) { const t = Math.random() * 6.283; if (Math.abs(Math.atan2(Math.sin(t - fa), Math.cos(t - fa))) > H.hideAngle) { a = t; break; } }
    const r = H.minDist + Math.random() * (H.maxDist - H.minDist), lim = CFG.world.half - 6;
    this.out.set(THREE.MathUtils.clamp(pl.x + Math.sin(a) * r, -lim, lim), 0, THREE.MathUtils.clamp(pl.z + Math.cos(a) * r, -lim, lim));
    w.push(this.out, 0.6);
  }
}
