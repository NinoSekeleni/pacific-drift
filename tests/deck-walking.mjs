import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDeckWalker,buildLaunchColliders,toCanoeLocal,HELM_EYE,EYE} from '../src/deck-walker.js';
import {HullLines} from '../src/vendor/tidewater/boat/HullLines.js';
const L=new HullLines(),boxes=buildLaunchColliders(L);assert.ok(boxes.length>=20);
const solid=boxes.filter(b=>b.solid);
function inside(p){for(const c of solid){const top=c.center.y+c.half.y,bot=c.center.y-c.half.y;if(top<=p.y+.36||bot>=p.y+1.75)continue;if(Math.abs(p.x-c.center.x)<c.half.x+.2&&Math.abs(p.z-c.center.z)<c.half.z+.2)return c.tag;}return null;}
let rng=3;const r=()=>(rng=(rng*48271)%2147483647)/2147483647;
const w=createDeckWalker({lines:L});
for(let i=0;i<20000;i++){
 w.update(1/60,{forward:r()*2-1,right:r()*2-1,yaw:r()*6.3,brisk:r()>.7});
 const p=w.position;assert.ok([p.x,p.y,p.z].every(Number.isFinite));
 const half=L.halfBreadth(L.tAtSheerZ(p.z),Math.max(p.y,L.deckY))-L.shell;assert.ok(Math.abs(p.x)<=half+1e-6,'inside the bulwarks');
 assert.ok(p.z>L.zAft&&p.z<4.1);assert.equal(inside(p),null,'never inside the cabin, gear or railings');
}
// From the cockpit the helm is reachable, and the wheelhouse is not open deck.
w.place(-0.05,-1.75);assert.ok(w.onOpenDeck());assert.ok(!w.nearHelm());
for(let i=0;i<600&&!w.nearHelm();i++){const dx=-.55-w.position.x,dz=.22-w.position.z;w.update(1/60,{forward:1,yaw:Math.atan2(dx,dz)});}
assert.ok(w.nearHelm(),'walked to the wheel');w.place(0,.6);assert.ok(!w.onOpenDeck(),'inside the wheelhouse');
// Gliding moves smoothly (no teleport) and calls back on arrival.
let arrived=false;w.glideTo(-0.05,-1.75,1,()=>arrived=true);let last=w.position.clone(),maxStep=0;
for(let i=0;i<90;i++){w.update(1/60);maxStep=Math.max(maxStep,w.position.distanceTo(last));last.copy(w.position);}
assert.ok(arrived);assert.ok(maxStep<.06,'no jump while gliding');
// Eye coordinates map into Pacific Drift's frame (bow toward -z) and match the helm eye convention.
const eye=w.eyeLocal();assert.ok(Math.abs(eye.y-(L.deckY+EYE))<.03);assert.ok(eye.z>0,'cockpit is aft in canoe coordinates');
assert.deepEqual(toCanoeLocal(HELM_EYE).toArray().map(v=>+v.toFixed(2)),[.55,1.85,-.3]);
console.log('PASS deck walking stays aboard and clear of colliders, helm reachable, smooth glides');
