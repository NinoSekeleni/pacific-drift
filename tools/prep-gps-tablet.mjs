import fs from 'node:fs/promises';import {NodeIO} from '@gltf-transform/core';import {ALL_EXTENSIONS} from '@gltf-transform/extensions';import {dedup,prune,textureCompress,getBounds} from '@gltf-transform/functions';import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),source=process.argv[2]||'/Users/ninosekeleni/Downloads/rugged_tablet_0.1.glb',doc=await io.read(source);
let i=0;for(const t of doc.getRoot().listTextures()){await fs.writeFile('../../work/gps-tablet/texture-'+i+'.png',t.getImage());console.log(i++,t.getName(),t.getSize());}
const scene=doc.getRoot().listScenes()[0],bounds=getBounds(scene);console.log('Original bounds',bounds);
// Remove the stock, very bright screenshot. The GPS renderer supplies a live screen.
for(const m of doc.getRoot().listMaterials()){m.setEmissiveFactor([0,0,0]);m.setEmissiveTexture(null);for(const ext of m.listExtensions())if(ext.extensionName==='KHR_materials_emissive_strength')m.setExtension(ext.extensionName,null);}
await doc.transform(dedup(),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:92}));
const height=.29,scale=height/(bounds.max[1]-bounds.min[1]);
const holder=doc.createNode('Rugged GPS tablet — 29 cm').setScale([scale,scale,scale]).setTranslation([-(bounds.min[0]+bounds.max[0])*.5*scale,-bounds.min[1]*scale,-(bounds.min[2]+bounds.max[2])*.5*scale]);
for(const n of scene.listChildren()){scene.removeChild(n);holder.addChild(n);}scene.addChild(holder);
await io.write('public/models/gps-tablet.glb',doc);console.log('Metre bounds',getBounds(scene),(await fs.stat('public/models/gps-tablet.glb')).size);
