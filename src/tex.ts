import * as THREE from 'three';
/** All textures are painted procedurally on canvases (no asset files, works offline) and cached: they are built once. */
const H = (x: number, y: number, s: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** Periodic value noise: tiles every px x py lattice cells so textures repeat without seams. */
export function noise(x: number, y: number, px: number, py: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const mx = (a: number) => ((a % px) + px) % px, my = (a: number) => ((a % py) + py) % py;
  const a = H(mx(xi), my(yi), s), b = H(mx(xi + 1), my(yi), s), c = H(mx(xi), my(yi + 1), s), d = H(mx(xi + 1), my(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, px: number, py: number, oct: number, s = 0): number {
  let a = 0, amp = 0.5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { a += amp * noise(x * f, y * f, px * f, py * f, s + i); t += amp; amp *= 0.5; f *= 2; }
  return a / t;
}
const rng = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function canvas(w: number, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return { c, g: c.getContext('2d', { willReadFrequently: true })! }; }
function paint(w: number, h: number, f: (u: number, v: number) => [number, number, number]) {
  const { c, g } = canvas(w, h), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, gg, b] = f(x / w, y / h), i = (y * w + x) * 4; im.data[i] = r * 255; im.data[i + 1] = gg * 255; im.data[i + 2] = b * 255; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); return { c, g };
}
/** Draw a mark at the 9 wrapped positions so strokes crossing an edge reappear on the opposite side (seamless). */
function wrap(c: HTMLCanvasElement, f: (dx: number, dy: number) => void) { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) f(i * c.width, j * c.height); }
const T = (c: HTMLCanvasElement, srgb = true) => {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t;
};
/** Height (luminance) -> tangent-space normal map, wrapping at the borders. */
function normalOf(src: HTMLCanvasElement, k: number): THREE.CanvasTexture {
  const W = src.width, Hh = src.height, d = src.getContext('2d')!.getImageData(0, 0, W, Hh).data, h = new Float32Array(W * Hh);
  for (let i = 0; i < W * Hh; i++) h[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const { c, g } = canvas(W, Hh), im = g.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const l = h[y * W + ((x + W - 1) % W)], r = h[y * W + ((x + 1) % W)], u = h[((y + Hh - 1) % Hh) * W + x], dn = h[((y + 1) % Hh) * W + x];
    let nx = (l - r) * k, ny = (dn - u) * k, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
    const i = (y * W + x) * 4; im.data[i] = (nx * 0.5 + 0.5) * 255; im.data[i + 1] = (ny * 0.5 + 0.5) * 255; im.data[i + 2] = (nz * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0); return T(c, false);
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const memo = <A>(f: () => A) => { let v: A | undefined; return () => (v ??= f()); };

/** Forest floor: mud + moss + leaf litter + twigs. */
export const ground = memo(() => {
  const S = 512, R = rng(7), mud = [0.34, 0.27, 0.19], moss = [0.27, 0.34, 0.2];
  const { c, g } = paint(S, S, (u, v) => {
    const n = fbm(u * 6, v * 6, 6, 6, 4, 1), d = fbm(u * 40, v * 40, 40, 40, 2, 9), k = mix(mud, moss, Math.min(1, Math.max(0, (n - 0.35) * 2.2)));
    return k.map((x) => x * (0.65 + d * 0.7)) as [number, number, number];
  });
  const leaves = ['#7a4b22', '#5d391b', '#8d6a2c', '#43331a', '#575a2c', '#6a2f1c'];
  for (let i = 0; i < 1700; i++) {
    const x = R() * S, y = R() * S, a = R() * 3.14, w = 3 + R() * 7, col = leaves[(R() * leaves.length) | 0], al = 0.55 + R() * 0.4;
    wrap(c, (dx, dy) => { g.save(); g.globalAlpha = al; g.fillStyle = col; g.translate(x + dx, y + dy); g.rotate(a); g.beginPath(); g.ellipse(0, 0, w, w * 0.45, 0, 0, 6.3); g.fill(); g.restore(); });
  }
  g.strokeStyle = '#2b2116'; g.lineWidth = 1.6;
  for (let i = 0; i < 260; i++) { const x = R() * S, y = R() * S, a = R() * 3.14, l = 10 + R() * 26; wrap(c, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); }); }
  g.strokeStyle = 'rgba(170,160,110,.35)'; g.lineWidth = 1;
  for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S, a = 1.2 + R() * 0.5; wrap(c, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * 9, y + dy + Math.sin(a) * 9); g.stroke(); }); }
  const map = T(c), normal = normalOf(c, 3.2); return { map, normal };
});

