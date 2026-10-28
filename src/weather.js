// Deterministic Pacific weather and ocean currents.
// Climatology follows the real belts (westerlies, trades, doldrums, subtropical highs) and the real
// surface currents; travelling lows and convective squalls are generated from seeded space-time cells,
// so the same place and moment always gives the same weather, online or offline.
import { wrapLng } from './geo.js';

const DEG = Math.PI / 180;
const DAY = 864e5;
const KM_PER_DEG = 111.32;

function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      let f = (x - x0) / (x1 - x0);
      f = f * f * (3 - 2 * f);
      return y0 + (y1 - y0) * f;
    }
  }
  return table[table.length - 1][1];
}
// Smooth value noise in time for gusts and slow wobble.
function tnoise(t, seed) {
  const i = Math.floor(t), f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

// Mean surface wind (m/s, u east, v north) by latitude for the Pacific.
const U_TAB = [[-72, -3], [-62, 5], [-52, 9.5], [-46, 9], [-40, 7], [-35, 3.5], [-30, 0], [-25, -4], [-20, -6], [-14, -6.5], [-8, -6], [-3, -4.5], [1, -3], [5, -1.2], [9, -5], [14, -7], [20, -6.5], [25, -4], [30, 0], [35, 4], [42, 7.5], [50, 8], [58, 5], [65, 2]];
const V_TAB = [[-72, 1], [-62, -0.5], [-52, -1], [-40, -1], [-35, -0.5], [-30, 1], [-25, 2.5], [-18, 3], [-10, 2.5], [-3, 1.5], [3, 0], [8, -2.5], [15, -3], [22, -2.5], [28, -0.5], [35, 0.5], [45, 1], [55, 0], [65, 0]];
// Base cloud cover and cloud-top height by latitude
const COV_TAB = [[-70, 0.7], [-55, 0.68], [-45, 0.58], [-35, 0.36], [-28, 0.3], [-20, 0.38], [-10, 0.42], [-2, 0.55], [5, 0.62], [10, 0.45], [18, 0.36], [28, 0.3], [35, 0.4], [45, 0.6], [60, 0.7]];
const TOP_TAB = [[-60, 2600], [-45, 2400], [-32, 1700], [-20, 2100], [-8, 3200], [5, 5500], [12, 2600], [25, 1800], [35, 2200], [50, 2600]];

function seasonShift(t) {
  const doy = ((t / DAY) % 365.25 + 365.25) % 365.25;
  return 4.5 * Math.sin(((doy - 110) / 365.25) * 2 * Math.PI);
}

/** Mean wind for a place and season (without passing weather systems). */
function climateWind(lat, lng, t) {
  const s = seasonShift(t);
  const tropic = Math.exp(-((lat / 32) ** 2));
  const la = lat - s * tropic;
  let u = interp(U_TAB, la);
  let v = interp(V_TAB, la);
  // South Pacific High: south-easterlies up the coast of Chile and Peru
  const g = Math.exp(-(((wrapLng(lng + 88)) / 18) ** 2) - (((lat + 27) / 11) ** 2));
  u -= 2.5 * g;
  v += 4.5 * g;
  // North Pacific High: northerlies down the coast of California
  const g2 = Math.exp(-(((wrapLng(lng + 128)) / 14) ** 2) - (((lat - 32) / 9) ** 2));
  u -= 1 * g2;
  v -= 4 * g2;
  return { u, v };
}

/** Mean surface current (m/s, u east, v north). */
export function currentAt(lat, lng, t) {
  let u = 0, v = 0;
  const band = (c, w) => Math.exp(-(((lat - c) / w) ** 2));
  u += 0.22 * smooth(-44, -55, lat) * smooth(-72, -62, lat); // Antarctic Circumpolar / West Wind Drift
  u += 0.1 * band(-42, 5);                                // South Pacific Current
  u -= 0.42 * band(-4, 6);                                // South Equatorial Current
  u += 0.35 * band(6.5, 2.2);                             // North Equatorial Counter-Current
  u -= 0.22 * band(15, 4.5);                              // North Equatorial Current
  u += 0.12 * band(41, 5);                                // North Pacific Current
  // Humboldt Current along South America
  const hum = smooth(-70, -80, wrapLng(lng)) * band(-25, 15);
  v += 0.22 * hum;
  u -= 0.05 * hum;
  // California Current
  v -= 0.15 * smooth(-132, -122, wrapLng(lng)) * band(32, 10);
  // East Australian Current and Kuroshio, western boundaries
  v -= 0.45 * smooth(156, 151, lng) * (lng > 140 ? 1 : 0) * band(-28, 7);
  const kur = (lng > 120 && lng < 150 ? 1 : 0) * band(32, 6);
  u += 0.6 * kur;
  v += 0.4 * kur;
  // Mesoscale eddies
  const e = 0.07;
  const ex = lng * 1.3, ey = lat * 1.3, et = t / (DAY * 40);
  u += e * Math.sin(ey * 1.7 + Math.sin(ex * 1.1 + et));
  v += e * Math.cos(ex * 1.9 + Math.cos(ey * 0.9 - et));
  return { u, v };
}

const LOW_SLOT = 2.3 * DAY;
/** Travelling mid-latitude lows near a moment (both hemispheres). */
export function lowsAt(t) {
  const out = [];
  const k0 = Math.floor(t / LOW_SLOT);
  for (const hemi of [-1, 1]) {
    for (let k = k0 - 4; k <= k0; k++) {
      for (let j = 0; j < 3; j++) {
        const h = (n) => hash(k, j * 7 + n, hemi + 5);
        const born = k * LOW_SLOT + h(1) * LOW_SLOT;
        const life = (4.5 + h(2) * 3) * DAY;
        const age = t - born;
        if (age < 0 || age > life) continue;
        const lat0 = hemi * (44 + h(3) * 14);
        const speed = 9 + h(4) * 6; // m/s eastward
        const lng0 = -180 + h(5) * 360;
        const ageS = age / 1000;
        const lat = lat0 + hemi * ageS * 1.2e-5 * (0.5 + h(6));
        const lng = wrapLng(lng0 + (speed * ageS) / (KM_PER_DEG * 1000 * Math.cos(lat * DEG)));
        const f = age / life;
        const intensity = Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.15)), 1.2) * (0.55 + 0.65 * h(7));
        out.push({ lat, lng, radius: (850 + h(8) * 650) * 1000, intensity, hemi, speed, pressure: Math.round(1012 - intensity * 38) });
      }
    }
  }
  return out;
}

