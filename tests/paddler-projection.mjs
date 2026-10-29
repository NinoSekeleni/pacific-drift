import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCanoe} from '../src/canoe.js';
import {createPaddlerHands} from '../src/paddler-hands.js';
// First-person framing must use the real paddle, boat and stabilized eye transforms.
const ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const scene=new THREE.Scene(),canoe=createCanoe(scene),hands=createPaddlerHands(canoe.group);
const ocean={uniforms:{uHull:{value:new THREE.Vector4()},uHullAx:{value:new THREE.Vector4()},uHullInverse:{value:new THREE.Matrix4()}},sample(x,z,t,out){out.h=0;return out;}};
const camera=new THREE.PerspectiveCamera(68,1280/720,.08,16000),eye=new THREE.Vector3(),eyeQ=new THREE.Quaternion(),localEye=new THREE.Vector3(),point=new THREE.Vector3();
let time=0,samples=0;
const base={x:0,z:0,headingDeg:0,ocean,dt:1/60,rawDt:1/60,apparentFromRel:90,windSpeed:0,sailUp:false,paddling:false};
function frame(){
 time+=base.dt;canoe.update({...base,t:time,waveT:time});canoe.eye(eye,eyeQ);
 camera.position.copy(eye);camera.quaternion.copy(eyeQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-.1,0,0,'YXZ')));camera.updateMatrixWorld();
 localEye.copy(eye);canoe.group.worldToLocal(localEye);hands.update(base.dt,canoe.getPaddlePose(),{visible:true,eye:localEye});scene.updateMatrixWorld(true);
 const pose=canoe.getPaddlePose();if(!pose.active||pose.phase<.18||pose.phase>.58)return;
 samples++;
 for(const role of ['topGrip','shaftGrip']){
   const projected=pose.world[role].clone().project(camera);
   assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.98,`${role} must remain in the seat view during power (side ${pose.side}, phase ${pose.phase.toFixed(2)}, NDC ${projected.x.toFixed(2)},${projected.y.toFixed(2)})`);
 }
 hands.group.traverse(mesh=>{
   if(!mesh.isMesh)return;for(let p=mesh;p;p=p.parent)if(!p.visible)return;
   const positions=mesh.geometry.attributes.position,box=new THREE.Box3();let nearest=Infinity;
   for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);box.expandByPoint(point);nearest=Math.min(nearest,point.distanceTo(eye));}
   assert.ok(nearest>.13,'no visible glove or sleeve surface may enter the eye near field');
   const size=box.getSize(new THREE.Vector3());
   assert.ok(Math.max(size.x,size.y,size.z)<.42,'arm meshes must retain their physical scale');
   if(/sailing glove/.test(mesh.parent.name))assert.ok(size.length()<.22,'individual glove geometry must stay hand-sized');
 });
}
for(const side of [-1,1]){for(let i=0;i<90;i++)frame();assert.ok(canoe.requestStroke(side));for(let i=0;i<180;i++)frame();}
assert.ok(samples>=40,'the projection test must cover both complete power phases');
hands.dispose();console.log('PASS actual-camera paddle grip framing and bounded first-person mesh projection');
