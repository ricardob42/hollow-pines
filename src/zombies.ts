import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, ZOMBIES, type ZType, type Kind } from './config';
import { heightAt, type World } from './world';
import { sfx } from './audio';
import { flesh } from './tex';

// ---------- procedural bodies: every part is merged into a single vertex-coloured mesh (6 draw calls per enemy) ----------
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
/** r0 = bottom radius, r1 = top radius. */
const cyl = (r0: number, r1: number, l: number, hex: number, x: number, y: number, z: number, seg = 8) => tint(at(new THREE.CylinderGeometry(r1, r0, l, seg), x, y, z), hex);
/** Tapered limb segment from point a (radius r0) to point b (radius r1). */
const lm = (a: number[], b: number[], r0: number, r1: number, hex: number, seg = 7) => {
  const A = new V3(...(a as [number, number, number])), B = new V3(...(b as [number, number, number])), d = B.clone().sub(A), g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1))); return tint(g, hex);
};
const join = (gs: G[]) => mergeGeometries(gs, false)!;
/** Organic irregularity: push vertices along their normals with a smooth deterministic wobble. */
const warp = (g: G, amt: number, s: number) => {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = ((Math.sin(x * 23 + s) + Math.sin(y * 19 + s * 1.7) + Math.sin(z * 29 + s * 0.6)) / 3) * amt; p.setXYZ(i, x + n.getX(i) * k, y + n.getY(i) * k, z + n.getZ(i) * k); }
  return g;
};
interface Parts { torso: G; head: G; aL: G; aR: G; leg: G }
const SK = [0x8d9784, 0xa09a88, 0x7f8c7a], JK = [0x4a5140, 0x3a3e45, 0x4e3b2d], PT = [0x2b2824, 0x1f2326, 0x3a3128], GS = [0xb7b3a3, 0xaaa998, 0xc0bba8], RAG = [0x3a3126, 0x2c2d2a, 0x40342a];
const BLOOD = 0x5c1010, DARK = 0x150d0d, SHIRT = 0xb9b4a2, BONE = 0xcfc8b4, S2 = [-1, 1];

