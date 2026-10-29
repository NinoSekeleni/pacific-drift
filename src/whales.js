import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LAYER_NEAR} from './sky.js';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export function createWhales(scene,ocean,{base='./'}={}){
  let whale=null,active=false,age=0,wait=180+Math.random()*240,heading=0,lastBlow=-1;
  const anchor=new THREE.Vector3(),forward=new THREE.Vector3(),sample={},tailTime={value:0};
  const particles=64,positions=new Float32Array(particles*3).fill(-1000),life=new Float32Array(particles),velocity=new Float32Array(particles*3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('aLife',new THREE.BufferAttribute(life,1));
  const mistMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTint:{value:new THREE.Color(.55,.63,.67)}},vertexShader:`attribute float aLife;varying float vLife;void main(){vLife=aLife;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(180./max(1.,-p.z),2.,35.)*(1.+(1.-aLife)*2.);}`,fragmentShader:`uniform vec3 uTint;varying float vLife;void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*3.5)*sin(clamp(vLife,0.,1.)*3.14159)*.3;if(r>1. || a<.005)discard;gl_FragColor=vec4(uTint,a);}`});
  const mist=new THREE.Points(geo,mistMat);mist.layers.set(LAYER_NEAR);mist.frustumCulled=false;scene.add(mist);
  const wakeMat=new THREE.MeshBasicMaterial({color:0x8babb4,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const wakeGeo=new THREE.RingGeometry(1.8,2,64),wake=new THREE.Mesh(wakeGeo,wakeMat);wake.rotation.x=-Math.PI/2;wake.layers.set(LAYER_NEAR);scene.add(wake);let wakeAge=10;
  async function load(){try{
    const manifest=await (await fetch(base+'data/wildlife.json')).json();const asset=manifest.models?.find(m=>m.kind==='humpback'&&m.approved&&m.file&&m.sourceUrl&&m.license);if(!asset)return;
    const gltf=await new GLTFLoader().loadAsync(base+asset.file),root=gltf.scene;
    const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());root.position.sub(center);
    whale=new THREE.Group();whale.add(root);whale.scale.setScalar(12/size.z);whale.visible=false;
    whale.traverse(o=>{o.layers.set(LAYER_NEAR);if(!o.isMesh)return;o.frustumCulled=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.roughness=.42;m.metalness=0;for(const key of ['map','emissiveMap'])if(m[key])m[key].colorSpace=THREE.NoColorSpace;m.onBeforeCompile=shader=>{shader.uniforms.uTailTime=tailTime;shader.vertexShader='uniform float uTailTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.y += smoothstep(.12,.5,position.z)*sin(uTailTime*1.05-position.z*2.)*.025;');};m.customProgramCacheKey=()=> 'humpback-swim-v1';}});
    scene.add(whale);
  }catch(error){console.warn('Whale asset could not load',error);}}
  const loading=load();
  function spawn(camera,preview=false){if(!whale)return false;camera.getWorldDirection(forward);forward.y=0;forward.normalize();anchor.copy(camera.position).addScaledVector(forward,preview?38:100+Math.random()*70);heading=Math.atan2(forward.x,-forward.z)+Math.PI/2;if(preview){anchor.x+=Math.sin(heading)*13.2;anchor.z-=Math.cos(heading)*13.2;}age=preview?4:0;lastBlow=-1;active=true;whale.visible=true;return true;}
  function blow(time){
    const fx=Math.sin(heading),fz=-Math.cos(heading),x=whale.position.x+fx*3.2,z=whale.position.z+fz*3.2;ocean.sample(x,z,time,sample);
    for(let i=0;i<particles;i++){positions[i*3]=x+(Math.random()-.5)*.3;positions[i*3+1]=sample.h+.15;positions[i*3+2]=z+(Math.random()-.5)*.3;velocity[i*3]=(Math.random()-.5)*.9;velocity[i*3+1]=1.8+Math.random()*2.3;velocity[i*3+2]=(Math.random()-.5)*.9;life[i]=.7+Math.random()*.3;}
    wakeAge=0;wake.position.set(x,sample.h+.05,z);
  }
  function update(dt,camera,{time,windSpeed,sunAltitude,playing,enabled=true,tint=[.3,.4,.45]}){
    mistMat.uniforms.uTint.value.setRGB(...tint.map(v=>Math.min(.9,v*1.4+.08)));
    for(let i=0;i<particles;i++){if(life[i]<=0)continue;life[i]-=dt*.34;positions[i*3]+=velocity[i*3]*dt+windSpeed*.015*dt;positions[i*3+1]+=velocity[i*3+1]*dt;positions[i*3+2]+=velocity[i*3+2]*dt;velocity[i*3+1]-=dt*1.4;if(life[i]<=0)positions[i*3+1]=-1000;}geo.attributes.position.needsUpdate=true;geo.attributes.aLife.needsUpdate=true;
    wakeAge+=dt;wake.scale.setScalar(1+wakeAge*.9);ocean.sample(wake.position.x,wake.position.z,time,sample);wake.position.y=sample.h+.07;wakeMat.opacity=Math.max(0,.14*(1-wakeAge/5));
    if(!whale)return;
    if(!enabled){active=false;whale.visible=false;life.fill(0);positions.fill(-1000);wakeMat.opacity=0;return;}
    if(!active){if(!playing||sunAltitude< -5||windSpeed>18)return;wait-=dt;if(wait<=0)spawn(camera);return;}
    age+=dt;tailTime.value=age;
    const cycle=age%24,along=(age-16)*1.1,fx=Math.sin(heading),fz=-Math.cos(heading);
    const x=anchor.x+fx*along,z=anchor.z+fz*along;ocean.sample(x,z,time,sample);
    const depth=-5+3.7*smooth(0,4,cycle)-5*smooth(12,21,cycle);
    whale.position.set(x,sample.h+depth,z);whale.rotation.set(-.16*smooth(12,18,cycle),-heading,Math.sin(age*.22)*.025,'YXZ');
    const breath=Math.floor(age/24)*2+(cycle>8?1:0);
    if(cycle>=4.5&&cycle<11&&breath!==lastBlow){lastBlow=breath;blow(time);}
    if(age>48||whale.position.distanceTo(camera.position)>450){active=false;whale.visible=false;wait=1200+Math.random()*1500;}
  }
  return {update,loading,preview:camera=>spawn(camera,true),get ready(){return !!whale;},get active(){return active;},get position(){return whale?.position;}};
}
