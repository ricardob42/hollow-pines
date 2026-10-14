import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Final grade (after tone mapping): desaturated sickly green, warm highlights where the flashlight hits, vignette, film grain, edge aberration, pain tint. */
const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uT: { value: 0 }, uHurt: { value: 0 }, uLow: { value: 0 }, uAsp: { value: 1.7 }, uGrain: { value: 0.06 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uHurt,uLow,uAsp,uGrain; varying vec2 vUv;
  float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
  void main(){
    vec2 c=vUv-.5, a=c*vec2(uAsp,1.); float r=length(a);
    vec2 off=c*r*r*.014;
    vec3 col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
    float l=dot(col,vec3(.299,.587,.114));
    col=mix(vec3(l),col,.5-.32*uLow);
    col*=vec3(.93,1.02,.94);
    col=mix(col,col*vec3(1.12,.97,.82),clamp(l*1.6,0.,1.)*.4);
    col=(col-.5)*1.1+.5;
    col*=1.-smoothstep(.3,.95,r)*.78;
    col+=(h(vUv*vec2(1731.,977.)+fract(uT)*61.)-.5)*uGrain*(1.2-l);
    col=mix(col,vec3(col.r+.3,col.g*.45,col.b*.45),uHurt*.55);
    gl_FragColor=vec4(max(col,0.),1.);
  }`,
};

/** Optional post stack. level 0: render straight to the screen (low-end). 1: grade only. 2: bloom + grade. */
export class Post {
  level = 0; private ms = -1; private cmp?: EffectComposer; private grade?: ShaderPass; private bloom?: UnrealBloomPass; private w = 1; private h = 1; private pr = 1;
  constructor(private r: THREE.WebGLRenderer, private scene: THREE.Scene, private cam: THREE.Camera) {}
  setup(level: number, msaa: number): void {
    if (this.level === level && this.ms === msaa && (this.cmp || !level)) return;
    this.dispose(); this.level = level; this.ms = msaa; if (!level) return;
    const rt = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, samples: msaa });
    const c = (this.cmp = new EffectComposer(this.r, rt));
    c.addPass(new RenderPass(this.scene, this.cam));
    if (level >= 2) { this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.5, 0.65, 0.85); c.addPass(this.bloom); }
    c.addPass(new OutputPass()); c.addPass((this.grade = new ShaderPass(GRADE)));
    c.setPixelRatio(this.pr); c.setSize(this.w, this.h);
  }
  size(w: number, h: number, pr: number): void { this.w = w; this.h = h; this.pr = pr; this.cmp?.setPixelRatio(pr); this.cmp?.setSize(w, h); if (this.grade) this.grade.uniforms.uAsp.value = w / h; }
  /** hurt 0..1 = red flash, low 0..1 = extra desaturation when near death. */
  render(dt: number, t: number, hurt: number, low: number): void {
    if (!this.cmp || !this.grade) { this.r.render(this.scene, this.cam); return; }
    const u = this.grade.uniforms; u.uT.value = t; u.uHurt.value = hurt; u.uLow.value = low;
    this.cmp.render(dt);
  }
  private dispose(): void { this.cmp?.dispose(); this.bloom?.dispose(); this.cmp = this.grade = this.bloom = undefined; }
}
