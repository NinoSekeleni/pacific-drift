// Skin and shape of the fish you catch. The shading is a GLSL port of Tidewater's FishMaterial
// (MIT; WGSL there): counter-shading from the dark back to the pale belly, overlapping scales in
// rows (colour and relief, faded out below a pixel), the lateral line, the edge of the gill cover,
// lips and nostrils, silvery guanine reflection with an iridescent sheen, ray-striped fins that
// thin toward the edge, and eyes with a pupil, a streaked iris and a glossy cornea. The vertex
// stage poses the model: a swimming wave while it fights, and on deck an open jaw and a body
// curled along an arc. Pacific Drift adds a marking layer per species, so that a skipjack's
// belly stripes, a wahoo's bars or an opah's spots tell the species apart where several share
// one Tidewater body plan, and a shape table that stretches each plan to the species.
import * as T from 'three';
import {fishGeometry} from './vendor/tidewater/fish/FishGeometry.js';
import {SPECIES,SKIN,PATTERN} from './vendor/tidewater/fish/FishSpecies.js';
import {PART} from './vendor/tidewater/fish/FishGeometry.js';
import {FISH} from './fishing-ecology.js';

// Proportions and colours per species, on top of the shared body plan.
//  depth: body height, wid: girth, pec / d1 / d2 / anal / tail: fin length scales, eye: eye size
export const FISH_LOOKS={
 albacore:{mark:1,pec:2.1,tail:1.05,skin:{back:0x101a34,flank:0x7a8aa4}},
 bluefin:{mark:2,depth:1.12,wid:1.1,pec:.75,skin:{back:0x0a1426,flank:0x6f7f96}},
 pomfret:{mark:3,depth:1.45,d2:1.7,anal:1.7,pec:1.2,skin:{back:0x2c3036,flank:0x5c626a,belly:0x8a9096,fin:0x2a2e34,edge:0x1a1c20}},
 opah:{mark:4,depth:2.3,wid:.62,d1:2.6,anal:.8,pec:1.35,tail:1.1,eye:1.3,skin:{back:0x3c4c78,flank:0xa86a78,belly:0xd8a0a4,fin:0xd02a24,edge:0xb01c18}},
 blueMackerel:{mark:5,depth:.78,wid:.82,skin:{back:0x173e48,flank:0x9fb2bc,belly:0xe8ecec}},
 yellowtail:{mark:6,depth:.82,wid:.9,d1:.7,skin:{back:0x2e5268,flank:0xb8c6cc,fin:0x8a8f6a,edge:0xd4b632}},
 kahawai:{mark:7,depth:.86,skin:{back:0x3a4a44,flank:0xb3bfbf}},
 skipjack:{mark:8,depth:1.04,wid:1.08,pec:.7,skin:{back:0x18244a,flank:0x8a96aa}},
 yellowfin:{mark:9,pec:1.25,d2:2.6,anal:2.6,skin:{back:0x101c3a,flank:0x8090a4}},
 bigeye:{mark:10,depth:1.12,wid:1.08,eye:1.4,pec:1.3,skin:{back:0x0c1430,flank:0x7586a0}},
 mahi:{mark:11},
 wahoo:{mark:12,depth:.82,wid:.86,d1:.8,skin:{back:0x16305a,flank:0x8aa2b8,fin:0x1c2c44}},
 giantTrevally:{mark:13,depth:1.18,wid:1.05,eye:1.1,skin:{back:0x3a4248,flank:0x8d969c,belly:0xc4cacc,fin:0x2c3238,edge:0x16191c}},
 snapper:{mark:14,skin:{back:0xc9606a,flank:0xdc8c8a}},
 parrot:{mark:15,depth:1.05},
 fusilier:{mark:16,depth:.9,skin:{back:0xe0b62c,flank:0x2e6cc4,belly:0xdce6f0,fin:0x2c5aa8,edge:0xe2c040}}
};

