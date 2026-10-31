// WebGL adaptation of Tidewater's BoatMaterials (src/world/boat/BoatMaterials.js, MIT,
// public/licenses/tidewater-MIT.txt). The WGSL surface functions are rewritten as GLSL chunks
// injected into Three.js standard/physical materials, so the launch keeps Pacific Drift's
// lighting, shadows and environment while regaining Tidewater's finishes: painted hull with boot
// stripe and weathering, molded non-skid and aged gelcoat, varnished wood grain, wrinkle-finish
// plastics, rope and fabric, salt-hazed glass, backlit instruments and lights.
//
// Colours follow Pacific Drift's pipeline (colour management off, display-referred values), so
// Tidewater's hex colours are used as written rather than converted to linear.
import * as T from 'three';

const hex = h => `vec3(${(((h >> 16) & 255) / 255).toFixed(4)},${(((h >> 8) & 255) / 255).toFixed(4)},${((h & 255) / 255).toFixed(4)})`;

const NOISE = /* glsl */`
vec3 pdHash3(vec3 p){p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));return -1.+2.*fract(sin(p)*43758.5453123);}
float pdNoise(vec3 p){vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
 return 1.6*mix(mix(mix(dot(pdHash3(i),f),dot(pdHash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(pdHash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(pdHash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
 mix(mix(dot(pdHash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(pdHash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(pdHash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(pdHash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z);}
float pdFbm(vec3 p){float a=1.,s=0.;for(int i=0;i<PD_OCTAVES;i++){s+=a*pdNoise(p);p*=2.;a*=.5;}return s;}
float pdHash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float pdIs(float auxZ,float id){return step(abs(auxZ-id),.5);}
float pdL(float a,float b,float x){return smoothstep(a,b,x);}
float pdInv(float a,float b,float x){return 1.-smoothstep(a,b,x);}
vec3 pdBump(vec3 P,vec3 N,float h){vec3 dPdx=dFdx(P),dPdy=dFdy(P),r1=cross(dPdy,N),r2=cross(N,dPdx);float det=dot(dPdx,r1);vec3 g=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);return normalize(abs(det)*N-g+N*1e-6);}
`;

// Every surface writes these; the injections below hand them to Three's lighting.
const GLOBALS = /* glsl */`
uniform float uBoatTime,uBoatNight,uBoatWet;
varying vec4 vAux;varying vec3 vLocal;varying vec2 vPdUv;
vec3 pdAlbedo;float pdRough,pdMetal,pdHeight,pdAO,pdClear,pdClearRough,pdAlpha;vec3 pdEmissive;
${NOISE}`;

