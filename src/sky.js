// Sky dome, weather-driven volumetric clouds, real stars, constellations and the Milky Way.
import * as THREE from 'three';
import { eqVector } from './astro.js';

export const LAYER_FAR = 1;
export const LAYER_NEAR = 2;
const RAD = Math.PI / 180;

export const NOISE_GLSL = /* glsl */`
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p, int oct) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      v += a * noise(p);
      p = m * p;
      a *= 0.5;
    }
    return v;
  }
`;

export const SKY_UNIFORMS_GLSL = /* glsl */`
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uZen;
  uniform vec3 uHor;
  uniform vec3 uGlow;
  uniform vec3 uSunCol;
  uniform float uTime;
  uniform float uStars;
  uniform float uMoonLight;
  uniform float uMoonRadius;
  uniform sampler2D tMoonSurface;
  uniform float uMoonPhotoReady;
  uniform sampler2D tLunarMap;
  uniform float uLunarMapReady,uUseLunarMap;
  uniform float uDarkness;
`;

export const CLOUD_LOOKUP_GLSL = /* glsl */`
  uniform sampler2D tClouds;
  vec4 cloudsAt(vec3 d) {
    if (d.y <= 0.0) return vec4(0.0);
    float e = asin(clamp(d.y, 0.0, 1.0));
    vec2 uv = vec2(fract(atan(d.x, -d.z) / 6.2831853), sqrt(e / 1.5707963));
    vec4 c = texture2D(tClouds, uv);
    return vec4(c.rgb * 2.0, c.a);
  }
`;

const gnp = eqVector(192.85948, 27.12825);
const gc = eqVector(266.40499, -28.93617);

