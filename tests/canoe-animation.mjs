import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCanoe,SEAT} from '../src/canoe.js';
const ctx=new Proxy({}, {get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}});
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const scene=new THREE.Scene(),canoe=createCanoe(scene);
let seaStrength=0,time=0,catches=0;
const ocean={uniforms:{uHull:{value:new THREE.Vector4()},uHullAx:{value:new THREE.Vector4()},uHullInverse:{value:new THREE.Matrix4()}},sample(x,z,t,out){out.h=seaStrength*(.32*Math.sin(x*2.6-t*2.2)+.24*Math.cos(z*1.6-t*1.7));return out;}};
const base={x:0,z:0,headingDeg:0,ocean,dt:1/60,rawDt:1/60,apparentFromRel:90,windSpeed:14,sailUp:false,paddling:false,onCatch(){catches++;}};
function frame(options={}){time+=base.dt;canoe.update({...base,t:time,waveT:time,...options});canoe.group.updateMatrixWorld(true);}
const rig=canoe.group.getObjectByName('Sail rig'),cloth=canoe.group.getObjectByName('Anchored sail cloth'),mast=canoe.group.getObjectByName('Fixed mast'),paddle=canoe.group.getObjectByName('Carved canoe paddle');
assert.ok(rig&&cloth&&mast&&paddle);
frame();const mastBox=new THREE.Box3().setFromObject(mast),mastLength=mastBox.getSize(new THREE.Vector3()).y;
for(let i=0;i<240;i++)frame({sailUp:true});
assert.equal(canoe.animationState.sailHoist,1);
assert.deepEqual(rig.scale.toArray(),[1,1,1],'hoisting must never shrink the mast');
assert.ok(Math.abs(new THREE.Box3().setFromObject(mast).getSize(new THREE.Vector3()).y-mastLength)<1e-6);
const pos=cloth.geometry.attributes.position,uv=cloth.geometry.attributes.uv;
assert.equal(pos.count,uv.count,'fabric must have complete UV coverage for the weave');
for(let i=0;i<pos.count;i++){
 assert.ok(Number.isFinite(pos.getX(i))&&Number.isFinite(pos.getY(i))&&Number.isFinite(pos.getZ(i)));
 if(Math.abs(uv.getX(i))<1e-6)assert.ok(Math.abs(pos.getX(i))<1e-6&&Math.abs(pos.getZ(i))<1e-6,'luff must remain tied to the mast');
 if(Math.abs(uv.getY(i))<1e-6)assert.ok(Math.abs(pos.getX(i))<1e-6&&Math.abs(pos.getY(i)-.55)<1e-6,'sail foot must remain on the boom');
}
for(const value of cloth.geometry.attributes.normal.array)assert.ok(Number.isFinite(value),'fabric normals must remain finite');
const fullHeight=new THREE.Box3().setFromBufferAttribute(pos).getSize(new THREE.Vector3()).y;
for(let i=0;i<240;i++)frame({sailUp:false});
assert.equal(canoe.animationState.sailHoist,0);
assert.ok(new THREE.Box3().setFromBufferAttribute(pos).getSize(new THREE.Vector3()).y<fullHeight*.05,'cloth must gather at the boom when lowered');
assert.equal(mast.visible,true);

// A release during the power phase must complete the committed recovery once,
// rather than freezing the blade underwater or starting another stroke.
while(!canoe.animationState.strokeActive||canoe.animationState.strokePhase<.35)frame({paddling:true});
const countAtRelease=canoe.animationState.strokeCount,catchesAtRelease=catches;
let previousWorld=paddle.getWorldPosition(new THREE.Vector3()),maxStep=0;
for(let i=0;i<180;i++){
 frame({paddling:false});
 const point=paddle.getWorldPosition(new THREE.Vector3());maxStep=Math.max(maxStep,point.distanceTo(previousWorld));previousWorld=point;
}
assert.equal(canoe.animationState.strokeCount,countAtRelease+1);
assert.equal(catches,catchesAtRelease,'releasing after entry must not produce another catch');
assert.equal(canoe.animationState.strokeActive,false);
assert.equal(canoe.animationState.paddleBlend,0);
assert.equal(paddle.parent.visible,true,'parked paddle should stay visible');
assert.ok(maxStep<.14,'recovery to the parked pose must not pop');

// Continuous input keeps the same committed side rather than inventing a
// handoff. Every completed stroke makes exactly one catch.
const beforeRun=catches,beforeStrokes=canoe.animationState.strokeCount;
for(let i=0;i<800;i++)frame({paddling:true});
for(let i=0;i<180;i++)frame({paddling:false});
assert.equal(catches-beforeRun,canoe.animationState.strokeCount-beforeStrokes);
assert.ok(catches-beforeRun>=9);
assert.equal(canoe.animationState.side,1,'continuous strokes must not swap hands without a handoff');

