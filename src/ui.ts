export const $ = (id: string) => document.getElementById(id) as HTMLElement;
const SCREENS = ['menu', 'settings', 'pause', 'over', 'fatal'];

/** Show one menu screen, or null to show the in-game HUD only. */
export function show(name: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle('on', s === name);
  $('hud').hidden = !(name === null || name === 'pause');
}
export function text(id: string, v: string): void { const e = $(id); if (e.textContent !== v) e.textContent = v; }
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Film grain tile for the CSS overlay: generated once, no asset file. */
export function initGrain(): void {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'); if (!g) return;
  const im = g.createImageData(160, 160); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); document.documentElement.style.setProperty('--noise', `url(${c.toDataURL()})`);
}
