import * as THREE from 'three';
// Atmosphere shaders already output display colours. Imported PBR surfaces need
// their own sRGB decode/encode pair within that existing rendering pipeline.
export function createBoatMaterial(source,{cloth=false}={}){
 const material=source.clone();material.name=cloth?'White woven sailcloth':'Original boat timber and fittings';material.side=THREE.DoubleSide;
 if(material.map)material.map.colorSpace=THREE.SRGBColorSpace;
 material.normalScale?.set(cloth?.30:.60,cloth?.30:.60);
 if(cloth){material.metalness=0;material.roughness=1;}
 material.userData.boatFabric=cloth;
 material.onBeforeCompile=shader=>{
  if(cloth)shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
   #if NUM_DIR_LIGHTS > 0
    for(int clothLight=0;clothLight<NUM_DIR_LIGHTS;clothLight++){
     float backlight=max(0.,-dot(geometryNormal,directionalLights[clothLight].direction));
     reflectedLight.directDiffuse+=diffuseColor.rgb*directionalLights[clothLight].color*backlight*.45*RECIPROCAL_PI;
    }
   #endif`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','gl_FragColor=sRGBTransferOETF(gl_FragColor);');
 };
 material.customProgramCacheKey=()=>`pacific-boat-display-${cloth?'cloth':'wood'}-v1`;
 return material;
}
