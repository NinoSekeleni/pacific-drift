import * as THREE from 'three';
import {LAYER_NEAR} from './sky.js';
// Small, local contact terms supplement directional/lantern shadows under
// diffuse sky light. They follow the measured support, not a global deck plane.
export function createBoatGrounding(parent){
 const geometry=new THREE.PlaneGeometry(1,1),entries=new Map(),inverse=new THREE.Matrix4(),box=new THREE.Box3();
 function fit(id,root,contact){
  let entry=entries.get(id);if(!entry){
   const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,uniforms:{uOpacity:{value:.18}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float uOpacity;void main(){vec2 p=(vUv-.5)*2.;float a=exp(-dot(p,p)*3.)*(1.-smoothstep(.65,1.,length(p)));gl_FragColor=vec4(.005,.009,.011,a*uOpacity);}'});
   const shadow=new THREE.Mesh(geometry,material);shadow.name=id+' contact';shadow.rotation.x=-Math.PI/2;shadow.layers.set(LAYER_NEAR);shadow.userData.pickIgnore=true;parent.add(shadow);entry={shadow,strap:null};entries.set(id,entry);
  }
  parent.updateWorldMatrix(true,false);root.updateWorldMatrix(true,true);inverse.copy(parent.matrixWorld).invert();box.makeEmpty();root.traverse(o=>{if(!o.isMesh||o.userData.pickIgnore)return;o.geometry.computeBoundingBox();box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld)));});
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());entry.shadow.position.set(center.x,contact.deckY+.002,center.z);entry.shadow.scale.set(size.x*1.3,size.z*1.2,1);
  if(id==='backpack'){
   if(entry.strap){parent.remove(entry.strap);entry.strap.geometry.dispose();entry.strap.material.dispose();}
   const x=center.x,z=center.z,halfX=size.x*.51,y=box.max.y+.004,floor=contact.deckY+.008;
   const path=new THREE.CatmullRomCurve3([new THREE.Vector3(x-halfX-.025,floor,z),new THREE.Vector3(x-halfX,y-.10,z),new THREE.Vector3(x,y,z),new THREE.Vector3(x+halfX,y-.10,z),new THREE.Vector3(x+halfX+.025,floor,z)]);
   const material=new THREE.MeshStandardMaterial({color:0x555044,roughness:.96});const verts=[],idx=[],steps=28;
   for(let i=0;i<=steps;i++){const p=path.getPoint(i/steps);verts.push(p.x,p.y,p.z-.012,p.x,p.y,p.z+.012);if(i){const a=(i-1)*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(idx);geo.computeVertexNormals();material.side=THREE.DoubleSide;
   entry.strap=new THREE.Mesh(geo,material);entry.strap.name='Backpack securing webbing';entry.strap.layers.set(LAYER_NEAR);entry.strap.castShadow=true;entry.strap.receiveShadow=true;parent.add(entry.strap);
  }
 }
 return{fit,visible(id,value){const e=entries.get(id);if(e){e.shadow.visible=value;if(e.strap)e.strap.visible=value;}}};
}
