import * as THREE from 'three';
import { WEAPONS, type WDef } from './config';
import { sfx } from './audio';
import type { Fx } from './fx';
import type { Zombies, Zombie } from './zombies';
import type { World } from './world';
import type { Input } from './input';
import type { Player } from './player';
import { Torch } from './light';

const MUZ: [number, number, number][] = [[0, 0.006, -0.78], [0, 0.02, -0.14], [0, 0, 0]];
/** Flashlight lens position per weapon: rail-mounted on the rifle and pistol, LED head at the front of the knife handle. */
const LENS: [number, number, number][] = [[0.054, -0.03, -0.49], [0, -0.036, -0.145], [0, 0.026, 0.004]];
const POSE: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0.12, 0.04, -0.14]];       // static rotation of each model (knife is canted like a real grip)

const mat = (c: number, m = 0.7, r = 0.45) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, emissive: 0x20242a });
const metal = mat(0x2a2f34, 0.85, 0.36), poly = mat(0x181a1d, 0.15, 0.7), steel = mat(0xc4cad1, 1, 0.2), black = mat(0x0e1012, 0.6, 0.32);
const glove = mat(0x14120f, 0, 0.8), sleeve = mat(0x3a4033, 0, 0.9), lens = new THREE.MeshBasicMaterial({ color: 0xfff4d8 });
const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; return b; };
/** Cylinder along the weapon axis: rf = front (-z) radius, rb = rear radius. */
const cyl = (rf: number, rb: number, l: number, x: number, y: number, z: number, m: THREE.Material, seg = 14) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(rb, rf, l, seg).rotateX(Math.PI / 2), m); b.position.set(x, y, z); return b; };
/** Gloved hand at (x,y,z) with a sleeved forearm running back and down out of frame. */
function arm(x: number, y: number, z: number, side: number): THREE.Group {
  const g = new THREE.Group(), a = new THREE.Vector3(x, y, z), b = new THREE.Vector3(x + side * 0.05, y - 0.13, z + 0.42);
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, a.distanceTo(b), 10), sleeve);
  f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); f.position.copy(a).add(b).multiplyScalar(0.5);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glove); palm.scale.set(0.04, 0.032, 0.056); palm.position.set(x, y, z + 0.01);
  g.add(f, palm); for (let i = 0; i < 4; i++) g.add(box(0.011, 0.013, 0.045, x + (i - 1.5) * 0.0115, y + 0.012, z - 0.04, glove, 0.2));
  g.add(box(0.014, 0.014, 0.04, x - side * 0.03, y + 0.004, z - 0.01, glove, 0.1)); return g;
}
/** Combat knife: two-tone black/silver tanto-style blade with serrations, ridged handle, steel clip, glass-breaker pommel and an LED head at the guard. */
function knife(): THREE.Group {
  const g = new THREE.Group(), up = new THREE.Shape(), lo = new THREE.Shape();
  up.moveTo(0, 0.014); up.lineTo(0.17, 0.02); up.lineTo(0.215, 0.003); up.lineTo(0.19, 0); up.lineTo(0, 0);
  lo.moveTo(0, 0); lo.lineTo(0.19, 0); lo.lineTo(0.215, 0.003); lo.lineTo(0.13, -0.018);
  for (let i = 0; i < 8; i++) { const x = 0.13 - i * 0.015; lo.lineTo(x - 0.0075, -0.025); lo.lineTo(x - 0.015, -0.018); }
  lo.lineTo(0, -0.018);
  const ex = (s: THREE.Shape, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2).rotateY(Math.PI / 2), m);
  g.add(ex(up, 0.004, black), ex(lo, 0.0032, steel), box(0.026, 0.032, 0.12, 0, 0, 0.065, poly), box(0.034, 0.05, 0.008, 0, -0.004, 0.004, metal), cyl(0.011, 0.003, 0.022, 0, 0, 0.14, steel), box(0.004, 0.02, 0.07, 0.016, 0.008, 0.075, steel));
  for (let i = 0; i < 5; i++) g.add(box(0.0285, 0.034, 0.006, 0, 0, 0.03 + i * 0.022, black));
  g.add(cyl(0.012, 0.012, 0.035, 0, 0.026, 0.03, metal), cyl(0.0095, 0.0095, 0.004, 0, 0.026, 0.0115, lens), arm(0, -0.01, 0.07, 1)); return g;
}
function rifle(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.05, 0.065, 0.3, 0, 0, -0.02, metal), box(0.048, 0.05, 0.2, 0, -0.055, 0.02, metal), box(0.062, 0.058, 0.3, 0, 0, -0.32, poly), box(0.018, 0.01, 0.34, 0, 0.034, -0.3, metal),
    cyl(0.0105, 0.0105, 0.3, 0, 0.004, -0.62, metal), cyl(0.016, 0.016, 0.07, 0, 0.004, -0.745, black), box(0.008, 0.045, 0.01, 0, 0.04, -0.46, metal), box(0.012, 0.03, 0.02, 0, 0.045, 0.1, metal),
    cyl(0.019, 0.019, 0.22, 0, 0, 0.2, black), box(0.044, 0.09, 0.2, 0, -0.02, 0.3, poly), box(0.034, 0.1, 0.05, 0, -0.115, 0.06, poly, 0.3), box(0.032, 0.15, 0.055, 0, -0.135, -0.07, black, -0.12),
    box(0.02, 0.006, 0.07, 0, -0.083, -0.02, metal),
    box(0.02, 0.03, 0.03, 0.037, -0.02, -0.4, metal), cyl(0.017, 0.017, 0.1, 0.054, -0.03, -0.4, black), cyl(0.021, 0.017, 0.025, 0.054, -0.03, -0.4625, metal), cyl(0.0165, 0.0165, 0.004, 0.054, -0.03, -0.4765, lens),
    arm(0, -0.17, 0.07, 1), arm(0, -0.065, -0.32, -1)); return g;
}
function pistol(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.03, 0.04, 0.2, 0, 0.02, -0.02, metal), box(0.028, 0.026, 0.18, 0, -0.012, -0.02, poly), cyl(0.007, 0.007, 0.03, 0, 0.02, -0.125, steel), box(0.03, 0.095, 0.045, 0, -0.07, 0.05, poly, 0.22),
    box(0.018, 0.005, 0.05, 0, -0.03, -0.03, metal), box(0.006, 0.01, 0.01, 0, 0.044, -0.105, metal), box(0.014, 0.01, 0.01, 0, 0.044, 0.07, metal),
    cyl(0.014, 0.014, 0.07, 0, -0.036, -0.1, black), cyl(0.0135, 0.0135, 0.004, 0, -0.036, -0.1355, lens), arm(0.005, -0.07, 0.05, 1), arm(-0.03, -0.085, 0.03, -1)); return g;
}

