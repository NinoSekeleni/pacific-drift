import * as THREE from 'three';
import {LAYER_FAR,NOISE_GLSL,SKY_UNIFORMS_GLSL,CLOUD_LOOKUP_GLSL} from './sky.js';
const clamp=x=>Math.max(0,Math.min(1,x));
export function opticsVisibility({sunAltitude=-90,moonAltitude=-90,moonLight=0,rain=0,recentRain=0,cover=1,cirrus=0,visibility=60000}={}){
 const moisture=clamp(Math.max(rain,recentRain)*3),sun=clamp((sunAltitude-.3)/4)*clamp((42-sunAltitude)/8),open=clamp((.9-cover)/.5);
 return {rainbow:moisture*sun*open*clamp((visibility-700)/5000),fogbow:moisture*sun*clamp((1800-visibility)/1300)*open,
 sunHalo:clamp((sunAltitude+1)/6)*clamp(cirrus*2)*clamp((.95-cover)/.7),moonHalo:clamp((moonAltitude-1)/8)*clamp(moonLight*4)*clamp(cirrus*2)*clamp((.95-cover)/.7)*clamp((-sunAltitude-3)/7)};
}
export function createSkyOptics(scene,sky){
 const uniforms={...sky.uniforms,uBow:{value:0},uFogbow:{value:0},uSunHalo:{value:0},uMoonHalo:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,side:THREE.BackSide,transparent:true,depthWrite:false,depthTest:false,
 vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:NOISE_GLSL+SKY_UNIFORMS_GLSL+CLOUD_LOOKUP_GLSL+`
 varying vec3 vDir;uniform float uBow,uFogbow,uSunHalo,uMoonHalo;
 float band(float a,float centre,float width){float x=(a-centre)/width;return exp(-x*x);}
 void main(){vec3 d=normalize(vDir);if(d.y<0.)discard;
  float anti=degrees(acos(clamp(dot(d,-uSunDir),-1.,1.))),solar=degrees(acos(clamp(dot(d,uSunDir),-1.,1.))),lunar=degrees(acos(clamp(dot(d,uMoonDir),-1.,1.)));
  vec3 spectrum=vec3(band(anti,42.2,.35),band(anti,41.3,.42),band(anti,40.6,.43));
  float a=max(spectrum.r,max(spectrum.g,spectrum.b))*uBow*.38;
  vec3 colour=(spectrum+.14)/max(.001,max(spectrum.r,max(spectrum.g,spectrum.b))+.14);
  float white=band(anti,38.,2.2)*uFogbow*.14;
  float halo=band(solar,22.,.42)*uSunHalo*.18+band(lunar,22.,.55)*uMoonHalo*.16;
  colour=(colour*a+vec3(.86,.89,.85)*white+vec3(.92,.86,.72)*halo)/max(.001,a+white+halo);a+=white+halo;
  float cloud=cloudsAt(d).a;a*=1.-smoothstep(.22,.83,cloud);a*=smoothstep(0.,.035,d.y);
  if(a<.001)discard;gl_FragColor=vec4(colour,min(.5,a));
 }`});
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(90000,48,24),material);mesh.layers.set(LAYER_FAR);mesh.renderOrder=-3;mesh.frustumCulled=false;scene.add(mesh);let recentRain=0,last={};
 return {update(dt,camera,{sunAltitude,moonAltitude,moonLight,rain,cover,cirrus,visibility,enabled=true,halos=true}={}){recentRain=Math.max(Number(rain)||0,recentRain*Math.exp(-Math.max(0,dt)/300));last=opticsVisibility({sunAltitude,moonAltitude,moonLight,rain,cover,cirrus,visibility,recentRain});uniforms.uBow.value=enabled?last.rainbow:0;uniforms.uFogbow.value=enabled?last.fogbow:0;uniforms.uSunHalo.value=halos?last.sunHalo:0;uniforms.uMoonHalo.value=halos?last.moonHalo:0;mesh.position.copy(camera.position);mesh.visible=enabled||halos;},get state(){return {...last};},dispose(){scene.remove(mesh);mesh.geometry.dispose();material.dispose();}};
}