function scaleProfile(p,k){return p.map(([u,v])=>[u,v*k]);}
function scaleFin(seg,k){return {...seg,h:seg.h.map(([t,v])=>[t,v*k])};}
export function speciesShape(id){
 const f=FISH[id],S=SPECIES[f.model],L=FISH_LOOKS[id]||{};const depth=L.depth??f.bodyDepth??1;
 const out={...S,top:scaleProfile(S.top,depth),bot:scaleProfile(S.bot,depth),wid:scaleProfile(S.wid,L.wid??1),
  eye:{...S.eye,r:S.eye.r*(L.eye??1),y:S.eye.y*Math.sqrt(depth)},
  dorsal:S.dorsal.map((d,i)=>scaleFin(d,(i===0?L.d1:L.d2)??(S.dorsal.length===1?L.d2??1:1))),
  anal:S.anal.map(d=>scaleFin(d,L.anal??1)),
  pectoral:{...S.pectoral,len:S.pectoral.len*(L.pec??f.finScale??1)},
  caudal:{...S.caudal,len:S.caudal.len*(L.tail??1),span:S.caudal.span*(L.tail??1)}};
 return out;
}

const PA=Object.fromEntries(Object.entries(PART).map(([k,v])=>[k,v.toFixed(1)]));
const PT=Object.fromEntries(Object.entries(PATTERN).map(([k,v])=>[k,v.toFixed(1)]));

const COMMON_GLSL=/* glsl */`
uniform vec3 uFBack,uFFlank,uFBelly,uFFin,uFEdge,uFIris;
uniform vec4 uFEye,uFLat,uFMisc; // eye: z, y, r, opercle z; lat: line, arch, hinge z, hinge y; misc: metal, irid, rough, mouth tip
uniform vec4 uFInfo; // pattern, mark, seed, length (m)
uniform vec4 uFScale; // scale size, visibility, cloudy eye, wet
varying vec3 vFishLocal;varying vec4 vFishData;
float fishHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fishVnoise(vec2 p){vec2 i=floor(p),f=fract(p),w=f*f*(3.-2.*f);
 return mix(mix(fishHash(i),fishHash(i+vec2(1,0)),w.x),mix(fishHash(i+vec2(0,1)),fishHash(i+vec2(1,1)),w.x),w.y);}
float fishOpercleEdge(float zOp,float h){return zOp-.028*(1.-h*h)+smoothstep(-.35,-1.,h)*.07;}
float fishOpercleMask(float h){return smoothstep(-.98,-.9,h)*(1.-smoothstep(.45,.62,h));}
float fishBand(float x,float c,float w,float s){return 1.-smoothstep(w,w+s,abs(x-c));}
vec3 fishEyeCol(float r,float ang,vec3 irisC,float cloudy){
 float streak=sin(ang*26.)*.5+.5,irisL=dot(irisC,vec3(.3,.59,.11));
 vec3 iris=irisC*min(1.,.36/max(irisL,1e-3))*mix(.6,1.05,streak)*(smoothstep(.55,.72,r)*.45+.5);
 vec3 e=mix(iris,vec3(.025,.025,.028),smoothstep(.8,.97,r));
 e=mix(e,vec3(.004,.005,.007),1.-smoothstep(.5,.56,r));
 return mix(e,vec3(.42,.44,.46),cloudy*.55*(1.-smoothstep(.7,1.,r)));
}
`;