/** Design 1 - the suited walker: torn jacket over an open bloodied shirt, pale cracked skin, milky eyes, bare feet, arms reaching forward. */
function walker(v: number): Parts {
  const jc = JK[v], sk = SK[v], pc = PT[v];
  const t: G[] = [tint(at(new THREE.CylinderGeometry(0.2, 0.165, 0.62, 10), 0, 0.31, 0, 0, 0, 0, 1, 1, 0.68), jc), cyl(0.05, 0.055, 0.12, sk, 0, 0.7, 0), bx(0.12, 0.5, 0.02, SHIRT, 0, 0.33, 0.118), bx(0.2, 0.05, 0.08, jc, 0, 0.64, -0.02),
    bx(0.33, 0.15, 0.2, pc, 0, -0.03, 0), bx(0.34, 0.03, 0.205, 0x1a1512, 0, 0.05, 0), sph(0.055, BLOOD, 0.06, 0.3, 0.125, 1, 1, 0.35), sph(0.04, 0x3a0808, -0.05, 0.42, 0.13, 1, 1, 0.3)];
  for (const s of S2) t.push(sph(0.095, jc, s * 0.215, 0.585, 0, 1, 1, 0.9), bx(0.06, 0.36, 0.02, jc, s * 0.075, 0.4, 0.124, 0, 0, -s * 0.22));
  for (let i = 0; i < 3; i++) t.push(bx(0.07, 0.012, 0.01, BONE, 0.06, 0.27 + i * 0.03, 0.137, 0, 0, 0.15));
  const h: G[] = [sph(0.115, sk, 0, 0.13, 0, 0.95, 1.12, 1, 12), sph(0.075, sk, 0, 0.07, 0.03, 1, 0.9, 1), bx(0.07, 0.022, 0.02, 0x2b0b0b, 0, 0.045, 0.095), bx(0.058, 0.008, 0.01, 0xcbc4a8, 0, 0.056, 0.1),
    bx(0.014, 0.04, 0.014, sk, 0, 0.1, 0.112, 0.3), sph(0.04, BLOOD, -0.04, 0.215, 0.03, 1, 0.5, 1), sph(0.03, 0x3a0808, 0.06, 0.19, -0.02, 1, 0.5, 1), bx(0.08, 0.03, 0.02, BLOOD, 0, 0.03, 0.095)];
  for (const s of S2) h.push(sph(0.03, DARK, s * 0.042, 0.145, 0.09, 1, 0.9, 0.5), sph(0.017, 0xdad8c8, s * 0.042, 0.145, 0.105, 1, 1, 0.6), sph(0.025, sk, s * 0.11, 0.12, 0, 0.5, 1, 0.8));
  const arm = (s: number) => {
    const E = [s * 0.02, -0.28, 0], M = [s * 0.02, -0.4, 0.06], W = [s * 0.02, -0.5, 0.16];
    const a: G[] = [lm([0, 0, 0], E, 0.05, 0.042, jc), lm(E, M, 0.042, 0.036, jc), lm(M, W, 0.034, 0.028, sk), sph(0.04, sk, W[0], W[1], W[2] + 0.02, 0.8, 1, 1.2), sph(0.028, BLOOD, s * 0.02, -0.45, 0.1, 1, 1, 0.6)];
    for (let i = 0; i < 4; i++) a.push(lm(W, [W[0] + (i - 1.5) * 0.014, W[1] - 0.07, W[2] + 0.07], 0.012, 0.007, sk, 5));
    return warp(join(a), 0.006, v + s);
  };
  const L: G[] = [lm([0, 0, 0], [0, -0.46, 0.02], 0.078, 0.064, pc), lm([0, -0.46, 0.02], [0, -0.74, 0], 0.064, 0.052, pc), lm([0, -0.74, 0], [0, -0.9, 0], 0.042, 0.034, sk), bx(0.075, 0.04, 0.18, sk, 0, -0.91, 0.05)];
  for (let i = 0; i < 5; i++) L.push(bx(0.012, 0.012, 0.03, sk, (i - 2) * 0.014, -0.91, 0.15));
  return { torso: warp(join(t), 0.012, v), head: warp(join(h), 0.006, v + 5), aL: arm(-1), aR: arm(1), leg: join(L) };
}

