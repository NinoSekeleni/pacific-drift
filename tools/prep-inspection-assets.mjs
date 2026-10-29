// Data-only conversion of the owner's OBJ/FBX models. No archive scripts are run.
import fs from 'node:fs/promises';import path from 'node:path';
import * as THREE from 'three';import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';import {OBJLoader} from 'three/examples/jsm/loaders/OBJLoader.js';
import {Document,NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS,EXTTextureWebP} from '@gltf-transform/extensions';import {dedup,weld,prune,simplify,getBounds} from '@gltf-transform/functions';import {MeshoptSimplifier} from 'meshoptimizer';import sharp from 'sharp';
const source=path.resolve(process.argv[2]||'../../work/inspection-assets');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);await MeshoptSimplifier.ready;
globalThis.window={URL};THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
async function convert(kind){
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene();doc.createExtension(EXTTextureWebP).setRequired(true);
 let root;
 if(kind==='walkman'){const b=await fs.readFile(path.join(source,kind,'source/walkman_with_earphone.fbx'));root=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
 else root=new OBJLoader().parse(await fs.readFile(path.join(source,kind,'extracted/Zuiho_binoculars_SF.obj'),'utf8'));
 root.updateMatrixWorld(true);const mats=new Map();
 async function image(file,name,size=1024){return doc.createTexture(name).setImage(await sharp(path.join(source,kind,'textures',file)).resize(size,size,{fit:'inside'}).webp({quality:92}).toBuffer()).setMimeType('image/webp');}
 async function material(name){
  if(mats.has(name))return mats.get(name);
  const m=doc.createMaterial(name).setDoubleSided(true);mats.set(name,m);
  if(kind==='binoculars'){
   if(name==='Lenses')m.setBaseColorFactor([.055,.095,.12,1]).setMetallicFactor(.45).setRoughnessFactor(.12);
   else m.setBaseColorTexture(await image('Zuiho_binoculars.jpeg','Original worn binocular shell')).setNormalTexture(await image('Zuiho_binoculars_normal.jpeg','Authored shell normals')).setOcclusionTexture(await image('Zuiho_binoculars_occlusion.jpeg','Shell occlusion',512)).setMetallicFactor(.12).setRoughnessFactor(.62);
  }else{
   m.setBaseColorTexture(await image(name+'_Base_color.png',name+' colour',name==='walkman'?2048:1024)).setNormalTexture(await image(name+'_Normal_OpenGL.png',name+' normal'));
   const size=512;
   const pixels=async suffix=>{const {data,info}=await sharp(path.join(source,kind,'textures',name+'_'+suffix+'.png')).resize(size,size).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});return Array.from({length:size*size},(_,i)=>data[i*info.channels]);};
   const rough=await pixels('Roughness'),metal=await pixels('Metallic'),packed=Buffer.alloc(size*size*3);
   for(let i=0;i<rough.length;i++){packed[i*3]=255;packed[i*3+1]=rough[i];packed[i*3+2]=metal[i];}
   m.setMetallicRoughnessTexture(doc.createTexture(name+' roughness / metal').setImage(await sharp(packed,{raw:{width:size,height:size,channels:3}}).webp({quality:94}).toBuffer()).setMimeType('image/webp')).setMetallicFactor(1).setRoughnessFactor(1);
   m.setOcclusionTexture(await image(name+'_Mixed_AO.png',name+' AO',512));
   // The source uses opacity to reveal its cassette window. Merge into base alpha.
   try{
    const base=await sharp(path.join(source,kind,'textures',name+'_Base_color.png')).resize(name==='walkman'?2048:1024,name==='walkman'?2048:1024,{fit:'inside'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const opacity=await sharp(path.join(source,kind,'textures',name+'_Opacity.png')).resize(base.info.width,base.info.height).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
    const rgba=Buffer.alloc(base.info.width*base.info.height*4);let holes=0;
    for(let i=0;i<base.info.width*base.info.height;i++){for(let c=0;c<3;c++)rgba[i*4+c]=base.data[i*base.info.channels+c];const a=opacity.data[i*opacity.info.channels];rgba[i*4+3]=a;if(a<128)holes++;}
    if(holes){m.getBaseColorTexture().setImage(await sharp(rgba,{raw:{width:base.info.width,height:base.info.height,channels:4}}).webp({quality:92}).toBuffer());m.setAlphaMode('MASK').setAlphaCutoff(.3);}
   }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return m;
 }
 const meshes=[];root.traverse(o=>{if(o.isMesh&&o.name!=='earphone')meshes.push(o);});
 for(const object of meshes){
  let g=object.geometry.clone().applyMatrix4(object.matrixWorld);if(g.index)g=g.toNonIndexed();
  if(kind==='walkman')g.rotateX(Math.PI/2); // Front faces +Z; body stands upright in metre space.
  const original=Array.isArray(object.material)?object.material:[object.material],groups=g.groups.length?g.groups:[{start:0,count:g.attributes.position.count,materialIndex:0}];
  const mesh=doc.createMesh(object.name);
  for(const group of groups){
   const primitive=doc.createPrimitive().setMaterial(await material(original[group.materialIndex]?.name||original[0].name));
   for(const [semantic,key]of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']]){
    const a=g.attributes[key];if(!a)continue;const values=new Float32Array(group.count*a.itemSize);
    for(let i=0;i<group.count;i++)for(let c=0;c<a.itemSize;c++)values[i*a.itemSize+c]=semantic==='TEXCOORD_0'&&c===1?1-a.array[(group.start+i)*a.itemSize+c]:a.array[(group.start+i)*a.itemSize+c];
    primitive.setAttribute(semantic,doc.createAccessor().setBuffer(buffer).setType(semantic==='TEXCOORD_0'?'VEC2':'VEC3').setArray(values));
   }
   mesh.addPrimitive(primitive);
  }
  scene.addChild(doc.createNode(object.name).setMesh(mesh));g.dispose();
 }
 await doc.transform(dedup(),weld());
 if(kind==='binoculars')await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.19,error:.0025}));
 await doc.transform(prune());
 const bounds=getBounds(scene),height=kind==='walkman'?.13:.06,scale=height/(bounds.max[1]-bounds.min[1]);
 const holder=doc.createNode(kind+' — metre scale').setScale([scale,scale,scale]).setTranslation([-(bounds.min[0]+bounds.max[0])*.5*scale,-bounds.min[1]*scale,-(bounds.min[2]+bounds.max[2])*.5*scale]);
 for(const child of scene.listChildren()){scene.removeChild(child);holder.addChild(child);}scene.addChild(holder);
 await io.write('public/models/'+kind+'.glb',doc);
 let triangles=0;for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives())triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;
 console.log(JSON.stringify({kind,bounds:getBounds(scene),triangles,materials:doc.getRoot().listMaterials().length,bytes:(await fs.stat('public/models/'+kind+'.glb')).size}));
}
await convert('binoculars');await convert('walkman');