const SURFACE_GLSL=/* glsl */`
{
 vec4 D=vFishData;vec3 Lp=vFishLocal;
 float pat=floor(uFInfo.x+.5),mark=floor(uFInfo.y+.5),seed=uFInfo.z,L=uFInfo.w;
 float part=floor(D.y+.01);
 float scaleSize=uFScale.x,scaleVis=uFScale.y;
 float ss=max(scaleSize,.004);
 float warp=(sin(Lp.z*23.+D.z*31.)*.35+sin(Lp.z*41.-D.z*17.)*.25)*mix(1.,.3,smoothstep(.015,.045,scaleSize));
 float sa=(.5-Lp.z)/ss+warp,sb=D.z/(ss*.8)+warp*.6,rowI=floor(sb),fb=fract(sb)*2.-1.;
 float sf=fract(sa+rowI*.5+fb*fb*.32);
 float px=length(fwidth(vViewPosition));
 float sfade=(1.-smoothstep(.25,.7,px/(ss*L)))*step(.001,scaleSize);
 bool isBody=part==${PA.BODY};float bodyK=isBody?1.:0.;
 bool isFin=part>.5&&part<7.5;
 // relief
 float h=D.w;
 float zE=fishOpercleEdge(uFEye.w,h),onOp=fishOpercleMask(h);
 float sc=smoothstep(0.,.9,sf)*(1.-smoothstep(.9,1.,sf))*sfade*scaleVis;
 float op=smoothstep(-.004,.004,Lp.z-zE)*onOp;
 float grain=(fishVnoise(vec2(Lp.z,D.z)*420.)-.5)*.00022*(1.-smoothstep(.3,.8,px/(.004*L)));
 float rd0=abs(fract(D.w+.5)-.5);
 pdFishBump=(isBody?sc*.0016+op*.0025+grain:isFin?(1.-smoothstep(0.,.25,rd0))*.0004:0.)*L;
 // colour
 float rough=uFMisc.z,metal=0.;
 float u=D.x,sd=D.z,z=Lp.z,y=Lp.y,t=D.z,w=D.w;
 vec3 back=uFBack,flank=uFFlank,belly=uFBelly,finC=uFFin,edgeC=uFEdge;vec4 eye=uFEye,lat=uFLat;
 float n1=fishVnoise(vec2(z,y)*38.+seed*17.),n2=fishVnoise(vec2(z,sd)*11.+seed*5.);
 float fwW=fwidth(w),fwH=fwidth(h);
 float tBack=smoothstep(.2,.75,h),tBelly=1.-smoothstep(-.7,-.1,h);
 vec3 c=mix(mix(flank,back,tBack),belly,tBelly);
 float silver=1.-tBack*.75;
 metal=uFMisc.x*silver*bodyK;
 float scaleShade=smoothstep(.3,.9,sf)*sfade*scaleVis;
 float pocket=smoothstep(.88,.97,sf)*(1.-smoothstep(.97,1.,sf))*sfade*scaleVis;
 float cellK=(fishHash(vec2(floor(sa+floor(sb)*.5),floor(sb)))-.5)*.1*sfade*scaleVis;
 c*=mix(1.,.96+scaleShade*.07-pocket*mix(.14,.06,uFMisc.x)+cellK,bodyK);
 c*=mix(1.,n1*.14+.93,bodyK);c*=mix(1.,n2*.2+.9,bodyK);
 rough=mix(rough,rough*mix(.8,1.25,n2),bodyK);
 float caudal=part==${PA.CAUDAL}?1.:0.,finlet=part==${PA.FINLET}?1.:0.;
 if(isFin&&part!=${PA.FINLET}){
  vec3 fin=mix(finC,edgeC,smoothstep(.4,1.,t));
  float rd=abs(fract(w+.5)-.5),rayW=part==${PA.DORSAL1}?.1:.06;
  float ray=(1.-smoothstep(rayW,fwW*1.2+rayW+.04,rd))*(1.-smoothstep(.2,.6,fwW));
  fin*=mix(.9,1.06,ray);fin*=smoothstep(0.,.15,t)*.2+.8;c=fin;
  bool paired=part==${PA.PECTORAL}||part==${PA.PELVIC};
  if(paired)c*=mix(.85,1.1,smoothstep(.2,1.,t));
  rough=.4;
 }
 // Tidewater body-plan markings
 if(pat==${PT.yellowtail}&&mark!=16.){
  float wS=mix(.006,.035,smoothstep(.1,-.25,z));float stripe=fishBand(y-.004,0.,wS,.004)*bodyK;
  c=mix(c,vec3(.85,.62,.05),stripe);c=mix(c,vec3(.86,.66,.06),caudal);
 }else if(pat==${PT.parrot}){
  c=mix(c,vec3(.1,.42,.36)*mix(.8,1.1,scaleShade),bodyK*.75);
  float mk=fishBand(y-(z-.3)*.4,-.03,.008,.008)*smoothstep(.18,.35,z)*bodyK;c=mix(c,vec3(.8,.45,.3),mk);
  c=mix(c,vec3(.14,.5,.62),smoothstep(.3,.42,z)*smoothstep(.0,.6,h)*bodyK*.6); // steep blue-green head
 }else if(pat==${PT.barracuda}&&mark!=12.){
  float bars=smoothstep(.35,.8,sin(z*58.+h*1.5+n1))*smoothstep(.2,.55,h)*bodyK;c*=1.-bars*.45;
 }else if(pat==${PT.redSnapper}){
  c*=1.-smoothstep(.6,.95,sin(y*210.+z*120.))*max(sfade,.3)*bodyK*.15;
 }else if(pat==${PT.tuna}&&mark!=8.&&mark!=2.){
  float bronze=fishBand(h,.28,.05,fwH+.06)*smoothstep(.3,.2,z)*bodyK;
  c=mix(c,vec3(.42,.36,.2),bronze*.5);c=mix(c,back,smoothstep(.28,.4,h)*bodyK);
  float bars=smoothstep(.6,.9,sin(z*95.))*smoothstep(0.,-.3,h)*smoothstep(.2,.1,z)*bodyK;c=mix(c,vec3(.85,.88,.9),bars*.35);
  c=mix(c,vec3(.55,.48,.16),finlet*.85);
 }else if(pat==${PT.mahi}){
  vec2 q=vec2(z,y)*55.;vec2 cell=floor(q),jit=vec2(fishHash(cell+3.1),fishHash(cell+7.7))-.5;
  vec2 fc=fract(q)-.5-jit*.55;float rs=mix(.1,.24,fishHash(cell+1.3));
  float spots=(1.-smoothstep(rs,rs+.1,length(fc*vec2(1.,1.25))))*step(.45,fishHash(cell+seed*7.))*bodyK*(1.-tBelly);
  c=mix(c,vec3(.08,.22,.5),spots*.75);c=mix(c,vec3(.2,.5,.3),smoothstep(0.,.5,h)*bodyK*.35);
 }else if(pat==${PT.jack}&&mark!=6.&&mark!=7.&&mark!=13.){
  float top=fishBand(h,.82,.06,fwH+.05)*smoothstep(.2,.05,z)*bodyK;c=mix(c,vec3(.04,.05,.07),top*.5);
 }
 // Pacific Drift species markings
 vec2 q=vec2(z,y);
 if(mark==1.){ // albacore: white trailing edge on the tail
  c=mix(c,vec3(.9,.92,.94),caudal*smoothstep(.82,.97,t));
 }else if(mark==2.){ // southern bluefin: rows of pale dots and lines on the lower flank, yellow finlets
  float dots=smoothstep(.55,.9,sin(z*140.))*smoothstep(.6,.9,sin(h*40.+z*20.))*smoothstep(.1,-.4,h)*smoothstep(-.9,-.5,h)*bodyK;
  c=mix(c,vec3(.86,.9,.92),dots*.55);c=mix(c,back,smoothstep(.3,.45,h)*bodyK);c=mix(c,vec3(.8,.66,.14),finlet*.9);
 }else if(mark==3.){ // pomfret: leaden all over, little counter-shading
  c=mix(c,vec3(.24,.26,.29)*mix(.85,1.1,n2),bodyK*.55);
 }else if(mark==4.){ // opah: white spots on a steel-rose body, scarlet fins and jaws
  vec2 g=q*32.;vec2 cell=floor(g),j=vec2(fishHash(cell+1.7),fishHash(cell+5.3))-.5;
  float sp=(1.-smoothstep(.13,.22,length(fract(g)-.5-j*.6)))*step(.5,fishHash(cell+seed))*bodyK;
  c=mix(c,vec3(.94,.92,.9),sp*.85);
  c=mix(c,vec3(.8,.12,.1),smoothstep(.4,.46,z)*smoothstep(-.2,-.6,h)*bodyK*.7);
 }else if(mark==5.){ // blue mackerel: wavy dark bars on the green back, grey spots below
  float wav=sin(z*48.+sin(y*90.+z*20.)*1.8);
  c=mix(c,vec3(.04,.08,.1),smoothstep(.35,.75,wav)*smoothstep(.15,.45,h)*bodyK*.85);
  vec2 g=q*70.;vec2 cell=floor(g);float sp=(1.-smoothstep(.12,.24,length(fract(g)-.5)))*step(.55,fishHash(cell+seed))*smoothstep(.1,-.15,h)*smoothstep(-.8,-.5,h)*bodyK;
  c=mix(c,vec3(.25,.3,.34),sp*.6);
 }else if(mark==6.){ // yellowtail kingfish: yellow stripe snout to tail, yellow tail
  c=mix(c,vec3(.86,.7,.18),fishBand(h,.12,.06,fwH+.05)*bodyK*smoothstep(.45,.38,z)*.85);
  c=mix(c,vec3(.84,.7,.2),caudal*.85);
 }else if(mark==7.){ // kahawai: dark spots on the back and upper flank
  vec2 g=q*80.;vec2 cell=floor(g),j=vec2(fishHash(cell+3.1),fishHash(cell+7.7))-.5;
  float sp=(1.-smoothstep(.1,.22,length(fract(g)-.5-j*.5)))*step(.5,fishHash(cell+seed))*smoothstep(.0,.35,h)*bodyK;
  c=mix(c,vec3(.08,.1,.08),sp*.85);
 }else if(mark==8.){ // skipjack: dark stripes along the belly
  float st=smoothstep(.45,.85,sin(h*26.))*smoothstep(.15,-.15,h)*smoothstep(-.95,-.75,h)*smoothstep(.36,.25,z)*bodyK;
  c=mix(c,vec3(.12,.15,.22),st*.8);c=mix(c,back,smoothstep(.25,.4,h)*bodyK);
 }else if(mark==9.){ // yellowfin: golden band, bright yellow sickle fins and finlets
  c=mix(c,vec3(.86,.68,.16),fishBand(h,.22,.06,fwH+.07)*smoothstep(.38,.3,z)*bodyK*.75);
  float yel=(part==${PA.DORSAL2}||part==${PA.ANAL})?1.:0.;c=mix(c,vec3(.92,.74,.12),max(yel*.85,finlet*.95));
  float bars=smoothstep(.65,.92,sin(z*90.))*smoothstep(-.05,-.4,h)*bodyK;c=mix(c,vec3(.86,.9,.92),bars*.3);
 }else if(mark==10.){ // bigeye: blue band, yellow finlets edged black
  c=mix(c,vec3(.2,.32,.62),fishBand(h,.3,.05,fwH+.06)*bodyK*.55);
  c=mix(c,mix(vec3(.88,.74,.12),vec3(.03),smoothstep(.75,.95,t)),finlet);
 }else if(mark==12.){ // wahoo: cobalt bars down the flank
  float bars=smoothstep(.2,.7,sin(z*70.+sin(h*3.)*.6+n1*.8))*smoothstep(-.5,.2,h)*bodyK;
  c=mix(c,vec3(.12,.24,.52),bars*.75);
 }else if(mark==13.){ // giant trevally: a scatter of small black spots, dusky fins
  vec2 g=q*90.;vec2 cell=floor(g);float sp=(1.-smoothstep(.08,.18,length(fract(g)-.5)))*step(.82,fishHash(cell+seed*3.))*smoothstep(-.3,.2,h)*bodyK;
  c=mix(c,vec3(.03),sp);
 }else if(mark==14.){ // snapper: bright blue spots on the upper flank
  vec2 g=q*85.;vec2 cell=floor(g),j=vec2(fishHash(cell+3.1),fishHash(cell+7.7))-.5;
  float sp=(1.-smoothstep(.12,.2,length(fract(g)-.5-j*.4)))*step(.4,fishHash(cell+seed))*smoothstep(-.2,.3,h)*bodyK;
  c=mix(c,vec3(.3,.62,.95),sp*.9);
 }else if(mark==16.){ // fusilier: blue body, golden back and tail
  c=mix(c,vec3(.9,.72,.14),smoothstep(.35,.5,h)*bodyK*smoothstep(.42,.3,z));c=mix(c,vec3(.9,.74,.16),caudal*.9);
 }
 // lateral line
 float hl=lat.x+lat.y*(1.-smoothstep(.12,.55,u));
 float lineK=fishBand(h,hl,fwH*.5+.012,fwH+.008)*bodyK*smoothstep(.18,.25,u)*smoothstep(.9,.8,u);
 c*=1.-lineK*.3;
 // gill cover edge and preopercle; gills show red on a landed fish
 float dOp=z-zE,onOpB=onOp*bodyK;
 c*=1.-(1.-smoothstep(.0015,.004,abs(dOp)))*onOpB*.45;
 c*=1.-(1.-smoothstep(.001,.003,abs(dOp-.04)))*onOpB*smoothstep(.6,.2,h)*.2;
 float gill=smoothstep(0.,-.0015,dOp)*smoothstep(-.007,-.003,dOp)*onOpB*smoothstep(0.,-.5,h)*uFScale.w;
 c=mix(c,vec3(.3,.03,.035),gill*.6);
 // lips, upper jaw bone, nostril
 float hz=lat.z,hy=lat.w,tipY=uFMisc.w,mt=clamp((z-hz)/(.5-hz),0.,1.),yLip=mix(hy,tipY,mt);
 c*=1.-(1.-smoothstep(.0015,.0035,abs(y-yLip)))*step(hz-.004,z)*bodyK*.55;
 float maxZ=hz+.006-(y-hy)*.35;
 c*=1.-(1.-smoothstep(.001,.0025,abs(z-maxZ)))*smoothstep(hy-.002,hy+.002,y)*smoothstep(hy+.04,hy+.025,y)*bodyK*.3;
 c*=1.-(1.-smoothstep(.1,.2,length(vec2(z-eye.x-eye.z*1.7,y-eye.y-eye.z*.25))/eye.z))*bodyK*.6;
 // painted eye, under the dome
 float er=length(vec2(z-eye.x,y-eye.y))/eye.z,painted=(1.-smoothstep(.95,1.1,er))*bodyK;
 c=mix(c,fishEyeCol(er,atan(y-eye.y,z-eye.x),uFIris,uFScale.z),painted);metal*=1.-painted;
 if(part==${PA.EYE}){float r=length(vec2(t,w));c=fishEyeCol(r,atan(w,t),uFIris,uFScale.z);c=mix(c,flank*.6,smoothstep(.93,1.,r));rough=mix(.04,.3,uFScale.z);metal=0.;}
 else if(part==${PA.MOUTH}){c=mix(vec3(.5,.3,.3),vec3(.03,.012,.012),smoothstep(.05,.85,t));metal=0.;rough=.35;}
 // wet skin out of the water
 rough=mix(rough,rough*.55,uFScale.w);
 // iridescent sheen on silvery skin at grazing angles
 float cosV=abs(dot(normalize(vNormal),normalize(vViewPosition)));
 float irid=uFMisc.y*bodyK*silver*(1.-cosV);
 c=mix(c,c*mix(vec3(.55,.95,.8),vec3(.95,.6,1.),cosV)*1.25,irid*.6);
 diffuseColor.rgb=c;pdFishRough=rough;pdFishMetal=metal;
}
`;

