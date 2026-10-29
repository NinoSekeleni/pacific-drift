// Rain lands on the imported benches/planking; impacts share one draw call.
import * as THREE from 'three';
import {LAYER_NEAR} from './sky.js';
export function createHullRain(canoe){
 const N=64,geometry=new THREE.PlaneGeometry(.08,.08),ages=new Float32Array(N).fill(2);geometry.setAttribute('aAge',new THREE.InstancedBufferAttribute(ages,1).setUsage(THREE.DynamicDrawUsage));
 const uniforms={uTint:{value:new THREE.Color(.5,.6,.65)}};
 const material=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:true,
  vertexShader:`attribute float aAge;varying vec2 vUv;varying float vAge;void main(){vUv=uv;vAge=aAge;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
  fragmentShader:`precision highp float;varying vec2 vUv;varying float vAge;uniform vec3 uTint;void main(){if(vAge>1.)discard;vec2 p=(vUv-.5)*2.;float r=length(p),front=.14+vAge*.7,aa=max(.035,fwidth(r));float ring=exp(-pow((r-front)/aa,2.));float crown=pow(max(0.,cos(atan(p.y,p.x)*7.+vAge*3.)),10.)*exp(-pow((r-front*.65)/.16,2.))*(1.-smoothstep(.12,.5,vAge));float a=(ring*.32+crown*.6)*pow(1.-vAge,1.3);if(a<.008)discard;gl_FragColor=vec4(uTint,a);}`});
 const mesh=new THREE.InstancedMesh(geometry,material,N);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.visible=false;mesh.name='Rain impacts on boat';mesh.layers.set(LAYER_NEAR);mesh.renderOrder=.5;mesh.frustumCulled=false;canoe.group.add(mesh);
 const ray=new THREE.Raycaster();ray.layers.enableAll();const origin=new THREE.Vector3(),down=new THREE.Vector3(),local=new THREE.Vector3(),normal=new THREE.Vector3(),up=new THREE.Vector3(0,0,1),dummy=new THREE.Object3D(),inverse=new THREE.Matrix4();
 const drops=Array.from({length:N},()=>({age:2,ttl:.3,position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:1,kind:'rain'}));let budget=0,next=0;
 function impact(bow=false){
  if(!canoe.surfaceMeshes.length)return;const z=bow?-1.9+Math.random()*1.1:(Math.random()-.5)*4.6,width=(canoe.seat.y>1?.78:.40)*Math.pow(Math.max(0,1-Math.pow(Math.abs(z)/2.6,2.3)),.72);
  local.set((Math.random()-.5)*width*1.9,2,z);origin.copy(local).applyMatrix4(canoe.group.matrixWorld);down.set(0,-1,0).transformDirection(canoe.group.matrixWorld);ray.set(origin,down);
  const hit=ray.intersectObjects(canoe.surfaceMeshes,false)[0];if(!hit)return;inverse.copy(canoe.group.matrixWorld).invert();local.copy(hit.point).applyMatrix4(inverse);
  normal.copy(hit.face?.normal||new THREE.Vector3(0,1,0)).transformDirection(hit.object.matrixWorld).transformDirection(inverse);
  if(normal.y<0)normal.negate();const d=drops[next++%N];d.age=0;d.ttl=.22+Math.random()*.16;d.kind=bow?'spray':'rain';d.position.copy(local).addScaledVector(normal,.004);d.quaternion.setFromUnitVectors(up,normal);d.scale=.55+Math.random()*.85;
 }
 function update(dt,rain,tint,{enabled=true,strength=1}={}){
  dt=THREE.MathUtils.clamp(dt||0,0,.1);if(enabled)budget=Math.min(8,budget+Math.max(0,rain)*Math.max(0,Math.min(2,strength))*dt*48);else budget=0;
  while(budget>=1){impact();budget--;}
  uniforms.uTint.value.setRGB(...tint.map(v=>Math.min(.9,v*.65+.16)));let visible=0;
  for(let i=0;i<N;i++){const d=drops[i];d.age+=dt/d.ttl;if(!enabled&&d.kind==='rain')d.age=2;ages[i]=d.age;
   if(d.age>=1)dummy.scale.setScalar(0);else{dummy.position.copy(d.position);dummy.quaternion.copy(d.quaternion);dummy.scale.setScalar(d.scale*(.7+d.age*.35));visible++;}dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }geometry.attributes.aAge.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;mesh.visible=visible>0;
 }
 return {update,splash(strength=1){for(let i=0;i<Math.min(16,Math.ceil(strength*8));i++)impact(true);},get activeCount(){return drops.filter(d=>d.age<1).length;},mesh};
}
