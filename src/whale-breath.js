// Breathing behaviour for the large whales, after Tidewater's WhaleBrain (MIT): a slow rise, a
// run of breaths at the surface (each one a blow, then the head goes down and the back and
// dorsal fin roll through), and a fluke-up dive back to depth. Pure state, no Three.js, so the
// marine encounters can drive their rigid models from it and the tests can step it.
//
// Depths are metres of the model root below the local sea surface (positive = under).
// Pitch is radians, nose up positive. The sequence is scaled by body length so an orca
// breathes quickly and shallowly and a blue whale slowly and deep.

const SPECIES={
 humpback:{breaths:[3,6],time:1,blowHeight:3.8,flukes:true},
 blue:{breaths:[3,5],time:1.25,blowHeight:7,flukes:false},
 orca:{breaths:[2,4],time:.55,blowHeight:1.6,flukes:false}
};
export const BREATHERS=Object.keys(SPECIES);

export function breathKeys(kind,{length=15,skin=.8,rand=Math.random}={}){
 const s=SPECIES[kind]||SPECIES.humpback,u=length/14,tm=s.time,deep=Math.max(skin+3,length*.32);
 const n=s.breaths[0]+Math.floor(rand()*(s.breaths[1]-s.breaths[0]+1)),k=[];
 k.push({t:9*tm,depth:skin+.2*u,pitch:.08,speed:.6}); // rise
 for(let i=0;i<n;i++){
  k.push({t:3.5*tm,depth:skin,pitch:.1,speed:.6,blow:true,stiff:1});
  if(i<n-1){
   k.push({t:4*tm,depth:skin+1.1*u,pitch:-.14,speed:.6,roll:true}); // head down, back rolls through
   k.push({t:(7+rand()*6)*tm,depth:skin+2.3*u,pitch:0,speed:.6});
   k.push({t:5*tm,depth:skin+.2*u,pitch:.08,speed:.6,stiff:1});
  }
 }
 if(s.flukes){
  // arch, then pitch down steeply so the flukes lift clear and slip under
  k.push({t:3,depth:skin+.1*u,pitch:-.12,speed:.75,arch:true});
  k.push({t:4.5,depth:skin+3.9*u,pitch:-.95,speed:.8,fluke:true,stiff:1});
  k.push({t:6,depth:deep,pitch:-.45,speed:.9});
 }else{
  k.push({t:4*tm,depth:skin+1.4*u,pitch:-.22,speed:.8,roll:true});
  k.push({t:6*tm,depth:deep,pitch:-.3,speed:.9});
 }
 k.push({t:8,depth:deep,pitch:0,speed:1});
 return {keys:k,breaths:n,deep};
}

export function createWhaleBreath(kind,{length=15,skin=.8,rand=Math.random,startDelay=0}={}){
 const plan=breathKeys(kind,{length,skin,rand});
 const st={kind,depth:plan.deep,vy:0,pitch:0,speed:1,blow:0,fluke:0,blows:0,flukePrint:false,surfacing:false,done:false,
  breaths:plan.breaths,blowHeight:(SPECIES[kind]||SPECIES.humpback).blowHeight,key:-1,keyT:0,wait:startDelay};
 let blown=false,printed=false;
 function update(dt){
  dt=Math.min(dt,.1);st.blow=0;st.fluke=0;st.flukePrint=false;
  let target={depth:plan.deep,pitch:0,speed:1};
  if(st.wait>0){st.wait-=dt;}
  else if(!st.done){
   if(st.key<0){st.key=0;st.keyT=0;}
   const key=plan.keys[st.key];target=key;st.keyT+=dt;
   if(key.blow){if(key.start==null&&(st.depth<skin+.25||st.keyT>key.t*.5))key.start=st.keyT;const tb=key.start==null?-1:st.keyT-key.start-.25;const len=1.4*Math.min(1,key.t/3.5+.3);
    st.blow=tb>0&&tb<len?Math.sqrt(Math.sin(Math.PI*Math.min(tb/len,1))):0;
    if(tb>0&&!blown){blown=true;st.blows++;}}
   if(key.fluke){st.fluke=Math.min(1,st.keyT/key.t);if(st.fluke>.6&&!printed){printed=true;st.flukePrint=true;}}
   if(st.keyT>=key.t&&!(key.blow&&st.blow>0)){st.key++;st.keyT=0;blown=false;if(st.key>=plan.keys.length){st.done=true;st.key=-1;}}
  }
  st.surfacing=!st.done&&st.key>=0;
  // depth: critically damped toward the target; the fluke dive pulls down harder
  const w=target.stiff??.7,ay=(target.depth-st.depth)*w*w-2*w*st.vy;
  st.vy+=ay*dt;st.depth+=st.vy*dt;
  st.speed+=((target.speed??1)-st.speed)*Math.min(1,dt*.5);
  const pitchT=Math.atan2(-st.vy,Math.max(1.5*st.speed,.5))*.8+(target.pitch||0);
  st.pitch+=(pitchT-st.pitch)*Math.min(1,dt*(target.fluke?1.1:.9));
  return st;
 }
 return {update,state:st,plan};
}