const SURFACES = {
  // Hull exterior: antifouling / boot stripe / dark topsides painted by height, with waterline
  // scum, algae, weathering streaks and scuffs where gear comes over the rail.
  hull: (shape) => /* glsl */`{
 vec3 p=vLocal;float tS=clamp((p.z-(${shape.zAft.toFixed(4)}))/${shape.length.toFixed(4)},0.,1.);
 float sheer=pow(tS,2.2)*.62+.98+pow(max(1.-tS/.2,0.),2.)*.04;
 float boot=p.y-pdL(.8,4.3,p.z)*.06,aaB=fwidth(boot)+1e-4;
 float aboveBottom=pdL(-aaB,aaB,boot-.05),aboveStripe=pdL(-aaB,aaB,boot-.15);
 float below=sheer-p.y,aaS=fwidth(below)+1e-4,cove=pdL(-aaS,aaS,below-.1)*pdInv(-aaS,aaS,below-.122);
 float n1=pdFbm(p*vec3(.9,2.4,.9)),streakN=pdNoise(vec3(p.z*7.,p.y*.45,p.x*7.)),scuffN=pdNoise(vec3(p.z*2.2,p.y*34.,p.x*2.2));
 vec3 c=mix(${hex(0x7a1d15)},${hex(0x0f1a30)},aboveBottom);c=mix(c,${hex(0xf2efe6)},aboveStripe);c=mix(c,${hex(0x0f1a30)},cove);
 float scum=pdInv(.16,n1*.09+.42,boot)*aboveStripe*clamp(n1*.6+.7,0.,1.);c=mix(c,${hex(0x8b7b57)},scum*.32);
 float algae=pdL(-.35,.03,boot)*(1.-aboveBottom)*clamp(n1+.45,0.,1.);c=mix(c,${hex(0x2c3a1f)},algae*.45);
 float streak=pdL(.3,.75,streakN)*pdL(.05,.2,below)*pdInv(.4,.95,below)*aboveStripe;c=mix(c,${hex(0xa29579)},streak*.2);
 float side=pdL(-.2,.2,-p.x)*pdInv(-.6,.2,p.z)*pdL(-3.7,-2.8,p.z);
 float scuff=pdL(.45,.8,scuffN)*pdL(.13,.18,below)*pdInv(.45,.7,below)*(side*.8+.2);c=mix(c,${hex(0x5f5e59)},scuff*.55);
 pdAlbedo=c;pdRough=mix(mix(.75,.35,aboveBottom),.2,aboveStripe)+scum*.25+scuff*.3;pdMetal=0.;
 pdClear=aboveBottom*(1.-scum*.5)*(1.-scuff*.6);pdClearRough=.08+scum*.3;pdHeight=0.;
}`,
  // White fiberglass: pattern 1 molded non-skid, 2 painted interior panels, 3 perforated headliner.
  gelcoat: () => /* glsl */`{
 vec4 aux=vAux;vec3 p=vLocal;float grip=pdIs(aux.z,1.);
 vec2 q=vPdUv*55.,c0=floor(q),f=fract(q)-.5,j=(vec2(pdHash21(c0),pdHash21(c0+17.31))-.5)*.3;
 float pebble=pdInv(.16,.36,length(f-j))*pdInv(.12,.4,fwidth(q.x)),h=pebble*grip;
 float dirtN=pdNoise(p*1.7),blot=pdL(.2,.55,pdFbm(p*2.2+vec3(7.7,0.,3.1)));
 float dirt=(clamp(dirtN*.5+.35,0.,1.)*.22+blot*.2)*grip,corner=pdInv(.35,.5,p.y)*.08*(1.-grip),plainK=1.-grip;
 float wear=pdFbm(p*vec3(1.1,1.6,1.1)+vec3(5.3,1.1,2.9)),streaks=pdL(.3,.7,pdNoise(vec3(p.x*14.,p.y*1.2,p.z*14.)))*.7*plainK;
 float lowDirt=pdInv(.38,1.15,p.y)*clamp(wear+.7,0.,1.)*.34*plainK;
 vec3 base=vColor.rgb*(1.-h*.07)*(1.-dirt-corner*1.8-lowDirt);
 base=mix(base,base*vec3(.94,.89,.78),pdL(-.15,.35,wear)*.45*plainK);base=mix(base,base*vec3(.78,.7,.6),streaks*.25);
 float rough=mix(aux.x,.72,grip)+h*.1+(clamp(wear+.3,0.,1.)*.18+lowDirt*.5)*plainK,metal=aux.y,groove=0.,ao=1.;
 float mottle=pdFbm(p*vec3(2.3,3.1,2.3)),panel=pdIs(aux.z,2.);
 float sz=(p.z+.13)/.61,seamDz=.305-abs(fract(sz)-.5)*.61,dyA=abs(p.y-1.17),dyB=abs(p.y-1.52),seamD=min(seamDz,min(dyA,dyB));
 float seam=pdInv(.0015,.0015+(fwidth(seamD)+1e-4)*1.5,seamD)*panel;
 float screwD=min(length(vec2((fract(p.y/.15)-.5)*.15,seamDz-.012)),length(vec2((fract(p.z/.15)-.5)*.15,min(dyA,dyB)-.012)));
 float screw=pdInv(.0035,.0035+fwidth(screwD)+1e-4,screwD)*panel,low=pdInv(1.15,1.6,p.y);
 float grime=clamp(low*(.35+mottle*.3)+pdInv(0.,.035,seamD)*.18+mottle*.08,0.,1.)*panel,age=pdFbm(p*vec3(.9,1.4,.9)+vec3(3.1,0.,1.7));
 float stain=pdL(.25,.7,pdNoise(vec3(p.z*9.,p.y*.8,p.x*9.)))*pdL(.9,1.35,p.y)*pdInv(1.3,1.56,p.y)*panel;
 vec3 pc=vColor.rgb*vec3(.97,.94,.87);pc=mix(pc,pc*vec3(.9,.82,.64),pdL(-.1,.35,age)*.7);pc*=1.-grime*.6;
 pc=mix(pc,pc*vec3(.66,.54,.4),stain*.6);pc=mix(pc,pc*.3,seam);
 float rustK=step(.55,pdHash21(floor(vec2(p.y/.15,p.z/.15)+.5)));pc=mix(pc,mix(vec3(.55,.55,.53),vec3(.32,.17,.08),rustK),screw);
 float head=pdIs(aux.z,3.);vec2 hq=p.xz/.006;float perf=pdInv(.12,.3,length(fract(hq)-.5))*pdInv(.3,.7,fwidth(hq.x)),quilt=sin((p.z+.1)/.5*3.14159)*.5+.5;
 vec3 hc=vec3(.72,.69,.63)*(1.-perf*.18)*(quilt*.12+.88)*(mottle*.08+.96);
 base=mix(mix(base,pc,panel),hc,head);rough=mix(mix(rough,.5+grime*.3+age*.08-screw*.2,panel),.8,head);metal+=screw*.8*(1.-rustK);
 ao=mix(mix(1.,.55-low*.12-pdL(1.9,2.3,p.y)*.1,panel),.35,head);groove=seam*-.0006+screw*.0004+(perf*-.0002+quilt*.002)*head;
 pdAlbedo=base;pdRough=rough;pdMetal=metal;pdAO=ao;pdHeight=h*.0008+groove;
}`,
  // Varnished wood, grain along uv.x; pattern 1 plain paint, 2 teak-and-holly sole.
  wood: () => /* glsl */`{
 vec4 aux=vAux;vec2 w=vPdUv;float g1=pdNoise(vec3(w.x*.8,w.y*30.,.37)),g2=pdNoise(vec3(w.x*10.,w.y*170.,5.1));
 float rings=sin(w.y*150.+g1*5.+w.x*.6)*.5+.5,grain=clamp(rings*.45+g2*.22+g1*.22+.28,0.,1.),plain=pdIs(aux.z,1.);
 vec3 wood=mix(${hex(0x4a230f)},${hex(0x9c5b2b)},grain);float rough=aux.x+g2*.04*(1.-plain);
 float sole=pdIs(aux.z,2.),pv=w.y/.1,plankI=floor(pv),pf=abs(fract(pv)-.5),aaP=fwidth(pv)+1e-4;
 float holly=pdL(.5-.06-aaP,.5-.06,pf),caulk=pdL(.5-.012-aaP,.5-.012,pf);
 float butt=pdInv(0.,.004+fwidth(w.x),abs(fract(w.x/1.8+pdHash21(vec2(plankI,3.)))-.5)*1.8),tone=pdHash21(vec2(plankI,7.))*.25+.85,lane=pdNoise(vec3(w.x*1.3,w.y*1.3,2.))*.5+.5;
 vec3 teak=mix(${hex(0x6b3f1d)},${hex(0xa87445)},grain)*tone;teak=mix(teak,teak*vec3(1.12,1.08,1.02),lane*.5);
 teak=mix(teak,${hex(0xd9c9a6)},holly*(1.-caulk));teak=mix(teak,${hex(0x1c140e)},max(caulk,butt));
 wood=mix(wood,teak,sole);rough=mix(rough,.45+lane*.25,sole);
 pdAlbedo=mix(wood,vec3(1.),plain)*vColor.rgb;pdRough=rough;pdMetal=aux.y;pdHeight=(g2*.0002-max(caulk,butt)*.0012)*sole+g2*.00006*(1.-plain);pdAO=mix(1.,.6,sole);
}`,
  // Stainless, bronze, painted metal (with corrosion at the edges), plastics, rope, vinyl, flag;
  // 4 wrinkle finish, 5 printed page, 6 folded chart, 7 photo, 8 label tape, 9 heavy fabric.
  fittings: () => /* glsl */`{
 vec4 aux=vAux;vec3 c=vColor.rgb;vec2 u=vPdUv;vec3 p=vLocal;float rough=aux.x,bump=0.;
 float ropeShade=pdL(-.7,.7,sin((u.x/.07+u.y)*(6.28318*3.)))*.4+.6;c=mix(c,c*ropeShade,pdIs(aux.z,1.));
 // South African flag (2:3): the green Y with white and gold borders, the black triangle at the hoist,
 // red over blue; the pall's centre lines meet at the middle of the flag. Sun-faded toward the fly.
 float flagK=pdIs(aux.z,2.);vec3 flag=vec3(0.);
 if(flagK>.5){vec2 f=vec2(u.x*3.,u.y*2.-1.);
  vec2 a1=vec2(0.,1.),a2=vec2(0.,-1.),jn=vec2(1.5,0.);
  vec2 e1=jn-a1,e2=jn-a2;float d1=length(f-a1-e1*clamp(dot(f-a1,e1)/dot(e1,e1),0.,1.)),d2=length(f-a2-e2*clamp(dot(f-a2,e2)/dot(e2,e2),0.,1.)),d3=f.x>1.5?abs(f.y):length(f-jn);
  float d=min(min(d1,d2),d3);bool tri=f.x<1.5*(1.-abs(f.y));
  flag=d<.2?vec3(0.,.47,.29):d<.3333?(tri?vec3(1.,.72,.11):vec3(.96)):tri?vec3(.02):f.y>0.?vec3(.88,.24,.19):vec3(0.,.08,.54);
  flag=mix(flag,flag*.82+.08,pdL(.6,1.,u.x)*.35)*(.93+.07*pdNoise(vec3(u*9.,1.)));}
 c=mix(c,flag,flagK);
 // salt and corrosion on bare metal: a little bloom where spray dries
 float metalK=step(.5,aux.y)*(1.-step(3.5,aux.z)),salt=pdL(.35,.8,pdFbm(p*vec3(9.,14.,9.)))*metalK;
 c=mix(c,c*vec3(.82,.84,.8)+vec3(.05),salt*.35);rough+=salt*.25;
 float wrinkle=pdIs(aux.z,4.),wn=pdNoise(p*380.),scuff=pdL(.35,.6,pdFbm(p*vec3(6.,14.,6.)))*wrinkle;
 c=mix(c,mix(c*(1.+wn*.08),c+vec3(.05),scuff*.6),wrinkle);rough=mix(rough,rough+wn*.08-scuff*.15,wrinkle);bump+=wn*.00015*wrinkle;
 float page=pdIs(aux.z,5.),row=fract(u.y*34.),word=pdHash21(floor(vec2(u.x*16.,u.y*34.)));
 float inText=step(.08,u.x)*step(u.x,.92)*step(.06,u.y)*step(u.y,.82),typeK=pdL(.35,.45,row)*pdInv(.7,.8,row)*step(.18,word)*inText;
 float header=step(.86,u.y)*step(u.y,.93)*step(.08,u.x)*step(u.x,.6),grid=pdL(.478,.49,abs(fract(u.x*4.)-.5))*inText,ring=pdInv(0.,.02,abs(length(u-vec2(.7,.3))-.16))*.5;
 vec3 paper=mix(vec3(.86,.84,.78),vec3(.1,.1,.12),max(max(typeK*.7,header*.85),grid*.5));c=mix(c,mix(paper,vec3(.45,.3,.18),ring),page);rough=mix(rough,.9,page);
 float chartK=pdIs(aux.z,6.),cn=pdFbm(vec3(u*3.+vec2(1.3,4.2),.7)),shore=cn+(u.x-.55)*1.4,landK=pdL(0.,.02,shore);
 float contour=pdInv(.03,.06,abs(fract(shore*7.)-.5))*(1.-landK),crease=pdInv(0.,.006,abs(u.x-.5))+pdInv(0.,.006,abs(u.y-.5));
 vec3 chart=mix(vec3(.72,.8,.84),vec3(.86,.78,.58),landK)*(1.-contour*.25)*(1.-crease*.2);c=mix(c,chart,chartK);rough=mix(rough,.85,chartK);
 float photo=pdIs(aux.z,7.),inPic=step(.07,u.x)*step(u.x,.93)*step(.07,u.y)*step(u.y,.8),horizon=.45+sin(u.x*3.+aux.w*6.)*.03;
 vec3 pic=mix(vec3(.08,.22,.35),vec3(.45,.65,.85),step(horizon,u.y));pic=mix(vec3(.92,.9,.86),pic,inPic);c=mix(c,pic,photo);rough=mix(rough,.3,photo);
 float label=pdIs(aux.z,8.),lt=step(.3,fract(u.x*7.))*step(.3,pdHash21(floor(vec2(u.x*28.,3.))))*step(.25,u.y)*step(u.y,.75);c=mix(c,mix(vec3(.85,.85,.82),vec3(.05),lt),label);
 float fabric=pdIs(aux.z,9.),fold=pdFbm(p*vec3(9.,4.,9.)),stitch=pdL(.486,.494,abs(fract(p.y/.31)-.5))*step(.5,fract(p.x*160.+p.z*160.));
 c=mix(c,c*(fold*.35+.8)*(1.-stitch*.3),fabric);rough=mix(rough,.65+fold*.1,fabric);bump+=fold*.004*fabric;
 pdAlbedo=c;pdRough=rough;pdMetal=aux.y*(1.-salt*.4);pdHeight=bump;pdAO=aux.z>3.5?.6:1.;
}`,
  // Lobster traps: alpha-tested vinyl-coated wire and twine netting.
  trap: () => /* glsl */`{
 vec4 aux=vAux;vec2 u=vPdUv;float net=pdIs(aux.z,1.);vec2 dg=vec2(u.x+u.y,u.x-u.y)*.7071,q=mix(u/.038,dg/.05,net),fr=abs(fract(q)-.5),fw=fwidth(q);
 float hw=mix(${(.5 - .0045 / .038).toFixed(5)},${(.5 - .002 / .05).toFixed(5)},net),lineX=pdL(hw-fw.x,hw,fr.x),lineY=pdL(hw-fw.y,hw,fr.y);
 float b=.014,inner=step(b,u.x)*step(b,u.y)*step(u.x,aux.x-b)*step(u.y,aux.y-b),border=(1.-inner)*(1.-net);
 pdAlpha=max(max(lineX,lineY),border);pdAlbedo=vColor.rgb*mix(1.,.8,border);pdRough=.55;pdMetal=0.;
 if(pdAlpha<.5)discard;
}`
};

