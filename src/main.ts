import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { CFG, QUALITY, ZOMBIES, type Q } from './config';
import { Post } from './post';
import { save, persist } from './store';
import { sfx } from './audio';
import { World, heightAt } from './world';
import { Player } from './player';
import { Input } from './input';
import { Weapons } from './weapons';
import { Zombies, Horde } from './zombies';
import { Fx } from './fx';
import { Perf } from './perf';
import { $, show, text, fmt, initGrain } from './ui';

try { registerSW({ immediate: true }); } catch (e) { console.warn('Service worker unavailable', e); }

type S = 'menu' | 'playing' | 'paused' | 'over';
const canvas = $('c') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !matchMedia('(pointer:coarse)').matches, powerPreference: 'high-performance' }); }
catch { show('fatal'); throw new Error('WebGL2 unavailable'); }
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); show('fatal'); });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = CFG.night.exposure; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1200); scene.add(camera);
const fx = new Fx(scene), weapons = new Weapons(camera, fx), world = new World(scene, weapons.torch.U), player = new Player(), horde = new Horde();
const zombies = new Zombies(scene, QUALITY.ultra.cap), post = new Post(renderer, scene, camera), perf = new Perf(renderer, () => resize());
const input = new Input(canvas, () => { if (state === 'playing') setState('paused'); });
const set = save.settings;
let state: S = 'menu', back: S = 'menu', score = 0, kills = 0, time = 0, last = performance.now(), idle = 0, beat = 0, cond = '';
const slots = Array.from($('slots').children);

function detect(): Q {
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4, cores = navigator.hardwareConcurrency ?? 4;
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software/i.test(gpu) || mem <= 2) return 'low';
  if (input.touch) return mem >= 6 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}
const auto = detect();
const quality = (): Q => (set.quality === 'auto' ? auto : set.quality);

function resize(): void {
  const w = innerWidth, h = innerHeight;
  const pr = Math.min(devicePixelRatio, perf.pr); renderer.setPixelRatio(pr); renderer.setSize(w, h, false); post.size(w, h, pr); world.setScale(h * pr * 0.5);
  camera.aspect = w / h; camera.fov = set.fov; camera.updateProjectionMatrix();
  $('rotate').classList.toggle('on', input.touch && h > w);
}
function applySettings(): void { camera.fov = set.fov; camera.updateProjectionMatrix(); input.sens = set.sens; sfx.setVolume(set.volume); }
function applyQuality(): void {
  const Qc = QUALITY[quality()]; world.build(quality()); weapons.torch.setShadow(Qc.shadow); post.setup(Qc.post, Qc.msaa);
  document.body.classList.toggle('nopost', Qc.post === 0); perf.reset(Qc.pr); resize();
}

