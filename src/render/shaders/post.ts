/** Full-screen post passes (SPEC §3.4, §3.5, §3.12). */

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Bright pass + first downsample (13-tap-ish box) */
export const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
vec3 pick(vec2 uv){
  vec3 c = texture2D(uSrc, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = clamp((l - uThreshold) / max(l, 1e-4), 0.0, 1.0);
  return c * k;
}
void main(){
  vec3 c = pick(vUv) * 0.5;
  c += pick(vUv + vec2(-1.0, -1.0) * uTexel) * 0.125;
  c += pick(vUv + vec2( 1.0, -1.0) * uTexel) * 0.125;
  c += pick(vUv + vec2(-1.0,  1.0) * uTexel) * 0.125;
  c += pick(vUv + vec2( 1.0,  1.0) * uTexel) * 0.125;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Dual-Kawase down / up. */
export const DOWN_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(uSrc, vUv).rgb * 4.0;
  c += texture2D(uSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

export const UP_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform sampler2D uAdd;
uniform vec2 uTexel;
varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += texture2D(uSrc, vUv + vec2(-2.0, 0.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2( 2.0, 0.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2(0.0, -2.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2(0.0,  2.0) * uTexel).rgb;
  c += texture2D(uSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb * 2.0;
  c += texture2D(uSrc, vUv + vec2( 1.0, -1.0) * uTexel).rgb * 2.0;
  c += texture2D(uSrc, vUv + vec2(-1.0,  1.0) * uTexel).rgb * 2.0;
  c += texture2D(uSrc, vUv + vec2( 1.0,  1.0) * uTexel).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(uAdd, vUv).rgb, 1.0);
}
`;

/** Bloom add → exposure → filmic tonemap → grade (lift/gain/saturation) → sRGB. */
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomI;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
uniform float uGrade;
varying vec2 vUv;
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
void main(){
  vec4 s = texture2D(uScene, vUv);
  vec3 hdr = s.rgb + texture2D(uBloom, vUv).rgb * uBloomI;
  vec3 c = aces(hdr * uExposure);
  if (uGrade > 0.5) {
    c = c * uGain + uLift * (1.0 - c) * 0.9;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
  }
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(c, s.a);
}
`;

/**
 * Pixel-art pass: outlines (darker shade of the surface), vignette, palette quantization
 * via 3D LUT with ordered dither between the two nearest palette colours.
 */
export const PIXEL_FRAG = /* glsl */ `
precision highp sampler3D;
uniform sampler2D uSrc;
uniform sampler2D uDepth;
uniform sampler3D uLut;
uniform sampler2D uPalette;
uniform vec2 uTexel;
uniform float uLutSize;
uniform float uPaletteSize;
uniform float uQuantize;
uniform float uDither;
uniform float uOutline;
uniform float uVignette;
uniform vec2 uDitherOffset;
uniform vec2 uNearFar;
uniform vec2 uSize;
varying vec2 vUv;

float linDepth(vec2 uv){
  float z = texture2D(uDepth, uv).r * 2.0 - 1.0;
  float n = uNearFar.x, f = uNearFar.y;
  return 2.0 * n * f / (f + n - z * (f - n));
}

float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  // 4×4 Bayer matrix / 16
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
  m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}

void main(){
  vec4 s = texture2D(uSrc, vUv);
  vec3 c = s.rgb;
  float flag = s.a;

  if (uOutline > 0.0 && flag > 0.75) {
    float d = linDepth(vUv);
    float far = 0.0;
    far = max(far, step(d * 1.12 + 0.35, linDepth(vUv + vec2(uTexel.x, 0.0))));
    far = max(far, step(d * 1.12 + 0.35, linDepth(vUv - vec2(uTexel.x, 0.0))));
    far = max(far, step(d * 1.12 + 0.35, linDepth(vUv + vec2(0.0, uTexel.y))));
    far = max(far, step(d * 1.12 + 0.35, linDepth(vUv - vec2(0.0, uTexel.y))));
    // darker, slightly cooler shade of the same surface — never black
    vec3 dark = c * vec3(0.52, 0.5, 0.62);
    c = mix(c, dark, far * uOutline);
  }

  if (uVignette > 0.0) {
    vec2 q = vUv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(q * vec2(1.0, 0.8)));
  }

  if (uQuantize > 0.5) {
    vec3 lc = clamp(c, 0.0, 1.0) * (uLutSize - 1.0);
    vec3 luv = (floor(lc + 0.5) + 0.5) / uLutSize;
    vec4 e = texture(uLut, luv);
    float i1 = floor(e.r * 255.0 + 0.5), i2 = floor(e.g * 255.0 + 0.5), t = e.b;
    // stronger dither on sky & smooth gradients (flag 0), weaker on textured surfaces
    float strength = uDither * (flag < 0.25 ? 1.0 : 0.7);
    float th = bayer4(gl_FragCoord.xy + uDitherOffset);
    float idx = (t * strength * 1.0 > th && t > 0.12) ? i2 : i1;
    c = texture2D(uPalette, vec2((idx + 0.5) / uPaletteSize, 0.5)).rgb;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

/** Nearest-neighbour integer upscale with sub-pixel image shift (smooth pixel camera). */
export const UPSCALE_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uSrcSize;
uniform float uScale;
uniform vec2 uShift;
uniform vec2 uBase;
varying vec2 vUv;
void main(){
  vec2 p = gl_FragCoord.xy / uScale + uBase - uShift;
  gl_FragColor = vec4(texture2D(uSrc, (floor(p) + 0.5) / uSrcSize).rgb, 1.0);
}
`;