function patch(material, kind, shape, shared, octaves = 3) {
  material.defines = {...material.defines, PD_OCTAVES: octaves};
  material.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aux;varying vec4 vAux;varying vec3 vLocal;varying vec2 vPdUv;uniform float uBoatTime,uBoatWind;uniform vec3 uFlagPivot,uFlagDir;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvAux=aux;vLocal=position;vPdUv=uv;${kind === 'fittings' ? `
 {float wA=aux.w*aux.w,phase=position.x*3.1+position.z*1.7,gust=uBoatWind*.06+.5;
 vec3 sway=vec3(sin(uBoatTime*1.9+phase),0.,sin(uBoatTime*1.37+phase*1.3)*.6)*(wA*.12*gust);
 vec3 rel=position-uFlagPivot;float along=max(-rel.z,0.),fu=aux.w,flagWind=clamp(uBoatWind/12.,0.,1.),droop=(1.-flagWind)*1.15*(fu*.5+.5);
 vec3 lat=vec3(uFlagDir.z,0.,-uFlagDir.x);float flutter=sin(fu*9.-uBoatTime*(flagWind*9.+4.)+rel.y*4.)*fu*(flagWind*.05+.015);
 vec3 flagPos=vec3(uFlagPivot.x,0.,uFlagPivot.z)+uFlagDir*(along*cos(droop))+vec3(0.,rel.y-along*sin(droop),0.)+lat*flutter;
 transformed=mix(transformed+sway*step(abs(aux.z-3.),.5),flagPos,step(abs(aux.z-2.),.5));}` : ''}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLOBALS)
      .replace('#include <color_fragment>', `#include <color_fragment>\npdAO=1.;pdHeight=0.;pdClear=1.;pdClearRough=.1;pdAlpha=1.;pdEmissive=vec3(0.);pdRough=.5;pdMetal=0.;\n${SURFACES[kind](shape)}\n// rain and spray darken and gloss the boat a little\npdAlbedo*=1.-uBoatWet*.12;pdRough=mix(pdRough,pdRough*.55,uBoatWet);\ndiffuseColor.rgb=pdAlbedo;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(pdRough,.04,1.);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=clamp(pdMetal,0.,1.);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=pdBump(-vViewPosition,normal,pdHeight);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=pdAO;reflectedLight.indirectSpecular*=mix(1.,pdAO,.6);');
    if (kind === 'hull') s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat*=pdClear;material.clearcoatRoughness=clamp(pdClearRough,.0525,1.);');
  };
  material.customProgramCacheKey = () => 'pd-launch-' + kind + octaves;
  return material;
}

/**
 * Backlit instruments and lights. The radar, chart plotter, gauges and switch LEDs show the
 * launch's real state (see launch-instruments.js); nav, flood and cabin lights follow switches.
 * aux.z: 0 nav light, 1 radar, 2 chart plotter, 3 gauge dial, 4 flood light, 5 dome light, 6 LED/LCD.
 */
function glowMaterial(shared, octaves = 3) {
  const m = new T.MeshStandardMaterial({vertexColors: true, color: 0xffffff, roughness: .3, metalness: 0});
  m.defines.PD_OCTAVES = octaves;
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aux;varying vec4 vAux;varying vec3 vLocal;varying vec2 vPdUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux=aux;vLocal=position;vPdUv=uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
${GLOBALS}
uniform sampler2D uChart;uniform vec4 uSwitches;uniform vec4 uSwitches2;uniform float uGauge[5];uniform vec4 uEchoes[8];uniform float uRadarOn,uPlotterOn,uRadarSweep;
float pdGauge(vec2 u,float value){vec2 q=(u-.5)*2.;float r=length(q),a=atan(q.x,q.y),tickF=abs(fract(a/6.28318*24.)-.5);
 float ticks=pdInv(.08,.15,tickF)*pdL(.72,.76,r)*pdInv(.86,.9,r)*pdInv(2.3,2.4,abs(a));
 float na=-2.3+clamp(value,0.,1.)*4.6;vec2 nd=vec2(sin(na),cos(na));float along=dot(q,nd),perp=length(q-nd*along);
 float needle=pdInv(.025,.045,perp)*step(-.1,along)*pdInv(.68,.72,along);
 return (ticks*.9+needle*2.)*(uBoatNight*1.4+.25);}
`).replace('#include <color_fragment>', `#include <color_fragment>
 vec4 aux=vAux;vec3 vc=vColor.rgb;float mode=aux.z;vec2 u=vec2(1.-vPdUv.x,vPdUv.y);vec3 em=vec3(0.); // screens are seen from the face their uv runs backwards on
 // radar: head-up, real echoes from land and ships in range; dark when switched off
 {vec2 q=(u-.5)*2.;float r=length(q),ang=atan(q.x,q.y),da=fract((uRadarSweep-ang)/6.28318),trail=exp(da*-5.),beam=pdInv(0.,.01,da);
  float ring=pdInv(.012,.03,abs(fract(r*3.+.5)-.5)),heading=pdInv(.004,.012,abs(q.x))*step(0.,q.y),inside=pdInv(.96,.99,r);
  float echo=0.;for(int i=0;i<8;i++){vec4 e=uEchoes[i];if(e.w<=0.)continue;float d=length(q-e.xy)/max(e.z,.02);echo=max(echo,e.w*pdInv(.6,1.,d)*(.75+.25*pdNoise(vec3(q*40.,float(i)))));}
  float clutter=pdInv(.05,.18,r)*clamp(pdNoise(vec3(q*30.,uBoatTime*.5))*.5+.3,0.,1.)*.5;
  vec3 radar=(vec3(0.,.012,.04)+vec3(.05,.22,.28)*(ring*.5+heading*.6)+vec3(1.,.72,.12)*clamp(echo+clutter,0.,1.)*(trail*.75+.25)+vec3(.15,.9,.35)*(beam*.8+trail*.08))*inside*1.3;
  em+=radar*uRadarOn*pdIs(mode,1.);}
 em+=texture2D(uChart,u).rgb*(uBoatNight*.35+.75)*uPlotterOn*pdIs(mode,2.);
 {float gi=vLocal.x<-.65?0.:vLocal.x<-.45?2.:vLocal.x<-.23?1.:vLocal.x<-.05?3.:4.;
  float gv=gi<.5?uGauge[0]:gi<1.5?uGauge[1]:gi<2.5?uGauge[2]:gi<3.5?uGauge[3]:uGauge[4];
  em+=vec3(.9,.95,1.)*pdGauge(u,gv)*(uSwitches2.y*.75+.25)*pdIs(mode,3.);}
 // switch LEDs light only for switches that are on
 {float idx=floor((vLocal.x-.42)/.052+.5);float on=idx<.5?uSwitches.x:idx<1.5?uSwitches.y:idx<2.5?uSwitches.z:idx<3.5?uSwitches.w:idx<4.5?uSwitches2.x:uSwitches2.y;
  float isLed=step(vLocal.y,1.6);em+=vc*mix(1.,on,isLed)*(uBoatNight*.5+.45)*pdIs(mode,6.);}
 em+=vc*uSwitches.x*(uBoatNight*7.+1.5)*pdIs(mode,0.);
 em+=vc*uSwitches.y*(uBoatNight*9.+.3)*pdIs(mode,4.);
 em+=vc*uSwitches.z*(uBoatNight*2.2+.3)*pdIs(mode,5.);
 diffuseColor.rgb=vc*.06;pdEmissive=em;`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=pdEmissive;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(vAux.x,.05,1.);');
  };
  m.customProgramCacheKey = () => 'pd-launch-glow';
  return m;
}

