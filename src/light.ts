import * as THREE from 'three';
import { CFG } from './config';

/** Uniforms describing the flashlight, shared with the dust / mist shaders so particles glow only inside the cone. */
export interface TorchU { pos: { value: THREE.Vector3 }; dir: { value: THREE.Vector3 }; cos: { value: number }; on: { value: number } }
export interface Shared { t: { value: number }; cam: { value: THREE.Vector3 }; scale: { value: number }; gy: { value: number } }
export const mkShared = (): Shared => ({ t: { value: 0 }, cam: { value: new THREE.Vector3() }, scale: { value: 600 }, gy: { value: 0 } });

const BEAM_V = `varying vec3 vN; varying vec3 vV; varying float vA;
void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; vA=-position.z; gl_Position=projectionMatrix*mv; }`;
const BEAM_F = `uniform vec3 uCol; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vA;
void main(){ float f=abs(dot(normalize(vN),normalize(vV))); float a=pow(f,1.6)*pow(1.-vA,1.4)*smoothstep(0.,.18,vA)*uK; gl_FragColor=vec4(uCol,a); }`;

/** A weapon-mounted flashlight: shadow-casting spot light + a faint volumetric cone seen through the fog. Child of the weapon root, so it sways and recoils with it. */
export class Torch {
  readonly spot: THREE.SpotLight; readonly beam: THREE.Mesh; on = true;
  readonly U: TorchU = { pos: { value: new THREE.Vector3() }, dir: { value: new THREE.Vector3(0, 0, -1) }, cos: { value: 0.9 }, on: { value: 1 } };
  private lvl = 1; private k = 1; private tgt = new THREE.Vector3(); private bm: THREE.ShaderMaterial;
  constructor(parent: THREE.Object3D) {
    const L = CFG.light;
    this.spot = new THREE.SpotLight(L.color, 0, L.dist, 0.36, L.penumbra, L.decay);
    this.spot.target.position.set(-0.22, 0.2, -14);            // converge on the crosshair, not parallel to the barrel
    this.bm = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(0xffe9c4) }, uK: { value: 0.1 } }, vertexShader: BEAM_V, fragmentShader: BEAM_F,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0).rotateX(Math.PI / 2), this.bm);
    this.beam.frustumCulled = false; this.beam.renderOrder = 5;
    parent.add(this.spot, this.spot.target, this.beam);
  }
  /** Move the lamp to a weapon's lens. k scales brightness, cone is the half-angle. */
  mount(p: [number, number, number], k: number, cone: number): void {
    this.k = k; this.spot.angle = cone; this.spot.position.set(...p); this.beam.position.set(...p);
    const len = 30; this.beam.scale.set(len * Math.tan(cone), len * Math.tan(cone), len); this.U.cos.value = Math.cos(cone * 0.8);
  }
  setShadow(size: number): void {
    const s = this.spot; s.castShadow = size > 0; if (!size) return;
    if (s.shadow.mapSize.x !== size) { s.shadow.mapSize.set(size, size); s.shadow.map?.dispose(); s.shadow.map = null; }
    s.shadow.camera.near = 0.3; s.shadow.camera.far = CFG.light.dist; s.shadow.bias = -0.0005; s.shadow.normalBias = 0.04; s.shadow.radius = 3;
  }
  toggle(): void { this.on = !this.on; }
  update(dt: number, t: number, hurt: number): void {
    this.lvl += ((this.on ? 1 : 0) - this.lvl) * Math.min(1, dt * 18);
    let f = 1 + Math.sin(t * 37) * 0.012; if (hurt > 0.4 && Math.random() < 0.35) f *= 0.25 + Math.random() * 0.4;   // the light stutters when you are hit
    const g = this.lvl * f;
    this.spot.intensity = CFG.light.power * this.k * g; this.bm.uniforms.uK.value = 0.11 * this.k * g; this.beam.visible = this.lvl > 0.02; this.U.on.value = g;
    this.spot.getWorldPosition(this.U.pos.value); this.spot.target.getWorldPosition(this.tgt); this.U.dir.value.copy(this.tgt).sub(this.U.pos.value).normalize();
  }
}

const P_V = `uniform float uT,uSize,uBox,uH,uScale,uGy,uCos,uOn; uniform vec3 uCam,uDrift,uLP,uLD; attribute vec3 aSeed; varying float vA; varying float vL;
void main(){
  vec3 p=aSeed*uBox+uDrift*uT; p=mod(p-uCam+uBox*.5,uBox)-uBox*.5; vec3 wp=uCam+p;
  if(uH>0.) wp.y=uGy+aSeed.y*uH+.3;
  vec3 tp=wp-uLP; float dd=length(tp)+1e-3; float c=dot(tp/dd,uLD);
  vL=smoothstep(uCos,uCos+.05,c)*exp(-dd*.045)*uOn;
  vec4 mv=viewMatrix*vec4(wp,1.); gl_Position=projectionMatrix*mv;
  vA=(.65+.35*sin(uT*2.3+aSeed.x*60.))*smoothstep(1.2,4.,-mv.z)*(1.-smoothstep(uBox*.35,uBox*.5,length(p)));
  gl_PointSize=uSize*uScale*projectionMatrix[1][1]/gl_Position.w;
}`;
const P_F = `uniform vec3 uCol; uniform float uAlpha,uLit; varying float vA; varying float vL;
void main(){ float r=length(gl_PointCoord-.5)*2.; float a=1.-smoothstep(0.,1.,r); a*=a; gl_FragColor=vec4(uCol*(1.+vL*uLit),a*vA*uAlpha*(.25+vL*uLit*.6)); }`;
export interface POpts { size: number; alpha: number; box: number; h: number; color: number; lit: number; drift: [number, number, number]; additive: boolean }

/** GPU-animated particle volume around the player (no per-frame CPU work). Used for dust motes in the beam (h = 0) and low ground mist (h > 0). */
export class Particles extends THREE.Points {
  constructor(n: number, o: POpts, sh: Shared, U: TorchU) {
    const g = new THREE.BufferGeometry(), seed = new Float32Array(n * 3); for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const m = new THREE.ShaderMaterial({ vertexShader: P_V, fragmentShader: P_F, transparent: true, depthWrite: false, fog: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uT: sh.t, uCam: sh.cam, uScale: sh.scale, uGy: sh.gy, uSize: { value: o.size }, uBox: { value: o.box }, uH: { value: o.h }, uAlpha: { value: o.alpha },
        uLit: { value: o.lit }, uCol: { value: new THREE.Color(o.color) }, uDrift: { value: new THREE.Vector3(...o.drift) }, uLP: U.pos, uLD: U.dir, uCos: U.cos, uOn: U.on } });
    super(g, m); this.frustumCulled = false; this.renderOrder = 4;
  }
}
