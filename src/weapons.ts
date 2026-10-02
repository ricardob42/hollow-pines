import * as THREE from 'three';
import { WEAPONS, type WDef } from './config';
import { sfx } from './audio';
import type { Fx } from './fx';
import type { Zombies, Zombie } from './zombies';
import type { World } from './world';
import type { Input } from './input';
import type { Player } from './player';

const MUZ = [-0.7, -0.3, 0];
export class Weapons {
  cur = 0; ammo: number[] = []; reserve: number[] = []; hit = 0;
  onKill: (z: Zombie, head: boolean) => void = () => {};
  private cd = 0; private rt = 0; private st = 0; private kick = 0; private swing = 0; private ft = 0; private prev = false;
  private root = new THREE.Group(); private models: THREE.Group[] = []; private flash: THREE.Mesh; private light = new THREE.PointLight(0xffb060, 0, 8);
  private o = new THREE.Vector3(); private d = new THREE.Vector3(); private m = new THREE.Vector3();

  constructor(cam: THREE.Camera, private fx: Fx) {
    const metal = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.8, roughness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bec4, metalness: 1, roughness: 0.25 });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
    const grp = (...c: THREE.Mesh[]) => { const g = new THREE.Group(); g.add(...c); this.models.push(g); this.root.add(g); };
    grp(box(0.06, 0.09, 0.55, 0, 0, 0, metal), box(0.05, 0.12, 0.2, 0, -0.02, 0.3, wood), box(0.04, 0.14, 0.07, 0, -0.12, 0.02, metal), box(0.025, 0.025, 0.25, 0, 0.02, -0.38, metal));
    grp(box(0.05, 0.07, 0.22, 0, 0, 0, metal), box(0.045, 0.13, 0.07, 0, -0.09, 0.07, wood));
    grp(box(0.015, 0.04, 0.24, 0, 0, -0.12, steel), box(0.03, 0.035, 0.1, 0, 0, 0.04, wood));
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffcf70, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flash.visible = false; this.root.add(this.flash, this.light); cam.add(this.root); this.reset();
  }
  reset(): void {
    this.ammo = WEAPONS.map((w) => w.mag); this.reserve = WEAPONS.map((w) => w.reserve);
    this.cur = 0; this.rt = this.cd = this.st = 0; this.show();
  }
  visible(v: boolean): void { this.root.visible = v; }
  private show(): void { this.models.forEach((g, i) => (g.visible = i === this.cur)); this.flash.position.z = this.light.position.z = MUZ[this.cur]; }
  addAmmo(): void { this.reserve[0] = Math.min(240, this.reserve[0] + 10); this.reserve[1] = Math.min(120, this.reserve[1] + 5); }
  hud(): { name: string; ammo: string } { const W = WEAPONS[this.cur]; return { name: W.name, ammo: W.melee ? '-' : this.rt > 0 ? 'reloading' : `${this.ammo[this.cur]} / ${this.reserve[this.cur]}` }; }

  reloadStart(): void {
    const W = WEAPONS[this.cur], c = this.cur;
    if (W.melee || this.rt > 0 || this.ammo[c] >= W.mag || this.reserve[c] <= 0) return; this.rt = W.reload; sfx.reload();
  }
  update(dt: number, i: Input, pl: Player, zs: Zombies, w: World, cam: THREE.Camera): void {
    this.cd -= dt; this.st -= dt; this.hit = Math.max(0, this.hit - dt * 5);
    if (i.swap !== -1) { const n = i.swap === -2 ? (this.cur + 1) % 3 : i.swap; i.swap = -1; if (n !== this.cur) { this.cur = n; this.st = 0.28; this.rt = 0; sfx.swap(); this.show(); } }
    const W = WEAPONS[this.cur], c = this.cur;
    if (this.rt > 0) { this.rt -= dt; if (this.rt <= 0) { const t = Math.min(W.mag - this.ammo[c], this.reserve[c]); this.ammo[c] += t; this.reserve[c] -= t; } }
    if (i.reload) { i.reload = false; this.reloadStart(); }
    const want = W.auto ? i.fire : i.fire && !this.prev; this.prev = i.fire;
    if (want && this.cd <= 0 && this.st <= 0 && this.rt <= 0) { if (W.melee) this.stab(W, zs, cam); else this.shoot(W, pl, zs, w, cam); }
    this.animate(dt, W);
  }
  private shoot(W: WDef, pl: Player, zs: Zombies, w: World, cam: THREE.Camera): void {
    const c = this.cur; if (this.ammo[c] <= 0) { this.reloadStart(); return; }
    this.ammo[c]--; this.cd = W.rate; cam.getWorldPosition(this.o); cam.getWorldDirection(this.d);
    const sp = W.spread * (pl.crouch > 0.5 ? 0.6 : 1) * (pl.moving ? 1.7 : 1);
    this.d.x += (Math.random() - 0.5) * sp * 2; this.d.y += (Math.random() - 0.5) * sp * 2; this.d.z += (Math.random() - 0.5) * sp * 2; this.d.normalize();
    const blk = w.blocked(this.o, this.d, W.range), h = zs.raycast(this.o, this.d, Math.min(blk, W.range));
    if (h) {
      this.m.copy(this.o).addScaledVector(this.d, h.t); this.fx.puff(this.m, 0x8a1010, 5, 3, 0.28, 0.45); sfx.hit(this.m, h.head); this.hit = 1;
      if (zs.damage(h.z!, W.dmg, h.head, this.d)) this.onKill(h.z!, h.head);
    } else if (blk < W.range) { this.m.copy(this.o).addScaledVector(this.d, blk); this.fx.puff(this.m, 0xb59b78, 4, 2.5, 0.35, 0.6); }
    pl.pitch += W.recoil; pl.yaw += (Math.random() - 0.5) * W.recoil; this.kick = 1; this.ft = 0.05; sfx.shot(W.id);
    this.root.localToWorld(this.m.set(0, 0.03, MUZ[c])); this.fx.puff(this.m, 0xcccccc, 2, 0.8, 0.35, 0.8);
  }
  private stab(W: WDef, zs: Zombies, cam: THREE.Camera): void {
    this.cd = W.rate; this.swing = 1; sfx.knife(); cam.getWorldPosition(this.o); cam.getWorldDirection(this.d);
    const z = zs.melee(this.o, this.d, W.range);
    if (z) {
      this.m.copy(this.o).addScaledVector(this.d, 1.6); this.fx.puff(this.m, 0x8a1010, 5, 3, 0.28, 0.45); sfx.hit(this.m, false); this.hit = 1;
      if (zs.damage(z, W.dmg, false, this.d)) this.onKill(z, false);
    }
  }
  private animate(dt: number, W: WDef): void {
    this.kick *= Math.max(0, 1 - dt * 14); this.swing = Math.max(0, this.swing - dt * 5); this.ft -= dt;
    this.flash.visible = this.ft > 0; this.light.intensity = this.ft > 0 ? 5 : 0; this.flash.rotation.z = Math.random() * 6;
    const sw = this.st > 0 ? Math.sin(Math.min(1, this.st / 0.28) * Math.PI / 2) : 0, rl = this.rt > 0 ? Math.sin(Math.PI * (1 - this.rt / W.reload)) : 0;
    this.root.position.set(0.24 - this.swing * 0.15, -0.24 - sw * 0.35 - rl * 0.12, -0.5 + this.kick * 0.06);
    this.root.rotation.set(this.kick * 0.07 + rl * 0.6 - this.swing * 0.9, 0, rl * 0.4 + this.swing * 0.5);
  }
}
