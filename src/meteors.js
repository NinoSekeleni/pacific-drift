// A brief atmospheric event rendered as one soft luminous ribbon. No image asset.
import * as THREE from 'three';
import {LAYER_FAR,CLOUD_LOOKUP_GLSL} from './sky.js';

export function createMeteors(scene){
  const positions=new Float32Array(12);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,0,1,1],2));
  geometry.setIndex([0,2,1,1,2,3]);
  const clearClouds=new THREE.DataTexture(new Uint8Array(4),1,1,THREE.RGBAFormat);clearClouds.needsUpdate=true;
  const uniforms={uOpacity:{value:0},uCloud:{value:0},tClouds:{value:clearClouds}};
  const material=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    vertexShader:`varying vec2 vUv;varying vec3 vDir;void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vDir=normalize(wp.xyz-cameraPosition);gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader:CLOUD_LOOKUP_GLSL+`varying vec2 vUv;varying vec3 vDir;uniform float uOpacity;uniform float uCloud;
      void main(){
        float across=(vUv.y-.5)*2.;
        float core=exp(-across*across*22.);
        float glow=exp(-across*across*4.)*.20;
        float tail=pow(smoothstep(0.,1.,vUv.x),1.8);
        float head=exp(-pow((vUv.x-.985)/.035,2.));
        float alpha=(core*(tail*.7+head*.45)+glow*tail)*uOpacity*(1.-uCloud)*(1.-cloudsAt(normalize(vDir)).a);
        if(alpha<.004)discard;
        vec3 tint=mix(vec3(.40,.68,.92),vec3(1.,.97,.88),smoothstep(.4,1.,vUv.x));
        gl_FragColor=vec4(tint,alpha);
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.layers.set(LAYER_FAR);mesh.renderOrder=-7;mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);
  const start=new THREE.Vector3(),travel=new THREE.Vector3(),side=new THREE.Vector3(),direction=new THREE.Vector3(),head=new THREE.Vector3(),tail=new THREE.Vector3(),view=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  let active=false,age=0,duration=.9,wait=35+Math.random()*55,forced=false;
  function spawn(camera,preview=false){
    camera.getWorldDirection(view);
    const azimuth=Math.atan2(view.x,-view.z)+(preview?0:(Math.random()-.5)*1.35);
    const elevation=preview?Math.max(.32,Math.asin(THREE.MathUtils.clamp(view.y,-1,1))+.15):.35+Math.random()*.6;
    start.set(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),-Math.cos(azimuth)*Math.cos(elevation));
    // The event travels across the viewing hemisphere, with a shallow descent.
    travel.crossVectors(start,up).normalize().multiplyScalar(Math.random()<.5?1:-1);
    travel.y=-.20;travel.addScaledVector(start,-travel.dot(start)).normalize();
    side.crossVectors(start,travel).normalize();
    age=0;duration=.7+Math.random()*.45;active=true;forced=preview;mesh.visible=true;
    return true;
  }
  function update(dt,camera,{time=0,sunAltitude=-20,cloudCover=0,playing=true,enabled=true}={}){
    if(!enabled){active=false;mesh.visible=false;return;}
    const night=THREE.MathUtils.smoothstep(-sunAltitude,5,13);
    if(!active){
      if(!playing||night<.4||cloudCover>.7)return;
      wait-=dt;if(wait<=0)spawn(camera);else return;
    }
    age+=Math.max(0,dt);
    if(age>=duration || (!forced && (night<.1||cloudCover>.85))){active=false;mesh.visible=false;wait=70+Math.random()*150;return;}
    const progress=age/duration;
    const angle=(progress-.42)*.24;
    head.copy(start).multiplyScalar(Math.cos(angle)).addScaledVector(travel,Math.sin(angle)).normalize();
    const trailLength=.065*Math.sin(Math.min(1,progress*3)*Math.PI*.5);
    tail.copy(start).multiplyScalar(Math.cos(angle-trailLength)).addScaledVector(travel,Math.sin(angle-trailLength)).normalize();
    const width=.00085;
    for(let i=0;i<4;i++){
      direction.copy(i<2?tail:head).addScaledVector(side,(i%2===0?-1:1)*width*(i<2?.42:1));
      direction.normalize().multiplyScalar(7800).add(camera.position);
      positions[i*3]=direction.x;positions[i*3+1]=direction.y;positions[i*3+2]=direction.z;
    }
    geometry.attributes.position.needsUpdate=true;
    const attack=THREE.MathUtils.smoothstep(progress,0,.12),decay=1-THREE.MathUtils.smoothstep(progress,.55,1);
    uniforms.uOpacity.value=attack*decay*(forced?1:night)*.95;
    uniforms.uCloud.value=forced?0:THREE.MathUtils.clamp(cloudCover*.85,0,.9);
  }
  return {update,setCloudTexture(texture){uniforms.tClouds.value=texture||clearClouds;},preview(camera){return spawn(camera,true);},get active(){return active;}};
}
