import * as THREE from 'three';
import { Land, toLocal, distance } from './geo.js';
import { skyBodies, bodyDir, equatorialToLocal } from './astro.js';
import { newVoyage, loadVoyage, saveVoyage, clearVoyage, step, catchUp, useStorageKey } from './voyage.js';
import { createSky, palette, LAYER_FAR, LAYER_NEAR } from './sky.js';
import { createOcean } from './ocean.js';
import { createIslands, createBirds } from './islands.js';
import { createCanoe, HULL_MASK } from './canoe.js';
import {createPaddlerHands} from './paddler-hands.js';
import {createPaddleFeedback,paddleDrive} from './paddle-feedback.js';
import { createRain } from './rain.js';
import {createSeaRain} from './sea-rain.js';
import { createLensRain } from './lens-rain.js';
import { createHullRain } from './hull-rain.js';
import { createWildlife } from './wildlife.js';
import {createMarineEncounters} from './marine-encounters.js';
import {createMeteors} from './meteors.js';
import {createWeatherFronts} from './weather-fronts.js';
import { createAudio } from './audio.js';
import { createEnvironmentPreview, previewWeather } from './environment-preview.js';
import { createRadio } from './radio.js';
import { createCompass } from './compass.js';
import { drawVoyageChart } from './landfall.js';
import { createMinimap } from './minimap.js';
import { createSpray } from './spray.js';
import { createLog } from './log.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {loadMarineAssets,applyMarineDetails} from './marine-assets.js';
import {bakeMarineFoam} from './marine-foam.js';
import {createMarineLighting} from './marine-lighting.js';
import {createWorldArrival} from './world-arrival.js';
import {createBoatProps} from './boat-props.js';
import {createLiveWeather} from './live-weather.js';
import {skyTime,skyDescription} from './world-clock.js';
import {createEquipmentInspection,EQUIPMENT} from './equipment-inspection.js';
import {createGPS} from './gps.js';
import {createAnbernic} from './anbernic.js';
import {createBinoculars} from './binoculars.js';

THREE.ColorManagement.enabled = false;
const DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('environment');
const DEBUG = params.has('debug') || PREVIEW;
let environment=null;
if (DEBUG) useStorageKey(PREVIEW?'pacific-drift-environment':'pacific-drift-debug'); // test runs never touch a player's real voyage
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
// Reproducible visual QA controls never affect normal voyages.
if (DEBUG && params.has('sea')) {
  const speed = Math.max(0, Math.min(35, Number(params.get('sea')) || 0));
  window.__sea = { speed, swellH: speed / 5, precip: speed > 18 ? 0.7 : 0, cover: speed > 18 ? 0.85 : 0.25 };
}
if (DEBUG && params.has('view')) {
  const view = params.get('view').split(',').map(Number);
  if (view.length === 3 && view.every(Number.isFinite)) window.__cam = view;
}


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
const marineLighting=createMarineLighting(renderer,sky,isTouch);
const ocean = createOcean(renderer, scene, sky.uniforms);
let marineAssets=null,marineBoat=null;
let boatProps=null,inspection=null,binoculars=null;
let pointerPosition=null,itemUnderPointer=null;
const marineReview={loaded:false,failed:[],materials:0};
const foamBake=bakeMarineFoam(renderer);
ocean.uniforms.tFoamDetail.value=foamBake.texture;
loadMarineAssets(renderer,BASE).then(assets=>{
 marineAssets=assets;marineReview.loaded=true;marineReview.failed=assets.failures;
 if(assets.water){ocean.uniforms.tImportedNormal.value=assets.water.normal;ocean.uniforms.tImportedRoughness.value=assets.water.roughness;}
 if(marineBoat)marineReview.materials=applyMarineDetails(marineBoat,assets);
}).catch(error=>{marineReview.failed=['surface details'];console.warn('Surface details unavailable; original materials retained',error);});
const meteors=createMeteors(scene);
meteors.setCloudTexture(sky.uniforms.tClouds.value);
const fronts=createWeatherFronts(scene);
const wildlife = createWildlife(scene,ocean,{base:BASE});
const whales = createMarineEncounters(scene,ocean,{base:BASE,register:root=>marineLighting.register(root),isWater(x,z){if(!origin||!land)return true;const lat=origin.lat-z/111320,lng=((origin.lng+x/(111320*Math.cos(origin.lat*Math.PI/180))+540)%360)-180;return !land.landAt(lat,lng);},onEncounter(kind,preview){if(preview){toast('Encounter ready');const status=$('whaleStatus');if(status)status.textContent='Preview: '+kind+' · authored textures and metre scale. Try the binoculars for a closer look.';}}});
const canoe = createCanoe(scene);
const paddlerHands=createPaddlerHands(canoe.group);
const hullRain = createHullRain(canoe);
ocean.uniforms.uHullSeg.value.set(...HULL_MASK.seg, 0);
ocean.uniforms.uAmaSeg.value.set(...HULL_MASK.ama);
const rain = createRain(scene,renderer);
const seaRain=createSeaRain(scene,ocean,canoe);
const lensRain = createLensRain(renderer);
let darkAdaptation = 0.8;
const spray = createSpray(scene);
spray.setSurfaceSampler(ocean.sample,(x,z,t,strength)=>ocean.addRipple(x,z,t,strength));
const log = createLog();
const birds = createBirds(scene);
const audio = createAudio({base:BASE});
const paddleListenerRight=new THREE.Vector3();
const paddleFeedback=createPaddleFeedback({ocean,spray,audio,panAt(event){
  paddleListenerRight.set(1,0,0).applyQuaternion(camNear.quaternion);
  const dx=event.x-camNear.position.x,dy=event.y-camNear.position.y,dz=event.z-camNear.position.z;
  return THREE.MathUtils.clamp((dx*paddleListenerRight.x+dy*paddleListenerRight.y+dz*paddleListenerRight.z)/Math.max(.7,Math.hypot(dx,dy,dz)),-.8,.8);
}});
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
  const m = Math.max(0, Math.round(ms / 60000));
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
let worldArrival=null,arrivalPlayed=false;
let returningVoyage=false,playHintShown=false;
let landfallShown = false;
const simCache = {};
const liveWeather=createLiveWeather();
let conditionsMode='live';
try{if(localStorage.getItem('pacific-drift-conditions-mode')==='experience')conditionsMode='experience';}catch{}
const liveEnabled=()=>!PREVIEW&&conditionsMode==='live'&&!(DEBUG&&params.has('time'));
simCache.resolveWeather=(fallback,lat,lng,t)=>{
  if(!liveEnabled())return fallback;
  const data=liveWeather.sample(lat,lng,t);
  return {...fallback,...data.atmosphere,...data.marine};
};
for(const id of ['conditionsMode','homeConditionsMode']){
  $(id).value=conditionsMode;
  $(id).addEventListener('change',event=>{
    conditionsMode=event.target.value==='experience'?'experience':'live';
    for(const other of ['conditionsMode','homeConditionsMode'])$(other).value=conditionsMode;
    try{localStorage.setItem('pacific-drift-conditions-mode',conditionsMode);}catch{}
    if(voyage&&liveEnabled())liveWeather.refresh(voyage.lat,voyage.lng);
    toast(conditionsMode==='live'?'Real-world time and regional forecasts.':'Experience mode: your local time and simulated weather.');
  });
}
if(PREVIEW){$('conditions').hidden=true;}
let nextWeatherCheck=0;
let cond = null;
let nightNow = false;

