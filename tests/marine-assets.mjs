import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import {prepareMarineUV,applyMarineDetails} from '../src/marine-assets.js';
import {createBoatMaterial} from '../src/boat-materials.js';

const texture=()=>new THREE.Texture(),assets={strength:{value:1}};
for(const kind of ['water','linen','canvas','wood','rope']){
 assets[kind]={};
 for(const channel of ['normal','roughness']){
  const file=new URL('../public/textures/marine/'+kind+'-'+channel+'.png',import.meta.url);
  const {data,info}=await sharp(fs.readFileSync(file)).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,info.height);assert.ok(info.width<=1024);
  if(channel==='normal'){
   let meanError=0;
   for(let i=0;i<data.length;i+=info.channels*13){const n=[0,1,2].map(c=>data[i+c]/127.5-1);meanError+=Math.abs(Math.hypot(...n)-1);}
   meanError/=Math.ceil(info.width*info.height/13);assert.ok(meanError<.12,kind+' normal vectors must remain valid data after conversion');
  }
  assets[kind][channel]=texture();
 }
}
assets.sailNormal={value:assets.linen.normal};assets.sailRoughness={value:assets.linen.roughness};
const root=new THREE.Group();
for(const name of ['Sail','Hull','Lacing']){
 const geometry=new THREE.PlaneGeometry(2,3,3,4),source=new THREE.MeshStandardMaterial({map:texture(),normalMap:texture(),roughnessMap:texture()});
 const material=createBoatMaterial(source,{cloth:name==='Sail'}),mesh=new THREE.Mesh(geometry,material);mesh.name=name;root.add(mesh);
 const positions=geometry.attributes.position.array.slice(),atlasUV=geometry.attributes.uv.array.slice();prepareMarineUV(mesh);
 assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.attributes.uv.array,atlasUV);
 assert.ok(geometry.attributes.marineUv.array.every(Number.isFinite));
}
const sourceMap=root.children.map(m=>[m.material.map,m.material.normalMap,m.material.roughnessMap]);
assert.equal(applyMarineDetails(root,assets),3);assert.equal(applyMarineDetails(root,assets),0,'detail application is idempotent');
root.children.forEach((mesh,index)=>{
 assert.deepEqual([mesh.material.map,mesh.material.normalMap,mesh.material.roughnessMap],sourceMap[index],'original atlas channels survive');
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};mesh.material.onBeforeCompile(shader);
 assert.equal(shader.uniforms.marineStrength,assets.strength,'live comparison uses the shared strength');
 assert.ok(shader.fragmentShader.includes('marineInv'));assert.ok(shader.vertexShader.includes('vMarineUv=marineUv;'));
 assert.ok(shader.fragmentShader.includes('sRGBTransferOETF'),'boat display conversion is preserved');
 if(mesh.name==='Sail'){assert.equal(shader.uniforms.marineNormal,assets.sailNormal);assert.ok(shader.fragmentShader.includes('backlight'));}
});
const source=fs.readFileSync(new URL('../src/marine-foam.js',import.meta.url),'utf8');assert.ok(source.includes('Copyright (c) 2026 Humpalumps'));
assert.ok(fs.existsSync(new URL('../public/textures/licenses/Ultra-Water-LICENSE.txt',import.meta.url)));
const lunar=await sharp(fs.readFileSync(new URL('../public/textures/marine/moon-lroc-2k.png',import.meta.url))).metadata();
assert.equal(lunar.width,2048);assert.equal(lunar.height,1024,'cylindrical moon map keeps 2:1 projection');
const manifest=JSON.parse(fs.readFileSync(new URL('../public/data/visual-assets.json',import.meta.url)));
assert.ok(manifest.assets.some(a=>a.kind==='moon-survey'&&a.approved&&a.sourceUrl==='https://svs.gsfc.nasa.gov/4720/'));
assert.ok(manifest.assets.some(a=>a.kind==='moon-surface'&&a.approved),'approved photo remains available');
console.log('PASS converted data maps, rest-pose detail UVs, untouched atlas/geometry, live comparisons, cloth backlight and retained code notices');
