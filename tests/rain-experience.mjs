import assert from 'node:assert/strict';import * as THREE from 'three';
import {createRain}from'../src/rain.js';import{createSeaRain,rainInsideBoat}from'../src/sea-rain.js';import{createHullRain}from'../src/hull-rain.js';import{createLensRain}from'../src/lens-rain.js';
const saved=Math.random;let seed=19;Math.random=()=>((seed=seed*16807%2147483647)-1)/2147483646;
try{
 const scene=new THREE.Scene(),rain=createRain(scene),cam=new THREE.Vector3(0,2,0);rain.update(.016,cam,.4,4,2,[.2,.3,.4]);
 const layers=scene.children.filter(x=>x.name.endsWith('rain'));assert.equal(layers.length,3);assert.ok(rain.state.counts.every(n=>n>0));assert.equal(rain.state.veil,true);
 const mid=layers[1],positions=mid.geometry.attributes.aDrop.array,before=positions.slice();cam.x+=.2;rain.update(.01,cam,.4,0,0,[.2,.3,.4]);assert.ok(Math.abs(positions[0]-before[0])<.01,'rain stays in world space rather than following the moving eye');
 const counts=rain.state.counts.slice();rain.update(.01,cam,.4,15,-4,[.2,.3,.4],{veil:false});assert.deepEqual(rain.state.counts,counts);assert.equal(rain.state.veil,false);assert.ok(mid.material.uniforms.uVelocity.value.x>0&&mid.material.uniforms.uVelocity.value.z>0);
 rain.update(.01,cam,.4,0,0,[.2,.3,.4],{enabled:false});assert.deepEqual(rain.state.counts,[0,0,0]);assert.equal(rain.state.veil,true,'distant veil can be reviewed independently');
 const dry=positions.slice();rain.update(.1,cam,0,0,0,[.2,.3,.4]);assert.deepEqual(positions,dry,'dry skies do not animate invisible particle volumes');assert.equal(rain.state.veil,false);
 cam.set(10000,20,-5000);rain.update(20,cam,1,30,15,[.4,.5,.6]);assert.ok(positions.every(Number.isFinite));assert.ok(Math.abs(positions[0]-cam.x)<60,'an origin change recentres the rain safely');
 assert.ok(layers.every(x=>x.material.depthTest&&!x.material.depthWrite));
 const group=new THREE.Group(),bench=new THREE.Mesh(new THREE.PlaneGeometry(1.4,4).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));bench.position.y=.2;group.add(bench);group.updateMatrixWorld(true);
 const boat={group,seat:new THREE.Vector3(0,1.1,1.81),surfaceMeshes:[bench],waterOutline:{halfLength:2.36,profile:Array.from({length:65},()=>new THREE.Vector2(.7,.5))}};
 assert.equal(rainInsideBoat(new THREE.Vector3(0,0,0),boat),true);assert.equal(rainInsideBoat(new THREE.Vector3(2,0,0),boat),false);
 let t=0;const ocean={sample(x,z,time,out){out.h=Math.sin(x*.2+time)*.2;out.sx=.04*Math.cos(x*.2+time);out.sz=0;return out;}},sea=createSeaRain(scene,ocean,boat),hull=createHullRain(boat);
 for(let i=0;i<120;i++){t+=1/60;sea.update(1/60,new THREE.Vector3(4,2,4),1,[.3,.4,.5],t);hull.update(1/60,1,[.3,.4,.5]);}
 assert.ok(sea.activeCount>0&&sea.activeCount<=72);assert.ok(hull.activeCount>0&&hull.activeCount<=64);
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),sample={};
 for(let i=0;i<sea.mesh.count;i++){if(sea.mesh.geometry.attributes.aAge.getX(i)>=1)continue;sea.mesh.getMatrixAt(i,matrix);matrix.decompose(position,q,scale);ocean.sample(position.x,position.z,t,sample);assert.ok(Math.abs(position.y-sample.h-.012)<1e-5,'rain rings follow the actual moving sea');assert.equal(rainInsideBoat(position,boat),false,'no rings occur inside the dry boat');}
 for(let i=0;i<hull.mesh.count;i++){if(hull.mesh.geometry.attributes.aAge.getX(i)>=1)continue;hull.mesh.getMatrixAt(i,matrix);matrix.decompose(position,q,scale);assert.ok(Math.abs(position.y-.204)<1e-5,'boat rain lands on the actual bench');}
 sea.update(.1,cam,1,[.3,.4,.5],t,{enabled:false});hull.update(.1,1,[.3,.4,.5],{enabled:false});assert.equal(sea.activeCount,0);assert.equal(hull.activeCount,0);
 let target=null,rendered;const renderer={getDrawingBufferSize:v=>v.set(1280,720),setRenderTarget:x=>target=x,render:s=>rendered=s};const lens=createLensRain(renderer);
 for(let i=0;i<120;i++)lens.update(1/60,.8,10,.4,i/60,true);assert.ok(lens.dropCount>0);lens.begin();assert.ok(target);lens.render();const uniforms=rendered.children[0].material.uniforms;assert.ok(uniforms.uDrops.value.every(d=>d.z<=.012));assert.ok(uniforms.uTrails.value.some(d=>d.w>0),'larger drops form running trails');
 lens.update(.1,.8,10,.4,3,true,{drops:false});assert.equal(lens.dropCount,0,'rain-on-view toggle removes the rain droplets');lens.splash(1);lens.update(.1,0,0,.4,4,true,{drops:false});assert.ok(lens.dropCount>0,'spray stays separate from falling rain');
 Math.random=()=>.5;const merging=createLensRain(renderer);for(let i=0;i<120;i++)merging.update(1/60,1,0,.4,i/60,true);merging.begin();merging.render();assert.ok(merging.dropCount<8,'coincident drops coalesce instead of stacking');assert.ok(rendered.children[0].material.uniforms.uDrops.value.some(d=>d.z>.004),'coalescence increases droplet area');
 lens.update(.1,1,10,.4,5,false);lens.begin();assert.equal(target,null,'external views bypass the wet-eye overlay');lens.clear();assert.equal(lens.dropCount,0);assert.equal(lens.active,false);
 console.log('PASS depth layers, world-space rain, independent toggles, moving-sea/bench impacts, hull exclusion, merging runoff and clear view');
}finally{Math.random=saved;}
