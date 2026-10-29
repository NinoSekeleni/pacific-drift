import assert from 'node:assert/strict';
import * as THREE from 'three';import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {lcdSurface,displayLines} from '../src/walkman-display.js';import {binocularFov} from '../src/binoculars.js';import {inspectionObject,EQUIPMENT} from '../src/equipment-inspection.js';import {PROP_LAYOUT,visibleItemBounds} from '../src/boat-props.js';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('public/models/walkman.glb');
function objectFromNode(n){const root=new THREE.Group();new THREE.Matrix4().fromArray(n.getMatrix()).decompose(root.position,root.quaternion,root.scale);
 for(const p of n.getMesh()?.listPrimitives()||[]){const g=new THREE.BufferGeometry();for(const [sem,name]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){const a=p.getAttribute(sem);if(a)g.setAttribute(name,new THREE.BufferAttribute(a.getArray(),a.getElementSize()));}if(p.getIndices())g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(),1));const m=new THREE.MeshStandardMaterial();m.name=p.getMaterial()?.getName()||'';root.add(new THREE.Mesh(g,m));}for(const c of n.listChildren())root.add(objectFromNode(c));return root;}
const raw=new THREE.Group();for(const n of doc.getRoot().listScenes()[0].listChildren())raw.add(objectFromNode(n));
const corners=lcdSurface(raw);assert.equal(corners?.length,4,'live LCD must lie on the actual supplied surface');
for(const corner of corners)assert.ok(corner.toArray().every(Number.isFinite));
const screenBox=new THREE.Box3().setFromPoints(corners),screenSize=screenBox.getSize(new THREE.Vector3());assert.ok(screenSize.x>.02&&screenSize.x<.07);assert.ok(screenSize.y>.005&&screenSize.y<.04);assert.ok(screenSize.z<.002,'display must be flush to its planar original screen');
const before=new THREE.Box3().setFromObject(raw),clone=inspectionObject(raw,null),after=new THREE.Box3().setFromObject(raw);assert.ok(before.equals(after),'inspection cannot rescale the item aboard');
assert.ok(Math.abs(Math.max(...new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3()).toArray())-1.65)<1e-5);
const lamp=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(.1,.3,.1)),halo=new THREE.Sprite();halo.scale.set(4,4,4);lamp.add(body,halo);const invisible=new THREE.Group();invisible.visible=false;invisible.add(new THREE.Mesh(new THREE.BoxGeometry(10,10,10)));lamp.add(invisible);
assert.ok(visibleItemBounds(lamp).getSize(new THREE.Vector3()).distanceTo(new THREE.Vector3(.1,.3,.1))<1e-7,'light halos and hidden fallbacks cannot intercept other items');
const originalTexture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:originalTexture}),source=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),material);inspectionObject(source,null);assert.equal(originalTexture.colorSpace,THREE.NoColorSpace,'inspection must not recolour textures used by the boat');
assert.equal(PROP_LAYOUT.backpack.rotation[1],0,'bag now faces the opposite way');assert.equal(Object.keys(EQUIPMENT).length,7);
assert.equal(displayLines({}).status,'STANDBY');assert.equal(displayLines({mode:'TAPE',on:true,spotify:{ready:false}}).status,'CONNECTING');
assert.equal(displayLines({mode:'TAPE',on:true,spotify:{ready:true,playing:false}}).status,'PRESS PLAY','never claim playback just because play was requested');
const playing=displayLines({mode:'TAPE',on:true,spotify:{ready:true,playing:true,position:65000,duration:130000}});assert.equal(playing.status,'PLAYING');assert.equal(playing.time,'1:05');assert.equal(playing.progress,.5);
for(const zoom of [3,4,6,8]){const fov=binocularFov(zoom);assert.ok(fov>0&&fov<30);assert.ok(Math.abs(Math.tan(68*Math.PI/360)/Math.tan(fov*Math.PI/360)-zoom)<1e-10,'optical magnification must match the actual camera projection');}
assert.ok(binocularFov(8)<binocularFov(3));
console.log('PASS five inspectable items, independent model transforms, reversed bag, flush original LCD, confirmed Spotify states and optical zoom');
