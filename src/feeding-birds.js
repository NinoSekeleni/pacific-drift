// Signs of fish: a flock of terns and shearwaters working a bait school. Every so often in
// daylight a flock gathers a few hundred metres off, wheeling low over one patch of sea, and
// birds fold and plunge into it with a white splash. Fish are feeding there; a float cast near
// the flock is taken sooner. The birds are a few procedural triangles each (no downloaded
// asset), instanced, with the wingbeat in the vertex shader.
import * as T from 'three';
import {LAYER_NEAR} from './sky.js';

export const FLOCK={count:16,minWait:360,maxWait:840,minLife:240,maxLife:420,near:120};

function birdGeometry(){
 // body along -z (forward), wings along x. aWing: 0 on the body, up to 1 at the wing tips.
 const v=[],w=[],idx=[];const add=(x,y,z,k)=>{v.push(x,y,z);w.push(k);return v.length/3-1;};
 const nose=add(0,0,-.24),tail=add(0,.01,.26),tailL=add(-.07,.01,.34),tailR=add(.07,.01,.34),belly=add(0,-.04,0),back=add(0,.035,-.02);
 const rootF=[add(-.05,.01,-.07),add(.05,.01,-.07)],rootA=[add(-.05,.01,.06),add(.05,.01,.06)];
 const elbF=[add(-.42,.03,-.04),add(.42,.03,-.04)],elbA=[add(-.4,.03,.09),add(.4,.03,.09)],tip=[add(-.82,.0,.12),add(.82,.0,.12)];
 idx.push(nose,back,rootF[0],nose,rootF[1],back,nose,belly,rootF[1],nose,rootF[0],belly,back,tail,rootA[0],back,rootA[1],tail,belly,rootA[0],tail,belly,tail,rootA[1],tail,tailL,tailR,
  back,rootF[0],rootA[0],back,rootA[1],rootF[1]);
 for(const s of [0,1]){idx.push(rootF[s],elbF[s],rootA[s],rootA[s],elbF[s],elbA[s],elbF[s],tip[s],elbA[s]);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));
 // wing weight: tips 1, elbows .45
 const k=w.map((_,i)=>{const x=Math.abs(v[i*3]);return x>.6?1:x>.3?.45:0;});
 g.setAttribute('aWing',new T.Float32BufferAttribute(k,1));g.setIndex(idx);g.computeVertexNormals();return g;
}

