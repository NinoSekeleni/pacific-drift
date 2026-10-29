import * as THREE from 'three';
import {SKY_GLSL} from './sky.js';

// A small, sky-only probe: never captures the boat into its own reflections.
// The atmosphere is display encoded; decode once before filtering PBR lighting.
export function createMarineLighting(renderer,sky,isTouch=false){
 const scene=new THREE.Scene(),materials=new Set();
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthTest:false,depthWrite:false,uniforms:sky.uniforms,
  vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:SKY_GLSL+`varying vec3 vDir;void main(){
   vec3 c=max(vec3(0.),skyColor(normalize(vDir),0.));
   vec3 linear=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
   gl_FragColor=vec4(linear,1.);
  }`
 });
 scene.add(new THREE.Mesh(sky.dome.geometry,material));
 const cube=new THREE.WebGLCubeRenderTarget(isTouch?32:64,{type:THREE.HalfFloatType});
 const camera=new THREE.CubeCamera(.1,20000,cube),pmrem=new THREE.PMREMGenerator(renderer);
 let filtered=null,last=-Infinity,lastKey='';
 function register(root){root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.isMeshStandardMaterial){materials.add(m);if(filtered){m.envMap=filtered.texture;m.needsUpdate=true;}m.envMapIntensity=m.userData.boatFabric?.12:.32;}});}
 function update(time,enabled=true){
  if(!materials.size)return;
  for(const m of materials)m.envMapIntensity=enabled?(m.userData.boatFabric?.12:.32):0;
  if(!enabled)return;
  const key=[...sky.uniforms.uZen.value.toArray(),...sky.uniforms.uHor.value.toArray()].map(v=>Math.round(v*30)).join(',');
  if(filtered&&time-last<(key===lastKey?12:1.2))return;
  const prior=renderer.getRenderTarget(),clear=renderer.autoClear;let next;
  try{renderer.autoClear=true;camera.update(renderer,scene);next=pmrem.fromCubemap(cube.texture);}
  finally{renderer.setRenderTarget(prior);renderer.autoClear=clear;}
  const old=filtered;filtered=next;last=time;lastKey=key;
  for(const m of materials){const first=!m.envMap;m.envMap=filtered.texture;if(first)m.needsUpdate=true;}
  old?.dispose();
 }
 return {register,update,dispose(){filtered?.dispose();cube.dispose();material.dispose();pmrem.dispose();}};
}
