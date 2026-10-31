// A valid cast always gets a bite within BITE.maxWait seconds of active fishing; catches are never guaranteed.
import assert from 'node:assert/strict';
import {createBiteTimer,BITE} from '../src/bite-timer.js';
import {FISH,rigAdvice,pickWeighted,habitatWeights,oceanTemperature,RIGS} from '../src/fishing-ecology.js';
import {CatchMinigame} from '../src/vendor/tidewater/CatchMinigame.js';

assert.ok(BITE.maxWait<60&&BITE.firstMax<=BITE.maxWait&&BITE.retryMax<=BITE.maxWait,'every scheduled wait is under a minute');
// Random waits, including the extremes of the random source.
for(const r of [0,1e-9,.25,.5,.75,.999999,1]){
 const t=createBiteTimer(()=>r);t.start();let waited=0;
 while(!t.tick(1/60,true)){waited+=1/60;assert.ok(waited<BITE.maxWait+.05,`bite overdue at rng ${r}`);}
 assert.ok(waited>=BITE.firstMin-.05&&waited<=BITE.firstMax+.05);
}
let rng=7;const lcg=()=>(rng=(rng*16807)%2147483647)/2147483647;
for(let trial=0;trial<2000;trial++){const t=createBiteTimer(lcg);t.start();let s=0;while(!t.tick(.05,true))s+=.05;assert.ok(s<BITE.maxWait);}
// Paused, hidden or blocked time does not count; a stalled frame cannot skip the wait.
{const t=createBiteTimer(()=>0);t.start();for(let i=0;i<10000;i++)assert.equal(t.tick(1,false),false);assert.equal(t.waited,0);
 assert.equal(t.tick(500,true),false,'one huge frame advances at most maxStep');assert.ok(Math.abs(t.waited-BITE.maxStep)<1e-9);}
// Retrieving or cancelling clears the bite; a missed strike brings the next one sooner.
{const t=createBiteTimer(()=>.5);t.start();t.tick(3,true);t.cancel();for(let i=0;i<4000;i++)assert.equal(t.tick(.1,true),false);
 t.missed();let s=0;while(!t.tick(.1,true))s+=.1;assert.ok(s>=BITE.retryMin-.11&&s<=BITE.retryMax+.11);assert.equal(t.bites,1);}
// Exactly one bite per cast.
{const t=createBiteTimer(()=>0);t.start();let n=0;for(let i=0;i<2000;i++)if(t.tick(.1,true))n++;assert.equal(n,1);}

// Rig guidance: the player learns before casting why a rig cannot raise a bite.
const nemo={lat:-48.8767,lng:-123.39,temperature:oceanTemperature(-48.88,0),depth:4000,coastKm:2000,lureDepth:2};
assert.ok(rigAdvice(nemo).ok,'surface rig works at Point Nemo');
const deepSouth={lat:-58,lng:-120,temperature:7,depth:4000,coastKm:2000,lureDepth:2},deep=rigAdvice(deepSouth);
assert.equal(deep.ok,false);assert.equal(deep.suggest,40);assert.match(deep.reason,/deep drift/i);
assert.ok(rigAdvice({...deepSouth,lureDepth:40}).ok);
const atlantic=rigAdvice({...nemo,lng:-30});assert.equal(atlantic.ok,false);assert.match(atlantic.reason,/Pacific/);
const shallow=rigAdvice({lat:-20,lng:-150,temperature:26,depth:8,coastKm:.5,reef:false,lureDepth:40});assert.equal(shallow.ok,false);assert.match(shallow.reason,/too shallow/);
// Wherever advice says a cast is valid, a species is available for the bite: no indefinite waits,
// and no species from outside its simulated range.
let valid=0;
for(let lat=-65;lat<=30;lat+=1)for(const lng of [-170,-123,-80,150,-30])for(const month of [0,6])for(const coastKm of [.5,20,2000])for(const reef of [false,true])for(const rig of RIGS){
 const depth=coastKm<1?8:coastKm<30?150:3000,c={lat,lng,temperature:oceanTemperature(lat,month),depth,coastKm,reef,lureDepth:rig.depth},a=rigAdvice(c);
 if(!a.ok){assert.ok(a.reason.length>20,'every refusal is explained');continue;}
 valid++;for(const r of [0,.4,.9999]){const id=pickWeighted(a.weights,()=>r);assert.ok(FISH[id]);assert.ok(habitatWeights(c)[id]>0,'bite species belongs to this water and rig');}
}
assert.ok(valid>500);
// The bite is guaranteed, the catch is not: strong fish still break lines and weak pressure loses fish.
const snap=new CatchMinigame({species:'bluefin',kg:70,distance:20,rng:()=>0});for(let i=0;i<1200&&snap.state==='fighting';i++)snap.update(1/60,true);assert.equal(snap.state,'snapped');
const slack=new CatchMinigame({species:'pomfret',kg:2,distance:30,rng:()=>.5});for(let i=0;i<3000&&slack.state==='fighting';i++)slack.update(1/60,false);assert.equal(slack.state,'escaped');
console.log('PASS bite within',BITE.maxWait,'s of active fishing, paused time excluded, rig guidance before casting, catches still uncertain');
