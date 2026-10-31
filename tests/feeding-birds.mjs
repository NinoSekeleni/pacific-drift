// A feeding flock gathers in daylight, wheels over one patch, birds plunge into it, and casting
// near it shortens the wait for a bite.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFeedingBirds,FLOCK} from '../src/feeding-birds.js';
import {createBiteTimer} from '../src/bite-timer.js';
let seed=7;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
const ripples=[],emitted=[];
const ocean={sample(x,z,t,o){o.h=.3*Math.sin(x*.1+t);return o;},addRipple(x,z){ripples.push([x,z]);}};
const spray={emit(...a){emitted.push(a);}};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.5,0);camera.lookAt(0,1.5,-10);camera.updateMatrixWorld();
const birds=createFeedingBirds(scene,ocean,{spray:()=>spray,rand});
for(let t=0;t<2000;t+=.5)birds.update(.5,camera,{time:t,daylight:false});
assert.ok(!birds.active,'no flock at night');
let t=0;for(;t<3000&&!birds.active;t+=.5)birds.update(.5,camera,{time:t,daylight:true,windSpeed:6});
assert.ok(birds.active,'a flock gathers in daylight');
const d=birds.distanceTo(camera.position);assert.ok(d>100&&d<400,'a few hundred metres off: '+d.toFixed(0));
for(let k=0;k<1200;k++){t+=1/20;birds.update(1/20,camera,{time:t,daylight:true});}
assert.ok(birds.splashes>=5,'birds plunge: '+birds.splashes);assert.ok(ripples.length===birds.splashes&&emitted.length>0,'each plunge splashes');
const c=birds.center;let maxR=0,minY=9;const m=new THREE.Matrix4(),p=new THREE.Vector3();
for(let i=0;i<FLOCK.count;i++){birds.mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);if(p.lengthSq()>0){maxR=Math.max(maxR,Math.hypot(p.x-c.x,p.z-c.z));}}
assert.ok(maxR<40,'the flock stays over its patch');
for(let k=0;k<20000&&birds.active;k++){t+=.1;birds.update(.1,camera,{time:t,daylight:true});}
assert.ok(!birds.active,'and leaves after a few minutes');
// bite timing near the flock
const near=createBiteTimer(()=>1),far=createBiteTimer(()=>1);near.start(.45);far.start(1);
assert.ok(near.due<far.due*.5,'fish feeding nearby bite sooner');
console.log('feeding birds ok');
