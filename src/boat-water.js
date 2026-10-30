import * as THREE from 'three';
// Relative water height at the moving bow drives slams, not camera heave.
export function createBoatWater({canoe,ocean,spray,lensRain,audio}){
 const bow=new THREE.Vector3(),stern=new THREE.Vector3(),sample={},direction={x:0,z:-1};let previousDepth=null,cooldown=0,travel=0,wet=0,dripBudget=0;
 return {update(dt,time,speed,rain,{view=true}={}){
  if(!(dt>0)||dt>.5)return;canoe.group.updateMatrixWorld(true);bow.set(0,.18,-2.12).applyMatrix4(canoe.group.matrixWorld);stern.set(0,.05,1.9).applyMatrix4(canoe.group.matrixWorld);direction.x=bow.x-stern.x;direction.z=bow.z-stern.z;const length=Math.hypot(direction.x,direction.z)||1;direction.x/=length;direction.z/=length;
  ocean.sample(bow.x,bow.z,time,sample);const depth=sample.h-bow.y,closing=previousDepth===null?0:(depth-previousDepth)/dt;previousDepth=depth;cooldown-=dt;
  const impact=Math.max(0,closing)*Math.min(1,Math.max(0,depth+.12)/.24);
  if(impact>.45&&cooldown<=0){const strength=Math.min(2.5,impact*.45+speed*.1);cooldown=.4;wet=Math.min(1,wet+strength*.4);audio.lap(strength);audio.creak?.(strength*.35);for(const side of [-1,1])spray.emit(bow.x+direction.z*.3*side,sample.h+.025,bow.z-direction.x*.3*side,direction.x*speed*.35+direction.z*side*.8,.6+strength,direction.z*speed*.35-direction.x*side*.8,Math.round(6+strength*9),.55);if(view&&strength>.55)lensRain.splash(strength*.6);}
  travel+=Math.max(0,speed)*dt;if(speed>.12&&travel>.32){travel%=.32;const strength=Math.min(.085,.018+speed*.018);for(const side of [-1,1])ocean.addRipple(bow.x+direction.z*.38*side,bow.z-direction.x*.38*side,time,strength,{x:direction.x*speed,z:direction.z*speed});ocean.addRipple(stern.x,stern.z,time,strength*.65,{x:direction.x*speed,z:direction.z*speed});}
  wet+=(Math.min(1,rain)-wet)*(1-Math.exp(-dt/(rain>wet?3:24)));dripBudget+=wet*dt*3;if(dripBudget>1){dripBudget%=1;const p=new THREE.Vector3((Math.random()<.5?-1:1)*.52,.28,(Math.random()-.5)*3).applyMatrix4(canoe.group.matrixWorld);spray.emit(p.x,p.y,p.z,0,-.06,0,1,.025);}
 },get wetness(){return wet;}};
}
