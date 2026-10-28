// Builds compact land, island-height and sky data for the game from Natural Earth (world-atlas) and d3-celestial.
import fs from 'fs';
import * as topo from 'topojson-client';

const NM = new URL('../node_modules/', import.meta.url).pathname;
const OUT = new URL('../public/data/', import.meta.url).pathname;

/* ---------- Land ---------- */
const land = JSON.parse(fs.readFileSync(NM + 'world-atlas/land-10m.json'));
const geo = topo.feature(land, land.objects.land);
let rings = [];
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const p of polys) rings.push(p[0]); // outer rings only; lakes don't matter at sea
}

function simplify(pts, tol) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const areaKm2 = (r) => {
  let a = 0;
  const lat0 = r[0][1] * Math.PI / 180;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2) * 111.32 * 111.32 * Math.cos(lat0);
};
const bbox = (r) => {
  let b = [1e9, 1e9, -1e9, -1e9];
  for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
};
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Named islands and landmasses with their highest point (m). kind: atoll | high | cont | ice
const NAMED = [
  ['Pitcairn Island', -130.10, -25.07, 347, 'high'], ['Henderson Island', -128.32, -24.37, 33, 'high'],
  ['Ducie Island', -124.79, -24.67, 4, 'atoll'], ['Oeno Island', -130.74, -23.93, 5, 'atoll'],
  ['Rapa Nui (Easter Island)', -109.35, -27.12, 507, 'high'], ['Isla Salas y Gómez', -105.36, -26.47, 30, 'high'],
  ['Mangareva', -134.97, -23.12, 441, 'high'], ['Rapa Iti', -144.33, -27.62, 650, 'high'],
  ['Raivavae', -147.65, -23.87, 437, 'high'], ['Tubuai', -149.48, -23.36, 422, 'high'],
  ['Rurutu', -151.35, -22.47, 389, 'high'], ['Rimatara', -152.81, -22.65, 83, 'high'],
  ['Tahiti', -149.43, -17.65, 2241, 'high'], ['Moorea', -149.83, -17.53, 1207, 'high'],
  ['Bora Bora', -151.74, -16.50, 727, 'high'], ['Raiatea', -151.45, -16.83, 1017, 'high'],
  ['Huahine', -151.0, -16.75, 669, 'high'], ['Nuku Hiva', -140.14, -8.86, 1224, 'high'],
  ['Hiva Oa', -139.0, -9.77, 1213, 'high'], ['Ua Pou', -140.08, -9.40, 1230, 'high'],
  ['Fatu Hiva', -138.64, -10.47, 960, 'high'], ['Rarotonga', -159.78, -21.23, 652, 'high'],
  ['Aitutaki', -159.79, -18.86, 124, 'high'], ['Mangaia', -157.92, -21.92, 169, 'high'],
  ['Niue', -169.87, -19.05, 68, 'high'], ['Tongatapu', -175.2, -21.17, 65, 'high'],
  ['ʻEua', -174.95, -21.38, 312, 'high'], ['Vavaʻu', -174.0, -18.65, 204, 'high'],
  ['Upolu', -171.75, -13.92, 1113, 'high'], ['Savaiʻi', -172.4, -13.6, 1858, 'high'],
  ['Tutuila', -170.7, -14.3, 653, 'high'], ['Viti Levu', 178.0, -17.8, 1324, 'high'],
  ['Vanua Levu', 179.4, -16.6, 1111, 'high'], ['Hawaiʻi Island', -155.5, 19.6, 4207, 'high'],
  ['Maui', -156.3, 20.8, 3055, 'high'], ['Oʻahu', -158.0, 21.45, 1220, 'high'],
  ['Kauaʻi', -159.5, 22.05, 1598, 'high'], ['Molokaʻi', -157.0, 21.13, 1512, 'high'],
  ['Lānaʻi', -156.93, 20.83, 1026, 'high'], ['Isabela, Galápagos', -91.1, -0.8, 1707, 'high'],
  ['Santa Cruz, Galápagos', -90.35, -0.65, 864, 'high'], ['San Cristóbal, Galápagos', -89.5, -0.85, 730, 'high'],
  ['Fernandina, Galápagos', -91.55, -0.37, 1476, 'high'], ['Robinson Crusoe Island', -78.83, -33.64, 916, 'high'],
  ['Alejandro Selkirk Island', -80.77, -33.77, 1268, 'high'], ['San Félix', -80.1, -26.28, 193, 'high'],
  ['San Ambrosio', -79.9, -26.34, 479, 'high'], ['Cocos Island', -87.06, 5.53, 575, 'high'],
  ['Clipperton Island', -109.21, 10.30, 29, 'atoll'], ['Chatham Island', -176.5, -43.9, 294, 'high'],
  ['North Island, New Zealand', 175.5, -39.0, 2797, 'high'], ['South Island, New Zealand', 170.5, -43.5, 3724, 'high'],
  ['Raoul Island', -177.92, -29.27, 516, 'high'], ['Norfolk Island', 167.95, -29.03, 319, 'high'],
  ['Lord Howe Island', 159.08, -31.55, 875, 'high'], ['New Caledonia', 165.5, -21.3, 1628, 'high'],
  ['Kiritimati', -157.4, 1.87, 13, 'atoll'],
  ['The Americas', -60, -15, 4500, 'cont'],
  ['Antarctica', 0, -85, 2500, 'ice'], ['Australia', 135, -25, 1200, 'cont'], ['Asia', 90, 50, 2000, 'cont'], ['Japan', 138.5, 36.0, 3776, 'high'], ['New Guinea', 143, -6, 4800, 'high']
];
// Tiny islands that Natural Earth may omit: [name, lng, lat, radius km, height, kind]
const EXTRA = [
  ['Isla Salas y Gómez', -105.36, -26.47, 0.35, 30, 'high'], ['Marotiri', -143.53, -27.92, 0.15, 105, 'high'],
  ['Morane', -137.13, -23.16, 0.9, 4, 'atoll'], ['Temoe', -134.48, -23.34, 1.2, 4, 'atoll'],
  ['Maria Atoll (Austral)', -154.68, -21.80, 1.0, 4, 'atoll']
];