export class Weapons {
  cur = 0; ammo: number[] = []; reserve: number[] = []; hit = 0; readonly torch: Torch;
  onKill: (z: Zombie, head: boolean) => void = () => {};
  private cd = 0; private rt = 0; private st = 0; private kick = 0; private swing = 0; private ft = 0; private prev = false; private t = 0; private mv = 0;
  private root = new THREE.Group(); private models: THREE.Group[] = []; private flash: THREE.Mesh; private light = new THREE.PointLight(0xffb060, 0, 14, 2);
  private o = new THREE.Vector3(); private d = new THREE.Vector3(); private m = new THREE.Vector3();

  constructor(cam: THREE.Camera, private fx: Fx) {
    [rifle(), pistol(), knife()].forEach((g, i) => { g.rotation.set(...POSE[i]); this.models.push(g); this.root.add(g); });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ color: 0xffcf70, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flash.visible = false; this.root.add(this.flash, this.light); cam.add(this.root); this.torch = new Torch(this.root); this.reset();
  }
  reset(): void {
    this.ammo = WEAPONS.map((w) => w.mag); this.reserve = WEAPONS.map((w) => w.reserve);
    this.cur = 0; this.rt = this.cd = this.st = 0; this.show();
  }
  visible(v: boolean): void { this.root.visible = v; }
  private show(): void {
    this.models.forEach((g, i) => (g.visible = i === this.cur)); this.flash.position.set(...MUZ[this.cur]); this.light.position.set(...MUZ[this.cur]);
    const W = WEAPONS[this.cur]; this.torch.mount(LENS[this.cur], W.lamp, W.cone);
  }
  addAmmo(): void { this.reserve[0] = Math.min(240, this.reserve[0] + 10); this.reserve[1] = Math.min(120, this.reserve[1] + 5); }
  hud(): { name: string; ammo: string; cur: number; light: boolean } { const W = WEAPONS[this.cur]; return { name: W.name, ammo: W.melee ? '-' : this.rt > 0 ? 'reloading' : `${this.ammo[this.cur]} / ${this.reserve[this.cur]}`, cur: this.cur, light: this.torch.on }; }

