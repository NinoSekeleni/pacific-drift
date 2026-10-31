import assert from 'node:assert/strict';
import {LAUNCH_SUPPORTS,PROP_LAYOUT} from '../src/boat-props.js';
import {createMotorboat} from '../src/motorboat.js';
import {createLaunchInstruments,radarEcho,defaultSwitches,SWITCHES} from '../src/launch-instruments.js';
import {createLaunchMaterials} from '../src/launch-materials.js';
import {HullLines} from '../src/vendor/tidewater/boat/HullLines.js';
for(const id of Object.keys(PROP_LAYOUT))assert.ok(LAUNCH_SUPPORTS[id]?.length>=2,`${id} has launch supports`);
// Every GeoKit bucket gets a Tidewater-derived material, not plain vertex colour.
const finish=createLaunchMaterials(new HullLines());for(const k of ['hull','gelcoat','wood','fittings','trap','glow','glass'])assert.ok(finish.materials[k].customProgramCacheKey().startsWith('pd-launch-'),k);
assert.ok(finish.materials.hull.clearcoat>0);assert.ok(finish.materials.glass.transparent);
const boat=createMotorboat();const names=boat.surfaces.map(m=>m.name);for(const k of ['hull','gelcoat','wood','fittings','glass','glow'])assert.ok(names.includes('launch '+k),k);
// Instruments: needles and switches follow the boat; radar shows real targets only within range.
const sw=defaultSwitches();assert.equal(Object.keys(sw).length,SWITCHES.length);
const inst=createLaunchInstruments({uniforms:boat.uniforms,getSwitches:()=>sw,setSwitch:(k,v)=>sw[k]=v,document:undefined});
const v={lat:-48.9,lng:-123.4,heading:90,speed:3,track:[]};
for(let i=0;i<300;i++)inst.update(1/30,i/30,v,{throttle:1,steer:.5,echoes:[radarEcho(90,5000,90)]});
const g=boat.uniforms.uGauge.value;assert.ok(g[0]>.9,'tachometer near full');assert.ok(Math.abs(g[2]-3*1.944/12)<1e-6,'speed log');assert.ok(g[4]>.7,'rudder indicator');
const e=boat.uniforms.uEchoes.value[0];assert.ok(Math.abs(e.x)<1e-6&&e.y>0,'dead ahead is up on a head-up radar');assert.equal(boat.uniforms.uEchoes.value[1].w,0);
assert.equal(radarEcho(0,30*1852,0),null,'beyond 12 nm');
inst.toggle('radar');assert.equal(sw.radar,false);inst.update(.1,20,v,{});assert.equal(boat.uniforms.uRadarOn.value,0,'radar dark when switched off');
boat.update(.1,3,.5,1,{radarOn:true,floodOn:true,night:1});
console.log('PASS launch supports, Tidewater finishes on every bucket, live instruments and switches');
