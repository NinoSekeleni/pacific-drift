import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createCanoe } from '../src/canoe.js';
import { Land, distance } from '../src/geo.js';
import { newVoyage, catchUp, step, saveVoyage, loadVoyage, useStorageKey } from '../src/voyage.js';
import { weatherAt } from '../src/weather.js';
import { createLog } from '../src/log.js';

// Canvas paint operations are irrelevant to the physics and transform regression.
const ctx = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({addColorStop(){}}) : () => {} });
globalThis.document = { createElement: () => ({getContext: () => ctx}) };
const scene = new THREE.Scene();
const canoe = createCanoe(scene);
const uniforms = {
  uHull: {value: new THREE.Vector4()},
  uHullAx: {value: new THREE.Vector4()},
  uHullInverse: {value: new THREE.Matrix4()}
};
let sea = 0;
const ocean = { uniforms, sample(x,z,t,out) { out.h = sea * (Math.sin(x*2.5-t*2) * .35 + Math.cos(z*1.8-t)*.25); return out; } };
for (const height of [0, .8, 3]) {
  sea = height;
  for (let frame=0; frame<180; frame++) {
    canoe.update({x:124, z:-85, headingDeg:73, ocean, waveT:frame/60, t:frame/60, dt:1/60, rawDt:1/60, apparentFromRel:90, windSpeed:height*8, lantern:true});
    const h=uniforms.uHull.value;
    assert.equal(h.x,canoe.group.position.x);
    assert.equal(h.y,canoe.group.position.z);
    assert.equal(h.z,canoe.group.position.y);
    const local = new THREE.Vector3(.2,.2,-1.5);
    const restored = local.clone().applyMatrix4(canoe.group.matrixWorld).applyMatrix4(uniforms.uHullInverse.value);
    assert.ok(restored.distanceTo(local)<1e-10,'hull mask must track actual boat pitch and roll');
    assert.ok(Number.isFinite(canoe.heave));
  }
}
sea=0;
canoe.update({x:124,z:-85,headingDeg:73,ocean,waveT:30,t:30,dt:.1,rawDt:30,apparentFromRel:0,windSpeed:0});
assert.equal(canoe.heave,0,'resuming a hidden tab must snap to the current sea');
assert.ok(Math.abs(canoe.lantern.position.z)<.1,'fallback lantern must sit amidships');
assert.ok(canoe.lantern.position.y>.18 && canoe.lantern.position.y<.2);
console.log('PASS canoe transforms, rough sea, long-frame recovery, and fallback yoke placement');

const land = new Land(JSON.parse(fs.readFileSync(new URL('../public/data/land.json',import.meta.url))));
const t=Date.parse('2026-10-28T08:00:00Z');
assert.equal(land.landAt(-48.8767,-123.3933),null);
assert.match(land.landAt(-25.07,-130.10).name,/Pitcairn/);
assert.deepEqual(weatherAt(-48,-123,t),weatherAt(-48,-123,t));
for (const sail of [false,true]) {
  const a=newVoyage(t); a.sail=sail; a.heading=30;
  const b=structuredClone(a);
  const r=catchUp(a,t+2*864e5,land);
  const cache={};
  for (let i=0;i<2880;i++) step(b,60,{paddle:0,steer:0},land,cache);
  assert.ok(distance(a.lat,a.lng,b.lat,b.lng)<.001,'offline replay matches the same fixed-step voyage');
  assert.equal(a.t,t+2*864e5);
  assert.equal(r.distance,a.dist);
  assert.ok(r.distance>1000);
}
const saved=new Map();
globalThis.localStorage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)};
const real=newVoyage(t); saveVoyage(real);
useStorageKey('pacific-drift-debug');const debug=newVoyage(t+1000);saveVoyage(debug);
assert.equal(loadVoyage().start,t+1000);
useStorageKey('pacific-drift-voyage-v1');assert.equal(loadVoyage().start,t);
const v=newVoyage(t);const log=createLog();log.attach(v);
catchUp(v,t+3*864e5,land,c=>log.tick(c.w));
for (const day of [1,2,3,4]) assert.ok(v.log.some(e=>e.day===day && e.kind==='day'),`daily log ${day}`);
console.log('PASS coastlines, deterministic weather, sailing/drift replay, storage isolation, and offline daily logs');

const {soundMix}=await import('../src/sound-mix.js');
const calm=soundMix(0,0,0,0), storm=soundMix(26,6.5,.8,1.2);
for(const key of ['calmSea','roughSea','wind','rain','waterRain','fallbackSea','fallbackWind','fallbackRain']) assert.equal(calm[key],0,`silent still sea: ${key}`);
assert.ok(storm.roughSea>calm.roughSea && storm.wind>calm.wind && storm.rain>calm.rain);
for(const wind of [0,3,12,26,40]) for(const waves of [0,.3,2,7,12]) for(const value of Object.values(soundMix(wind,waves,.5,2,100))) assert.ok(Number.isFinite(value) && value>=0 && value<=1);
assert.ok(soundMix(2,.3,0,.1).wind<.001,'light breeze should not create a continuous hiss');
console.log('PASS quiet calm soundscape, weather levels, and bounded gains');

