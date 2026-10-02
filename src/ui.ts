export const $ = (id: string) => document.getElementById(id) as HTMLElement;
const SCREENS = ['menu', 'settings', 'pause', 'over', 'fatal'];

/** Show one menu screen, or null to show the in-game HUD only. */
export function show(name: string | null): void {
  for (const s of SCREENS) $(s).classList.toggle('on', s === name);
  $('hud').hidden = !(name === null || name === 'pause');
}
export function text(id: string, v: string): void { const e = $(id); if (e.textContent !== v) e.textContent = v; }
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
