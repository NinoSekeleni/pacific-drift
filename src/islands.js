// Real islands and coasts rising over the curved horizon, cap clouds over high islands, and seabirds near land.
import * as THREE from 'three';
import { toLocal, distance, bearing, R_EARTH } from './geo.js';
import { LAYER_FAR, LAYER_NEAR, NOISE_GLSL } from './sky.js';

const DEG = Math.PI / 180;
const R_EFF = R_EARTH / (1 - 0.13); // standard atmospheric refraction

/** Distance (m) at which a peak of height H shows above the horizon for an eye at e metres. */
export const visibleRange = (H, e = 1) => 3570 * (Math.sqrt(e) + Math.sqrt(Math.max(H, 1))) * 1.07;

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

function buildMesh(poly, boatLat, boatLng, range) {
  let [x0, y0, x1, y1] = poly.bbox;
  const big = (x1 - x0) * Math.cos(((y0 + y1) / 2) * DEG) * 111 > 160 || (y1 - y0) * 111 > 160;
  if (big) {
    const dLat = range / 111320, dLng = dLat / Math.max(0.1, Math.cos(boatLat * DEG));
    const bl = poly.shift && boatLng < 0 ? boatLng + 360 : boatLng;
    x0 = Math.max(x0, bl - dLng); x1 = Math.min(x1, bl + dLng);
    y0 = Math.max(y0, boatLat - dLat); y1 = Math.min(y1, boatLat + dLat);
    if (x1 <= x0 || y1 <= y0) return null;
  }
  const marginDeg = 0.01;
  x0 -= marginDeg; x1 += marginDeg; y0 -= marginDeg; y1 += marginDeg;
  const anchor = { lat: (y0 + y1) / 2, lng: (x0 + x1) / 2 };
  const widthM = (x1 - x0) * DEG * R_EARTH * Math.cos(anchor.lat * DEG);
  const heightM = (y1 - y0) * DEG * R_EARTH;
  const extent = Math.max(widthM, heightM);
  const N = Math.max(24, Math.min(big ? 150 : 190, Math.ceil(extent / 25)));
  const NX = Math.max(8, Math.round(N * (widthM / extent))), NY = Math.max(8, Math.round(N * (heightM / extent)));
  const cell = Math.max(widthM / NX, heightM / NY);

  // Inside mask by scanline over the full ring
  const pts = poly.pts;
  const n = pts.length / 2;
  const inside = new Uint8Array((NX + 1) * (NY + 1));
  for (let j = 0; j <= NY; j++) {
    const lat = y0 + (y1 - y0) * (j / NY);
    const xs = [];
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const yi = pts[i * 2 + 1], yk = pts[k * 2 + 1];
      if ((yi > lat) !== (yk > lat)) {
        const xi = pts[i * 2], xk = pts[k * 2];
        xs.push(xi + ((lat - yi) * (xk - xi)) / (yk - yi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const a = Math.max(0, Math.ceil(((xs[m] - x0) / (x1 - x0)) * NX));
      const b = Math.min(NX, Math.floor(((xs[m + 1] - x0) / (x1 - x0)) * NX));
      for (let i = a; i <= b; i++) inside[j * (NX + 1) + i] = 1;
    }
  }
  // Distance to coast (cells) by a two-pass chamfer transform
  const W = NX + 1, H = NY + 1;
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = inside[i] ? 1e6 : 0;
  const D1 = 1, D2 = Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!dist[k]) continue;
    let d = dist[k];
    if (i > 0) d = Math.min(d, dist[k - 1] + D1);
    if (j > 0) {
      d = Math.min(d, dist[k - W] + D1);
      if (i > 0) d = Math.min(d, dist[k - W - 1] + D2);
      if (i < W - 1) d = Math.min(d, dist[k - W + 1] + D2);
    }
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) d = Math.min(d, big ? d : 0.5);
    dist[k] = d;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i;
    if (!dist[k]) continue;
    let d = dist[k];
    if (i < W - 1) d = Math.min(d, dist[k + 1] + D1);
    if (j < H - 1) {
      d = Math.min(d, dist[k + W] + D1);
      if (i < W - 1) d = Math.min(d, dist[k + W + 1] + D2);
      if (i > 0) d = Math.min(d, dist[k + W - 1] + D2);
    }
    dist[k] = d;
  }
  let maxD = 0;
  for (let i = 0; i < W * H; i++) if (dist[i] < 1e5) maxD = Math.max(maxD, dist[i]);
  const rin = Math.max(1, maxD) * cell;

  const Htop = poly.height;
  const kind = poly.kind;
  const pos = new Float32Array(W * H * 3);
  const col = new Float32Array(W * H * 3);
  const sand = [0.66, 0.6, 0.48], veg = [0.12, 0.21, 0.09], vegD = [0.07, 0.13, 0.06], rock = [0.29, 0.27, 0.25], snow = [0.9, 0.92, 0.95], ice = [0.83, 0.88, 0.93];
  const tropical = Math.abs(anchor.lat) < 32;
  const seed = poly.id * 0.37;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    const lx = -widthM / 2 + (i / NX) * widthM;
    const lz = heightM / 2 - (j / NY) * heightM; // north is -z
    const dm = Math.min(dist[k], 1e5) * cell;
    let h, c;
    if (!inside[k]) { h = -10; c = sand; }
    else if (kind === 'atoll') {
      const trees = 15 + 9 * fbm2(lx / 60 + seed, lz / 60, 3);
      h = dm < 35 ? 1 + dm * 0.06 : 3 + trees * Math.min(1, (dm - 35) / 30);
      c = dm < 45 ? sand : (fbm2(lx / 25, lz / 25, 2) > 0.5 ? veg : vegD);
    } else if (kind === 'ice') {
      h = 35 + (Htop - 35) * (1 - Math.exp(-dm / 120000)) + 20 * fbm2(lx / 3000, lz / 3000, 3);
      c = ice;
    } else {
      const scale = kind === 'cont' ? Math.min(rin, 60000) : rin;
      const p = 1 - Math.exp(-dm / (0.38 * scale));
      const norm = kind === 'cont' ? 1 : 1 - Math.exp(-1 / 0.38);
      const ridges = 0.7 + 0.6 * fbm2(lx / (scale * 0.35) + seed, lz / (scale * 0.35) - seed, 5);
      h = Math.min(Htop, (Htop * Math.pow(p / norm, 1.25)) * ridges);
      h = Math.max(h, Math.min(dm * 0.25, 30));
      const rel = h / Math.max(Htop, 1);
      if (h > 2800 || (!tropical && h > 1600 + 600 * fbm2(lx / 900, lz / 900, 2))) c = snow;
      else if (dm < 60 && h < 12) c = sand;
      else if (rel > 0.78 && Htop > 900) c = rock;
      else c = fbm2(lx / 400 + seed, lz / 400, 3) > 0.52 ? veg : vegD;
      if (!tropical && c !== snow && c !== sand) c = fbm2(lx / 300, lz / 300, 2) > 0.45 ? [0.2, 0.22, 0.12] : rock;
    }
    pos[k * 3] = lx; pos[k * 3 + 1] = h; pos[k * 3 + 2] = lz;
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  const idx = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * W + i, b = a + 1, cc = a + W, d = cc + 1;
    if (!inside[a] && !inside[b] && !inside[cc] && !inside[d]) continue;
    idx.push(a, cc, b, b, cc, d);
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, anchor, big, window: [x0, y0, x1, y1], rin };
}

