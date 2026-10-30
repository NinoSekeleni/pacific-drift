// The canoe's voyage: state, physics, offline catch-up and saving.
import { weatherAt, currentAt, lowsAt } from './weather.js';
import { distance, R_EARTH } from './geo.js';

const DEG = Math.PI / 180;
let KEY = 'pacific-drift-voyage-v1';
export function useStorageKey(k) { KEY = k; }
export const POINT_NEMO = { lat: -48.8767, lng: -123.3933 };
export const DEFAULT_PLAYLIST = 'spotify:playlist:2crIyukpd3DVtlDBIK8ERM';

export function newVoyage(now = Date.now()) {
  return {
    v: 1,
    lat: POINT_NEMO.lat,
    lng: POINT_NEMO.lng,
    heading: 0,
    sail: false,
    speed: 0,
    t: now,
    start: now,
    weatherClimateLat: POINT_NEMO.lat,
    dist: 0,
    track: [[now, POINT_NEMO.lat, POINT_NEMO.lng]],
    playlist: '',
    nav: false,
    landfall: null
  };
}

export function loadVoyage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.v === 1 && Number.isFinite(s.lat) && Number.isFinite(s.lng)) return s;
  } catch (e) { /* storage unavailable */ }
  return null;
}

export function saveVoyage(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
}

export function clearVoyage() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

const angleDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

/** Sailing speed factor of a small canoe sail by true-wind angle (0 = head to wind). */
function polar(twa) {
  const a = Math.abs(twa);
  if (a < 52) return 0;
  if (a < 75) return 0.42 * ((a - 52) / 23);
  if (a < 100) return 0.42 + 0.1 * ((a - 75) / 25);
  if (a < 140) return 0.52 - 0.02 * ((a - 100) / 40);
  return 0.5 - 0.1 * ((a - 140) / 40);
}

export const PADDLE_SPEED = 1.45; // m/s, a steady single paddler in a Canadian canoe
const MAX_SAIL = 2.7;             // m/s, about 5 knots

/**
 * Advance the voyage by dt seconds.
 * input: { paddle: 0..1, steer: -1..1 }; optional paddleForce supplies
 * the actual immersed stroke instead of the legacy steady speed request.
 * Returns the conditions used, for rendering and audio.
 */
export function step(s, dt, input, land, cache = {}) {
  const t = s.t + dt * 1000;
  if (!cache.lows || Math.abs(cache.lowsT - t) > 30 * 60e3) { cache.lows = lowsAt(t); cache.lowsT = t; }
  const simulated = weatherAt(s.lat, s.lng, t, cache.lows);
  const w = cache.resolveWeather?.(simulated,s.lat,s.lng,t) || simulated;
  const c = currentAt(s.lat, s.lng, t);

  // Steering
  const steerRate = 9 * (0.35 + 0.65 * Math.min(1, s.speed / 1.4)); // degrees per second
  s.heading = (s.heading + input.steer * steerRate * dt + 360) % 360;

  // Speed through the water
  let sailSpeed = 0;
  let twa = angleDiff(w.from, s.heading);
  if (s.sail) {
    const eff = w.speed > 13 ? 13 + (w.speed - 13) * 0.3 : w.speed; // reefed in strong wind
    sailSpeed = Math.min(MAX_SAIL, polar(twa) * eff);
  }
  const physicalStroke=Number.isFinite(input.paddleForce);
  const paddleSpeed = physicalStroke ? 0 : input.paddle * PADDLE_SPEED;
  const target = Math.max(sailSpeed, paddleSpeed) + 0.25 * Math.min(sailSpeed, paddleSpeed);
  const k = 1 - Math.exp(-dt / (target > s.speed ? 7 : 12));
  s.speed += (target - s.speed) * k;
  // A blade supplies a short impulse, followed by the existing hull coasting.
  // Fade its contribution near a brisk paddling speed; sailing remains free
  // to exceed that speed. Slow-motion contact already scales its force.
  if(physicalStroke)s.speed+=Math.max(0,Math.min(1,input.paddleForce))*.72*dt*Math.max(0,1-(s.speed/2.6)**2);

  const hx = Math.sin(s.heading * DEG), hy = Math.cos(s.heading * DEG);
  // Leeway: windage pushes the canoe downwind, more when sailing across the wind
  const windage = 0.022 + (s.sail ? 0.012 * Math.abs(Math.sin(twa * DEG)) : 0);
  const ve = hx * s.speed + c.u + w.u * windage;
  const vn = hy * s.speed + c.v + w.v * windage;

  const prevLat = s.lat, prevLng = s.lng;
  s.lat += (vn * dt) / (R_EARTH * DEG);
  s.lng += (ve * dt) / (R_EARTH * DEG * Math.max(0.05, Math.cos(s.lat * DEG)));
  if (s.lng > 180) s.lng -= 360;
  if (s.lng < -180) s.lng += 360;
  s.lat = Math.max(-85, Math.min(85, s.lat));
  s.dist += distance(prevLat, prevLng, s.lat, s.lng);
  s.t = t;

  // Dead reckoning: what a navigator would plot from compass heading and speed through the water.
  // Currents and leeway are invisible to it, so the estimate slowly parts from the truth.
  s.estDist = (s.estDist || 0) + s.speed * dt;
  if (!s.est) s.est = { lat: s.lat, lng: s.lng, track: [[t, +s.lat.toFixed(4), +s.lng.toFixed(4)]] };
  s.est.lat += (hy * s.speed * dt) / (R_EARTH * DEG);
  s.est.lng += (hx * s.speed * dt) / (R_EARTH * DEG * Math.max(0.05, Math.cos(s.est.lat * DEG)));
  if (s.est.lng > 180) s.est.lng -= 360;
  if (s.est.lng < -180) s.est.lng += 360;

  if (!s.track.length || t - s.track[s.track.length - 1][0] > 600e3) {
    s.track.push([t, +s.lat.toFixed(4), +s.lng.toFixed(4)]);
    s.est.track.push([t, +s.est.lat.toFixed(4), +s.est.lng.toFixed(4)]);
  }

  if (land) {
    const hit = land.landAt(s.lat, s.lng);
    if (hit) {
      s.lat = prevLat;
      s.lng = prevLng;
      s.speed = 0;
      s.landfall = { t, name: hit.name || 'an unnamed shore', lat: s.lat, lng: s.lng, kind: hit.kind };
      s.track.push([t, +s.lat.toFixed(4), +s.lng.toFixed(4)]);
    }
  }
  return { w, c, sog: Math.hypot(ve, vn), ve, vn, twa };
}

/** Replay the time nobody was aboard. The lashed steering oar holds the heading. */
export function catchUp(s, now, land, onStep, providers = {}) {
  const from = s.t, fromDist = s.dist;
  const cache = {...providers};
  const STEP = 60;
  let n = 0;
  while (!s.landfall && now - s.t > STEP * 1000) {
    const conditions = step(s, STEP, { paddle: 0, steer: 0 }, land, cache);
    onStep?.(conditions);
    if (++n > 400000) break;
  }
  if (!s.landfall && now - s.t > 0) {
    const conditions = step(s, (now - s.t) / 1000, { paddle: 0, steer: 0 }, land, cache);
    onStep?.(conditions);
  }
  return { away: now - from, distance: s.dist - fromDist, landed: !!s.landfall };
}
