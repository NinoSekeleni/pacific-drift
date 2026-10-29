import assert from 'node:assert/strict';
import {skyTime,skyDescription} from '../src/world-clock.js';
import {skyBodies} from '../src/astro.js';
const t=Date.UTC(2026,9,29,18),lng=-123.3933;
for(const offset of [-11,0,2,13])assert.equal(skyTime(t,lng,{viewerOffset:offset}),t,'live sky never depends on browser timezone');
assert.notEqual(skyTime(t,lng,{mode:'experience',viewerOffset:2}),t);
for(const hour of [0,5.5,12,23.9]){
 const shifted=skyTime(t,lng,{hour});const solarHour=((shifted/3600e3+lng/15)%24+24)%24;
 assert.ok(Math.abs(solarHour-hour)<1e-7);
}
const actual=skyBodies(t,-48.8767,lng);assert.ok(actual.sun.alt>0,'Point Nemo is in daylight at this recorded UTC instant');assert.ok(actual.moon.alt<0);
assert.ok(skyDescription(30,-20,.8).includes('Daylight'));assert.ok(skyDescription(-25,-20,.8).includes('Moon below'));
assert.ok(skyDescription(-25,25,.8).includes('80% illuminated'));
console.log('PASS timezone-independent live astronomy, solar-time studio controls and honest moon/horizon descriptions');
