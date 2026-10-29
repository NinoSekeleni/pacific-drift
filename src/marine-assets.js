import * as THREE from 'three';

// Authored microdetail only: original albedo/atlas, wave heights and hull masks stay intact.
export async function loadMarineAssets(renderer,base){
 const loader=new THREE.TextureLoader(),assets={failures:[],strength:{value:1},sail:'linen'};
 const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 await Promise.all(['water','canvas','linen','rope','wood'].map(async kind=>{
  const maps=await Promise.allSettled(['normal','roughness'].map(async channel=>{
   const tex=await loader.loadAsync(base+'textures/marine/'+kind+'-'+channel+'.webp').catch(()=>loader.loadAsync(base+'textures/marine/'+kind+'-'+channel+'.png'));
   tex.name=kind+' '+channel;tex.colorSpace=THREE.NoColorSpace;
   tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=anisotropy;
   return tex;
  }));
  if(maps.every(m=>m.status==='fulfilled'))assets[kind]={normal:maps[0].value,roughness:maps[1].value};
  else {assets.failures.push(kind);for(const m of maps)if(m.status==='fulfilled')m.value.dispose();}
 }));
 assets.sailNormal={value:assets.linen?.normal||assets.canvas?.normal};
 assets.sailRoughness={value:assets.linen?.roughness||assets.canvas?.roughness};
 assets.setSail=kind=>{const maps=assets[kind];if(!maps)return;assets.sail=kind;assets.sailNormal.value=maps.normal;assets.sailRoughness.value=maps.roughness;};
 return assets;
}

// Capture local, undeformed coordinates before the sail is furled or oars canonicalized.
// A second coordinate set avoids repeating the boat's packed colour-atlas islands.
export function prepareMarineUV(mesh){
 const geometry=mesh.geometry;if(geometry.attributes.marineUv)return;
 const p=geometry.attributes.position,n=geometry.attributes.normal,uv=new Float32Array(p.count*2);
 const cloth=mesh.name==='Sail',rope=mesh.name==='Lacing',scale=cloth?.30:rope?.08:1;
 for(let i=0;i<p.count;i++){
  let u,v;
  if(cloth||rope){u=p.getZ(i);v=p.getY(i);}
  else if(Math.abs(n.getY(i))>=Math.max(Math.abs(n.getX(i)),Math.abs(n.getZ(i)))){u=p.getX(i);v=p.getZ(i);}
  else if(Math.abs(n.getX(i))>Math.abs(n.getZ(i))){u=p.getZ(i);v=p.getY(i);}
  else {u=p.getX(i);v=p.getY(i);}
  uv[i*2]=u/scale;uv[i*2+1]=v/scale;
 }
 geometry.setAttribute('marineUv',new THREE.BufferAttribute(uv,2));
}

export function applyMarineDetails(root,assets){
 let count=0;
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry.attributes.marineUv)return;
  const cloth=mesh.name==='Sail',rope=mesh.name==='Lacing',kind=cloth?'linen':rope?'rope':'wood';
  if(!assets[kind])return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(material.userData.marineDetail)continue;
   const prior=material.onBeforeCompile.bind(material),cache=material.customProgramCacheKey();
   material.onBeforeCompile=shader=>{
    prior(shader);
    Object.assign(shader.uniforms,{
     marineNormal:cloth?assets.sailNormal:{value:assets[kind].normal},
     marineRoughness:cloth?assets.sailRoughness:{value:assets[kind].roughness},
     marineStrength:assets.strength,
     marineRelief:{value:cloth?.14:rope?.20:.095}
    });
    shader.vertexShader='attribute vec2 marineUv; varying vec2 vMarineUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMarineUv=marineUv;');
    shader.fragmentShader='uniform sampler2D marineNormal,marineRoughness; uniform float marineStrength,marineRelief; varying vec2 vMarineUv;\n'+shader.fragmentShader;
    // Derivative cotangent frame adds fine relief after the original atlas normal.
    // No extra tangent/UV assumptions on the supplied FBX islands.
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     vec3 marineDx=dFdx(-vViewPosition),marineDy=dFdy(-vViewPosition);
     vec2 marineStX=dFdx(vMarineUv),marineStY=dFdy(vMarineUv);
     vec3 marinePerpY=cross(marineDy,normal),marinePerpX=cross(normal,marineDx);
     vec3 marineT=marinePerpY*marineStX.x+marinePerpX*marineStY.x;
     vec3 marineB=marinePerpY*marineStX.y+marinePerpX*marineStY.y;
     float marineInv=inversesqrt(max(max(dot(marineT,marineT),dot(marineB,marineB)),1.e-10));
     vec2 marineSlope=(texture2D(marineNormal,vMarineUv).xy*2.-1.)*marineRelief*marineStrength;
     normal=normalize(normal+(marineT*marineSlope.x+marineB*marineSlope.y)*marineInv);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     float marineRough=texture2D(marineRoughness,vMarineUv).g;
     roughnessFactor=clamp(roughnessFactor*mix(1.,.86+.14*marineRough,marineStrength),.04,1.);
    `);
   };
   material.customProgramCacheKey=()=>cache+'-marine-'+kind+'-v1';
   material.userData.marineDetail=kind;material.needsUpdate=true;count++;
  }
 });
 return count;
}
