import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPaddlerHands,solvePaddlerArm,visiblePaddlerForearm} from '../src/paddler-hands.js';
import {createCanoe} from '../src/canoe.js';
for(const wrist of [new THREE.Vector3(.2,.7,1.4),new THREE.Vector3(-.2,.95,1.65),new THREE.Vector3(.18,.05,1.89)]){
  const shoulder=new THREE.Vector3(.18,.68,1.89),solved=solvePaddlerArm(shoulder,wrist,new THREE.Vector3(.45,.35,2));
  assert.ok(solved.reachable);
  assert.ok(Math.abs(solved.shoulder.distanceTo(solved.elbow)-.35)<1e-9);
  assert.ok(Math.abs(solved.elbow.distanceTo(solved.wrist)-.34)<1e-9);
  assert.ok(solved.wrist.distanceTo(wrist)<1e-9);
}
const impossible=solvePaddlerArm(new THREE.Vector3(),new THREE.Vector3(0,10,0),new THREE.Vector3(1,0,0));
assert.equal(impossible.reachable,false);
assert.ok(impossible.wrist.length()<.691,'invalid poses cannot stretch the arm');
const ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const scene=new THREE.Scene(),canoe=createCanoe(scene),hands=createPaddlerHands(canoe.group);
const ocean={uniforms:{uHull:{value:new THREE.Vector4()},uHullAx:{value:new THREE.Vector4()},uHullInverse:{value:new THREE.Matrix4()}},sample(x,z,t,out){out.h=0;return out;}};
let time=0,maxError=0,failed=0,samples=0,stats={};
const base={x:0,z:0,headingDeg:0,ocean,dt:1/60,rawDt:1/60,apparentFromRel:90,windSpeed:3,sailUp:false,paddling:false};
function frame(){time+=base.dt;canoe.update({...base,t:time,waveT:time});const pose=canoe.getPaddlePose();hands.update(base.dt,pose,{visible:true});
 for(const limb of [hands.state.left,hands.state.right]){
  assert.ok([...limb.wrist.toArray(),...limb.shoulder.toArray(),...limb.elbow.toArray()].every(Number.isFinite));
  assert.equal(limb.gripError,0,'hands must remain centred on the actual handle grips');
  if(pose.blend>.2){samples++;maxError=Math.max(maxError,limb.reachError);if(!limb.reachable){failed++;stats[pose.stage]=(stats[pose.stage]||0)+1;}}
 }
}
for(const side of [-1,1]){
 for(let i=0;i<90;i++)frame();
 assert.ok(canoe.requestStroke(side));
 for(let i=0;i<180;i++)frame();
}

assert.equal(failed,0,'normal single-stroke hands must remain within anatomical reach');
hands.update(1/60,canoe.getPaddlePose(),{visible:false});assert.equal(hands.group.visible,false,'external cameras must not show a floating first-person body');
let triangles=0;hands.group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});assert.ok(triangles<18000,'hands must stay within a modest geometry budget');
hands.dispose();assert.equal(canoe.group.getObjectByName('First-person paddler'),undefined);
console.log('PASS bounded arm IK, left/right paddle grip contact, visibility and geometry budget');

const eye=new THREE.Vector3(0,.86,1.85),clipped=new THREE.Vector3();
assert.ok(visiblePaddlerForearm(new THREE.Vector3(-.05,.82,1.84),new THREE.Vector3(.18,.93,1.5),eye,clipped));
assert.ok(clipped.distanceTo(eye)>=.199,'rendered forearm must stay clear of the near-eye sphere');
assert.ok(clipped.z<=eye.z-.099,'forearm may not extend into the head plane');
assert.ok(clipped.distanceTo(new THREE.Vector3(.18,.93,1.5))<=new THREE.Vector3(-.05,.82,1.84).distanceTo(new THREE.Vector3(.18,.93,1.5)),'clipping cannot lengthen a sleeve');
const safeElbow=new THREE.Vector3(-.2,.45,1.55),safeWrist=new THREE.Vector3(.1,.65,1.25);
assert.ok(visiblePaddlerForearm(safeElbow,safeWrist,eye,clipped));assert.ok(clipped.distanceTo(safeElbow)<1e-9,'a safe full forearm must not become a floating cropped stub');
assert.equal(visiblePaddlerForearm(new THREE.Vector3(0,.8,1.9),new THREE.Vector3(0,.85,1.83),eye),false,'a sleeve crossing the camera must be hidden');
console.log('PASS first-person sleeve clipping and intact safe forearms');
