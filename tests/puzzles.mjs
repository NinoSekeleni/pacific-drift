// The puzzle book: a fair five-letter word game and criss-cross grids that are always valid.
import assert from 'node:assert/strict';
import {WORDS,ENTRIES,wordOfDay,scoreGuess,buildCrissCross,dayNumber} from '../src/puzzles.js';
assert.ok(WORDS.length>=250&&WORDS.every(w=>/^[a-z]{5}$/.test(w)),'answers are five letters');
assert.equal(new Set(WORDS).size,WORDS.length,'no repeated answers');
assert.deepEqual(scoreGuess('LEVEL','HELLO'),['near','hit','miss','miss','near'],'repeated letters count only as often as they appear');
assert.deepEqual(scoreGuess('OCEAN','OCEAN'),Array(5).fill('hit'));
const seen=new Set();for(let d=0;d<WORDS.length;d++)seen.add(wordOfDay(20000+d));
assert.equal(seen.size,WORDS.length,'every word comes round once per cycle');
assert.equal(wordOfDay(dayNumber(Date.UTC(2026,10,1,1))),wordOfDay(dayNumber(Date.UTC(2026,10,1,23))),'one word all day');
assert.ok(ENTRIES.every(([w,c])=>/^[A-Z]+$/.test(w)&&c.length>8),'entries are letters with a clue');
for(let d=0;d<400;d++){
 const p=buildCrissCross(20000+d);assert.ok(p.words.length>=8,'enough words: '+p.words.length);assert.ok(p.width<=13&&p.height<=13,'fits the page');
 const owner=new Map();
 for(const w of p.words)for(let i=0;i<w.answer.length;i++){const y=w.row+(w.dir==='down'?i:0),x=w.col+(w.dir==='across'?i:0);assert.equal(p.cells[y][x],w.answer[i],'letters agree');const k=y+','+x;owner.set(k,[...(owner.get(k)||[]),w]);}
 // any two neighbouring letters belong to one word running through both
 for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){if(!p.cells[y][x])continue;
  if(x+1<p.width&&p.cells[y][x+1])assert.ok(owner.get(y+','+x).some(w=>w.dir==='across'&&owner.get(y+','+(x+1)).includes(w)),`stray across pair day ${d}`);
  if(y+1<p.height&&p.cells[y+1][x])assert.ok(owner.get(y+','+x).some(w=>w.dir==='down'&&owner.get((y+1)+','+x).includes(w)),`stray down pair day ${d}`);}
 // connected
 const start=p.words[0],q=[[start.row,start.col]],vis=new Set([start.row+','+start.col]);while(q.length){const [y,x]=q.pop();for(const [dy,dx]of [[1,0],[-1,0],[0,1],[0,-1]]){const k=(y+dy)+','+(x+dx);if(p.cells[y+dy]?.[x+dx]&&!vis.has(k)){vis.add(k);q.push([y+dy,x+dx]);}}}
 assert.equal(vis.size,owner.size,'one connected grid');
 assert.equal(new Set(p.words.map(w=>w.number+w.dir)).size,p.words.length,'numbers are unique per direction');
}
console.log('PASS daily word scoring and cycling, valid connected criss-cross grids for 400 days');
