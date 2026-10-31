import * as THREE from 'three';
const REFLECTION_LAYER=3;
export function reflectionTargetSize(aspect,mobile=false){const edge=mobile?320:512,a=Math.max(.25,Math.min(4,aspect||1));return a>=1?[edge,Math.max(64,Math.round(edge/a))]:[Math.max(64,Math.round(edge*a)),edge];}
export function createBoatReflections(renderer,scene,canoe,ocean,{mobile=false}={}){
 const target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false,samples:mobile?0:2});target.texture.generateMipmaps=false;target.texture.minFilter=target.texture.magFilter=THREE.LinearFilter;
 const mirror=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),clip=new THREE.Plane(new THREE.Vector3(0,1,0),0),forward=new THREE.Vector3(),up=new THREE.Vector3(),look=new THREE.Vector3(),clearColor=new THREE.Color();
 ocean.uniforms.tBoatReflection.value=target.texture;ocean.uniforms.uBoatReflectionMatrix.value=matrix;
 ocean.uniforms.uBoatReflectionTexel??={value:new THREE.Vector2(1,1)};
 function update(camera,time,{enabled=true}={}){
  if(!enabled||camera.position.distanceTo(canoe.group.position)>130){ocean.uniforms.uBoatReflection.value=0;return;}
  ocean.uniforms.uBoatReflection.value=1;
  const [width,height]=reflectionTargetSize(camera.aspect,mobile);if(target.width!==width||target.height!==height){target.setSize(width,height);ocean.uniforms.uBoatReflectionTexel.value.set(1/width,1/height);}
  canoe.group.traverse(o=>{if(o.isMesh||o.isSprite||o.isLight)o.layers.enable(REFLECTION_LAYER);});
  // Mean sea level stays fixed. Boat heave must not move the reflecting plane.
  mirror.copy(camera);mirror.layers.set(REFLECTION_LAYER);mirror.far=160;mirror.updateProjectionMatrix();
  forward.set(0,0,-1).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);look.copy(camera.position).add(forward);look.y=-look.y;mirror.position.copy(camera.position);mirror.position.y=-camera.position.y;mirror.up.set(up.x,-up.y,up.z);mirror.lookAt(look);mirror.updateMatrixWorld(true);matrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
  const previous=renderer.getRenderTarget(),planes=renderer.clippingPlanes,alpha=renderer.getClearAlpha();renderer.getClearColor(clearColor);
  try{renderer.clippingPlanes=[clip];renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,mirror);}
  finally{renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,alpha);renderer.clippingPlanes=planes;}
 }
 return {update,dispose(){target.dispose();},get camera(){return mirror;}};
}
