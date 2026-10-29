// Seamless, restrained surface detail for the procedural paddle, spars and sail.
// All fields are periodic in U and V. No external images or generated downloads.
import * as THREE from 'three';

const TAU=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;
const wrap=(x,n)=>((x%n)+n)%n;
function lattice(x,y,nx,ny){
  const a=wrap(x,nx),b=wrap(y,ny);
  const n=Math.sin(a*127.1+b*311.7+73.43)*43758.5453123;
  return n-Math.floor(n);
}
function periodicNoise(u,v,nx,ny){
  const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  return mix(mix(lattice(ix,iy,nx,ny),lattice(ix+1,iy,nx,ny),sx),mix(lattice(ix,iy+1,nx,ny),lattice(ix+1,iy+1,nx,ny),sx),sy);
}

/**
 * Pure sampler for inspection/tests. Output: red, green, blue (0..255), bump,
 * roughness (0..1). Wood fibres run along V, across U. Canvas is a plain weave.
 */
export function sampleMarineSurface(kind,u,v,out=new Float64Array(5)){
  if(kind==='wood'){
    const meander=.09*Math.sin(TAU*v)+.025*Math.sin(TAU*v*2+Math.sin(TAU*u));
    const fibres=.46*Math.sin(TAU*(u*27+meander))
      +.22*Math.sin(TAU*(u*79+meander*1.6))
      +.10*Math.sin(TAU*(u*139+meander*.8));
    const broad=periodicNoise(u,v,8,4)-.5;
    const pore=Math.pow(.5+.5*Math.sin(TAU*(u*79+meander*1.6)),12)*periodicNoise(u,v,64,8);
    const tone=1+broad*.035+fibres*.018-pore*.012;
    out[0]=236*tone;out[1]=224*tone;out[2]=203*tone;
    out[3]=.50+fibres*.045+broad*.025-pore*.025;
    out[4]=.88-fibres*.018+broad*.025;
  }else if(kind==='canvas'){
    // Sixty-four fine threads per tile. The alternating over/under height is
    // expressed continuously, so neither bump nor colour creates a seam.
    const warp=.5-.5*Math.cos(TAU*u*64),weft=.5-.5*Math.cos(TAU*v*64);
    const over=.5+.5*Math.cos(TAU*(u*32+v*32));
    const relief=Math.max(warp*(.76+.24*over),weft*(1-.24*over));
    const slub=periodicNoise(u,v,16,16)-.5;
    const mottle=periodicNoise(u,v,4,4)-.5;
    const tone=1+mottle*.012+slub*.006-relief*.012;
    out[0]=246*tone;out[1]=243*tone;out[2]=233*tone;
    out[3]=.45+relief*.20+slub*.012;
    out[4]=.95-relief*.022+slub*.012;
  }else throw new TypeError('Unknown marine surface: '+kind);
  return out;
}

// A normal browser uses CanvasTexture. CPU-only regression environments may
// provide a placeholder canvas; DataTexture preserves identical pixel data.
function surfaceTexture(data,size){
  if(typeof document!=='undefined'&&typeof document.createElement==='function'){
    try{
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const context=canvas.getContext?.('2d');
      const image=context?.createImageData?.(size,size);
      if(image?.data?.length===data.length&&typeof image.data.set==='function'&&typeof context.putImageData==='function'){
        image.data.set(data);context.putImageData(image,0,0);
        return new THREE.CanvasTexture(canvas);
      }
    }catch{/* The same pixels remain usable without a browser canvas. */}
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.flipY=true; // Match the canvas upload convention used by this project.
  texture.needsUpdate=true;
  return texture;
}

function makeSurface(kind,size,repeat){
  const channels=Array.from({length:3},()=>new Uint8Array(size*size*4));
  const sample=new Float64Array(5);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    sampleMarineSurface(kind,(x+.5)/size,(y+.5)/size,sample);
    const i=(y*size+x)*4;
    for(let c=0;c<3;c++)channels[0][i+c]=Math.round(sample[c]);
    channels[0][i+3]=255;
    const bump=Math.round(sample[3]*255),roughness=Math.round(sample[4]*255);
    for(let c=0;c<3;c++){channels[1][i+c]=roughness;channels[2][i+c]=bump;}
    channels[1][i+3]=channels[2][i+3]=255;
  }
  const textures=channels.map((data,index)=>{
    const texture=surfaceTexture(data,size);
    texture.name='marine-'+kind+'-'+['albedo','roughness','bump'][index];
    // The project deliberately uses a linear output pipeline without automatic
    // colour management. Data maps also always remain untagged.
    texture.colorSpace=THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=true;texture.anisotropy=4;
    return texture;
  });
  return {map:textures[0],roughnessMap:textures[1],bumpMap:textures[2],bumpScale:kind==='wood'?.00065:.00035};
}

/**
 * Each factory owns its textures; create once per canoe and dispose on teardown.
 * Safe defaults: 512² wood, 256² canvas; about 5 MiB including mipmaps.
 * Wood grain follows V: CylinderGeometry shafts and CapsuleGeometry blades can
 * use it directly. A custom sail MUST supply 0..1 UVs before using canvas maps.
 * Suggested scalar roughness: wood .52, canvas .98. Keep existing material
 * colours as the tint; these deliberately pale maps do not replace paintwork.
 *
 * Do not assign these over the loaded Magnific canoe's existing colour/normal
 * maps: its UV atlas contains unrelated islands and would stretch/reorient the
 * grain. Original authored maps should be preserved there.
 */
export function createMarineSurfaceMaps({woodRepeat=[1,1],canvasRepeat=[8,10]}={}){
  const wood=makeSurface('wood',512,woodRepeat),canvas=makeSurface('canvas',256,canvasRepeat);
  return {wood,canvas,dispose(){for(const surface of [wood,canvas])for(const key of ['map','roughnessMap','bumpMap'])surface[key].dispose();}};
}