const VERTEX_GLSL=/* glsl */`
uniform vec4 uFPose; // jaw opening (rad), lateral curl, dorso-ventral sag, landed
uniform vec4 uFSwim; // phase, amplitude, 0, 0
uniform vec4 uFLatV; // hinge z, hinge y
attribute vec4 aData;
varying vec3 vFishLocal;varying vec4 vFishData;
`;
const POSE_GLSL=/* glsl */`
vFishLocal=position;vFishData=aData;
{
 vec3 p=position,n=objectNormal;
 // swimming wave while it fights
 float u=aData.x,env=(u*u*.85+.08)*(smoothstep(0.,.25,u)*.7+.3);
 p.x+=sin(uFSwim.x-u*5.6)*env*uFSwim.y;
 // lower jaw rotates down about the corner of the mouth
 float jw=max(fract(aData.y+.01)-.01,0.)/.9,a=uFPose.x*jw,ca=cos(a),sa=sin(a);
 float dy=p.y-uFLatV.y,dz=p.z-uFLatV.x;p.y=uFLatV.y+dy*ca-dz*sa;p.z=uFLatV.x+dy*sa+dz*ca;
 float ny=n.y*ca-n.z*sa,nz=n.y*sa+n.z*ca;n.y=ny;n.z=nz;
 // the body bends along circular arcs: sideways (curl), then up or down (sag)
 float k1=uFPose.y+(uFPose.y>=0.?1e-4:-1e-4),t1=k1*p.z,c1=cos(t1),s1=sin(t1),h1=sin(t1*.5);
 float x1=h1*h1*2./k1+p.x*c1,z1=s1/k1-p.x*s1,nx1=n.x*c1+n.z*s1,nz1=n.z*c1-n.x*s1;
 float k2=uFPose.z+(uFPose.z>=0.?1e-4:-1e-4),t2=k2*z1,c2=cos(t2),s2=sin(t2),h2=sin(t2*.5);
 float y2=h2*h2*2./k2+p.y*c2,z2=s2/k2-p.y*s2,ny2=n.y*c2+nz1*s2,nz2=nz1*c2-n.y*s2;
 pdPosed=vec3(x1,y2,z2);objectNormal=normalize(vec3(nx1,ny2,nz2));
}
`;

