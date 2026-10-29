// Small ballistic droplets from the bow and blade. A surface sampler can let
// the drops land on the moving sea and seed a few short impact rings.
import * as THREE from 'three';
import { LAYER_NEAR } from './sky.js';

export function createSpray(scene) {
  const MAX=900;
  const pos=new Float32Array(MAX*3).fill(-1000),vel=new Float32Array(MAX*3);
  const life=new Float32Array(MAX),lifespan=new Float32Array(MAX),sizes=new Float32Array(MAX),glowing=new Float32Array(MAX);
  let next=0,elapsed=0,sampleSurface=null,onSurfaceImpact=null;
  const sample={},geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  geo.setAttribute('aVelocity',new THREE.BufferAttribute(vel,3));
  geo.setAttribute('aLife',new THREE.BufferAttribute(life,1));
  geo.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  geo.setAttribute('aGlow',new THREE.BufferAttribute(glowing,1));
  const uniforms={uTint:{value:new THREE.Color(.5,.6,.65)},uBio:{value:0},uPx:{value:Math.min(window.devicePixelRatio||1,2)}};
  const mat=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,
    vertexShader:`attribute vec3 aVelocity;attribute float aLife;attribute float aSize;attribute float aGlow;uniform float uPx;
    varying float vLife;varying float vGlow;varying float vStretch;varying vec2 vDirection;varying float vNear;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
      vec3 projectedVelocity=mat3(viewMatrix)*aVelocity;
      vDirection=normalize(projectedVelocity.xy+vec2(.0001));
      vStretch=clamp(length(projectedVelocity.xy)*.13,1.,2.3);
      gl_PointSize=clamp(21./max(.2,-mv.z),.7,15.)*uPx*aSize;
      vNear=1.-smoothstep(14.,35.,-mv.z);vLife=aLife;vGlow=aGlow;
    }`,
    fragmentShader:`uniform vec3 uTint;uniform float uBio;
    varying float vLife;varying float vGlow;varying float vStretch;varying vec2 vDirection;varying float vNear;
    void main(){
      vec2 p=(gl_PointCoord-.5)*2.;
      vec2 along=vec2(dot(p,vec2(-vDirection.y,vDirection.x)),dot(p,vDirection));
      along.x*=vStretch;float r=dot(along,along);
      float birth=1.-smoothstep(.86,1.,vLife),fade=smoothstep(.0,.28,vLife);
      float alpha=exp(-r*4.2)*birth*fade*vNear*.55;
      if(r>1.||alpha<.006)discard;
      vec3 color=uTint+vec3(.01,.14,.44)*vGlow*uBio;
      gl_FragColor=vec4(color,alpha);
    }`
  });
  const pts=new THREE.Points(geo,mat);pts.frustumCulled=false;pts.layers.set(LAYER_NEAR);pts.renderOrder=4;scene.add(pts);

  function emit(x,y,z,vx,vy,vz,n,spread=.8){
    for(let i=0;i<n;i++){
      const j=next;next=(next+1)%MAX;
      pos[j*3]=x+(Math.random()-.5)*.1;pos[j*3+1]=y;pos[j*3+2]=z+(Math.random()-.5)*.1;
      vel[j*3]=vx+(Math.random()-.5)*spread;
      vel[j*3+1]=vy*(.58+Math.random()*.8);vel[j*3+2]=vz+(Math.random()-.5)*spread;
      life[j]=1;lifespan[j]=.48+Math.random()*.72;sizes[j]=.55+Math.pow(Math.random(),1.7)*.9;
      glowing[j]=Math.random()<.10?1:0;
    }
    geo.userData.dirty=true;
  }

  /** dt seconds; tint is local sky light; bio is the darkness-weighted effect. */
  function update(dt,tint,bio,time){
    elapsed=Number.isFinite(time)?time:elapsed+dt;
    let any=false,impacts=0;
    for(let j=0;j<MAX;j++){
      if(life[j]<=0)continue;any=true;
      const o=j*3,previousY=pos[o+1];
      // A little aerodynamic drag breaks up an identical ballistic spray arc.
      const drag=Math.exp(-dt*(.15+(1-sizes[j])*.25));
      vel[o]*=drag;vel[o+2]*=drag;vel[o+1]-=9.8*dt;
      pos[o]+=vel[o]*dt;pos[o+1]+=vel[o+1]*dt;pos[o+2]+=vel[o+2]*dt;
      life[j]-=dt/Math.max(.1,lifespan[j]);
      let surface=-1.5;
      if(sampleSurface&&vel[o+1]<0){sampleSurface(pos[o],pos[o+2],elapsed,sample);if(Number.isFinite(sample.h))surface=sample.h;}
      if((vel[o+1]<0&&pos[o+1]<surface)||life[j]<=0){
        if(onSurfaceImpact&&life[j]>.15&&previousY>=surface&&impacts<2&&Math.random()<.12){onSurfaceImpact(pos[o],pos[o+2],elapsed,.008+sizes[j]*.006);impacts++;}
        life[j]=0;pos[o+1]=-1000;
      }
    }
    if(any||geo.userData.dirty){
      for(const attribute of ['position','aVelocity','aLife','aSize','aGlow'])geo.attributes[attribute].needsUpdate=true;
      geo.userData.dirty=any;
    }
    uniforms.uTint.value.setRGB(...tint.map((v,i)=>Math.min(1,v*1.3+[.03,.035,.045][i])));
    uniforms.uBio.value=bio;
  }
  return {emit,update,
    setSurfaceSampler(sampleFn,impactFn=null){sampleSurface=sampleFn;onSurfaceImpact=impactFn;}
  };
}