const inWindow = ([x, y]) => y >= -80 && y <= 60 && (x >= 105 || x <= -68);
const centralBox = (b) => (b[0] <= -70 || b[0] >= 140) && b[3] >= -62 && b[1] <= 40;
const inPacific = (b, r) => r.some(inWindow);

const polys = [];
for (let r0 of rings) {
  let b = bbox(r0);
  if (!inPacific(b, r0)) continue;
  const area = areaKm2(r0);
  if (!centralBox(b) && area < 3) continue;
  // Rings cut by the antimeridian (Fiji and friends): make them continuous by shifting west longitudes east.
  if (b[2] - b[0] > 180 && b[3] > -60 && r0.length < 20000) {
    r0 = r0.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
    b = bbox(r0);
  }
  const tol = r0.length > 20000 ? 0.06 : r0.length > 3000 ? 0.025 : r0.length > 400 ? 0.006 : 0.0015;
  let r = simplify(r0, tol);
  if (r.length < 4) r = r0;
  let name = '', H = area < 15 ? 5 : area < 200 ? 150 : 400, kind = area < 15 ? 'atoll' : 'high';
  if (b[3] < -60) { name = 'Antarctica'; H = 2500; kind = 'ice'; }
  if (!name) for (const [n, x, y, h, k] of NAMED) {
    if (x >= b[0] - 0.05 && x <= b[2] + 0.05 && y >= b[1] - 0.05 && y <= b[3] + 0.05) {
      const inside = inRing(x, y, r0);
      let near = inside;
      if (!near) for (const [px, py] of r0) if (Math.hypot((px - x) * Math.cos(y * Math.PI / 180), py - y) < 0.12) { near = true; break; }
      if (near) { name = n; H = h; kind = k; break; }
    }
  }
  const flat = [];
  let px = 0, py = 0;
  for (const [x, y] of r) {
    const ix = Math.round(x * 1e4), iy = Math.round(y * 1e4);
    flat.push(ix - px, iy - py);
    px = ix; py = iy;
  }
  polys.push({ n: name, h: H, k: kind, b: b.map((v) => Math.round(v * 1e4) / 1e4), c: flat });
}
for (const [n, x, y, rad, h, k] of EXTRA) {
  const covered = polys.some((p) => p.n === n) || rings.some((r) => { const b = bbox(r); return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRing(x, y, r); });
  if (covered) continue;
  const flat = [];
  let px = 0, py = 0;
  const dLat = rad / 111.32, dLng = rad / (111.32 * Math.cos(y * Math.PI / 180));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const ix = Math.round((x + Math.cos(a) * dLng) * 1e4), iy = Math.round((y + Math.sin(a) * dLat) * 1e4);
    flat.push(ix - px, iy - py); px = ix; py = iy;
  }
  polys.push({ n, h, k, b: [x - dLng, y - dLat, x + dLng, y + dLat], c: flat });
  console.log('added tiny island', n);
}
fs.writeFileSync(OUT + 'land.json', JSON.stringify({ v: 1, polys }));
console.log('land polys', polys.length, (fs.statSync(OUT + 'land.json').size / 1024).toFixed(0) + ' KB', 'named', polys.filter((p) => p.n).length);

/* ---------- Sky ---------- */
const stars = JSON.parse(fs.readFileSync(NM + 'd3-celestial/data/stars.6.json'));
const s = [];
for (const f of stars.features) {
  const [ra, dec] = f.geometry.coordinates;
  s.push(Math.round(((ra + 360) % 360) * 100) / 100, Math.round(dec * 100) / 100, f.properties.mag, Math.round(parseFloat(f.properties.bv || 0.6) * 100) / 100);
}
const lines = JSON.parse(fs.readFileSync(NM + 'd3-celestial/data/constellations.lines.json'));
const L = {};
for (const f of lines.features) L[f.id] = f.geometry.coordinates.map((seg) => seg.map(([ra, dec]) => [Math.round(((ra + 360) % 360) * 100) / 100, Math.round(dec * 100) / 100]));
const names = JSON.parse(fs.readFileSync(NM + 'd3-celestial/data/constellations.json'));
const N = {};
for (const f of names.features) {
  const [ra, dec] = f.geometry.coordinates;
  N[f.id] = { name: f.properties.en || f.properties.name, ra: ((ra + 360) % 360), dec, rank: +f.properties.rank };
}
const sn = JSON.parse(fs.readFileSync(NM + 'd3-celestial/data/starnames.json'));
// Bright named stars useful for navigation
const navNames = {};
const byHip = {};
for (const [id, v] of Object.entries(sn)) if (v.name) byHip[id] = v.name;
const sf = [];
for (const f of stars.features) if (f.properties.mag < 1.6 && byHip[f.id]) {
  const [ra, dec] = f.geometry.coordinates;
  sf.push({ name: byHip[f.id], ra: (ra + 360) % 360, dec, mag: f.properties.mag });
}
fs.writeFileSync(OUT + 'sky.json', JSON.stringify({ stars: s, lines: L, names: N, bright: sf }));
console.log('stars', s.length / 4, 'constellations', Object.keys(L).length, 'bright named', sf.length, (fs.statSync(OUT + 'sky.json').size / 1024).toFixed(0) + ' KB');
