import assert from 'node:assert/strict';
import * as THREE from 'three';
import {opticsVisibility} from '../src/sky-optics.js';
import {sampleWaveSet,createExceptionalWaves} from '../src/exceptional-waves.js';
const clear={sunAltitude:12,rain:.3,cover:.2,visibility:50000};assert.ok(opticsVisibility(clear).rainbow>.5);assert.equal(opticsVisibility({...clear,sunAltitude:-10}).rainbow,0);assert.equal(opticsVisibility({...clear,rain:0}).rainbow,0);assert.ok(opticsVisibility({...clear,visibility:900}).fogbow>0);assert.equal(opticsVisibility({...clear,sunAltitude:60}).rainbow,0);assert.ok(opticsVisibility({sunAltitude:-20,moonAltitude:30,moonLight:.5,cirrus:.7,cover:.2}).moonHalo>0);
const p=new THREE.Vector4(0,0,0,2.6),d=new THREE.Vector2(.6,.8);for(let t=-1;t<73;t+=.5){const a=sampleWaveSet(80,70,t,p,d);assert.ok(Math.abs(a.h)<=2.6);const e=.001;assert.ok(Math.abs(a.sx-(sampleWaveSet(80+e,70,t,p,d).h-sampleWaveSet(80-e,70,t,p,d).h)/(2*e))<1e-7);assert.ok(Math.abs(a.sz-(sampleWaveSet(80,70+e,t,p,d).h-sampleWaveSet(80,70-e,t,p,d).h)/(2*e))<1e-7);}
const ocean={uniforms:{uWaveSet:{value:new THREE.Vector4()},uWaveSetDir:{value:new THREE.Vector2()}}},waves=createExceptionalWaves(ocean,{random:()=>0}),camera={position:new THREE.Vector3()};waves.update(2500,camera,{time:2500,swell:.5,wind:2});assert.equal(waves.active,false);waves.update(1,camera,{time:2501,swell:3,wind:12});assert.equal(waves.active,true);waves.update(1,camera,{time:2502,enabled:false});assert.equal(waves.active,false);
console.log('PASS conditional optical events, consistent wave slopes and rare rough-sea gating');
