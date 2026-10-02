import * as THREE from 'three';
import { CFG, ZOMBIES, type ZType } from './config';
import { heightAt, type World } from './world';
import { sfx } from './audio';

const G = {
  torso: new THREE.BoxGeometry(0.5, 0.7, 0.28), head: new THREE.BoxGeometry(0.28, 0.28, 0.28),
  arm: new THREE.BoxGeometry(0.14, 0.62, 0.14).translate(0, -0.31, 0), leg: new THREE.BoxGeometry(0.19, 0.78, 0.19).translate(0, -0.39, 0),
};
let uid = 0;
interface Hit { z: Zombie | null; t: number; head: boolean }

export class Zombie {
  readonly group = new THREE.Group(); readonly id = uid++;
  readonly skin = new THREE.MeshStandardMaterial({ roughness: 0.9 }); readonly cloth = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  active = false; dying = false; type: ZType = 'normal'; hp = 0; speed = 0; dmg = 0; s = 1; t = 0; atk = 0; hurt = 0;
  flank = 0; phase = 0; yaw = 0; groan = 0; swing = 0; reach = 1.4;
  private aL: THREE.Mesh; private aR: THREE.Mesh; private lL: THREE.Mesh; private lR: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, 0); o.castShadow = true; this.group.add(o); return o;
    };
    mk(G.torso, this.cloth, 0, 1.15); mk(G.head, this.skin, 0, 1.7);
    this.aL = mk(G.arm, this.skin, -0.33, 1.43); this.aR = mk(G.arm, this.skin, 0.33, 1.43);
    this.lL = mk(G.leg, this.cloth, -0.12, 0.78); this.lR = mk(G.leg, this.cloth, 0.12, 0.78);
    this.group.rotation.order = 'YXZ'; this.group.visible = false; scene.add(this.group);
  }
  get pos(): THREE.Vector3 { return this.group.position; }
  init(type: ZType, x: number, z: number, hpM: number, spdM: number): void {
    const c = ZOMBIES[type];
    this.type = type; this.hp = c.hp * hpM; this.speed = c.speed * spdM * (0.9 + Math.random() * 0.2); this.dmg = c.dmg; this.s = c.scale;
    this.skin.color.setHex(c.skin); this.cloth.color.setHex(c.cloth); this.group.scale.setScalar(c.scale);
    this.group.position.set(x, heightAt(x, z), z); this.group.rotation.set(0, 0, 0);
    this.active = true; this.dying = false; this.t = 0; this.atk = 0.6; this.hurt = 0; this.swing = 0; this.yaw = 0;
    this.flank = Math.random() * 6.28; this.groan = 1 + Math.random() * 4; this.reach = 1.1 * c.scale + 0.35; this.group.visible = true; this.pose(0);
  }
  pose(ph: number): void {
    this.lL.rotation.x = Math.sin(ph) * 0.7; this.lR.rotation.x = -Math.sin(ph) * 0.7;
    const a = -1.35 + Math.sin(ph * 0.5) * 0.12 - this.swing * 0.9; this.aL.rotation.x = a; this.aR.rotation.x = a;
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
      z.hurt = Math.max(0, z.hurt - dt); z.skin.emissive.setRGB(z.hurt * 2.5, 0, 0);
      if (z.dying) { z.t += dt; z.group.rotation.x = -Math.min(1, z.t * 3) * 1.5; if (z.t > 2.5) this.release(k); continue; }
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
      z.groan -= h; if (z.groan <= 0) { z.groan = 4 + Math.random() * 6; if (d < 50) sfx.groan(p); }
    }
  }

  private sph(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number, max: number): number {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz, b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, disc = b * b - c;
    if (disc < 0) return -1; const t = -b - Math.sqrt(disc); return t > 0 && t < max ? t : -1;
  }
  /** Hitscan against head/torso/legs spheres. Writes into the shared `hit` object (no allocation). */
  raycast(o: THREE.Vector3, d: THREE.Vector3, max: number): Hit | null {
    this.hit.z = null; let best = max;
    for (const z of this.live) {
      if (z.dying) continue;
      const p = z.pos, s = z.s;
      if (this.sph(o, d, p.x, p.y + 1.5 * s, p.z, 1.6 * s, best) < 0) continue;
      const th = this.sph(o, d, p.x, p.y + 1.7 * s, p.z, 0.27 * s, best);
      const tb = this.sph(o, d, p.x, p.y + 1.15 * s, p.z, 0.46 * s, best), tl = this.sph(o, d, p.x, p.y + 0.45 * s, p.z, 0.4 * s, best);
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
  private pick(): ZType {
    const r = Math.random(), sp = Math.min(0.5, this.t / CFG.horde.specialRate); if (r > sp) return 'normal';
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