seaStrength=3;
const eyePos=new THREE.Vector3(),eyeQ=new THREE.Quaternion(),eyeAngles=new THREE.Euler(),seatWorld=new THREE.Vector3();
for(let i=0;i<600;i++){
 frame({windSpeed:26});canoe.eye(eyePos,eyeQ);eyeAngles.setFromQuaternion(eyeQ,'YXZ');
 seatWorld.copy(SEAT).applyMatrix4(canoe.group.matrixWorld);
 assert.ok(Math.abs(eyePos.y-seatWorld.y)<=.220001,'camera must remain near its seated body');
 assert.ok(Math.abs(eyeAngles.x)<.146&&Math.abs(eyeAngles.z)<.106,'heavy-sea view rotation must remain bounded');
 assert.ok([...eyePos.toArray(),...eyeQ.toArray()].every(Number.isFinite));
 const p=new THREE.Vector3(.2,.1,-1.4),restored=p.clone().applyMatrix4(canoe.group.matrixWorld).applyMatrix4(ocean.uniforms.uHullInverse.value);
 assert.ok(restored.distanceTo(p)<1e-10,'stabilizing the observer must not change the hull mask');
}
console.log('PASS anchored hoisting/furling cloth, UV/normals, completed paddle recovery, single catches, committed-side continuity and stabilized seated eye');

