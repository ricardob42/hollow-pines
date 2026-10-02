import type * as THREE from 'three';
/** Fully procedural WebAudio: no audio files, works offline. Positional sounds use HRTF panners. */
class Sfx {
  private ctx?: AudioContext; private master?: GainNode; private nb?: AudioBuffer; private drone?: GainNode; vol = 0.7;
  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const c = (this.ctx = new C()), m = (this.master = c.createGain()); m.gain.value = this.vol; m.connect(c.destination);
    const b = (this.nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;           // wind bed
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.12;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 0.06;
    lfo.connect(lg); lg.connect(g.gain); src.connect(lp); lp.connect(g); g.connect(m); src.start(); lfo.start();
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48;    // tension drone
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120;
    this.drone = c.createGain(); this.drone.gain.value = 0; o.connect(f); f.connect(this.drone); this.drone.connect(m); o.start();
    this.bird();
  }
  setVolume(v: number): void { this.vol = v; if (this.master) this.master.gain.value = v; }
  private bird(): void {
    setTimeout(() => {
      if (this.ctx?.state === 'running') { const f = 2200 + Math.random() * 1500; for (let k = 0; k < 2 + Math.random() * 3; k++) this.tone(f * (1 + k * 0.08), 0.09, 'sine', 0.04, f * 1.3, undefined, k * 0.12); }
      this.bird();
    }, 2500 + Math.random() * 5000);
  }
  private out(pos?: THREE.Vector3): AudioNode {
    if (!pos) return this.master!;
    const p = this.ctx!.createPanner(); p.panningModel = 'HRTF'; p.refDistance = 4; p.rolloffFactor = 1.3;
    p.positionX.value = pos.x; p.positionY.value = pos.y + 1; p.positionZ.value = pos.z; p.connect(this.master!); return p;
  }
  private tone(f: number, d: number, type: OscillatorType, v: number, to?: number, pos?: THREE.Vector3, delay = 0): void {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.out(pos)); o.start(t); o.stop(t + d + 0.02);
  }
  private noise(d: number, v: number, lp: number, hp = 0, pos?: THREE.Vector3, delay = 0): void {
    const c = this.ctx; if (!c || !this.nb) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), a = c.createBiquadFilter(), b = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nb; a.type = 'lowpass'; a.frequency.value = lp; b.type = 'highpass'; b.frequency.value = hp;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(a); a.connect(b); b.connect(g); g.connect(this.out(pos)); s.start(t, Math.random()); s.stop(t + d + 0.02);
  }
  shot(id: string): void { if (id === 'rifle') { this.noise(0.14, 0.5, 3500, 200); this.tone(110, 0.12, 'square', 0.25, 40); } else { this.noise(0.12, 0.45, 2800, 300); this.tone(160, 0.1, 'square', 0.2, 60); } }
  reload(): void { this.noise(0.04, 0.25, 4000, 1500); this.noise(0.05, 0.3, 3000, 1000, undefined, 0.6); this.noise(0.04, 0.25, 4000, 1500, undefined, 1.1); }
  swap(): void { this.noise(0.07, 0.2, 2000, 800); }
  knife(): void { this.noise(0.15, 0.25, 7000, 2500); }
  hit(pos: THREE.Vector3, head: boolean): void { this.noise(0.08, 0.3, 1200, 200, pos); this.tone(head ? 520 : 150, 0.1, 'triangle', 0.2, undefined, pos); }
  groan(pos: THREE.Vector3): void { const f = 70 + Math.random() * 30; this.tone(f, 0.9, 'sawtooth', 0.12, f * 0.6, pos); this.noise(0.7, 0.05, 500, 100, pos); }
  hurt(): void { this.tone(90, 0.25, 'sine', 0.5, 50); this.noise(0.15, 0.3, 600); }
  die(): void { this.tone(300, 1.2, 'sawtooth', 0.3, 40); }
  step(): void { this.noise(0.05, 0.12, 700, 120); }
  tick(tension: number, cam: THREE.Camera): void {
    if (!this.ctx) return;
    if (this.drone) this.drone.gain.value = tension * 0.05;
    const l = this.ctx.listener; if (!l.positionX) return;
    const p = cam.position, e = cam.matrixWorld.elements;
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10]; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  }
}
export const sfx = new Sfx();
