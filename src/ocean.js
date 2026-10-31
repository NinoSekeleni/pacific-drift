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
const RIPPLE_COUNT = 32;

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
  uniform float uWavePhase[NW];
  uniform mat4 uHullInverse; // exact world-to-canoe transform, shared by both shaders
  uniform vec4 uHull;   // canoe x, z, heave, on
  uniform vec4 uHullAx; // forward x, z, longitudinal slope, transverse slope
  uniform vec4 uHullSeg;
      uniform vec2 uHullProfile[65]; // half length .x, half-beam .y
  uniform vec4 uAmaSeg;  // float across .x, from (along) .y to .z, radius .w
  float waveFade(float L, float dist) { return 1.0 - smoothstep(L * 15.0, L * 60.0, dist); }
  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }
  // The canoe displaces the sea: around the hull and float the surface settles onto the canoe's
  // waterline, and inside the hull it sits below the planking, so waves never pass through the boat.
  // Returns (blend, waterline height, inside hull).
  vec3 hullMask(vec2 base) {
    if (uHull.w < 0.5) return vec3(0.0);
    vec2 rel = base - uHull.xy;
    vec2 f = uHullAx.xy;
    vec2 r = vec2(-f.y, f.x);
    float along = dot(rel, f), across = dot(rel, r);
    vec2 q = vec2(across, along);
    // Hull plan: half-beam tapering to fine stems, uHullSeg = (half length, half-beam, fullness, 0)
    float sl = clamp(abs(along) / uHullSeg.x, 0.0, 1.0);
    float hb = uHullSeg.y * pow(max(0.0, 1.0 - pow(sl, 2.3)), 0.72);
    float dHull = max(abs(across) - hb, abs(along) - uHullSeg.x);
    float dAma = segDist(q, vec2(uAmaSeg.x, uAmaSeg.y), vec2(uAmaSeg.x, uAmaSeg.z)) - uAmaSeg.w;
    float d = min(dHull, dAma);
    // Only the water that would show inside the hull is touched; the open sea outside is left alone
    float w = 1.0 - smoothstep(-0.1, 0.02, dHull);
    float plane = uHull.z + along * uHullAx.z + across * uHullAx.w;
    float inside = 1.0 - smoothstep(0.25, 0.9, dHull);
    return vec3(w, plane, inside);
  }
