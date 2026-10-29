import assert from 'node:assert/strict';
import {recordingLevel} from '../src/audio-levels.js';
import {soundMix,waterEventInterval,waveEventInterval} from '../src/sound-mix.js';
const quiet=Float32Array.from({length:1000},(_,i)=>Math.sin(i*.17)*.006);
const loud=Float32Array.from({length:1000},(_,i)=>Math.sin(i*.17)*.9);
const spike=quiet.slice();spike[23]=1;
assert.ok(recordingLevel([quiet])>1,'quiet approved water recordings need audible level compensation');
assert.ok(recordingLevel([loud])<1,'loud clips must be brought down rather than added louder');
assert.ok(recordingLevel([spike])<=.85,'a peaky recording cannot be normalized into clipping');
assert.equal(recordingLevel([new Float32Array(1000)]),0,'silence must not produce infinite amplification');
assert.ok(Number.isFinite(recordingLevel([Float32Array.of(NaN,0,.1)])),'invalid source samples cannot create a non-finite gain');
for(const t of [0,10,100,500]){
  const flat=soundMix(0,0,0,0,t),gentle=soundMix(1,.2,0,.03,t),rough=soundMix(20,4,0,1,t);
  assert.equal(flat.ocean+flat.waves+flat.water,0,'perfectly flat water has no fabricated ambient floor');
  assert.ok(gentle.ocean>0&&gentle.water>0,'a calm moving sea still has ambient water detail');
  assert.ok(rough.waves>gentle.waves,'passing wave movement grows with sea state');
  assert.equal(rough.fallbackSea+rough.fallbackWind+rough.fallbackRain,0,'no generated noise bed is mixed into environmental audio');
}
for(const random of [0,.25,.5,1]){
  assert.ok(waterEventInterval(.1,random)>waterEventInterval(4,random),'calm laps have more breathing room than a rough sea');
  assert.ok(waveEventInterval(4,random)>=4,'wave sounds cannot become a rapid repeated splash');
}
console.log('PASS bounded recording loudness, silent flat sea, audible moving calm water, and sparse event timing');
for(const wind of [0,5,15,26])for(const height of [0,.08,.5,1,1.3])assert.equal(soundMix(wind,height,0,.3,100).waves,0,'furious waves must stay silent below the rough-water threshold');
assert.ok(soundMix(6,3,0,.3,100).waves>soundMix(6,1.5,0,.3,100).waves,'rough-wave audio must fade up over increasing swell');
assert.ok(soundMix(26,1.8,0,.3,100).waves>soundMix(6,1.8,0,.3,100).waves,'strong wind develops the wave layer sooner above the threshold');
const fs=await import('node:fs');
const manifest=JSON.parse(fs.readFileSync(new URL('../public/data/soundscape.json',import.meta.url)));
for(const [id,role] of [['magnific-3643','ocean'],['magnific-2995','waves']]){
 const entry=manifest.recordings.find(r=>r.id===id);assert.equal(entry.role,role);assert.equal(entry.loop,true);assert.equal(entry.approved,true);assert.ok(fs.statSync(new URL('../public/'+entry.file,import.meta.url)).size>10000);
}
console.log('PASS approved dedicated ocean/wave files and rough-water-only wave activation');
