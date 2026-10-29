import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LAYER_NEAR} from './sky.js';
import {createBoatMaterial} from './boat-materials.js';
import {mapLimit,loadPackedModel} from './asset-loading.js';
import {createWalkmanDisplay} from './walkman-display.js';
import {prepareTapeTransport,advanceTape,applyTapePose} from './tape-transport.js';
export const PROP_LAYOUT={
 backpack:{file:'backpack.glb',height:.56,x:-.39,z:-.18,rotation:[0,0,0]},
 radio:{file:'handheld-radio.glb',height:.28,x:.44,z:.76,rotation:[-Math.PI/2,-.24,0]},
 walkman:{file:'walkman.glb',height:.13,x:.21,z:.76,rotation:[-Math.PI/2,.25,0]},
 anbernic:{file:'anbernic.glb',height:.117,x:-.19,z:-.66,rotation:[-Math.PI/2,0,0]},
 gps:{file:'gps-tablet.glb',height:.29,x:-.10,z:.76,rotation:[-Math.PI/6,0,0],mountHeight:.018},
 binoculars:{file:'binoculars.glb',height:.06,x:-.40,z:.74,rotation:[0,.24,0]}
};
export function placeBoatProp(root,spec,supportY){
 root.rotation.set(...spec.rotation,'YXZ');root.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const offsets=[[-size.x*.35,-size.z*.35],[size.x*.35,-size.z*.35],[-size.x*.35,size.z*.35],[size.x*.35,size.z*.35],[0,0]];
 const deck=Math.max(...offsets.map(([x,z])=>supportY(spec.x+x,spec.z+z))),support=deck+(spec.mountHeight||0);
 root.position.set(spec.x-center.x,support-bounds.min.y+.003,spec.z-center.z);
 return {size:size.toArray(),contact:{deckY:deck,supportY:support,bottomY:support+.003,x:spec.x,z:spec.z}};
}
// Fixed to the bench; the tablet itself remains a separate inspectable item.
export function createGPSCradle(spec,contact){
 const group=new THREE.Group();group.name='GPS bench holder';group.position.set(spec.x,contact.deckY,spec.z);
 const material=new THREE.MeshStandardMaterial({color:0x263139,roughness:.85,metalness:.12});
 const part=(w,h,d,x,y,z,angle=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.rotation.x=angle;mesh.layers.set(LAYER_NEAR);group.add(mesh);};
 part(.205,.018,.15,0,.009,0);
 part(.15,.14,.012,0,.083,-.041,-Math.PI/6);
 part(.18,.021,.012,0,.028,.065);
 return group;
}
// Invisible fallback meshes and light sprites must never enlarge an item's pick target.
export function visibleItemBounds(root,out=new THREE.Box3()){
 out.makeEmpty();root.updateWorldMatrix(true,true);
 root.traverseVisible(o=>{if(!o.isMesh||!o.geometry)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();if(o.geometry.boundingBox)out.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));});
 return out;
}
export function createBoatProps(canoe,{base='./',onInspect=()=>{},onAsset=()=>{},register=()=>{},gps=null,anbernic=null}={}){
 const loader=new GLTFLoader(),ray=new THREE.Raycaster();ray.layers.enableAll();
 const group=new THREE.Group();group.name='Onboard equipment';canoe.group.add(group);
 const roots={},surfaces=[],state={ready:0,failed:[],dimensions:{},contacts:{}};const stowed=new Set();let wet=0,display=null;const tapeState={phase:0};
 function supportY(x,z){
  canoe.group.updateMatrixWorld(true);
  const origin=new THREE.Vector3(x,3,z).applyMatrix4(canoe.group.matrixWorld),down=new THREE.Vector3(0,-1,0).transformDirection(canoe.group.matrixWorld);
  ray.set(origin,down);const hit=ray.intersectObjects(canoe.surfaceMeshes,false)[0];
  return hit?canoe.group.worldToLocal(hit.point.clone()).y:.115;
 }
 function fit(name,root){
  const spec=PROP_LAYOUT[name],materials=new Map();root.name=name;
  if(name==='walkman'){prepareTapeTransport(root);display=createWalkmanDisplay(root);}
  if(name==='gps')gps?.attachScreen(root);
  if(name==='anbernic')anbernic?.attachScreen(root);
  onAsset(name,root.clone(true));const placement=placeBoatProp(root,spec,supportY);
  root.traverse(o=>{
   o.layers.set(LAYER_NEAR);if(!o.isMesh)return;
   const prepare=source=>{
    if(!materials.has(source.uuid)){
     const material=createBoatMaterial(source);material.name=name+' — '+source.name;material.normalScale?.set(.45,.45);
     const roughness=name==='backpack'?Math.max(.75,material.roughness):material.roughness;
     material.roughness=roughness;if(Number.isFinite(roughness))surfaces.push({material,roughness,factor:name==='backpack'?.10:.25});materials.set(source.uuid,material);
    }return materials.get(source.uuid);
   };o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
  });
  if(name==='gps'){const cradle=createGPSCradle(spec,placement.contact);group.add(cradle);register(cradle);}
  root.visible=!stowed.has(name);group.add(root);roots[name]=root;register(root);state.ready++;
  state.dimensions[name]=placement.size;state.contacts[name]=placement.contact;
 }
 const order=['gps','radio','walkman','binoculars','backpack','anbernic'];
 const loading=mapLimit(order.map(name=>[name,PROP_LAYOUT[name]]),2,async([name,spec])=>{
  try{const gltf=await loadPackedModel(loader,base+'models/'+spec.file);fit(name,gltf.scene);}
  catch(error){state.failed.push(name);console.warn('Supplied '+name+' unavailable',error);}
 });
 const bounds=new THREE.Box3(),hit=new THREE.Vector3(),pointer=new THREE.Vector2();
 function pick(camera,x,y,width,height){
  group.updateWorldMatrix(true,true);pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);
  const candidates=[];
  for(const [name,root]of Object.entries(roots)){
   if(!root.visible||stowed.has(name))continue;bounds.setFromObject(root).expandByScalar(.016);
   if(ray.ray.intersectBox(bounds,hit)&&camera.position.distanceTo(hit)<3.2)candidates.push({name,distance:camera.position.distanceTo(hit)});
  }
  if(canoe.lantern.visible){visibleItemBounds(canoe.lantern,bounds).expandByScalar(.012);if(ray.ray.intersectBox(bounds,hit)&&camera.position.distanceTo(hit)<3.2)candidates.push({name:'lantern',distance:camera.position.distanceTo(hit)});}
  candidates.sort((a,b)=>a.distance-b.distance);const first=candidates[0];if(!first)return null;
  const obstruction=ray.intersectObjects(canoe.surfaceMeshes,false)[0];return obstruction&&obstruction.distance<first.distance-.035?null:first.name;
 }
 function interact(camera,x,y,width,height){const name=pick(camera,x,y,width,height);if(!name)return false;onInspect(name);return true;}
 return {group,loading,state,interact,pick,tapeState,getRoot:name=>roots[name],
  setStowed(name,value){if(!['walkman','binoculars','radio','anbernic'].includes(name))return;if(value)stowed.add(name);else stowed.delete(name);if(roots[name])roots[name].visible=!value;},isStowed:name=>stowed.has(name),
  update(dt,rain=0,media={}){display?.update(media);anbernic?.applyFinish(roots.anbernic);advanceTape(tapeState,dt,media);applyTapePose(roots.walkman,tapeState);wet+=(Math.min(1,rain)-wet)*(1-Math.exp(-dt/12));for(const s of surfaces)s.material.roughness=s.roughness*(1-wet*s.factor);}
 };
}
