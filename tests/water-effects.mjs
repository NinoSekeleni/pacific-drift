import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createOcean} from '../src/ocean.js';
import {createSpray} from '../src/spray.js';
globalThis.window={devicePixelRatio:1};
const scene=new THREE.Scene(),renderer={capabilities:{getMaxAnisotropy:()=>1}};
const ocean=createOcean(renderer,scene,{});
ocean.uniforms.uHullAx.value.set(1,0,0,0);ocean.addRipple(2,4,10,.06);
ocean.uniforms.uHullAx.value.set(0,-1,0,0);ocean.addRipple(3,5,11,.04);
assert.deepEqual(ocean.uniforms.uWaterRippleAxes.value[0].toArray(),[1,0],'a wake keeps its emission heading when the canoe turns');
assert.deepEqual(ocean.uniforms.uWaterRippleAxes.value[1].toArray(),[0,-1]);
for(let i=0;i<100;i++)ocean.addRipple(i,i+1,i*.2,.03);
assert.equal(ocean.uniforms.uRipples.value.length,32,'disturbance memory remains bounded on long voyages');
assert.ok(ocean.uniforms.uWaterRippleAxes.value.every(v=>Math.abs(v.length()-1)<1e-8),'all remembered wake axes stay normalized');
ocean.setSea(12,Math.PI/2,1.8,.3,.08,.2);
assert.ok(ocean.uniforms.uWaterWindDir.value.distanceTo(new THREE.Vector2(1,0))<1e-8,'surface streaks follow the actual wind direction');
for(const point of [[0,0],[1,2],[10,-30]])for(const time of [0,20,100]){
 const sample=ocean.sample(...point,time);assert.ok(['h','sx','sz','dx','dz'].every(k=>Number.isFinite(sample[k])),'visual wake detail cannot invalidate the physical wave sampler');
}
const spray=createSpray(scene);let impacts=0,surfaceCalls=0;
spray.setSurfaceSampler((x,z,t,out)=>{surfaceCalls++;out.h=2;},()=>impacts++);
const priorRandom=Math.random;Math.random=()=>0;
spray.emit(0,2.1,0,0,-2,0,1);
spray.update(.1,[.3,.4,.5],1,4);
Math.random=priorRandom;
const points=scene.children.find(o=>o.isPoints),positions=points.geometry.getAttribute('position');
assert.equal(positions.getY(0),-1000,'a falling spray drop lands on the sampled wave, not a fixed global sea level');
assert.ok(surfaceCalls>0);assert.equal(impacts,1,'an eligible drop seeds one bounded surface-impact ring');
console.log('PASS stored wake headings, bounded disturbance memory, wind alignment and moving-sea spray collision');