function glassMaterial(shared, octaves = 3) {
  const m = new T.MeshPhysicalMaterial({color: 0xa9bec4, roughness: .05, metalness: 0, ior: 1.5, transparent: true, opacity: .25, side: T.DoubleSide, depthWrite: false, envMapIntensity: 1.2});
  m.defines.PD_OCTAVES = octaves;
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, shared);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aux;varying vec4 vAux;varying vec3 vLocal;varying vec2 vPdUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux=aux;vLocal=position;vPdUv=uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + GLOBALS)
      .replace('#include <color_fragment>', `#include <color_fragment>
 // dried salt spots and haze, heavier toward the lower edge where spray lands; rain washes some away
 vec2 gu=vPdUv;float spots=pdL(.45,.85,pdNoise(vec3(gu*38.,3.3))),haze=clamp(pdNoise(vec3(gu*4.,9.1))*.5+.5,0.,1.),edge=pdInv(0.,.18,gu.y);
 float salt=clamp((spots*.6+haze*.25)*(edge*.8+.35),0.,1.)*(1.-uBoatWet*.45);
 pdRough=.03+salt*.35;diffuseColor.a=.16+salt*.22;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.87,.86),salt*.35);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=pdRough;');
  };
  m.customProgramCacheKey = () => 'pd-launch-glass';
  return m;
}

/** Materials for each GeoKit bucket, sharing time, night, wetness, wind and flag uniforms. */
/** low: phones and tablets use two noise octaves instead of three. */
export function createLaunchMaterials(lines, {low = false} = {}) {
  const o = low ? 2 : 3;
  const shared = {
    uBoatTime: {value: 0}, uBoatNight: {value: 0}, uBoatWet: {value: 0}, uBoatWind: {value: 5},
    uFlagPivot: {value: new T.Vector3()}, uFlagDir: {value: new T.Vector3(0, 0, -1)},
    uChart: {value: null}, uSwitches: {value: new T.Vector4(1, 0, 0, 1)}, uSwitches2: {value: new T.Vector4(1, 0, 0, 0)},
    uGauge: {value: [0, 0, 0, 0, .5]}, uEchoes: {value: Array.from({length: 8}, () => new T.Vector4())},
    uRadarOn: {value: 1}, uPlotterOn: {value: 1}, uRadarSweep: {value: 0}
  };
  const shape = {zAft: lines.zAft, length: lines.length};
  const std = opts => new T.MeshStandardMaterial({vertexColors: true, side: T.DoubleSide, ...opts});
  const materials = {
    hull: patch(new T.MeshPhysicalMaterial({vertexColors: true, roughness: .25, clearcoat: 1, clearcoatRoughness: .1, side: T.DoubleSide}), 'hull', shape, shared, o),
    gelcoat: patch(std({roughness: .35}), 'gelcoat', shape, shared, o),
    wood: patch(std({roughness: .35}), 'wood', shape, shared, o),
    fittings: patch(std({roughness: .5}), 'fittings', shape, shared, o),
    trap: patch(std({roughness: .55}), 'trap', shape, shared, o),
    glow: glowMaterial(shared, o),
    glass: glassMaterial(shared, o)
  };
  return {materials, uniforms: shared, get(name) { return materials[name] || materials.fittings; }};
}