/** Full weather at a place and moment. */
export function weatherAt(lat, lng, t, lows = lowsAt(t)) {
  const base = climateWind(lat, lng, t);
  let u = base.u, v = base.v;
  let cover = interp(COV_TAB, lat - seasonShift(t) * Math.exp(-((lat / 32) ** 2)));
  let top = interp(TOP_TAB, lat);
  let precip = 0, cirrus = 0.12, dark = 0;
  let gradE = 0, gradN = 0; // cloud-cover gradient per metre, so approaching weather shows on one side of the sky
  const coslat = Math.cos(lat * DEG);

  for (const L of lows) {
    const dx = wrapLng(lng - L.lng) * KM_PER_DEG * 1000 * coslat;
    const dy = (lat - L.lat) * KM_PER_DEG * 1000;
    const r = Math.hypot(dx, dy);
    if (r > L.radius * 3.2) continue;
    const q = r / L.radius;
    const vt = L.intensity * 12 * q * Math.exp(0.5 * (1 - q * q));
    const rr = Math.max(r, 1);
    // Cyclonic: anticlockwise in the north, clockwise in the south, with inflow
    let tx = (-dy / rr) * (L.hemi > 0 ? 1 : -1), ty = (dx / rr) * (L.hemi > 0 ? 1 : -1);
    const inflow = 0.33;
    u += vt * (tx - inflow * (dx / rr));
    v += vt * (ty - inflow * (dy / rr));
    // Cloud: a broad shield ahead (east) of the low and the cold front trailing equatorward
    const ahead = Math.exp(-(((dx - 0.45 * L.radius) ** 2) + dy * dy) / (L.radius * L.radius));
    const frontAx = dx - 0.15 * L.radius + (dy * L.hemi) * 0.6;
    const front = Math.exp(-((frontAx / (0.18 * L.radius)) ** 2)) * Math.exp(-((((dy * -L.hemi) - 0.5 * L.radius) / (0.9 * L.radius)) ** 2));
    const core = Math.exp(-(q * q) / 0.5);
    const c = L.intensity * (0.55 * ahead + 0.5 * front + 0.4 * core);
    cover += c;
    precip += L.intensity * (0.55 * front + 0.4 * core * ahead + 0.25 * ahead * ahead);
    cirrus += L.intensity * 0.7 * Math.exp(-(((dx - 1.25 * L.radius) ** 2) + dy * dy) / ((0.9 * L.radius) ** 2));
    top += L.intensity * 3000 * (ahead + front);
    dark += L.intensity * (0.6 * front + 0.45 * core);
    // Direction toward the thicker cloud
    const gscale = (L.intensity * 0.5) / L.radius;
    gradE += -((dx - 0.45 * L.radius) / L.radius) * ahead * gscale;
    gradN += -(dy / L.radius) * ahead * gscale;
  }

  // Convective squalls in space-time cells, drifting with the wind
  const tropicSq = Math.exp(-(((lat - 4) / 14) ** 2));
  const pSquall = 0.06 + 0.3 * tropicSq;
  const CELLD = 1.2; // degrees
  const CELLT = 3 * 3600e3;
  const ci = Math.floor(lng / CELLD), cj = Math.floor(lat / CELLD), ck = Math.floor(t / CELLT);
  let gust = 0;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 0; dk++) {
    const a = ci + di, b = cj + dj, c = ck + dk;
    if (hash(a, b, c * 3 + 1) > pSquall) continue;
    const born = c * CELLT + hash(a, b, c * 3 + 2) * CELLT;
    const life = (1.5 + hash(a, c, b) * 2.5) * 3600e3;
    const age = t - born;
    if (age < 0 || age > life) continue;
    const cLat = (b + hash(b, a, c)) * CELLD + (base.v * age / 1000) / (KM_PER_DEG * 1000);
    const cLng = (a + hash(c, b, a)) * CELLD + (base.u * age / 1000) / (KM_PER_DEG * 1000 * coslat);
    const dx = wrapLng(lng - cLng) * KM_PER_DEG * 1000 * coslat;
    const dy = (lat - cLat) * KM_PER_DEG * 1000;
    const radius = (6 + hash(a + 3, b, c) * 14) * 1000;
    const life01 = age / life;
    const I = Math.sin(Math.PI * life01) * (0.6 + 0.6 * hash(a, b + 9, c));
    const r2 = (dx * dx + dy * dy) / (radius * radius);
    const e = Math.exp(-r2);
    precip += I * e;
    cover += I * 0.6 * Math.exp(-r2 / 4);
    top += I * 4000 * Math.exp(-r2 / 3);
    dark += I * 0.7 * e;
    gust += I * Math.exp(-r2 / 2.2);
    const rr = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    u += I * 6 * (dx / rr) * Math.exp(-r2 / 2);
    v += I * 6 * (dy / rr) * Math.exp(-r2 / 2);
    const g = (I * 0.5) / radius;
    gradE += -(dx / radius) * Math.exp(-r2 / 4) * g;
    gradN += -(dy / radius) * Math.exp(-r2 / 4) * g;
  }

  // Gusts and slow wobble
  const n1 = tnoise(t / 40e3, 11) - 0.5, n2 = tnoise(t / 7e5, 12) - 0.5;
  const sp0 = Math.hypot(u, v);
  const gf = 1 + 0.22 * n1 + 0.15 * n2 + 0.35 * gust;
  const turn = (tnoise(t / 9e5, 13) - 0.5) * 0.35;
  const cu = Math.cos(turn), su = Math.sin(turn);
  const u2 = (u * cu - v * su) * gf, v2 = (u * su + v * cu) * gf;
  const speed = Math.hypot(u2, v2);

  cover = Math.max(0.05, Math.min(0.97, cover));
  precip = Math.max(0, Math.min(1.2, precip));
  dark = Math.max(0, Math.min(1, dark + Math.max(0, cover - 0.75) * 0.8));

  // Swell from distant storms: Southern Ocean swell from the south-west, North Pacific from the north-west
  const southSwell = smooth(-8, -45, lat);
  const northSwell = smooth(8, 40, lat);
  const tropSwell = 1 - southSwell - northSwell;
  const swellH = 0.9 + 2.6 * southSwell + 1.8 * northSwell + 0.4 * tropSwell;
  const swellFrom = southSwell > northSwell ? 230 : northSwell > 0.2 ? 310 : 195;

  const visibility = (lat > -45 && lat < 45 ? 38000 : 26000) / (1 + 12 * precip) ;

  return {
    u: u2, v: v2, speed,
    from: ((Math.atan2(-u2, -v2) / DEG) + 360) % 360, // direction the wind blows from
    cover, precip, cirrus: Math.min(0.9, cirrus), dark,
    cloudBase: 900 - 450 * Math.min(1, dark + precip * 0.5),
    cloudTop: Math.min(9000, top),
    gradE, gradN,
    swellH, swellFrom,
    visibility,
    base: sp0
  };
}

/** Plain-language marine forecast of the active lows near the South and Central Pacific. */
export function marineBulletin(t) {
  const lows = lowsAt(t).filter((L) => L.intensity > 0.35 && (L.lng < -70 || L.lng > 150));
  const fmt = (L) => {
    const la = Math.round(Math.abs(L.lat)), lo = Math.round(Math.abs(L.lng));
    return `Low, ${L.pressure} hectopascals, near ${la} ${L.lat < 0 ? 'south' : 'north'}, ${lo} ${L.lng < 0 ? 'west' : 'east'}, moving east at ${Math.round(L.speed * 1.94)} knots.`;
  };
  const strong = lows.filter((L) => L.intensity > 0.35).slice(0, 4).map(fmt);
  const lines = ['Pacific high seas forecast.'];
  if (strong.length) lines.push(...strong);
  else lines.push('No significant lows in the forecast area.');
  lines.push('South-east trades, 15 to 20 knots, between 25 south and the equator.', 'Westerlies 25 to 35 knots south of 45 south, with heavy swell.');
  return lines.join(' ');
}
