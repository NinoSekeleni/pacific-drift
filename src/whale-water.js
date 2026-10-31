// Marks the whales leave on the sea, after Tidewater's WhaleWater (MIT): churned white water
// where a back breaks the surface and rolls, spreading and fading over about 15 s, and the flat,
// glassy "fluke print" where a humpback dives. A few analytic patches in a small uniform array
// (x, z, radius, strength); strength > 0 is foam, < 0 is slick. No textures.
import * as THREE from 'three';

export const WHALE_MARKS=6;

export const WHALE_WATER_GLSL=/* glsl */`
uniform vec4 uWhaleMarks[${WHALE_MARKS}];
vec2 whaleWater(vec2 xz){
  float foam=0.0,slick=0.0;
  for(int i=0;i<${WHALE_MARKS};i++){
    vec4 e=uWhaleMarks[i];
    if(e.w==0.0)continue;
    float d=length(xz-e.xy)/e.z;
    if(d>=1.0)continue;
    float core=1.0-smoothstep(.2,1.0,d);
    // churned water breaks into lumps and streaks with dark water between them
    vec2 q=xz*.8,q2=xz*2.9;
    float n1=sin(q.x+sin(q.y*1.3)*1.7)*sin(q.y*1.1+sin(q.x*1.7)*1.4);
    float n2=sin(q2.x*1.1+sin(q2.y)*1.3)*sin(q2.y*.9+sin(q2.x*1.2));
    float lumps=smoothstep(-.25,.55,n1*.7+n2*.45+(1.0-d)*.5);
    foam=max(foam,core*max(e.w,0.0)*lumps*.85);
    slick=max(slick,core*max(-e.w,0.0));
  }
  return vec2(foam,slick);
}
`;

export function createWhaleWater(uniform={value:null}){
 if(!uniform.value)uniform.value=Array.from({length:WHALE_MARKS},()=>new THREE.Vector4(0,0,1,0));
 let events=[];
 function push(e){events.push({age:0,...e});if(events.length>WHALE_MARKS)events.shift();}
 const foam=(x,z,r,life=16,peak=.9)=>push({x,z,r,life,peak,kind:'foam'});
 const slick=(x,z,r,life=24,peak=1)=>push({x,z,r,life,peak,kind:'slick'});
 function update(dt){
  for(let k=0;k<WHALE_MARKS;k++){const e=events[k];if(!e){uniform.value[k].set(0,0,1,0);continue;}
   e.age+=dt;const f=Math.max(0,1-e.age/e.life),grow=e.kind==='foam'?1+e.age*.06:1+e.age*.02;
   uniform.value[k].set(e.x,e.z,e.r*grow,(e.kind==='foam'?1:-1)*e.peak*f*Math.min(1,e.age*3));}
  events=events.filter(e=>e.age<e.life);
 }
 function shift(dx,dz){for(const e of events){e.x-=dx;e.z-=dz;}}
 function clear(){events=[];update(0);}
 return {uniform,foam,slick,update,shift,clear,get count(){return events.length;},get events(){return events;}};
}
