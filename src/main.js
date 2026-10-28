import * as THREE from 'three';
import { Land, toLocal, distance } from './geo.js';
import { skyBodies, bodyDir, equatorialToLocal } from './astro.js';
import { newVoyage, loadVoyage, saveVoyage, clearVoyage, step, catchUp, useStorageKey } from './voyage.js';
import { createSky, palette, LAYER_FAR, LAYER_NEAR } from './sky.js';
import { createOcean } from './ocean.js';
import { createIslands, createBirds } from './islands.js';
import { createCanoe, HULL_MASK } from './canoe.js';
import { createRain } from './rain.js';
import { createAudio } from './audio.js';
import { createRadio } from './radio.js';
import { createCompass } from './compass.js';
import { drawVoyageChart } from './landfall.js';
import { createMinimap } from './minimap.js';
import { createSpray } from './spray.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

THREE.ColorManagement.enabled = false;
const DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
if (DEBUG) useStorageKey('pacific-drift-debug'); // test runs never touch a player's real voyage
const $ = (id) => document.getElementById(id);
const BASE = import.meta.env.BASE_URL;

function fail(msg) {
  const el = $('fail');
  el.textContent = msg;
  el.hidden = false;
  throw new Error(msg);
}

/* ---------- Clock (debug can shift it) ---------- */
let timeShift = 0;
if (DEBUG && params.get('time')) {
  const t = Date.parse(params.get('time'));
  if (Number.isFinite(t)) timeShift = t - Date.now();
}
const now = () => Date.now() + timeShift;

/* ---------- Renderer ---------- */
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fail('This browser could not start WebGL, which Pacific Drift needs. Try a current version of Chrome, Edge, Firefox or Safari.');
}
if (!renderer.capabilities.isWebGL2) fail('This browser lacks WebGL 2, which the clouds need. Try a current version of Chrome, Edge, Firefox or Safari.');
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.4 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const aspect = window.innerWidth / window.innerHeight;
const camNear = new THREE.PerspectiveCamera(68, aspect, 0.08, 16000);
camNear.layers.set(LAYER_NEAR);
const camFar = new THREE.PerspectiveCamera(68, aspect, 30, 420000);
camFar.layers.set(LAYER_FAR);

const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
hemi.layers.enableAll();
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.layers.enableAll();
scene.add(sunLight, sunLight.target);

const sky = createSky(renderer, scene, isTouch);
const ocean = createOcean(renderer, scene, sky.uniforms);
const canoe = createCanoe(scene);
ocean.uniforms.uHullSeg.value.set(...HULL_MASK.seg, 0);
ocean.uniforms.uAmaSeg.value.set(...HULL_MASK.ama);
const rain = createRain(scene);
const spray = createSpray(scene);
const birds = createBirds(scene);
const audio = createAudio();
const compass = createCompass($('compass'));