const geometries=new Map();
export function fishGeometryFor(id){if(!geometries.has(id))geometries.set(id,fishGeometry(speciesShape(id),{lod:0,pose:'dead',mouth:true,eyes:true}));return geometries.get(id);}

const col=hex=>new T.Color(hex);
export function createFishMaterial(id,{seed=Math.random()}={}){
 const f=FISH[id],S=speciesShape(id),K={...SKIN[f.model],...(FISH_LOOKS[id]?.skin||{})},look=FISH_LOOKS[id]||{},Lb=S.body;
 const uniforms={
  uFBack:{value:col(K.back)},uFFlank:{value:col(f.color??K.flank)},uFBelly:{value:col(K.belly)},uFFin:{value:col(K.fin)},uFEdge:{value:col(K.edge)},uFIris:{value:col(S.iris)},
  uFEye:{value:new T.Vector4(.5-S.eye.u*Lb,S.eye.y,S.eye.r,.5-S.opercle*Lb)},
  uFLat:{value:new T.Vector4(S.lateral,S.arch,.5-S.mouth.corner*Lb,S.mouth.y)},
  uFLatV:{value:new T.Vector4(.5-S.mouth.corner*Lb,S.mouth.y,0,0)},
  uFMisc:{value:new T.Vector4(S.metal*.55,S.irid,K.rough,S.mouth.tip)},
  uFInfo:{value:new T.Vector4(S.pattern,look.mark??0,seed,.5)},
  uFScale:{value:new T.Vector4(S.scales,S.scaleVis,0,0)},
  uFPose:{value:new T.Vector4(0,0,0,0)},uFSwim:{value:new T.Vector4(0,0,0,0)}
 };
 const mat=new T.MeshPhysicalMaterial({roughness:.4,metalness:0,clearcoat:0,clearcoatRoughness:.12,side:T.DoubleSide,iridescence:S.irid*.35,iridescenceIOR:1.6,iridescenceThicknessRange:[200,520]});
 mat.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);
  // pose position and normal together, before the normal is transformed
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+VERTEX_GLSL)
   .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvec3 pdPosed=position;\n'+POSE_GLSL)
   .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed=pdPosed;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\n'+COMMON_GLSL+'float pdFishBump=0.,pdFishRough=.4,pdFishMetal=0.;')
   .replace('#include <color_fragment>','#include <color_fragment>\n'+SURFACE_GLSL)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=pdFishRough;')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=pdFishMetal;')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   {vec3 dpx=dFdx(-vViewPosition),dpy=dFdy(-vViewPosition);vec3 r1=cross(dpy,normal),r2=cross(normal,dpx);float det=dot(dpx,r1);
    vec3 grad=sign(det)*(dFdx(pdFishBump)*r1+dFdy(pdFishBump)*r2);normal=normalize(abs(det)*normal-grad);}`);
 };
 mat.customProgramCacheKey=()=> 'pd-fish-skin-v1';
 mat.userData.fishUniforms=uniforms;
 return mat;
}

// A posed fish: swimming while it fights, then curled with the jaw open once it is landed.
export function createFishMesh(id,{landed=false,seed}={}){
 const mesh=new T.Mesh(fishGeometryFor(id),createFishMaterial(id,{seed}));mesh.name=FISH[id].name;
 const u=mesh.material.userData.fishUniforms;mesh.userData.fishUniforms=u;
 mesh.userData.setLength=m=>{mesh.scale.setScalar(m);u.uFInfo.value.w=m;};
 mesh.userData.pose=({jaw=0,curl=0,sag=0,wet=0,cloudy=0,swimPhase=0,swim=0}={})=>{u.uFPose.value.set(jaw,curl,sag,landed?1:0);u.uFSwim.value.set(swimPhase,swim,0,0);u.uFScale.value.z=cloudy;u.uFScale.value.w=wet;mesh.material.clearcoat=wet*.6;};
 mesh.userData.pose(landed?{jaw:.35,curl:.9,sag:-.4,wet:1}:{});
 return mesh;
}
