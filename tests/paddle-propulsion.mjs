import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCanoe} from '../src/canoe.js';
import {newVoyage,step} from '../src/voyage.js';
import {paddleDrive} from '../src/paddle-feedback.js';
const ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const ocean={uniforms:{uHull:{value:new THREE.Vector4()},uHullAx:{value:new THREE.Vector4()},uHullInverse:{value:new THREE.Matrix4()}},sample(x,z,t,out){out.h=0;return out;}};
function run({continuous=false,timeScale=1}={}){
 const canoe=createCanoe(new THREE.Scene()),voyage=newVoyage(Date.UTC(2026,9,28)),cache={};let time=0,pushes=0;
 const tick=(paddling=false)=>{time+=1/60;canoe.update({x:0,z:0,headingDeg:0,ocean,dt:1/60,rawDt:1/60,t:time,waveT:time,windSpeed:0,apparentFromRel:90,paddling,paddleTimeScale:timeScale});const pose=canoe.getPaddlePose(),force=paddleDrive(pose);if(force){assert.ok(pose.submerged&&pose.stage==='power');pushes++;}step(voyage,1/60,{paddle:0,paddleForce:force,steer:0},null,cache);};
 for(let i=0;i<60;i++)tick();
 if(continuous){for(let i=0;i<60*90;i++)tick(true);const cruising=voyage.speed;for(let i=0;i<60*15;i++)tick();return {cruising,coasting: voyage.speed,pushes};}
 canoe.requestStroke(1);for(let i=0;i<60*8;i++)tick();return voyage.speed;
}
const cruise=run({continuous:true});
assert.ok(cruise.cruising>1.1&&cruise.cruising<1.8,'normal repeated strokes should sustain a useful canoe pace');
assert.ok(cruise.coasting>0&&cruise.coasting<cruise.cruising*.5,'releasing the paddle coasts and slows');
const normal=run(),slow=run({timeScale:.3});assert.ok(normal>.03&&slow>.03);assert.ok(slow<normal*1.6,'slow motion must not multiply stroke impulse');
const air=newVoyage(),cache={};for(let i=0;i<60;i++)step(air,1/60,{paddle:0,paddleForce:0,steer:0},null,cache);assert.equal(air.speed,0,'no immersed pull gives no paddling speed');
console.log(`PASS contact impulses, ${cruise.cruising.toFixed(2)} m/s sustained cadence, coasting and bounded slow-motion stroke`);
