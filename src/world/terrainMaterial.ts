/** Streamed terrain shader: biome colours, pixel detail texture array, dithered blends. */
import * as THREE from 'three';
import { U } from '../render/uniforms';
import { COMMON_PARS, FOG_FN, LIGHTING, NOISE, SKY_FN } from '../render/shaders/common';

const VERT = /* glsl */ `
${COMMON_PARS}
attribute vec4 aBiome;   // forest, moisture, autumn, ao
attribute vec3 aGrass;   // grass tint (linear)
attribute vec2 aSpecial; // special id, weight
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vBiome;
varying vec3 vGrass;
varying vec2 vSpecial;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normal;
  vBiome = aBiome; vGrass = aGrass; vSpecial = aSpecial;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp sampler2DArray;
${COMMON_PARS}
${NOISE}
${SKY_FN}
${FOG_FN}
${LIGHTING}
uniform sampler2DArray uDetail;
uniform float uTreeRadius;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vBiome;
varying vec3 vGrass;
varying vec2 vSpecial;

vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
float detail(float layer, vec2 uv){ return texture(uDetail, vec3(uv, layer)).r * 1.8; }

void main(){
  clipCheck(vWorldPos);
  vec3 P = vWorldPos;
  vec3 N = normalize(vNormal);
  float slope = 1.0 - N.y;
  float dist = length(P - uCamPos);
  float td = hash12(floor(P.xz * 8.0));           // world-space dither (stable)
  float forest = vBiome.x, moist = vBiome.y, autumn = vBiome.z, ao = vBiome.w;
  float sp = floor(vSpecial.x + 0.5), spW = vSpecial.y;
  vec2 uv = P.xz / 2.0;

  // --- meadow grass: region tint, greener where moist, golden patches where dry/autumn
  float patchN = fbm(P.xz * 0.018);
  vec3 dry = lin(vec3(0.6, 0.52, 0.27));
  vec3 grass = mix(vGrass * 1.15, dry, clamp((0.55 - moist) * 1.4 + (patchN - 0.5) * 0.6, 0.0, 0.8) * step(0.5 + 0.2 * (td - 0.5), patchN + autumn * 0.25));
  grass = mix(grass, grass * vec3(0.82, 0.95, 0.8), step(0.62, fbm(P.xz * 0.004 + 3.0) + 0.1 * (td - 0.5)));
  grass *= uSeasonTint;
  vec3 col = grass * detail(0.0, uv);
  float mat = 0.0;

  // --- forest: floor near the camera (trees stand on it), painted canopy far away
  float treeLine = smoothstep(1050.0, 750.0, P.y);
  float fMask = step(0.42 + 0.12 * (td - 0.5), forest * treeLine * (0.8 + 0.5 * fbm(P.xz * 0.01 + 5.0)));
  float canopyT = smoothstep(uTreeRadius * 0.75, uTreeRadius, dist);
  vec3 floorC = mix(lin(vec3(0.3, 0.26, 0.18)), lin(vec3(0.42, 0.3, 0.18)), autumn) * detail(autumn > 0.5 ? 7.0 : 1.0, uv);
  floorC = mix(floorC, lin(vec3(0.25, 0.36, 0.2)) * detail(6.0, uv), step(0.75, moist)); // mossy in wet forests
  // canopy: crown cells near, smooth clusters far
  float cellSize = 7.0 * exp2(floor(log2(max(1.0, dist / 180.0))));
  float ch = mix(hash12(floor(P.xz / cellSize)), vnoise(P.xz * 0.045), smoothstep(90.0, 220.0, dist));
  vec3 cPine = mix(lin(vec3(0.17, 0.25, 0.24)), lin(vec3(0.2, 0.34, 0.24)), moist);
  vec3 cPine2 = cPine * 1.25;
  vec3 crown = mix(cPine, cPine2, step(0.5, ch));
  float aut = fbm(P.xz * 0.006 + 11.0) + 0.18 * (ch - 0.5) + (autumn - 0.5) * 0.5 - smoothstep(300.0, 700.0, P.y) * 0.2;
  float pb = fbm(P.xz * 0.013 - 4.0);
  crown = aut > 0.56 ? (pb > 0.55 ? lin(vec3(0.66, 0.24, 0.17)) : lin(vec3(0.74, 0.4, 0.18))) : (aut > 0.5 ? lin(vec3(0.74, 0.57, 0.25)) : crown);
  if (sp == 5.0) crown = mix(crown, lin(vec3(0.42, 0.56, 0.26)), spW);       // bamboo: light green
  vec2 inCell = fract(P.xz / cellSize) - 0.5;
  crown *= 0.9 + 0.25 * dot(inCell, normalize(uKeyDir.xz + 1e-4)) * (1.0 - smoothstep(150.0, 400.0, dist));
  col = mix(col, mix(floorC, crown * mix(vec3(1.0), uSeasonTint, 0.6), canopyT), fMask);
  ao *= mix(1.0, 0.7, fMask * (1.0 - canopyT)); // darker under the trees

  // --- specials
  if (sp == 1.0 && spW > 0.25) { // rice terraces: golden rice in autumn, green bunds at every step
    vec3 rice = mix(lin(vec3(0.66, 0.56, 0.28)), lin(vec3(0.56, 0.5, 0.24)), step(0.5, vnoise(P.xz * 0.8)));
    float stepF = fract(P.y / 2.4);
    float bund = step(0.88, stepF) + step(0.4, slope);
    vec3 bundC = lin(vec3(0.3, 0.42, 0.2)) * detail(0.0, uv);
    // rice through the year: flooded mirrors in spring, green in summer, gold in autumn, stubble in winter
    vec3 riceS = mix(lin(vec3(0.34, 0.44, 0.46)), lin(vec3(0.42, 0.62, 0.3)), step(0.55, vnoise(P.xz * 0.6)));
    vec3 riceSeason = riceS * uSeasonW.x + lin(vec3(0.36, 0.6, 0.24)) * uSeasonW.y + rice * uSeasonW.z + lin(vec3(0.48, 0.4, 0.3)) * uSeasonW.w;
    vec3 terr = mix(riceSeason * detail(0.0, uv * 2.0), bundC, clamp(bund, 0.0, 1.0));
    col = mix(col, terr, step(0.5 + 0.2 * (td - 0.5), spW) * (1.0 - fMask));
  }
  if (sp == 6.0 && spW > 0.25) { // tea rows: round dark-green bushes in contour lines
    float row = step(0.45, fract(P.y * 0.9 + vnoise(P.xz * 0.05) * 0.5));
    vec3 tea = mix(lin(vec3(0.16, 0.34, 0.18)), lin(vec3(0.24, 0.42, 0.2)), step(0.5, vnoise(P.xz * 3.0)));
    col = mix(col, mix(lin(vec3(0.38, 0.3, 0.2)) * detail(5.0, uv), tea * detail(6.0, uv), row), step(0.5, spW));
  }
  if (sp == 4.0) { // volcanic: black sand, sulphur
    vec3 vol = mix(lin(vec3(0.16, 0.15, 0.16)), lin(vec3(0.78, 0.7, 0.24)), step(0.86, vnoise(P.xz * 0.12)));
    col = mix(col, vol * detail(4.0, uv), step(0.5 + 0.2 * (td - 0.5), spW * smoothstep(80.0, 300.0, P.y)));
  }
  if (sp == 7.0) { // marsh: reedy olive with dark wet spots
    vec3 m = mix(lin(vec3(0.42, 0.42, 0.22)), lin(vec3(0.2, 0.22, 0.16)), step(0.62, vnoise(P.xz * 0.2)));
    col = mix(col, m * detail(0.0, uv), step(0.5, spW));
  }

  // --- rock on steep slopes (tri-planar for cliffs)
  vec3 an = abs(N);
  float rk = an.x > an.z ? detail(2.0, P.zy / 2.0) : detail(2.0, P.xy / 2.0);
  rk = mix(rk, detail(2.0, uv), smoothstep(0.5, 0.8, an.y));
  vec3 rockC = (sp == 4.0 ? lin(vec3(0.24, 0.22, 0.24)) : lin(vec3(0.42, 0.41, 0.46))) * rk;
  col = mix(col, rockC, step(0.5 + 0.12 * (td - 0.5), smoothstep(0.4, 0.62, slope)));

  // --- snow high up (and in the snowy pass lower down)
  float snowLine = sp == 3.0 ? 700.0 - 200.0 * spW : 1000.0;
  float snow = step(0.5 + 0.2 * (td - 0.5), smoothstep(snowLine, snowLine + 140.0, P.y + 70.0 * (patchN - 0.5)) * (1.0 - smoothstep(0.72, 0.9, slope)));
  // seasonal / fallen snow lies on everything flat enough, in dithered drifts at its edge
  float drift = uSnowCover * smoothstep(0.55, 0.85, an.y) * step(0.3, P.y);
  snow = max(snow, step(0.5 + 0.25 * (td - 0.5) + 0.3 * (patchN - 0.5), drift * 1.15));
  col = mix(col, lin(vec3(0.74, 0.76, 0.84)) * detail(3.0, uv), snow);

  // --- shores: sand and pebbles, wet darkening just above the water; sea beaches wider
  float beach = sp == 2.0 ? 4.0 : 0.75;
  float shore = 1.0 - step(beach + 0.6 * (td - 0.5) + 0.8 * (patchN - 0.5), P.y);
  vec3 sand = (sp == 2.0 ? lin(vec3(0.62, 0.56, 0.44)) : lin(vec3(0.5, 0.44, 0.34))) * detail(4.0, uv);
  col = mix(col, sand, shore * (1.0 - snow));
  col = mix(col, col * 0.62, 1.0 - step(0.25 + 0.1 * td, P.y));
  col = mix(col, lin(vec3(0.24, 0.24, 0.22)) * detail(5.0, uv), 1.0 - step(-0.6, P.y));

  // macro variation so wide slopes never read as smooth plastic: broad light/dark patches
  float macro = fbm(P.xz * 0.03 + 7.0);
  col *= 0.86 + 0.28 * step(0.5 + 0.1 * (td - 0.5), macro) + 0.08 * (vnoise(P.xz * 0.15) - 0.5);

  // rain: everything darkens; puddles gather in flat hollows and mirror the sky
  col *= 1.0 - uWet * 0.32 * (1.0 - snow);
  float puddle = uWet * step(0.72, fbm(P.xz * 0.12 + 11.0)) * smoothstep(0.93, 0.985, an.y) * step(0.8, P.y) * (1.0 - snow);
  vec3 c = shade(col, N, P, 0.0, ao, 0.0);
  vec3 Vp = normalize(uCamPos - P);
  c = mix(c, skyColor(reflect(-Vp, vec3(0.0, 1.0, 0.0))) * 0.75, step(0.5, puddle) * 0.85);
  c = applyFog(c, P);
  gl_FragColor = vec4(c, 0.5);
}
`;

export function createTerrainMaterial(detail: THREE.DataArrayTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uSmoothLight: { value: 0.75 }, uDetail: { value: detail }, uTreeRadius: { value: 700 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  });
}