// A requested preview is exactly one action; its water events must use contact,
// not phase timers or a guessed splash position beside the canoe.
function makeContactRun(timeScale=1,requestedSide=1,movingWater=false){
 const c=createCanoe(new THREE.Scene()),events=[];
 const uniforms={uHull:{value:new THREE.Vector4()},uHullAx:{value:new THREE.Vector4()},uHullInverse:{value:new THREE.Matrix4()}};
 const water={uniforms,sample(x,z,t,out){out.h=movingWater?.12*Math.sin(t*1.4)+.035*Math.sin(x*.8-t*.6):0;return out;}};
 const topShoulder=new THREE.Vector3(-requestedSide*.18,.68,1.89),shaftShoulder=new THREE.Vector3(requestedSide*.18,.68,1.89);
 assert.equal(c.requestStroke(requestedSide),true);
 assert.equal(c.requestStroke(requestedSide),false,'preview must not build an input backlog');
 let completedAt=0,maxTopReach=0,maxShaftReach=0,positiveDrive=0,pullFrames=0,minRecoveryClearance=Infinity,driveIntegral=0,activeTime=0;
 const camera=new THREE.PerspectiveCamera(68,1280/720,.08,16000);camera.position.set(0,.86,1.85);camera.rotation.x=-.1;camera.updateMatrixWorld();
 const localMatrix=new THREE.Matrix4(),shaftPoint=new THREE.Vector3(),gripPoint=new THREE.Vector3(),tipSample={};
 const cPaddle=c.group.getObjectByName('Carved canoe paddle');
 for(let f=0;f<Math.ceil(3/timeScale*60);f++){
  const t=f/60;let pullsThisFrame=0,catchThisFrame=false;
  c.update({x:0,z:0,headingDeg:0,ocean:water,t,waveT:t,dt:1/60,rawDt:1/60,windSpeed:0,paddleTimeScale:timeScale,onPaddleWater(event){
   events.push({...event,t});if(event.phase==='pull')pullsThisFrame++;if(event.phase==='catch')catchThisFrame=true;
   const sample={};water.sample(event.x,event.z,t,sample);
   assert.ok(Math.abs(event.y-sample.h)<1e-8,'every water event must be on the sampled moving surface');
   assert.ok([event.vx,event.vz,event.strength,event.submerged].every(Number.isFinite));
   if(event.phase!=='exit'){assert.ok(event.submerged>0);assert.ok(event.bladeY<=event.waterHeight+.04,'a dry blade must never make a water event');}
  }});
  assert.ok(pullsThisFrame<=1,'pull effects must remain bounded to one callback per frame');
  pullFrames+=pullsThisFrame;
  const pose=c.getPaddlePose();driveIntegral+=pose.drive/60;if(pose.active)activeTime+=1/60;
  if(!movingWater&&(pose.stage==='power'||catchThisFrame)){
   for(const key of ['topGrip','shaftGrip']){const projected=pose.world[key].clone().project(camera);assert.ok(Math.abs(projected.x)<.95&&Math.abs(projected.y)<.95,`${key} must stay in the actual 68deg seated camera during catch/power`);}
  }
  assert.ok(pose.drive>=0&&pose.drive<=1);
  if(pose.drive>0){positiveDrive++;assert.equal(pose.stage,'power');assert.ok(pose.submerged>0);}
  if(pose.active)assert.equal(c.requestStroke(-requestedSide),false,'active stroke cannot queue another stroke');
  localMatrix.multiplyMatrices(cPaddle.parent.matrix,cPaddle.matrix);
  gripPoint.set(0,.557,0).applyMatrix4(localMatrix);shaftPoint.set(0,-.14,0).applyMatrix4(localMatrix);
  assert.ok(gripPoint.distanceTo(pose.topGrip)<1e-10&&shaftPoint.distanceTo(pose.shaftGrip)<1e-10,'hands must use the actual scaled paddle matrix');
  assert.ok(pose.axis.distanceTo(pose.topGrip.clone().sub(pose.shaftGrip).normalize())<1e-8);
  if(pose.blend>.99&&!movingWater){
   const topWrist=pose.topGrip.clone().add(new THREE.Vector3(-requestedSide*.075,0,.045).applyQuaternion(pose.quaternion));
   const shaftWrist=pose.shaftGrip.clone().add(new THREE.Vector3(0,-.075,.045).applyQuaternion(pose.quaternion));
   maxTopReach=Math.max(maxTopReach,topWrist.distanceTo(topShoulder));maxShaftReach=Math.max(maxShaftReach,shaftWrist.distanceTo(shaftShoulder));
  }
  if(pose.stage==='recovery'){
   water.sample(pose.world.bladeTip.x,pose.world.bladeTip.z,t,tipSample);
   minRecoveryClearance=Math.min(minRecoveryClearance,pose.world.bladeTip.y-tipSample.h);
  }
  if(!completedAt&&c.animationState.strokeCount===1)completedAt=t;
 }
 assert.equal(c.animationState.strokeCount,1,'one requested preview must produce one complete stroke');
 assert.equal(c.animationState.strokeActive,false);assert.equal(c.animationState.paddleBlend,0);
 assert.equal(events.filter(e=>e.phase==='catch').length,1,'actual blade entry emits one catch');
 assert.equal(events.filter(e=>e.phase==='exit').length,1,'actual blade exit emits one exit');
 assert.ok(pullFrames>5&&positiveDrive>5);
 assert.ok(events.find(e=>e.phase==='catch').t<events.find(e=>e.phase==='exit').t);
 assert.ok(minRecoveryClearance>.05,'the recovering blade must clear the water before returning');
 if(!movingWater){
  // The actual hand rig has fixed .69m arms plus at most .06m clavicle protraction.
  assert.ok(maxTopReach<.75,`top wrist outside seated reach: ${maxTopReach}`);assert.ok(maxShaftReach<.75,`shaft wrist outside seated reach: ${maxShaftReach}`);
 }
 return {completedAt,events,maxTopReach,maxShaftReach,driveIntegral,activeTime,meanDrive:driveIntegral/activeTime};
}
const realTimeStroke=makeContactRun(),slowStroke=makeContactRun(.25);
assert.ok(slowStroke.completedAt>realTimeStroke.completedAt*3.7,'quarter-speed preview must slow the complete action');
makeContactRun(1,-1);
makeContactRun(1,1,true);
console.log('PASS one-stroke queue, actual moving-water catch/pull/exit, dry recovery, drive envelope, actual camera framing, scaled grip transforms, seated wrist reach and slow motion');
console.log('Measured normal stroke:',JSON.stringify({driveIntegral:+realTimeStroke.driveIntegral.toFixed(4),activeTime:+realTimeStroke.activeTime.toFixed(4),meanDrive:+realTimeStroke.meanDrive.toFixed(4)}));

// A held one-stroke flag is edge-triggered, and a blade that cannot physically
// reach the sampled water must neither propel the canoe nor produce fake spray.
for(const dryReach of [false,true]){
 const c=createCanoe(new THREE.Scene());let contacts=0,force=0;
 const ocean={uniforms:{uHull:{value:new THREE.Vector4()},uHullAx:{value:new THREE.Vector4()},uHullInverse:{value:new THREE.Matrix4()}},sample(x,z,t,out){out.h=dryReach&&Math.abs(x)>.44?-2.5:0;return out;}};
 for(let frame=0;frame<210;frame++){
  c.update({x:0,z:0,headingDeg:0,ocean,t:frame/60,waveT:frame/60,dt:1/60,rawDt:1/60,windSpeed:0,singleStroke:true,paddling:true,onPaddleWater(){contacts++;}});
  force+=c.getPaddlePose().drive;
 }
 assert.equal(c.animationState.strokeCount,1,'held single-stroke control must not repeat');
 if(dryReach){assert.equal(contacts,0,'a blade above the sampled surface must not splash');assert.equal(force,0,'a dry paddle must not propel the canoe');}
 else{assert.ok(contacts>5);assert.ok(force>0);}
}
console.log('PASS edge-triggered single action and no water/audio/drive events from an unreachable dry blade');