/** Design 2 - the hunched ghoul: emaciated, bald, ribs and spine showing, gaping jaw, long clawed arms, a bloodied hatchet in the right hand. */
function ghoul(v: number): Parts {
  const sk = GS[v], rg = RAG[v];
  const t: G[] = [sph(0.2, sk, 0, 0.45, 0, 0.9, 1.1, 0.65), cyl(0.11, 0.16, 0.3, sk, 0, 0.12, 0), bx(0.34, 0.2, 0.22, rg, 0, -0.02, 0), sph(0.06, BLOOD, -0.08, 0.22, 0.12, 1, 1, 0.4), sph(0.05, 0x3a0808, 0.1, 0.4, 0.1, 1, 1, 0.4), lm([0, 0.62, 0], [0, 0.74, 0.06], 0.06, 0.05, sk)];
  for (let i = 0; i < 6; i++) t.push(bx(0.28 - i * 0.01, 0.014, 0.03, BONE, 0, 0.28 + i * 0.045, 0.115));
  for (let i = 0; i < 7; i++) t.push(sph(0.018, 0xb0aa98, 0, 0.1 + i * 0.075, -0.135));
  for (const s of S2) t.push(sph(0.07, sk, s * 0.14, 0.52, -0.1, 1, 1.3, 0.5), bx(0.05, 0.2, 0.02, rg, s * 0.1, -0.14, 0, 0, 0, s * 0.1));
  const h: G[] = [sph(0.12, sk, 0, 0.1, 0, 0.85, 1.2, 1, 12), bx(0.1, 0.04, 0.03, 0x2a0707, 0, -0.005, 0.1), bx(0.09, 0.025, 0.1, sk, 0, -0.06, 0.05, 0.4), sph(0.05, BLOOD, -0.05, 0.2, 0.04, 1, 0.5, 1)];
  for (let i = 0; i < 6; i++) h.push(bx(0.009, 0.026, 0.01, 0xd8d2b8, (i - 2.5) * 0.014, 0.015, 0.108));
  for (const s of S2) h.push(sph(0.042, DARK, s * 0.047, 0.11, 0.095, 1, 1.2, 0.5), sph(0.021, 0xe8e6d6, s * 0.047, 0.11, 0.108, 1, 1, 0.6));
  const arm = (s: number) => {
    const E = [s * 0.03, -0.3, 0.04], W = [s * 0.02, -0.62, 0.1];
    const a: G[] = [lm([0, 0, 0], E, 0.05, 0.04, sk), lm(E, W, 0.04, 0.03, sk), sph(0.045, sk, W[0], W[1], W[2], 0.8, 1, 1.2), sph(0.03, BLOOD, s * 0.03, -0.4, 0.07, 1, 1, 0.6)];
    for (let i = 0; i < 4; i++) a.push(lm(W, [W[0] + (i - 1.5) * 0.014, W[1] - 0.15, W[2] + 0.05], 0.012, 0.005, 0xa8a28c, 5));
    if (s > 0) a.push(lm([W[0], W[1] + 0.03, W[2] - 0.03], [W[0], W[1] - 0.05, W[2] + 0.3], 0.016, 0.016, 0x4a3626, 6), bx(0.025, 0.13, 0.09, 0x4b4f52, W[0], W[1] - 0.06, W[2] + 0.3),
      bx(0.012, 0.15, 0.025, 0xa2a8ae, W[0], W[1] - 0.06, W[2] + 0.35), bx(0.027, 0.07, 0.05, BLOOD, W[0], W[1] - 0.04, W[2] + 0.31));
    return warp(join(a), 0.006, v + s);
  };
  const L: G[] = [lm([0, 0, 0], [0, -0.32, 0.2], 0.075, 0.06, rg), lm([0, -0.32, 0.2], [0, -0.7, 0.02], 0.058, 0.036, sk), bx(0.07, 0.035, 0.2, sk, 0, -0.72, 0.1)];
  for (let i = 0; i < 5; i++) L.push(bx(0.011, 0.011, 0.03, sk, (i - 2) * 0.013, -0.72, 0.22));
  return { torso: warp(join(t), 0.01, v), head: warp(join(h), 0.008, v + 2), aL: arm(-1), aR: arm(1), leg: join(L) };
}
const cache = new Map<string, Parts>();
const parts = (kind: Kind, v: number): Parts => { const k = kind + v; let p = cache.get(k); if (!p) cache.set(k, (p = kind === 'walker' ? walker(v) : ghoul(v))); return p; };
/** hip = pivot height of the body, leg = hip half-width, sh = shoulder offset, neck = head pivot. */
const KS = { walker: { hip: 0.93, leg: 0.1, sh: [0.25, 0.58, 0], neck: [0, 0.72, 0] }, ghoul: { hip: 0.78, leg: 0.11, sh: [0.21, 0.56, 0.02], neck: [0, 0.74, 0.06] } } as const;

let uid = 0;
interface Hit { z: Zombie | null; t: number; head: boolean }

