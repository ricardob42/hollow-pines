import * as THREE from 'three';
import { CFG } from './config';
import { heightAt, type World } from './world';
import type { Input } from './input';
import { sfx } from './audio';

export class Player {
  pos = new THREE.Vector3(); yaw = 0; pitch = 0; hp = CFG.player.hp; crouch = 0; hurtT = 0; moving = false;
  private vx = 0; private vz = 0; private vy = 0; private ground = true; private bob = 0; private step = 0;

  reset(): void {
    this.pos.set(0, heightAt(0, 0), 0); this.yaw = this.pitch = this.vx = this.vz = this.vy = 0;
    this.hp = CFG.player.hp; this.crouch = 0; this.hurtT = 0; this.ground = true;
  }
  hurt(d: number): void { this.hp -= d; this.hurtT = 1; sfx.hurt(); }

  update(dt: number, i: Input, w: World, cam: THREE.PerspectiveCamera): void {
    const P = CFG.player;
    this.yaw -= i.look.x; this.pitch = THREE.MathUtils.clamp(this.pitch - i.look.y, -1.5, 1.5); i.look.x = i.look.y = 0;
    const a = i.axes(), crouching = i.crouch, sprint = !crouching && a.y > 0.5 && i.sprint;
    const spd = crouching ? P.crouchSpeed : sprint ? P.sprint : P.walk, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tx = (-sy * a.y + cy * a.x) * spd, tz = (-cy * a.y - sy * a.x) * spd, k = Math.min(1, dt * (this.ground ? 12 : 3));
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; w.push(this.pos, P.radius);
    const lim = CFG.world.half - 6; this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim); this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
    if (i.jump && this.ground && !crouching) { this.vy = P.jump; this.ground = false; } i.jump = false;
    this.vy -= P.gravity * dt; this.pos.y += this.vy * dt;
    const gh = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) { this.pos.y = gh; this.vy = 0; this.ground = true; } else if (this.pos.y > gh + 0.08) this.ground = false;
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    const hs = Math.hypot(this.vx, this.vz); this.moving = hs > 1; this.bob += dt * hs * 1.6; this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
    const eye = P.eye - (P.eye - P.eyeCrouch) * this.crouch, by = this.ground ? Math.sin(this.bob * 2) * 0.025 * Math.min(1, hs / 5) : 0;
    cam.position.set(this.pos.x, this.pos.y + eye + by, this.pos.z); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.step += hs * dt; if (this.ground && this.step > (sprint ? 2.2 : 2.8)) { this.step = 0; sfx.step(); }
  }
}