`;

export function createOcean(renderer, scene, skyUniforms) {
  const waves = Array.from({ length: N_WAVES }, () => new THREE.Vector4(1, 0, 10, 0));
  const phaseOffsets=new Float32Array(N_WAVES);
  let seaInitialized=false;
  const ripples = Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4(0, 0, -1000, 0));
  const rippleAxes=Array.from({length:RIPPLE_COUNT},()=>new THREE.Vector2(0,-1));
  let rippleNext = 0;

  const uniforms = Object.assign({}, skyUniforms, {
    uWaves: { value: waves },
    uWavePhase:{value:phaseOffsets},
    uRipples: { value: ripples },
    uWaterRippleAxes: {value:rippleAxes},
    uWaterWindDir: {value:new THREE.Vector2(0,-1)},
    tDetail: { value: detailNormals(renderer) },
    tImportedNormal:{value:null},tImportedRoughness:{value:null},tFoamDetail:{value:null},
    uTextureDetail:{value:0},uFoamDetail:{value:0},uOpticsDetail:{value:0},
    uBody: { value: new THREE.Vector3(0.03, 0.08, 0.1) },
    uFog: { value: new THREE.Vector3() },
    uVis: { value: 30000 },
    tBoatReflection:{value:null},uBoatReflectionMatrix:{value:new THREE.Matrix4()},uBoatReflection:{value:0},
    uWind: { value: 5 },
    uWhitecap: { value: 0 },
    uStormChop:{value:0},uFoamActivity:{value:0},
    uRain: { value: 0 },
    uHsWind: { value: 0.5 },
    uWaveT: { value: 0 },
    uHull: { value: new THREE.Vector4() },
    uHullInverse: { value: new THREE.Matrix4() },
    uHullAx: { value: new THREE.Vector4(0, -1, 0, 0) },
    uHullSeg: { value: new THREE.Vector4(2.6, 0.46, 0, 0) },
    uHullProfile:{value:Array.from({length:65},()=>new THREE.Vector2())},
    uAmaSeg: { value: new THREE.Vector4(-2.1, -1.7, 2.1, 0.16) },
    uLantern: { value: new THREE.Vector4(0, -100, 0, 0) },
    uBio: { value: 0 },
    uHullSpeed: { value: 0 },
    uBoatMotion: { value: 0 }
  });

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: WAVE_GLSL + /* glsl */`
      uniform float uWaveT;
      varying vec3 vWorld;
      varying vec2 vBase;
      varying float vH;
      varying float vMask;
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
          float ph = k * (dot(w.xy, base) - c * uWaveT) + uWavePhase[i];
          float A = w.w * waveFade(w.z, dist);
          float Q = min(0.85 / (k * max(w.w, 1e-4) * float(NW)), 1.0);
          disp.xz += Q * A * w.xy * cos(ph);
          disp.y += A * sin(ph);
        }
        // Judge the hull against where this point of the surface actually ends up after the waves
        // have carried it sideways, so swell can never slide water in under the hull
        vec2 moved = base + disp.xz;
        vec3 hm = hullMask(moved);
        wp.xz = moved;
        // The sea itself is never bent around the canoe; a depth-only lid over the hull opening
        // (drawn just before the sea) keeps water from ever showing inside the boat
        // Beside the hull the sea is never allowed above the gunwales, so a passing crest wraps
        // around the canoe instead of rolling over it. Ordinary water is left untouched.
        float lid = hm.y + 0.13;
        wp.y = mix(disp.y, min(disp.y, lid), hm.z);
        vWorld = wp.xyz;
        vBase = base;
        vH = disp.y * (1.0 - hm.x);
        vMask = hm.x;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: SKY_GLSL + WAVE_GLSL + /* glsl */`
      uniform sampler2D tDetail;
      uniform sampler2D tImportedNormal,tImportedRoughness,tFoamDetail;
      uniform float uTextureDetail,uFoamDetail,uOpticsDetail;
      uniform vec4 uRipples[${RIPPLE_COUNT}];
      uniform vec2 uWaterRippleAxes[${RIPPLE_COUNT}];
      uniform vec2 uWaterWindDir;
      uniform vec3 uBody;
      uniform vec3 uFog;
      uniform float uVis,uBoatReflection;uniform sampler2D tBoatReflection;uniform mat4 uBoatReflectionMatrix;
      uniform float uWind;
      uniform float uWhitecap;
      uniform float uStormChop,uFoamActivity;
      uniform float uRain;
      uniform float uHsWind;
      uniform float uWaveT;
      uniform vec4 uLantern; // position, brightness
      uniform float uBio;       // darkness-weighted bioluminescence strength
      uniform float uBoatMotion;
      uniform float uHullSpeed; // canoe speed through the water, m/s
      varying vec3 vWorld;
      varying vec2 vBase;
      varying float vH;
      varying float vMask;

      vec2 slopeAt(vec2 uv) {
        vec3 n = texture2D(tDetail, uv).xyz * 2.0 - 1.0;
        return n.xy / max(n.z, 0.2);
      }

      void main() {
        // Any water inside the hull's outline that stands above the gunwale line is simply not drawn
        // (below that line the depth-only lid over the canoe already hides it)
        if (uHull.w > 0.5) {
          vec3 local = (uHullInverse * vec4(vWorld, 1.0)).xyz;
          float sl = clamp(abs(local.z) / uHullSeg.x, 0.0, 1.0);
          float hb = uHullSeg.y * pow(max(0.0, 1.0 - pow(sl, 2.3)), 0.72);
          if(uHullSeg.z>.5){float at=clamp((local.z/uHullSeg.x+1.)*.5*64.,0.,63.999);int ix=int(floor(at));hb=mix(uHullProfile[ix].x,uHullProfile[ix+1].x,fract(at));}
          float dH = max(abs(local.x) - hb, abs(local.z) - uHullSeg.x);
          if (dH < -0.012 && local.y > 0.08) discard;
        }
        vec3 toCam = cameraPosition - vWorld;
        float dist = length(toCam);
        vec3 V = toCam / dist;

        vec3 N = vec3(0.0, 1.0, 0.0);
        float crestHistory=0.0,crestFresh=0.0,crestCompression=0.0;
        for (int i = 0; i < NW; i++) {
          vec4 w = uWaves[i];
          if (w.w < 1e-4) continue;
          float k = 6.2831853 / w.z;
          float c = sqrt(9.81 / k);
          float ph = k * (dot(w.xy, vBase) - c * uWaveT) + uWavePhase[i];
          float WA = k * w.w * waveFade(w.z, dist);
          float Q = min(0.85 / (k * max(w.w, 1e-4) * float(NW)), 1.0);
          N.x -= w.x * WA * cos(ph);
          N.z -= w.y * WA * cos(ph);
          N.y -= Q * WA * sin(ph);
          if(i<${WIND_L.length})crestCompression+=Q*WA*sin(ph);
          // Short breaking ridges and a weaker remnant; swell height alone
          // cannot turn an entire wave face into foam.
          if(i<${WIND_L.length} && w.z>4.0){
            float steep=smoothstep(.065,.16,WA);
            float resolved=1.-smoothstep(.10,.65,length(vec2(dFdx(ph),dFdy(ph))));
            float fresh=pow(max(0.,sin(ph)),24.);
            float recent=pow(max(0.,sin(ph+k*c*.65)),18.)*.24;
            float older=pow(max(0.,sin(ph+k*c*1.5)),14.)*.08;
            crestFresh=max(crestFresh,fresh*steep*resolved);
            crestHistory=max(crestHistory,(recent+older)*steep*resolved);
          }
        }
        N.xz *= 1.0 - vMask;

        float t = uTime;
        float windK = clamp(uWind / 8.0, 0.15, 1.6);
        vec2 waterWind=normalize(uWaterWindDir+vec2(.00001));
        vec2 waterCross=vec2(-waterWind.y,waterWind.x);
        vec2 windUV=vec2(dot(vBase,waterCross),dot(vBase,waterWind));
        vec2 s1 = slopeAt(windUV / 1.3 + vec2(t * .018, -t * .061));
        if(uTextureDetail>.001){
          vec2 uvA=windUV/1.3+vec2(t*.018,-t*.061);
          vec2 uvB=vec2(-windUV.y,windUV.x)/2.1+vec2(-t*.023,t*.017);
          vec3 authoredA=texture2D(tImportedNormal,uvA).xyz*2.-1.;
          vec3 authoredB=texture2D(tImportedNormal,uvB).xyz*2.-1.;
          vec2 authored=authoredA.xy/max(.45,authoredA.z)*.75+vec2(authoredB.y,-authoredB.x)/max(.45,authoredB.z)*.25;
          s1=mix(s1,authored*1.3,uTextureDetail*.70);
        }
        vec2 s2 = slopeAt(windUV / 4.6 + vec2(-t * .011, -t * .033));
        vec2 s3 = slopeAt(windUV / 29.0 + vec2(t * .004, -t * .009));
        float near = 1.0 - smoothstep(30.0, 400.0, dist);
        vec2 crossChop=slopeAt(windUV/vec2(.55,.85)+vec2(t*.033,-t*.084));
        vec2 windSlope=(s1*(.065+uStormChop*.075)*near+s2*.085+s3*.11+crossChop*uStormChop*.085*near)*windK;
        // Fine ripples travel with the wind; unequal scales prevent a sliding tile.
        vec2 slope=waterCross*windSlope.x+waterWind*windSlope.y;
        float gust = smoothstep(0.32, 0.78, fbm(vBase / 70.0 + vec2(t * 0.012, -t * 0.007), 3));
        slope *= mix(0.55, 1.3, gust) * mix(1.0, 0.8, smoothstep(80.0, 3000.0, dist));

        // Raindrops pock the surface
        if (uRain > 0.01) {
          // Independent short-lived wavelets, filtered before they become pixels.
          vec2 cell=floor(vBase*4.5);
          float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
          vec2 centre=.35+.30*fract(sin(vec2(dot(cell,vec2(269.5,183.3)),dot(cell,vec2(419.2,371.9))))*43758.5453);
          vec2 rp=fract(vBase*4.5)-centre;
          float age=fract(t*(1.6+seed*.6)+seed*7.);
          float radius=.025+age*.29,rd=length(rp);
          float wavelet=exp(-pow((rd-radius)/.032,2.))*(1.-age)*(1.-age)*smoothstep(0.,.08,age);
          float footprint=max(length(dFdx(vBase)),length(dFdy(vBase)));
          float resolved=1.-smoothstep(.012,.10,footprint);
          slope+=rp/max(rd,.001)*wavelet*.075*min(1.,uRain)*near*resolved;
        }

        // Paddle and wake ripples
        vec2 rg = vec2(0.0);
        float bioWake = 0.0;
        float waterWakeFoam=0.0;
        float waterPixelFootprint=max(length(dFdx(vBase)),length(dFdy(vBase)));
        float rippleFade = 1.0 - smoothstep(25.0, 70.0, dist);
        if (rippleFade > 0.0) {
          for (int i = 0; i < ${RIPPLE_COUNT}; i++) {
            vec4 rp = uRipples[i];
            float age = uTime - rp.z;
            if (age < .0 || age > 14.0) continue;
            vec2 drift=waterWind*age*min(uWind*.012,.28);
            vec2 dv = vBase - rp.xy-drift;
            float d = length(dv);
            vec2 alongAxis=uWaterRippleAxes[i];
            vec2 acrossAxis=vec2(-alongAxis.y,alongAxis.x);
            vec2 q=vec2(dot(dv,acrossAxis),dot(dv,alongAxis));
            // A widening, anisotropic disturbance stays at the place where the
            // paddle or hull aerated the water while the canoe travels onward.
            vec2 eddyQ=q/vec2(.24+age*.13,.30+age*.20);
            float eddyRadius=length(eddyQ);
            if(eddyRadius<3.2){
              // Water-bound turbulence, never an angular spiral or spinning decal.
              vec2 advected=q+vec2(noise(q*2.1+rp.xy)*.14,noise(q*1.8-rp.xy)*.17);
              float broad=fbm(advected*3.7+rp.xy*.13+vec2(age*.09,-age*.065),3);
              float grain=noise(advected*19.0+rp.xy*3.1);
              float resolved=1.-smoothstep(.025,.16,waterPixelFootprint);
              float cells=mix(.30,smoothstep(.58,.84,grain),resolved);
              float eddyEnvelope=exp(-eddyRadius*eddyRadius*.83)*(1.-smoothstep(1.5,2.8,eddyRadius));
              float fresh=(1.0-exp(-age*12.0))*exp(-age*.95);
              float memory=(1.0-exp(-age*3.0))*exp(-age*.52)*.12;
              bioWake+=(fresh+memory)*rp.w*24.0*eddyEnvelope*smoothstep(.18,.65,broad)*(.35+cells*.65);
              float foamAge=(1.0-exp(-age*5.0))*exp(-age*.31);
              float broken=.3+.7*smoothstep(.33,.69,noise(q*4.0+rp.xy*.37+vec2(age*.12,-age*.08)));
              float rim=exp(-pow((eddyRadius-(.68+age*.025))/.20,2.0));
              float turbulence=clamp((rp.w-.018)*9.0,.0,.9);
              waterWakeFoam+=(rim*.7+eddyEnvelope*.13)*foamAge*broken*turbulence;
            }
            // Expanding capillary rings decay faster than the foam they leave.
            if(age>8.0)continue;
            float front = .9 * age + .04;
            float wdt = .16 + .32 * age;
            float x = d - front;
            if (x > wdt * 2.5 || x < -wdt * 3.2) continue;
            float env = exp(-x * x / (wdt * wdt));
            float k = 12.0 / (1.0 + age * .3);
            float amp = rp.w * exp(-age * .45) / (1.0 + d * .6);
            float dh = amp * env * (k * cos(k * x) - sin(k * x) * 2.0 * x / (wdt * wdt));
            if (d > 1e-3) rg += dv / d * dh;
          }
        }
        N = normalize(N + vec3(slope.x, 0.0, slope.y) - vec3(rg.x, 0.0, rg.y) * rippleFade);

        // Derivative-based specular filtering adapted from Ultra-Water (MIT,
        // Humpalumps 2026; see shipped notices). Filter unresolved normal changes
        // rather than letting the sun/moon sparkle into isolated aliased pixels.
        vec3 normalDx=dFdx(N),normalDy=dFdy(N);
        float opticalVariance=min(.25*(dot(normalDx,normalDx)+dot(normalDy,normalDy)),.18);
        float surfaceRoughness=.5;
        if(uTextureDetail>.001)surfaceRoughness=texture2D(tImportedRoughness,windUV/1.3).g;
        opticalVariance=(opticalVariance*.15+surfaceRoughness*.00006*windK)*uOpticsDetail;

        float NdV = max(dot(N, V), 0.0);
        vec3 R = reflect(-V, N);
        if (R.y < 0.0) R.y = -R.y * 0.5;
        R = normalize(R);
        vec3 refl = skyColor(R, 0.55);
        float moonUp = smoothstep(-0.03, 0.03, uMoonDir.y);
        float moonExponent=1./(1./900.+opticalVariance);
        refl += vec3(0.85, 0.88, 0.95) * pow(max(dot(R, uMoonDir), 0.0), moonExponent) * (moonExponent/900.) * 2.2 * uMoonLight * moonUp;
        float sunUp = smoothstep(-0.03, 0.05, uSunDir.y);
        float sunExponent=1./(1./2200.+opticalVariance);
        refl += uSunCol * pow(max(dot(R, uSunDir), 0.0), sunExponent) * (sunExponent/2200.) * 5.0 * sunUp * (1.0 - uDarkness * 0.85);

        // Fresnel, softened by the spread of wave slopes below the mesh resolution
        float F = 0.03 + 0.97 * pow(1.0 - NdV, 5.0);
        F = mix(F, 0.03 + 0.97 * pow(1.0 - min(NdV, 0.9), 3.2) * 0.55, 0.35);

        vec3 L = uSunDir;
        float lightAmt = sunUp * clamp(L.y * 3.0 + 0.2, 0.0, 1.0) * (1.0 - 0.6 * uDarkness);
        vec3 body = uBody * (0.75 + 0.35 * max(dot(N, normalize(vec3(L.x, max(L.y, 0.05), L.z))), 0.0));
        // Light scattered back up out of the water column, strongest looking straight down
        body += (uZen * 0.55 + uHor * 0.25) * vec3(0.18, 0.42, 0.55) * (0.35 + 0.65 * NdV) * (1.0 - 0.5 * uDarkness);
        float facing = 0.0;
        if (length(L.xz) > 1e-4) facing = max(dot(normalize(-V.xz), normalize(L.xz)), 0.0);
        float sss = pow(facing, 3.0) * clamp(vH / max(uHsWind, 0.3) * 1.5 + 0.35, 0.0, 1.0) * lightAmt;
        body += vec3(0.04, 0.19, 0.18) * sss * 0.7 * (1.0 - smoothstep(100.0, 1500.0, dist));

        vec3 col = mix(body, refl, F);
        if(uBoatReflection>.5&&dist<45.){
          vec4 projected=uBoatReflectionMatrix*vec4(vWorld,1.);vec2 uv=projected.xy/max(.001,projected.w);
          uv+=N.xz*.009*(.3+uWind*.025);
          if(projected.w>0.&&all(greaterThan(uv,vec2(0.)))&&all(lessThan(uv,vec2(1.)))){
            vec4 localReflection=texture2D(tBoatReflection,uv);float weight=localReflection.a*(.10+.64*pow(1.-NdV,3.))*(1.-smoothstep(28.,45.,dist));
            col=mix(col,localReflection.rgb,weight);
          }
        }

        // Wind-aligned streaks break reflected highlights into long moving
        // lanes. They emerge only in a breeze and remain broad enough to resolve.
        float waterStreaks=fbm(vec2(windUV.x*.24,windUV.y*.012-t*.015),3);
        float waterGustLanes=smoothstep(.61,.81,waterStreaks)*smoothstep(6.0,19.0,uWind);
        float waterStreakVisibility=(1.0-smoothstep(80.0,1100.0,dist));
        col*=1.0+waterGustLanes*.09*waterStreakVisibility;

        // Broken caps belong to compressed wind crests, not the broad swell.
        float foam=0.0,foamBillow=.5,foamPattern=.5;
        vec2 foamGradient=vec2(0.0);
        if(uFoamActivity>.001){
          float foamPatch=fbm(windUV/vec2(1.1,2.8)+vec2(t*.025,-t*.065),3);
          float lace=noise(windUV*1.3+vec2(t*.08,-t*.12));
          float fragments=smoothstep(.35,.62,foamPatch)*(.4+.6*smoothstep(.3,.65,lace));
          if(uFoamDetail>.001){
            // Two advected phases crossfade at resets; no snapping or endless
            // sliding texture. Existing crest energy still controls coverage.
            float phase0=fract(t/3.5),phase1=fract(t/3.5+.5),blend=abs(phase0*2.-1.);
            vec2 drift=waterWind*(.4+min(uWind,26.)*.09);
            vec4 foam0=texture2D(tFoamDetail,(vWorld.xz-drift*phase0*3.5)*.36);
            vec4 foam1=texture2D(tFoamDetail,(vWorld.xz-drift*phase1*3.5)*.36+.43);
            vec4 foamField=mix(foam0,foam1,blend);
            fragments*=mix(1.,mix(.60,1.2,smoothstep(.25,.80,foamField.r)),uFoamDetail);
            foamBillow=mix(.5,foamField.g,uFoamDetail);
            foamPattern=foamField.r;
            foamGradient=(foamField.ba-.5)*64.*.36*uFoamDetail;
          }
          float breaking=smoothstep(.015,.15,crestCompression);
          float density=clamp((crestFresh*1.65+crestHistory*.55)*breaking*uFoamActivity,0.,1.);
          // Ultra-Water's erosion: young dense caps cover bubbles; old remnants
          // open into lace instead of becoming a translucent white wash.
          float eroded=smoothstep(.90-density,1.20-density,foamPattern)*sqrt(density);
          foam=mix((crestFresh*1.35+crestHistory*.35)*breaking*fragments*uFoamActivity,eroded,uFoamDetail*.72);
          foam*=1.-smoothstep(150.,2200.,dist);
        }
        foam+=waterWakeFoam*rippleFade*1.55;
        // Billow normals, crease occlusion and thin-film colour adapted from
        // Ultra-Water OceanSurface.js (Humpalumps 2026, MIT; retained notices).
        if(foam>.001){
          vec3 foamN=normalize(N-vec3(foamGradient.x,0.,foamGradient.y)*(.025+.075*foam));
          float ao=mix(.65,1.,smoothstep(.15,.75,foamBillow));
          float solid=smoothstep(.12,.65,foam*(.55+.7*foamBillow));
          vec3 ambient=uHor*.70+uZen*.45+vec3(.10,.13,.18)*uMoonLight;
          vec3 direct=uSunCol*lightAmt*(.18+.65*max(dot(foamN,L),0.));
          vec3 tint=mix(vec3(.65,.82,.84),vec3(.96),max(solid,foamPattern*.5));
          vec3 foamCol=tint*(ambient*ao+direct*mix(ao,1.,.5));
          foamCol+=uSunCol*lightAmt*pow(max(dot(L,-V),0.),4.)*.12*(1.-solid);
          col=mix(col,foamCol,clamp(foam,0.,.85));
        }

        // Lantern light on the water: a warm glitter path and a soft pool around the canoe
        if (uLantern.w > 0.001) {
          vec3 Lv = uLantern.xyz - vWorld;
          float ld = length(Lv);
          vec3 Ln = Lv / ld;
          float fall = uLantern.w / (1.0 + ld * ld * 0.35);
          vec3 warm = vec3(1.0, 0.62, 0.28);
          col += warm * pow(max(dot(R, Ln), 0.0), 140.0) * fall * 2.2;
          col += warm * max(dot(N, Ln), 0.0) * fall * 0.05;
        }

        // Plankton light traces individual disturbed filaments. It never
        // supplies a uniform blue fill over the sea or an unbroken neon hull rim.
        if (uBio > .01 && dist < 65.0) {
          vec2 flow = vBase*.20-waterWind*uTime*.006;
          float planktonPatch=smoothstep(.34,.71,fbm(flow,3));
          vec2 hullRel=vWorld.xz-uHull.xy;
          vec2 hullRight=vec2(-uHullAx.y,uHullAx.x);
          float hullAlong=dot(hullRel,uHullAx.xy),hullAcross=dot(hullRel,hullRight);
          float section=clamp(abs(hullAlong)/uHullSeg.x,.0,1.0);
          float beam=uHullSeg.y*pow(max(.0,1.0-pow(section,2.3)),.72);
          float edgeDistance=abs(hullAcross)-beam;
          float contact=exp(-pow((edgeDistance-.06)/.15,2.0))*(1.0-smoothstep(2.35,2.9,abs(hullAlong)))*uHull.w;
          float contactPulse=smoothstep(.42,.76,fbm(vBase*5.0-waterWind*uTime*.12,3));
          float hullGlow=contact*contactPulse*(uBoatMotion*.65+uHullSpeed*.15);
          float breaking=smoothstep(.75,1.2,vH/max(uHsWind*.5,.05))*uWhitecap*.14*smoothstep(.6,.87,planktonPatch);
          float luminous=(bioWake+hullGlow+breaking)*mix(.35,1.0,planktonPatch)*uBio;
          float visible=1.0-exp(-luminous*1.6);
          float core=pow(visible,2.5);
          col+=vec3(.006,.36,.55)*visible+vec3(.08,.62,.75)*core*.38;
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

  // Preserve the wave phase beside the boat when forecast periods/directions
  // evolve. Recomputing k*x-omega*t alone would jump farther on long sessions.
  function setWave(i,x,z,length,amplitude){
    const old=waves[i],anchor=uniforms.uHull.value,time=uniforms.uWaveT.value;
    if(seaInitialized&&(old.x!==x||old.y!==z||old.z!==length)){
      const k0=2*Math.PI/old.z,k1=2*Math.PI/length;
      const before=k0*(old.x*anchor.x+old.y*anchor.y)-Math.sqrt(G*k0)*time+phaseOffsets[i];
      const after=k1*(x*anchor.x+z*anchor.y)-Math.sqrt(G*k1)*time;
      phaseOffsets[i]=((before-after+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    }
    old.set(x,z,length,amplitude);
  }

  /** Set the sea state from wind (m/s, direction the wind blows toward, radians) and swell. */
  function setSea(windSpeed, windToRad, swellHs, swellToRad, whitecap, rain, measuredSea = null) {
    const U = Math.max(0.5, windSpeed);
    const Lp = measuredSea ? 9.81 * measuredSea.windWavePeriod**2 / (2*Math.PI) : Math.max(2.2, 0.833 * U * U);
    hsWind = measuredSea ? Math.max(0,measuredSea.windWaveH) : Math.min(6.5, 0.016 * U * U);
    if(measuredSea)windToRad=(measuredSea.windWaveFrom+180)*DEG;
    swellH = swellHs;
    windDir = windToRad;
    swellDir = swellToRad;
    const windLengths=measuredSea?WIND_L.map(L=>L*Math.max(.25,Math.min(4,Lp/85))):WIND_L;
    const a = windLengths.map((L) => L * Math.exp(-0.625 * (L / Lp) ** 2) * (L <= Lp * 1.6 ? 1 : 0.4));
    const s2 = a.reduce((m, v) => m + v * v, 0);
    const scale = s2 > 0 ? (hsWind / 2.83) / Math.sqrt(s2) : 0;
    windLengths.forEach((L, i) => {
      const ang = windToRad + WIND_OFF[i] * DEG;
      setWave(i,Math.sin(ang), -Math.cos(ang), L, a[i] * scale);
    });
    const sw = [0.82, 0.45, 0.3];
    const sn = Math.hypot(...sw);
    SWELL_L.forEach((L, j) => {
      if(measuredSea) L = L * (9.81*measuredSea.swellPeriod**2/(2*Math.PI)) / SWELL_L[0];
      const ang = swellToRad + (j === 1 ? 9 : j === 2 ? 65 : 0) * DEG;
      setWave(WIND_L.length + j,Math.sin(ang), -Math.cos(ang), L, ((swellHs / 2.83) * sw[j]) / sn);
    });
    seaInitialized=true;
    uniforms.uWind.value = U;
    uniforms.uWaterWindDir.value.set(Math.sin(windToRad),-Math.cos(windToRad));
    uniforms.uHsWind.value = hsWind;
    uniforms.uWhitecap.value = whitecap;
    uniforms.uStormChop.value=THREE.MathUtils.smoothstep(U,10,24);
    uniforms.uFoamActivity.value=THREE.MathUtils.clamp(whitecap/.7,0,1);
    uniforms.uRain.value = rain;
  }

  /** Surface height and slope at a world point (for the canoe). */
  function raw(x, z, t, out) {
    let h = 0, sx = 0, sz = 0, dx = 0, dz = 0;
    for (let i=0;i<waves.length;i++) {
      const w=waves[i];
      if (w.w < 1e-4) continue;
      const k = (2 * Math.PI) / w.z;
      const c = Math.sqrt(G / k);
      const ph = k * (w.x * x + w.y * z - c * t) + phaseOffsets[i];
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

  function addRipple(x, z, t, strength, direction=null) {
    ripples[rippleNext].set(x, z, t, strength);
    const axis=uniforms.uHullAx.value;
    rippleAxes[rippleNext].set(direction?.x??axis.x,direction?.z??axis.y);
    if(rippleAxes[rippleNext].lengthSq()<.001)rippleAxes[rippleNext].set(0,-1);
    else rippleAxes[rippleNext].normalize();
    rippleNext = (rippleNext + 1) % ripples.length;
  }

  return { mesh, uniforms, setSea, sample, addRipple, get hsWind() { return hsWind; } };
}
