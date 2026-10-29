// Global game chart derived from the already installed Natural Earth world-atlas.
// No network access. Places are added only from a separately approved local file.
import fs from 'node:fs';import * as topo from 'topojson-client';
import {distance,wrapLng} from '../src/geo.js';
const old=JSON.parse(fs.readFileSync('public/data/land.json')),topology=JSON.parse(fs.readFileSync('node_modules/world-atlas/land-10m.json'));
const features=topo.feature(topology,topology.objects.land).features;
const bbox=r=>r.reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[Infinity,Infinity,-Infinity,-Infinity]);
const key=b=>b.map(x=>Math.round(x*1e4)).join(',');
const previous=new Map(old.polys.map(p=>[key(p.b),p]));
function simplify(pts,tol){if(pts.length<5)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack=[[0,pts.length-1]];
 while(stack.length){const [a,b]=stack.pop(),[ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1e-12;let max=-1,idx=-1;
  for(let i=a+1;i<b;i++){const d=Math.abs((pts[i][0]-ax)*dy-(pts[i][1]-ay)*dx)/len;if(d>max){max=d;idx=i;}}
  if(max>tol&&idx>0){keep[idx]=1;stack.push([a,idx],[idx,b]);}}
 return pts.filter((_,i)=>keep[i]);}
function encode(r){let x=0,y=0;return r.flatMap(([lng,lat])=>{const nx=Math.round(lng*1e4),ny=Math.round(lat*1e4),v=[nx-x,ny-y];x=nx;y=ny;return v;});}
const polys=[],kept=new Set();
for(const f of features){const rings=f.geometry.type==='Polygon'?[f.geometry.coordinates[0]]:f.geometry.coordinates.map(p=>p[0]);
 for(let r of rings){let b=bbox(r);if(b[2]-b[0]>180&&b[3]>-60&&r.length<20000){r=r.map(([x,y])=>[x<0?x+360:x,y]);b=bbox(r);}const p=previous.get(key(b));
  if(p){polys.push(p);kept.add(key(p.b));continue;}
  const tol=r.length>20000?.04:r.length>3000?.015:r.length>400?.004:.001;
  let clean=simplify(r,tol);if(clean.length<4)clean=r;
  polys.push({n:b[3]<-60?'Antarctica':'',h:b[3]<-60?2500:150,k:b[3]<-60?'ice':'high',b:b.map(v=>Math.round(v*1e4)/1e4),c:encode(clean)});
 }}
// Retain the owner's existing tiny Pacific islands and named geometry exactly.
for(const p of old.polys)if(!kept.has(key(p.b))&&!polys.some(q=>key(q.b)===key(p.b)))polys.push(p);
fs.writeFileSync('public/data/land-world.json',JSON.stringify({v:1,source:'Natural Earth / world-atlas 2.0.2, global outer coastlines with retained Pacific additions',polys}));
const countries=JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-10m.json'));
const owners=new Map();function allArcs(g){return g.type==='Polygon'?g.arcs.flat():g.arcs.flat(2);}
for(const g of countries.objects.countries.geometries)for(const a of allArcs(g)){const id=a<0?~a:a;if(!owners.has(id))owners.set(id,new Set());owners.get(id).add(g.id);}
const decoded=new Map();function arc(id){id=id<0?~id:id;if(decoded.has(id))return decoded.get(id);let x=0,y=0;const t=countries.transform;const a=countries.arcs[id].map(p=>{x+=p[0];y+=p[1];return[x*t.scale[0]+t.translate[0],y*t.scale[1]+t.translate[1]];});decoded.set(id,a);return a;}
function area(r){let a=0,x=r[0][0];for(let i=1;i<r.length;i++){const nx=x+wrapLng(r[i][0]-r[i-1][0]);a+=x*r[i][1]-nx*r[i-1][1];x=nx;}return Math.abs(a);}
const destinations=[];
for(const g of countries.objects.countries.geometries){
 const shapes=g.type==='Polygon'?[g.arcs]:g.arcs,feature=topo.feature(countries,g),geoShapes=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 let largest=0,big=0;geoShapes.forEach((p,i)=>{const a=area(p[0]);if(a>big){big=a;largest=i;}});
 const shore=[];let last=null;
 for(const a of shapes[largest][0]){const id=a<0?~a:a;if(owners.get(id)?.size!==1)continue;for(const [lng,lat]of arc(id)){if(last&&distance(last[0],last[1],lat,lng)<12000)continue;shore.push([+lat.toFixed(4),+wrapLng(lng).toFixed(4)]);last=[lat,lng];}}
 const unwrapped=[];let prev=geoShapes[largest][0][0][0];for(const [lng,lat]of geoShapes[largest][0]){prev=prev+wrapLng(lng-prev);unwrapped.push([prev,lat]);}const b=bbox(unwrapped);destinations.push({id:'country-'+g.id,name:g.properties.name,type:shore.length?'country':'landlocked',lat:(b[1]+b[3])/2,lng:wrapLng((b[0]+b[2])/2),coasts:shore});
}
for(let i=0;i<polys.length;i++){const p=polys[i];if(!p.n||['Antarctica','The Americas','Australia','Asia','New Guinea','Japan'].includes(p.n))continue;
 const same=destinations.some(d=>d.name===p.n);if(!same)destinations.push({id:'island-'+i,name:p.n,type:'island',poly:i,lat:(p.b[1]+p.b[3])/2,lng:wrapLng((p.b[0]+p.b[2])/2)});
}
// Scanline ocean/land mask at 1/8 degree. Run-length rows are small offline data;
// precise coastline intersection tests still validate every planned route segment.
const step=.125,width=2880,height=1361,rows=Array.from({length:height},()=>[]);
for(const p of polys){let x=0,y=0;const pts=[];for(let k=0;k<p.c.length;k+=2){x+=p.c[k];y+=p.c[k+1];pts.push([x/1e4,y/1e4]);}
 const minY=Math.max(0,Math.ceil((p.b[1]+85)/step)),maxY=Math.min(height-1,Math.floor((p.b[3]+85)/step));
 for(let j=minY;j<=maxY;j++){const lat=j*step-85,cross=[];
  for(let a=0,b=pts.length-1;a<pts.length;b=a++){const [x1,y1]=pts[a],[x2,y2]=pts[b];if((y1>lat)!==(y2>lat))cross.push(x1+(x2-x1)*(lat-y1)/(y2-y1));}
  cross.sort((a,b)=>a-b);
  for(let k=0;k+1<cross.length;k+=2)for(const shift of [-360,0,360]){const lo=Math.max(0,Math.ceil((cross[k]+shift+180)/step)),hi=Math.min(width-1,Math.floor((cross[k+1]+shift+180)/step));if(lo<=hi)rows[j].push([lo,hi]);}
 }}
const packedRows=rows.map(row=>{row.sort((a,b)=>a[0]-b[0]);const merged=[];for(const [a,b]of row){if(merged.length&&a<=merged.at(-1)[1]+1)merged.at(-1)[1]=Math.max(b,merged.at(-1)[1]);else merged.push([a,b]);}return merged.flat();});
let places=[];const placeFile=process.argv[2];if(placeFile&&fs.existsSync(placeFile)){const data=JSON.parse(fs.readFileSync(placeFile));places=data.features.map((f,i)=>({id:'place-'+i,name:f.properties.name||f.properties.NAME,alias:f.properties.nameascii||'',country:f.properties.adm0name||f.properties.ADM0NAME||'',lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],population:f.properties.pop_max||f.properties.POP_MAX||0,type:'place'})).filter(p=>p.name);}
const result={version:1,source:'Natural Earth / world-atlas 2.0.2. Public domain geography; world-atlas packaging ISC.',mask:{step,width,height,rows:packedRows},destinations,places};
fs.writeFileSync('public/data/navigation-world.json',JSON.stringify(result));
console.log(JSON.stringify({polygons:polys.length,destinations:destinations.length,places:places.length,landBytes:fs.statSync('public/data/land-world.json').size,navBytes:fs.statSync('public/data/navigation-world.json').size}));