export const SKY_GLSL = NOISE_GLSL + SKY_UNIFORMS_GLSL + CLOUD_LOOKUP_GLSL + /* glsl */`
  uniform mat3 uLocalToEq;
  const vec3 GNP = vec3(${gnp.map((v) => v.toFixed(6)).join(', ')});
  const vec3 GC = vec3(${gc.map((v) => v.toFixed(6)).join(', ')});

  vec3 milkyWay(vec3 d) {
    vec3 eq = uLocalToEq * d;
    float b = asin(clamp(dot(eq, GNP), -1.0, 1.0));
    vec3 gy = cross(GNP, GC);
    float l = atan(dot(eq, gy), dot(eq, GC));
    float core = 0.5 + 0.5 * cos(l);
    float width = 0.11 + 0.1 * core;
    float band = exp(-(b * b) / (width * width));
    float mottle = fbm(vec2(l * 7.0, b * 22.0), 5);
    float rift = 1.0 - 0.7 * exp(-pow((b - 0.015) / 0.035, 2.0)) * smoothstep(-0.2, 0.8, cos(l));
    float bright = band * (0.35 + 0.9 * core * core) * (0.45 + 0.9 * mottle) * rift;
    bright += exp(-(b * b) / 0.002) * core * 0.4 * mottle;
    return vec3(0.6, 0.63, 0.78) * bright;
  }

  vec3 skyBase(vec3 d, float starGain) {
    if (d.y < 0.0) return mix(uHor, uHor * 0.35, clamp(-d.y * 5.0, 0.0, 1.0));
    float up = d.y;
    vec3 col = mix(uHor, uZen, pow(up, 0.42));
    float toward = 0.0;
    if (length(uSunDir.xz) > 1e-4 && length(d.xz) > 1e-4) toward = max(dot(normalize(d.xz), normalize(uSunDir.xz)), 0.0);
    col += uGlow * (pow(toward, 3.0) * 0.9 + 0.15) * exp(-up * 5.0);
    float sunUp = smoothstep(-0.06, 0.02, uSunDir.y);

    col += milkyWay(d) * 0.50 * uStars * starGain * smoothstep(0.0, 0.25, up);

    float s = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(s, 90.0) * 0.55 + pow(s, 1400.0) * 1.8) * sunUp * (1.0 - uDarkness * 0.8);

    float moonUp = smoothstep(-0.03, 0.02, uMoonDir.y);
    if (moonUp > 0.0) {
      float md = dot(d, uMoonDir);
      // A compact optical aureole leaves the lunar disc crisp. Cloud scattering
      // is already supplied by the volume; a huge painted halo washes out stars.
      float moonGlare = pow(max(md, 0.0), 2200.0) * 0.065
                      + pow(max(md, 0.0), 18000.0) * 0.12;
      col += vec3(0.76, 0.83, 1.0) * moonGlare * uMoonLight;
      float r = uMoonRadius;
      if (md > cos(r * 1.01)) {
        vec3 T = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0) + 1e-3));
        vec3 B = cross(T, uMoonDir);
        vec3 rel = d - uMoonDir * md;
        vec2 q = vec2(dot(rel, T), dot(rel, B)) / sin(r);
        float rr = dot(q, q);
        float face = sqrt(max(1.0 - rr, 0.0));
        vec3 nrm = normalize(q.x * T + q.y * B - face * uMoonDir);
        float incidence = max(dot(nrm, uSunDir), 0.0);
        // Broad overlapping basalt plains create recognizable scale rather than
        // a noisy white coin. This is procedural lunar terrain, not a photo map.
        float maria = 0.0;
        maria += exp(-dot((q-vec2(-.32,.30))/vec2(.38,.29),(q-vec2(-.32,.30))/vec2(.38,.29)))*.65;
        maria += exp(-dot((q-vec2(.16,.37))/vec2(.27,.31),(q-vec2(.16,.37))/vec2(.27,.31)))*.62;
        maria += exp(-dot((q-vec2(.43,.01))/vec2(.23,.27),(q-vec2(.43,.01))/vec2(.23,.27)))*.56;
        maria += exp(-dot((q-vec2(-.47,-.16))/vec2(.31,.22),(q-vec2(-.47,-.16))/vec2(.31,.22)))*.56;
        float albedo = 0.90 - min(.50,maria*.57);
        albedo *= .94 + .10*fbm(q*19.0+vec2(7.1,1.4),3);
        // Subpixel crater rims are filtered by their footprint. Relief shading
        // becomes stronger toward the terminator, while full moon stays pale.
        vec2 sunOnFace = vec2(dot(uSunDir,T),dot(uSunDir,B));
        float relief = 0.0;
        float footprint = max(fwidth(q.x),fwidth(q.y));
        for(int c=0;c<22;c++) {
          float fc=float(c);
          vec2 center=vec2(hash(vec2(fc,11.7)),hash(vec2(fc,33.9)))*1.74-.87;
          float radius=.018+.067*hash(vec2(fc,71.2));
          vec2 delta=q-center;
          float cd=length(delta)/radius;
          float rim=exp(-pow((cd-.92)/.12,2.0));
          float bowl=exp(-cd*cd*2.4);
          float resolved=smoothstep(footprint*.7,footprint*2.2,radius);
          float slope=dot(delta/(length(delta)+.0001),sunOnFace);
          relief += (rim*.055-bowl*.026+slope*rim*.12)*resolved;
        }
        // A restrained pale ray system around a southern bright impact basin.
        vec2 ray=q-vec2(.06,-.58);
        float rayAngle=atan(ray.y,ray.x);
        float rays=pow(max(0.0,cos(rayAngle*17.0+sin(rayAngle*4.0))),20.0);
        albedo += rays*exp(-length(ray)*3.8)*.11 + relief;
        if(uMoonPhotoReady>.5){
          vec2 photoUv=vec2(.507,.507)+q*vec2(.265,.197);
          vec3 photo=texture2D(tMoonSurface,photoUv).rgb;
          float gray=dot(photo,vec3(.299,.587,.114));
          albedo=clamp(.16+gray*.72,.18,.95);
        }
        if(uLunarMapReady>.5&&uUseLunarMap>.5){
          // NASA SVS cylindrical LROC colour map: longitude zero at image centre.
          // Map the visible hemisphere onto the disc before applying the phase.
          // Fixed north-up orientation; lunar libration is not simulated.
          vec2 lunarUv=vec2(.5+atan(q.x,max(face,.0001))/6.2831853,.5+asin(clamp(q.y,-1.,1.))/3.14159265);
          vec3 survey=texture2D(tLunarMap,lunarUv).rgb;
          albedo=clamp(.18+dot(survey,vec3(.299,.587,.114))*.90,.18,.95);
        }
        float terminator = smoothstep(0.0,.035,incidence);
        float lunarScatter = incidence/(incidence+face+.001);
        float lit = (sqrt(incidence)*.50+lunarScatter*.86)*terminator;
        float earthshine = .012*(1.0-uMoonLight);
        vec3 mc = vec3(.98,.965,.93)*max(.1,albedo)*(lit*1.42+earthshine);
        float edge = max(fwidth(rr)*1.2,.001);
        float a = (1.0-smoothstep(1.0-edge,1.0,rr))*moonUp*mix(1.0,.48,sunUp);
        col = mix(col,mc,a);
      }
    }
    return col;
  }

  vec3 skyColor(vec3 d, float starGain) {
    vec3 col = skyBase(d, starGain);
    vec4 c = cloudsAt(d);
    col = col * (1.0 - c.a) + c.rgb;
    float up = max(d.y, 0.0);
    col = mix(col, uHor * 1.04, exp(-up * 18.0) * 0.6);
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunCol * pow(s, 10.0) * 0.3 * smoothstep(-0.06, 0.02, uSunDir.y) * (1.0 - uDarkness * 0.7);
    return col;
  }
`;