export class Zombie {
  readonly group = new THREE.Group(); readonly id = uid++;
  readonly mat: THREE.MeshStandardMaterial;
  active = false; dying = false; type: ZType = 'normal'; kind: Kind = 'walker'; hp = 0; speed = 0; dmg = 0; s = 1; t = 0; atk = 0; hurt = 0;
  flank = 0; phase = 0; yaw = 0; groan = 0; swing = 0; reach = 1.4;
  private body = new THREE.Group(); private torso: THREE.Mesh; private head: THREE.Mesh; private aL: THREE.Mesh; private aR: THREE.Mesh; private lL: THREE.Mesh; private lR: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const F = flesh(); this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: F.map, bumpMap: F.bump, bumpScale: 1.5, roughness: 0.78 });
    const mk = (parent: THREE.Object3D) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); m.castShadow = true; parent.add(m); return m; };
    this.lL = mk(this.group); this.lR = mk(this.group); this.group.add(this.body);
    this.torso = mk(this.body); this.head = mk(this.body); this.aL = mk(this.body); this.aR = mk(this.body);
    this.group.rotation.order = 'YXZ'; this.group.visible = false; scene.add(this.group);
  }
  get pos(): THREE.Vector3 { return this.group.position; }
  init(type: ZType, x: number, z: number, hpM: number, spdM: number): void {
    const c = ZOMBIES[type], K = KS[c.kind], P = parts(c.kind, (Math.random() * 3) | 0);
    this.type = type; this.kind = c.kind; this.hp = c.hp * hpM; this.speed = c.speed * spdM * (0.9 + Math.random() * 0.2); this.dmg = c.dmg; this.s = c.scale;
    this.torso.geometry = P.torso; this.head.geometry = P.head; this.aL.geometry = P.aL; this.aR.geometry = P.aR; this.lL.geometry = this.lR.geometry = P.leg;
    this.mat.color.setHex(c.tint).multiplyScalar(0.85 + Math.random() * 0.3);
    this.lL.position.set(-K.leg, K.hip, 0); this.lR.position.set(K.leg, K.hip, 0); this.body.position.set(0, K.hip, 0); this.head.position.set(K.neck[0], K.neck[1], K.neck[2]);
    this.aL.position.set(-K.sh[0], K.sh[1], K.sh[2]); this.aR.position.set(K.sh[0], K.sh[1], K.sh[2]);
    this.group.scale.set(c.girth * c.scale, c.scale, c.girth * c.scale);
    this.group.position.set(x, heightAt(x, z), z); this.group.rotation.set(0, 0, 0);
    this.active = true; this.dying = false; this.t = 0; this.atk = 0.6; this.hurt = 0; this.swing = 0; this.yaw = 0;
    this.flank = Math.random() * 6.28; this.groan = 1 + Math.random() * 4; this.reach = 1.1 * c.scale + 0.35; this.group.visible = true; this.pose(0);
  }
  pose(ph: number): void {
    const sw = this.swing;
    if (this.kind === 'walker') {
      this.lL.rotation.x = Math.sin(ph) * 0.6; this.lR.rotation.x = -Math.sin(ph) * 0.6;
      this.body.rotation.set(0.1 + Math.sin(ph * 2) * 0.02, 0, Math.sin(ph) * 0.05); this.head.rotation.set(0.25, 0, 0.35 + Math.sin(ph * 0.7) * 0.08);
      const a = -1.25 + Math.sin(ph * 0.5) * 0.12 - sw * 0.9; this.aL.rotation.set(a, 0, -0.12); this.aR.rotation.set(a, 0, 0.12);
    } else {
      this.lL.rotation.x = Math.sin(ph) * 0.9; this.lR.rotation.x = -Math.sin(ph) * 0.9;
      this.body.rotation.set(0.85 + Math.sin(ph * 2) * 0.05, 0, Math.sin(ph) * 0.08); this.body.position.y = KS.ghoul.hip + Math.abs(Math.sin(ph)) * 0.05;
      this.head.rotation.set(-0.7 + Math.sin(ph * 2) * 0.05, 0, Math.sin(ph * 0.5) * 0.15);
      this.aL.rotation.set(-0.2 - Math.sin(ph) * 0.6, 0, -0.1); this.aR.rotation.set(-0.35 + Math.sin(ph) * 0.5 - sw * 1.4, 0, 0.1);
    }
  }
  /** Collapse backwards; limbs go slack as k goes 0 -> 1. */
  fall(k: number): void {
    this.group.rotation.x = -k * 1.5; this.group.position.y = heightAt(this.pos.x, this.pos.z) + k * 0.15 * this.s;
    this.aL.rotation.set(-0.3 * k, 0, -0.5 * k); this.aR.rotation.set(-0.3 * k, 0, 0.5 * k); this.lL.rotation.x = 0.2 * k; this.lR.rotation.x = -0.1 * k;
  }
}

