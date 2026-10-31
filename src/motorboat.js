// Tidewater's 8.2 m procedural Downeast hull, adapted to Three.js/WebGL. MIT notice shipped.
import * as T from 'three';
import {GeoKit} from './vendor/tidewater/boat/GeoKit.js';
import {HullLines} from './vendor/tidewater/boat/HullLines.js';
import {buildHull} from './vendor/tidewater/boat/HullBuilder.js';
import {buildWheelhouse,wheelGeometry,throttleGeometry,radarArrayGeometry} from './vendor/tidewater/boat/Wheelhouse.js';
import {buildDeckGear} from './vendor/tidewater/boat/DeckGear.js';
import {propellerGeometry,rudderGeometry,PROP,RUDDER} from './vendor/tidewater/boat/Running.js';
import {LAYER_NEAR} from './sky.js';
function material(name){const glass=name==='glass',m=new T.MeshStandardMaterial({vertexColors:true,roughness:glass?.12:.55,metalness:name==='fittings'?.65:.08,transparent:glass,opacity:glass?.18:1,depthWrite:!glass,side:T.DoubleSide});m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 aux;varying vec4 vBoatAux;').replace('#include <begin_vertex>','#include <begin_vertex>\nvBoatAux=aux;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 vBoatAux;').replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(vBoatAux.x,.15,1.);').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=vBoatAux.y;');};return m;}
export function createMotorboat(){const root=new T.Group(),body=new T.Group(),L=new HullLines(),kit=new GeoKit(),parts={},meshes=[];buildHull(kit,L);buildWheelhouse(kit,L,parts);buildDeckGear(kit,L,parts);root.add(body);body.rotation.y=Math.PI;const mats={};for(const [name]of kit.buckets){const geo=kit.merged(name);const m=mats[name]??=material(name);const mesh=new T.Mesh(geo,m);body.add(mesh);meshes.push(mesh);}
 function part(geo,position,name){const mesh=new T.Mesh(geo,mats.fittings??material('fittings'));mesh.position.copy(position);body.add(mesh);return mesh;}
 const wheel=part(wheelGeometry(),parts.wheelCenter,'wheel');wheel.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),parts.wheelAxis);const throttle=part(throttleGeometry(),parts.throttlePivot,'throttle'),radar=part(radarArrayGeometry(),parts.radarPivot,'radar'),prop=part(propellerGeometry(),PROP.position,'propeller'),rudder=part(rudderGeometry(),RUDDER.pivot,'rudder');
 root.name='Tidewater · 8.2 m fishing launch';root.traverse(o=>{o.layers.set(LAYER_NEAR);if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const halfLength=Math.max(Math.abs(L.zAft),Math.abs(L.zBow)),profile=Array.from({length:65},(_,i)=>{const z=-(i/64*2-1)*halfLength,t=L.tAtSheerZ(z);return new T.Vector2(z<L.zAft||z>L.zBow?.005:Math.max(.01,L.sheerX(t)),L.sheerY(t));});
 return{root,halfLength,halfBeam:1.4,profile,eye:new T.Vector3(.55,1.85,-.3),update(dt,speed,steer,thrust){radar.rotation.y+=dt*1.5;prop.rotation.z+=dt*speed*12;rudder.rotation.y=steer*.4;wheel.rotation.z=-steer*2.4;throttle.rotation.x=thrust*.45;},surfaces:meshes};}
