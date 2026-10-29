// World-space rainfall: sparse close drops, finer middle rain, and distant rain.
import * as THREE from 'three';
import {LAYER_NEAR} from './sky.js';
const clamp=THREE.MathUtils.clamp;
export function createRain(scene,renderer){
 const resolution=new THREE.Vector2(1280,720),previous=new THREE.Vector3();let initialized=false,time=0;
 const layers=[],configs=[{name:'Close rain',count:260,radius:7,height:13,width:1.55,exposure:.012,opacity:.42},{name:'Middle rain',count:1750,radius:42,height:29,width:.85,exposure:.015,opacity:.30},{name:'Distant rain',count:1800,radius:110,height:47,width:.52,exposure:.012,opacity:.14}];
 for(const config of configs){
  const g=new THREE.InstancedBufferGeometry();g.setIndex([0,1,2,2,1,3]);g.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,-1,1,0,1,1,0],3));
  const positions=new Float32Array(config.count*3),styles=new Float32Array(config.count*4);for(let i=0;i<config.count;i++){styles.set([.72+Math.random()*.56,.7+Math.random()*.6,Math.random()*6.28,Math.random()],i*4);}
  g.setAttribute('aDrop',new THREE.InstancedBufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aStyle',new THREE.InstancedBufferAttribute(styles,4));
  const uniforms={uResolution:{value:resolution},uVelocity:{value:new THREE.Vector3()},uExposure:{value:config.exposure},uWidth:{value:config.width},uOpacity:{value:0},uTint:{value:new THREE.Color()},uTime:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:true,depthWrite:false,
   vertexShader:`attribute vec3 aDrop;attribute vec4 aStyle;uniform vec2 uResolution;uniform vec3 uVelocity;uniform float uExposure,uWidth,uTime;varying vec2 vDrop;varying float vAlpha;
   void main(){vec3 velocity=uVelocity;velocity.y*=aStyle.x;velocity.xz+=vec2(sin(uTime*.8+aStyle.z),cos(uTime*.63+aStyle.z))*.25;
    vec4 head=projectionMatrix*viewMatrix*vec4(aDrop,1.);vec4 tail=projectionMatrix*viewMatrix*vec4(aDrop-velocity*uExposure*aStyle.y,1.);
    vec2 delta=(head.xy/max(.08,head.w)-tail.xy/max(.08,tail.w))*uResolution;vec2 direction=delta/max(length(delta),.001);vec2 side=vec2(-direction.y,direction.x);
    gl_Position=mix(head,tail,position.y);gl_Position.xy+=side*position.x*uWidth*aStyle.x*2./uResolution*gl_Position.w;
    vDrop=position.xy;vAlpha=smoothstep(.10,.55,head.w)*(.55+.45*aStyle.w);}`,
   fragmentShader:`precision highp float;uniform vec3 uTint;uniform float uOpacity;varying vec2 vDrop;varying float vAlpha;
   void main(){float edge=exp(-vDrop.x*vDrop.x*4.5);float ends=smoothstep(0.,.15,vDrop.y)*(1.-smoothstep(.55,1.,vDrop.y));float alpha=edge*ends*vAlpha*uOpacity;if(alpha<.002)discard;gl_FragColor=vec4(uTint,alpha);}`});
  g.instanceCount=0;const mesh=new THREE.Mesh(g,material);mesh.visible=false;mesh.name=config.name;mesh.layers.set(LAYER_NEAR);mesh.frustumCulled=false;mesh.renderOrder=3;scene.add(mesh);layers.push({config,mesh,positions,styles});
 }
 const veilUniforms={uTint:{value:new THREE.Color()},uAmount:{value:0},uTime:{value:0},uWind:{value:new THREE.Vector2()}};
 const veilMaterial=new THREE.ShaderMaterial({uniforms:veilUniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.BackSide,
  vertexShader:`varying vec3 vWorld;varying vec2 vUv;void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
  fragmentShader:`precision highp float;uniform vec3 uTint;uniform float uAmount,uTime;uniform vec2 uWind;varying vec3 vWorld;varying vec2 vUv;
  void main(){vec2 q=vWorld.xz*.009-uWind*uTime*.0012;float banks=.62+.22*sin(q.x+sin(q.y*.7))+.16*sin(q.y*1.7+q.x*.6);float edge=smoothstep(0.,.15,vUv.y)*(1.-smoothstep(.7,1.,vUv.y));float a=uAmount*banks*edge;if(a<.001)discard;gl_FragColor=vec4(uTint,a);}`});
 const veil=new THREE.Mesh(new THREE.CylinderGeometry(850,850,600,48,1,true),veilMaterial);veil.visible=false;veil.name='Distant rain veil';veil.layers.set(LAYER_NEAR);veil.frustumCulled=false;veil.renderOrder=2;scene.add(veil);
 function seed(layer,i,cam){const {config,positions}=layer,k=i*3,angle=Math.random()*Math.PI*2;const radius=config.radius*(.16+Math.sqrt(Math.random())*.84);positions[k]=cam.x+Math.cos(angle)*radius;positions[k+1]=cam.y-5+Math.random()*config.height;positions[k+2]=cam.z+Math.sin(angle)*radius;}
 function update(dt,cam,amount,windE,windN,tint,options={}){
  dt=clamp(Number.isFinite(dt)?dt:0,0,.1);time+=dt;amount=clamp(amount||0,0,1);const strength=clamp(options.strength??1,0,2),enabled=options.enabled!==false;
  const reset=!initialized||cam.distanceToSquared(previous)>250*250;
  for(const layer of layers){const {config,mesh,positions,styles}=layer;

   const uniforms=mesh.material.uniforms;uniforms.uVelocity.value.set(windE*.48,-9.5,-windN*.48);uniforms.uTime.value=time;
   uniforms.uTint.value.setRGB(...tint.map(v=>clamp(v*.75+.25,.07,.85)));uniforms.uOpacity.value=config.opacity*(.65+.35*Math.sqrt(amount))*(.8+strength*.2);
   mesh.visible=enabled&&amount>.003&&strength>0;mesh.geometry.instanceCount=mesh.visible?Math.min(config.count,Math.round(config.count*amount*strength)):0;
   if(!mesh.visible){layer.ready=false;continue;}if(reset||!layer.ready)for(let i=0;i<config.count;i++)seed(layer,i,cam);layer.ready=true;
   for(let i=0;i<config.count;i++){const k=i*3,s=i*4;positions[k]+=(windE*.48+Math.sin(time*.8+styles[s+2])*.25)*dt;positions[k+1]-=9.5*styles[s]*dt;positions[k+2]+=(-windN*.48+Math.cos(time*.63+styles[s+2])*.25)*dt;
    const x=positions[k]-cam.x,z=positions[k+2]-cam.z;
    if(positions[k+1]<cam.y-7||Math.hypot(x,z)>config.radius*1.3){seed(layer,i,cam);positions[k+1]=cam.y+config.height-5;}
   }mesh.geometry.attributes.aDrop.needsUpdate=true;
  }
  veil.visible=options.veil!==false&&amount>.01;veil.position.set(cam.x,cam.y+275,cam.z);veilUniforms.uAmount.value=Math.pow(amount,1.35)*.16;veilUniforms.uTint.value.setRGB(...tint.map(v=>clamp(v*.8+.04,.03,.75)));veilUniforms.uTime.value=time;veilUniforms.uWind.value.set(windE,-windN);
  previous.copy(cam);initialized=true;
 }
 function resize(){if(renderer)renderer.getDrawingBufferSize(resolution);}
 resize();return {update,resize,get state(){return {counts:layers.map(l=>l.mesh.geometry.instanceCount),veil:veil.visible,total:configs.reduce((n,c)=>n+c.count,0)};}};
}
