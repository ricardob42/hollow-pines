import { $ } from './ui';
/** Keyboard/mouse (pointer lock) + touch (virtual joystick, look drag, buttons). Auto-detects touch devices. */
export class Input {
  keys = new Set<string>(); look = { x: 0, y: 0 }; fire = false; jump = false; reload = false; light = false;
  swap = -1; /* -1 none, 0..2 weapon, -2 cycle */ sens = 1; locked = false;
  touch = matchMedia('(pointer:coarse)').matches;
  private st = { x: 0, y: 0 }; private tc = false;
  constructor(canvas: HTMLElement, onUnlock: () => void) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return; this.keys.add(e.code);
      if (e.code === 'KeyR') this.reload = true; if (e.code === 'KeyF') this.light = true; if (e.code === 'Space') this.jump = true;
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (n >= 0) this.swap = n;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => { if (this.locked) { this.look.x += e.movementX * 0.0022 * this.sens; this.look.y += e.movementY * 0.0022 * this.sens; } });
    addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.fire = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) { this.fire = false; onUnlock(); }
    });
    if (this.touch) this.bindTouch();
  }
  get crouch(): boolean { return this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.tc; }
  get sprint(): boolean { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.st.x, this.st.y) > 0.92; }
  axes(): { x: number; y: number } {
    const k = this.keys;
    let x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.st.x, y = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + this.st.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } return { x, y };
  }
  private bindTouch(): void {
    $('touch').hidden = false;
    const sz = $('stickzone'), kn = $('knob'); let id = -1, ox = 0, oy = 0;
    const mv = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = (e.clientX - ox) / 50, dy = (e.clientY - oy) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.st.x = dx; this.st.y = -dy; kn.style.transform = `translate(${dx * 50}px,${dy * 50}px)`;
    };
    const up = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; this.st.x = this.st.y = 0; kn.style.transform = ''; };
    sz.addEventListener('pointerdown', (e) => { id = e.pointerId; sz.setPointerCapture(id); const r = sz.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; mv(e); });
    sz.addEventListener('pointermove', mv); sz.addEventListener('pointerup', up); sz.addEventListener('pointercancel', up);
    const lz = $('lookzone'); let lid = -1, px = 0, py = 0;
    lz.addEventListener('pointerdown', (e) => { lid = e.pointerId; lz.setPointerCapture(lid); px = e.clientX; py = e.clientY; });
    lz.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; this.look.x += (e.clientX - px) * 0.005 * this.sens; this.look.y += (e.clientY - py) * 0.005 * this.sens; px = e.clientX; py = e.clientY; });
    lz.addEventListener('pointerup', (e) => { if (e.pointerId === lid) lid = -1; });
    document.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
      const a = b.dataset.act!;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (a === 'fire') this.fire = true; else if (a === 'jump') this.jump = true; else if (a === 'reload') this.reload = true;
        else if (a === 'swap') this.swap = -2; else if (a === 'light') this.light = true; else if (a === 'crouch') { this.tc = !this.tc; b.classList.toggle('on', this.tc); }
      });
      const off = () => { if (a === 'fire') this.fire = false; };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    });
  }
}
