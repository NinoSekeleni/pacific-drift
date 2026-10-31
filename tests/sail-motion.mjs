import assert from 'node:assert/strict';
import {sailFlap} from '../src/sail-motion.js';
let events=0,previous=0;for(let i=0;i<120*60;i++){const v=sailFlap(i/60,12,true);assert.ok(v>=0&&v<=1);if(v>.22&&previous<=.22)events++;previous=v;assert.equal(sailFlap(i/60,12,false),0);assert.equal(sailFlap(i/60,0,true),0);}assert.ok(events>8&&events<18,'gusts produce discrete cloth/sound events rather than a continuous rattle');
console.log('PASS shared fabric gust envelope, bounded energy and sail-down/calm silence');