const radio = createRadio({
  audio,
  toast,
  getState: () => (voyage ? { lat: voyage.lat, lng: voyage.lng, heading: voyage.heading, night: nightNow, playlist: voyage.playlist } : { lat: 0, lng: 0, heading: 0, night: false, playlist: '' }),
  onPlaylist: (p) => { voyage.playlist = p; saveVoyage(voyage); },
  onStation: (name, country) => log.radio(name, country)
});

/* ---------- Equipment: one model, a close-up view, and real controls ---------- */
const anbernic=createAnbernic({getVoyage:()=>voyage,save:saveVoyage});
const gps=createGPS({base:BASE,getVoyage:()=>voyage,getConditions:()=>cond,save:saveVoyage,toast});
inspection=createEquipmentInspection({renderer,radio,gps,anbernic,getTapeState:()=>boatProps?.tapeState??{phase:0},
  onOpen(){keys.clear();dragging=false;dragMode=true;if(document.pointerLockElement)document.exitPointerLock();radio.setOpen(false);},
  onClose(){dragMode=true;},onLantern:toggleLantern,lanternOn:()=>lanternOn,
  onBinoculars(){binoculars.open();},
  isStowed:name=>boatProps?.isStowed(name)??false,
  stow(name,value){boatProps?.setStowed(name,value);voyage.stowedEquipment=['walkman','binoculars','radio','anbernic'].filter(id=>boatProps?.isStowed(id));saveVoyage(voyage);}
});
binoculars=createBinoculars({
  onRaise(){keys.clear();dragging=false;dragMode=true;window.__cam=null;window.__moonCam=false;window.__birdCam=false;pitch=.015;if(document.pointerLockElement)document.exitPointerLock();const root=boatProps?.getRoot('binoculars');if(root)root.visible=false;},
  onLower(){const root=boatProps?.getRoot('binoculars');if(root)root.visible=!boatProps.isStowed('binoculars');camNear.fov=camFar.fov=68;camNear.updateProjectionMatrix();camFar.updateProjectionMatrix();},
  onAim(dx,dy,zoom){look(dx,dy,.004/zoom);}
});
function inspectEquipment(name='backpack'){if(!started||paused||worldArrival?.active)return;binoculars.close();inspection.open(name);}
$('equipmentToggle').addEventListener('click',()=>inspectEquipment());

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
function resetStudioCamera(angle=-.07){
  fronts.cancelPreview();if(environment)Object.assign(sm,previewWeather(environment));firstFrame=true;
  window.__moonCam=false;window.__birdCam=false;window.__cam=null;pitch=angle;yawRel=0;
  camNear.fov=camFar.fov=68;camNear.updateProjectionMatrix();camFar.updateProjectionMatrix();
  const direction=new THREE.Vector3(0,Math.sin(angle),-Math.cos(angle)).applyAxisAngle(new THREE.Vector3(0,1,0),-voyage.heading*DEG);
  camNear.lookAt(camNear.position.clone().add(direction));camFar.quaternion.copy(camNear.quaternion);
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
  if (started && !radio.open && !inspection.active && !binoculars.active && $('logbook').hidden && !dragMode) pause();
});
document.addEventListener('pointerlockerror', () => { dragMode = true; });
document.addEventListener('mousemove', (e) => {
  if(inspection.active||binoculars.active)return;
  if (locked) look(e.movementX, e.movementY, 0.0021);
  else if (dragging) { look(e.clientX - lastX, e.clientY - lastY, 0.0042); lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointerPosition={x:e.clientX-r.left,y:e.clientY-r.top};});
canvas.addEventListener('pointerleave',()=>{pointerPosition=null;itemUnderPointer=null;});
let itemTap=null;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')itemTap={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',e=>{if(e.pointerType==='touch'&&itemTap&&Math.hypot(e.clientX-itemTap.x,e.clientY-itemTap.y)<9&&started&&!paused&&!inspection.active&&!binoculars.active){const r=canvas.getBoundingClientRect();boatProps?.interact(camNear,e.clientX-r.left,e.clientY-r.top,r.width,r.height);}itemTap=null;});
canvas.addEventListener('mousedown', (e) => {
  if (!started || paused || inspection.active || binoculars.active) return;
  if (radio.open) { radio.setOpen(false); }
  const rect=canvas.getBoundingClientRect();
  if(boatProps?.interact(camNear,locked?rect.width/2:e.clientX-rect.left,locked?rect.height/2:e.clientY-rect.top,rect.width,rect.height))return;
  if (!locked && !dragMode) { requestLock(); return; }
  if (dragMode) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
});
window.addEventListener('mouseup', () => { dragging = false; });

function toggleSail() {
  voyage.sail = !voyage.sail;
  log.add(voyage.sail ? `Raised the sail and lashed the steering, heading ${Math.round(voyage.heading)}°.` : 'Lowered the sail and let her drift.', 'canoe');
  toast(voyage.sail ? 'Sail raised. With the rudder secured, the boat holds its heading.' : 'Sail lowered. The boat will drift with the wind and current.');
  saveVoyage(voyage);
}
function toggleStars() {
  sky.setLines(!sky.linesOn);
  toast(sky.linesOn ? 'Star chart on: constellations and navigation stars are named.' : 'Star chart off.');
}
function toggleLantern() {
  voyage.lantern = !lanternOn;
  lanternOn=voyage.lantern;
  log.add(voyage.lantern ? 'Lit the lantern.' : 'Put the lantern out to see the stars.', 'canoe');
  toast(voyage.lantern ? 'Lantern lit.' : 'Lantern out. Your eyes will adjust to the starlight.');
  saveVoyage(voyage);
}
function toggleRadio() {
  if(started&&!paused){inspectEquipment('radio');return;}
  radio.toggle();
  if (radio.open && locked) document.exitPointerLock();
}

