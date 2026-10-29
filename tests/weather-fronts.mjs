import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWeatherFronts,frontPreviewInfluence} from '../src/weather-fronts.js';
for(let age=-30;age<=150;age+=.5){
  const state=frontPreviewInfluence(age);
  for(const [key,value] of Object.entries(state)){assert.ok(Number.isFinite(value),key);assert.ok(value>=0,key);assert.ok(value<=(key==='windBoost'?11:1),key);}
}
assert.equal(frontPreviewInfluence(0).rain,0);
assert.equal(frontPreviewInfluence(120).rain,0);
assert.ok(frontPreviewInfluence(65).rain>.5,'rain should arrive after the bank approaches');
assert.ok(frontPreviewInfluence(35).cover>.15&&frontPreviewInfluence(35).rain===0,'cloud bank should precede local rain');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(200,1.6,-80);
const fronts=createWeatherFronts(scene),weather={playing:true,time:0,windU:8,windV:4,rain:0,cover:.1,darkness:0};
for(let i=0;i<1600;i++)fronts.update(.1,camera,weather);
assert.equal(fronts.active,false,'clear weather must not spawn unrelated storms');
fronts.preview(camera);
assert.equal(fronts.previewing,true);
const firstDistance=fronts.distance;
for(let i=0;i<350;i++)fronts.update(.1,camera,weather);
assert.ok(fronts.distance<firstDistance,'front must approach the observer');
assert.equal(fronts.influence.rain,0,'rain should not precede the distant shelf');
assert.ok(fronts.influence.cover>0);
for(let i=0;i<300;i++)fronts.update(.1,camera,weather);
assert.ok(fronts.influence.rain>.5,'preview must progress into rain');
fronts.update(.1,camera,{...weather,enabled:false});
assert.equal(fronts.active,false);assert.equal(fronts.influence.rain,0);
for(let i=0;i<400;i++)fronts.update(.1,camera,{...weather,rain:.3,cover:.7,darkness:.3});
assert.equal(fronts.active,true,'unsettled weather should reveal an approaching front');
assert.equal(fronts.previewing,false);
assert.equal(fronts.influence.rain,0,'natural fronts must not modify weather simulation');
fronts.preview(camera);fronts.update(.1,camera,weather);fronts.cancelPreview();assert.equal(fronts.previewing,false);assert.equal(fronts.active,false);assert.equal(fronts.influence.rain,0);
fronts.dispose();assert.equal(scene.children.length,0);
console.log('PASS front lifecycle, independent clear weather, delayed rain and preview envelopes');