/* ---------------- Cloud noise volume ---------------- */
function makeCloudNoise(N) {
  let seed = 987654321;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cellPoints = (C) => { const pts = new Float32Array(C * C * C * 3); for (let i = 0; i < pts.length; i++) pts[i] = rand(); return pts; };
  function worley(x, y, z, C, pts) {
    const fx = x * C, fy = y * C, fz = z * C;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let md = 1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, cz = iz + dz;
      const k = ((((cz % C) + C) % C * C + (((cy % C) + C) % C)) * C + (((cx % C) + C) % C)) * 3;
      const ddx = cx + pts[k] - fx, ddy = cy + pts[k + 1] - fy, ddz = cz + pts[k + 2] - fz;
      const d = ddx * ddx + ddy * ddy + ddz * ddz;
      if (d < md) md = d;
    }
    return Math.min(1, Math.sqrt(md));
  }
  const grads = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const th = rand() * Math.PI * 2, z = rand() * 2 - 1, s = Math.sqrt(1 - z * z);
    grads[i * 3] = Math.cos(th) * s; grads[i * 3 + 1] = Math.sin(th) * s; grads[i * 3 + 2] = z;
  }
  const perm = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function gdot(ix, iy, iz, P, dx, dy, dz) {
    const x = ((ix % P) + P) % P, y = ((iy % P) + P) % P, z = ((iz % P) + P) % P;
    const g = perm[(perm[(perm[x] + y) & 255] + z) & 255] * 3;
    return grads[g] * dx + grads[g + 1] * dy + grads[g + 2] * dz;
  }
  function perlin3(x, y, z, P) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const fx = x - X, fy = y - Y, fz = z - Z;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(gdot(X, Y, Z, P, fx, fy, fz), gdot(X + 1, Y, Z, P, fx - 1, fy, fz), u),
        l(gdot(X, Y + 1, Z, P, fx, fy - 1, fz), gdot(X + 1, Y + 1, Z, P, fx - 1, fy - 1, fz), u), v),
      l(l(gdot(X, Y, Z + 1, P, fx, fy, fz - 1), gdot(X + 1, Y, Z + 1, P, fx - 1, fy, fz - 1), u),
        l(gdot(X, Y + 1, Z + 1, P, fx, fy - 1, fz - 1), gdot(X + 1, Y + 1, Z + 1, P, fx - 1, fy - 1, fz - 1), u), v), w);
  }
  const W4 = cellPoints(4), W8 = cellPoints(8), W16 = cellPoints(16), W32 = cellPoints(32);
  const R = new Float32Array(N * N * N), G = new Float32Array(N * N * N);
  let rMin = 1e9, rMax = -1e9, gMin = 1e9, gMax = -1e9;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N, w = (z + 0.5) / N;
    const pn = perlin3(u * 4, v * 4, w * 4, 4) * 0.5 + perlin3(u * 8, v * 8, w * 8, 8) * 0.25 + perlin3(u * 16, v * 16, w * 16, 16) * 0.125;
    const p01 = Math.max(0, Math.min(1, pn * 0.8 + 0.5));
    const w4 = 1 - worley(u, v, w, 4, W4), w8 = 1 - worley(u, v, w, 8, W8);
    const w16 = 1 - worley(u, v, w, 16, W16), w32 = 1 - worley(u, v, w, 32, W32);
    const wf = w4 * 0.625 + w8 * 0.25 + w16 * 0.125;
    const r = (p01 - wf + 1) / (2 - wf);
    const g = w8 * 0.625 + w16 * 0.25 + w32 * 0.125;
    const i = (z * N + y) * N + x;
    R[i] = r; G[i] = g;
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
  }
  const data = new Uint8Array(N * N * N * 4);
  for (let i = 0; i < N * N * N; i++) {
    data[i * 4] = ((R[i] - rMin) / (rMax - rMin)) * 255;
    data[i * 4 + 1] = ((G[i] - gMin) / (gMax - gMin)) * 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------- Palette keyed to sun elevation ---------------- */
const KF = [
  { e: -18, zen: [0.004, 0.008, 0.018], hor: [0.014, 0.022, 0.04], glow: [0, 0, 0], sun: [0, 0, 0], star: 1 },
  { e: -10, zen: [0.012, 0.025, 0.06], hor: [0.05, 0.06, 0.1], glow: [0.03, 0.015, 0.02], sun: [0, 0, 0], star: 0.75 },
  { e: -4, zen: [0.04, 0.07, 0.14], hor: [0.24, 0.19, 0.24], glow: [0.35, 0.14, 0.06], sun: [0, 0, 0], star: 0.08 },
  { e: 0, zen: [0.08, 0.13, 0.23], hor: [0.56, 0.43, 0.38], glow: [0.55, 0.28, 0.1], sun: [1.0, 0.55, 0.25], star: 0 },
  { e: 4, zen: [0.09, 0.19, 0.3], hor: [0.66, 0.58, 0.52], glow: [0.38, 0.24, 0.1], sun: [1.0, 0.76, 0.46], star: 0 },
  { e: 10, zen: [0.09, 0.23, 0.32], hor: [0.6, 0.67, 0.71], glow: [0.1, 0.07, 0.04], sun: [1.0, 0.93, 0.82], star: 0 },
  { e: 25, zen: [0.08, 0.25, 0.38], hor: [0.62, 0.7, 0.75], glow: [0, 0, 0], sun: [1.0, 0.97, 0.92], star: 0 },
  { e: 60, zen: [0.07, 0.26, 0.44], hor: [0.64, 0.73, 0.79], glow: [0, 0, 0], sun: [1.0, 0.98, 0.95], star: 0 }
];
export function palette(e) {
  if (e <= KF[0].e) return KF[0];
  if (e >= KF[KF.length - 1].e) return KF[KF.length - 1];
  let i = 0;
  while (KF[i + 1].e < e) i++;
  const a = KF[i], b = KF[i + 1];
  let f = (e - a.e) / (b.e - a.e);
  f = f * f * (3 - 2 * f);
  const out = {};
  for (const k of Object.keys(a)) {
    if (Array.isArray(a[k])) out[k] = a[k].map((v, j) => v + (b[k][j] - v) * f);
    else out[k] = a[k] + (b[k] - a[k]) * f;
  }
  return out;
}

function bvColor(bv) {
  const stops = [[-0.3, [0.62, 0.72, 1.0]], [0.0, [0.78, 0.85, 1.0]], [0.4, [1.0, 0.98, 0.95]], [0.8, [1.0, 0.9, 0.76]], [1.3, [1.0, 0.78, 0.58]], [2.0, [1.0, 0.66, 0.45]]];
  if (bv <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (bv <= stops[i][0]) {
      const f = (bv - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return stops[i - 1][1].map((v, j) => v + (stops[i][1][j] - v) * f);
    }
  }
  return stops[stops.length - 1][1];
}

/* ---------------- Sky system ---------------- */
export function createSky(renderer, scene, isTouch) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uZen: { value: new THREE.Vector3() },
    uHor: { value: new THREE.Vector3() },
    uGlow: { value: new THREE.Vector3() },
    uSunCol: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uStars: { value: 0 },
    uMoonLight: { value: 0 },
    uMoonRadius: { value: .013 },
    tMoonSurface: {value:new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat)},
    uMoonPhotoReady: {value:0},
    tLunarMap:{value:null},uLunarMapReady:{value:0},uUseLunarMap:{value:1},
    uDarkness: { value: 0 },
    uLocalToEq: { value: new THREE.Matrix3() },
    tClouds: { value: null }
  };

  uniforms.tMoonSurface.value.needsUpdate=true;
  new THREE.TextureLoader().load(import.meta.env.BASE_URL+'textures/marine/moon-lroc-2k.png',texture=>{
    texture.colorSpace=THREE.NoColorSpace;texture.wrapS=THREE.RepeatWrapping;
    uniforms.tLunarMap.value=texture;uniforms.uLunarMapReady.value=1;
  },undefined,()=>console.warn('Lunar survey map unavailable; approved photograph retained'));
  // Keep the approved source untouched; use a smaller bitmap only in GPU memory.
  fetch(import.meta.env.BASE_URL+'data/visual-assets.json').then(r=>r.ok?r.json():null).then(async manifest=>{
    const asset=manifest?.assets?.find(a=>a.kind==='moon-surface'&&a.approved&&a.sourceUrl&&a.license&&a.file);
    if(!asset)return;
    const texture=await new THREE.TextureLoader().loadAsync(import.meta.env.BASE_URL+asset.file);
    texture.colorSpace=THREE.NoColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
    if(typeof createImageBitmap==='function'){
      try{const old=texture.image;texture.image=await createImageBitmap(old,{resizeWidth:768,resizeHeight:1024,resizeQuality:'high',imageOrientation:'flipY'});texture.flipY=false;}catch{}
    }
    texture.needsUpdate=true;uniforms.tMoonSurface.value.dispose();uniforms.tMoonSurface.value=texture;uniforms.uMoonPhotoReady.value=1;
  }).catch(error=>console.warn('Lunar surface photo unavailable',error));

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: SKY_GLSL + /* glsl */`
        varying vec3 vDir;
        void main() { gl_FragColor = vec4(skyColor(normalize(vDir), 1.0), 1.0); }`
    })
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  dome.layers.set(LAYER_FAR);
  scene.add(dome);

  /* ----- Clouds ----- */
  const CW = isTouch ? 1024 : 2048, CH = isTouch ? 320 : 600, SLICES = isTouch ? 8 : 6;
  const cloudRT = new THREE.WebGLRenderTarget(CW, CH, { depthBuffer: false, stencilBuffer: false });
  cloudRT.texture.wrapS = THREE.RepeatWrapping;
  cloudRT.texture.minFilter = cloudRT.texture.magFilter = THREE.LinearFilter;
  cloudRT.texture.generateMipmaps = false;
  uniforms.tClouds.value = cloudRT.texture;

  const cloudUniforms = {
    tNoise: { value: makeCloudNoise(64) },
    uCoverage: { value: 0.45 },
    uCovGrad: { value: new THREE.Vector2() },
    uOff: { value: new THREE.Vector2() },
    uEvolve: { value: 0 },
    uCB: { value: 900 },
    uCT: { value: 2600 },
    uCirrus: { value: 0.2 },
    uIsles: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }
  };
  for (const k of ['uSunDir', 'uMoonDir', 'uZen', 'uHor', 'uGlow', 'uSunCol', 'uTime', 'uStars', 'uMoonLight', 'uMoonRadius', 'tMoonSurface', 'uMoonPhotoReady', 'uDarkness']) cloudUniforms[k] = uniforms[k];

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: 'precision highp sampler3D;\n' + NOISE_GLSL + SKY_UNIFORMS_GLSL + /* glsl */`
      uniform sampler3D tNoise;
      uniform float uCoverage;
      uniform vec2 uCovGrad;
      uniform vec2 uOff;
      uniform float uEvolve;
      uniform float uCB;
      uniform float uCT;
      uniform float uCirrus;
      uniform vec4 uIsles[4];
      varying vec2 vUv;

      const float RE = 6371000.0;
      const float CI = 8500.0;

      vec2 shellHit(vec3 ro, vec3 rd, float r) {
        float b = dot(ro, rd);
        float c = dot(ro, ro) - r * r;
        float h = b * b - c;
        if (h < 0.0) return vec2(-1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }
      float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
      float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }

      float densityAt(vec3 p, float hf, bool detail) {
        vec3 q = vec3(p.x - uOff.x, p.y + uEvolve, p.z - uOff.y);
        float w = texture(tNoise, vec3(q.x, 0.0, q.z) / 46000.0 + vec3(0.0, 0.31, 0.0)).r;
        float cov = uCoverage + dot(p.xz, uCovGrad) + (w - 0.5) * 0.6;
        for (int i = 0; i < 4; i++) {
          vec4 is = uIsles[i];
          if (is.w > 0.0) {
            vec2 dd = p.xz - is.xy;
            cov += is.w * exp(-dot(dd, dd) / (is.z * is.z));
          }
        }
        cov = clamp(cov, 0.0, 1.0);
        float s = clamp(remap(texture(tNoise, q / vec3(7200.0, 4800.0, 7200.0)).r, 1.0 - cov, 1.0, 0.0, 1.0), 0.0, 1.0);
        s *= smoothstep(0.0, 0.1, hf) * (1.0 - smoothstep(0.45, 1.0, hf));
        if (s <= 0.0) return 0.0;
        if (detail) {
          float dn = texture(tNoise, q / 1150.0 + vec3(0.0, uTime * 0.003, 0.0)).g;
          float er = mix(dn, 1.0 - dn, clamp(hf * 3.0, 0.0, 1.0)) * 0.42;
          s = clamp(remap(s, er, 1.0, 0.0, 1.0), 0.0, 1.0);
        }
        return s;
      }

      void main() {
        float az = vUv.x * 6.2831853;
        float e = vUv.y * vUv.y * 1.5707963;
        vec3 rd = vec3(sin(az) * cos(e), sin(e), -cos(az) * cos(e));
        vec3 ro = vec3(0.0, RE + 2.0, 0.0);

        float sunUp = smoothstep(-0.08, 0.0, uSunDir.y);
        vec3 Ld = uSunDir.y > -0.08 ? uSunDir : uMoonDir;
        vec3 Lc = (uSunCol * sunUp * 1.15 + vec3(0.55, 0.62, 0.78) * uMoonLight * 0.25 * (1.0 - sunUp)) * (1.0 - 0.65 * uDarkness);
        float cosT = dot(rd, Ld);
        float phase = mix(hg(cosT, 0.72), hg(cosT, -0.2), 0.35) * 0.5;
        float ambK = 1.0 - 0.5 * uDarkness;
        vec3 ambTop = (uZen * 0.8 + uHor * 0.75) * ambK;
        vec3 ambBot = (uHor * 0.55 + uZen * 0.2) * ambK * (1.0 - 0.4 * uDarkness);

        float T = 1.0;
        vec3 S = vec3(0.0);
        vec2 hb = shellHit(ro, rd, RE + uCB);
        vec2 ht = shellHit(ro, rd, RE + uCT);
        float t0 = hb.y;
        float t1 = min(ht.y, hb.y + 30000.0);
        if (rd.y > 0.0 && t1 > t0) {
          const int STEPS = 48;
          float dt = (t1 - t0) / float(STEPS);
          float t = t0 + dt * hash(vUv * vec2(1733.0, 977.0));
          for (int i = 0; i < STEPS; i++) {
            vec3 pw = ro + rd * t;
            float alt = length(pw) - RE;
            float hf = (alt - uCB) / (uCT - uCB);
            vec3 p = vec3(pw.x, alt, pw.z);
            float dens = densityAt(p, hf, true);
            if (dens > 0.002) {
              float sigma = dens * 0.04;
              float ld = 0.0;
              float ls = 90.0;
              vec3 lp = p;
              for (int j = 0; j < 5; j++) {
                lp += Ld * ls;
                float lh = (lp.y - uCB) / (uCT - uCB);
                if (lh > 1.0) break;
                ld += densityAt(lp, lh, false) * ls;
                ls *= 1.7;
              }
              float beer = exp(-ld * 0.034);
              float powder = 1.0 - exp(-sigma * 120.0);
              vec3 lum = Lc * beer * phase * 3.0 * mix(1.0, powder, 0.6 * (1.0 - max(cosT, 0.0)))
                       + mix(ambBot, ambTop, clamp(hf, 0.0, 1.0));
              lum = mix(lum, uHor, (1.0 - exp(-t / 24000.0)) * 0.9);
              float stepT = exp(-sigma * dt);
              S += T * lum * (1.0 - stepT);
              T *= stepT;
              if (T < 0.015) break;
            }
            t += dt;
          }
        }

        float ciA = 0.0;
        vec3 ciC = vec3(0.0);
        vec2 hc = shellHit(ro, rd, RE + CI);
        if (rd.y > 0.0 && hc.y > 0.0) {
          vec3 pc = ro + rd * hc.y;
          vec2 cuv = (pc.xz - uOff * 1.6) / 14000.0;
          vec2 warp = vec2(fbm(cuv * 1.7, 4), fbm(cuv * 1.7 + 5.2, 4));
          float ci = fbm(vec2(cuv.x * 0.7, cuv.y * 3.2) + warp * 0.8, 5);
          ciA = smoothstep(0.75 - uCirrus * 0.45, 0.95 - uCirrus * 0.2, ci) * (0.25 + uCirrus * 0.6) * exp(-hc.y / 60000.0);
          ciC = Lc * (0.55 + phase * 1.6) + uZen * 0.6 + uHor * 0.45;
          ciC = mix(ciC, uHor, 1.0 - exp(-hc.y / 40000.0));
        }

        vec3 rgb = S + T * ciC * ciA;
        float a = 1.0 - T * (1.0 - ciA);
        gl_FragColor = vec4(rgb * 0.5, a);
      }`
  });
  const cloudScene = new THREE.Scene();
  const cloudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cloudMat);
  quad.frustumCulled = false;
  cloudScene.add(quad);
  let slice = 0;
  function renderClouds(all) {
    if (all) cloudRT.scissorTest = false;
    else {
      const w = Math.ceil(CW / SLICES);
      cloudRT.scissor.set(slice * w, 0, w, CH);
      cloudRT.scissorTest = true;
      slice = (slice + 1) % SLICES;
    }
    renderer.setRenderTarget(cloudRT);
    renderer.render(cloudScene, cloudCam);
    renderer.setRenderTarget(null);
  }

  /* ----- Stars, constellations, labels ----- */
  const starGroup = new THREE.Group();
  starGroup.matrixAutoUpdate = false;
  starGroup.layers.set(LAYER_FAR);
  scene.add(starGroup);
  const starUniforms = { uMoonRadius: uniforms.uMoonRadius, uMoonDir: uniforms.uMoonDir, uStars: uniforms.uStars, uTime: uniforms.uTime, tClouds: uniforms.tClouds, uPx: { value: renderer.getPixelRatio() }, uLines: { value: 0 }, uEye: { value: 0.8 } };
  let labels = [];
  const labelBox = document.getElementById('skyLabels');

  function buildStars(sky) {
    const n = sky.stars.length / 4;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = eqVector(sky.stars[i * 4], sky.stars[i * 4 + 1]);
      pos[i * 3] = v[0] * 8000; pos[i * 3 + 1] = v[1] * 8000; pos[i * 3 + 2] = v[2] * 8000;
      const c = bvColor(sky.stars[i * 4 + 3]);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      mag[i] = sky.stars[i * 4 + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: starUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aMag;
        uniform float uStars;
        uniform float uPx;
        uniform float uEye;
        varying vec3 vCol;
        varying float vA;
        varying vec3 vDir;
        varying float vSeed;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
          float b = pow(10.0, -0.28 * (aMag - 1.0));
          // A core narrower than one pixel disappeared between pixel centers.
          // Give even faint stars a stable footprint, while keeping a tight core.
          gl_PointSize = clamp(3.0 + 1.7 * sqrt(b), 3.0, 7.0) * uPx;
          vA = clamp(b * 3.0 + 0.065, 0.0, 4.0) * uEye;
          vA *= 1.0 - smoothstep(6.4, 7.3, aMag);
          vCol = mix(vec3(1.0,.985,.965),aColor,.065);
          vSeed = fract(position.x * 0.137 + position.y * 0.071);
        }`,
      fragmentShader: CLOUD_LOOKUP_GLSL + /* glsl */`
        uniform float uTime;
        uniform float uStars;
        uniform vec3 uMoonDir;
        uniform float uMoonRadius;
        varying vec3 vCol;
        varying float vA;
        varying vec3 vDir;
        varying float vSeed;
        void main() {
          if(uMoonDir.y>0.0 && dot(normalize(vDir),uMoonDir)>cos(uMoonRadius))discard;
          float r = length(gl_PointCoord - 0.5);
          float core = exp(-r*r*100.0);
          float halo = exp(-r*r*24.0)*0.055;
          float a = (pow(max(core*vA,0.0),0.64)*1.55 + halo*vA) * uStars;
          float h = smoothstep(-0.01, 0.14, vDir.y);
          a *= h;
          a *= 0.94 + 0.06 * sin(uTime * (1.1 + vSeed * 2.0) + vSeed * 50.0) * (1.0 - h * 0.75);
          a *= 1.0 - cloudsAt(vDir).a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol, min(1.0,a*5.8));
        }`
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = -9;
    pts.layers.set(LAYER_FAR);
    starGroup.add(pts);

    // Constellation figures
    const lp = [];
    for (const segs of Object.values(sky.lines)) {
      for (const seg of segs) {
        for (let i = 0; i < seg.length - 1; i++) {
          const a = eqVector(seg[i][0], seg[i][1]), b = eqVector(seg[i + 1][0], seg[i + 1][1]);
          lp.push(a[0] * 7990, a[1] * 7990, a[2] * 7990, b[0] * 7990, b[1] * 7990, b[2] * 7990);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lm = new THREE.ShaderMaterial({
      uniforms: starUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = normalize(wp.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: CLOUD_LOOKUP_GLSL + /* glsl */`
        uniform float uLines;
        uniform float uStars;
        varying vec3 vDir;
        void main() {
          float a = uLines * (0.12 + 0.2 * uStars) * smoothstep(0.0, 0.1, vDir.y) * (1.0 - cloudsAt(vDir).a * 0.85);
          gl_FragColor = vec4(vec3(0.78, 0.84, 0.95), a);
        }`
    });
    const lines = new THREE.LineSegments(lg, lm);
    lines.frustumCulled = false;
    lines.renderOrder = -8;
    lines.layers.set(LAYER_FAR);
    starGroup.add(lines);

    // Labels: constellations and the brightest navigation stars
    labels = [];
    if (labelBox) {
      for (const c of Object.values(sky.names)) {
        const el = document.createElement('span');
        el.className = 'sky-label';
        el.textContent = c.name;
        labelBox.appendChild(el);
        labels.push({ el, v: new THREE.Vector3(...eqVector(c.ra, c.dec)), star: false });
      }
      for (const s of sky.bright) {
        const el = document.createElement('span');
        el.className = 'sky-label star';
        el.textContent = s.name;
        labelBox.appendChild(el);
        labels.push({ el, v: new THREE.Vector3(...eqVector(s.ra, s.dec)), star: true });
      }
    }
  }

  let linesOn = false;
  const tmpV = new THREE.Vector3();
  const rot = new THREE.Matrix4();

  function setOrientation(M, camPos) {
    rot.set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1);
    starGroup.matrix.copy(rot).setPosition(camPos);
    starGroup.matrixWorldNeedsUpdate = true;
    uniforms.uLocalToEq.value.set(M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]);
  }

  function updateLabels(camera, width, height) {
    if (!labelBox) return;
    const show = linesOn && uniforms.uStars.value > 0.15;
    labelBox.hidden = !show;
    if (!show) return;
    for (const L of labels) {
      tmpV.copy(L.v).applyMatrix4(rot); // local direction
      if (tmpV.y < 0.06) { L.el.style.opacity = '0'; continue; }
      const dir = tmpV.clone();
      tmpV.multiplyScalar(5000).add(camera.position).project(camera);
      if (tmpV.z > 1 || tmpV.x < -1.1 || tmpV.x > 1.1 || tmpV.y < -1.1 || tmpV.y > 1.1) { L.el.style.opacity = '0'; continue; }
      const x = (tmpV.x * 0.5 + 0.5) * width, y = (-tmpV.y * 0.5 + 0.5) * height;
      L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      L.el.style.opacity = String(Math.min(1, (dir.y - 0.06) * 6) * (L.star ? 0.85 : 0.6));
    }
  }

  function setLines(on) {
    linesOn = on;
    starUniforms.uLines.value = on ? 1 : 0;
  }

  return { uniforms, cloudUniforms, dome, renderClouds, buildStars, setNightVision(value) { starUniforms.uEye.value = value; }, setOrientation, updateLabels, setLines, get linesOn() { return linesOn; } };
}