/* ---------- UI helpers ---------- */
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function humanDuration(ms) {
  const m = Math.round(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const parts = [];
  if (d) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (!d && mm) parts.push(`${mm} ${mm === 1 ? 'minute' : 'minutes'}`);
  return parts.length ? parts.join(' and ').replace(/ and (?=.* and )/, ', ') : 'a moment';
}

/* ---------- Voyage ---------- */
let voyage = loadVoyage();
let land = null;
let started = false;
let paused = true;
let landfallShown = false;
const simCache = {};
let cond = null;
let nightNow = false;

const radio = createRadio({
  audio,
  toast,
  getState: () => (voyage ? { lat: voyage.lat, lng: voyage.lng, heading: voyage.heading, night: nightNow, playlist: voyage.playlist } : { lat: 0, lng: 0, heading: 0, night: false, playlist: '' }),
  onPlaylist: (p) => { voyage.playlist = p; saveVoyage(voyage); }
});

/* ---------- Input ---------- */
const keys = new Set();
let yawRel = 0, pitch = -4 * DEG;
let locked = false, dragMode = false, dragging = false, lastX = 0, lastY = 0;
const touchInput = { paddle: false, left: false, right: false };
const LIMIT = 80 * DEG;
function look(dx, dy, sens) {
  yawRel -= dx * sens;
  yawRel = Math.max(-170 * DEG, Math.min(170 * DEG, yawRel));
  pitch = Math.max(-LIMIT, Math.min(LIMIT, pitch - dy * sens));
}
function requestLock() {
  if (isTouch) return;
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { dragMode = true; });
    setTimeout(() => { if (!locked) dragMode = true; }, 400);
  } catch (e) { dragMode = true; }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { dragMode = false; return; }
  if (started && !radio.open && !dragMode) pause();
});
document.addEventListener('pointerlockerror', () => { dragMode = true; });
document.addEventListener('mousemove', (e) => {
  if (locked) look(e.movementX, e.movementY, 0.0021);
  else if (dragging) { look(e.clientX - lastX, e.clientY - lastY, 0.0042); lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('mousedown', (e) => {
  if (!started || paused) return;
  if (radio.open) { radio.setOpen(false); }
  if (!locked && !dragMode) { requestLock(); return; }
  if (dragMode) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
});
window.addEventListener('mouseup', () => { dragging = false; });

function toggleSail() {
  voyage.sail = !voyage.sail;
  toast(voyage.sail ? 'Sail raised. With the steering oar lashed, the canoe holds its heading.' : 'Sail lowered. The canoe will drift with the wind and current.');
  saveVoyage(voyage);
}
function toggleStars() {
  sky.setLines(!sky.linesOn);
  toast(sky.linesOn ? 'Star chart on: constellations and navigation stars are named.' : 'Star chart off.');
}
function toggleLantern() {
  voyage.lantern = !lanternOn;
  toast(voyage.lantern ? 'Lantern lit.' : 'Lantern out. Your eyes will adjust to the starlight.');
  saveVoyage(voyage);
}
function toggleRadio() {
  radio.toggle();
  if (radio.open && locked) document.exitPointerLock();
}

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (!started || paused) {
    if (e.code === 'Enter' && !$('begin').hidden && document.activeElement === document.body) begin();
    return;
  }
  if (radio.key(e.code)) { e.preventDefault(); return; }
  keys.add(e.code);
  if (e.code === 'KeyE') toggleSail();
  if (e.code === 'KeyR') toggleRadio();
  if (e.code === 'KeyC') toggleStars();
  if (e.code === 'KeyL') toggleLantern();
  if (e.code === 'KeyN') { $('mapWrap').hidden = !$('mapWrap').hidden; }
  if (e.code === 'KeyH') { $('controlsHud').hidden = !$('controlsHud').hidden; }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') minimap && minimap.zoom(-1);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') minimap && minimap.zoom(1);
  if (e.code === 'KeyM') { audio.setMuted(!audio.muted); toast(audio.muted ? 'Sound off.' : 'Sound on.'); }
  if (e.code === 'Escape' && dragMode) pause();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Touch: on-screen controls plus drag to look
const lookTouch = { id: null, x: 0, y: 0 };
window.addEventListener('touchstart', (e) => {
  if (!started || paused) return;
  for (const t of e.changedTouches) {
    if (t.target.closest && t.target.closest('.touch, .radio, .hud-btn')) continue;
    if (lookTouch.id === null) { lookTouch.id = t.identifier; lookTouch.x = t.clientX; lookTouch.y = t.clientY; }
  }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouch.id) {
      look(t.clientX - lookTouch.x, t.clientY - lookTouch.y, 0.005);
      lookTouch.x = t.clientX; lookTouch.y = t.clientY;
    }
  }
}, { passive: true });
const endTouch = (e) => { for (const t of e.changedTouches) if (t.identifier === lookTouch.id) lookTouch.id = null; };
window.addEventListener('touchend', endTouch);
window.addEventListener('touchcancel', endTouch);
for (const btn of document.querySelectorAll('[data-hold]')) {
  const k = btn.dataset.hold;
  const on = (ev) => { ev.preventDefault(); touchInput[k] = true; btn.classList.add('held'); };
  const off = () => { touchInput[k] = false; btn.classList.remove('held'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointerleave', off);
  btn.addEventListener('pointercancel', off);
}
$('tSail').addEventListener('click', toggleSail);
$('tRadio').addEventListener('click', toggleRadio);
$('tStars').addEventListener('click', toggleStars);
$('tLamp').addEventListener('click', toggleLantern);

/* ---------- Overlays ---------- */
function pause() {
  paused = true;
  keys.clear();
  $('intro').hidden = false;
  $('introTitle').textContent = 'Paused';
  $('introLede').textContent = 'The ocean keeps moving while you rest. Return to the canoe whenever you are ready.';
  $('awayNote').hidden = true;
  $('begin').textContent = 'Return to the canoe';
}
function begin() {
  if (!land) return;
  started = true;
  paused = false;
  $('intro').hidden = true;
  audio.start();
  if (isTouch) $('touch').hidden = false;
  requestLock();
}
$('begin').addEventListener('click', begin);
function syncNav() {
  const on = !!(voyage && voyage.nav);
  $('navToggle').setAttribute('aria-pressed', String(on));
  $('navState').textContent = on ? 'On' : 'Off';
}
$('navToggle').addEventListener('click', () => {
  if (!voyage) return;
  voyage.nav = !voyage.nav;
  // Start the reckoning honestly from where the canoe really is
  if (voyage.nav) voyage.est = { lat: voyage.lat, lng: voyage.lng, track: [[voyage.t, +voyage.lat.toFixed(4), +voyage.lng.toFixed(4)]] };
  saveVoyage(voyage);
  syncNav();
  if (minimap) minimap.update(voyage, true);
});

function showLandfall() {
  landfallShown = true;
  paused = true;
  if (locked) document.exitPointerLock();
  const L = voyage.landfall;
  const days = (L.t - voyage.start) / 864e5;
  $('landfallPlace').textContent = L.name === 'an unnamed shore' ? 'An unnamed shore' : L.name;
  $('landfallText').textContent = `After ${humanDuration(L.t - voyage.start)} at sea you have reached land. The canoe travelled ${Math.round(voyage.dist / 1000).toLocaleString()} km from Point Nemo, and this is the course it actually took.`;
  $('landfallStats').innerHTML = '';
  const stats = [['Days at sea', days.toFixed(1)], ['Distance', `${Math.round(voyage.dist / 1000).toLocaleString()} km`], ['Landfall', `${Math.abs(L.lat).toFixed(2)}° ${L.lat < 0 ? 'S' : 'N'}, ${Math.abs(L.lng).toFixed(2)}° ${L.lng < 0 ? 'W' : 'E'}`]];
  for (const [k, v] of stats) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    $('landfallStats').append(dt, dd);
  }
  $('landfall').hidden = false;
  requestAnimationFrame(() => drawVoyageChart($('chart'), land, voyage));
}
$('newVoyage').addEventListener('click', () => {
  const keep = voyage.playlist;
  clearVoyage();
  voyage = newVoyage(now());
  voyage.playlist = keep;
  saveVoyage(voyage);
  landfallShown = false;
  origin = null;
  $('landfall').hidden = true;
  started = true;
  paused = false;
  requestLock();
  toast('A new voyage begins at Point Nemo.');
});

/* ---------- World state ---------- */
let origin = null;
let islands = null;
const sm = {};
const SMOOTH_KEYS = ['cover', 'precip', 'dark', 'cirrus', 'cloudBase', 'cloudTop', 'visibility', 'gradE', 'gradN', 'speed', 'u', 'v', 'swellH'];
const tmpLocal = {};
const eyePos = new THREE.Vector3(), eyeQuat = new THREE.Quaternion(), lookQuat = new THREE.Quaternion(), lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const fwd = new THREE.Vector3();
const lampPos = new THREE.Vector3();
let lanternOn = false;
let flash = 0, lastHeaveSign = 0, lapCool = 0, wakeDist = 0;
let minimap = null;
const sunV = new THREE.Vector3(), moonV = new THREE.Vector3();
const clock = new THREE.Clock();
let lastSave = 0, lastHud = 0, firstFrame = true, prevHeave = 0;
const off = new THREE.Vector2();
let evolve = 0;

function lerp3(a, b, f) { return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * f); }
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.1);
  const elapsed = clock.elapsedTime;
  const tNow = now();

  /* ----- Simulation ----- */
  if (!voyage.landfall) {
    const gap = (tNow - voyage.t) / 1000;
    if (gap > 5) {
      const r = catchUp(voyage, tNow, land);
      if (started && r.away > 60000) toast(`You were away for ${humanDuration(r.away)}. ${voyage.sail ? 'The canoe kept sailing on its heading.' : 'The canoe drifted with the wind and current.'}`, 5000);
      origin = null;
    }
    const input = {
      paddle: started && !paused && (keys.has('KeyW') || keys.has('ArrowUp') || touchInput.paddle) ? 1 : 0,
      steer: started && !paused ? ((keys.has('KeyD') || keys.has('ArrowRight') || touchInput.right ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') || touchInput.left ? 1 : 0)) : 0
    };
    const g = Math.max(0, (tNow - voyage.t) / 1000);
    cond = step(voyage, g, input, land, simCache);
    cond.input = input;
  } else if (!cond) {
    cond = step(Object.assign({}, voyage, { track: [] }), 0.001, { paddle: 0, steer: 0 }, null, simCache);
    cond.input = { paddle: 0, steer: 0 };
  }
  if (voyage.landfall && !landfallShown && land) showLandfall();

  const w = cond.w;
  const kS = firstFrame ? 1 : 1 - Math.exp(-dt / 3);
  for (const k of SMOOTH_KEYS) sm[k] = sm[k] === undefined ? w[k] : sm[k] + (w[k] - sm[k]) * kS;
  sm.swellFrom = w.swellFrom;

  /* ----- Placement ----- */
  if (!origin || distance(voyage.lat, voyage.lng, origin.lat, origin.lng) > 20000) origin = { lat: voyage.lat, lng: voyage.lng };
  toLocal(voyage.lat, voyage.lng, origin.lat, origin.lng, tmpLocal);
  const bx = tmpLocal.x, bz = tmpLocal.z;

  /* ----- Sky ----- */
  // The sky keeps the viewer's own clock: local solar time on the water matches the time where they are
  const viewerOffsetH = -new Date(tNow).getTimezoneOffset() / 60;
  const skyT = tNow + (viewerOffsetH - voyage.lng / 15) * 3600e3;
  const bodies = skyBodies(skyT, voyage.lat, voyage.lng);
  bodyDir(bodies.sun, sunV);
  bodyDir(bodies.moon, moonV);
  const e = bodies.sun.alt / DEG;
  nightNow = e < -6;
  const p = palette(e);
  const moonLight = clamp01((bodies.moon.alt / DEG + 2) / 20) * bodies.illum;
  const night = clamp01((-e - 2) / 10);
  const ml = moonLight * night;
  const overcast = smoothstep(0.55, 0.95, sm.cover);
  const dark = sm.dark;
  const greyMix = Math.min(0.85, overcast * 0.6 + dark * 0.35);
  const dim = 1 - 0.38 * dark - 0.12 * overcast;
  const lumOf = (c) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  let hor = p.hor.map((v, i) => v + ml * [0.03, 0.04, 0.055][i]);
  let zen = p.zen.map((v, i) => v + ml * [0.01, 0.02, 0.04][i]);
  const hl = lumOf(hor), zl = lumOf(zen);
  hor = lerp3(hor, [hl * 0.92, hl * 0.96, hl * 1.02], greyMix).map((v) => v * dim);
  zen = lerp3(zen, [zl * 1.1, zl * 1.15, zl * 1.25], greyMix).map((v) => v * dim);
  const su = sky.uniforms;
  su.uSunDir.value.copy(sunV);
  su.uMoonDir.value.copy(moonV);
  su.uZen.value.set(...zen);
  su.uHor.value.set(...hor);
  su.uGlow.value.set(...p.glow.map((v) => v * (1 - greyMix)));
  su.uSunCol.value.set(...p.sun.map((v) => v * (1 - 0.55 * dark)));
  su.uStars.value = p.star * (1 - moonLight * 0.6) * (1 - overcast * 0.5);
  su.uMoonLight.value = moonLight;
  su.uDarkness.value = dark;

  /* ----- Lightning in heavy squalls ----- */
  const stormy = Math.max(0, Math.min(1, (sm.precip - 0.35) * 1.6)) * Math.max(0, Math.min(1, (dark - 0.25) * 2));
  if (started && stormy > 0 && Math.random() < dt * stormy * 0.12) {
    flash = 0.7 + Math.random() * 0.8;
    const distKm = 1 + Math.random() * 9;
    audio.thunder(distKm / 0.343, Math.min(1, 2.2 / distKm + 0.25));
  }
  if (flash > 0.001) {
    const f = flash * (0.6 + 0.4 * Math.sin(elapsed * 90));
    su.uZen.value.addScalar(f * 0.5);
    su.uHor.value.addScalar(f * 0.6);
    flash *= Math.exp(-dt * 9);
  }
  su.uTime.value = elapsed;

  /* ----- Clouds move with the wind at their height ----- */
  // Clouds ride the stronger wind aloft; drift is quickened so their motion reads across the sky
  const cu = sm.u * 4.5, cv = sm.v * 4.5;
  off.x += (cu - cond.ve) * dt;
  off.y += -(cv - cond.vn) * dt;
  evolve += dt * 3.2;
  const cuni = sky.cloudUniforms;
  cuni.uOff.value.copy(off);
  cuni.uEvolve.value = evolve;
  cuni.uCoverage.value = Math.pow(sm.cover, 1.1) * 0.95;
  cuni.uCovGrad.value.set(sm.gradE * 20, -sm.gradN * 20);
  cuni.uCB.value = sm.cloudBase;
  cuni.uCT.value = Math.max(sm.cloudBase + 900, Math.min(7500, sm.cloudTop));
  cuni.uCirrus.value = sm.cirrus;

  /* ----- Sea ----- */
  const windTo = Math.atan2(sm.u, sm.v);
  const whitecap = Math.min(0.7, 3.84e-6 * Math.pow(sm.speed, 3.41) * 6);
  ocean.setSea(sm.speed, windTo, sm.swellH, (sm.swellFrom + 180) * DEG, whitecap, Math.min(1, sm.precip));
  const ou = ocean.uniforms;
  ou.uFog.value.set(...hor);
  ou.uVis.value = sm.visibility;
  ou.uWaveT.value = elapsed;
  const cold = smoothstep(22, 50, Math.abs(voyage.lat));
  const lum = Math.max(0.05, Math.min(1, (e + 10) / 20)) * (1 - 0.35 * dark) + ml * 0.15;
  const body = lerp3([0.015, 0.085, 0.15], [0.025, 0.07, 0.085], cold).map((v) => v * lum);
  ou.uBody.value.set(...body);

  /* ----- Lantern: lit automatically after dusk unless the player chooses otherwise ----- */
  lanternOn = voyage.lantern === true || (voyage.lantern !== false && sunV.y < 0.02);

  /* ----- Canoe and paddler ----- */
  const relWind = ((((w.from - voyage.heading) % 360) + 540) % 360) - 180;
  canoe.update({
    x: bx, z: bz, headingDeg: voyage.heading,
    paddling: cond.input.paddle > 0, sailUp: voyage.sail,
    apparentFromRel: relWind, windSpeed: sm.speed, lantern: lanternOn,
    t: elapsed, dt, rawDt, waveT: elapsed, ocean,
    light: [0, 1, 2].map((i) => p.sun[i] * smoothstep(-0.04, 0.08, sunV.y) * (1 - 0.6 * dark) * 0.6 + hor[i] * 0.35),
    onCatch: (x, z) => {
      ocean.addRipple(x, z, elapsed, 0.06);
      audio.splash(0.7);
      // Drips trailing off the blade as it lifts
      spray.emit(x, canoe.heave + 0.15, z, 0, 0.6, 0, 8, 0.25);
    }
  });
  canoe.eye(eyePos, eyeQuat);

  /* ----- Glowing water, wake, spray and hull sounds ----- */
  const bio = smoothstep(0.02, -0.12, sunV.y) * (1 - 0.5 * moonLight);
  ou.uBio.value = bio;
  ou.uHullSpeed.value = voyage.speed;
  const hq = voyage.heading * DEG;
  const fX = Math.sin(hq), fZ = -Math.cos(hq), rX = Math.cos(hq), rZ = Math.sin(hq);
  wakeDist += voyage.speed * dt;
  if (wakeDist > 0.7) {
    // Bow wave peeling off both sides, which lights up at night
    wakeDist = 0;
    for (const side of [-1, 1]) ocean.addRipple(bx + fX * 2.2 + rX * 0.5 * side, bz + fZ * 2.2 + rZ * 0.5 * side, elapsed, 0.025 + voyage.speed * 0.012);
  }
  const heaveRateNow = (canoe.heave - prevHeave) / Math.max(dt, 1e-3);
  const sign = Math.sign(heaveRateNow);
  lapCool -= dt;
  if (sign !== lastHeaveSign && Math.abs(heaveRateNow) > 0.12 && lapCool <= 0) {
    audio.lap(Math.min(1.4, Math.abs(heaveRateNow) * 1.5));
    lapCool = 0.5;
    // Bow slams into a sea: spray
    if (heaveRateNow < -0.35 || voyage.speed > 1.8) {
      const n = Math.round(10 + Math.abs(heaveRateNow) * 25 + voyage.speed * 6);
      spray.emit(bx + fX * 2.5, canoe.heave + 0.25, bz + fZ * 2.5, fX * voyage.speed * 0.6 + rX * 0.8, 1.8 + Math.abs(heaveRateNow), fZ * voyage.speed * 0.6 + rZ * 0.8, n, 1.2);
    }
  }
  lastHeaveSign = sign;
  if (Math.random() < dt * (0.05 + sm.speed * 0.02)) audio.creak(0.6 + Math.random() * 0.6);
  audio.setLantern(lanternOn ? 1 : 0);
  spray.update(dt, hor, bio);
  lookEuler.set(pitch, yawRel, 0, 'YXZ');
  lookQuat.setFromEuler(lookEuler);
  camNear.position.copy(eyePos);
  camNear.quaternion.copy(eyeQuat).multiply(lookQuat);
  if (DEBUG && window.__cam) {
    // Debug orbit camera: offset from the canoe in its own frame, looking at the hull
    const c = window.__cam;
    const off = new THREE.Vector3(c[0], c[1], c[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), -voyage.heading * DEG);
    camNear.position.copy(canoe.group.position).add(off);
    camNear.lookAt(canoe.group.position.x, canoe.group.position.y, canoe.group.position.z);
  }
  camFar.position.copy(camNear.position);
  camFar.quaternion.copy(camNear.quaternion);
  camNear.updateMatrixWorld();
  camFar.updateMatrixWorld();

  const lampLevel = canoe.lamp(lampPos);
  ou.uLantern.value.set(lampPos.x, lampPos.y, lampPos.z, lampLevel * 1.6);
  sky.dome.position.copy(camNear.position);
  sky.setOrientation(equatorialToLocal(skyT, voyage.lat, voyage.lng), camNear.position);
  ocean.mesh.position.set(camNear.position.x, 0, camNear.position.z);

  /* ----- Land ----- */
  if (islands) {
    islands.uniforms.uFog.value.set(...hor);
    islands.uniforms.uVis.value = sm.visibility * 1.6;
    const anchors = islands.update(voyage.lat, voyage.lng, origin, camNear.position, tNow);
    const capStrength = 0.18 + 0.3 * smoothstep(-0.05, 0.3, sunV.y);
    for (let i = 0; i < 4; i++) {
      const a = anchors[i];
      cuni.uIsles.value[i].set(a ? a.x : 0, a ? a.z : 0, a ? a.r : 1, a ? capStrength : 0);
    }
    birds.update(dt, camNear.position, islands.nearest, e);
  }

  /* ----- Light for the canoe ----- */
  const sunUp = smoothstep(-0.04, 0.06, sunV.y);
  if (sunUp > 0.01) {
    sunLight.position.copy(camNear.position).addScaledVector(sunV, 100);
    sunLight.color.setRGB(...p.sun);
    sunLight.intensity = Math.PI * 1.05 * sunUp * (1 - 0.7 * dark);
  } else {
    sunLight.position.copy(camNear.position).addScaledVector(moonV, 100);
    sunLight.color.setRGB(0.55, 0.6, 0.72);
    sunLight.intensity = Math.PI * 0.12 * moonLight * clamp01(moonV.y * 4);
  }
  sunLight.target.position.copy(camNear.position);
  hemi.color.setRGB(zen[0] * 0.8 + hor[0] * 0.5, zen[1] * 0.8 + hor[1] * 0.5, zen[2] * 0.8 + hor[2] * 0.5);
  hemi.groundColor.setRGB(...body.map((v) => v * 2));
  hemi.intensity = Math.PI * 0.75;

  /* ----- Rain, sound, radio, compass, HUD ----- */
  rain.update(dt, camNear.position, Math.min(1, sm.precip), sm.u, sm.v, hor.map((v) => Math.min(1, v * 1.25 + 0.08)));
  const heaveRate = (canoe.heave - prevHeave) / Math.max(dt, 1e-3);
  prevHeave = canoe.heave;
  audio.update(sm.speed, sm.swellH + ocean.hsWind, Math.min(1, sm.precip), heaveRate);
  radio.update(dt);

  fwd.set(0, 0, -1).applyQuaternion(camNear.quaternion);
  const viewBearing = ((Math.atan2(fwd.x, -fwd.z) / DEG) + 360) % 360;
  compass.update(viewBearing, dt, Math.min(2, Math.abs(heaveRate)));

  if (elapsed - lastHud > 0.5) {
    lastHud = elapsed;
    const d = new Date(tNow);
    $('clockOut').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    $('dayOut').textContent = `Day ${Math.floor((tNow - voyage.start) / 864e5) + 1}`;
    $('sailOut').textContent = voyage.sail ? 'Sail up' : 'Sail down';
    $('sailOut').classList.toggle('on', voyage.sail);
    $('lampOut').textContent = lanternOn ? 'Lantern lit' : 'Lantern out';
    $('lampOut').classList.toggle('on', lanternOn);
    const shown = voyage.nav && voyage.est ? voyage.est : voyage;
    $('posOut').textContent = `${voyage.nav ? 'Est. ' : ''}${Math.abs(shown.lat).toFixed(2)}° ${shown.lat < 0 ? 'S' : 'N'}  ${Math.abs(shown.lng).toFixed(2)}° ${shown.lng < 0 ? 'W' : 'E'}`;
  }
  sky.updateLabels(camNear, window.innerWidth, window.innerHeight);

  if (minimap && !$('mapWrap').hidden) minimap.update(voyage);
  if (elapsed - lastSave > 15) { lastSave = elapsed; saveVoyage(voyage); }

  /* ----- Render ----- */
  sky.renderClouds(firstFrame);
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(scene, camFar);
  renderer.clearDepth();
  renderer.render(scene, camNear);
  firstFrame = false;
}

function onResize() {
  const a = window.innerWidth / window.innerHeight;
  for (const c of [camNear, camFar]) { c.aspect = a; c.updateProjectionMatrix(); }
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  radio.resize();
}
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveVoyage(voyage); });
window.addEventListener('pagehide', () => saveVoyage(voyage));

