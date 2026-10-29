// Offline conversion of the owner's selected Downloads into runtime data maps.
// No remote requests, installers or downloaded scripts are executed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import {EXRLoader} from 'three/examples/jsm/loaders/EXRLoader.js';
const input=process.argv[2];
if(!input)throw new Error('Provide the directory containing the selected extracted images.');
const output=new URL('../public/textures/marine/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const jobs=[
 ['Water_002_NORM.jpg','water-normal.png',1024],
 ['Water_002_ROUGH.jpg','water-roughness.png',512],
 ['Fabric030_1K-PNG_NormalGL.png','canvas-normal.png',512],
 ['Fabric030_1K-PNG_Roughness.png','canvas-roughness.png',512],
 ['Rope001_4K-JPG_NormalGL.jpg','rope-normal.png',512],
 ['Rope001_4K-JPG_Roughness.jpg','rope-roughness.png',512],
 ['Metal030_4K-JPG_NormalGL.jpg','metal-normal.png',512],
 ['Metal030_4K-JPG_Roughness.jpg','metal-roughness.png',512],
 ['lacquered_cherry_wood_nor_gl_4k.exr','wood-normal.png',1024],
 ['lacquered_cherry_wood_rough_4k.exr','wood-roughness.png',512],
 ['rough_linen_nor_gl_4k.exr','linen-normal.png',512],
 // r169 cannot decode the linen pack's single-channel DWA roughness EXR.
 // Use neutral Fabric030 roughness alongside the linen normal.
 ['Fabric030_1K-PNG_Roughness.png','linen-roughness.png',512]
];
for(const [source,dest,size] of jobs){
 const file=path.join(input,source);let image;
 if(source.endsWith('.exr')){
  const bytes=await fs.readFile(file),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const exr=new EXRLoader().setDataType(THREE.FloatType).parse(buffer);
  // EXR data channels are linear. Do not apply a colour transfer to normals/roughness.
  const data=Buffer.alloc(exr.width*exr.height*3),channels=exr.data.length/(exr.width*exr.height);
  for(let p=0;p<exr.width*exr.height;p++)for(let c=0;c<3;c++)data[p*3+c]=Math.round(255*THREE.MathUtils.clamp(exr.data[p*channels+Math.min(c,channels-1)],0,1));
  // EXRLoader normalizes its scanline order for a texture with flipY=false.
  // PNG TextureLoader uses flipY=true; restore conventional image-row order.
  image=sharp(data,{raw:{width:exr.width,height:exr.height,channels:3}}).flip();
 }else image=sharp(file);
 image=image.resize(size,size,{kernel:'lanczos3'});
 if(dest.includes('-normal')){
  // Averaging encoded normals changes vector length. Renormalize after resizing
  // rather than interpreting a shortened vector as a shallower blue channel.
  const {data,info}=await image.removeAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=info.channels){
   const x=data[i]/127.5-1,y=data[i+1]/127.5-1,z=data[i+2]/127.5-1,len=Math.hypot(x,y,z)||1;
   data[i]=Math.round((x/len*.5+.5)*255);data[i+1]=Math.round((y/len*.5+.5)*255);data[i+2]=Math.round((z/len*.5+.5)*255);
  }
  image=sharp(data,{raw:{width:info.width,height:info.height,channels:info.channels}});
 }
 await image.png({compressionLevel:9}).toFile(fileURLToPath(new URL(dest,output)));
 console.log(dest,size);
}
