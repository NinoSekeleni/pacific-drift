// Offline conversion of the owner's backpack, radio and Earth image archives.
// Pass a directory with extracted bag/, radio/ and earth/ subdirectories.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {Document,NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTTextureWebP} from '@gltf-transform/extensions';
import {dedup,weld,prune,simplify,textureCompress,getBounds} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const source=path.resolve(process.argv[2]||'../../work/boat-props');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
function normalize(doc,name,height){
 const scene=doc.getRoot().listScenes()[0],b=getBounds(scene),scale=height/(b.max[1]-b.min[1]);
 const root=doc.createNode(name).setScale([scale,scale,scale]).setTranslation([-(b.min[0]+b.max[0])*.5*scale,-b.min[1]*scale,-(b.min[2]+b.max[2])*.5*scale]);
 for(const child of scene.listChildren()){scene.removeChild(child);root.addChild(child);}scene.addChild(root);
 return getBounds(scene);
}
const bag=await io.read(path.join(source,'bag/source/dengshanbao.glb'));
// The source is nearly unwelded, with tiny per-corner differences. Rebuild
// smooth cloth normals after reduction; the authored normal maps retain seams.
for(const mesh of bag.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 p.setAttribute('NORMAL',null);p.setAttribute('TANGENT',null);
 for(const semantic of ['POSITION','TEXCOORD_0']){const a=p.getAttribute(semantic);if(!a)continue;const values=a.getArray();const precision=semantic==='POSITION'?1000:8192;for(let i=0;i<values.length;i++)values[i]=Math.round(values[i]*precision)/precision;}
}
await bag.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.20,error:.003}),prune());
for(const mesh of bag.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 const g=new THREE.BufferGeometry(),position=p.getAttribute('POSITION');g.setAttribute('position',new THREE.BufferAttribute(position.getArray(),3));if(p.getIndices())g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(),1));g.computeVertexNormals();
 p.setAttribute('NORMAL',bag.createAccessor().setBuffer(position.getBuffer()).setType('VEC3').setArray(g.attributes.normal.array));g.dispose();
}
await bag.transform(prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:86}));
const bagBounds=normalize(bag,'Backpack — 56 cm tall',.56);
await io.write('public/models/backpack.glb',bag);

globalThis.window={URL};THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const bytes=await fs.readFile(path.join(source,'radio/extracted/krotkofal.fbx'));
const object=new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');object.updateMatrixWorld(true);
const radio=new Document(),buffer=radio.createBuffer(),scene=radio.createScene();radio.createExtension(EXTTextureWebP).setRequired(true);
const tex=async(file,name)=>radio.createTexture(name).setImage(await sharp(path.join(source,'radio/textures',file)).resize(1024,1024).webp({quality:90}).toBuffer()).setMimeType('image/webp');
const stem='krotkofal_low3_KROTKOFAL_';
const base=await tex(stem+'BaseColor.png','Radio base colour'),normal=await tex(stem+'Normal.png','Radio normal');
const rough=await sharp(path.join(source,'radio/textures',stem+'Roughness.png')).resize(1024,1024).greyscale().raw().toBuffer();
const metal=await sharp(path.join(source,'radio/textures',stem+'Metallic.png')).resize(1024,1024).greyscale().raw().toBuffer();
const packed=Buffer.alloc(1024*1024*3);for(let i=0;i<rough.length;i++){packed[i*3]=255;packed[i*3+1]=rough[i];packed[i*3+2]=metal[i];}
const orm=radio.createTexture('Radio roughness/metalness').setImage(await sharp(packed,{raw:{width:1024,height:1024,channels:3}}).webp({quality:92}).toBuffer()).setMimeType('image/webp');
const material=radio.createMaterial('Original handheld radio').setBaseColorTexture(base).setNormalTexture(normal).setMetallicRoughnessTexture(orm).setMetallicFactor(1).setRoughnessFactor(1);
const arrays={POSITION:[],NORMAL:[],TEXCOORD_0:[]};
object.traverse(o=>{
 if(!o.isMesh)return;let geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);if(geometry.index)geometry=geometry.toNonIndexed();
 for(const [semantic,attribute]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){
  const a=geometry.attributes[attribute];if(!a)throw new Error('Radio missing '+attribute);
  for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)arrays[semantic].push(semantic==='TEXCOORD_0'&&c===1?1-a.array[i*a.itemSize+c]:a.array[i*a.itemSize+c]);
 }
 geometry.dispose();
});
const primitive=radio.createPrimitive().setMaterial(material);
for(const [semantic,data]of Object.entries(arrays))primitive.setAttribute(semantic,radio.createAccessor().setBuffer(buffer).setType(semantic==='TEXCOORD_0'?'VEC2':'VEC3').setArray(new Float32Array(data)));
scene.addChild(radio.createNode('Handheld radio').setMesh(radio.createMesh('Radio combined shell and controls').addPrimitive(primitive)));
await radio.transform(weld(),dedup(),prune());const radioBounds=normalize(radio,'Radio — 28 cm including antenna',.28);
await io.write('public/models/handheld-radio.glb',radio);

await fs.mkdir('public/textures/earth',{recursive:true});
await sharp(path.join(source,'earth/textures/terra_texture_4096_BLUE_ATM.jpg')).resize(2048,1024).webp({quality:92}).toFile('public/textures/earth/terra-colour-2k.webp');
await sharp(path.join(source,'earth/textures/clouds_UPDATED_2.jpg')).resize(2048,1024).webp({quality:88}).toFile('public/textures/earth/terra-clouds-2k.webp');
function statistics(doc){let triangles=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;return {triangles,materials:doc.getRoot().listMaterials().length};}
console.log(JSON.stringify({bag:{bounds:bagBounds,...statistics(bag)},radio:{bounds:radioBounds,...statistics(radio)}},null,2));