/** Fixed pool of zombies. `live` holds the active ones; nothing is created or destroyed during play. */
export class Zombies {
  readonly all: Zombie[] = []; readonly live: Zombie[] = [];
  readonly hit: Hit = { z: null, t: 0, head: false };
  private frame = 0;
  constructor(scene: THREE.Scene, n: number) { for (let i = 0; i < n; i++) this.all.push(new Zombie(scene)); }

  spawn(type: ZType, x: number, z: number, hpM: number, spdM: number): Zombie | null {
    for (const q of this.all) if (!q.active) { q.init(type, x, z, hpM, spdM); this.live.push(q); return q; }
    return null;
  }
  private release(k: number): void {
    const z = this.live[k]; z.active = false; z.group.visible = false;
    this.live[k] = this.live[this.live.length - 1]; this.live.pop();
  }
  reset(): void { for (let k = this.live.length - 1; k >= 0; k--) this.release(k); }

  update(dt: number, pl: THREE.Vector3, w: World, onHit: (d: number) => void): void {
    this.frame++;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const z = this.live[k], p = z.pos;
      z.hurt = Math.max(0, z.hurt - dt); z.mat.emissive.setRGB(z.hurt * 2.5, 0, 0);
      if (z.dying) { z.t += dt; z.fall(Math.min(1, z.t * 3)); if (z.t > 2.5) this.release(k); continue; }
      const dx = pl.x - p.x, dz = pl.z - p.z, d2 = dx * dx + dz * dz, far = d2 > 1600;
      if (far && (this.frame + z.id) % 3) continue;            // distant AI ticks at 1/3 rate
      const h = far ? dt * 3 : dt, d = Math.sqrt(d2) || 1e-3;
      let tx = dx / d, tz = dz / d;
      if (d > 6) {                                              // flank: aim at a point on a ring around the player
        const ox = pl.x + Math.cos(z.flank) * 3.2 - p.x, oz = pl.z + Math.sin(z.flank) * 3.2 - p.z, m = Math.hypot(ox, oz) || 1; tx = ox / m; tz = oz / m;
      }
      let sx = 0, sz = 0;                                       // separation from other zombies
      for (const o of this.live) {
        if (o === z || o.dying) continue;
        const ex = p.x - o.pos.x, ez = p.z - o.pos.z, e2 = ex * ex + ez * ez;
        if (e2 < 1.44 && e2 > 1e-4) { const e = Math.sqrt(e2), f = (1.2 - e) / e; sx += ex * f; sz += ez * f; }
      }
      const sp = d < z.reach ? 0 : z.speed * (z.hurt > 0 ? 0.35 : 1);
      p.x += (tx * sp + sx * 1.6) * h; p.z += (tz * sp + sz * 1.6) * h; w.push(p, 0.4 * z.s); p.y = heightAt(p.x, p.z);
      const ty = Math.atan2(dx, dz), df = Math.atan2(Math.sin(ty - z.yaw), Math.cos(ty - z.yaw));
      z.yaw += df * Math.min(1, h * 8); z.group.rotation.y = z.yaw;
      z.phase += h * z.speed * 3; z.atk -= h; z.swing = Math.max(0, z.swing - h * 3);
      if (d < z.reach + 0.15 && z.atk <= 0) { z.atk = 1.1; z.swing = 1; onHit(z.dmg); }
      z.pose(z.phase);
      z.groan -= h; if (z.groan <= 0) { z.groan = 4 + Math.random() * 6; if (d < 50) sfx.groan(p, z.kind === 'ghoul'); }
    }
  }

  private sph(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number, max: number): number {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
    if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 && t < max ? t : -1;
  }
  /** Hitscan against head/torso/legs spheres (placed per design: the ghoul carries its head forward). Writes into the shared `hit` object (no allocation). */
  raycast(o: THREE.Vector3, d: THREE.Vector3, max: number): Hit | null {
    this.hit.z = null; let best = max;
    for (const z of this.live) {
      if (z.dying) continue;
      const p = z.pos, s = z.s, D = ZOMBIES[z.type], fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
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
      if (z.dying) continue;
      const vx = z.pos.x - o.x, vy = z.pos.y + 1.1 * z.s - o.y, vz = z.pos.z - o.z, l = Math.hypot(vx, vy, vz);
      if (l < range + 0.5 * z.s && (vx * d.x + vy * d.y + vz * d.z) / l > 0.55 && l < bd) { bd = l; best = z; }
    }
    return best;
  }
  /** Returns true if the zombie died. */
  damage(z: Zombie, dmg: number, head: boolean, dir: THREE.Vector3): boolean {
    z.hp -= dmg * (head ? 2.5 : 1); z.hurt = 0.2; z.pos.x += dir.x * 0.15; z.pos.z += dir.z * 0.15;
    if (z.hp <= 0) { z.dying = true; z.t = 0; return true; } return false;
  }
}

