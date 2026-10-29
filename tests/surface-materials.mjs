import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMarineSurfaceMaps,sampleMarineSurface} from '../src/surface-materials.js';
for(const kind of ['wood','canvas'])for(let i=0;i<37;i++){
  const t=i/37;
  for(const [a,b] of [[sampleMarineSurface(kind,0,t),sampleMarineSurface(kind,1,t)],[sampleMarineSurface(kind,t,0),sampleMarineSurface(kind,t,1)]])for(let k=0;k<5;k++)assert.ok(Math.abs(a[k]-b[k])<1e-8,kind+' must tile without an edge seam');
}
let cross=0,along=0;
for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const u=x/32,v=y/32,sample=sampleMarineSurface('wood',u,v);
  cross+=Math.abs(sample[0]-sampleMarineSurface('wood',u+.003,v)[0]);
  along+=Math.abs(sample[0]-sampleMarineSurface('wood',u,v+.003)[0]);
  for(const kind of ['wood','canvas']){
    const value=sampleMarineSurface(kind,u,v);
    assert.ok([...value].every(Number.isFinite));
    assert.ok(value[0]>210&&value[0]<255,'surface albedo should stay restrained and tintable');
    assert.ok(value[3]>.4&&value[3]<.7,'bump amplitude should stay fine rather than sculpted');
    assert.ok(value[4]>.8&&value[4]<=1,'roughness should retain a natural matte base');
  }
}
assert.ok(cross>along*20,'wood fibres should run along V, not across the shaft');
globalThis.document={createElement:()=>({width:0,height:0,getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(image){this.image=image;}};}})};
const maps=createMarineSurfaceMaps();
for(const [name,size] of [['wood',512],['canvas',256]])for(const key of ['map','roughnessMap','bumpMap']){
  const texture=maps[name][key];
  assert.equal(texture.image.width,size);
  assert.equal(texture.wrapS,THREE.RepeatWrapping);
  assert.equal(texture.wrapT,THREE.RepeatWrapping);
  assert.equal(texture.colorSpace,THREE.NoColorSpace);
  assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);
  assert.equal(texture.generateMipmaps,true);
}
let disposed=0;
for(const surface of [maps.wood,maps.canvas])for(const key of ['map','roughnessMap','bumpMap'])surface[key].addEventListener('dispose',()=>disposed++);
maps.dispose();assert.equal(disposed,6);
console.log('PASS seamless wood/canvas maps, restrained relief, grain direction, memory sizes and disposal');
// Match the intentionally minimal canvas stub used by the main physics suite.
const stubContext=new Proxy({},{get:()=>()=>{}});
globalThis.document={createElement:()=>({getContext:()=>stubContext})};
const fallback=createMarineSurfaceMaps();
for(const [name,size] of [['wood',512],['canvas',256]])for(const key of ['map','roughnessMap','bumpMap']){
  const texture=fallback[name][key];
  assert.equal(texture.isDataTexture,true,'placeholder canvas APIs must preserve maps through a data texture');
  assert.equal(texture.image.data.length,size*size*4);
  assert.equal(texture.flipY,true);
  const sample=sampleMarineSurface(name,.5/size,.5/size);
  const expected=key==='map'?Math.round(sample[0]):Math.round(sample[key==='roughnessMap'?4:3]*255);
  assert.equal(texture.image.data[0],expected,'fallback must preserve the exact generated pixels');
}
fallback.dispose();
console.log('PASS pixel-identical DataTexture fallback for canvas stubs');