window.addEventListener('keydown', (e) => {
  if(inspection.active||binoculars.active)return;
  if (e.target?.closest('input,textarea,select,button,.environment-panel')) return;
  if (!$('logbook').hidden && (e.code === 'Escape' || e.code === 'KeyJ')) { openLog(false); return; }
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
  if (e.code === 'KeyJ') openLog($('logbook').hidden);
  if (e.code === 'KeyN') { $('mapWrap').hidden = !$('mapWrap').hidden; }
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyI') inspectEquipment();
  if (e.code === 'KeyF'&&itemUnderPointer) inspectEquipment(itemUnderPointer);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') minimap && minimap.zoom(-1);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') minimap && minimap.zoom(1);
  if (e.code === 'KeyM') toggleSound();
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
      if (tilt && tilt.yaw0 !== null) tilt.yaw0 += (t.clientX - lookTouch.x) * 0.005;
      else look(t.clientX - lookTouch.x, t.clientY - lookTouch.y, 0.005);
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
function toggleSound() {
  audio.setMuted(!audio.muted);
  $('tSound').setAttribute('aria-pressed',String(!audio.muted));
  toast(audio.muted ? 'Environment sound off.' : 'Environment sound on.');
}
$('tSound').addEventListener('click',toggleSound);
$('tSail').addEventListener('click', toggleSail);
$('tRadio').addEventListener('click', toggleRadio);
$('tStars').addEventListener('click', toggleStars);
$('tLamp').addEventListener('click', toggleLantern);
$('tMap').addEventListener('click', () => { $('mapWrap').hidden = !$('mapWrap').hidden; });

/* ---------- Tilt to look (phone motion sensor) ---------- */
let tilt = null;
const devQ = new THREE.Quaternion(), devE = new THREE.Euler(), zAxis = new THREE.Vector3(0, 0, 1);
const qScreen = new THREE.Quaternion(), qUpright = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function onOrient(ev) {
  if (!tilt || ev.alpha == null) return;
  const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * DEG;
  devE.set(ev.beta * DEG, ev.alpha * DEG, -ev.gamma * DEG, 'YXZ');
  devQ.setFromEuler(devE).multiply(qUpright).multiply(qScreen.setFromAxisAngle(zAxis, -orient));
  const e = new THREE.Euler().setFromQuaternion(devQ, 'YXZ');
  if (tilt.yaw0 === null) tilt.yaw0 = e.y - yawRel;
  let y = e.y - tilt.yaw0;
  y = Math.atan2(Math.sin(y), Math.cos(y));
  yawRel = Math.max(-170 * DEG, Math.min(170 * DEG, y));
  pitch = Math.max(-LIMIT, Math.min(LIMIT, e.x));
}
async function toggleTilt() {
  const btn = $('tTilt');
  if (tilt) {
    window.removeEventListener('deviceorientation', onOrient);
    tilt = null;
    btn.setAttribute('aria-pressed', 'false');
    return;
  }
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast('Motion access was declined, so drag to look around instead.'); return; }
    }
  } catch (e) { toast('This browser does not share motion, so drag to look around instead.'); return; }
  if (!('DeviceOrientationEvent' in window)) { toast('This device has no motion sensor, so drag to look around instead.'); return; }
  tilt = { yaw0: null };
  window.addEventListener('deviceorientation', onOrient);
  btn.setAttribute('aria-pressed', 'true');
  toast('Hold your phone up and turn to look around. Drag to turn your view.');
}
$('tTilt').addEventListener('click', toggleTilt);
$('tLog').addEventListener('click', () => openLog(true));
function openLog(open) {
  $('logbook').hidden = !open;
  if (open) { log.render($('logBody')); if (locked) document.exitPointerLock(); }
}
$('logClose').addEventListener('click', () => openLog(false));
$('readLog').addEventListener('click', () => openLog(true));

/* ---------- Overlays ---------- */
function pause() {
  paused = true;
  document.body.classList.add('at-home');
  $('arrivalHint').hidden=true;
  keys.clear();
  $('intro').hidden = false;
  $('introTitle').textContent = 'Paused';
  $('introLede').textContent = 'Take a breath. The ocean keeps moving.';
  $('awayNote').hidden = true;
  $('begin').textContent = 'Return to the boat';
}
function syncControlLayout() {
  const compact = isTouch || window.innerWidth <= 700;
  $('touch').hidden = !started || !compact;
  document.body.classList.toggle('touch-layout', compact);
}
function begin() {
  if (!land) return;
  if(worldArrival?.active)return;
  if(!PREVIEW&&!arrivalPlayed&&worldArrival&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    arrivalPlayed=true;$('intro').hidden=true;keys.clear();paused=true;started=false;
    audio.setArrivalMix(0);audio.start();
    worldArrival.start(voyage,()=>enterBoat(false),{returning:returningVoyage,at:DEBUG&&params.has('arrivalAt')?Number(params.get('arrivalAt')):null});
    return;
  }
  enterBoat(true);
}
function enterBoat(lock){
  document.body.classList.remove('at-home');
  audio.setArrivalMix(1);
  started = true;
  paused = false;
  $('intro').hidden = true;
  audio.start();
  if(PREVIEW)document.querySelector('.environment-panel').hidden=false;
  syncControlLayout();
  if(!PREVIEW&&!playHintShown){playHintShown=true;$('playHint').hidden=false;setTimeout(()=>$('playHint').hidden=true,9000);}
  if (!PREVIEW){if(lock)requestLock();else dragMode=true;}
}
function previewWorldArrival(){
  if(!worldArrival||worldArrival.active)return;
  const previous={started,paused};keys.clear();started=false;paused=true;
  audio.setArrivalMix(0);audio.start();
  worldArrival.start(voyage,()=>{started=previous.started;paused=previous.paused;audio.setArrivalMix(1);syncControlLayout();},{at:DEBUG&&params.has('arrivalAt')?Number(params.get('arrivalAt')):null});
}
$('begin').addEventListener('click', begin);
function toggleHelp(){const panel=$('controlsHud');panel.hidden=!panel.hidden;$('helpToggle').setAttribute('aria-expanded',String(!panel.hidden));$('helpToggle').firstChild.textContent=panel.hidden?'Controls ':'Close controls ';if(panel.hidden)canvas.focus({preventScroll:true});}
$('helpToggle').addEventListener('click',toggleHelp);
function syncNav() {
  const on = !!(voyage && voyage.nav);
  $('navToggle').setAttribute('aria-pressed', String(on));
  $('navState').textContent = on ? 'On' : 'Off';
}
$('navToggle').addEventListener('click', () => {
  if (!voyage) return;
  voyage.nav = !voyage.nav;
  // Start the reckoning honestly from where the boat really is
  if (voyage.nav) voyage.est = { lat: voyage.lat, lng: voyage.lng, track: [[voyage.t, +voyage.lat.toFixed(4), +voyage.lng.toFixed(4)]] };
  saveVoyage(voyage);
  syncNav();
  if (minimap) minimap.update(voyage, true);
});