/** Infinite, adaptive spawner. Concurrent zombies are bounded by the quality cap and the performance scale. */
export class Horde {
  t = 0; capScale = 1;
  private sp = 2; private burst = 0; private lastSurge = 0; private rc = 1; private v = new THREE.Vector3(); private out = new THREE.Vector3();
  reset(): void { this.t = 0; this.sp = 2; this.burst = 0; this.lastSurge = 0; this.rc = 1; }
  update(dt: number, zs: Zombies, pl: THREE.Vector3, cam: THREE.Camera, w: World, cap: number): void {
    const H = CFG.horde; this.t += dt;
    const hard = Math.max(4, Math.floor(cap * this.capScale));
    const target = Math.min(hard, Math.floor(H.base + H.soft * (1 - Math.exp(-this.t / H.tau)) + this.t / H.lin));
    const sn = Math.floor(this.t / H.surgeEvery); if (sn > this.lastSurge) { this.lastSurge = sn; this.burst = H.burst; }
    this.sp -= dt;
    if (this.sp <= 0 && zs.live.length < hard && (zs.live.length < target || this.burst > 0)) {
      this.sp = this.burst > 0 ? 0.3 : Math.max(H.minInt, H.int0 * Math.exp(-this.t / H.intTau)); if (this.burst > 0) this.burst--;
      this.place(pl, cam, w);
      zs.spawn(this.pick(), this.out.x, this.out.z, 1 + Math.min(1.2, this.t / H.hpGrow), Math.min(1.35, 1 + this.t / H.spdGrow));
    }
    this.rc -= dt;                                              // recycle stragglers that fell far behind
    if (this.rc <= 0) {
      this.rc = 1;
      for (const z of zs.live) if (!z.dying && (z.pos.x - pl.x) ** 2 + (z.pos.z - pl.z) ** 2 > H.despawn ** 2) {
        this.place(pl, cam, w); z.pos.set(this.out.x, heightAt(this.out.x, this.out.z), this.out.z);
      }
    }
  }
  /** A small share of hunched ghouls (fast) shows up from the start so both designs are seen early; the mix then grows as before. */
  private pick(): ZType {
    const r = Math.random(), sp = Math.min(0.5, 0.08 + this.t / CFG.horde.specialRate); if (r > sp) return 'normal';
    const q = Math.random(); return this.t > 240 && q > 0.85 ? 'big' : q > 0.5 ? 'tank' : 'fast';
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
