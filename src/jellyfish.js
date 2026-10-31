// Aurelia bell formula adapted from Holtsetio's MIT demo; CPU constraints replace its WebGPU Verlet solver.
import * as T from 'three';
export function bellPoint(phase,zenith,azimuth,out=new T.Vector3()){
 const z=zenith*.92,p=phase-z*z*.95+Math.PI*.5,xr=(Math.sin(p)*.3+1.3)*(1+Math.sin(azimuth*16+Math.PI*.5)*.02*zenith**3),polar=(Math.sin(p+3)*.15+.5)*z*Math.PI;
 return out.set(Math.sin(azimuth)*Math.sin(polar)*xr,Math.cos(polar)-.42,Math.cos(azimuth)*Math.sin(polar)*xr);
}
export function createJellyfish({seed=0,size=.16}={}){
 const root=new T.Group(),rows=16,cols=48,positions=new Float32Array((rows+1)*(cols+1)*3),indices=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let a=y*(cols+1)+x,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));geo.setIndex(indices);
 const mat=new T.MeshPhysicalMaterial({color:0xdce8e6,emissive:0x35505b,emissiveIntensity:.35,roughness:.24,metalness:0,transparent:true,opacity:.43,side:T.DoubleSide,depthWrite:false,clearcoat:.5});
 const bell=new T.Mesh(geo,mat);root.add(bell);const strands=20,segments=12,points=new Float32Array(strands*(segments+1)*3),previous=new Float32Array(points.length),linePositions=new Float32Array(strands*segments*6),lineGeo=new T.BufferGeometry();lineGeo.setAttribute('position',new T.BufferAttribute(linePositions,3));const lines=new T.LineSegments(lineGeo,new T.LineBasicMaterial({color:0xb5b3c2,transparent:true,opacity:.3,depthWrite:false}));root.add(lines);
 // Four oral arms are broader than the marginal tentacles.
 const arms=new T.Group();for(let i=0;i<4;i++){const g=new T.TubeGeometry(new T.CatmullRomCurve3(Array.from({length:10},(_,k)=>new T.Vector3(Math.sin(k*.9+i)*.11,-k*.11,Math.cos(k*.9+i)*.11))),16,.035,4,false);const arm=new T.Mesh(g,mat.clone());arm.rotation.y=i*Math.PI/2;arm.position.set(Math.sin(i*Math.PI/2)*.12,0,Math.cos(i*Math.PI/2)*.12);arms.add(arm);}root.add(arms);
 let ready=false;const temp=new T.Vector3();root.scale.setScalar(size);root.userData.diameter=size*3.2;
 function update(dt,time){const phase=time*1.7+seed;
 for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){bellPoint(phase,y/rows,x/cols*Math.PI*2,temp);temp.toArray(positions,(y*(cols+1)+x)*3);}geo.attributes.position.needsUpdate=true;geo.computeVertexNormals();
 const step=Math.min(dt,.033),length=.09;
 for(let i=0;i<strands;i++){const base=i*(segments+1)*3,angle=i/strands*Math.PI*2;bellPoint(phase,1,angle,temp);for(let j=0;j<=segments;j++){const k=base+j*3;if(!ready){points[k]=temp.x;points[k+1]=temp.y-j*length;points[k+2]=temp.z;previous.set(points.subarray(k,k+3),k);}if(j){const x=points[k],y=points[k+1],z=points[k+2];points[k]+=(x-previous[k])*.94+Math.sin(time*.6+i+j*.2)*step*step*.8;points[k+1]+=(y-previous[k+1])*.94-step*step*.4;points[k+2]+=(z-previous[k+2])*.94+Math.cos(time*.5+i)*step*step*.4;previous[k]=x;previous[k+1]=y;previous[k+2]=z;}}
 for(let iteration=0;iteration<4;iteration++){temp.toArray(points,base);for(let j=1;j<=segments;j++){const k=base+j*3,a=k-3,dx=points[k]-points[a],dy=points[k+1]-points[a+1],dz=points[k+2]-points[a+2],d=Math.hypot(dx,dy,dz)||1,f=(d-length)/d;points[k]-=dx*f;points[k+1]-=dy*f;points[k+2]-=dz*f;}}
 for(let j=0;j<segments;j++){const a=base+j*3,k=(i*segments+j)*6;linePositions.set(points.subarray(a,a+3),k);linePositions.set(points.subarray(a+3,a+6),k+3);}}
 ready=true;lineGeo.attributes.position.needsUpdate=true;arms.rotation.y=Math.sin(time*.3+seed)*.12;arms.scale.y=1+Math.sin(phase-1)*.12;
 }
 return{root,update,dispose(){root.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}};
}
