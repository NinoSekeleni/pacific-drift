import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup,prune,weld,simplify,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(process.argv[2]);
// The generated bird's beak faces +X and its wings run along Z.
// Preserve the body and extend the outer wings to an albatross-like span.
const adjusted=new Set();
for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives()){
  const position=primitive.getAttribute('POSITION');if(adjusted.has(position))continue;adjusted.add(position);
  const p=position.getArray(),n=primitive.getAttribute('NORMAL')?.getArray();
  for(let i=0;i<p.length;i+=3){
    const z=p[i+2],outside=Math.abs(z)>.12;
    if(!outside)continue;
    p[i+2]=Math.sign(z)*(.12+(Math.abs(z)-.12)*2.45);
    if(n){n[i+2]/=2.45;const len=Math.hypot(n[i],n[i+1],n[i+2]);n[i]/=len;n[i+1]/=len;n[i+2]/=len;}
  }
}
await MeshoptSimplifier.ready;
await doc.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.28,error:.003}),prune(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:84}));
await io.write('public/models/albatross.glb',doc);
