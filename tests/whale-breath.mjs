// Whales breathe in runs: a rise, three to six blows with the back rolling under between them,
// and a dive. Humpbacks lift their flukes and leave a glassy print; the marks fade away.
import assert from 'node:assert/strict';
import {createWhaleBreath,breathKeys} from '../src/whale-breath.js';
import {createWhaleWater,WHALE_MARKS} from '../src/whale-water.js';

function seeded(seed){return()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};}
function run(kind,length,skin,seed){
 const w=createWhaleBreath(kind,{length,skin,rand:seeded(seed)}),log={blows:0,prints:0,minDepth:Infinity,maxPitch:-9,minPitch:9,time:0,blowFrames:0};
 let prevBlows=0;
 for(let i=0;i<20000&&!w.state.done;i++){const st=w.update(1/30);log.time+=1/30;
  if(st.blows!==prevBlows){log.blows++;prevBlows=st.blows;assert.ok(st.depth<skin+.35,'blows happen with the blowholes at the surface: '+st.depth.toFixed(2));}
  if(st.blow>0)log.blowFrames++;if(st.flukePrint)log.prints++;
  log.minDepth=Math.min(log.minDepth,st.depth);log.maxPitch=Math.max(log.maxPitch,st.pitch);log.minPitch=Math.min(log.minPitch,st.pitch);}
 log.state=w.state;return log;
}
for(const seed of [3,77,901]){
 const h=run('humpback',15,.8,seed);
 assert.ok(h.state.done,'the sequence ends');
 assert.equal(h.blows,h.state.breaths,'one blow per breath');
 assert.ok(h.blows>=3&&h.blows<=6,'three to six breaths');
 assert.ok(h.blowFrames/30>h.blows*1.0,'each blow lasts about a second and a half');
 assert.equal(h.prints,1,'one fluke print per dive');
 assert.ok(h.minPitch<-.6,'the fluke-up dive pitches steeply down');
 assert.ok(h.minDepth>.4,'the root never leaps clear of the water');
 assert.ok(h.state.depth>4,'back at depth afterwards');
 assert.ok(h.time>60&&h.time<200,'a humpback surfacing takes a minute or three: '+h.time.toFixed(0));
}
const o=run('orca',6.5,.5,11);
assert.equal(o.prints,0,'orcas do not raise flukes');
assert.ok(o.blows>=2&&o.blows<=4);
assert.ok(o.time<run('blue',27,1.5,11).time,'a blue whale breathes more slowly than an orca');
assert.ok(breathKeys('blue',{length:27,skin:1.5,rand:()=>.5}).deep>8,'blue whales sound deep');

// Marks: foam is positive, the print negative, both grow and fade, and the array never overflows.
const marks=createWhaleWater();
marks.foam(10,20,5);marks.slick(-4,3,6);marks.update(1);
const u=marks.uniform.value;
assert.equal(u.length,WHALE_MARKS);
assert.ok(u[0].w>0&&u[0].z>5,'foam spreads');assert.ok(u[1].w<0,'slick');
for(let i=0;i<10;i++)marks.foam(i,i,3);marks.update(.1);
assert.equal(marks.count,WHALE_MARKS,'oldest marks give way');
for(let i=0;i<40;i++)marks.update(1);
assert.equal(marks.count,0,'marks fade away');assert.ok(u.every(v=>v.w===0));
console.log('whale breathing ok');
