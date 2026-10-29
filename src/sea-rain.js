// Small rain crowns/rings follow the sampled sea, outside the actual boat outline.
import * as THREE from 'three';
import {LAYER_NEAR} from './sky.js';
export function rainInsideBoat(world,boat){
 const local=boat.group.worldToLocal(world.clone()),outline=boat.waterOutline,half=outline?.halfLength??2.6;if(Math.abs(local.z)>half)return false;
 let width;if(outline){const at=THREE.MathUtils.clamp((local.z/half+1)*.5*(outline.profile.length-1),0,outline.profile.length-1),i=Math.floor(at);width=THREE.MathUtils.lerp(outline.profile[i].x,outline.profile[Math.min(i+1,outline.profile.length-1)].x,at-i);}
 else width=.45*Math.pow(Math.max(0,1-Math.pow(Math.abs(local.z)/half,2.3)),.72);
 return Math.abs(local.x)<width+.035;
}
export function createSeaRain(scene,ocean,boat){
 const N=72,geometry=new THREE.PlaneGeometry(1,1),ages=new Float32Array(N).fill(2);geometry.setAttribute('aAge',new THREE.InstancedBufferAttribute(ages,1).setUsage(THREE.DynamicDrawUsage));
 const uniforms={uTint:{value:new THREE.Color(.5,.6,.65)}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,
  vertexShader:`attribute float aAge;varying vec2 vUv;varying float vAge;void main(){vUv=uv;vAge=aAge;gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);}`,
  fragmentShader:`precision highp float;uniform vec3 uTint;varying vec2 vUv;varying float vAge;void main(){if(vAge>1.)discard;vec2 p=(vUv-.5)*2.;float r=length(p),front=.18+vAge*.62;float aa=max(.025,fwidth(r));float ring=exp(-pow((r-front)/aa,2.));float crown=pow(max(0.,cos(atan(p.y,p.x)*7.+vAge*3.)),8.)*exp(-pow((r-front*.65)/.13,2.))*(1.-smoothstep(.05,.4,vAge));float alpha=(ring*.22+crown*.35)*pow(1.-vAge,1.5);if(alpha<.008)discard;gl_FragColor=vec4(uTint,alpha);}`});
 const mesh=new THREE.InstancedMesh(geometry,material,N);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.visible=false;mesh.name='Rain impacts on moving sea';mesh.layers.set(LAYER_NEAR);mesh.frustumCulled=false;mesh.renderOrder=.4;scene.add(mesh);
 const impacts=Array.from({length:N},()=>({x:0,z:0,age:2,ttl:.45,scale:.1})),dummy=new THREE.Object3D(),normal=new THREE.Vector3(),point=new THREE.Vector3(),up=new THREE.Vector3(0,0,1),sample={};let next=0,budget=0;
 function spawn(cam,time){for(let tries=0;tries<4;tries++){const angle=Math.random()*Math.PI*2,radius=1.2+Math.pow(Math.random(),1.6)*18,x=cam.x+Math.cos(angle)*radius,z=cam.z+Math.sin(angle)*radius;ocean.sample(x,z,time,sample);point.set(x,sample.h,z);if(rainInsideBoat(point,boat))continue;Object.assign(impacts[next++%N],{x,z,age:0,ttl:.32+Math.random()*.25,scale:.075+Math.random()*.12});return;}}
 function update(dt,cam,rain,tint,time,{enabled=true,strength=1}={}){
  dt=THREE.MathUtils.clamp(dt||0,0,.1);const amount=enabled?Math.max(0,Math.min(1,rain))*Math.max(0,Math.min(2,strength)):0;
  budget=Math.min(8,budget+amount*dt*70);while(budget>=1){spawn(cam,time);budget--;}
  uniforms.uTint.value.setRGB(...tint.map(v=>Math.min(.85,v*.65+.16)));let active=0;
  for(let i=0;i<N;i++){const d=impacts[i];d.age+=dt/d.ttl;if(!enabled)d.age=2;ages[i]=d.age;
   if(d.age>=1||!enabled){ages[i]=2;dummy.scale.setScalar(0);}else{ocean.sample(d.x,d.z,time,sample);point.set(d.x,sample.h,d.z);if(rainInsideBoat(point,boat)){d.age=2;ages[i]=2;dummy.scale.setScalar(0);}else{dummy.position.copy(point);dummy.position.y+=.012;normal.set(-(sample.sx||0),1,-(sample.sz||0)).normalize();dummy.quaternion.setFromUnitVectors(up,normal);dummy.scale.setScalar(d.scale*(.55+d.age*.8));active++;}}
   dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }geometry.attributes.aAge.needsUpdate=true;mesh.instanceMatrix.needsUpdate=true;mesh.visible=enabled&&active>0;
 }
 return {update,get activeCount(){return impacts.filter(d=>d.age<1).length;},mesh};
}
