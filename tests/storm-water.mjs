import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createOcean} from '../src/ocean.js';
const ocean=createOcean({capabilities:{getMaxAnisotropy:()=>1}},new THREE.Scene(),{});
const snapshot=()=>ocean.uniforms.uWaves.value.map(w=>w.toArray());
ocean.setSea(2,.9,.15,1.7,0,.75);const calm=ocean.uniforms.uStormChop.value;assert.equal(calm,0,'heavy rain alone must not create storm chop');assert.equal(ocean.uniforms.uFoamActivity.value,0);
ocean.setSea(24,.9,4.5,1.7,.7,0);const dryWaves=snapshot(),dryChop=ocean.uniforms.uStormChop.value;assert.ok(dryChop>.9,'a dry gale keeps its fine surface detail');assert.equal(ocean.uniforms.uFoamActivity.value,1);
ocean.setSea(24,.9,4.5,1.7,.7,.85);assert.deepEqual(snapshot(),dryWaves,'rain shading cannot change wave height/direction or buoyancy');assert.equal(ocean.uniforms.uStormChop.value,dryChop,'storm chop must stay independent of rain');
let previous=0;for(const wind of [2,8,10,14,18,24,32]){ocean.setSea(wind,.9,1,1.7,.3,.5);const gain=ocean.uniforms.uStormChop.value;assert.ok(gain>=previous&&gain>=0&&gain<=1);previous=gain;}
ocean.setSea(24,.9,4.5,1.7,.7,.85);for(const point of [[0,0],[10,-14],[100,40]])for(const t of [0,42,180]){const s=ocean.sample(...point,t);assert.ok(Object.values(s).every(Number.isFinite));}
console.log('PASS calm rain isolation, dry/wet storm chop, bounded wind response and unchanged physical waves');
// The supplied forecast owns the wave energy and wavelength, rather than adding to a synthetic sea.
ocean.setSea(20,0,1,0,.5,0,{windWaveH:2,windWavePeriod:7,windWaveFrom:270,swellPeriod:12});
assert.equal(ocean.hsWind,2);const live=snapshot();assert.ok(live.every(w=>w.every(Number.isFinite)));
assert.ok(Math.abs(live.at(-3)[2]-9.81*12**2/(2*Math.PI))<1e-8,'swell period controls deep-water wavelength');
ocean.setSea(20,0,1,0,.5,0,{windWaveH:0,windWavePeriod:7,windWaveFrom:270,swellPeriod:12});
assert.equal(ocean.hsWind,0,'a missing wind-wave split does not duplicate the total sea');
for(const point of [[0,0],[10,-14]]){assert.ok(Object.values(ocean.sample(...point,42)).every(Number.isFinite));}
// A long-running session must not jump the boat when a forecast's period changes.
const longSea=createOcean({capabilities:{getMaxAnisotropy:()=>1}},new THREE.Scene(),{});
const state={windWaveH:2,windWavePeriod:7,windWaveFrom:270,swellPeriod:12};
longSea.uniforms.uWaveT.value=86400;longSea.uniforms.uHull.value.set(500,1000,0,1);
longSea.setSea(15,0,2,0,.5,0,state);const heightBefore=longSea.sample(500,1000,86400).h;
longSea.setSea(15,0,2,0,.5,0,{...state,windWavePeriod:7.01,swellPeriod:12.01,windWaveFrom:270.01});
assert.ok(Math.abs(longSea.sample(500,1000,86400).h-heightBefore)<.005,'forecast updates preserve wave phase beside the hull after a full day');
