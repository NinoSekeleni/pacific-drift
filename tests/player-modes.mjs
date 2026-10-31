import assert from 'node:assert/strict';
import {KEYMAP,actionFor,held,createPlayerModes,createThrottle,helpFor} from '../src/player-modes.js';
import {step,newVoyage,LAUNCH_SPEED} from '../src/voyage.js';
// Walking never drives or steers; the helm has no walking; fishing has one action.
const walk=Object.values(KEYMAP.walk),helm=Object.values(KEYMAP.helm),fish=Object.values(KEYMAP.fish),row=Object.values(KEYMAP.row);
for(const a of ['steerLeft','steerRight','throttleUp','throttleDown','row','sail'])assert.ok(!walk.includes(a),a);
for(const a of ['forward','back','left','right','row','sail'])assert.ok(!helm.includes(a),a);
for(const a of ['forward','steerLeft','throttleUp','row','sail','interact'])assert.ok(!fish.includes(a),a);
assert.ok(!row.includes('throttleUp')&&!row.includes('forward'));
assert.equal(actionFor('walk','KeyE'),'interact');assert.equal(actionFor('helm','KeyE'),'leaveHelm');assert.equal(actionFor('row','KeyE'),'sail');assert.equal(actionFor('fish','KeyE'),null);
assert.equal(actionFor('helm','KeyW'),'throttleUp');assert.equal(actionFor('walk','KeyW'),'forward');assert.equal(actionFor('fish','Space'),'fishAction');
assert.ok(held('helm','throttleUp',new Set(['ArrowUp'])));assert.ok(!held('walk','throttleUp',new Set(['KeyW'])));
for(const m of ['row','walk','helm','fish'])assert.ok(helpFor(m,'launch').rows.length>=3);
assert.ok(!/\brow\b/.test(JSON.stringify(helpFor('helm','launch'))));
// Mode transitions: the launch starts at the helm; fishing from the helm returns you to the deck.
const changes=[];const modes=createPlayerModes({onChange:(m,p)=>changes.push([p,m])});
modes.setVessel('launch');assert.equal(modes.mode,'helm');modes.fish();assert.equal(modes.mode,'fish');modes.endFish();assert.equal(modes.mode,'walk');
modes.helm();modes.walk();modes.fish();modes.endFish();assert.equal(modes.mode,'walk');
modes.setVessel('rowboat');assert.equal(modes.mode,'row');modes.walk();assert.equal(modes.mode,'row','no walking in the rowboat');modes.helm();assert.equal(modes.mode,'row');modes.fish();modes.endFish();assert.equal(modes.mode,'row');
// Throttle: ramps, holds when released, stops at neutral before going astern.
const t=createThrottle();for(let i=0;i<300;i++)t.update(1/60,true,false);assert.equal(t.value,1);for(let i=0;i<60;i++)t.update(1/60,false,false);assert.equal(t.value,1);
for(let i=0;i<600;i++)t.update(1/60,false,true);assert.equal(t.value,0,'detent at neutral while the key is held');t.update(1/60,false,false);for(let i=0;i<600;i++)t.update(1/60,false,true);assert.equal(t.value,-.5);assert.match(t.label(),/Astern 100%/);t.neutral();assert.equal(t.label(),'Neutral');
// The launch answers the throttle, and neutral lets it coast to a stop.
const v=newVoyage(0);v.boat='launch';for(let i=0;i<600;i++)step(v,.1,{steer:0,throttle:1},null);assert.ok(Math.abs(v.speed-LAUNCH_SPEED)<.05);
for(let i=0;i<900;i++)step(v,.1,{steer:0,throttle:0},null);assert.ok(Math.abs(v.speed)<.05);
for(let i=0;i<600;i++)step(v,.1,{steer:0,throttle:-.5},null);assert.ok(v.speed<-1);const h0=v.heading;step(v,1,{steer:1,throttle:-.5},null);assert.ok(((v.heading-h0+540)%360-180)<0,'astern, the helm turns the other way');
// Walking (no throttle in the input) never moves the launch under power.
const w=newVoyage(0);w.boat='launch';for(let i=0;i<300;i++)step(w,.1,{steer:0,paddle:0,throttle:0},null);assert.ok(Math.abs(w.speed)<1e-6);
console.log('PASS one meaning per key per mode, mode transitions, throttle detent and launch response');