export function createFeedingBirds(scene,ocean,{spray=()=>null,count=FLOCK.count,rand=Math.random}={}){
 const geo=birdGeometry(),phase=new Float32Array(count),flapA=new Float32Array(count);
 geo.setAttribute('aPhase',new T.InstancedBufferAttribute(phase,1));geo.setAttribute('aFlap',new T.InstancedBufferAttribute(flapA,1));
 const time={value:0};
 const mat=new T.MeshStandardMaterial({color:0xe8ebec,roughness:.85,side:T.DoubleSide});
 mat.onBeforeCompile=s=>{s.uniforms.uBirdTime=time;
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uBirdTime;attribute float aWing,aPhase,aFlap;varying float vWing;varying float vHead;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nfloat beat=sin(uBirdTime*11.+aPhase);transformed.y+=beat*aWing*aFlap*.38+aFlap*aWing*.06;transformed.x*=1.-aFlap*aWing*.1*(1.-beat);vWing=aWing;vHead=smoothstep(-.12,-.2,position.z);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vWing;varying float vHead;')
   .replace('#include <color_fragment>','#include <color_fragment>\n// pale grey wings with dark tips, white body, a black cap\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.66,.7),smoothstep(.05,.4,vWing));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.13,.15),smoothstep(.7,1.,vWing)*.8+vHead*.85);');};
 mat.customProgramCacheKey=()=> 'pd-feeding-birds-v1';
 const mesh=new T.InstancedMesh(geo,mat,count);mesh.layers.set(LAYER_NEAR);mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
 const birds=Array.from({length:count},(_,i)=>({a:rand()*Math.PI*2,r:6+rand()*20,alt:5+rand()*12,speed:(.35+rand()*.25)*(rand()<.5?-1:1),dive:0,diveT:0,splashed:false,wait:3+rand()*20,pos:new T.Vector3(),prev:new T.Vector3()}));
 birds.forEach((b,i)=>{phase[i]=rand()*6.28;flapA[i]=1;});
 const center=new T.Vector3(),m=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),one=new T.Vector3(1,1,1),dir=new T.Vector3(),sample={};
 let active=false,life=0,age=0,wait=FLOCK.minWait*.5+rand()*(FLOCK.maxWait-FLOCK.minWait)*.5,splashes=0;

 function start(camera,{distance=150+rand()*200,ahead=true}={}){
  camera.getWorldDirection(dir);dir.y=0;if(dir.lengthSq()<.01)dir.set(0,0,-1);dir.normalize();
  const turn=ahead?(rand()-.5)*1.6:rand()*Math.PI*2;dir.applyAxisAngle(new T.Vector3(0,1,0),turn);
  center.copy(camera.position).addScaledVector(dir,distance);center.y=0;
  active=true;age=0;life=FLOCK.minLife+rand()*(FLOCK.maxLife-FLOCK.minLife);mesh.visible=true;
  for(const b of birds){b.dive=0;b.wait=2+rand()*15;b.alt=5+rand()*12;}
  return true;
 }
 function stop(){active=false;mesh.visible=false;}
 function update(dt,camera,{time:t=0,playing=true,daylight=true,windSpeed=5,enabled=true,currentU=0,currentV=0}={}){
  time.value=t;
  if(!enabled){stop();return;}
  if(!active){if(playing&&daylight&&windSpeed<16){wait-=dt;if(wait<=0){wait=FLOCK.minWait+rand()*(FLOCK.maxWait-FLOCK.minWait);start(camera);}}return;}
  age+=dt;center.x+=currentU*dt;center.z-=currentV*dt;
  // the flock thins out at the end: birds leave the patch and fly off downwind
  const leaving=age>life,fade=Math.max(0,(age-life)/25);
  if(fade>=1||camera.position.distanceTo(center)>2500){stop();return;}
  const wx=Math.sin(t*.07)*4,wz=Math.cos(t*.05)*4;
  for(let i=0;i<count;i++){const b=birds[i];b.prev.copy(b.pos);
   b.a+=b.speed*dt*(1+b.dive*.5);let y=b.alt+Math.sin(t*.6+i)*1.2;let r=b.r;
   if(!leaving){b.wait-=dt;if(b.wait<=0&&b.dive===0){b.dive=1;b.diveT=0;b.splashed=false;}}
   if(b.dive>0){b.diveT+=dt;const T1=1.1,T2=.7,T3=2.6;
    if(b.diveT<T1){const k=b.diveT/T1;y=b.alt*(1-k*k);r*=1-.3*k;}             // fold and plunge
    else if(b.diveT<T1+T2){y=-.3;if(!b.splashed){b.splashed=true;splash(b.pos);}} // under
    else if(b.diveT<T1+T2+T3){const k=(b.diveT-T1-T2)/T3;y=b.alt*k*k*(3-2*k);}     // climb out
    else{b.dive=0;b.wait=4+rand()*16;}}
   const x=center.x+wx+Math.cos(b.a)*r+(leaving?(i-count/2)*fade*30:0),z=center.z+wz+Math.sin(b.a)*r;
   ocean.sample?.(x,z,t,sample);const sea=sample.h??0;
   b.pos.set(x,sea+y+fade*20,z);
   const dx=b.pos.x-b.prev.x,dz=b.pos.z-b.prev.z,dy=b.pos.y-b.prev.y,hv=Math.hypot(dx,dz)||1e-3;
   const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,hv),bank=-Math.sign(b.speed)*.45;
   flapA[i]=b.dive>0&&b.diveT<1.8?.15:(dy>.02?1.2:.85);
   e.set(pitch,yaw,bank,'YXZ');q.setFromEuler(e);m.compose(b.pos,q,one);mesh.setMatrixAt(i,m);
   if(b.dive>0&&b.diveT>=1.1&&b.diveT<1.8)mesh.setMatrixAt(i,m.makeScale(0,0,0));
  }
  mesh.instanceMatrix.needsUpdate=true;geo.attributes.aFlap.needsUpdate=true;
 }
 function splash(p){splashes++;ocean.addRipple?.(p.x,p.z,time.value,.035);const s=spray();if(s)s.emit(p.x,(sample.h??0)+.05,p.z,0,2.4,0,10,.5,{size:.9});}
 return {update,start,stop,
  distanceTo(p){return active&&age<life?Math.hypot(p.x-center.x,p.z-center.z):Infinity;},
  get active(){return active;},get center(){return center;},get splashes(){return splashes;},get mesh(){return mesh;}};
}
