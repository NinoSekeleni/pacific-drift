// Hull spray follows Tidewater's contact model: pushing water aside and slamming into it throw spray,
// a quiet hull in calm water throws none, and drops that reach the eye land on the view.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {segmentResponse,createHullSpray} from '../src/hull-spray.js';
import {createSpray} from '../src/spray.js';
assert.equal(segmentResponse({normalSpeed:.3,immersionRate:0,depth:.05}),0,'a slow hull throws nothing');
assert.ok(segmentResponse({normalSpeed:2.5,depth:.05})>1,'pushing water aside throws spray');
assert.ok(segmentResponse({immersionRate:2,depth:.05})>1,'a slam throws spray');
assert.equal(segmentResponse({normalSpeed:5,depth:-.5}),0,'a bow clear of the water throws nothing');
assert.ok(segmentResponse({normalSpeed:100,immersionRate:100,depth:.1})<=9,'bounded');
// A moving launch-sized hull in a sea: spray grows with speed and is emitted ahead and outward.
const scene=new THREE.Scene(),spray=createSpray(scene,{max:800});
const profile=Array.from({length:65},(_,i)=>new THREE.Vector2(Math.max(.01,Math.sin(i/64*Math.PI)*1.4),1));
const group=new THREE.Group();group.userData.motor=true;
const canoe={group,waterOutline:{halfLength:4.3,profile}};
let waveH=0;const ocean={sample(x,z,t,out){out.h=waveH+.15*Math.sin(x*.3+t*2.);return out;}};
const hs=createHullSpray({canoe,ocean,spray});
function run(speed,seconds){let total=0;for(let t=0;t<seconds;t+=1/60){group.position.z-=speed/60;group.position.y=.05*Math.sin(t*2.4);group.rotation.x=.04*Math.sin(t*2.4);total+=hs.update(1/60,t,{wind:{u:0,v:3}}).response;spray.update(1/60,[.5,.6,.7],0,t);}return total;}
const idle=run(0,4),fast=run(4.5,4);
assert.ok(fast>idle*3&&fast>5,`spray grows with speed (idle ${idle.toFixed(1)}, fast ${fast.toFixed(1)})`);
assert.ok(spray.count>20,'particles are live');
// Drops that reach the eye land on the view, at the projected position.
const camera=new THREE.PerspectiveCamera(68,1,.08,100);camera.position.set(0,2,0);camera.lookAt(0,2,-5);camera.updateMatrixWorld();
const lens=[];const s2=createSpray(new THREE.Scene(),{max:50});const realRandom=Math.random;Math.random=()=>.5;s2.emit(0,1.9,-1,0,1.6,3,10,0);Math.random=realRandom;for(let i=0;i<60;i++)s2.update(1/60,[.5,.5,.5],0,i/60,{camera,onLens:(x,y,r)=>lens.push([x,y,r])});
assert.ok(lens.length>0&&lens.every(([x,y,r])=>x>.2&&x<.8&&y>.2&&y<.8&&r>0),'drops flying at the eye wet the view near its centre');
console.log('PASS hull spray contact response, speed scaling, live particles and drops reaching the view');
