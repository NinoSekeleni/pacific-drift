import * as THREE from 'three';
// Reconstruct the supplied model's existing LCD from its atlas UVs. No floating
// replacement panel: the overlay follows the actual front surface in metre space.
export function lcdSurface(root){
 root.updateMatrixWorld(true);
 const samples=[[.507,.392],[.710,.392],[.710,.472],[.507,.472]],corners=[];
 const pa=new THREE.Vector3(),pb=new THREE.Vector3(),pc=new THREE.Vector3(),p=new THREE.Vector3(),normal=new THREE.Vector3();
 const a=new THREE.Vector2(),b=new THREE.Vector2(),c=new THREE.Vector2();
 for(const [u,v]of samples){let found=null;
  root.traverse(o=>{
   if(found||!o.isMesh||!(Array.isArray(o.material)?o.material:[o.material]).some(m=>/walkman/i.test(m.name)))return;
   const g=o.geometry,pos=g.attributes.position,uv=g.attributes.uv;if(!uv)return;
   const index=g.index,count=index?.count??pos.count;
   for(let j=0;j<count;j+=3){const ids=[0,1,2].map(k=>index?index.getX(j+k):j+k);
    a.fromBufferAttribute(uv,ids[0]);b.fromBufferAttribute(uv,ids[1]);c.fromBufferAttribute(uv,ids[2]);
    const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-9)continue;
    const x=((b.y-c.y)*(u-c.x)+(c.x-b.x)*(v-c.y))/den,y=((c.y-a.y)*(u-c.x)+(a.x-c.x)*(v-c.y))/den,z=1-x-y;
    if(Math.min(x,y,z)<-1e-5)continue;
    pa.fromBufferAttribute(pos,ids[0]).applyMatrix4(o.matrixWorld);pb.fromBufferAttribute(pos,ids[1]).applyMatrix4(o.matrixWorld);pc.fromBufferAttribute(pos,ids[2]).applyMatrix4(o.matrixWorld);
    normal.subVectors(pb,pa).cross(p.copy(pc).sub(pa)).normalize();
    found=pa.clone().multiplyScalar(x).addScaledVector(pb,y).addScaledVector(pc,z).addScaledVector(normal,.00012);break;
   }
  });
  if(!found)return null;corners.push(found);
 }
 return corners;
}
export function displayLines(media={}){
 const tape=media.spotify??{},active=media.mode==='TAPE'&&media.on;
 const status=!active?'STANDBY':tape.error?'UNAVAILABLE':!tape.ready?'CONNECTING':tape.isBuffering?'BUFFERING':tape.playing?'PLAYING':'PRESS PLAY';
 const seconds=Math.floor((tape.position||0)/1000),time=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 return {status,time,progress:tape.duration>0?Math.min(1,(tape.position||0)/tape.duration):0};
}
export function createWalkmanDisplay(root){
 const corners=lcdSurface(root);if(!corners){console.warn('Walkman LCD surface could not be located');return null;}
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;const ctx=canvas.getContext('2d');
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(p=>p.toArray()),3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([1,0,0,0,0,1,1,1],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
 const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
 const mesh=new THREE.Mesh(g,material);mesh.name='Live Spotify LCD';mesh.userData.liveScreen=true;root.add(mesh);
 let last='';
 function update(media){const lines=displayLines(media),key=JSON.stringify(lines);if(key===last)return;last=key;
  ctx.fillStyle='#91a38b';ctx.fillRect(0,0,512,192);ctx.strokeStyle='#314339';ctx.lineWidth=3;ctx.strokeRect(7,7,498,178);
  ctx.fillStyle='#14281e';ctx.textAlign='left';ctx.font='600 36px monospace';ctx.fillText('SPOTIFY',22,51);
  ctx.font='500 29px monospace';ctx.fillText(lines.status,22,97);ctx.font='30px monospace';ctx.fillText(lines.time,22,145);
  ctx.fillRect(205,133,278,5);ctx.fillRect(205,125,Math.max(3,278*lines.progress),18);texture.needsUpdate=true;
 }
 update({});return {mesh,texture,update};
}