function showLandfall() {
  landfallShown = true;
  $('intro').hidden = true;
  $('touch').hidden = true;
  radio.setOpen(false);
  if (!voyage.log || !voyage.log.some((e) => e.kind === 'landfall')) log.add(`Landfall. ${voyage.landfall.name === 'an unnamed shore' ? 'An unnamed shore' : voyage.landfall.name}, after ${humanDuration(voyage.landfall.t - voyage.start)} at sea.`, 'landfall', voyage.landfall.t);
  paused = true;
  if (locked) document.exitPointerLock();
  const L = voyage.landfall;
  const days = Math.max(0, (L.t - voyage.start) / 864e5);
  $('landfallPlace').textContent = L.name === 'an unnamed shore' ? 'An unnamed shore' : L.name;
  $('landfallText').textContent = `After ${humanDuration(L.t - voyage.start)} at sea you have reached land. The boat travelled ${Math.round(voyage.dist / 1000).toLocaleString()} km from Point Nemo, and this is the course it actually took.`;
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
  log.attach(voyage);
  saveVoyage(voyage);
  landfallShown = false;
  origin = null;
  $('landfall').hidden = true;
  arrivalPlayed=false;returningVoyage=false;started=false;paused=true;
  begin();
});

/* ---------- World state ---------- */
let origin = null;
let islands = null;
const sm = {};
const SMOOTH_KEYS = ['cover', 'precip', 'dark', 'cirrus', 'cloudBase', 'cloudTop', 'visibility', 'gradE', 'gradN', 'speed', 'u', 'v', 'swellH'];
const tmpLocal = {};
const eyePos = new THREE.Vector3(), paddlerLocalEye=new THREE.Vector3(), eyeQuat = new THREE.Quaternion(), lookQuat = new THREE.Quaternion(), lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const fwd = new THREE.Vector3();
const lampPos = new THREE.Vector3();
let lanternOn = false;
let flash = 0, lastHeaveSign = 0, lapCool = 0, wakeDist = 0;
let minimap = null;
const sunV = new THREE.Vector3(), moonV = new THREE.Vector3();