/** Rough bark: vertical ridges, dark fissures, lichen patches. */
export const bark = memo(() => {
  const { c } = paint(256, 512, (u, v) => {
    const n = fbm(u * 10, v * 2.5, 10, 3, 4, 3), ridge = 1 - Math.abs(n * 2 - 1), l = fbm(u * 5, v * 4, 5, 4, 3, 21), g = Math.pow(ridge, 1.8);
    let k = mix([0.1, 0.075, 0.06], [0.42, 0.35, 0.28], g); if (l > 0.6) k = mix(k, [0.3, 0.38, 0.27], Math.min(1, (l - 0.6) * 5));
    return k as [number, number, number];
  });
  return { map: T(c), normal: normalOf(c, 4.5) };
});

/** Pine needles / canopy clumps: dense dark-green strokes. */
export const needles = memo(() => {
  const S = 256, R = rng(11), { c, g } = paint(S, S, (u, v) => { const n = fbm(u * 8, v * 8, 8, 8, 3, 5); return [0.05 + n * 0.08, 0.08 + n * 0.13, 0.05 + n * 0.06]; });
  const cols = ['#1d3a22', '#264a2b', '#13281a', '#33572f', '#0d1d12', '#3a4a22'];
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, a = 1.2 + R() * 0.7, l = 9 + R() * 14; g.strokeStyle = cols[(R() * cols.length) | 0]; g.lineWidth = 1 + R();
    wrap(c, (dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); });
  }
  return { map: T(c), normal: normalOf(c, 2.5) };
});

/** Alpha-cut ground plants: 'grass' (blade fan) or 'fern' (fronds). */
export const plant = memo(() => {
  const mk = (fern: boolean) => {
    const S = 128, R = rng(fern ? 3 : 5), { c, g } = canvas(S); g.lineCap = 'round';
    const n = fern ? 7 : 16;
    for (let i = 0; i < n; i++) {
      const a = (fern ? -1.2 + (i / (n - 1)) * 2.4 : -0.7 + R() * 1.4), len = (fern ? 0.55 : 0.5) * S * (0.6 + R() * 0.5), ox = S / 2 + (R() - 0.5) * (fern ? 4 : 30);
      const px = ox + Math.sin(a) * len, py = S - Math.cos(a) * len, cx = ox + Math.sin(a) * len * 0.3, cy = S - len * 0.7;
      g.strokeStyle = `hsl(${85 + R() * 30} ${30 + R() * 20}% ${22 + R() * 16}%)`; g.lineWidth = fern ? 2 : 2.4 - R();
      g.beginPath(); g.moveTo(ox, S); g.quadraticCurveTo(cx, cy, px, py); g.stroke();
      if (fern) for (let k = 0.2; k < 1; k += 0.1) {
        const bx = ox + (px - ox) * k, by = S + (py - S) * k, w = (1 - k) * 15 + 4; g.lineWidth = 2;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - w, by + w * 0.35); g.moveTo(bx, by); g.lineTo(bx + w, by + w * 0.35); g.stroke();
      }
    }
    const t = T(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  };
  return { grass: mk(false), fern: mk(true) };
});

/** Grime / mottled flesh / dried blood, multiplied over the vertex colours of the zombies. */
export const flesh = memo(() => {
  const S = 256, R = rng(23), { c, g } = paint(S, S, (u, v) => { const n = fbm(u * 6, v * 6, 6, 6, 4, 2), m = fbm(u * 18, v * 18, 18, 18, 3, 8), k = 0.62 + n * 0.5 - (m > 0.62 ? 0.18 : 0); return [k, k * 0.98, k * 0.94]; });
  for (let i = 0; i < 34; i++) {
    const x = R() * S, y = R() * S, w = 5 + R() * 24;
    wrap(c, (dx, dy) => { g.fillStyle = `rgba(${70 + R() * 40},${R() * 14},${R() * 14},${0.35 + R() * 0.4})`; g.beginPath(); g.ellipse(x + dx, y + dy, w, w * (0.4 + R() * 0.8), R() * 3, 0, 6.3); g.fill(); });
  }
  g.strokeStyle = 'rgba(70,40,70,.35)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { let x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 22; y += (R() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
  return { map: T(c), bump: T(c) };
});

/** Soft round glow, used for lamp halos. */
export const glow = memo(() => {
  const { c, g } = canvas(64), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.25, 'rgba(255,170,90,.45)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
});
