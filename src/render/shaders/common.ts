/** GLSL chunks shared by all world shaders. */
import { MAX_LIGHTS } from '../uniforms';

export const COMMON_PARS = /* glsl */ `
#define MAX_LIGHTS ${MAX_LIGHTS}
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uShadowTint;
uniform vec3 uRim;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uFog;
uniform float uHeightFog;
uniform vec4 uClipPlane;
uniform vec4 uWind;
uniform float uBands;
uniform float uLamps;
uniform float uReflectPass;
uniform float uPixelAngle;
`;

/** Hash / value noise usable in both stages. */
export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
`;

/** Wind: travelling gusts along the wind direction. */
export const WIND = /* glsl */ `
float gust(vec2 xz){
  vec2 d = normalize(uWind.xy);
  float along = dot(xz, d);
  float g = sin(along*0.045 - uTime*1.3) * 0.5 + 0.5;
  g *= sin(dot(xz, vec2(-d.y, d.x))*0.03 + uTime*0.4) * 0.3 + 0.7;
  return uWind.z * (0.55 + uWind.w * g);
}
`;

export const SKY_FN = /* glsl */ `
vec3 skyColor(vec3 d){
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 c = mix(uHorizon, uZenith, t);
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 9.0) * 0.45 + pow(sd, 64.0) * 0.8) * (1.0 - t * 0.7);
  if (h < 0.0) c = mix(c, uHorizon * 0.85, clamp(-h * 3.0, 0.0, 1.0));
  return c;
}
`;

export const FOG_FN = /* glsl */ `
vec3 applyFog(vec3 col, vec3 P){
  vec3 D = P - uCamPos;
  float d = length(D);
  // fog thins with altitude: integrate an exponential height profile along the ray
  float hAvg = max(0.5 * (uCamPos.y + P.y), 0.0);
  float f = 1.0 - exp(-d * uFog * exp(-hAvg / 700.0));
  float hf = uHeightFog * exp(-max(P.y, 0.0) * 0.05) * (1.0 - exp(-d * 0.002));
  f = clamp(f + hf * 0.3, 0.0, 0.92);
  vec3 dir = D / max(d, 1e-3);
  // aerial perspective tends to the sky colour a little above the horizon: blue-lavender
  // layers instead of the warm horizon glow (reference 2's mountain blue)
  vec3 fc = mix(skyColor(normalize(vec3(dir.x, 0.1 + max(dir.y, 0.0) * 0.3, dir.z))), uZenith, 0.3);
  return mix(col, fc, f);
}
`;

export const LIGHTING = /* glsl */ `
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform vec4 uLightPos[MAX_LIGHTS];
uniform vec4 uLightCol[MAX_LIGHTS];
uniform int uLightCount;
uniform float uSmoothLight;
uniform float uCloudCover;

/** Moving cloud shadows: a cloud layer ~600 m up, projected along the light. */
float cloudShadow(vec3 P){
  if (uCloudCover < 0.01) return 1.0;
  vec2 q = (P.xz + uKeyDir.xz / max(uKeyDir.y, 0.2) * (600.0 - P.y)) * 0.0014 + uTime * vec2(0.0035, 0.0012);
  float c = fbm(q) + 0.25 * vnoise(q * 4.0);
  return mix(1.0, 0.42, step(0.92 - 0.42 * uCloudCover, c));
}

/** Soft-edged banded ramp: light falls in painterly steps. */
float band(float x, float n){
  float s = clamp(x, 0.0, 1.0) * n;
  float f = fract(s);
  return (floor(s) + smoothstep(0.38, 0.62, f)) / n;
}

float shadowAt(vec3 P, vec3 N){
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMatrix * vec4(P + N * 0.06, 1.0);
  vec3 s = sp.xyz / sp.w;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float d = texture2D(uShadowMap, s.xy).r;
  return s.z - 0.0015 > d ? 0.0 : 1.0;
}

vec3 pointLights(vec3 P, vec3 N, float wrap){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 L = uLightPos[i].xyz - P;
    float r = uLightPos[i].w;
    float d = length(L);
    if (d > r) continue;
    L /= d;
    float att = 1.0 - d / r;
    att = att * att;
    float nl = max(dot(N, L) * (1.0 - wrap) + wrap, 0.0);
    acc += uLightCol[i].rgb * uLightCol[i].a * band(att * (0.35 + 0.65 * nl), 5.0);
  }
  return acc;
}

/**
 * Stylised surface shading. sss: how much light shines through when backlit (leaves, paper).
 * ao: baked occlusion. wrap: light wrap for soft volumes like foliage.
 */
vec3 shade(vec3 albedo, vec3 N, vec3 P, float sss, float ao, float wrap){
  vec3 V = normalize(uCamPos - P);
  float ndl = dot(N, uKeyDir) * (1.0 - wrap) + wrap;
  float sh = shadowAt(P, N) * cloudShadow(P);
  float lit = mix(band(ndl, uBands), clamp(ndl, 0.0, 1.0), uSmoothLight) * sh;
  vec3 hemi = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 amb = (hemi + uShadowTint * (1.0 - lit) * 0.5) * ao;
  vec3 direct = uKeyColor * lit;
  float back = pow(max(dot(-V, uKeyDir), 0.0), 3.0) * sss * sh;
  direct += uKeyColor * albedo * back * 1.5;
  float rimF = pow(1.0 - max(dot(N, V), 0.0), 3.0) * smoothstep(-0.3, 0.7, dot(-V, uKeyDir)) * sh;
  vec3 pl = pointLights(P, N, wrap) * uLamps;
  return albedo * (amb + direct + pl) + uRim * rimF * (albedo + 0.15);
}

void clipCheck(vec3 P){ if (dot(vec4(P, 1.0), uClipPlane) < 0.0) discard; }
`;
