import * as THREE from 'three';
export const EXCEPTIONAL_WAVE_GLSL=`
 uniform vec4 uWaveSet;uniform vec2 uWaveSetDir;
 vec3 waveSet(vec2 p,float t){
  if(uWaveSet.w<=0.)return vec3(0.);
  float age=t-uWaveSet.z;if(age<0.||age>70.)return vec3(0.);
  float k=6.28318530718/95.,c=sqrt(9.81/k);vec2 d=p-uWaveSet.xy;
  float along=dot(d,uWaveSetDir)-c*age,across=dot(d,vec2(-uWaveSetDir.y,uWaveSetDir.x));
  float envelope=exp(-.5*(along*along/(48.*48.)+across*across/(100.*100.)))*smoothstep(0.,6.,age)*(1.-smoothstep(52.,70.,age));
  float phase=k*along,h=uWaveSet.w*cos(phase)*envelope,slope=uWaveSet.w*envelope*(-k*sin(phase)-cos(phase)*along/(48.*48.));
  float side=-h*across/(100.*100.);return vec3(h,uWaveSetDir*slope+vec2(-uWaveSetDir.y,uWaveSetDir.x)*side);
 }`;
export function sampleWaveSet(x,z,t,packet,direction,out={}){
 const age=t-packet.z;if(!(packet.w>0)||age<0||age>70){out.h=out.sx=out.sz=0;return out;}
 const k=Math.PI*2/95,c=Math.sqrt(9.81/k),dx=x-packet.x,dz=z-packet.y,along=dx*direction.x+dz*direction.y-c*age,across=-dx*direction.y+dz*direction.x;
 const smooth=(a,b,v)=>{v=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return v*v*(3-2*v);};
 const envelope=Math.exp(-.5*(along*along/48**2+across*across/100**2))*smooth(0,6,age)*(1-smooth(52,70,age)),phase=k*along;
 out.h=packet.w*Math.cos(phase)*envelope;const slope=packet.w*envelope*(-k*Math.sin(phase)-Math.cos(phase)*along/48**2);const side=-out.h*across/100**2;out.sx=direction.x*slope-direction.y*side;out.sz=direction.y*slope+direction.x*side;return out;
}
export function createExceptionalWaves(ocean,{onApproach=()=>{},random=Math.random}={}){
 let next=2400+random()*3000,activeUntil=0;const direction=new THREE.Vector2();
 function spawn(camera,time,heading=0,swell=2.5){direction.set(Math.sin(heading),-Math.cos(heading));ocean.uniforms.uWaveSetDir.value.copy(direction);const p=ocean.uniforms.uWaveSet.value;p.set(camera.position.x-direction.x*200,camera.position.z-direction.y*200,time,Math.min(2.6,Math.max(1.2,swell*.55)));activeUntil=time+70;onApproach();}
 return{update(dt,camera,{time=0,swell=0,wind=0,heading=0,playing=true,enabled=true}={}){if(!enabled){ocean.uniforms.uWaveSet.value.w=0;activeUntil=0;return;}if(time>activeUntil)ocean.uniforms.uWaveSet.value.w=0;if(playing)next-=Math.max(0,dt);if(next<=0&&time>activeUntil&&swell>2&&wind>8){spawn(camera,time,heading,swell);next=3600+random()*7200;}},preview(camera,time,heading,swell){spawn(camera,time,heading,swell);},get active(){return ocean.uniforms.uWaveSet.value.w>0;}};
}
