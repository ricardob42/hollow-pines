import type { Q } from './config';
export interface Settings { quality: Q | 'auto'; fov: number; sens: number; volume: number }
const KEY = 'hollow-pines:v1';
const def = { settings: { quality: 'auto', fov: 75, sens: 1, volume: 0.7 } as Settings, bestScore: 0, bestTime: 0 };

function load(): typeof def {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...def, ...p, settings: { ...def.settings, ...(p.settings || {}) } };
  } catch { return { ...def, settings: { ...def.settings } }; }
}
export const save = load();
export function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable: keep playing */ }
}
