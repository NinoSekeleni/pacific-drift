import assert from 'node:assert/strict';
import {journeyStages,journeyWeather} from '../src/weather-journey.js';
const base={from:230,swellFrom:220},start=1700000000000,seed=71;
const stages=journeyStages(seed,-49);assert.ok(stages.some(s=>s.kind==='storm'));assert.ok(stages.some(s=>s.kind==='calm'));assert.deepEqual(stages,journeyStages(seed,-49));
let last;for(let sec=0;sec<36000;sec++){const w=journeyWeather(base,-49,-123,start+sec*1000,start,seed,-49);for(const k of ['speed','swellH','precip','cover','dark','visibility','u','v','heat','temperature'])assert.ok(Number.isFinite(w[k]),k);assert.ok(w.visibility>=180);assert.ok(w.precip>=0&&w.precip<=1);if(last){assert.ok(Math.abs(w.speed-last.speed)<.9,'wind must not jump at stage boundaries');assert.ok(Math.abs(w.swellH-last.swellH)<.1,'swell persists through transitions');assert.ok(Math.abs(w.from-last.from)<1,'front direction is continuous');}last=w;}
const a=journeyWeather(base,27.49,-123,start+5000000,start,seed,-49),b=journeyWeather(base,27.51,-123,start+5000000,start,seed,-49);assert.ok(Math.abs(a.speed-b.speed)<.001,'crossing a latitude band never changes the timeline');
console.log('PASS continuous regional weather journeys across front and latitude boundaries');