export function createIslands(scene, land, skyUniforms) {
  const uniforms = Object.assign({}, skyUniforms, { uFog: { value: new THREE.Vector3() }, uVis: { value: 30000 } });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    vertexShader: /* glsl */`
      varying vec3 vCol;
      varying vec3 vN;
      varying float vDist;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float d = length(wp.xz - cameraPosition.xz);
        float dh = sqrt(2.0 * ${R_EFF.toFixed(1)} * max(cameraPosition.y, 0.5));
        float far = max(d - dh, 0.0);
        wp.y -= far * far / (2.0 * ${R_EFF.toFixed(1)});
        vDist = d;
        vCol = color;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: NOISE_GLSL + /* glsl */`
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec3 uZen;
      uniform vec3 uHor;
      uniform vec3 uSunCol;
      uniform float uMoonLight;
      uniform float uDarkness;
      uniform vec3 uFog;
      uniform float uVis;
      varying vec3 vCol;
      varying vec3 vN;
      varying float vDist;
      void main() {
        vec3 N = normalize(vN);
        float sunUp = smoothstep(-0.05, 0.03, uSunDir.y);
        vec3 amb = mix(uHor * 0.45, uZen * 0.9 + uHor * 0.3, 0.5 + 0.5 * N.y) * (1.0 - 0.4 * uDarkness);
        vec3 lit = uSunCol * max(dot(N, uSunDir), 0.0) * 1.2 * sunUp * (1.0 - 0.75 * uDarkness)
                 + vec3(0.55, 0.6, 0.72) * max(dot(N, uMoonDir), 0.0) * uMoonLight * 0.12 + amb;
        vec3 col = vCol * lit;
        col = mix(col, uFog, 1.0 - exp(-vDist / uVis));
        gl_FragColor = vec4(col, 1.0);
      }`
  });

  const active = new Map(); // poly id -> { mesh, anchor, poly }
  const queue = [];
  let lastScan = { lat: 999, lng: 999, t: 0 };
  let nearest = { d: Infinity, bearing: 0, poly: null };
  const tmp = {};

  function scan(lat, lng) {
    const want = new Set();
    for (const p of land.near(lat, lng, 320000)) {
      const Hs = p.kind === 'atoll' ? 26 : p.height;
      const range = visibleRange(Hs, 1.2) * 1.15 + 3000;
      const cx = Math.max(p.bbox[0], Math.min(p.bbox[2], p.shift && lng < 0 ? lng + 360 : lng));
      const cy = Math.max(p.bbox[1], Math.min(p.bbox[3], lat));
      const d = distance(lat, lng, cy, cx > 180 ? cx - 360 : cx);
      if (d > range) continue;
      want.add(p.id);
      const cur = active.get(p.id);
      if (!cur && !queue.some((q) => q.poly.id === p.id)) queue.push({ poly: p, range });
      // Continental windows follow the canoe
      if (cur && cur.big && distance(lat, lng, cur.anchor.lat, cur.anchor.lng) > range * 0.4 && !queue.some((q) => q.poly.id === p.id)) queue.push({ poly: p, range, replace: true });
    }
    for (const [id, a] of active) {
      if (!want.has(id)) {
        scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        active.delete(id);
      }
    }
    // Nearest coast for land signs
    const nc = land.nearestCoast(lat, lng, 160000);
    nearest = nc.poly ? { d: nc.d, bearing: bearing(lat, lng, nc.lat, nc.lng), poly: nc.poly } : { d: Infinity, bearing: 0, poly: null };
  }

  function buildNext(lat, lng) {
    const job = queue.shift();
    if (!job) return;
    const built = buildMesh(job.poly, lat, lng, job.range);
    const prev = active.get(job.poly.id);
    if (prev) { scene.remove(prev.mesh); prev.mesh.geometry.dispose(); active.delete(job.poly.id); }
    if (!built) return;
    const mesh = new THREE.Mesh(built.geometry, mat);
    mesh.frustumCulled = false;
    mesh.layers.set(LAYER_FAR);
    scene.add(mesh);
    active.set(job.poly.id, { mesh, anchor: built.anchor, poly: job.poly, big: built.big, rin: built.rin });
  }

  /** Per frame: place meshes relative to the render origin, pick render layers, return cloud anchors. */
  function update(lat, lng, origin, camPos, nowMs) {
    if (nowMs - lastScan.t > 4000 || distance(lat, lng, lastScan.lat, lastScan.lng) > 3000) {
      scan(lat, lng);
      lastScan = { lat, lng, t: nowMs };
    }
    if (queue.length) buildNext(lat, lng);
    const anchors = [];
    for (const a of active.values()) {
      toLocal(a.anchor.lat, a.anchor.lng, origin.lat, origin.lng, tmp);
      a.mesh.position.set(tmp.x, 0, tmp.z);
      const d = Math.hypot(tmp.x - camPos.x, tmp.z - camPos.z);
      if (d < 14000 + a.rin) a.mesh.layers.enable(LAYER_NEAR); else a.mesh.layers.disable(LAYER_NEAR);
      if (a.poly.kind === 'high' && a.poly.height > 120 && !a.big) anchors.push({ x: tmp.x - camPos.x, z: tmp.z - camPos.z, r: Math.max(2500, a.rin * 1.6), d });
    }
    anchors.sort((p, q) => p.d - q.d);
    return anchors.slice(0, 4);
  }

  return { uniforms, update, get nearest() { return nearest; }, get activeCount() { return active.size; } };
}

/* ---------------- Seabirds ---------------- */
export function createBirds(scene) {
  const group = new THREE.Group();
  group.layers.set(LAYER_NEAR);
  scene.add(group);
  const mat = new THREE.MeshBasicMaterial({ color: 0x15181b, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.12, 0.55, 0.02, 0.05], 3));
  const birds = [];
  for (let i = 0; i < 10; i++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
    r.scale.x = -1;
    b.add(l, r);
    for (const m of [l, r]) m.layers.set(LAYER_NEAR);
    b.layers.set(LAYER_NEAR);
    b.visible = false;
    group.add(b);
    birds.push({ g: b, l, r, phase: Math.random() * 10, pos: new THREE.Vector3(), dir: 0, alive: false, speed: 11 });
  }
  /**
   * nearest: { d, bearing } to land. Seabirds (terns, noddies) range up to ~60 km from their islands,
   * heading out to sea after dawn and back to land toward dusk.
   */
  function update(dt, cam, nearest, sunAlt) {
    const within = nearest.d < 65000;
    const dusk = sunAlt < 12 && sunAlt > -4;
    const evening = new Date().getUTCHours() >= 0; // direction chosen from the sun's trend below
    const density = within ? (1 - nearest.d / 65000) * (dusk ? 1 : 0.35) : 0;
    for (const b of birds) {
      if (!b.alive) {
        if (Math.random() < density * dt * 0.15) {
          b.alive = true;
          const homeward = b.homeward = Math.random() < 0.75;
          const brg = (nearest.bearing + (homeward ? 0 : 180) + (Math.random() - 0.5) * 30) * DEG;
          b.dir = brg;
          const side = (Math.random() - 0.5) * 160;
          const back = -120;
          b.pos.set(cam.x + Math.sin(brg) * back + Math.cos(brg) * side, 25 + Math.random() * 40, cam.z + Math.cos(brg) * back * -1 + Math.sin(brg) * side);
          b.g.visible = true;
        }
        continue;
      }
      b.pos.x += Math.sin(b.dir) * b.speed * dt;
      b.pos.z += -Math.cos(b.dir) * b.speed * dt;
      b.phase += dt * 6;
      const flap = Math.sin(b.phase) * 0.6;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
      b.g.position.copy(b.pos);
      b.g.rotation.y = -b.dir;
      b.g.scale.setScalar(1.4);
      if (Math.hypot(b.pos.x - cam.x, b.pos.z - cam.z) > 400) { b.alive = false; b.g.visible = false; }
    }
    void evening;
  }
  return { update };
}
