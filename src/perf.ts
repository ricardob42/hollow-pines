import type * as THREE from 'three';
/** Adaptive quality: lowers resolution, then horde cap, when FPS stays low for 3 s; recovers when stable. */
export class Perf {
  base = 1; pr = 1; capScale = 1;
  private acc = 0; private n = 0;
  constructor(private r: THREE.WebGLRenderer, private onChange: () => void) {}
  reset(base: number): void { this.base = base; this.pr = base; this.capScale = 1; this.acc = this.n = 0; }
  frame(dt: number): void {
    this.acc += dt; this.n++;
    if (this.acc < 3) return;
    const fps = this.n / this.acc; this.acc = this.n = 0;
    if (fps < 42) { if (this.pr > 0.6) this.pr = Math.max(0.6, this.pr - 0.2); else this.capScale = Math.max(0.4, this.capScale - 0.15); this.onChange(); }
    else if (fps > 58) { if (this.pr < this.base) { this.pr = Math.min(this.base, this.pr + 0.1); this.onChange(); } else this.capScale = Math.min(1, this.capScale + 0.05); }
  }
}
