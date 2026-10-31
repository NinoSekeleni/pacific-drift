import * as T from 'three';
import {fishGeometry} from './vendor/tidewater/fish/FishGeometry.js';
import {SPECIES,SKIN} from './vendor/tidewater/fish/FishSpecies.js';
import {FISH} from './fishing-ecology.js';
const geometries=new Map();
export function createFish(id,{landed=false}={}){
 const f=FISH[id],S=SPECIES[f.model],skin=SKIN[f.model];if(!geometries.has(f.model))geometries.set(f.model,fishGeometry(S,{lod:1}));
 const mat=new T.MeshPhysicalMaterial({color:f.color??skin.flank,roughness:.3,metalness:.48,clearcoat:.65,side:T.DoubleSide});
 const uniforms={uFishTime:{value:0},uFishPhase:{value:Math.random()*6.28},uFishLanded:{value:landed?1:0},uFishBack:{value:new T.Color(skin.back)},uFishBelly:{value:new T.Color(skin.belly)}};
 mat.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uFishTime,uFishPhase,uFishLanded;varying vec3 vFishLocal;');s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvFishLocal=position;float tail=clamp(.5-position.z,0.,1.);transformed.x+=sin(tail*8.-uFishTime*5.+uFishPhase)*tail*tail*.07*(1.-uFishLanded*.8);`);s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vFishLocal;uniform vec3 uFishBack,uFishBelly;');s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat y=vFishLocal.y;vec3 skin=mix(uFishBelly,diffuseColor.rgb,smoothstep(-.08,.015,y));skin=mix(skin,uFishBack,smoothstep(.02,.14,y));float scales=sin(vFishLocal.z*220.+sin(y*250.))*sin(y*250.);diffuseColor.rgb=skin*(.96+.04*scales);`);};
 const mesh=new T.Mesh(geometries.get(f.model),mat);mesh.name=f.name;mesh.scale.y=f.bodyDepth??1;mesh.userData.fishUniforms=uniforms;return mesh;
}
