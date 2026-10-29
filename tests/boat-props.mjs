import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import sharp from 'sharp';
import {PROP_LAYOUT,placeBoatProp} from '../src/boat-props.js';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
function nodeObject(n){
 const root=new THREE.Group();root.name=n.getName();new THREE.Matrix4().fromArray(n.getMatrix()).decompose(root.position,root.quaternion,root.scale);
 for(const p of n.getMesh()?.listPrimitives()||[]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.getAttribute('POSITION').getArray(),3));if(p.getIndices())g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(),1));root.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));}
 for(const child of n.listChildren())root.add(nodeObject(child));return root;
}
const boat=await io.read('public/models/rowing-boat.glb'),hull=new THREE.Group();
for(const n of boat.getRoot().listScenes()[0].listChildren())if(['Hull','Fittings'].includes(n.getName()))hull.add(nodeObject(n));hull.updateMatrixWorld(true);
const ray=new THREE.Raycaster();
function support(x,z){ray.set(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0));const hits=ray.intersectObject(hull,true);assert.ok(hits.length,'prop must have actual boat geometry below it');return hits[0].point.y;}
const fitted=[];
for(const [name,spec] of Object.entries(PROP_LAYOUT)){
 const file='public/models/'+spec.file,doc=await io.read(file),scene=doc.getRoot().listScenes()[0],b=getBounds(scene);
 assert.ok(Math.abs(b.max[1]-b.min[1]-spec.height)<1e-5,name+' must use physical metre scale');
 assert.ok(fs.statSync(file).size<(name==='backpack'?4e6:name==='anbernic'?4e6:1.5e6),'runtime asset size budget');
 let triangles=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
 assert.ok(triangles<(name==='backpack'?60000:name==='binoculars'?45000:name==='anbernic'?200000:20000),'mesh detail budget');
 for(const texture of doc.getRoot().listTextures()){const size=texture.getSize();assert.ok(size[0]<=(name==='walkman'?2048:1024)&&size[1]<=(name==='walkman'?2048:1024));}
 assert.ok(name==='anbernic'||doc.getRoot().listMaterials().some(m=>m.getBaseColorTexture()&&m.getNormalTexture()),'authored colour and normal maps retained');
 const root=new THREE.Group();for(const n of scene.listChildren())root.add(nodeObject(n));
 const fit=placeBoatProp(root,spec,support);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);
 assert.ok(Math.abs(box.min.y-fit.contact.supportY-.003)<1e-5,'rests on the measured boat surface');
 assert.ok(box.min.x>-.65&&box.max.x<.65,'stays inside hull and clear of rowlocks');
 assert.ok(box.max.z<1.15,'clear of the oar handles and rowing seat');
 fitted.push({name,box});
 if(name==='radio')assert.ok(box.max.y-box.min.y<.06,'radio lies face-up rather than balancing upright');
}
for(let i=0;i<fitted.length;i++)for(let j=i+1;j<fitted.length;j++)assert.ok(!fitted[i].box.intersectsBox(fitted[j].box),fitted[i].name+' and '+fitted[j].name+' must not overlap');
for(const file of ['terra-colour-2k.webp','terra-clouds-2k.webp']){const m=await sharp('public/textures/earth/'+file).metadata();assert.equal(m.width,2048);assert.equal(m.height,1024);}
console.log('PASS metre-scaled bag/radio/Walkman/binoculars, real bench contact, rowlock/seat clearance, flat radio, retained maps, mesh/file budgets and Earth projection');
