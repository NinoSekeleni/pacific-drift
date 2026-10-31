// The South African flag flown on a small staff at the rowing boat's stern. The launch flies the
// same flag through its own fittings material (launch-materials.js). The cloth streams with the
// apparent wind and flutters harder as it freshens; in a calm it droops against the staff.
import * as T from 'three';
import {LAYER_NEAR} from './sky.js';

// Colour at flag coordinates (u along the fly 0..1 from the hoist, v 0 bottom .. 1 top).
// The pall's centre lines run from the hoist corners to the centre of the flag.
export function saFlagColour(u,v){
 const x=u*3,y=v*2-1,seg=(ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
 const d=Math.min(seg(0,1,1.5,0),seg(0,-1,1.5,0),x>1.5?Math.abs(y):Math.hypot(x-1.5,y)),tri=x<1.5*(1-Math.abs(y));
 if(d<.2)return 'green';if(d<1/3)return tri?'gold':'white';if(tri)return 'black';return y>0?'red':'blue';
}
const RGB={green:[0,119,73],gold:[255,184,28],white:[246,246,246],black:[6,6,6],red:[224,60,49],blue:[0,20,137]};

let texture=null;
function flagTexture(){
 if(texture)return texture;const W=192,H=128,data=new Uint8Array(W*H*4);
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=(j*W+i)*4,col=RGB[saFlagColour((i+.5)/W,(j+.5)/H)];data[k]=col[0];data[k+1]=col[1];data[k+2]=col[2];data[k+3]=255;}
 texture=new T.DataTexture(data,W,H);texture.colorSpace=T.NoColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

export const flagUniforms={uFlagTime:{value:0},uFlagWind:{value:5},uFlagStream:{value:new T.Vector2(0,1)}};

export function createSternFlag({width=.36,staff=.75}={}){
 const group=new T.Group();group.name='South African flag';
 const pole=new T.Mesh(new T.CylinderGeometry(.008,.011,staff,8),new T.MeshStandardMaterial({color:0x8a6a44,roughness:.55}));pole.position.y=staff/2;group.add(pole);
 const truck=new T.Mesh(new T.SphereGeometry(.016,8,6),new T.MeshStandardMaterial({color:0xb08a3c,roughness:.3,metalness:.8}));truck.position.y=staff+.01;group.add(truck);
 const h=width*2/3,geo=new T.PlaneGeometry(width,h,14,7);geo.translate(width/2,staff-h/2-.03,0);
 const mat=new T.MeshStandardMaterial({map:flagTexture(),roughness:.85,side:T.DoubleSide,emissive:0xffffff,emissiveMap:flagTexture(),emissiveIntensity:.18}); // thin cloth lets some light through
 mat.onBeforeCompile=s=>{Object.assign(s.uniforms,flagUniforms);
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uFlagTime,uFlagWind;uniform vec2 uFlagStream;')
   .replace('#include <begin_vertex>',`#include <begin_vertex>
   {float along=transformed.x,fu=along/${width.toFixed(3)},wind=clamp(uFlagWind/12.,0.,1.);
    float droop=(1.-wind)*1.2*(fu*.5+.5);
    float flutter=sin(fu*9.-uFlagTime*(wind*9.+4.)+transformed.y*14.)*fu*(wind*.05+.012);
    vec2 dir=normalize(uFlagStream+vec2(1e-4)),lat=vec2(-dir.y,dir.x);
    transformed=vec3(dir.x*along*cos(droop)+lat.x*flutter,transformed.y-along*sin(droop),dir.y*along*cos(droop)+lat.y*flutter);}`);};
 mat.customProgramCacheKey=()=> 'pd-sa-flag-v1';
 const cloth=new T.Mesh(geo,mat);cloth.frustumCulled=false;group.add(cloth);
 group.traverse(o=>{o.layers.set(LAYER_NEAR);if(o.isMesh)o.castShadow=true;});
 return group;
}
