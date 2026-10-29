// Rare offshore encounters. A Magnific albatross is enabled only after its asset
// has been reviewed and its download approved; no substitute model is bundled.
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LAYER_NEAR} from './sky.js';
export function createWildlife(scene,ocean,{base='./'}={}){
  let bird=null,mixer=null,age=0,wait=90+Math.random()*90,active=false;
  const anchor=new THREE.Vector3(),sample={},direction=new THREE.Vector3();
  let crosswind=0;
  const wingFlex={value:0};
  async function load(){
    try{
      const response=await fetch(base+'data/wildlife.json');if(!response.ok)return;
      const manifest=await response.json();
      const asset=manifest.models?.find(m=>m.kind==='albatross' && m.approved && m.file && m.sourceUrl && m.license);
      if(!asset)return;
      const gltf=await new GLTFLoader().loadAsync(base+asset.file);
      const root=gltf.scene;
      const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      root.position.sub(center);
      const orient=new THREE.Group();orient.add(root);
      if(size.z>size.x)orient.rotation.y=Math.PI/2;
      const span=Math.max(size.x,size.z);
      bird=new THREE.Group();bird.add(orient);bird.scale.setScalar(3.1/Math.max(.001,span));
      bird.traverse(o=>{o.layers.set(LAYER_NEAR);if(o.isMesh){o.frustumCulled=false;const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){if(m.roughness!==undefined)m.roughness=Math.max(.65,m.roughness);if(m.metalness!==undefined)m.metalness=0;
        for(const key of ['map','emissiveMap'])if(m[key])m[key].colorSpace=THREE.NoColorSpace;
        m.onBeforeCompile=shader=>{shader.uniforms.uWingFlex=wingFlex;shader.vertexShader='uniform float uWingFlex;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.y += pow(smoothstep(.13,1.05,abs(position.z)),1.4)*uWingFlex;');};
        m.customProgramCacheKey=()=> 'albatross-wing-flex-v1';}}});
      bird.visible=false;scene.add(bird);
      if(gltf.animations.length){mixer=new THREE.AnimationMixer(root);const glide=gltf.animations.find(a=>/glid|soar/i.test(a.name));if(glide)mixer.clipAction(glide).play();}
    }catch(error){console.warn('Wildlife asset could not load',error);}
  }
  const loading=load();
  function spawn(camera,windFrom,preview=false){
    if(!bird)return false;
    anchor.copy(camera.position);crosswind=windFrom+Math.PI/2;
    if(preview){camera.getWorldDirection(direction);direction.y=0;direction.normalize();anchor.addScaledVector(direction,35);crosswind=Math.atan2(direction.x,-direction.z)+Math.PI/2;}
    age=preview?12:0;active=true;bird.visible=true;return true;
  }
  function update(dt,camera,{lat,windFrom,windSpeed,time,sunAltitude,playing,enabled=true}){
    if(!bird)return;
    if(!enabled){active=false;bird.visible=false;return;}
    if(mixer)mixer.update(dt);
    if(!active){
      if(!playing || sunAltitude < -6 || lat> -25 || lat< -65)return;
      wait-=dt;
      if(wait<=0)spawn(camera,windFrom);
      return;
    }
    age+=dt;
    wingFlex.value=Math.sin(age*1.7)*.012 + Math.sin(age*.53)*.009;
    const speed=Math.min(20,10+windSpeed*.22),along=-180+age*speed;
    const phase=age*.31,lateral=Math.sin(phase)*24;
    const sx=Math.sin(crosswind),sz=-Math.cos(crosswind),rx=Math.cos(crosswind),rz=Math.sin(crosswind);
    const x=anchor.x+sx*along+rx*lateral,z=anchor.z+sz*along+rz*lateral;
    ocean.sample(x,z,time,sample);
    const y=sample.h+5.0+(1+Math.sin(phase*.9))*4;
    bird.position.set(x,y,z);
    direction.set(sx*speed+rx*Math.cos(phase)*7.44,Math.cos(phase*.9)*1.12,sz*speed+rz*Math.cos(phase)*7.44).normalize();
    bird.rotation.set(Math.asin(direction.y),Math.atan2(-direction.x,-direction.z),Math.sin(phase)*.36,'YXZ');
    if(age>48 || Math.hypot(x-camera.position.x,z-camera.position.z)>650){active=false;bird.visible=false;wait=900+Math.random()*1500;}
  }
  return {update,loading,preview(camera,windFrom=0){return spawn(camera,windFrom,true);},get position(){return bird?.position;},get ready(){return !!bird;},get active(){return active;}};
}
