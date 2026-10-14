import * as THREE from 'three';
interface P { s: THREE.Sprite; life: number; max: number; vx: number; vy: number; vz: number; g: number; grow: number }
export interface PuffOpts { g?: number; grow?: number; add?: boolean }
/** Fixed ring buffer of sprites reused for blood, dust, smoke and sparks. No allocation after construction.
 *  g = gravity, grow = expansion per second (0 keeps drops small), add = additive blending (sparks). */
export class Fx {
  private pool: P[] = []; private i = 0;
  constructor(scene: THREE.Scene, n = 96) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s); this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, grow: 1.8 });
    }
  }
  puff(p: THREE.Vector3, color: number, count: number, speed: number, size: number, life: number, o: PuffOpts = {}): void {
    for (let k = 0; k < count; k++) {
      const q = this.pool[this.i++ % this.pool.length], m = q.s.material as THREE.SpriteMaterial;
      q.s.position.copy(p); m.color.setHex(color); m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      q.s.scale.setScalar(size * (0.7 + Math.random() * 0.6)); q.s.visible = true; q.life = q.max = life * (0.6 + Math.random() * 0.6);
      q.vx = (Math.random() - 0.5) * speed; q.vy = Math.random() * speed * 0.8; q.vz = (Math.random() - 0.5) * speed; q.g = o.g ?? 0; q.grow = o.grow ?? 1.8;
    }
  }
  update(dt: number): void {
    for (const q of this.pool) {
      if (q.life <= 0) continue;
      q.life -= dt; if (q.life <= 0) { q.s.visible = false; continue; }
      q.vy -= q.g * dt; q.s.position.x += q.vx * dt; q.s.position.y += q.vy * dt; q.s.position.z += q.vz * dt;
      if (q.grow) q.s.scale.multiplyScalar(1 + q.grow * dt); (q.s.material as THREE.SpriteMaterial).opacity = 0.85 * (q.life / q.max);
    }
  }
}
