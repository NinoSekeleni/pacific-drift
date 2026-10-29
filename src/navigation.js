// Great-circle navigation for the simulated boat. Geography is Natural Earth;
// routes are validated against its actual coastline edges, not drawn through land.
import {Land,wrapLng,distance,bearing,R_EARTH} from './geo.js';
const RAD=Math.PI/180,DEG=180/Math.PI;
export function destinationPoint(p,bearingDeg,metres){const a=metres/R_EARTH,b=bearingDeg*RAD,lat=p.lat*RAD,lng=p.lng*RAD;const phi=Math.asin(Math.sin(lat)*Math.cos(a)+Math.cos(lat)*Math.sin(a)*Math.cos(b));return {lat:phi*DEG,lng:wrapLng((lng+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(lat),Math.cos(a)-Math.sin(lat)*Math.sin(phi)))*DEG)};}
export function greatCirclePoint(a,b,f){const d=distance(a.lat,a.lng,b.lat,b.lng);return destinationPoint(a,bearing(a.lat,a.lng,b.lat,b.lng),d*f);}
export const turnAngle=(to,from)=>((to-from+540)%360)-180;
export function crossTrack(point,a,b){const d=distance(a.lat,a.lng,point.lat,point.lng)/R_EARTH,angle=(bearing(a.lat,a.lng,point.lat,point.lng)-bearing(a.lat,a.lng,b.lat,b.lng))*RAD;return Math.asin(Math.max(-1,Math.min(1,Math.sin(d)*Math.sin(angle))))*R_EARTH;}
function intersect(a,b,c,d){const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const a1=cross(a,b,c),a2=cross(a,b,d),b1=cross(c,d,a),b2=cross(c,d,b);return a1*a2<=0&&b1*b2<=0&&Math.max(a[0],b[0])+1e-9>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])+1e-9>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])+1e-9>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])+1e-9>=Math.min(a[1],b[1]);}
export class CoastIndex{
 constructor(land){this.land=land;this.edges=[];this.bins=new Map();
  for(const poly of land.polys){const p=poly.pts,n=p.length/2;for(let i=0,j=n-1;i<n;j=i++){
   const x=p[j*2],y=p[j*2+1],x2=x+wrapLng(p[i*2]-x),y2=p[i*2+1];if(Math.abs(y-y2)+Math.abs(x-x2)<1e-9)continue;
   const edge={a:[x,y],b:[x2,y2],poly:poly.id},id=this.edges.length;this.edges.push(edge);
   for(let ix=Math.floor(Math.min(x,x2));ix<=Math.floor(Math.max(x,x2));ix++)for(let iy=Math.floor(Math.min(y,y2));iy<=Math.floor(Math.max(y,y2));iy++){const key=wrapLng(ix+.5)-.5+','+iy;if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key).push(id);}
  }}
 }
 nearby(a,b){const x=a.lng,x2=x+wrapLng(b.lng-x),seen=new Set();for(let ix=Math.floor(Math.min(x,x2));ix<=Math.floor(Math.max(x,x2));ix++)for(let iy=Math.floor(Math.min(a.lat,b.lat));iy<=Math.floor(Math.max(a.lat,b.lat));iy++){const key=wrapLng(ix+.5)-.5+','+iy;for(const id of this.bins.get(key)||[])seen.add(id);}return seen;}
 segmentClear(a,b){const x=a.lng,x2=x+wrapLng(b.lng-x),aa=[x,a.lat],bb=[x2,b.lat];for(const id of this.nearby(a,b)){const e=this.edges[id],shift=Math.round((x-e.a[0])/360)*360,c=[e.a[0]+shift,e.a[1]],d=[e.b[0]+shift,e.b[1]];if(intersect(aa,bb,c,d))return false;}return true;}
 clear(a,b){const dist=distance(a.lat,a.lng,b.lat,b.lng),steps=Math.max(1,Math.ceil(dist/16000));let previous=a;for(let i=1;i<=steps;i++){const p=i===steps?b:greatCirclePoint(a,b,i/steps);if(!this.segmentClear(previous,p))return false;previous=p;}return true;}
 nearest(p,polyId=null){let best={distance:Infinity};const cos=Math.max(.04,Math.cos(p.lat*RAD));let ids;
  if(polyId!=null)ids=this.edges.map((_,i)=>i).filter(i=>this.edges[i].poly===polyId);
  else{let local=new Set();for(const radius of [1,3,12]){for(let x=Math.floor(p.lng-radius);x<=Math.ceil(p.lng+radius);x++)for(let y=Math.floor(p.lat-radius);y<=Math.ceil(p.lat+radius);y++)for(const id of this.bins.get(wrapLng(x+.5)-.5+','+y)||[])local.add(id);if(local.size>0)break;}ids=local.size?[...local]:this.edges.keys();}
  for(const id of ids){const e=this.edges[id],x=e.a[0]+Math.round((p.lng-e.a[0])/360)*360,x2=x+e.b[0]-e.a[0],dx=(x2-x)*cos,dy=e.b[1]-e.a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p.lng-x)*cos*dx+(p.lat-e.a[1])*dy)/den)):0;
   const point={lat:e.a[1]+dy*t,lng:wrapLng(x+(x2-x)*t)},d=distance(p.lat,p.lng,point.lat,point.lng);if(d<best.distance)best={...point,distance:d,poly:e.poly};}
  return best;
 }
 approach(coast,from){const direct=bearing(coast.lat,coast.lng,from.lat,from.lng),candidates=[];
  for(const radius of [150,450,1200])for(let turn=0;turn<360;turn+=30){const p=destinationPoint(coast,direct+turn,radius);const first=destinationPoint(coast,direct+turn,2);if(!this.land.landAt(first.lat,first.lng)&&!this.land.landAt(p.lat,p.lng)&&this.clear(first,p))candidates.push({...p,coast:{lat:coast.lat,lng:coast.lng},inlandDistance:coast.distance??0});}
  candidates.sort((a,b)=>distance(a.lat,a.lng,from.lat,from.lng)-distance(b.lat,b.lng,from.lat,from.lng));return candidates[0]||null;
 }
}
class Heap{constructor(){this.items=[];}push(node,score){const item={node,score};let i=this.items.length;this.items.push(item);while(i){const p=(i-1)>>1;if(this.items[p].score<=score)break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}pop(){const top=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(true){let c=i*2+1;if(c>=this.items.length)break;if(c+1<this.items.length&&this.items[c+1].score<this.items[c].score)c++;if(this.items[c].score>=last.score)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return top;}get length(){return this.items.length;}}
export class SeaRouter{
 constructor(landData,chart){this.land=landData instanceof Land?landData:new Land(landData);this.coast=new CoastIndex(this.land);this.chart=chart;const mask=chart.mask;this.step=mask.step;this.width=mask.width;this.height=mask.height;this.mask=new Uint8Array(this.width*this.height);
  for(let y=0;y<mask.rows.length;y++)for(let k=0;k<mask.rows[y].length;k+=2)this.mask.fill(1,y*this.width+mask.rows[y][k],y*this.width+mask.rows[y][k+1]+1);
  this.edgeCache=new Map();
 }
 key(x,y){return y*this.width+((x%this.width)+this.width)%this.width;}
 point(id){return {lat:Math.floor(id/this.width)*this.step-85,lng:(id%this.width)*this.step-180};}
 ocean(id){const y=Math.floor(id/this.width);return y>=8&&y<this.height-8&&!this.mask[id];}
 edge(a,b){const key=a<b?a+':'+b:b+':'+a;if(this.edgeCache.has(key))return this.edgeCache.get(key);const good=this.coast.clear(this.point(a),this.point(b));this.edgeCache.set(key,good);if(this.edgeCache.size>350000)this.edgeCache.clear();return good;}
 links(p){const x=Math.round((wrapLng(p.lng)+180)/this.step),y=Math.round((p.lat+85)/this.step),candidates=[];
  for(let r=0;r<=16;r++){for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const id=this.key(x+dx,y+dy);if(!this.ocean(id))continue;const q=this.point(id),d=distance(p.lat,p.lng,q.lat,q.lng);candidates.push({id,d});}if(candidates.length>60&&r>=8)break;}
  candidates.sort((a,b)=>a.d-b.d);const visible=[];for(const c of candidates){if(this.coast.clear(p,this.point(c.id)))visible.push(c);if(visible.length===12)break;}return visible;
 }
 resolveTarget(target,from){
  if(target.type==='country'&&target.coasts?.length){const sorted=target.coasts.map(([lat,lng])=>({lat,lng,d:distance(from.lat,from.lng,lat,lng)})).sort((a,b)=>a.d-b.d),spread=[];
   for(const p of sorted){if(spread.every(q=>distance(p.lat,p.lng,q.lat,q.lng)>150000))spread.push(p);if(spread.length>=10)break;}
   return spread.map(p=>this.coast.approach(this.coast.nearest(p),from)).filter(Boolean);
  }
  if(target.type==='island'){const c=this.coast.nearest(from,target.poly);return [this.coast.approach({...c,distance:0},from)].filter(Boolean);}
  const p={lat:target.lat,lng:wrapLng(target.lng)};
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>84)throw Error('Choose a point between 84° south and 84° north.');
  if(this.land.landAt(p.lat,p.lng)||target.type==='place'||target.type==='landlocked'){const coast=this.coast.nearest(p);return [this.coast.approach(coast,from)].filter(Boolean);}
  return [p];
 }
 plan(start,target,{maxVisited=180000,onProgress=()=>{}}={}){
  if(this.land.landAt(start.lat,start.lng))throw Error('The boat is already on land. Start a new voyage to navigate.');
  const targets=this.resolveTarget(target,start);if(!targets.length)throw Error('An ocean approach could not be found for this destination.');
  let direct=null;for(const p of targets)if(this.coast.clear(start,p)){const d=distance(start.lat,start.lng,p.lat,p.lng);if(!direct||d<direct.distance)direct={points:[start,p],distance:d,approach:p,visited:0};}if(direct)return direct;
  const starts=this.links(start),goals=new Map();const addGoals=(t,i)=>this.links(t).forEach(c=>{if(!goals.has(c.id)||c.d<goals.get(c.id).d)goals.set(c.id,{...c,target:i});});targets.forEach(addGoals);
  // A town may sit inside an inlet narrower than the route grid. Find a nearby
  // open coastal approach instead of inventing a route through the headland.
  if(!goals.size&&['place','landlocked'].includes(target.type)){
   const nearby=[];for(const e of this.coast.edges){const p={lat:e.a[1],lng:wrapLng(e.a[0])},d=distance(target.lat,target.lng,p.lat,p.lng);if(d<80000)nearby.push({...p,distance:d});}nearby.sort((a,b)=>a.distance-b.distance);const tried=[];
   for(const p of nearby){if(tried.some(q=>distance(p.lat,p.lng,q.lat,q.lng)<3000))continue;tried.push(p);const t=this.coast.approach(p,start);if(!t)continue;targets.push(t);addGoals(t,targets.length-1);if(goals.size)break;}
  }
  if(!starts.length||!goals.size)throw Error('This coast is too enclosed for the current ocean chart. Choose a point outside the inlet.');
  const scores=new Map(),parents=new Map(),closed=new Set(),queue=new Heap(),heuristic=id=>{const p=this.point(id);return Math.min(...targets.map(t=>distance(p.lat,p.lng,t.lat,t.lng)));};
  for(const s of starts){scores.set(s.id,s.d);queue.push(s.id,s.d+heuristic(s.id));}
  let end=null,endTarget=null,visited=0;
  while(queue.length){const {node:id}=queue.pop();if(closed.has(id))continue;closed.add(id);visited++;
   if(goals.has(id)){end=id;endTarget=targets[goals.get(id).target];break;}
   if(visited>maxVisited)throw Error('Route search reached its chart limit. Add an offshore waypoint to split this passage.');
   if(visited%2500===0)onProgress(visited);
   const x=id%this.width,y=Math.floor(id/this.width),coarse=x%4===0&&y%4===0;let near=false;
   for(const [dx,dy]of [[-4,0],[4,0],[0,-4],[0,4],[-4,-4],[4,4],[-4,4],[4,-4]])if(!this.ocean(this.key(x+dx,y+dy)))near=true;
   const next=[];
   if(coarse)for(const dx of [-4,0,4])for(const dy of [-4,0,4])if(dx||dy)next.push(this.key(x+dx,y+dy));
   if(near){for(const dx of [-1,0,1])for(const dy of [-1,0,1])if(dx||dy)next.push(this.key(x+dx,y+dy));}
   else if(!coarse){for(const dx of [Math.floor(x/4)*4,Math.ceil(x/4)*4])for(const dy of [Math.floor(y/4)*4,Math.ceil(y/4)*4])next.push(this.key(dx,dy));}
   const p=this.point(id);for(const other of next){if(other===id||closed.has(other)||!this.ocean(other)||!this.edge(id,other))continue;const q=this.point(other),cost=scores.get(id)+distance(p.lat,p.lng,q.lat,q.lng);if(cost>=(scores.get(other)??Infinity))continue;scores.set(other,cost);parents.set(other,id);queue.push(other,cost+heuristic(other));}
  }
  if(end==null)throw Error('No open-water route was found. Try a nearby coast or add an offshore waypoint.');
  const raw=[endTarget];for(let n=end;n!=null;n=parents.get(n))raw.push(this.point(n));raw.push(start);raw.reverse();
  const points=[raw[0]];let at=0;while(at<raw.length-1){let next=at+1;for(let i=raw.length-1;i>at+1;i--)if(this.coast.clear(raw[at],raw[i])){next=i;break;}points.push(raw[next]);at=next;}
  let total=0;for(let i=1;i<points.length;i++)total+=distance(points[i-1].lat,points[i-1].lng,points[i].lat,points[i].lng);
  return {points,distance:total,approach:endTarget,visited};
 }
}
export function navigationState(voyage,route,velocity={}){
 const points=route?.points;if(!points?.length)return null;let leg=Math.max(1,Math.min(points.length-1,route.leg||1));
 const boat={lat:voyage.lat,lng:voyage.lng};while(leg<points.length-1){const a=points[leg-1],b=points[leg],ab=distance(a.lat,a.lng,b.lat,b.lng),ap=distance(a.lat,a.lng,boat.lat,boat.lng),passed=Math.cos(turnAngle(bearing(a.lat,a.lng,boat.lat,boat.lng),bearing(a.lat,a.lng,b.lat,b.lng))*RAD)*ap>ab;
  if(distance(boat.lat,boat.lng,b.lat,b.lng)<Math.max(120,Math.min(700,ab*.03))||(passed&&Math.abs(crossTrack(boat,a,b))<1200))leg++;else break;
 }
 const next=points[leg],to=distance(boat.lat,boat.lng,next.lat,next.lng),course=bearing(boat.lat,boat.lng,next.lat,next.lng);let remaining=to;
 for(let i=leg+1;i<points.length;i++)remaining+=distance(points[i-1].lat,points[i-1].lng,points[i].lat,points[i].lng);
 const sog=Number.isFinite(velocity.sog)?velocity.sog:Math.hypot(velocity.ve||0,velocity.vn||0),cog=sog>.05?(Math.atan2(velocity.ve||0,velocity.vn||0)*DEG+360)%360:null,vmg=cog==null?0:sog*Math.cos(turnAngle(cog,course)*RAD);
 return {leg,course,toWaypoint:to,remaining,crossTrack:crossTrack(boat,points[leg-1],next),sog,cog,vmg,etaSeconds:vmg>.15?remaining/vmg:null,arrived:leg===points.length-1&&to<150};
}
