import * as THREE from 'three';
export const CAMERA_VIEWS={
 seated:{label:'Aboard',distance:1,fov:68},
 bow:{label:'At the bow',distance:1,fov:72},
 follow:{label:'Follow boat',distance:9,fov:58},
 wide:{label:'Ocean view',distance:22,fov:55},
 aerial:{label:'From above',distance:34,fov:52}
};
export function createVoyageCamera({onChange=()=>{},storage=globalThis.localStorage,reducedMotion=()=>false}={}){
 let mode='seated',zoom=1,initialized=false,lastView=null,transitionLeft=0;const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),desired=new THREE.Vector3(),target=new THREE.Vector3(),scratch=new THREE.PerspectiveCamera();
 try{const saved=JSON.parse(storage?.getItem('pacific-drift-camera')||'null');if(saved&&CAMERA_VIEWS[saved.mode]){mode=saved.mode;zoom=THREE.MathUtils.clamp(Number(saved.zoom)||1,.55,2.2);}}catch{}
 function save(){try{storage?.setItem('pacific-drift-camera',JSON.stringify({mode,zoom}));}catch{}onChange(mode,zoom);}
 function select(value){if(!CAMERA_VIEWS[value])return;mode=value;zoom=1;save();}
 function setZoom(value){if(!Number.isFinite(value))return;zoom=THREE.MathUtils.clamp(value,.55,2.2);save();}
 function apply(camera,dt,{boat,heading,eyePosition,eyeQuaternion,yaw=0,pitch=0,ocean,time=0,forceAboard=false}={}){
  const view=forceAboard?'seated':mode,external=!['seated','bow'].includes(view);let fov;
  if(!external){
   desired.copy(eyePosition);if(view==='bow'){desired.set(0,1.22,-1.5).applyMatrix4(boat.matrixWorld);desired.y=Math.max(desired.y,boat.position.y+1);}
   scratch.quaternion.copy(eyeQuaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ')));fov=THREE.MathUtils.clamp(CAMERA_VIEWS[view].fov/zoom,40,86);
  }else{
   const range=CAMERA_VIEWS[view].distance*zoom,theta=-heading+yaw,baseElevation=view==='aerial'?1.08:view==='wide'?.28:.25,elevation=THREE.MathUtils.clamp(baseElevation+pitch,.12,1.42);
   desired.set(Math.sin(theta)*Math.cos(elevation)*range,Math.sin(elevation)*range,Math.cos(theta)*Math.cos(elevation)*range).add(boat.position);
   if(ocean){const water={};ocean.sample(desired.x,desired.z,time,water);desired.y=Math.max(desired.y,(water.h||0)+1.25);}
   target.copy(boat.position);target.y+=.55;scratch.position.copy(desired);scratch.up.set(0,1,0);scratch.lookAt(target);fov=CAMERA_VIEWS[view].fov;
  }
  if(view!==lastView){transitionLeft=.9;lastView=view;}transitionLeft=Math.max(0,transitionLeft-dt);
  const instant=!initialized||reducedMotion(),a=instant?1:1-Math.exp(-Math.min(.1,Math.max(0,dt))*3.8);
  // The seated eye already has hull-motion filtering. A second world-space
  // position lag lets a rising deck pass through the lens in steep seas.
  if(!external&&transitionLeft===0)position.copy(desired);else position.lerp(desired,a);
  if(external&&ocean){const water={};ocean.sample(position.x,position.z,time,water);position.y=Math.max(position.y,(water.h||0)+1.25);}
  if(!external&&transitionLeft===0)rotation.copy(scratch.quaternion);else rotation.slerp(scratch.quaternion,a);camera.position.copy(position);camera.quaternion.copy(rotation);const nextFov=THREE.MathUtils.lerp(camera.fov,fov,a);if(Math.abs(nextFov-camera.fov)>.005){camera.fov=nextFov;camera.updateProjectionMatrix();}initialized=true;
 }
 return{apply,select,setZoom,cycle(){select(Object.keys(CAMERA_VIEWS)[(Object.keys(CAMERA_VIEWS).indexOf(mode)+1)%5]);},get mode(){return mode;},get zoom(){return zoom;},get external(){return !['seated','bow'].includes(mode);},reset(){initialized=false;}};
}