const manifest=JSON.parse(fs.readFileSync(new URL('../public/data/soundscape.json',import.meta.url)));
for(const recording of manifest.recordings){
  assert.equal(recording.approved,true);
  assert.match(new URL(recording.sourceUrl).hostname,/(^|\.)(magnific\.com|freesound\.org)$/);
  assert.ok(fs.statSync(new URL('../public/'+recording.file,import.meta.url)).size>1024,'approved sound must exist in the deliverable');
  if(recording.segments) for(const segment of recording.segments) assert.ok(segment.start>=0 && segment.duration>.1 && segment.start+segment.duration<(recording.id?.startsWith('freesound-')?600:10.1));
}
const {NodeIO}=await import('@gltf-transform/core');
const {ALL_EXTENSIONS}=await import('@gltf-transform/extensions');
const bird=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(new URL('../public/models/albatross.glb',import.meta.url).pathname);
let triangles=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
for(const mesh of bird.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const pos=primitive.getAttribute('POSITION');triangles+=(primitive.getIndices()?.getCount()||pos.getCount())/3;
  const value=[];for(let i=0;i<pos.getCount();i++){pos.getElement(i,value);for(let k=0;k<3;k++){min[k]=Math.min(min[k],value[k]);max[k]=Math.max(max[k],value[k]);}}
}
assert.ok(triangles<35000,'wildlife must stay light enough for the browser');
const wingRatio=(max[2]-min[2])/(max[0]-min[0]);assert.ok(wingRatio>2.4 && wingRatio<3.2,'bird wings must retain an albatross-like span');
console.log('PASS Magnific asset provenance, approved local audio, clip segments, and optimized albatross proportions');

const {environmentPresets,previewWeather}=await import('../src/environment-preview.js');
for(const preset of Object.values(environmentPresets)){
  const weather=previewWeather(preset);
  assert.ok(Math.abs(Math.hypot(weather.u,weather.v)-weather.speed)<1e-8,'preview wind vector must match its speed');
  assert.equal(weather.precip,preset.precip);
  const changed=previewWeather({...preset,precip:.65});
  assert.equal(changed.swellH,weather.swellH,'rain control must not change the selected swell');
  assert.equal(changed.speed,weather.speed,'rain control must not change the selected wind');
}
assert.equal(new Set(manifest.recordings.map(r=>r.file)).size,22,'all approved local clips including dedicated ocean and wave recordings are included');
assert.ok(!manifest.recordings.some(r=>r.role==='paddle' && r.id==='magnific-609'),'a drip recording must not stand in for a paddle stroke');
assert.equal(manifest.recordings.find(r=>r.id==='magnific-276').role,'audition','branches must remain out of the open-ocean soundscape');
console.log('PASS independent preview conditions, all downloaded clips, and unsuitable sound exclusions');
const whaleDoc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(new URL('../public/models/humpback.glb',import.meta.url).pathname);
let whaleTriangles=0;
for(const mesh of whaleDoc.getRoot().listMeshes())for(const p of mesh.listPrimitives())whaleTriangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
assert.ok(whaleTriangles>5000&&whaleTriangles<60000,'whale model must retain its shape within a browser-sized triangle budget');
const wildlifeManifest=JSON.parse(fs.readFileSync(new URL('../public/data/wildlife.json',import.meta.url)));
assert.equal(wildlifeManifest.models.find(m=>m.kind==='humpback').approved,true);
console.log('PASS approved optimized humpback asset ('+Math.round(whaleTriangles)+' triangles)');
const {rainClipForWeather}=await import('../src/sound-mix.js');
assert.equal(rainClipForWeather(.2,3),'magnific-262');
assert.equal(rainClipForWeather(.6,8),'magnific-210');
assert.equal(rainClipForWeather(.9,24),'magnific-280');
assert.equal(rainClipForWeather(.9,12,true),'magnific-278');
assert.equal(rainClipForWeather(.9,12,false),'magnific-225');
for(const rain of [.1,.6,.9])for(const wind of [3,12,24])for(const night of [false,true])assert.equal(manifest.recordings.filter(r=>r.loop&&r.id===rainClipForWeather(rain,wind,night)).length,1,'every automatic rain state must select exactly one local loop');
console.log('PASS a single rain bed selected for each weather condition');
const visualAssets=JSON.parse(fs.readFileSync(new URL('../public/data/visual-assets.json',import.meta.url)));
const moonPhoto=visualAssets.assets.find(a=>a.kind==='moon-surface');
assert.equal(moonPhoto.approved,true);assert.match(new URL(moonPhoto.sourceUrl).hostname,/(^|\.)(magnific\.com|freesound\.org)$/);
const moonBytes=fs.readFileSync(new URL('../public/'+moonPhoto.file,import.meta.url));
assert.ok(moonBytes.length>1000000);assert.equal(moonBytes[0],0xff);assert.equal(moonBytes[1],0xd8);
console.log('PASS approved Magnific photographic lunar surface is bundled');