function setState(s: S): void {
  state = s; world.setMenu(s === 'menu' || s === 'over'); show(s === 'playing' ? null : s === 'paused' ? 'pause' : s); weapons.visible(s === 'playing' || s === 'paused');
  if (s === 'playing') {
    sfx.init();
    if (input.touch) { try { void document.documentElement.requestFullscreen?.(); void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')?.catch(() => {}); } catch { /* optional */ } }
    else try { (canvas.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {}); } catch { /* retry on click */ }
  } else if (document.pointerLockElement) document.exitPointerLock();
  if (s === 'menu') applyQuality();
}
function start(): void {
  applyQuality(); player.reset(); weapons.reset(); zombies.reset(); horde.reset(); score = kills = time = beat = 0; $('boss').hidden = true; $('alert').classList.remove('on'); setState('playing');
}
function gameOver(): void {
  sfx.die(); save.bestScore = Math.max(save.bestScore, Math.floor(score)); save.bestTime = Math.max(save.bestTime, Math.floor(time)); persist();
  text('o-time', fmt(time)); text('o-kills', String(kills)); text('o-score', String(Math.floor(score))); text('o-best', String(save.bestScore));
  $('vig').style.setProperty('--v', '0'); setState('over');
}
/** Centered one-line warning (restarts its fade each time). */
function flash(t: string): void { const e = $('alert'); e.textContent = t; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
const mult = () => 1 + Math.min(3, Math.floor(time / 60) * 0.25);

weapons.onKill = (z) => {
  kills++; score += ZOMBIES[z.type].score * mult(); weapons.addAmmo(); player.hp = Math.min(CFG.player.hp, player.hp + 2);
};

function update(dt: number): void {
  time += dt; player.update(dt, input, world, camera);
  weapons.update(dt, input, player, zombies, world, camera);
  horde.capScale = perf.capScale; horde.update(dt, zombies, player.pos, camera, world, QUALITY[quality()].cap);
  zombies.update(dt, player.pos, world, (d) => player.hurt(d));
  score += dt * mult() * 2; sfx.tick(Math.min(1, zombies.alive / 40), camera);
  if (horde.note) { flash(horde.note); horde.note = null; } if (zombies.note) { flash(zombies.note); zombies.note = null; }
  const boss = zombies.boss(); $('boss').hidden = !boss; if (boss) $('bhp').style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
  const h = weapons.hud(), low = player.hp < 35 ? 0.3 + 0.15 * Math.sin(time * 6) : 0;
  text('time', fmt(time)); text('score', String(Math.floor(score))); text('kills', `${kills} kills`); text('wname', h.name); text('ammo', h.ammo);
  slots.forEach((e, i) => e.classList.toggle('on', i === h.cur)); text('fl', h.light ? 'LIGHT' : 'LIGHT OFF'); $('fl').classList.toggle('off', !h.light);
  const c = player.hp > 66 ? 'fine' : player.hp > 33 ? 'caution' : 'danger'; if (c !== cond) { cond = c; text('cond', c.toUpperCase()); $('ecg').className = c; }
  if (player.hp < 35 && time > beat) { sfx.heart(); beat = time + (player.hp < 18 ? 0.62 : 0.9); }
  $('hp').style.width = `${Math.max(0, player.hp)}%`; $('hm').style.opacity = String(weapons.hit);
  $('vig').style.setProperty('--v', String(Math.max(player.hurtT * 0.9, low)));
  if (player.hp <= 0) gameOver();
}

function tick(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; perf.frame(dt); world.uT.value = now / 1000;
  if (state === 'playing') update(dt);
  else if (state !== 'paused') {                                  // slow orbit behind the menu
    idle += dt * 0.05; camera.position.set(Math.sin(idle) * 30, heightAt(Math.sin(idle) * 30, Math.cos(idle) * 30) + 7, Math.cos(idle) * 30);
    camera.lookAt(0, 5, 0);
  }
  world.follow(state === 'playing' || state === 'paused' ? player.pos : camera.position, camera.position, now / 1000); fx.update(dt);
  const live = state === 'playing' || state === 'paused';
  post.render(dt, now / 1000, live ? player.hurtT : 0, live && player.hp < 35 ? 1 - player.hp / 35 : 0);
}

// UI wiring
const on = (id: string, f: () => void) => $(id).addEventListener('click', f);
const openSettings = (from: S) => { back = from; show('settings'); };
on('b-play', start); on('b-again', start); on('b-restart', start);
on('b-set', () => openSettings('menu')); on('b-pset', () => openSettings('paused'));
on('b-resume', () => setState('playing')); on('b-menu', () => setState('menu')); on('b-omenu', () => setState('menu'));
on('b-back', () => setState(back)); on('pausebtn', () => setState('paused'));
const q = $('s-quality') as HTMLSelectElement, fov = $('s-fov') as HTMLInputElement, sens = $('s-sens') as HTMLInputElement, vol = $('s-vol') as HTMLInputElement;
const sync = () => { q.value = set.quality; fov.value = String(set.fov); sens.value = String(set.sens); vol.value = String(set.volume); text('o-fov', `${set.fov}`); text('o-sens', set.sens.toFixed(1)); text('o-vol', `${Math.round(set.volume * 100)}%`); };
const change = () => { set.quality = q.value as Q | 'auto'; set.fov = +fov.value; set.sens = +sens.value; set.volume = +vol.value; persist(); sync(); applySettings(); };
[q, fov, sens, vol].forEach((e) => e.addEventListener('input', change));
const autoPause = () => { if (state === 'playing') setState('paused'); };
addEventListener('blur', autoPause); document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
addEventListener('resize', resize); addEventListener('orientationchange', resize);

initGrain(); sync(); applySettings(); applyQuality(); setState('menu'); renderer.setAnimationLoop(tick);
