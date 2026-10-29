import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMeteors} from '../src/meteors.js';

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(68,1.6,.1,420000);
camera.position.set(400,1.4,-600);
camera.lookAt(400,500,-2000);
camera.updateMatrixWorld();
const meteors=createMeteors(scene);
assert.equal(scene.children.length,1,'meteor system should need only one renderable');
const ribbon=scene.children[0];
assert.equal(ribbon.visible,false);

// Preview must appear in front of the current camera, even in daytime, so the
// studio can demonstrate the effect without relying on the random wait timer.
assert.equal(meteors.preview(camera),true);
meteors.update(.08,camera,{sunAltitude:20,cloudCover:0});
assert.equal(meteors.active,true);
assert.equal(ribbon.visible,true);
assert.ok(ribbon.material.uniforms.uOpacity.value>0);
const positions=ribbon.geometry.attributes.position.array;
assert.ok([...positions].every(Number.isFinite),'ribbon geometry must remain finite');
const cameraForward=new THREE.Vector3();camera.getWorldDirection(cameraForward);
for(let i=0;i<4;i++){
  const vertex=new THREE.Vector3(...positions.slice(i*3,i*3+3));
  const distance=vertex.distanceTo(camera.position);
  assert.ok(distance>7799&&distance<7801,'every vertex must lie on its camera-relative sky shell');
  assert.ok(vertex.sub(camera.position).normalize().dot(cameraForward)>.8,'preview must fall near the current view');
}
const cloudTexture=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);
meteors.setCloudTexture(cloudTexture);
assert.equal(ribbon.material.uniforms.tClouds.value,cloudTexture,'meteor occlusion must use the shared cloud texture');
meteors.setCloudTexture(null);
assert.ok(ribbon.material.uniforms.tClouds.value.isDataTexture,'missing cloud texture must retain a valid transparent fallback');

// Switching off must remove an active event immediately; natural meteors must
// not spawn in daylight or behind a solid overcast, even after a long wait.
meteors.update(.1,camera,{enabled:false});
assert.equal(meteors.active,false);
assert.equal(ribbon.visible,false);
meteors.update(300,camera,{sunAltitude:20,cloudCover:0});
assert.equal(meteors.active,false);
meteors.update(300,camera,{sunAltitude:-20,cloudCover:1});
assert.equal(meteors.active,false);
meteors.preview(camera);
meteors.update(2,camera,{sunAltitude:-20,cloudCover:0});
assert.equal(meteors.active,false,'short meteor events must expire');
assert.equal(ribbon.visible,false);

console.log('PASS meteor preview, finite camera-relative geometry, cloud sampler, disable, daylight/overcast suppression and expiry');
