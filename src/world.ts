import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CFG, QUALITY, type Q } from './config';

export const heightAt = (x: number, z: number) =>
  Math.sin(x * 0.021) * Math.cos(z * 0.017) * 5 + Math.sin(x * 0.055 + z * 0.04) * 1.8 + Math.cos(z * 0.09 - x * 0.03) * 0.9;
const pathX = (z: number) => Math.sin(z * 0.018) * 45;
const density = (x: number, z: number) => 0.5 + 0.5 * Math.sin(x * 0.03 + 1) * Math.sin(z * 0.027 - 2);
const rng = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
interface Col { x: number; z: number; r: number; h: number }
const key = (cx: number, cz: number) => (cx + 100) * 1000 + cz + 100;

export class World {
  readonly uT = { value: 0 };
  readonly sun = new THREE.DirectionalLight(0xfff1d6, 3.2);
  private root = new THREE.Group(); private sky = new Sky();
  private grid = new Map<number, Col[]>(); private built?: Q; private dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    scene.add(this.root, this.sun, this.sun.target, new THREE.HemisphereLight(0xbcd4ff, 0x3a4a2a, 0.9));
    scene.fog = new THREE.FogExp2(0xaebfc4, 0.0085);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.sky.scale.setScalar(900); scene.add(this.sky);
    const s = this.sun.shadow;
    s.camera.left = s.camera.bottom = -70; s.camera.right = s.camera.top = 70; s.camera.near = 1; s.camera.far = 320; s.bias = -0.0004; s.normalBias = 0.05;
  }

  /** Slow sun drift + shadow frustum following the player (snapped to reduce shimmer). */
  follow(p: THREE.Vector3, cam: THREE.Vector3, t: number): void {
    this.dir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(150 + t * 0.04));
    this.sky.material.uniforms.sunPosition.value.copy(this.dir); this.sky.position.copy(cam);
    const x = Math.round(p.x / 2) * 2, z = Math.round(p.z / 2) * 2;
    this.sun.target.position.set(x, 0, z); this.sun.position.set(x, 0, z).addScaledVector(this.dir, 120);
  }

  private wind(m: THREE.Material, amp: number): void {
    m.onBeforeCompile = (s) => {
      s.uniforms.uT = this.uT;
      s.vertexShader = s.vertexShader.replace('void main() {', 'uniform float uT;\nvoid main() {').replace('#include <begin_vertex>',
        `vec3 transformed=position;float w=max(position.y,0.0);
         transformed.x+=sin(uT*1.6+instanceMatrix[3].x*.3+instanceMatrix[3].z*.2)*${amp.toFixed(3)}*w;
         transformed.z+=cos(uT*1.3+instanceMatrix[3].z*.25)*${(amp * 0.6).toFixed(3)}*w;`);
    };
  }

  private col(x: number, z: number, r: number, h: number): void {
    const k = key(Math.floor(x / CFG.world.cell), Math.floor(z / CFG.world.cell));
    let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push({ x, z, r, h });
  }

  /** Push a circle (x,z,r) out of every static collider. */
  push(p: THREE.Vector3, r: number): void {
    const C = CFG.world.cell, cx = Math.floor(p.x / C), cz = Math.floor(p.z / C);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = this.grid.get(key(cx + i, cz + j)); if (!a) continue;
      for (const c of a) {
        const dx = p.x - c.x, dz = p.z - c.z, m = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
      }
    }
  }

  /** Distance along the ray to terrain/tree/rock, or Infinity. Used for hitscan occlusion. */
  blocked(o: THREE.Vector3, d: THREE.Vector3, max: number): number {
    const C = CFG.world.cell;
    for (let t = 1; t < max; t += 0.6) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < heightAt(x, z)) return t;
      const a = this.grid.get(key(Math.floor(x / C), Math.floor(z / C)));
      if (a) for (const c of a) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r && y < heightAt(c.x, c.z) + c.h) return t; }
    }
    return Infinity;
  }

  build(q: Q): void {
    if (this.built === q) return;
    this.dispose(); this.built = q;
    const Qc = QUALITY[q], R = rng(1337), half = CFG.world.half, d = new THREE.Object3D(), c = new THREE.Color();
    this.sun.castShadow = Qc.shadow > 0;
    if (Qc.shadow) { this.sun.shadow.mapSize.set(Qc.shadow, Qc.shadow); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }

    // Terrain: organic heightfield, vertex colours for grass variation, leaf litter and a dirt path.
    const tg = new THREE.PlaneGeometry(half * 2, half * 2, CFG.world.seg, CFG.world.seg).rotateX(-Math.PI / 2);
    const p = tg.attributes.position, col = new Float32Array(p.count * 3), dirt = new THREE.Color(0x5a4a34);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z), n = R(); p.setY(i, h);
      c.setHSL(0.24 + n * 0.05 - (n > 0.9 ? 0.12 : 0), 0.36, 0.19 + n * 0.07 + h * 0.004);
      const e = Math.abs(x - pathX(z)); if (e < 4) c.lerp(dirt, 1 - e / 4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.computeVertexNormals();
    const ground = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true; this.root.add(ground);

    const inst = (g: THREE.BufferGeometry, m: THREE.Material, n: number, shadow: boolean) => {
      const o = new THREE.InstancedMesh(g, m, Math.max(n, 1)); o.castShadow = o.receiveShadow = shadow; o.count = 0; this.root.add(o); return o;
    };
    const put = (o: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, k: THREE.Color) => {
      d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(sx, sy, sz); d.updateMatrix();
      o.setMatrixAt(o.count, d.matrix); o.setColorAt(o.count, k); o.count++;
    };
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const rockM = new THREE.MeshStandardMaterial({ color: 0x7b7d78, roughness: 0.95, flatShading: true });
    const grassM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
    this.wind(leaf, 0.12); this.wind(grassM, 0.35);

    // Pines + broadleaf trees (instanced). Density varies by region; spawn clearing and path stay open.
    const N = Qc.trees;
    const trunks = inst(new THREE.CylinderGeometry(0.16, 0.3, 1, 6).translate(0, 0.5, 0), bark, N, true);
    const pines = inst(new THREE.ConeGeometry(1.5, 1, 7).translate(0, 0.5, 0), leaf, N, true);
    const broads = inst(new THREE.IcosahedronGeometry(1, 1), leaf, N, true);
    for (let i = 0, tr = 0; i < N && tr < N * 8; tr++) {
      const x = (R() * 2 - 1) * (half - 8), z = (R() * 2 - 1) * (half - 8);
      if (Math.hypot(x, z) < 15 || Math.abs(x - pathX(z)) < 5.5 || R() > density(x, z) * 1.1 + 0.15) continue;
      const s = 0.8 + R() * 0.9, y = heightAt(x, z), ry = R() * 6.28, pine = R() < 0.55, th = (pine ? 2.4 : 3.4) * s;
      put(trunks, x, y - 0.2, z, s, th + 0.2, s, ry, bark.color);
      if (pine) { c.setHSL(0.33, 0.42, 0.13 + R() * 0.08); put(pines, x, y + 1.1 * s, z, 1.15 * s, 6.5 * s, 1.15 * s, ry, c); }
      else { c.setHSL(0.2 + R() * 0.08, 0.5, 0.18 + R() * 0.1); put(broads, x, y + th + 0.5 * s, z, 2.3 * s, 2 * s, 2.3 * s, ry, c); }
      this.col(x, z, 0.32 * s + 0.12, 9); i++;
    }

    // Rocks (deterministic per-position distortion so faces never tear).
    const rg = new THREE.IcosahedronGeometry(1, 1), rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 0.85 + 0.3 * Math.abs(Math.sin(x * 7.1 + y * 3.3 + z * 5.7));
      rp.setXYZ(i, x * k, y * k * 0.7, z * k);
    }
    rg.computeVertexNormals();
    const rocks = inst(rg, rockM, 150, true);
    for (let i = 0; i < 150; i++) {
      const x = (R() * 2 - 1) * (half - 8), z = (R() * 2 - 1) * (half - 8); if (Math.hypot(x, z) < 10) continue;
      const s = 0.8 + R() * 2.2; c.setScalar(0.7 + R() * 0.5);
      put(rocks, x, heightAt(x, z) + 0.2 * s, z, s, s * (0.7 + R() * 0.5), s, R() * 6.28, c); this.col(x, z, 0.95 * s, 1.4 * s);
    }

    // Fallen logs: tactical cover, collide as 3 circles along their length.
    const logs = inst(new THREE.CylinderGeometry(0.3, 0.38, 4.4, 7).rotateZ(Math.PI / 2), bark, 36, true);
    for (let i = 0; i < 36; i++) {
      const x = (R() * 2 - 1) * (half - 10), z = (R() * 2 - 1) * (half - 10), ry = R() * 6.28; if (Math.hypot(x, z) < 12) continue;
      put(logs, x, heightAt(x, z) + 0.3, z, 1, 1, 1, ry, bark.color);
      for (const k of [-1.5, 0, 1.5]) this.col(x + Math.cos(ry) * k, z - Math.sin(ry) * k, 0.5, 0.9);
    }

    // Bushes + grass tufts (no collision, wind-animated, no shadows).
    const bushes = inst(new THREE.IcosahedronGeometry(1, 1), leaf, 450, false);
    for (let i = 0; i < 450; i++) {
      const x = (R() * 2 - 1) * (half - 6), z = (R() * 2 - 1) * (half - 6), s = 0.7 + R() * 0.9; c.setHSL(0.22 + R() * 0.1, 0.45, 0.16 + R() * 0.1);
      put(bushes, x, heightAt(x, z) + 0.3 * s, z, s * 1.3, s * 0.8, s * 1.3, R() * 6.28, c);
    }
    if (Qc.grass) {
      const grass = inst(new THREE.ConeGeometry(0.07, 0.9, 3).translate(0, 0.45, 0), grassM, Qc.grass, false);
      for (let i = 0; i < Qc.grass; i++) {
        const x = (R() * 2 - 1) * (half - 4), z = (R() * 2 - 1) * (half - 4); c.setHSL(0.2 + R() * 0.1, 0.5, 0.25 + R() * 0.15);
        put(grass, x, heightAt(x, z), z, 1, 0.6 + R() * 0.8, 1, R() * 6.28, c);
      }
    }
    for (const o of this.root.children) if (o instanceof THREE.InstancedMesh) {
      o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; o.computeBoundingSphere();
    }
  }

  private dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.root.clear(); this.grid.clear();
  }
}
