import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sampleArrival,ARRIVAL_DURATION,arrivalLocation,globeDirection,formatArrivalCoordinates,arrivalStory,arrivalGlobeFov} from '../src/world-arrival.js';

let lastHeight=Infinity,lastZoom=-1,lastAudio=-1,lastAlpha=1;
for(let t=0;t<ARRIVAL_DURATION+.01;t+=.01){
 const s=sampleArrival(t);for(const v of [s.height,s.zoom,s.audio,s.globeOpacity,s.blend])assert.ok(Number.isFinite(v));
 assert.ok(s.height>=0&&s.height<=1800.00001);assert.ok(s.height<=lastHeight+1e-8,'descent never moves upward');
 assert.ok(s.zoom>=lastZoom&&s.audio>=lastAudio&&s.globeOpacity<=lastAlpha);
 for(const v of [s.zoom,s.audio,s.globeOpacity,s.blend])assert.ok(v>=0&&v<=1);
 lastHeight=s.height;lastZoom=s.zoom;lastAudio=s.audio;lastAlpha=s.globeOpacity;
}
assert.equal(sampleArrival(0).height,1800);assert.equal(sampleArrival(ARRIVAL_DURATION).height,0);
assert.equal(sampleArrival(ARRIVAL_DURATION).blend,1);assert.equal(sampleArrival(ARRIVAL_DURATION).audio,1);
assert.equal(sampleArrival(ARRIVAL_DURATION).globeOpacity,0);assert.equal(sampleArrival(ARRIVAL_DURATION).done,true);
// End derivatives approach zero, preventing a height/orientation snap at handover.
assert.ok(sampleArrival(ARRIVAL_DURATION-.001).height<.00001);
assert.ok(1-sampleArrival(ARRIVAL_DURATION-.001).blend<.00001);
const voyage={lat:-48.8767,lng:-123.3933,nav:false,est:{lat:-40,lng:-100}};
assert.equal(arrivalLocation(voyage).title,'Point Nemo');
const returned=arrivalLocation({...voyage,lat:-47,lng:-120});assert.equal(returned.lat,-47);assert.equal(returned.title,'Your position');
const nav=arrivalLocation({...voyage,nav:true});assert.equal(nav.lat,-40);assert.equal(nav.lng,-100);assert.equal(nav.title,'Estimated position');assert.equal(nav.estimated,true);
assert.ok(!formatArrivalCoordinates(nav.lat,nav.lng).includes('123.39'),'navigator arrival cannot reveal the actual longitude');
for(const [lat,lng]of [[0,0],[90,0],[-90,180],[-48.8767,-123.3933]])assert.ok(Math.abs(globeDirection(lat,lng).length()-1)<1e-12);
assert.ok(globeDirection(0,0).distanceTo(new THREE.Vector3(1,0,0))<1e-12);
assert.ok(globeDirection(0,90).distanceTo(new THREE.Vector3(0,0,-1))<1e-12,'globe directions match Three sphere UV orientation');
for(const options of [{},{returning:true},{estimated:true}]){const story=arrivalStory(options);assert.equal(story.length,4);assert.ok(story.every(s=>s.split(/\s+/).length<=16),'each story card has time to be read');assert.match(story[3],/shore/);}
assert.match(arrivalStory()[0],/South Pacific/);assert.match(arrivalStory({returning:true})[0],/away/);assert.match(arrivalStory({estimated:true})[0],/estimate/);
for(const aspect of [.46,.75,1,1.78]){const vertical=arrivalGlobeFov(aspect)*Math.PI/180,horizontal=2*Math.atan(Math.tan(vertical/2)*aspect);assert.ok(Math.min(vertical,horizontal)>=44*Math.PI/180-1e-8,'the globe fits both portrait and landscape views');}
console.log('PASS smooth bounded descent, exact seat handover, audio fade, geographic orientation, returning positions and Navigator privacy');
