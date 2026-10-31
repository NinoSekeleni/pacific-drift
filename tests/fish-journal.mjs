import assert from 'node:assert/strict';
import {FISH} from '../src/fishing-ecology.js';
import {createFishJournal,normaliseRecords,speciesStats,formatPosition} from '../src/fish-journal.js';
import fs from 'node:fs';
const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
// Records saved by the previous release (no rig, no boat) survive unchanged in meaning.
const legacy=[{id:'pomfret',kg:1.2,cm:38.5,kept:false,at:1793400000000,lat:-48.9,lng:-123.4},{id:'bluefin',kg:22.5,cm:120,kept:true,at:1793400100000,lat:-48.8,lng:-123.3},{id:'notAFish',kg:2},{id:'pomfret',kg:'heavy'}];
store.set('pacific-drift-fishing-v1',JSON.stringify(legacy));
const j=createFishJournal({FISH,storage});
assert.equal(j.records.length,2);assert.equal(j.records[0].rig,null);assert.equal(j.records[1].kept,true);
const first=j.record({id:'mahi',kg:6.4,cm:96,kept:false,lat:-20,lng:-150,rig:2,boat:'launch'});assert.equal(first.firstOfSpecies,true);
const again=j.record({id:'pomfret',kg:2.1,cm:45,kept:true,lat:-48.7,lng:-123.2,rig:40,boat:'rowboat'});assert.equal(again.firstOfSpecies,false);
// A reload (or switching boats, which share the journal) reads the same records back.
const reloaded=createFishJournal({FISH,storage});assert.equal(reloaded.records.length,4);
const s=reloaded.stats('pomfret');assert.equal(s.count,2);assert.equal(s.maxKg,2.1);assert.equal(s.first.at,1793400000000);assert.equal(s.kept,1);assert.equal(s.released,1);
assert.equal(reloaded.stats('opah').count,0);
// Older releases filtered the array by FISH id and finite kg: the new format stays readable by them.
const raw=JSON.parse(store.get('pacific-drift-fishing-v1'));assert.ok(Array.isArray(raw));assert.equal(raw.filter(r=>FISH[r.id]&&Number.isFinite(r.kg)).length,4);
assert.equal(formatPosition(-48.88,-123.39),'48.88° S, 123.39° W');assert.equal(formatPosition(null,1),'Position not recorded');
assert.deepEqual(normaliseRecords('nonsense',FISH),[]);assert.equal(speciesStats([], 'albacore').count,0);
// Every catchable species has its illustration in both sizes, and the prompts are recorded.
for(const id of Object.keys(FISH))for(const w of [480,1024,'silhouette']){const p=new URL(`../public/fish/${id}-${w}.webp`,import.meta.url);assert.ok(fs.existsSync(p),`${id}-${w}`);assert.ok(fs.statSync(p).size<90000);}
const prompts=fs.readFileSync(new URL('../public/fish/PROMPTS.md',import.meta.url),'utf8');for(const f of Object.values(FISH))assert.ok(prompts.includes(f.sci),f.sci);
console.log('PASS journal migration, stats, shared storage across boats and reloads, illustrations and prompt record');
