import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {LAYER_NEAR} from './sky.js';
import {createBoatMaterial} from './boat-materials.js';
import {createBoatGrounding} from './boat-grounding.js';
import {mapLimit,loadPackedModel} from './asset-loading.js';
import {createWalkmanDisplay} from './walkman-display.js';
import {prepareTapeTransport,advanceTape,applyTapePose} from './tape-transport.js';
export const PROP_LAYOUT={
 backpack:{file:'backpack.glb',height:.56,x:-.36,z:-.65,rotation:[0,0,0]},
 radio:{file:'handheld-radio.glb',height:.28,x:.44,z:.76,rotation:[-Math.PI/2,-.24,0]},
 walkman:{file:'walkman.glb',height:.13,x:.21,z:.76,rotation:[-Math.PI/2,.25,0]},
 anbernic:{file:'anbernic.glb',height:.117,x:.20,z:-.66,rotation:[-Math.PI/2,0,0]},
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
// The angled holder follows the separately inspectable tablet.
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
export function createBoatProps(canoe,{base='./',onInspect=()=>{},onAsset=()=>{},register=()=>{},gps=null,anbernic=null,layout={},onMove=()=>{}}={}){
 const loader=new GLTFLoader(),ray=new THREE.Raycaster();ray.layers.enableAll();
 const group=new THREE.Group();group.name='Onboard equipment';canoe.group.add(group);
 const grounding=createBoatGrounding(canoe.group),heldMeshes=new Map();
 const roots={},cradles={},surfaces=[],state={ready:0,failed:[],dimensions:{},contacts:{}};const stowed=new Set();let wet=0,display=null;const tapeState={phase:0};
 function supportY(x,z){
  canoe.group.updateMatrixWorld(true);
  const origin=new THREE.Vector3(x,3,z).applyMatrix4(canoe.group.matrixWorld),down=new THREE.Vector3(0,-1,0).transformDirection(canoe.group.matrixWorld);
  ray.set(origin,down);const hit=ray.intersectObjects(canoe.surfaceMeshes,false).find(h=>canoe.group.worldToLocal(h.point.clone()).y<.7);
  return hit?canoe.group.worldToLocal(hit.point.clone()).y:.115;
 }
 function fit(name,root){
  const spec=PROP_LAYOUT[name],materials=new Map();root.name=name;
  if(name==='walkman'){prepareTapeTransport(root);display=createWalkmanDisplay(root);}
  if(name==='gps')gps?.attachScreen(root);
  if(name==='anbernic')anbernic?.attachScreen(root);
  onAsset(name,root.clone(true));const placement=placeBoatProp(root,spec,supportY);
  root.traverse(o=>{
   o.layers.set(LAYER_NEAR);if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
   const prepare=source=>{
    if(!materials.has(source.uuid)){
     const material=createBoatMaterial(source);material.name=name+' — '+source.name;material.normalScale?.set(.45,.45);
     const roughness=name==='backpack'?Math.max(.75,material.roughness):material.roughness;
     material.roughness=roughness;if(Number.isFinite(roughness))surfaces.push({material,roughness,factor:name==='backpack'?.10:.25});materials.set(source.uuid,material);
    }return materials.get(source.uuid);
   };o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
  });
  if(name==='gps'){const cradle=createGPSCradle(spec,placement.contact);group.add(cradle);cradles[name]=cradle;register(cradle);}
  root.visible=!stowed.has(name);group.add(root);roots[name]=root;register(root);state.ready++;
  state.dimensions[name]=placement.size;state.contacts[name]=placement.contact;grounding.fit(name,root,placement.contact);
  if(layout[name])move(name,layout[name].x,layout[name].z,layout[name].yaw,false);
 }
 const order=['gps','radio','walkman','binoculars','backpack','anbernic'];
 if(layout.lantern)move('lantern',layout.lantern.x,layout.lantern.z,layout.lantern.yaw,false);
 const loading=mapLimit(order.map(name=>[name,PROP_LAYOUT[name]]),2,async([name,spec])=>{
  try{const gltf=await loadPackedModel(loader,base+'models/'+spec.file);fit(name,gltf.scene);}
  catch(error){state.failed.push(name);console.warn('Supplied '+name+' unavailable',error);}
 });
 const pointer=new THREE.Vector2();
 function pick(camera,x,y,width,height){
  group.updateWorldMatrix(true,true);pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);
  const candidates=[];
  for(const [name,root]of Object.entries({...roots,lantern:canoe.lantern})){
   if(!root.visible||stowed.has(name))continue;
   const meshes=[];root.traverseVisible(o=>{if(o.isMesh&&!o.userData.pickIgnore)meshes.push(o);});
   const h=ray.intersectObjects(meshes,false)[0];if(h&&h.distance<3.2)candidates.push({name,distance:h.distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);const first=candidates[0];if(!first)return null;
  const obstruction=ray.intersectObjects(canoe.surfaceMeshes,false)[0];return obstruction&&obstruction.distance<first.distance-.035?null:first.name;
 }
 let vesselRowPoses=null;
 let highlighted=null;const originalEmissive=new Map();
 function highlight(name){if(name===highlighted)return;for(const [mat,entry]of originalEmissive){mat.emissive.copy(entry.color);mat.emissiveIntensity=entry.intensity;}originalEmissive.clear();highlighted=name;const root=name==='lantern'?canoe.lantern:roots[name];root?.traverseVisible(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m.emissive||originalEmissive.has(m))continue;originalEmissive.set(m,{color:m.emissive.clone(),intensity:m.emissiveIntensity});m.emissive.set(0x6b9da8);m.emissiveIntensity=.32;}});}
 function move(name,x,z,yaw=0,notify=true){
  const root=name==='lantern'?canoe.lantern:roots[name];if(!root)return false;
  const oldPosition=root.position.clone(),oldRotation=root.rotation.clone();root.position.set(0,0,0);root.rotation.y=yaw;
  root.updateWorldMatrix(true,true);const local=new THREE.Box3(),inverse=canoe.group.matrixWorld.clone().invert();root.traverseVisible(o=>{if(!o.isMesh||!o.geometry)return;o.geometry.computeBoundingBox();local.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld)));});const size=local.getSize(new THREE.Vector3()),center=local.getCenter(new THREE.Vector3());
  const halfX=size.x/2,halfZ=size.z/2;
  const motor=!!canoe.group.userData.motor;
  let valid=motor?(Math.abs(x)+halfX<1.15&&z-halfZ>.55&&z+halfZ<3.6):Math.abs(z)+halfZ<2.05;
  // Keep the complete footprint within the tapered hull, clear of the gunwales.
  if(!motor)for(const dz of [-halfZ,halfZ]){const maxWidth=.55*Math.sqrt(Math.max(0,1-Math.pow((z+dz)/2.25,2)));valid&&=Math.abs(x)+halfX<maxWidth;}
  const deck=Math.max(...[[0,0],[-halfX*.7,-halfZ*.7],[halfX*.7,-halfZ*.7],[-halfX*.7,halfZ*.7],[halfX*.7,halfZ*.7]].map(([dx,dz])=>supportY(x+dx,z+dz)));valid&&=deck<.7&&Number.isFinite(deck);
  root.position.set(x-center.x,deck+(name==='gps'?.018:0)-local.min.y+.003,z-center.z);root.updateWorldMatrix(true,true);
  const moved=visibleItemBounds(root).expandByScalar(-.004);
  for(const [id,other]of Object.entries({...roots,lantern:canoe.lantern})){if(id===name||!other.visible)continue;if(moved.intersectsBox(visibleItemBounds(other)))valid=false;}
  if(!valid){root.position.copy(oldPosition);root.rotation.copy(oldRotation);root.updateWorldMatrix(true,true);return false;}
  if(cradles[name])cradles[name].position.set(x,deck,z);
  state.contacts[name]={deckY:deck,x,z};grounding.fit(name,root,state.contacts[name]);if(notify)onMove(name,{x,z,yaw});return true;
 }
 function dragPoint(camera,x,y,width,height){pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);const localRay=ray.ray.clone().applyMatrix4(canoe.group.matrixWorld.clone().invert());return localRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-(canoe.group.userData.motor?.36:.3)),new THREE.Vector3());}
 function interact(camera,x,y,width,height){const name=pick(camera,x,y,width,height);if(!name)return false;onInspect(name);return true;}
 async function setVessel(motor){await loading;const layout={backpack:[-.55,2.8],radio:[.65,1.6],walkman:[.35,1.6],gps:[0,1.6],binoculars:[-.5,1.6],anbernic:[.1,2.8]};
 if(motor){if(!vesselRowPoses)vesselRowPoses=Object.fromEntries(Object.entries(roots).map(([id,r])=>[id,{position:r.position.clone(),rotation:r.rotation.clone(),contact:{...state.contacts[id]},cradle:cradles[id]?.position.clone()}]));for(const [id,[x,z]]of Object.entries(layout)){const root=roots[id];if(!root)continue;move(id,x,z,root.rotation.y,false);}}
 else if(vesselRowPoses){for(const [id,p]of Object.entries(vesselRowPoses)){roots[id].position.copy(p.position);roots[id].rotation.copy(p.rotation);state.contacts[id]={...p.contact};if(p.cradle)cradles[id].position.copy(p.cradle);grounding.fit(id,roots[id],p.contact);}vesselRowPoses=null;}}
 return {group,loading,state,setVessel,attachCustom(name,root){roots[name]=root;},interact,pick,highlight,move,dragPoint,tapeState,getRoot:name=>name==='lantern'?canoe.lantern:roots[name],
  setHeld(name,value){const root=name==='lantern'?canoe.lantern:roots[name];if(!root)return;if(value&&!heldMeshes.has(name)){const values=[];root.traverse(o=>{if(o.isMesh||o.isSprite){values.push([o,o.visible]);o.visible=false;}});heldMeshes.set(name,values);grounding.visible(name,false);}else if(!value&&heldMeshes.has(name)){for(const [o,visible]of heldMeshes.get(name))o.visible=visible;heldMeshes.delete(name);grounding.visible(name,!stowed.has(name));}},
  setStowed(name,value){if(!['walkman','binoculars','radio','anbernic'].includes(name))return;if(value)stowed.add(name);else stowed.delete(name);if(roots[name])roots[name].visible=!value;grounding.visible(name,!value);},isStowed:name=>stowed.has(name),
  update(dt,rain=0,media={}){display?.update(media);anbernic?.applyFinish(roots.anbernic);advanceTape(tapeState,dt,media);applyTapePose(roots.walkman,tapeState);wet+=(Math.min(1,rain)-wet)*(1-Math.exp(-dt/12));for(const s of surfaces)s.material.roughness=s.roughness*(1-wet*s.factor);}
 };
}
