import * as THREE from 'three';
const REFLECTION_LAYER=3;
export function createBoatReflections(renderer,scene,canoe,ocean,{mobile=false}={}){
 const target=new THREE.WebGLRenderTarget(mobile?192:384,mobile?192:384,{depthBuffer:true,stencilBuffer:false});target.texture.generateMipmaps=false;target.texture.minFilter=THREE.LinearFilter;
 const mirror=new THREE.PerspectiveCamera(),matrix=new THREE.Matrix4(),bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),clip=new THREE.Plane(new THREE.Vector3(0,1,0),0),forward=new THREE.Vector3(),up=new THREE.Vector3(),look=new THREE.Vector3(),clearColor=new THREE.Color();let next=0;
 ocean.uniforms.tBoatReflection.value=target.texture;ocean.uniforms.uBoatReflectionMatrix.value=matrix;
 function update(camera,time,{enabled=true}={}){
  if(!enabled){ocean.uniforms.uBoatReflection.value=0;return;}
  if(time<next)return;next=time+(mobile?1/12:1/24);ocean.uniforms.uBoatReflection.value=1;
  canoe.group.traverse(o=>{if(o.isMesh||o.isSprite||o.isLight)o.layers.enable(REFLECTION_LAYER);});
  mirror.copy(camera);mirror.layers.set(REFLECTION_LAYER);mirror.far=80;mirror.updateProjectionMatrix();const height=canoe.heave||0;
  forward.set(0,0,-1).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);look.copy(camera.position).add(forward);look.y=2*height-look.y;mirror.position.copy(camera.position);mirror.position.y=2*height-camera.position.y;mirror.up.set(up.x,-up.y,up.z);mirror.lookAt(look);mirror.updateMatrixWorld(true);matrix.copy(bias).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);clip.constant=-height;
  const previous=renderer.getRenderTarget(),planes=renderer.clippingPlanes,alpha=renderer.getClearAlpha();renderer.getClearColor(clearColor);
  try{renderer.clippingPlanes=[clip];renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,mirror);}
  finally{renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,alpha);renderer.clippingPlanes=planes;}
 }
 return {update,dispose(){target.dispose();},get camera(){return mirror;}};
}
