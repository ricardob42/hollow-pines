import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, QUALITY, type Q } from './config';
import { ground, bark, needles, plant, glow } from './tex';
import { Particles, mkShared, type TorchU } from './light';

export const heightAt = (x: number, z: number) =>
  Math.sin(x * 0.021) * Math.cos(z * 0.017) * 5 + Math.sin(x * 0.055 + z * 0.04) * 1.8 + Math.cos(z * 0.09 - x * 0.03) * 0.9;
const pathX = (z: number) => Math.sin(z * 0.018) * 45;
const density = (x: number, z: number) => 0.5 + 0.5 * Math.sin(x * 0.03 + 1) * Math.sin(z * 0.027 - 2);
const rng = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
interface Col { x: number; z: number; r: number; h: number }
const key = (cx: number, cz: number) => (cx + 100) * 1000 + cz + 100;
const V = THREE.Vector3; type G = THREE.BufferGeometry;
const YARD = { x: 28, z: -24 };                                   // the ruined graveyard (iron fence, headstones, one lit lamp)
const merge = (gs: G[]) => mergeGeometries(gs, false)!;

/** Night sky: gradient that meets the fog at the horizon, stars, a hazy moon and drifting cloud. */
const SKY_V = `varying vec3 vD; void main(){ vD=position; gl_Position=(projectionMatrix*modelViewMatrix*vec4(position,1.)).xyww; }`;
const SKY_F = `uniform vec3 uMoon,uHor,uZen; uniform float uT; varying vec3 vD;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1.,0.)),f.x),mix(h2(i+vec2(0.,1.)),h2(i+vec2(1.,1.)),f.x),f.y);}
float fb(vec2 p){float a=0.,w=.5;for(int i=0;i<4;i++){a+=w*n2(p);p*=2.03;w*=.5;}return a;}
void main(){
  vec3 d=normalize(vD); float y=max(d.y,0.); vec3 col=mix(uHor,uZen,pow(y,.5));
  vec3 q=d*130.,id=floor(q),f=fract(q)-.5; float r=h2(id.xz+id.y*37.1);
  float st=step(.992,r)*smoothstep(.4,.0,length(f))*(.5+.5*sin(uT*1.7+r*90.))*smoothstep(.08,.45,d.y);
  float md=dot(d,uMoon), disc=smoothstep(.99935,.9996,md), halo=pow(max(md,0.),90.)*.7+pow(max(md,0.),8.)*.07;
  vec2 cp=d.xz/(d.y+.3)*1.5+vec2(uT*.006,uT*.003); float cl=smoothstep(.42,.8,fb(cp))*smoothstep(.0,.3,d.y);
  vec3 mc=vec3(.72,.82,1.);
  col+=st*.9*(1.-cl); col+=mc*halo*(1.-cl*.55); col=mix(col,uHor*1.8+vec3(.01,.015,.02),cl*.6);
  col+=mc*pow(max(md,0.),5.)*cl*.14; col=mix(col,mc*5.,disc*(1.-cl*.8));
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---- procedural tree geometry (merged once, instanced many times) ----
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): G {
  const d = new V().subVectors(b, a), g = new THREE.CylinderGeometry(r1, r0, d.length(), 5, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g;
}
function branches(R: () => number, out: G[], tips: THREE.Vector3[], p: THREE.Vector3, d: THREE.Vector3, len: number, r: number, depth: number): void {
  const e = p.clone().addScaledVector(d, len); out.push(limb(p, e, r, r * 0.65));
  if (depth <= 0) { tips.push(e); return; }
  for (let i = 0, n = 2 + (R() < 0.35 ? 1 : 0); i < n; i++) {
    const nd = d.clone().add(new V((R() - 0.5) * 1.3, R() * 0.45 + 0.05, (R() - 0.5) * 1.3)).normalize();
    branches(R, out, tips, e, nd, len * (0.66 + R() * 0.18), r * 0.6, depth - 1);
  }
}
const lump = (g: G, a: number, s: number) => {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (a * (Math.sin(x * 4.1 + s) + Math.sin(y * 3.7 + s * 1.3) + Math.sin(z * 4.9 + s * 0.7))) / 3; p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
};
interface Sp { wood: G; leaf?: G }
function pine(seed: number): Sp {
  const R = rng(seed), tiers: G[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6, r = 2.1 * (1 - t * 0.82) + 0.25, h = 1.9 - t * 0.6, g = new THREE.ConeGeometry(r, h, 10, 2, true), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {                                       // ragged, drooping skirt
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k), n = Math.sin(x * 6.1 + i * 3.1) * Math.cos(z * 5.3 + i) * 0.5 + 0.5, low = y < -h * 0.25, f = low ? 1 + (n - 0.5) * 0.5 : 1;
      p.setXYZ(k, x * f, y - (low ? Math.hypot(x, z) * 0.18 : 0), z * f);
    }
    g.translate(0, 1.5 + t * 5.4 + R() * 0.1, 0); tiers.push(g);
  }
  return { wood: new THREE.CylinderGeometry(0.07, 0.3, 7.4, 7, 1, true).translate(0, 3.5, 0), leaf: merge(tiers) };
}
function gnarled(seed: number, leafy: boolean): Sp {
  const R = rng(seed), out: G[] = [], tips: THREE.Vector3[] = [];
  branches(R, out, tips, new V(0, -0.2, 0), new V((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25), leafy ? 2.3 : 2.6, leafy ? 0.32 : 0.26, leafy ? 2 : 3);
  if (!leafy) return { wood: merge(out) };
  const blobs = tips.map((t, i) => lump(new THREE.IcosahedronGeometry(1.3 + R() * 0.8, 1), 0.35, seed + i).translate(t.x, t.y + 0.5, t.z));
  blobs.push(lump(new THREE.IcosahedronGeometry(1.9, 1), 0.35, seed).translate(0, 4.6, 0));
  return { wood: merge(out), leaf: merge(blobs) };
}

export class World {
  readonly uT = { value: 0 };
  readonly moon = new THREE.DirectionalLight(CFG.night.moonColor, CFG.night.moon);
  private hemi = new THREE.HemisphereLight(0x2c4058, 0x07090a, CFG.night.hemi);
  private root = new THREE.Group(); private sky: THREE.Mesh; private fog: THREE.FogExp2; private lamp?: THREE.PointLight;
  private grid = new Map<number, Col[]>(); private built?: Q; private sh = mkShared(); private mdir = new V(0.42, 0.62, -0.66).normalize();

  constructor(scene: THREE.Scene, private torch: TorchU) {
    const N = CFG.night, fc = new THREE.Color(N.fogColor);
    this.fog = new THREE.FogExp2(N.fogColor, N.fog); scene.fog = this.fog; scene.background = fc;
    scene.add(this.root, this.moon, this.moon.target, this.hemi);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uMoon: { value: this.mdir }, uHor: { value: fc }, uZen: { value: new THREE.Color(0x02050c) }, uT: { value: 0 } } }));
    this.sky.scale.setScalar(900); this.sky.frustumCulled = false; this.sky.renderOrder = -10; scene.add(this.sky);
    const s = this.moon.shadow; s.camera.left = s.camera.bottom = -70; s.camera.right = s.camera.top = 70; s.camera.near = 1; s.camera.far = 320; s.bias = -0.0004; s.normalBias = 0.05;
  }
  /** Menu / game-over screens are lit a bit more so the forest reads behind the text. */
  setMenu(on: boolean): void { this.hemi.intensity = on ? 0.55 : CFG.night.hemi; this.moon.intensity = on ? 0.8 : CFG.night.moon; this.fog.density = on ? 0.017 : CFG.night.fog; }
  setScale(px: number): void { this.sh.scale.value = px; }

  /** Moon shadow frustum follows the player (snapped to reduce shimmer); the sky and the particle volumes follow the camera. */
  follow(p: THREE.Vector3, cam: THREE.Vector3, t: number): void {
    this.sh.t.value = t; this.sh.cam.value.copy(cam); this.sh.gy.value = heightAt(p.x, p.z);
    this.sky.position.copy(cam); (this.sky.material as THREE.ShaderMaterial).uniforms.uT.value = t;
    const x = Math.round(p.x / 2) * 2, z = Math.round(p.z / 2) * 2;
    this.moon.target.position.set(x, 0, z); this.moon.position.set(x, 0, z).addScaledVector(this.mdir, 120);
    if (this.lamp) this.lamp.intensity = 26 * (0.88 + 0.12 * Math.sin(t * 11.3) * Math.sin(t * 5.7 + 1));
  }

  private wind(m: THREE.Material, amp: number): void {
    m.customProgramCacheKey = () => `wind${amp}`;                 // different sway amplitudes must not share one compiled program
    m.onBeforeCompile = (s) => {
      s.uniforms.uT = this.uT;
      s.vertexShader = s.vertexShader.replace('void main() {', 'uniform float uT;\nvoid main() {').replace('#include <begin_vertex>',
        `vec3 transformed=position;float w=max(position.y,0.0);
         transformed.x+=sin(uT*1.6+instanceMatrix[3].x*.3+instanceMatrix[3].z*.2)*${amp.toFixed(4)}*w;
         transformed.z+=cos(uT*1.3+instanceMatrix[3].z*.25)*${(amp * 0.6).toFixed(4)}*w;`);
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
    const Qc = QUALITY[q], R = rng(1337), half = CFG.world.half, d = new THREE.Object3D(), c = new THREE.Color(), shadows = Qc.shadow > 0 || Qc.moon > 0;
    this.moon.castShadow = Qc.moon > 0;
    if (Qc.moon) { this.moon.shadow.mapSize.set(Qc.moon, Qc.moon); this.moon.shadow.map?.dispose(); this.moon.shadow.map = null; }
    const nearYard = (x: number, z: number, r: number) => Math.hypot(x - YARD.x, z - YARD.z) < r;

    // Terrain: heightfield + tiled mud/moss/leaf-litter albedo and normal map; vertex colours add macro variation and the dirt path.
    const GT = ground(); GT.map.repeat.set(60, 60); GT.normal.repeat.set(60, 60);
    const tg = new THREE.PlaneGeometry(half * 2, half * 2, CFG.world.seg, CFG.world.seg).rotateX(-Math.PI / 2);
    const p = tg.attributes.position, col = new Float32Array(p.count * 3), dirt = new THREE.Color(0.8, 0.62, 0.44);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z), n = R(); p.setY(i, h);
      c.setRGB(0.5 + n * 0.3 - (n > 0.92 ? 0.2 : 0), 0.58 + n * 0.25, 0.46 + n * 0.2);
      const e = Math.abs(x - pathX(z)); if (e < 4) c.lerp(dirt, 1 - e / 4);
      col.set([c.r, c.g, c.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.computeVertexNormals();
    const floor = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: GT.map, normalMap: GT.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.9 }));
    floor.receiveShadow = shadows; this.root.add(floor);

    const inst = (g: G, m: THREE.Material, n: number, shadow: boolean) => {
      const o = new THREE.InstancedMesh(g, m, Math.max(n, 1)); o.castShadow = o.receiveShadow = shadow; o.count = 0; this.root.add(o); return o;
    };
    const put = (o: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, k: THREE.Color, rx = 0, rz = 0) => {
      d.position.set(x, y, z); d.rotation.set(rx, ry, rz); d.scale.set(sx, sy, sz); d.updateMatrix();
      o.setMatrixAt(o.count, d.matrix); o.setColorAt(o.count, k); o.count++;
    };
    const B = bark(), F = needles(); B.map.repeat.set(2, 2); B.normal.repeat.set(2, 2); F.map.repeat.set(3, 3); F.normal.repeat.set(3, 3);
    const woodM = new THREE.MeshStandardMaterial({ map: B.map, normalMap: B.normal, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ map: F.map, normalMap: F.normal, roughness: 0.9, side: THREE.DoubleSide });
    const rockM = new THREE.MeshStandardMaterial({ color: 0x6d706c, roughness: 0.95, flatShading: true });
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x8a8d86, roughness: 0.97, normalMap: B.normal, map: B.map });
    const ironM = new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.75, roughness: 0.5 });
    this.wind(leafM, 0.018);

    // Trees: 2 pine shapes, 2 dead trees, 1 oak (each a merged trunk+branches mesh and, if leafy, a canopy mesh). Spawn clearing, path and graveyard stay open.
    const N = Qc.trees, species = [pine(1), pine(2), gnarled(3, false), gnarled(4, false), gnarled(5, true)];
    const kinds = species.map((s) => ({ w: inst(s.wood, woodM, N, shadows), l: s.leaf ? inst(s.leaf, leafM, N, shadows) : undefined }));
    for (let i = 0, tr = 0; i < N && tr < N * 8; tr++) {
      const x = (R() * 2 - 1) * (half - 8), z = (R() * 2 - 1) * (half - 8);
      if (Math.hypot(x, z) < 15 || Math.abs(x - pathX(z)) < 5.5 || nearYard(x, z, 14) || R() > density(x, z) * 1.1 + 0.15) continue;
      const r = R(), k = kinds[r < 0.5 ? (R() < 0.5 ? 0 : 1) : r < 0.76 ? (R() < 0.5 ? 2 : 3) : 4], s = 0.8 + R() * 0.9, y = heightAt(x, z), ry = R() * 6.28, lean = (R() - 0.5) * 0.09;
      put(k.w, x, y, z, s, s, s, ry, c.setScalar(0.55 + R() * 0.4), lean, lean);
      if (k.l) put(k.l, x, y, z, s, s, s, ry, c.setRGB(0.65 + R() * 0.35, 0.75 + R() * 0.3, 0.6 + R() * 0.25), lean, lean);
      this.col(x, z, 0.32 * s + 0.12, 9); i++;
    }

    // Rocks (deterministic per-position distortion so faces never tear).
    const rocks = inst(lump(new THREE.IcosahedronGeometry(1, 1), 0.28, 4), rockM, 150, shadows);
    for (let i = 0; i < 150; i++) {
      const x = (R() * 2 - 1) * (half - 8), z = (R() * 2 - 1) * (half - 8); if (Math.hypot(x, z) < 10 || nearYard(x, z, 12)) continue;
      const s = 0.8 + R() * 2.2; c.setScalar(0.7 + R() * 0.5);
      put(rocks, x, heightAt(x, z) + 0.2 * s, z, s, s * (0.5 + R() * 0.5), s, R() * 6.28, c); this.col(x, z, 0.95 * s, 1.4 * s);
    }

    // Fallen logs: tactical cover, collide as 3 circles along their length.
    const logs = inst(new THREE.CylinderGeometry(0.3, 0.38, 4.4, 8).rotateZ(Math.PI / 2), woodM, 36, shadows);
    for (let i = 0; i < 36; i++) {
      const x = (R() * 2 - 1) * (half - 10), z = (R() * 2 - 1) * (half - 10), ry = R() * 6.28; if (Math.hypot(x, z) < 12 || nearYard(x, z, 12)) continue;
      put(logs, x, heightAt(x, z) + 0.3, z, 1, 1, 1, ry, c.setScalar(0.6 + R() * 0.3));
      for (const k of [-1.5, 0, 1.5]) this.col(x + Math.cos(ry) * k, z - Math.sin(ry) * k, 0.5, 0.9);
    }

    // Undergrowth: dark bushes, grass tufts and ferns (alpha-cut crossed cards, wind-animated, no collision).
    const bushes = inst(lump(new THREE.IcosahedronGeometry(1, 1), 0.3, 9), leafM, 450, false);
    for (let i = 0; i < 450; i++) {
      const x = (R() * 2 - 1) * (half - 6), z = (R() * 2 - 1) * (half - 6), s = 0.7 + R() * 0.9;
      put(bushes, x, heightAt(x, z) + 0.3 * s, z, s * 1.3, s * 0.8, s * 1.3, R() * 6.28, c.setRGB(0.5 + R() * 0.4, 0.6 + R() * 0.3, 0.45 + R() * 0.2));
    }
    const PL = plant(), a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), card = merge([a, a.clone().rotateY(Math.PI / 2)]);
    const mkP = (t: THREE.Texture, n: number, w0: number, w1: number) => {
      const m = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }); this.wind(m, 0.16);
      const o = inst(card, m, n, false);
      for (let i = 0; i < n; i++) {
        const x = (R() * 2 - 1) * (half - 4), z = (R() * 2 - 1) * (half - 4), w = w0 + R() * (w1 - w0);
        put(o, x, heightAt(x, z), z, w, w * (0.6 + R() * 0.5), w, R() * 6.28, c.setRGB(0.55 + R() * 0.45, 0.65 + R() * 0.35, 0.5 + R() * 0.3));
      }
    };
    if (Qc.grass) { mkP(PL.grass, Qc.grass, 0.8, 1.5); mkP(PL.fern, Math.round(Qc.grass * 0.12) + 40, 1, 1.9); }

    this.graveyard(R, inst, put, stoneM, ironM, q !== 'low', shadows);

    // Floating dust motes lit by the flashlight beam, and low ground mist that glows where the beam crosses it.
    if (Qc.dust) this.root.add(new Particles(Qc.dust, { size: 0.022, alpha: 0.9, box: 26, h: 0, color: 0xfff2d6, lit: 1.4, drift: [0.12, 0.05, 0.08], additive: true }, this.sh, this.torch));
    if (Qc.mist) this.root.add(new Particles(Qc.mist, { size: 7, alpha: 0.075, box: 80, h: 3.2, color: 0x2a373e, lit: 3, drift: [0.5, 0, 0.3], additive: false }, this.sh, this.torch));

    for (const o of this.root.children) if (o instanceof THREE.InstancedMesh) {
      o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; o.computeBoundingSphere();
    }
  }

  /** Ruined cemetery: leaning headstones and crosses, a broken wrought-iron fence with a gate gap, and a flickering lamp post. */
  private graveyard(R: () => number, inst: (g: G, m: THREE.Material, n: number, s: boolean) => THREE.InstancedMesh,
    put: (o: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, k: THREE.Color, rx?: number, rz?: number) => void,
    stoneM: THREE.Material, ironM: THREE.Material, lamp: boolean, shadows: boolean): void {
    const c = new THREE.Color(), arch = new THREE.Shape(); arch.moveTo(-0.25, 0); arch.lineTo(0.25, 0); arch.lineTo(0.25, 0.7); arch.absarc(0, 0.7, 0.25, 0, Math.PI, false); arch.lineTo(-0.25, 0);
    const stone = new THREE.ExtrudeGeometry(arch, { depth: 0.12, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 6 }).translate(0, 0, -0.06);
    const cross = merge([new THREE.BoxGeometry(0.14, 1.1, 0.1).translate(0, 0.55, 0), new THREE.BoxGeometry(0.55, 0.14, 0.1).translate(0, 0.8, 0)]);
    const stones = inst(stone, stoneM, 40, shadows), crosses = inst(cross, stoneM, 14, shadows);
    for (let ix = -5.5; ix <= 5.5; ix += 2.2) for (let iz = -5.5; iz <= 5.5; iz += 2.6) {
      if (R() < 0.25) continue;
      const x = YARD.x + ix + (R() - 0.5) * 0.8, z = YARD.z + iz + (R() - 0.5) * 0.8, k = R() < 0.25 ? crosses : stones, s = 0.85 + R() * 0.3;
      put(k, x, heightAt(x, z) - 0.05, z, s, s, s, (R() - 0.5) * 0.5, c.setScalar(0.6 + R() * 0.4), (R() - 0.5) * 0.25, (R() - 0.5) * 0.3); this.col(x, z, 0.35, 1);
    }
    const parts: G[] = [new THREE.BoxGeometry(2.4, 0.06, 0.05).translate(0, 0.35, 0), new THREE.BoxGeometry(2.4, 0.06, 0.05).translate(0, 1.25, 0)];
    for (let i = 0; i < 10; i++) { const x = -1.15 + i * 0.255; parts.push(new THREE.BoxGeometry(0.035, 1.5, 0.035).translate(x, 0.75, 0), new THREE.ConeGeometry(0.03, 0.15, 4).translate(x, 1.58, 0)); }
    const fence = inst(merge(parts), ironM, 40, shadows), S = 8.5;
    for (let side = 0; side < 4; side++) for (let i = 0; i < 7; i++) {
      if ((side === 0 && (i === 3 || i === 4)) || R() < 0.15) continue;                     // gate gap + broken panels
      const o = -S + 1.2 + i * 2.43, cx = side === 0 ? o : side === 1 ? S : side === 2 ? -o : -S, cz = side === 0 ? S : side === 1 ? o : side === 2 ? -S : -o, ry = (side % 2 ? Math.PI / 2 : 0);
      const x = YARD.x + cx, z = YARD.z + cz;
      put(fence, x, heightAt(x, z) - 0.1, z, 1, 1, 1, ry, c.setScalar(1), 0, (R() - 0.5) * 0.25);
      for (const k of [-0.8, 0, 0.8]) this.col(x + Math.cos(ry) * k, z - Math.sin(ry) * k, 0.3, 1.5);
    }
    if (!lamp) return;
    const lx = YARD.x + 2.4, lz = YARD.z + S + 0.6, L = new THREE.Group(); L.position.set(lx, heightAt(lx, lz), lz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 3.4, 8).translate(0, 1.7, 0), ironM), cap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 4).translate(0, 3.75, 0), ironM);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24).translate(0, 3.5, 0), new THREE.MeshBasicMaterial({ color: 0xffd08a, fog: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); halo.position.set(0, 3.5, 0); halo.scale.setScalar(3.4);
    this.lamp = new THREE.PointLight(0xffb066, 26, 24, 1.6); this.lamp.position.set(0, 3.3, 0);
    L.add(pole, cap, glass, halo, this.lamp); this.root.add(L); this.col(lx, lz, 0.2, 3.4);
  }

  private dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose();
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.root.clear(); this.grid.clear(); this.lamp = undefined;
  }
}