/* ---------- Boot ---------- */
async function boot() {
  const [landData, skyData] = await Promise.all([
    fetch(BASE + 'data/land.json').then((r) => r.json()),
    fetch(BASE + 'data/sky.json').then((r) => r.json())
  ]).catch(() => fail('The ocean could not load. Check your connection and reload the page.'));
  land = new Land(landData);
  islands = createIslands(scene, land, sky.uniforms);
  sky.buildStars(skyData);
  minimap = createMinimap($('minimap'), land);
  $('mapIn').addEventListener('click', () => minimap.zoom(-1));
  $('mapOut').addEventListener('click', () => minimap.zoom(1));

  // Generated models (Magnific); the built-in canoe and lantern stay until these arrive
  const loader = new GLTFLoader();
  loader.load(BASE + 'models/canoe.glb', (g) => {
    try {
      const r = canoe.applyCanoe(g.scene);
      ocean.uniforms.uHullSeg.value.y = Math.min(0.6, Math.max(0.3, r.halfBeam)) + 0.015;
    } catch (e) { console.warn('Canoe model could not be fitted', e); }
  }, undefined, () => {});
  loader.load(BASE + 'models/lantern.glb', (g) => {
    try { canoe.applyLantern(g.scene); } catch (e) { console.warn('Lantern model could not be fitted', e); }
  }, undefined, () => {});

  const fresh = !voyage;
  if (!voyage) voyage = newVoyage(now());
  if (DEBUG && params.get('at')) {
    const [la, lo] = params.get('at').split(',').map(Number);
    if (Number.isFinite(la) && Number.isFinite(lo)) { voyage.lat = la; voyage.lng = lo; voyage.t = now(); }
  }
  if (DEBUG && params.get('heading')) voyage.heading = Number(params.get('heading')) || 0;
  if (voyage.t > now()) voyage.t = now();

  if (!voyage.landfall) {
    const r = catchUp(voyage, now(), land);
    if (!fresh && r.away > 120000) {
      const note = $('awayNote');
      note.hidden = false;
      note.textContent = `You were away for ${humanDuration(r.away)}. ${voyage.sail ? 'The sail was up and the steering oar lashed, so the canoe kept sailing on its heading.' : 'The sail was down, so the canoe drifted with the wind and the current.'}${r.landed ? ' While you were gone, it came ashore.' : ''}`;
    }
  }
  saveVoyage(voyage);
  if (!fresh) {
    $('introLede').textContent = `Day ${Math.floor((now() - voyage.start) / 864e5) + 1} of your voyage from Point Nemo. Your compass, your radio and the sky are where you left them.`;
    $('begin').textContent = 'Return to the canoe';
  }
  syncNav();
  $('loadNote').hidden = true;
  $('begin').disabled = false;

  if (DEBUG) {
    window.__pd = {
      get voyage() { return voyage; },
      look(p, y) { pitch = p; if (y !== undefined) yawRel = y; },
      begin() { started = true; paused = false; $('intro').hidden = true; },
      key(code, down) { if (down) keys.add(code); else keys.delete(code); },
      stars(on) { sky.setLines(on); },
      radio() { radio.setOpen(true); },
      get islands() { return islands.activeCount; },
      profile() {
        const out = [];
        const o = {};
        const h = voyage.heading * DEG;
        for (const d of [0, 2, 4, 6, 8, 12, 20, 40]) {
          // to port of the canoe
          const x = canoe.group.position.x - Math.cos(h) * d, z = canoe.group.position.z - Math.sin(h) * d;
          ocean.sample(x, z, clock.elapsedTime, o);
          out.push([d, +o.h.toFixed(2)]);
        }
        return { heave: +canoe.heave.toFixed(2), eye: +camNear.position.y.toFixed(2), port: out };
      },
      dbg() { return { heave: canoe.heave, eye: camNear.position.y, hsWind: ocean.hsWind, swell: sm.swellH, wind: sm.speed, waves: ocean.uniforms.uWaves.value.map((w) => [w.z, +w.w.toFixed(3)]) }; }
    };
  }
  requestAnimationFrame(frame);
}
boot();
