// Open ocean: a wind sea and swell built from a fixed bank of Gerstner waves whose amplitudes follow
// the wind (Pierson-Moskowitz), whitecaps, rain on the surface and ripples from paddle strokes.
import * as THREE from 'three';
import { SKY_GLSL, LAYER_NEAR } from './sky.js';

const G = 9.81;
const WIND_L = [1.9, 3.2, 5.2, 8.5, 14, 23, 37, 60, 95];
const WIND_OFF = [35, -40, 25, -15, 10, -5, 0, 12, -8];
const SWELL_L = [210, 140, 165];
const N_WAVES = WIND_L.length + SWELL_L.length;
const DEG = Math.PI / 180;

function buildGeometry() {
  const seg = 320, rings = 230, r0 = 0.3, rMax = 8800;
  const k = Math.pow(rMax / r0, 1 / (rings - 1));
  const pos = [0, 0, 0];
  for (let j = 0; j < rings; j++) {
    const r = r0 * Math.pow(k, j);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = 1 + j * seg + i, b = 1 + j * seg + ((i + 1) % seg);
      const c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function detailNormals(renderer) {
  const N = 256;
  const h = new Float32Array(N * N);
  let seed = 1234567;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const waves = [];
  for (let i = 0; i < 34; i++) {
    const spread = 2 + i * 0.9;
    const kx = Math.round((rand() * 2 - 1) * spread), ky = Math.round((rand() * 2 - 1) * spread);
    if (kx === 0 && ky === 0) continue;
    waves.push([kx, ky, rand() * Math.PI * 2, 1 / Math.hypot(kx, ky)]);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [kx, ky, ph, amp] of waves) v += amp * Math.sin((2 * Math.PI * (kx * x + ky * y)) / N + ph);
    h[y * N + x] = v;
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const xl = h[y * N + ((x - 1 + N) % N)], xr = h[y * N + ((x + 1) % N)];
    const yd = h[((y - 1 + N) % N) * N + x], yu = h[((y + 1) % N) * N + x];
    let nx = -(xr - xl) * 3.75, ny = -(yu - yd) * 3.75, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const o = (y * N + x) * 4;
    data[o] = (nx / len * 0.5 + 0.5) * 255;
    data[o + 1] = (ny / len * 0.5 + 0.5) * 255;
    data[o + 2] = (nz / len * 0.5 + 0.5) * 255;
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

const WAVE_GLSL = /* glsl */`
  #define NW ${N_WAVES}
  uniform vec4 uWaves[NW];
  float waveFade(float L, float dist) { return 1.0 - smoothstep(L * 15.0, L * 60.0, dist); }
`;

export function createOcean(renderer, scene, skyUniforms) {
  const waves = Array.from({ length: N_WAVES }, () => new THREE.Vector4(1, 0, 10, 0));
  const ripples = Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, -1000, 0));
  let rippleNext = 0;

  const uniforms = Object.assign({}, skyUniforms, {
    uWaves: { value: waves },
    uRipples: { value: ripples },
    tDetail: { value: detailNormals(renderer) },
    uBody: { value: new THREE.Vector3(0.03, 0.08, 0.1) },
    uFog: { value: new THREE.Vector3() },
    uVis: { value: 30000 },
    uWind: { value: 5 },
    uWhitecap: { value: 0 },
    uRain: { value: 0 },
    uHsWind: { value: 0.5 },
    uWaveT: { value: 0 }
  });

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: WAVE_GLSL + /* glsl */`
      uniform float uWaveT;
      varying vec3 vWorld;
      varying vec2 vBase;
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 base = wp.xz;
        float dist = length(base - cameraPosition.xz);
        vec3 disp = vec3(0.0);
        for (int i = 0; i < NW; i++) {
          vec4 w = uWaves[i];
          if (w.w < 1e-4) continue;
          float k = 6.2831853 / w.z;
          float c = sqrt(9.81 / k);
          float ph = k * (dot(w.xy, base) - c * uWaveT);
          float A = w.w * waveFade(w.z, dist);
          float Q = min(0.85 / (k * max(w.w, 1e-4) * float(NW)), 1.0);
          disp.xz += Q * A * w.xy * cos(ph);
          disp.y += A * sin(ph);
        }
        wp.xyz += disp;
        vWorld = wp.xyz;
        vBase = base;
        vH = disp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: SKY_GLSL + WAVE_GLSL + /* glsl */`
      uniform sampler2D tDetail;
      uniform vec4 uRipples[24];
      uniform vec3 uBody;
      uniform vec3 uFog;
      uniform float uVis;
      uniform float uWind;
      uniform float uWhitecap;
      uniform float uRain;
      uniform float uHsWind;
      uniform float uWaveT;
      varying vec3 vWorld;
      varying vec2 vBase;
      varying float vH;

      vec2 slopeAt(vec2 uv) {
        vec3 n = texture2D(tDetail, uv).xyz * 2.0 - 1.0;
        return n.xy / max(n.z, 0.2);
      }

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;

        vec3 N = vec3(0.0, 1.0, 0.0);
        for (int i = 0; i < NW; i++) {
          vec4 w = uWaves[i];
          if (w.w < 1e-4) continue;
          float k = 6.2831853 / w.z;
          float c = sqrt(9.81 / k);
          float ph = k * (dot(w.xy, vBase) - c * uWaveT);
          float WA = k * w.w * waveFade(w.z, dist);
          float Q = min(0.85 / (k * max(w.w, 1e-4) * float(NW)), 1.0);
          N.x -= w.x * WA * cos(ph);
          N.z -= w.y * WA * cos(ph);
          N.y -= Q * WA * sin(ph);
        }

        float t = uTime;
        float windK = clamp(uWind / 8.0, 0.15, 1.6);
        vec2 s1 = slopeAt(vBase / 1.3 + vec2(t * 0.05, t * 0.031));
        vec2 s2 = slopeAt(vBase / 4.6 + vec2(-t * 0.021, t * 0.04));
        vec2 s3 = slopeAt(vBase / 29.0 + vec2(t * 0.007, -t * 0.004));
        float near = 1.0 - smoothstep(30.0, 400.0, dist);
        vec2 slope = (s1 * 0.07 * near + s2 * 0.09 + s3 * 0.12) * windK;
        float gust = smoothstep(0.32, 0.78, fbm(vBase / 70.0 + vec2(t * 0.012, -t * 0.007), 3));
        slope *= mix(0.55, 1.3, gust) * mix(1.0, 0.8, smoothstep(80.0, 3000.0, dist));

        // Raindrops pock the surface
        if (uRain > 0.01) {
          vec2 rr = vec2(fbm(vBase * 3.1 + t * 7.0, 2), fbm(vBase * 3.1 - t * 6.0 + 9.0, 2)) - 0.5;
          slope += rr * 0.35 * uRain * near;
        }

        // Paddle and wake ripples
        vec2 rg = vec2(0.0);
        float rippleFade = 1.0 - smoothstep(25.0, 70.0, dist);
        if (rippleFade > 0.0) {
          for (int i = 0; i < 24; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age < 0.0 || age > 8.0) continue;
            vec2 dv = vBase - rp.xy;
            float d = length(dv);
            float front = 0.9 * age + 0.04;
            float wdt = 0.16 + 0.32 * age;
            float x = d - front;
            if (x > wdt * 2.5 || x < -wdt * 3.2) continue;
            float env = exp(-x * x / (wdt * wdt));
            float k = 12.0 / (1.0 + age * 0.3);
            float amp = rp.w * exp(-age * 0.45) / (1.0 + d * 0.6);
            float dh = amp * env * (k * cos(k * x) - sin(k * x) * 2.0 * x / (wdt * wdt));
            if (d > 1e-3) rg += dv / d * dh;
          }
        }
        N = normalize(N + vec3(slope.x, 0.0, slope.y) - vec3(rg.x, 0.0, rg.y) * rippleFade);

        float NdV = max(dot(N, V), 0.0);
        vec3 R = reflect(-V, N);
        if (R.y < 0.0) R.y = -R.y * 0.5;
        R = normalize(R);
        vec3 refl = skyColor(R, 0.55);
        float moonUp = smoothstep(-0.03, 0.03, uMoonDir.y);
        refl += vec3(0.85, 0.88, 0.95) * pow(max(dot(R, uMoonDir), 0.0), 900.0) * 2.2 * uMoonLight * moonUp;
        float sunUp = smoothstep(-0.03, 0.05, uSunDir.y);
        refl += uSunCol * pow(max(dot(R, uSunDir), 0.0), 2200.0) * 5.0 * sunUp * (1.0 - uDarkness * 0.85);

        float F = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);

        vec3 L = uSunDir;
        float lightAmt = sunUp * clamp(L.y * 3.0 + 0.2, 0.0, 1.0) * (1.0 - 0.6 * uDarkness);
        vec3 body = uBody * (0.75 + 0.35 * max(dot(N, normalize(vec3(L.x, max(L.y, 0.05), L.z))), 0.0));
        float facing = 0.0;
        if (length(L.xz) > 1e-4) facing = max(dot(normalize(-V.xz), normalize(L.xz)), 0.0);
        float sss = pow(facing, 3.0) * clamp(vH / max(uHsWind, 0.3) * 1.5 + 0.35, 0.0, 1.0) * lightAmt;
        body += vec3(0.04, 0.19, 0.18) * sss * 0.7 * (1.0 - smoothstep(100.0, 1500.0, dist));

        vec3 col = mix(body, refl, F);

        // Whitecaps on the crests in a fresh breeze
        if (uWhitecap > 0.001) {
          float crest = smoothstep(0.15, 0.75, vH / max(uHsWind * 0.5, 0.05));
          float br = fbm(vBase / 6.0 + vec2(t * 0.15, t * 0.08), 4);
          float foam = crest * smoothstep(1.0 - uWhitecap * 1.6, 1.0 - uWhitecap * 0.6, br) * (1.0 - smoothstep(600.0, 4000.0, dist));
          vec3 foamCol = (uHor * 0.6 + uZen * 0.3 + uSunCol * 0.35 * lightAmt) * 1.15;
          col = mix(col, foamCol, clamp(foam, 0.0, 0.9));
        }

        float fogF = 1.0 - exp(-dist / uVis);
        col = mix(col, uFog, fogF);
        gl_FragColor = vec4(col, 1.0);
      }`
  });

  const mesh = new THREE.Mesh(buildGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.layers.set(LAYER_NEAR);
  scene.add(mesh);

  let hsWind = 0.3, swellH = 1, windDir = 0, swellDir = 0;

  /** Set the sea state from wind (m/s, direction the wind blows toward, radians) and swell. */
  function setSea(windSpeed, windToRad, swellHs, swellToRad, whitecap, rain) {
    const U = Math.max(0.5, windSpeed);
    const Lp = Math.max(2.2, 0.833 * U * U);
    hsWind = Math.min(6.5, 0.016 * U * U);
    swellH = swellHs;
    windDir = windToRad;
    swellDir = swellToRad;
    const a = WIND_L.map((L) => L * Math.exp(-0.625 * (L / Lp) ** 2) * (L <= Lp * 1.6 ? 1 : 0.4));
    const s2 = a.reduce((m, v) => m + v * v, 0);
    const scale = s2 > 0 ? (hsWind / 2.83) / Math.sqrt(s2) : 0;
    WIND_L.forEach((L, i) => {
      const ang = windToRad + WIND_OFF[i] * DEG;
      waves[i].set(Math.sin(ang), -Math.cos(ang), L, a[i] * scale);
    });
    const sw = [0.82, 0.45, 0.3];
    const sn = Math.hypot(...sw);
    SWELL_L.forEach((L, j) => {
      const ang = swellToRad + (j === 1 ? 9 : j === 2 ? 65 : 0) * DEG;
      waves[WIND_L.length + j].set(Math.sin(ang), -Math.cos(ang), L, ((swellHs / 2.83) * sw[j]) / sn);
    });
    uniforms.uWind.value = U;
    uniforms.uHsWind.value = hsWind;
    uniforms.uWhitecap.value = whitecap;
    uniforms.uRain.value = rain;
  }

  /** Surface height and slope at a world point (for the canoe). */
  function raw(x, z, t, out) {
    let h = 0, sx = 0, sz = 0, dx = 0, dz = 0;
    for (const w of waves) {
      if (w.w < 1e-4) continue;
      const k = (2 * Math.PI) / w.z;
      const c = Math.sqrt(G / k);
      const ph = k * (w.x * x + w.y * z - c * t);
      const Q = Math.min(0.85 / (k * Math.max(w.w, 1e-4) * N_WAVES), 1);
      const cs = Math.cos(ph);
      h += w.w * Math.sin(ph);
      dx += Q * w.w * w.x * cs;
      dz += Q * w.w * w.y * cs;
      const d = k * w.w * cs;
      sx += w.x * d;
      sz += w.y * d;
    }
    out.h = h; out.sx = sx; out.sz = sz; out.dx = dx; out.dz = dz;
    return out;
  }
  const tmpS = {};
  /** Surface height and slope at a world point, undoing the Gerstner drift of the crests. */
  function sample(x, z, t, out = {}) {
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) {
      raw(px, pz, t, tmpS);
      px = x - tmpS.dx;
      pz = z - tmpS.dz;
    }
    return raw(px, pz, t, out);
  }

  function addRipple(x, z, t, strength) {
    ripples[rippleNext].set(x, z, t, strength);
    rippleNext = (rippleNext + 1) % ripples.length;
  }

  return { mesh, uniforms, setSea, sample, addRipple, get hsWind() { return hsWind; } };
}
