import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {Document,NodeIO} from '@gltf-transform/core';
import {EXTTextureWebP} from '@gltf-transform/extensions';
import {weld,dedup,prune} from '@gltf-transform/functions';
import sharp from 'sharp';
const source=path.resolve(process.argv[2]||'../../work/rowing-boat');
globalThis.window={URL};THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const raw=await fs.readFile(path.join(source,'source/Rowing Boat.fbx'));
const object=new FBXLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');object.updateMatrixWorld(true);
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene();doc.createExtension(EXTTextureWebP).setRequired(true);
const texture=async(name,size=2048)=>doc.createTexture(name).setImage(await sharp(path.join(source,'textures',`Rowing_Boat_Boat_${name}.png`)).resize(size,size,{fit:'inside'}).webp({quality:88}).toBuffer()).setMimeType('image/webp');
const base=await texture('BaseColor'),normal=await texture('Normal');
const rough=await sharp(path.join(source,'textures/Rowing_Boat_Boat_Roughness.png')).resize(2048,2048).removeAlpha().greyscale().raw().toBuffer();
const metal=await sharp(path.join(source,'textures/Rowing_Boat_Boat_Metallic.png')).resize(2048,2048).removeAlpha().greyscale().raw().toBuffer();
const packed=Buffer.alloc(2048*2048*3);for(let i=0;i<rough.length;i++){packed[i*3]=255;packed[i*3+1]=rough[i];packed[i*3+2]=metal[i];}
const orm=doc.createTexture('RoughnessMetallic').setImage(await sharp(packed,{raw:{width:2048,height:2048,channels:3}}).webp({quality:90}).toBuffer()).setMimeType('image/webp');
const material=doc.createMaterial('Weathered boat wood').setBaseColorTexture(base).setNormalTexture(normal).setMetallicRoughnessTexture(orm).setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(true);
const bounds=new THREE.Box3().setFromObject(object),centre=bounds.getCenter(new THREE.Vector3()),scale=5.2/bounds.getSize(new THREE.Vector3()).z;
let rawMesh;object.traverse(o=>{if(o.isMesh)rawMesh=o;});
const positions=rawMesh.geometry.clone().applyMatrix4(rawMesh.matrixWorld).translate(-centre.x,-bounds.min.y,-centre.z).scale(scale,scale,scale).attributes.position;
const parent=Array.from({length:positions.count},(_,i)=>i),keys=new Map();const find=x=>parent[x]===x?x:parent[x]=find(parent[x]);const join=(a,b)=>{parent[find(a)]=find(b);};
for(let i=0;i<positions.count;i++){const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(x=>x.toFixed(4)).join(',');if(keys.has(key))join(i,keys.get(key));else keys.set(key,i);}
for(let i=0;i<positions.count;i+=3){join(i,i+1);join(i,i+2);}const parts=new Map();for(let i=0;i<positions.count;i++){const id=find(i);if(!parts.has(id))parts.set(id,[]);parts.get(id).push(i);}
const groups=[...parts.values()].sort((a,b)=>b.length-a.length),hullBox=new THREE.Box3();for(const i of groups[3])hullBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,i));const hx=(hullBox.min.x+hullBox.max.x)/2,hz=(hullBox.min.z+hullBox.max.z)/2;
object.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld).translate(-centre.x,-bounds.min.y,-centre.z).scale(scale,scale,scale).translate(-hx,-.35,-hz);
const buckets={Hull:[...groups[3],...groups[5]],Fittings:[],Sail:groups[1],Lacing:groups[0],Port_oar:groups[7],Starboard_oar:groups[8]};groups.forEach((ids,id)=>{if(![0,1,3,5,7,8].includes(id))buckets.Fittings.push(...ids);});
// FBX textures use bottom-left UVs; glTF images use a top-left origin.
for(const [name,ids]of Object.entries(buckets)){const p=doc.createPrimitive().setMaterial(material);for(const [key,semantic]of Object.entries({position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0'})){if(!g.attributes[key])continue;const a=g.attributes[key],arr=new Float32Array(ids.length*a.itemSize);ids.forEach((n,j)=>{for(let k=0;k<a.itemSize;k++)arr[j*a.itemSize+k]=key==='uv'&&k===1?1-a.array[n*a.itemSize+k]:a.array[n*a.itemSize+k];});p.setAttribute(semantic,doc.createAccessor().setBuffer(buffer).setType(a.itemSize===2?'VEC2':'VEC3').setArray(arr));}scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)));}});

await doc.transform(weld(),dedup(),prune());await new NodeIO().registerExtensions([EXTTextureWebP]).write('public/models/rowing-boat.glb',doc);console.log('Converted supplied FBX and optimized 2K PBR textures.');
