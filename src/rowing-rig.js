import * as THREE from 'three';
const clamp=THREE.MathUtils.clamp,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const ROWING_SEAT=new THREE.Vector3(0,1.10,1.81);
/** The owner's FBX oars, driven about fixed rowlocks. World-space blade contact. */
export function createRowingRig(parent,root){
 const oars=[],down=new THREE.Vector3(0,-1,0),sample={},tipSample={},v=new THREE.Vector3();
 const pose={rowing:true,topGrip:new THREE.Vector3(),shaftGrip:new THREE.Vector3(),quaternion:new THREE.Quaternion(),side:1,blend:0,phase:0,active:false,stage:'parked',submerged:0,drive:0,strokeId:0,timeScale:1,grips:{},world:{bladeCenter:new THREE.Vector3(),bladeTip:new THREE.Vector3()}};
 for(const [name,side]of [['Port_oar',-1],['Starboard_oar',1]]){
  const mesh=root.getObjectByName(name);mesh.geometry=mesh.geometry.clone();mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
  const p=mesh.geometry.attributes.position;let count=0,handle=new THREE.Vector3(),blade=new THREE.Vector3(),bc=0;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);if(v.z<b.min.z+.14){handle.add(v);count++;}if(v.z>b.max.z-.35){blade.add(v);bc++;}}
  handle.multiplyScalar(1/count);blade.multiplyScalar(1/bc);const length=handle.distanceTo(blade),axis=blade.clone().sub(handle).normalize();
  const canonical=new THREE.Quaternion().setFromUnitVectors(axis,down),matrix=new THREE.Matrix4().makeRotationFromQuaternion(canonical).multiply(new THREE.Matrix4().makeTranslation(-handle.x,-handle.y,-handle.z));
  mesh.geometry.applyMatrix4(matrix);mesh.geometry.translate(0,.64,0);mesh.geometry.computeBoundingBox();
  root.remove(mesh);const pivot=new THREE.Group();pivot.name=side<0?'Port rowing pivot':'Starboard rowing pivot';pivot.position.set(side*.73,.52,1.48);parent.add(pivot);pivot.add(mesh);
  const parkQuat=canonical.clone().invert(),parkPos=handle.clone().add(new THREE.Vector3(0,-.64,0).applyQuaternion(parkQuat));
  const grip={position:new THREE.Vector3(),quaternion:new THREE.Quaternion()};pose.grips[side<0?'left':'right']=grip;
  oars.push({side,pivot,mesh,parkQuat,parkPos,grip,bladeLocal:new THREE.Vector3(0,.64-length,0),tipLocal:new THREE.Vector3(0,mesh.geometry.boundingBox.min.y,0),previous:new THREE.Vector3(),valid:false,caught:false,exited:false,wet:0});
 }
 const fabric=['Sail','Lacing'].map(name=>{const mesh=root.getObjectByName(name),p=mesh.geometry.attributes.position,original=new Float32Array(p.count*3);for(let i=0;i<p.count;i++){original[i*3]=p.getX(i);original[i*3+1]=p.getY(i);original[i*3+2]=p.getZ(i);}return {mesh,original};});let hoist=1,lastNormals=-1;
 let phase=0,active=false,queued=false,blend=0,serial=0,latch=false;
 function requestStroke(){if(active||queued||blend>.02)return false;queued=true;return true;}
 function update(o){
  hoist+=(Number(!!o.sailUp)-hoist)*(1-Math.exp(-o.dt/1.1));
  for(const {mesh,original} of fabric){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=original[i*3],y=original[i*3+1],z=original[i*3+2],along=clamp((z+1.35)/3.77,0,1),foot=.70+.15*along,baseX=-.17+1.30*along;const height=clamp((y-foot)/3.35,0,1);const tension=Math.sin(Math.PI*height)*Math.sin(Math.PI*along);p.setXYZ(i,THREE.MathUtils.lerp(baseX,x,hoist)+Math.sin(o.t*2.1+height*9+along*4)*.018*tension*hoist*Math.min(1,o.windSpeed/7),foot+(y-foot)*hoist+Math.sin(height*70)*.015*(1-hoist),z);}p.needsUpdate=true;if(o.t-lastNormals>1/24)mesh.geometry.computeVertexNormals();}
  if(o.t-lastNormals>1/24)lastNormals=o.t;
  const timeScale=clamp(o.paddleTimeScale??1,.25,1),dt=o.dt*timeScale;
  if(o.singleStroke&&!latch)requestStroke();latch=!!o.singleStroke;
  const continuous=!!o.paddling&&!o.singleStroke;
  blend=clamp(blend+((continuous||queued||active)?1:-1)*dt*3,0,1);
  if(!active&&(continuous||queued)&&blend>.99){active=true;queued=false;phase=0;serial++;for(const arm of oars){arm.caught=false;arm.exited=false;}}
  if(active){phase+=dt/1.65;if(phase>=1){if(continuous){phase=0;serial++;for(const arm of oars){arm.caught=false;arm.exited=false;}}else{active=false;phase=0;}}}
  const ph=phase,stage=active?(ph<.18?'entry':ph<.60?'power':ph<.75?'exit':'recovery'):(queued||continuous?'preparing':blend>.001?'parking':'parked');
  const pull=smooth((ph-.18)/.42),exit=smooth((ph-.6)/.15),recover=smooth((ph-.75)/.25);
  // Forward-facing push rowing: handles extend while blades sweep aft.
  const sweep=ph<.18?-.36:ph<.60?THREE.MathUtils.lerp(-.36,.34,pull):ph<.75?.34:THREE.MathUtils.lerp(.34,-.36,recover);
  const lift=ph<.18?THREE.MathUtils.lerp(.22,-.32,smooth(ph/.18)):ph<.60?-.32:ph<.75?THREE.MathUtils.lerp(-.32,.22,exit):.22;
  let drive=0,submerged=0;
  for(const arm of oars){
   const {side,pivot,mesh,grip}=arm;const dir=new THREE.Vector3(side*Math.sqrt(Math.max(.1,1-lift*lift-sweep*sweep)),lift,sweep).normalize();
   const workQ=new THREE.Quaternion().setFromUnitVectors(down,dir);pivot.quaternion.copy(arm.parkQuat).slerp(workQ,smooth(blend));pivot.position.copy(arm.parkPos).lerp(new THREE.Vector3(side*.73,.52,1.48),smooth(blend));pivot.updateMatrixWorld(true);
   const feather=ph<.60?0:ph<.75?smooth((ph-.60)/.15):1-smooth((ph-.90)/.10);mesh.rotation.y=side*feather*Math.PI*.5;
   grip.position.set(0,.60,0).applyMatrix4(pivot.matrix);grip.quaternion.copy(pivot.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),mesh.rotation.y));
   const world=arm.bladeLocal.clone().applyMatrix4(pivot.matrixWorld),tip=arm.tipLocal.clone().applyMatrix4(pivot.matrixWorld);
   o.ocean.sample(world.x,world.z,o.waveT,sample);o.ocean.sample(tip.x,tip.z,o.waveT,tipSample);
   const wet=active?clamp(Math.max(sample.h-world.y,tipSample.h-tip.y)/.32,0,1):0;
   const vx=arm.valid?clamp((world.x-arm.previous.x)/Math.max(.001,o.dt),-12,12):0,vz=arm.valid?clamp((world.z-arm.previous.z)/Math.max(.001,o.dt),-12,12):0;
   const emit=kind=>o.onPaddleWater?.({phase:kind,x:world.x,y:sample.h,z:world.z,vx,vz,strength:clamp(Math.hypot(vx,vz)*.18+.35,.15,1),side,paired:true,submerged:kind==='exit'?0:wet,strokeId:serial*2+(side>0?1:0),progress:ph,dt:o.dt,timeScale});
   if(active&&blend>.98){if(!arm.caught&&ph<.6&&wet>.02){arm.caught=true;emit('catch');}if(arm.caught&&!arm.exited&&stage==='power'&&wet>.02)emit('pull');if(arm.caught&&!arm.exited&&arm.wet>.02&&wet<=.02){arm.exited=true;emit('exit');}}
   if(stage==='power'&&arm.caught&&!arm.exited)drive+=wet*.5*smooth((ph-.18)/.06)*(1-smooth((ph-.54)/.06))*timeScale;
   submerged+=wet*.5;arm.wet=wet;arm.previous.copy(world);arm.valid=true;
   if(side>0){pose.world.bladeCenter.copy(world);pose.world.bladeTip.copy(tip);}
  }
  pose.topGrip.copy(pose.grips.left.position);pose.shaftGrip.copy(pose.grips.right.position);pose.quaternion.copy(pose.grips.right.quaternion);
  Object.assign(pose,{blend,phase,active,stage,drive,submerged,strokeId:serial,timeScale});
 }
 return{requestStroke,update,pose};
}