  reloadStart(): void {
    const W = WEAPONS[this.cur], c = this.cur;
    if (W.melee || this.rt > 0 || this.ammo[c] >= W.mag || this.reserve[c] <= 0) return; this.rt = W.reload; sfx.reload();
  }
  update(dt: number, i: Input, pl: Player, zs: Zombies, w: World, cam: THREE.Camera): void {
    this.cd -= dt; this.st -= dt; this.hit = Math.max(0, this.hit - dt * 5); this.t += dt; this.mv += ((pl.moving ? 1 : 0) - this.mv) * Math.min(1, dt * 6);
    if (i.light) { i.light = false; this.torch.toggle(); sfx.click(); }
    if (i.swap !== -1) { const n = i.swap === -2 ? (this.cur + 1) % 3 : i.swap; i.swap = -1; if (n !== this.cur) { this.cur = n; this.st = 0.28; this.rt = 0; sfx.swap(); this.show(); } }
    const W = WEAPONS[this.cur], c = this.cur;
    if (this.rt > 0) { this.rt -= dt; if (this.rt <= 0) { const t = Math.min(W.mag - this.ammo[c], this.reserve[c]); this.ammo[c] += t; this.reserve[c] -= t; } }
    if (i.reload) { i.reload = false; this.reloadStart(); }
    const want = W.auto ? i.fire : i.fire && !this.prev; this.prev = i.fire;
    if (want && this.cd <= 0 && this.st <= 0 && this.rt <= 0) { if (W.melee) this.stab(W, zs, cam); else this.shoot(W, pl, zs, w, cam); }
    this.animate(dt, W); this.torch.update(dt, this.t, pl.hurtT);
  }
  private shoot(W: WDef, pl: Player, zs: Zombies, w: World, cam: THREE.Camera): void {
    const c = this.cur; if (this.ammo[c] <= 0) { this.reloadStart(); return; }
    this.ammo[c]--; this.cd = W.rate; cam.getWorldPosition(this.o); cam.getWorldDirection(this.d);
    const sp = W.spread * (pl.crouch > 0.5 ? 0.6 : 1) * (pl.moving ? 1.7 : 1);
    this.d.x += (Math.random() - 0.5) * sp * 2; this.d.y += (Math.random() - 0.5) * sp * 2; this.d.z += (Math.random() - 0.5) * sp * 2; this.d.normalize();
    const blk = w.blocked(this.o, this.d, W.range), h = zs.raycast(this.o, this.d, Math.min(blk, W.range));
    if (h) {
      this.m.copy(this.o).addScaledVector(this.d, h.t); this.fx.puff(this.m, 0x4a0707, 6, 3, 0.2, 0.5, { g: 7, grow: 0.3 }); sfx.hit(this.m, h.head); this.hit = 1;
      if (zs.damage(h.z!, W.dmg, h.head, this.d)) this.onKill(h.z!, h.head);
    } else if (blk < W.range) {
      this.m.copy(this.o).addScaledVector(this.d, blk); this.fx.puff(this.m, 0x6b5d49, 4, 2.5, 0.35, 0.6, { grow: 1.2 }); this.fx.puff(this.m, 0xffc070, 3, 5, 0.06, 0.25, { add: true, g: 9, grow: 0 });
    }
    pl.pitch += W.recoil; pl.yaw += (Math.random() - 0.5) * W.recoil; this.kick = 1; this.ft = 0.05; sfx.shot(W.id);
    this.root.localToWorld(this.m.set(...MUZ[c])); this.fx.puff(this.m, 0xb8bcc0, 2, 0.8, 0.3, 0.9, { grow: 1.4 });
  }
  private stab(W: WDef, zs: Zombies, cam: THREE.Camera): void {
    this.cd = W.rate; this.swing = 1; sfx.knife(); cam.getWorldPosition(this.o); cam.getWorldDirection(this.d);
    const z = zs.melee(this.o, this.d, W.range);
    if (z) {
      this.m.copy(this.o).addScaledVector(this.d, 1.6); this.fx.puff(this.m, 0x4a0707, 6, 3, 0.2, 0.5, { g: 7, grow: 0.3 }); sfx.hit(this.m, false); this.hit = 1;
      if (zs.damage(z, W.dmg, false, this.d)) this.onKill(z, false);
    }
  }
  private animate(dt: number, W: WDef): void {
    this.kick *= Math.max(0, 1 - dt * 14); this.swing = Math.max(0, this.swing - dt * 5); this.ft -= dt;
    this.flash.visible = this.ft > 0; this.light.intensity = this.ft > 0 ? 70 : 0; this.flash.rotation.z = Math.random() * 6;
    const sw = this.st > 0 ? Math.sin(Math.min(1, this.st / 0.28) * Math.PI / 2) : 0, rl = this.rt > 0 ? Math.sin(Math.PI * (1 - this.rt / W.reload)) : 0;
    const bx = Math.cos(this.t * 4.5) * 0.004 * this.mv, by = Math.sin(this.t * 9) * 0.006 * this.mv + Math.sin(this.t * 1.4) * 0.0015;   // walking sway + breathing
    this.root.position.set(0.24 - this.swing * 0.15 + bx, -0.24 - sw * 0.35 - rl * 0.12 + by, -0.5 + this.kick * 0.06);
    this.root.rotation.set(this.kick * 0.07 + rl * 0.6 - this.swing * 0.9, 0, rl * 0.4 + this.swing * 0.5);
  }
}
