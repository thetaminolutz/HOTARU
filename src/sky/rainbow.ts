/** A rainbow across the sky after rain (SPEC §12): an arc of 42° around the antisolar point. */
import * as THREE from 'three';

const FRAG = /* glsl */ `
uniform float uShow;
varying vec2 vUv;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float band = (r - 0.86) / 0.1;
  if (band < 0.0 || band > 1.0) discard;
  vec3 c = band < 0.17 ? vec3(0.55, 0.25, 0.85) : band < 0.33 ? vec3(0.25, 0.4, 1.0) : band < 0.5 ? vec3(0.25, 0.9, 0.45) : band < 0.67 ? vec3(1.0, 0.95, 0.3) : band < 0.84 ? vec3(1.0, 0.6, 0.15) : vec3(1.0, 0.25, 0.2);
  float a = uShow * 0.42 * sin(band * 3.14159);
  if (a < bayer4(gl_FragCoord.xy)) discard;
  gl_FragColor = vec4(c * 1.2, 0.5);
}
`;

export class SkyRainbow {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uShow: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FRAG, depthWrite: false, side: THREE.DoubleSide,
    });
    // 42° radius at 3 km: the quad spans ±tan(42°)/0.86 of the distance
    const D = 3000, half = (D * Math.tan((42 * Math.PI) / 180)) / 0.86 * 1.04;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), this.mat);
    this.mesh.userData.distance = D;
    this.mesh.userData.noReflect = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
  }
  update(cam: THREE.Vector3, sunDir: THREE.Vector3, amount: number): void {
    const show = amount * Math.min(1, Math.max(0, sunDir.y * 4)) * (sunDir.y < 0.75 ? 1 : 0);
    this.mesh.visible = show > 0.02;
    if (!this.mesh.visible) return;
    this.mat.uniforms.uShow!.value = show;
    const anti = sunDir.clone().negate();
    this.mesh.position.copy(cam).addScaledVector(anti, this.mesh.userData.distance as number);
    this.mesh.lookAt(cam);
  }
}
