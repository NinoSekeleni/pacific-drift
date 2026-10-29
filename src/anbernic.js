import * as THREE from 'three';
// Pocket Garden and the RG35XX are reused from the owner's Object Room project.
export function createAnbernic({getVoyage,save=()=>{}}){
const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
let state={screen:'title',x:9,y:7,seeds:[],steps:0,message:'',messageUntil:0},playing=false,power=true,last=-1,lastVoyage=null,screenInfo=null,finish='classic';
const seedLocations=[[3,3],[14,3],[5,6],[17,6],[2,10],[14,10],[6,12],[17,12]],beep=()=>{},status=()=>{};
function blocked(x,y){return x<1||x>18||y<2||y>13||(x>=8&&x<=11&&y<=4)||(x>=7&&x<=10&&y>=9&&y<=11);}
function message(m){state.message=m;state.messageUntil=performance.now()+4300;}
function move(k){if(state.screen!=='game')return;let x=state.x+(k==='Right'?1:k==='Left'?-1:0),y=state.y+(k==='Down'?1:k==='Up'?-1:0);if(blocked(x,y))return;state.x=x;state.y=y;state.steps++;
  const i=seedLocations.findIndex(([sx,sy])=>sx===x&&sy===y);if(i>=0&&!state.seeds.includes(i)){state.seeds.push(i);beep(800+state.seeds.length*65);if(state.seeds.length===8){message('ALL 8 SEEDS FOUND! YOUR GARDEN IS GROWING.');status('Pocket Garden · All eight seeds found');}}
}
function label(text,x,y,size=9,color='#e2edc9',align='left'){ctx.fillStyle=color;ctx.font=`${size}px monospace`;ctx.textAlign=align;ctx.fillText(text,x,y);}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
function drawTitle(t){
  rect(0,0,320,240,'#26392c');for(let i=0;i<20;i++){const x=(i*71)%320,y=(i*37)%240;rect(x,y,1,1,'#718568');}
  label('THE OBJECT ROOM PRESENTS',160,34,8,'#a4b28a','center');
  label('POCKET',160,93,29,'#e2ebbc','center');label('GARDEN',160,123,29,'#d4e77e','center');
  drawTree(50,151);drawTree(250,151);rect(0,197,320,43,'#344d33');
  if(Math.floor(t/800)%2===0)label('PRESS START TO WANDER',160,181,10,'#e2ebbc','center');
  label('AN ORIGINAL MINI ADVENTURE',160,220,8,'#a9be8b','center');
}
function drawTree(x,y){rect(x+6,y+13,5,13,'#6a6343');rect(x-3,y+1,23,16,'#355637');rect(x+1,y-5,15,10,'#477348');rect(x+2,y,5,4,'#739858');rect(x+11,y+7,5,4,'#294a34');}
function drawGarden(t){
  rect(0,0,320,240,'#a1b66b');
  for(let y=2;y<15;y++)for(let x=0;x<20;x++){if((x*17+y*31)%7===0){rect(x*16+4,y*16+7,2,3,'#91a45f');rect(x*16+7,y*16+5,2,3,'#b6c17b');}}
  rect(0,109,320,22,'#c4bb8d');rect(147,72,24,154,'#c4bb8d');
  // Pond, stepping stones and the little cabin.
  rect(111,143,67,50,'#879e68');rect(115,146,59,44,'#659ea0');rect(120,153,50,32,'#77b6ac');
  for(let i=0;i<5;i++){const x=120+i*9;rect(x,158+(i%2)*14,5,2,Math.floor(t/600)%2?'#acd2ba':'#98c9b8');}
  rect(128,39,64,39,'#d8cca1');rect(125,35,70,10,'#756757');rect(131,29,58,9,'#8d6e59');rect(137,23,46,8,'#9d7e62');rect(152,55,15,23,'#5b6147');rect(137,52,9,10,'#5d8981');rect(176,52,9,10,'#5d8981');
  for(let x=0;x<20;x++){drawTree(x*16-4,208);if(x<7||x>12)drawTree(x*16-4,14);}
  for(let y=3;y<13;y+=2){drawTree(-9,y*16);drawTree(303,y*16);}
  for(let i=0;i<seedLocations.length;i++){if(state.seeds.includes(i))continue;const [x,y]=seedLocations[i],bob=Math.floor(t/400+i)%2;rect(x*16+5,y*16+4+bob,6,8,'#886d38');rect(x*16+6,y*16+3+bob,4,7,'#f7da75');rect(x*16+7,y*16+4+bob,2,3,'#fff0bc');}
  // Original 10 x 14 pixel explorer sprite.
  const px=state.x*16+3,py=state.y*16+1;
  rect(px-1,py+13,13,3,'#879763');rect(px+2,py+2,7,7,'#dfb982');rect(px,py,11,4,'#c26b4c');rect(px+1,py+4,2,4,'#594935');rect(px+3,py+8,5,5,'#566c8a');rect(px+1,py+9,2,3,'#ddba8b');rect(px+8,py+9,2,3,'#ddba8b');rect(px+2,py+13,3,2,'#454e50');rect(px+6,py+13,3,2,'#454e50');
  rect(0,0,320,18,'#263a2d');label('POCKET GARDEN',9,12,9);label(`SEEDS ${state.seeds.length}/8`,311,12,9,'#dbe99f','right');
  rect(0,227,320,13,'#263a2d');label('D-PAD: WANDER',8,236,7,'#a8bd90');label('A: EXPLORE',311,236,7,'#a8bd90','right');
  if(state.message&&t<state.messageUntil){rect(12,172,296,48,'#e3dfb7');rect(15,175,290,42,'#2d432f');const words=state.message.split(' ');let lines=[''];for(const word of words){if((lines.at(-1)+word).length>37)lines.push('');lines[lines.length-1]+=word+' ';}lines.forEach((l,i)=>label(l,24,191+i*13,9,'#e3dfb7'));}
  if(state.screen==='paused'){rect(85,92,150,50,'#26392c');label('PAUSED',160,113,14,'#e4e9bf','center');label('PRESS START',160,132,8,'#adb98c','center');}
}

function input(k){if(k==='Power'){power=!power;return;}if(!power)return;if(state.screen==='title'){state.screen='game';}else if(k==='Start'){state.screen=state.screen==='paused'?'game':'paused';}else if(k==='A'){message(state.seeds.length===8?'ALL EIGHT SEEDS FOUND. WELL PLAYED!':'FIND EIGHT GOLDEN SEEDS. TAKE YOUR TIME.');}else if(k==='B'){state.message='';}else move(k);const v=getVoyage();if(v){v.handheld={...state,finish,message:'',messageUntil:0};save(v);}}
function update(dt,time){const v=getVoyage();if(v&&v!==lastVoyage){lastVoyage=v;if(v.handheld){state={...state,...v.handheld};finish=v.handheld.finish||'classic';}}if(time-last<.1)return;last=time;if(!power){ctx.fillStyle='#111916';ctx.fillRect(0,0,320,240);}else if(state.screen==='title')drawTitle(time*1000);else drawGarden(time*1000);texture.needsUpdate=true;}
function applyFinish(root){root?.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m.userData.anbernicShell||m.userData.appliedFinish===finish)continue;m.userData.appliedFinish=finish;const clear=finish==='atomic';m.color.set(clear?'#8055a4':'#aaa795');m.transmission=0;m.transparent=clear;m.opacity=clear?.32:1;m.depthWrite=!clear;m.side=clear?THREE.FrontSide:THREE.DoubleSide;m.thickness=0;m.ior=1.46;m.roughness=clear?.15:.62;m.clearcoat=clear?.25:.05;m.clearcoatRoughness=.12;m.needsUpdate=true;}});}
function attachScreen(root){root.traverse(o=>{if(!o.isMesh)return;const convert=m=>{if(!/ABS/i.test(m.name))return m;const p=new THREE.MeshPhysicalMaterial({color:m.color,roughness:.62,metalness:0});p.name=m.name;p.userData.anbernicShell=true;return p;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});applyFinish(root);if(!screenInfo)return;const s=screenInfo,mesh=new THREE.Mesh(new THREE.PlaneGeometry(s.width,s.height),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));mesh.name='Live Anbernic display';mesh.position.set(s.x,s.y,s.z);mesh.userData.liveScreen=true;root.add(mesh);}
return {input,update,attachScreen,applyFinish,get finish(){return finish;},setFinish(value){finish=value;const v=getVoyage();if(v){v.handheld={...state,finish};save(v);}},setScreenInfo:s=>{screenInfo=s;},get playing(){return playing;},set playing(v){playing=v;},get power(){return power;},get state(){return state;}};
}
