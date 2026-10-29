import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LAYER_NEAR} from './sky.js';
import {createBoatMaterial} from './boat-materials.js';

export const PROP_LAYOUT={
 backpack:{file:'backpack.glb',height:.56,x:-.39,z:-.18,rotation:[0,Math.PI,0]},
 radio:{file:'handheld-radio.glb',height:.28,x:.44,z:.76,rotation:[-Math.PI/2,-.24,0]}
};

export function placeBoatProp(root,spec,supportY){
 root.rotation.set(...spec.rotation,'YXZ');root.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const offsets=[[-size.x*.35,-size.z*.35],[size.x*.35,-size.z*.35],[-size.x*.35,size.z*.35],[size.x*.35,size.z*.35],[0,0]];
 const support=Math.max(...offsets.map(([x,z])=>supportY(spec.x+x,spec.z+z)));
 root.position.set(spec.x-center.x,support-bounds.min.y+.003,spec.z-center.z);
 return {size:size.toArray(),contact:{supportY:support,bottomY:support+.003,x:spec.x,z:spec.z}};
}

export function createBoatProps(canoe,{base='./',onRadio=()=>{},register=()=>{}}={}){
 const loader=new GLTFLoader(),ray=new THREE.Raycaster();ray.layers.enableAll();
 const group=new THREE.Group();group.name='Stowed backpack and radio';canoe.group.add(group);
 const roots={},surfaces=[],state={ready:0,failed:[],dimensions:{},contacts:{}};
 let wet=0;
 function supportY(x,z){
  canoe.group.updateMatrixWorld(true);
  const origin=new THREE.Vector3(x,3,z).applyMatrix4(canoe.group.matrixWorld),down=new THREE.Vector3(0,-1,0).transformDirection(canoe.group.matrixWorld);
  ray.set(origin,down);const hit=ray.intersectObjects(canoe.surfaceMeshes,false)[0];
  return hit?canoe.group.worldToLocal(hit.point.clone()).y:.115;
 }
 function fit(name,root){
  const spec=PROP_LAYOUT[name],materials=new Map();
  root.name=name==='radio'?'Handheld radio on starboard bench':'Backpack on port bench';
  const placement=placeBoatProp(root,spec,supportY);
  root.traverse(o=>{
   o.layers.set(LAYER_NEAR);
   if(!o.isMesh)return;
   const prepare=source=>{
    if(!materials.has(source.uuid)){
     const material=createBoatMaterial(source);material.name=name+' — supplied textures';material.normalScale?.set(.45,.45);
     const roughness=name==='backpack'?Math.max(.75,material.roughness):material.roughness;
     material.roughness=roughness;surfaces.push({material,roughness,factor:name==='backpack'?.10:.25});materials.set(source.uuid,material);
    }
    return materials.get(source.uuid);
   };
   o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
  });
  group.add(root);roots[name]=root;register(root);state.ready++;
  state.dimensions[name]=placement.size;state.contacts[name]=placement.contact;
 }
 const loading=Promise.all(Object.entries(PROP_LAYOUT).map(async([name,spec])=>{
  try{const gltf=await loader.loadAsync(base+'models/'+spec.file);fit(name,gltf.scene);}
  catch(error){state.failed.push(name);console.warn('Supplied '+name+' unavailable',error);}
 }));
 const bounds=new THREE.Box3(),hit=new THREE.Vector3(),pointer=new THREE.Vector2();
 function interact(camera,x,y,width,height){
  if(!roots.radio)return false;
  group.updateWorldMatrix(true,true);bounds.setFromObject(roots.radio).expandByScalar(.018);
  pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);
  if(ray.ray.intersectBox(bounds,hit)&&camera.position.distanceTo(hit)<3.0){onRadio();return true;}
  return false;
 }
 return {group,loading,state,interact,update(dt,rain=0){wet+=(Math.min(1,rain)-wet)*(1-Math.exp(-dt/12));for(const s of surfaces)s.material.roughness=s.roughness*(1-wet*s.factor);}};
}
