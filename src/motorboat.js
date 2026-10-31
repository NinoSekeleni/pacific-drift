// Tidewater's 8.2 m procedural Downeast hull, adapted to Three.js/WebGL. MIT notice shipped.
// Geometry is built by Tidewater's GeoKit builders; materials are the WebGL port in
// launch-materials.js. The model sits half a turn round so its bow points along Pacific Drift's -Z.
import * as T from 'three';
import {GeoKit} from './vendor/tidewater/boat/GeoKit.js';
import {HullLines} from './vendor/tidewater/boat/HullLines.js';
import {buildHull} from './vendor/tidewater/boat/HullBuilder.js';
import {buildWheelhouse,wheelGeometry,throttleGeometry,radarArrayGeometry} from './vendor/tidewater/boat/Wheelhouse.js';
import {buildDeckGear} from './vendor/tidewater/boat/DeckGear.js';
import {propellerGeometry,rudderGeometry,PROP,RUDDER} from './vendor/tidewater/boat/Running.js';
import {createLaunchMaterials} from './launch-materials.js';
import {LAYER_NEAR} from './sky.js';

const RADAR_RATE = 2.513;   // 24 rpm
const THROTTLE_ANGLE = .6;  // lever travel (rad) from neutral to full
const WHEEL_TURNS = .75;    // wheel turns from centre to hard over

export function createMotorboat({low=false,base='./'}={}){
 const root=new T.Group(),body=new T.Group(),L=new HullLines(),kit=new GeoKit(),parts={},meshes=[];
 buildHull(kit,L);buildWheelhouse(kit,L,parts);buildDeckGear(kit,L,parts);root.add(body);body.rotation.y=Math.PI;
 const finish=createLaunchMaterials(L,{low}),u=finish.uniforms;
 if(parts.flagPivot)u.uFlagPivot.value.copy(parts.flagPivot);
 for(const [name]of kit.buckets){const geo=kit.merged(name);if(!geo)continue;const mesh=new T.Mesh(geo,finish.get(name));mesh.name='launch '+name;if(name==='glass'){mesh.renderOrder=2;mesh.castShadow=false;}body.add(mesh);meshes.push(mesh);}
 function part(geo,position,name){const mesh=new T.Mesh(geo,finish.get('fittings'));mesh.name=name;mesh.position.copy(position);body.add(mesh);return mesh;}
 const wheel=part(wheelGeometry(),parts.wheelCenter,'wheel');wheel.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),parts.wheelAxis);const wheelBase=wheel.quaternion.clone();
 const throttle=part(throttleGeometry(),parts.throttlePivot,'throttle'),radar=part(radarArrayGeometry(),parts.radarPivot,'radar'),prop=part(propellerGeometry(),PROP.position,'propeller'),rudder=part(rudderGeometry(),RUDDER.pivot,'rudder');
 // Working lights: a deck flood on the wheelhouse roof and a cabin dome light, both switchable.
 const flood=new T.SpotLight(0xfff1d6,0,14,.9,.55,1.6);flood.position.set(0,2.55,-.6);flood.target.position.set(0,.3,-2.6);body.add(flood,flood.target);
 const dome=new T.PointLight(0xffe6b8,0,3.2,1.8);dome.position.set(0,2.2,.42);body.add(dome);
 // Garments on the wheelhouse hooks: supplied models (Magnific, generated for this game) replace the
 // procedural shapes once both have loaded; the procedural pair stays if either is missing.
 const garments=meshes.find(m=>m.name==='launch garments');
 if(GARMENT_MODELS_SUPPLIED&&parts.coatHooks?.length===2)loadGarments(base,parts.coatHooks).then(list=>{if(!list)return;if(garments)garments.visible=false;for(const g of list){g.traverse(o=>{o.layers.set(LAYER_NEAR);if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});body.add(g);}});
 root.name='Tidewater · 8.2 m fishing launch';root.traverse(o=>{o.layers.set(LAYER_NEAR);if(o.isMesh){o.castShadow=o.name!=='launch glass';o.receiveShadow=true;}});
 flood.layers.enableAll();dome.layers.enableAll();
 const halfLength=Math.max(Math.abs(L.zAft),Math.abs(L.zBow)),profile=Array.from({length:65},(_,i)=>{const z=-(i/64*2-1)*halfLength,t=L.tAtSheerZ(z);return new T.Vector2(z<L.zAft||z>L.zBow?.005:Math.max(.01,L.sheerX(t)),L.sheerY(t));});
 const axis=new T.Vector3(0,0,1),spin=new T.Quaternion();let sweep=0;
 return{root,lines:L,halfLength,halfBeam:1.4,profile,eye:new T.Vector3(.55,1.85,-.3),surfaces:meshes,uniforms:u,parts,
  /** speed m/s, steer -1..1, throttle -0.5..1, state from the instruments. */
  update(dt,speed,steer,throttleValue,{radarOn=true,time=0,night=0,wet=0,wind=5,flagDir=null,floodOn=false,domeOn=false}={}){
   if(radarOn){sweep=(sweep+dt*RADAR_RATE)%(Math.PI*2);radar.rotation.y=sweep;}
   prop.rotation.z+=dt*speed*12;rudder.rotation.y=steer*RUDDER.maxAngle;
   wheel.quaternion.copy(wheelBase).multiply(spin.setFromAxisAngle(axis,-steer*WHEEL_TURNS*Math.PI*2));
   throttle.rotation.x=throttleValue*THROTTLE_ANGLE;
   u.uBoatTime.value=time;u.uBoatNight.value=night;u.uBoatWet.value=wet;u.uBoatWind.value=wind;u.uRadarSweep.value=sweep;
   if(flagDir)u.uFlagDir.value.copy(flagDir);
   flood.intensity=floodOn?8*(0.25+night*.75):0;dome.intensity=domeOn?1.6*(0.3+night*.7):0;
  }};
}

// Each model is scaled to a hanging length, turned to face into the wheelhouse with its back to the
// port wall, and hung so the top of its hanger meets the hook.
// Set once public/models holds both files, so the game does not request missing models.
export const GARMENT_MODELS_SUPPLIED=false;
const GARMENTS=[{file:'garment-oilskin.glb',length:.86},{file:'garment-lifejacket.glb',length:.62}];
async function loadGarments(base,hooks){
 try{
  const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');const loader=new GLTFLoader();
  const scenes=await Promise.all(GARMENTS.map(g=>loader.loadAsync(base+'models/'+g.file).then(r=>r.scene)));
  return scenes.map((scene,i)=>{
   const hook=hooks[i],holder=new T.Group();holder.name='garment '+GARMENTS[i].file;
   scene.traverse(o=>{if(o.isMesh&&o.material){o.material.roughness=Math.max(o.material.roughness??.6,i===0?.42:.7);o.material.metalness=0;}});
   const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3()),k=GARMENTS[i].length/Math.max(.01,size.y);
   scene.scale.setScalar(k);scene.rotation.y=-Math.PI/2;holder.add(scene);holder.updateMatrixWorld(true);
   const b=new T.Box3().setFromObject(holder),c=b.getCenter(new T.Vector3());
   // back of the garment against the wall, centred on the hook, top of the hanger at the hook
   holder.position.set(hook.x+.05-.012-b.max.x,hook.y+.02-b.max.y,hook.z-c.z);
   return holder;
  });
 }catch(e){return null;}
}