// Distance to the nearest land, searched outward in widening rings and refreshed every few seconds.
// In navigator mode it is measured from where you reckon you are, not where the boat really is.
let landDist = { at: -Infinity, text: '' };
function updateLandDistance(elapsed) {
  if (!land || elapsed - landDist.at < 4) return;
  landDist.at = elapsed;
  const reckon = voyage.nav && voyage.est;
  const lat = reckon ? voyage.est.lat : voyage.lat, lng = reckon ? voyage.est.lng : voyage.lng;
  let best = { d: Infinity };
  for (const r of [300e3, 1200e3, 3500e3, 8000e3]) {
    best = land.nearestCoast(lat, lng, r);
    if (best.d <= r) break;
  }
  const out = $('landOut');
  if (!Number.isFinite(best.d)) { out.textContent = ''; return; }
  const km = best.d / 1000;
  const n = km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString();
  out.textContent = `${reckon ? '≈ ' : ''}${n} km to land`;
  out.title = best.poly && best.poly.name ? `Nearest land: ${best.poly.name}${reckon ? ' (by your reckoning)' : ''}` : 'Distance to the nearest land';
}

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
  worldArrival?.update(document.hidden?0:dt);
  if(worldArrival?.active)audio.setArrivalMix(worldArrival.state.audio);
  const elapsed = clock.elapsedTime;
  const seaReview=PREVIEW&&params.has('waveAt')&&Number.isFinite(Number(params.get('waveAt')));
  const waveTime=seaReview?Number(params.get('waveAt')):elapsed;
  const tNow = now();
  if(liveEnabled()&&!document.hidden&&elapsed>=nextWeatherCheck){nextWeatherCheck=elapsed+30;liveWeather.refresh(voyage.lat,voyage.lng);}

  /* ----- Simulation ----- */
  if (!voyage.landfall) {
    const gap = (tNow - voyage.t) / 1000;
    if (gap > 5) {
      const r = catchUp(voyage, tNow, land, (conditions) => log.tick(conditions.w),simCache);
      if (r.away > 30 * 60e3) log.add(`Away from the boat for ${humanDuration(r.away)} and travelled ${(r.distance / 1000).toFixed(1)} km. ${voyage.sail ? 'She sailed on by herself.' : 'She drifted on the wind and current.'}`, 'away');
      if (started && r.away > 60000) toast(`You were away for ${humanDuration(r.away)} and travelled ${(r.distance / 1000).toFixed(1)} km. ${voyage.sail ? 'The boat kept sailing on its heading.' : 'The boat drifted with the wind and current.'}`, 5000);
      origin = null;
    }
    const input = {
      paddleRequested: started && !paused && !inspection.active && !binoculars.active && (keys.has('KeyW') || keys.has('ArrowUp') || touchInput.paddle),
      paddle: 0,
      paddleForce: paddleDrive(canoe.getPaddlePose(),started&&!paused&&!inspection.active&&!binoculars.active&&!document.hidden&&rawDt<=.3),
      steer: started && !paused && !inspection.active && !binoculars.active ? ((keys.has('KeyD') || keys.has('ArrowRight') || touchInput.right ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') || touchInput.left ? 1 : 0)) : 0
    };
    const g = Math.max(0, (tNow - voyage.t) / 1000);
    cond = step(voyage, g, input, land, simCache);
    cond.input = input;
    if (started) log.tick(cond.w);
  } else if (!cond) {
    cond = step(Object.assign({}, voyage, { track: [] }), 0.001, { paddle: 0, steer: 0 }, null, simCache);
    cond.input = { paddle: 0, steer: 0 };
  }
  if (voyage.landfall && !landfallShown && land) showLandfall();

  let w = environment ? {...cond.w,...previewWeather(environment)} : DEBUG && window.__sea ? { ...cond.w, ...window.__sea } : cond.w;
  if(environment?.fronts && fronts.previewing){
    const influence=fronts.influence,dir=fronts.windDirection;
    w={...w,cover:Math.max(w.cover,influence.cover),precip:Math.max(w.precip,influence.rain),dark:Math.max(w.dark,influence.darkness),u:w.u+dir.u*influence.windBoost,v:w.v+dir.v*influence.windBoost};
    w.speed=Math.hypot(w.u,w.v);w.from=(Math.atan2(-w.u,-w.v)/DEG+360)%360;
  }
  const kS = firstFrame ? 1 : 1 - Math.exp(-dt / 3);
  for (const k of SMOOTH_KEYS) sm[k] = sm[k] === undefined ? w[k] : sm[k] + (w[k] - sm[k]) * kS;
  // Interpolate bearings across north; marine height/period stay optional when offline.
  for(const key of ['from','swellFrom','windWaveFrom']){
    if(Number.isFinite(w[key]))sm[key]=sm[key]===undefined?w[key]:(sm[key]+(((w[key]-sm[key]+540)%360)-180)*kS+360)%360;
    else delete sm[key];
  }
  for(const key of ['swellPeriod','windWaveH','windWavePeriod']){
    if(Number.isFinite(w[key]))sm[key]=sm[key]===undefined?w[key]:sm[key]+(w[key]-sm[key])*kS;
    else delete sm[key];
  }

  /* ----- Placement ----- */
  if (!origin || distance(voyage.lat, voyage.lng, origin.lat, origin.lng) > 20000) origin = { lat: voyage.lat, lng: voyage.lng };
  toLocal(voyage.lat, voyage.lng, origin.lat, origin.lng, tmpLocal);
  const bx = seaReview?0:tmpLocal.x, bz = seaReview?0:tmpLocal.z;

  /* ----- Sky ----- */
  const skyT=skyTime(tNow,voyage.lng,{mode:conditionsMode,hour:environment?.hour});
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
  su.uStars.value = p.star * (1 - moonLight * 0.35) * (environment?.starStrength ?? 1);
  su.uMoonLight.value = moonLight;
  su.uMoonRadius.value=.0085*(environment?.moonScale ?? 1.5);
  su.uUseLunarMap.value=environment?.lunarSurvey===false?0:1;
  su.uDarkness.value = dark;

  /* ----- Lightning in heavy squalls ----- */
  const stormy = Math.max(0, Math.min(1, (sm.precip - 0.35) * 1.6)) * Math.max(0, Math.min(1, (dark - 0.25) * 2));
  if (started && stormy > 0 && Math.random() < dt * stormy * 0.12) {
    flash = 0.7 + Math.random() * 0.8;
    const distKm = 1 + Math.random() * 9;
    audio.thunder(distKm / 0.343, Math.min(1, 2.2 / distKm + 0.25));
    log.storm();
  }
  if (flash > 0.001) {
    const f = flash * (0.6 + 0.4 * Math.sin(elapsed * 90));
    su.uZen.value.addScalar(f * 0.5);
    su.uHor.value.addScalar(f * 0.6);
    flash *= Math.exp(-dt * 9);
  }
  su.uTime.value = waveTime;

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
  const ou = ocean.uniforms;
  ocean.setSea(sm.speed, windTo, sm.swellH, (sm.swellFrom + 180) * DEG, whitecap, (environment?.seaImpacts===false?0:Math.min(1, sm.precip)*(environment?.rainImpactStrength??1)),Number.isFinite(sm.windWaveH)?{windWaveH:sm.windWaveH,windWavePeriod:sm.windWavePeriod,windWaveFrom:sm.windWaveFrom,swellPeriod:sm.swellPeriod}:null);
  ou.uTextureDetail.value=marineAssets?.water?(environment?.waterDetail??1):0;
  ou.uFoamDetail.value=environment?.foamDetail??1;
  ou.uOpticsDetail.value=environment?.waterOptics===false?0:1;
  if(marineAssets){marineAssets.strength.value=environment?.materialDetail??1;marineAssets.setSail(environment?.sailWeave??'linen');}
  if(environment){const status=$('surfaceStatus');if(status)status.textContent=marineReview.failed.length?'Some detail maps could not load; original surfaces remain available.':marineReview.loaded?'Downloaded surface detail ready · original boat colours retained':'Loading surface detail…';}
  ou.uFog.value.set(...hor);
  ou.uVis.value = sm.visibility;
  ou.uWaveT.value = waveTime;
  const cold = smoothstep(22, 50, Math.abs(voyage.lat));
  const lum = Math.max(0.05, Math.min(1, (e + 10) / 20)) * (1 - 0.35 * dark) + ml * 0.15;
  const body = lerp3([0.015, 0.085, 0.15], [0.025, 0.07, 0.085], cold).map((v) => v * lum);
  ou.uBody.value.set(...body);

  /* ----- Lantern: lit automatically after dusk unless the player chooses otherwise ----- */
  lanternOn = voyage.lantern === true || (voyage.lantern !== false && sunV.y < 0.02);

  const eyeTarget = lanternOn && pitch < 0.25 ? 0.72 : 1.25;
  darkAdaptation += (eyeTarget-darkAdaptation)*(1-Math.exp(-dt/(eyeTarget>darkAdaptation?18:2.5)));
  sky.setNightVision(darkAdaptation);

  /* ----- Canoe and paddler ----- */
  const relWind = ((((w.from - voyage.heading) % 360) + 540) % 360) - 180;
  canoe.update({
    x: bx, z: bz, headingDeg: voyage.heading, rain: sm.precip,
    paddling: !!cond.input.paddleRequested,paddleTimeScale:(environment?.paddleSlow ? .3 : 1), sailUp: voyage.sail,
    apparentFromRel: relWind, windSpeed: sm.speed, lantern: lanternOn,
    t: elapsed, dt, rawDt, waveT: waveTime, ocean,
    light: [0, 1, 2].map((i) => p.sun[i] * smoothstep(-0.04, 0.08, sunV.y) * (1 - 0.6 * dark) * 0.6 + hor[i] * 0.35),
    onPaddleWater: event=>paddleFeedback.water(event,elapsed)
  });
  canoe.eye(eyePos, eyeQuat);
  paddlerHands.update(dt,canoe.getPaddlePose(),{seat:canoe.seat,eye:canoe.group.worldToLocal(paddlerLocalEye.copy(eyePos)),visible:started&&!paused&&!window.__cam&&!window.__moonCam&&!window.__birdCam&&(!environment||environment.hands)});
  hullRain.update(dt,Math.min(1,sm.precip),hor,{enabled:environment?.boatImpacts!==false,strength:environment?.rainImpactStrength??1});
  boatProps?.update(dt,Math.min(1,sm.precip),radio.mediaState());gps.update(dt,elapsed);anbernic.update(dt,elapsed);

  /* ----- Glowing water, wake, spray and hull sounds ----- */
  const bio = (environment && !environment.bio ? 0 : 1) * smoothstep(0.02, -0.12, sunV.y) * (1 - 0.35 * moonLight) * (environment?.bioStrength ?? 1.8);
  ou.uBio.value = environment && !environment.bio ? 0 : bio;
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
  ou.uBoatMotion.value = Math.min(1.5, Math.abs(heaveRateNow)*.65);
  const sign = Math.sign(heaveRateNow);
  lapCool -= dt;
  if (sign !== lastHeaveSign && Math.abs(heaveRateNow) > 0.12 && lapCool <= 0) {
    audio.lap(Math.min(1.4, Math.abs(heaveRateNow) * 1.5));
    lapCool = 0.5;
    // Bow slams into a sea: spray
    if (heaveRateNow < -0.35 || voyage.speed > 1.8) {
      const n = Math.round(10 + Math.abs(heaveRateNow) * 25 + voyage.speed * 6);
      hullRain.splash(Math.min(1.8,Math.abs(heaveRateNow)*.25));
      if (started && !window.__cam && Math.random() < .35) lensRain.splash(Math.min(1.4, Math.abs(heaveRateNow)*.22));
      spray.emit(bx + fX * 2.5, canoe.heave + 0.25, bz + fZ * 2.5, fX * voyage.speed * 0.6 + rX * 0.8, 1.8 + Math.abs(heaveRateNow), fZ * voyage.speed * 0.6 + rZ * 0.8, n, 1.2);
    }
  }
  lastHeaveSign = sign;
  if (Math.random() < dt * Math.max(0,sm.speed-5)*.002) audio.creak(0.4 + Math.random() * 0.4);
  audio.setLantern(lanternOn ? 1 : 0);
  spray.update(dt, hor, bio,waveTime);
  lookEuler.set(pitch, yawRel, 0, 'YXZ');
  lookQuat.setFromEuler(lookEuler);
  camNear.position.copy(eyePos);
  camNear.quaternion.copy(eyeQuat).multiply(lookQuat);
  if (DEBUG && window.__cam) {
    // Debug orbit camera: offset from the boat in its own frame, looking at the hull
    const c = window.__cam;
    const off = new THREE.Vector3(c[0], c[1], c[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), -voyage.heading * DEG);
    camNear.position.copy(canoe.group.position).add(off);
    camNear.lookAt(canoe.group.position.x, canoe.group.position.y+(canoe.seat.y>1?1.1:0), canoe.group.position.z);
  }
  if (DEBUG && window.__birdCam && wildlife.active && wildlife.position) {
    camNear.position.copy(wildlife.position).add(new THREE.Vector3(-5,2,6));
    camNear.lookAt(wildlife.position);
  }
  if(PREVIEW && window.__moonCam){camNear.lookAt(camNear.position.clone().addScaledVector(moonV,1000));}
  if(binoculars.active){camNear.fov=camFar.fov=binoculars.fov;camNear.updateProjectionMatrix();camFar.updateProjectionMatrix();}
  worldArrival?.applyCamera(camNear,canoe.group.position,voyage.heading);
  camFar.position.copy(camNear.position);
  camFar.quaternion.copy(camNear.quaternion);
  camNear.updateMatrixWorld();
  camFar.updateMatrixWorld();
  meteors.update(dt,camFar,{time:elapsed,sunAltitude:e,cloudCover:sm.cover,playing:started&&!paused,enabled:!environment||environment.meteors});
  fronts.update(dt,camNear,{time:elapsed,windU:sm.u,windV:sm.v,rain:sm.precip,cover:sm.cover,darkness:sm.dark,sunAltitude:e,tint:hor,enabled:!environment||environment.fronts,playing:started&&!paused,flash});

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

  wildlife.update(dt,camNear,{lat:voyage.lat,windFrom:w.from*DEG,windSpeed:sm.speed,time:elapsed,sunAltitude:e,enabled:!environment || environment.birds,playing:started && !paused && (!environment || environment.birds)});

  whales.update(dt,camNear,{time:elapsed,windSpeed:sm.speed,sunAltitude:e,playing:started && !paused,enabled:!environment || environment.whales,ships:!environment||environment.ships,lat:voyage.lat,nearestLand:islands?.nearest?.d??Infinity,tint:hor});

  /* ----- Light for the boat ----- */
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
  rain.update(dt, camNear.position, Math.min(1, sm.precip), sm.u, sm.v, hor.map((v) => Math.min(1, v * 1.25 + 0.08)),{enabled:environment?.fallingRain!==false,veil:environment?.rainVeil!==false,strength:environment?.rainDensity??1});
  seaRain.update(dt,camNear.position,Math.min(1,sm.precip),hor,waveTime,{enabled:environment?.seaImpacts!==false,strength:environment?.rainImpactStrength??1});
  const heaveRate = (canoe.heave - prevHeave) / Math.max(dt, 1e-3);
  prevHeave = canoe.heave;
  audio.update(sm.speed, Math.hypot(sm.swellH,ocean.hsWind), Math.min(1, sm.precip), heaveRate, nightNow);
  radio.update(dt);

  fwd.set(0, 0, -1).applyQuaternion(camNear.quaternion);
  const viewBearing = ((Math.atan2(fwd.x, -fwd.z) / DEG) + 360) % 360;
  compass.update(viewBearing, dt, Math.min(2, Math.abs(heaveRate)));

  if (elapsed - lastHud > 0.5) {
    lastHud = elapsed;
    if(environment){
      const pose=canoe.getPaddlePose();
      environment.rainReview={falling:rain.state.counts,seaImpacts:seaRain.activeCount,boatImpacts:hullRain.activeCount,viewDrops:lensRain.dropCount};
      environment.paddleReview={stage:pose.stage,phase:pose.phase,side:pose.side,submerged:pose.submerged,drive:pose.drive,stroke:pose.strokeId};
      $('paddleStatus').textContent=`${pose.stage.charAt(0).toUpperCase()+pose.stage.slice(1)} · ${pose.rowing?'paired oars':pose.side<0?'left side':'right side'}${environment.paddleSlow?' · 30% speed':''}${pose.submerged?' · blade in water':''}${pose.active?' · '+Math.round(pose.phase*100)+'%':''}`;
      environment.currentWeather={wind:sm.speed,swell:sm.swellH,rain:sm.precip,clouds:sm.cover,darkness:sm.dark};
      environment.frontPreview={active:fronts.previewing,progress:fronts.influence.progress,distance:fronts.distance};
      $('frontStatus').textContent=fronts.previewing?`Front ${(fronts.distance/1000).toFixed(1)} km away · preview ${Math.round(fronts.influence.progress*100)}% · rain ${Math.round(sm.precip*100)}%`:'';
    }
    updateLandDistance(elapsed);
    const d = new Date(environment||conditionsMode==='experience'?skyT+voyage.lng/15*3600e3:tNow);
    $('clockOut').textContent = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}${!environment&&conditionsMode==='live'?' UTC':''}`;
    if(!environment){
      const status=liveWeather.status(voyage.lat,voyage.lng,tNow);
      const simulated=!liveEnabled();
      $('conditionsSummary').textContent=simulated?'Experience · simulated':status.weather==='live'&&status.marine==='live'?'Live conditions':status.weather==='cached'||status.marine==='cached'?'Cached forecast':status.pending?'Connecting to weather…':status.weather==='live'?'Live weather · simulated sea':'Simulated conditions';
      $('conditionsValues').textContent=`Cloud ${Math.round(sm.cover*100)}% · wind ${(sm.speed*1.944).toFixed(0)} kn · ${Number.isFinite(w.waveH)?'combined sea '+w.waveH.toFixed(1):'swell '+sm.swellH.toFixed(1)} m`;
      $('conditionsSky').textContent=skyDescription(e,bodies.moon.alt/DEG,bodies.illum);
      const stamp=time=>time?new Date(time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC':'unavailable';
      $('conditionsSource').textContent=simulated?'Simulated weather. The sky follows your local clock.':`Atmosphere: ${status.weather==='live'?'regional forecast':status.weather==='cached'?'cached forecast':'simulated'} (checked ${stamp(status.weatherTime)}). Sea: ${status.marine==='live'?'marine forecast':status.marine==='cached'?'cached forecast':'simulated'} (checked ${stamp(status.marineTime)}). Ocean currents are simulated.`;
    }
    $('dayOut').textContent = `Day ${Math.max(1,Math.floor((tNow - voyage.start) / 864e5) + 1)}`;
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

  // Item selection shares the moving boat transform; locked view uses its centre.
  itemUnderPointer=null;
  if(started&&!paused&&!inspection.active&&!binoculars.active&&(pointerPosition||locked)){
    const r=canvas.getBoundingClientRect(),p=locked?{x:r.width/2,y:r.height/2}:pointerPosition;
    itemUnderPointer=boatProps?.pick(camNear,p.x,p.y,r.width,r.height)??null;
  }
  $('itemHint').hidden=!itemUnderPointer||inspection.active||binoculars.active;
  if(itemUnderPointer)$('itemHint').textContent=`Inspect ${EQUIPMENT[itemUnderPointer].title} · F`;
  if(inspection.active){inspection.render(dt);firstFrame=false;return;}

  /* ----- Render ----- */
  sky.renderClouds(firstFrame);
  marineLighting.update(elapsed,environment?.skyReflections!==false);
  lensRain.setIntensity(environment?.screenWaterStrength ?? 1.7);
  lensRain.setRainStrength(environment?.rainDropStrength??1);
  lensRain.update(dt, Math.min(1,sm.precip),sm.speed,Math.max(.02,sunUp),elapsed,started && !paused && !window.__cam && !window.__birdCam,{drops:environment?.screenDrops!==false});
  lensRain.begin();
  renderer.clear();
  renderer.render(scene, camFar);
  renderer.clearDepth();
  // Moon inspection is a sky study; the mast must not obscure the inspected disc.
  if(!(PREVIEW&&window.__moonCam))renderer.render(scene, camNear);
  lensRain.render();
  worldArrival?.render();
  firstFrame = false;
}

function onResize() {
  syncControlLayout();
  const a = window.innerWidth / window.innerHeight;
  for (const c of [camNear, camFar]) { c.aspect = a; c.updateProjectionMatrix(); }
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  worldArrival?.resize();
  radio.resize();
  lensRain.resize();rain.resize();
}
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveVoyage(voyage); });
window.addEventListener('pagehide', () => saveVoyage(voyage));

/* ---------- Boot ---------- */
async function boot() {
  const [landData, skyData] = await Promise.all([
    fetch(BASE + 'data/land-world.json').then((r) => r.json()),
    fetch(BASE + 'data/sky.json').then((r) => r.json())
  ]).catch(() => fail('The ocean could not load. Check your connection and reload the page.'));
  land = new Land(landData);
  fetch(BASE+'data/navigation-world.json').then(r=>{if(!r.ok)throw Error('Chart unavailable');return r.json();}).then(chart=>gps.setup(land,chart,landData)).catch(e=>console.warn('GPS chart could not load',e));
  worldArrival=createWorldArrival({renderer,land,isTouch,base:BASE});
  islands = createIslands(scene, land, sky.uniforms);
  sky.buildStars(skyData);
  minimap = createMinimap($('minimap'), land);
  $('mapIn').addEventListener('click', () => minimap.zoom(-1));
  $('mapOut').addEventListener('click', () => minimap.zoom(1));

  const handheldInfo=await fetch(BASE+'data/anbernic.json').then(r=>r.json());anbernic.setScreenInfo(handheldInfo.screen);

  // Supplied rowing boat and approved Magnific lantern; fallback stays until these arrive
  const loader = new GLTFLoader();
  loader.load(BASE + 'models/rowing-boat.glb', (g) => {
    try {
      const r = canoe.applyRowingBoat(g.scene);
      marineBoat=g.scene;
      boatProps=createBoatProps(canoe,{base:BASE,gps,anbernic,onInspect:inspectEquipment,onAsset:(id,root)=>inspection.register(id,root),register:root=>marineLighting.register(root)});
      for(const id of voyage.stowedEquipment||[])boatProps.setStowed(id,true);
      marineLighting.register(marineBoat);
      if(marineAssets)marineReview.materials=applyMarineDetails(marineBoat,marineAssets);
      ocean.uniforms.uHullSeg.value.set(r.halfLength,r.halfBeam,1,0);
      ocean.uniforms.uHullProfile.value=r.profile;
      if(!window.__cam)pitch=-.20;
    } catch (e) { console.warn('Rowing boat could not be fitted', e); }
  }, undefined, () => {});
  loader.load(BASE + 'models/lantern.glb', (g) => {
    try { inspection.register('lantern',g.scene.clone(true));canoe.applyLantern(g.scene); } catch (e) { console.warn('Lantern model could not be fitted', e); }
  }, undefined, () => {});

  if(PREVIEW)voyage=null;
  const fresh = !voyage;
  returningVoyage=!fresh;
  let bootAway = 0, bootAwayDistance = 0;
  if (!voyage) voyage = newVoyage(now());
  if (DEBUG && params.get('at')) {
    const [la, lo] = params.get('at').split(',').map(Number);
    if (Number.isFinite(la) && Number.isFinite(lo)) { voyage.lat = la; voyage.lng = lo; voyage.t = now(); }
  }
  if (DEBUG && params.get('heading')) voyage.heading = Number(params.get('heading')) || 0;
  if (voyage.t > now()) voyage.t = now();

  log.attach(voyage);
  if (!voyage.landfall) {
    const r = catchUp(voyage, now(), land, (conditions) => log.tick(conditions.w),simCache);
    bootAway = r.away;
    bootAwayDistance = r.distance;
    if (!fresh && r.away > 120000) {
      const note = $('awayNote');
      note.hidden = false;
      note.textContent = `You were away for ${humanDuration(r.away)} and travelled ${(r.distance / 1000).toFixed(1)} km. ${voyage.sail ? 'The sail was up and the steering oar lashed, so the boat kept sailing on its heading.' : 'The sail was down, so the boat drifted with the wind and the current.'}${r.landed ? ' While you were gone, it came ashore.' : ''}`;
    }
  }
  if(liveEnabled())liveWeather.refresh(voyage.lat,voyage.lng);
  saveVoyage(voyage);
  if (!fresh) {
    $('introLede').textContent = 'The ocean kept moving. Your boat is waiting.';
    $('begin').textContent = 'Continue the voyage';
  }
  log.attach(voyage);
  if (!fresh && bootAway > 30 * 60e3) log.add(`Away from the boat for ${humanDuration(bootAway)} and travelled ${(bootAwayDistance / 1000).toFixed(1)} km. ${voyage.sail ? 'She sailed on by herself.' : 'She drifted on the wind and current.'}`, 'away');
  syncNav();
  $('loadNote').hidden = true;
  $('begin').disabled = false;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('arrivalHint').hidden=true;

  if(PREVIEW){
    $('arrivalHint').hidden=true;
    document.body.classList.add('environment-preview');dragMode=true;
    $('introTitle').textContent='Environment studio';
    $('introLede').textContent='Explore the ocean. Change the conditions.';
    $('begin').textContent='Enter environment studio';
    $('homeStudioLink').textContent='Return to your voyage';$('homeStudioLink').href='./';
    environment=createEnvironmentPreview({audio,base:BASE,onArrival:previewWorldArrival,
      onView(view){window.__moonCam=false;camNear.fov=camFar.fov=68;camNear.updateProjectionMatrix();camFar.updateProjectionMatrix();window.__birdCam=false;window.__cam=['seat','sky','rowing'].includes(view)?null:view.split(',').map(Number);pitch=view==='sky'?.65:view==='rowing'?-.55:-.35;yawRel=0;},
      onPreset(){resetStudioCamera();},
      onMeteor(){resetStudioCamera(.5);meteors.preview(camFar);},
      onFront(){resetStudioCamera(.04);fronts.preview(camNear);},
      onBio(){resetStudioCamera(-.55);voyage.lantern=false;keys.add('KeyW');setTimeout(()=>keys.delete('KeyW'),9000);},
      onMoon(){
        fronts.cancelPreview();sm.cover=0;sm.precip=0;sm.dark=0;firstFrame=true;
        let bestHour=0,bestScore=-Infinity;
        for(let hour=0;hour<24;hour+=.5){const bodies=skyBodies(skyTime(now(),voyage.lng,{hour}),voyage.lat,voyage.lng);const score=bodies.moon.alt-(bodies.sun.alt>-.08?4:0);if(score>bestScore){bestScore=score;bestHour=hour;}}
        window.__moonCam=true;window.__cam=null;window.__birdCam=false;camNear.fov=camFar.fov=30;camNear.updateProjectionMatrix();camFar.updateProjectionMatrix();return bestHour;
      },
      onBird(){if(!wildlife.preview(camNear,Math.atan2(-sm.u,-sm.v)))toast('Albatross is loading. Try again in a moment.');},
      onWhale(kind='humpback'){resetStudioCamera(-.025);whales.preview(camNear,kind);toast('Preparing '+kind+' encounter…');},
      onPaddle(){resetStudioCamera(-.42);keys.add('KeyW');setTimeout(()=>keys.delete('KeyW'),6000);},
      onSingleStroke(side){resetStudioCamera(-.42);keys.delete('KeyW');keys.delete('ArrowUp');touchInput.paddle=false;if(!canoe.requestStroke(side))toast('Let this stroke finish, then preview another.');},
      onClearScreen(){lensRain.clear();},onSpray(){lensRain.splash(1.5);},onSail:toggleSail,onLantern:toggleLantern,
      onThunder(){audio.start();flash=1;audio.thunder(1,1);}
    });
  }
  if (DEBUG && params.has('qa')) {
    const panel = document.createElement('aside');
    panel.className = 'qa-panel';
    panel.innerHTML = `<b>Visual checks · debug voyage</b>
      <div>Sea <button data-sea="0">Calm</button><button data-sea="9">Moderate</button><button data-sea="26">Gale</button></div>
      <div>View <button data-view="seat">Seat</button><button data-view="5,3,4">Port</button><button data-view="-5,3,4">Starboard</button><button data-view="0,3,-6">Bow</button><button data-view="0,4,6">Stern</button><button data-sky="1">Sky</button></div>
      <div><button data-paddle="1">Paddle 12 seconds</button><button data-spray="1">Lens spray</button><button data-bird="1">Albatross preview</button><button data-bird-detail="1">Bird detail</button></div>
      <output id="qaStatus"></output>`;
    panel.addEventListener('click', (event) => {
      if (event.target.dataset.birdDetail) { window.__birdCam=true; wildlife.preview(camNear,0); }
      if (event.target.dataset.bird) { if(!wildlife.preview(camNear,Math.atan2(-sm.u,-sm.v))) toast('Albatross model awaiting asset approval.'); }
      if (event.target.dataset.sky) { window.__birdCam=false; window.__cam=null; pitch=.65; yawRel=0; }
      if (event.target.dataset.paddle) { keys.add('KeyW'); setTimeout(()=>keys.delete('KeyW'),12000); }
      if (event.target.dataset.spray) lensRain.splash(1.5);
      if (event.target.dataset.sea !== undefined) {
        const speed = Number(event.target.dataset.sea);
        window.__sea = { speed, swellH: speed / 5, precip: speed > 18 ? 0.7 : 0, cover: speed > 18 ? 0.85 : 0.25 };
        Object.assign(sm, window.__sea);
      }
      if (event.target.dataset.view) {
        window.__birdCam=false;
        window.__cam = event.target.dataset.view === 'seat' ? null : event.target.dataset.view.split(',').map(Number);
        if (!window.__cam) pitch = -0.35;
      }
    });
    document.body.appendChild(panel);
    setInterval(() => {
      const p = canoe.lantern.position, h = canoe.group.position, mask = ocean.uniforms.uHull.value;
      $('qaStatus').textContent = `Wind ${sm.speed.toFixed(1)} m/s · waves ${ocean.hsWind.toFixed(1)} m\nLantern: ${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)} m\nSea/boat alignment: ${Math.hypot(h.x-mask.x,h.z-mask.y,h.y-mask.z).toFixed(6)} m\nWet wood: ${(canoe.wetness*100).toFixed(0)}% · view drops: ${lensRain.dropCount}\nApproved recordings loaded: ${audio.recordingCount}\nNight sky: ${sky.uniforms.uStars.value.toFixed(2)} · albatross: ${wildlife.active?"in flight":wildlife.ready?"ready":"loading"}`;
    }, 500);
  }
  if (DEBUG) {
    window.__pd = {
      get voyage() { return voyage; },
      get canoe() { return canoe; },
      get ocean() { return ocean; },
      get marine(){return marineReview;},
      get conditions(){return {mode:conditionsMode,status:liveWeather.status(voyage.lat,voyage.lng,now()),sample:liveWeather.sample(voyage.lat,voyage.lng,now()),skyTime:skyTime(now(),voyage.lng,{mode:conditionsMode,hour:environment?.hour})};},
      get gear(){return boatProps?.state;},
      get equipment(){return {open:inspection.active,item:inspection.current,binoculars:binoculars.active,media:radio.mediaState()};},
      sea(speed, swellH = speed / 5) { window.__sea = { speed, swellH, precip: speed > 18 ? 0.7 : 0, cover: speed > 18 ? 0.85 : 0.25 }; },
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
          // to port of the boat
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
