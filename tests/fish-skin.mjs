// Every catchable species gets its own proportions and markings on a Tidewater body plan.
import assert from 'node:assert/strict';
import {FISH} from '../src/fishing-ecology.js';
import {FISH_LOOKS,speciesShape,fishGeometryFor,createFishMesh} from '../src/fish-skin.js';
import {SPECIES} from '../src/vendor/tidewater/fish/FishSpecies.js';
const marks=new Set();
for(const id of Object.keys(FISH)){
 assert.ok(FISH_LOOKS[id],id+' has a look');marks.add(FISH_LOOKS[id].mark);
 const S=speciesShape(id),geo=fishGeometryFor(id);
 assert.ok(geo.attributes.aData&&geo.attributes.position.count>1000,id+' geometry');
 const m=createFishMesh(id,{landed:true});m.userData.setLength(.6);
 assert.equal(m.userData.fishUniforms.uFInfo.value.w,.6);assert.ok(m.userData.fishUniforms.uFPose.value.x>0,'landed jaw open');
}
assert.equal(marks.size,Object.keys(FISH).length,'one marking set per species');
const maxTop=id=>Math.max(...speciesShape(id).top.map(p=>p[1]));
assert.ok(maxTop('opah')>maxTop('albacore')*1.8,'opah is a deep disc');
assert.ok(maxTop('wahoo')<Math.max(...SPECIES.barracuda.top.map(p=>p[1])),'wahoo is slender');
assert.ok(speciesShape('albacore').pectoral.len>speciesShape('skipjack').pectoral.len*2.5,'albacore has long pectorals');
assert.ok(speciesShape('yellowfin').anal[0].h[0][1]>speciesShape('bigeye').anal[0].h[0][1]*2,'yellowfin sickle fins');
console.log('fish skin ok');
