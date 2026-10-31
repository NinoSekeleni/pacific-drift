// Distant rain shafts and a low shelf bank that move toward and past the boat.
// This visual layer follows existing unsettled weather; it does not change voyage physics.
import * as THREE from 'three';
import {LAYER_FAR, NOISE_GLSL} from './sky.js';

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

/** An accelerated 120-second studio front. Natural weather is never modified. */
export function frontPreviewInfluence(age){
  const progress=clamp(age/120);
  const envelope=smooth(.08,.52,progress)*(1-smooth(.78,1,progress));
  return {
    progress,
    rain:.85*smooth(.40,.60,progress)*(1-smooth(.76,.98,progress)),
    cover:.9*envelope,
    darkness:.72*envelope,
    windBoost:11*smooth(.24,.54,progress)*(1-smooth(.80,1,progress))
  };
}

const vertexShader=/* glsl */`
  varying vec2 vUv;
  varying float vRange;
  void main(){
    vUv=uv;
    vec4 world=modelMatrix*vec4(position,1.);
    vRange=length(world.xyz-cameraPosition);
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;

function ribbon(width,height,segments=40){
  const geo=new THREE.PlaneGeometry(width,height,segments,8);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i);
    // A broad arc gives the bank depth; no straight, hard billboard edge.
    pos.setZ(i,Math.pow(x/(width*.5),2)*width*.075);
  }
  pos.needsUpdate=true;
  geo.computeBoundingSphere();
  return geo;
}

export function createWeatherFronts(scene){
  const root=new THREE.Group();root.visible=false;scene.add(root);
  const uniforms={
    uTime:{value:0},uOpacity:{value:0},uRain:{value:0},uDark:{value:0},uDay:{value:1},
    uFog:{value:new THREE.Color(.3,.4,.45)},uFlash:{value:0}
  };
  const common={uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,vertexShader};
  const bankMat=new THREE.ShaderMaterial({...common,fragmentShader:NOISE_GLSL+/* glsl */`
    uniform float uTime,uOpacity,uRain,uDark,uDay,uFlash;
    uniform vec3 uFog;
    varying vec2 vUv;
    varying float vRange;
    void main(){
      vec2 uv=vUv;
      float side=smoothstep(0.,.12,uv.x)*(1.-smoothstep(.88,1.,uv.x));
      float shape=fbm(vec2(uv.x*9.-uTime*.004,uv.y*2.6),4);
      float bottom=.16+shape*.18+.025*sin(uv.x*47.);
      float top=.76+fbm(vec2(uv.x*7.5+8.,uTime*.003),4)*.19;
      float edge=smoothstep(bottom,bottom+.14,uv.y)*(1.-smoothstep(top-.13,top,uv.y));
      float rolls=fbm(vec2(uv.x*22.-uTime*.011,uv.y*7.+uTime*.006),4);
      float body=.56+.40*rolls;
      float density=edge*side*body;
      float lower=smoothstep(bottom+.03,bottom+.43,uv.y);
      vec3 base=uFog*mix(.42,.92,lower)*(1.-uDark*.18);
      // The exposed upper rolls catch the available light; the underside stays dense.
      base+=vec3(.14,.15,.16)*uDay*lower*pow(rolls,2.);
      base+=vec3(.48,.55,.67)*uFlash*.65*edge;
      float haze=1.-exp(-vRange/21000.);
      base=mix(base,uFog,haze*.65);
      float alpha=density*uOpacity*mix(.86,.95,uRain)*(1.-haze*.28);
      if(alpha<.006)discard;
      gl_FragColor=vec4(base,alpha);
    }
  `});
  const rainMat=new THREE.ShaderMaterial({...common,fragmentShader:NOISE_GLSL+/* glsl */`
    uniform float uTime,uOpacity,uRain,uDark,uDay,uFlash;
    uniform vec3 uFog;
    varying vec2 vUv;
    varying float vRange;
    void main(){
      vec2 uv=vUv;
      float side=smoothstep(0.,.10,uv.x)*(1.-smoothstep(.90,1.,uv.x));
      float curtains=fbm(vec2(uv.x*14.+uv.y*.42-uTime*.004,uv.y*.75),4);
      float shafts=smoothstep(.28,.64,curtains);
      float strands=noise(vec2(uv.x*145.+uv.y*2.6,uv.y*1.2+uTime*.055));
      float top=smoothstep(.76,1.,uv.y);
      float seaMist=.20*exp(-uv.y*uv.y*42.);
      float vertical=smoothstep(0.,.08,uv.y)*(1.-top*.30);
      float alpha=(shafts*(.34+.34*strands)*vertical+seaMist)*side*uOpacity*uRain;
      vec3 rainCol=mix(uFog*.66,uFog*.95,uv.y)*(1.-uDark*.10);
      rainCol+=vec3(.25,.3,.38)*uFlash*.35;
      // Distant shafts dissolve into the horizon instead of ending at a ruler-straight line.
      float haze=1.-exp(-vRange/20000.);
      rainCol=mix(rainCol,uFog,haze*.65);
      alpha*=1.-haze*.35;
      if(alpha<.006)discard;
      gl_FragColor=vec4(rainCol,alpha);
    }
  `});
  const bank=new THREE.Mesh(ribbon(14000,2200),bankMat);
  bank.position.y=1250;bank.renderOrder=-6;bank.layers.set(LAYER_FAR);bank.frustumCulled=false;root.add(bank);
  const rainShafts=new THREE.Mesh(ribbon(12500,950),rainMat);
  rainShafts.position.set(0,420,70);rainShafts.renderOrder=-5;rainShafts.layers.set(LAYER_FAR);rainShafts.frustumCulled=false;root.add(rainShafts);
  const normal=new THREE.Vector3(0,0,-1);
  let active=false,manual=false,age=0,distance=0,travel=0,wait=35,lastRain=0,amount=0;
  const influence={rain:0,cover:0,darkness:0,windBoost:0,progress:0};
  function clearInfluence(){Object.assign(influence,{rain:0,cover:0,darkness:0,windBoost:0,progress:0});}
  function spawn(camera,windU=0,windV=0,preview=false){
    manual=preview;active=true;age=0;amount=0;
    if(preview){camera.getWorldDirection(normal);normal.y=0;if(normal.lengthSq()<.01)normal.set(0,0,-1);normal.normalize();distance=4800;travel=80;}
    else{normal.set(-windU,0,windV);if(normal.lengthSq()<1)normal.set(.7,0,-.7);normal.normalize();distance=7500;travel=Math.max(8,Math.min(25,Math.hypot(windU,windV)*1.1));}
    root.visible=true;clearInfluence();
  }
  function update(dt,camera,{time=0,windU=0,windV=0,rain=0,cover=0,darkness=0,sunAltitude=20,tint=[.3,.4,.45],enabled=true,playing=true,flash=0,journeyKind=null,journeyProgress=0}={}){
    const delta=Math.max(0,Math.min(.25,Number.isFinite(dt)?dt:0));
    if(!enabled){active=false;manual=false;root.visible=false;clearInfluence();lastRain=rain;return;}
    const journey=!!journeyKind&&!manual;
    const inFront=['building','rain','storm','squall','clearing'].includes(journeyKind);
    if(journey&&!inFront){active=false;root.visible=false;amount=0;clearInfluence();lastRain=rain;return;}
    if(journey&&inFront&&!active)spawn(camera,windU,windV,false);
    if(!active){
      if(playing)wait-=delta;
      // Existing local weather and its trend, rather than an unrelated random storm.
      const unsettled=(cover>.55&&darkness>.14)||(rain>.18&&rain>=lastRain-.005);
      if(playing&&wait<=0&&unsettled)spawn(camera,windU,windV,false);
      else {lastRain=rain;return;}
    }
    if(playing)age+=delta;
    if(manual)Object.assign(influence,frontPreviewInfluence(age));
    const frontRain=manual?Math.max(.35,influence.rain):Math.max(.22,rain);
    const frontDark=manual?Math.max(.18,influence.darkness):darkness;
    const strength=manual ? .92 : clamp(.32+rain*.55+darkness*.25);
    const target=strength*smooth(0,4,age);
    amount+=(target-amount)*(1-Math.exp(-delta/2));
    const progress=clamp(journeyProgress);
    const remaining=journey?(journeyKind==='building'?7500-4500*progress:journeyKind==='clearing'?-1800-6500*progress:journeyKind==='rain'?3000-4800*progress:-1800):distance-age*travel;
    // Fade into the existing overhead sky/rain before a mesh could cross the eye.
    const nearFade=smooth(250,1800,journey&&journeyKind==='clearing'?Math.abs(remaining):remaining);
    const endFade=journey?(journeyKind==='clearing'?smooth(0,.15,progress)*(1-smooth(.3,1,progress)):journeyKind==='building'?smooth(0,.18,progress):1):manual?1-smooth(106,120,age):1-smooth(760,900,age);
    uniforms.uTime.value=time;uniforms.uOpacity.value=amount*nearFade*endFade;
    uniforms.uRain.value=frontRain;uniforms.uDark.value=frontDark;uniforms.uDay.value=smooth(-6,12,sunAltitude);
    uniforms.uFog.value.setRGB(...tint);uniforms.uFlash.value=Math.max(0,flash);
    // World north corresponds to -Z. Set the ribbon across the approaching wind.
    root.position.set(camera.position.x+normal.x*remaining,0,camera.position.z+normal.z*remaining);
    root.rotation.y=Math.atan2(normal.x,normal.z);
    // Earth curvature drops the distant rain foot below the visible horizon.
    root.position.y=-Math.min(100,Math.max(0,remaining)*Math.max(0,remaining)/(2*6371000));
    lastRain=rain;
    if((manual&&age>=120)||(!manual&&!journey&&(remaining< -2200||age>=900))){active=false;manual=false;root.visible=false;clearInfluence();wait=360;}
  }
  return {
    update,
    preview(camera){spawn(camera,0,0,true);},
    cancelPreview(){active=false;manual=false;root.visible=false;clearInfluence();wait=35;},
    get influence(){return influence;},
    get active(){return active;},
    get windDirection(){return {u:-normal.x,v:normal.z};},
    get previewing(){return active&&manual;},
    get distance(){return active?Math.max(0,distance-age*travel):0;},
    dispose(){scene.remove(root);bank.geometry.dispose();rainShafts.geometry.dispose();bankMat.dispose();rainMat.dispose();}
  };
}
