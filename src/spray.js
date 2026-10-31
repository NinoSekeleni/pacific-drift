// Spray: drops and mist thrown by the hull, the oars and slams. Drops are drawn as short streaks
// along their motion; mist is larger, softer and rides the wind. A surface sampler lets drops land
// on the moving sea and seed small impact rings, and drops that reach the viewer's eye land on the
// view as droplets (see lens-rain.js).
import * as THREE from 'three';
import { LAYER_NEAR } from './sky.js';

export function createSpray(scene, {max = 2400} = {}) {
  const MAX = max;
  const pos = new Float32Array(MAX * 3).fill(-1000), vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX), lifespan = new Float32Array(MAX), sizes = new Float32Array(MAX), glowing = new Float32Array(MAX), kinds = new Float32Array(MAX);
  let next = 0, elapsed = 0, sampleSurface = null, onSurfaceImpact = null;
  const sample = {}, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVelocity', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glowing, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  const uniforms = {uTint: {value: new THREE.Color(.5, .6, .65)}, uSunTint: {value: new THREE.Color(0, 0, 0)}, uBio: {value: 0}, uPx: {value: Math.min(globalThis.devicePixelRatio || 1, 2)}};
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 aVelocity;attribute float aLife;attribute float aSize;attribute float aGlow;attribute float aKind;uniform float uPx;
    varying float vLife;varying float vGlow;varying float vStretch;varying vec2 vDirection;varying float vNear;varying float vKind;
    void main(){
      vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
      vec3 projectedVelocity=mat3(viewMatrix)*aVelocity;
      vDirection=normalize(projectedVelocity.xy+vec2(.0001));
      vStretch=aKind>.5?1.:clamp(length(projectedVelocity.xy)*.18,1.,3.4);
      float px=aKind>.5?mix(60.,120.,aSize):21.;
      gl_PointSize=clamp(px/max(.2,-mv.z),.7,aKind>.5?90.:18.)*uPx*(aKind>.5?1.:aSize);
      vNear=1.-smoothstep(aKind>.5?40.:14.,aKind>.5?90.:35.,-mv.z);vLife=aLife;vGlow=aGlow;vKind=aKind;
    }`,
    fragmentShader: `uniform vec3 uTint,uSunTint;uniform float uBio;
    varying float vLife;varying float vGlow;varying float vStretch;varying vec2 vDirection;varying float vNear;varying float vKind;
    void main(){
      vec2 p=(gl_PointCoord-.5)*2.;
      vec2 along=vec2(dot(p,vec2(-vDirection.y,vDirection.x)),dot(p,vDirection));
      along.x*=vStretch;float r=dot(along,along);
      float birth=1.-smoothstep(.86,1.,vLife),fade=smoothstep(.0,.28,vLife);
      float alpha=vKind>.5?exp(-r*2.2)*(1.-smoothstep(.0,.9,1.-vLife))*fade*vNear*.11:exp(-r*4.2)*birth*fade*vNear*.6;
      if(r>1.||alpha<.004)discard;
      // Drops catch the sun; mist scatters it softly.
      vec3 color=uTint+uSunTint*(vKind>.5?.35:.9)+vec3(.01,.14,.44)*vGlow*uBio;
      gl_FragColor=vec4(color,alpha);
    }`
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.layers.set(LAYER_NEAR); pts.renderOrder = 4; scene.add(pts);

  function emit(x, y, z, vx, vy, vz, n, spread = .8, {mist = false, size = 1} = {}) {
    for (let i = 0; i < n; i++) {
      const j = next; next = (next + 1) % MAX;
      pos[j * 3] = x + (Math.random() - .5) * .1; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z + (Math.random() - .5) * .1;
      vel[j * 3] = vx + (Math.random() - .5) * spread;
      vel[j * 3 + 1] = vy * (.58 + Math.random() * .8); vel[j * 3 + 2] = vz + (Math.random() - .5) * spread;
      life[j] = 1; kinds[j] = mist ? 1 : 0;
      lifespan[j] = mist ? 1.6 + Math.random() * 1.8 : .48 + Math.random() * .72;
      sizes[j] = mist ? Math.random() : (.55 + Math.pow(Math.random(), 1.7) * .9) * size;
      glowing[j] = Math.random() < .10 ? 1 : 0;
    }
    geo.userData.dirty = true;
  }

  const projected = new THREE.Vector3();
  /**
   * dt seconds; tint is local sky light; bio is the darkness-weighted effect.
   * options: wind {u, v} m/s carries mist and fine drops; camera + onLens(x, y, r) lands drops
   * that reach the eye on the view; sun = sunlight colour for highlights.
   */
  function update(dt, tint, bio, time, {wind = null, camera = null, onLens = null, sun = null} = {}) {
    elapsed = Number.isFinite(time) ? time : elapsed + dt;
    let any = false, impacts = 0, lensHits = 0;
    const cx = camera?.position.x, cy = camera?.position.y, cz = camera?.position.z;
    for (let j = 0; j < MAX; j++) {
      if (life[j] <= 0) continue; any = true;
      const o = j * 3, previousY = pos[o + 1], mist = kinds[j] > .5;
      // Drag toward the moving air: mist follows the wind, drops only a little.
      const k = mist ? 1.6 : .15 + (1 - Math.min(1, sizes[j])) * .25, drag = Math.exp(-dt * k);
      const wu = wind ? wind.u : 0, wv = wind ? wind.v : 0;
      vel[o] = wu + (vel[o] - wu) * drag; vel[o + 2] = wv + (vel[o + 2] - wv) * drag;
      vel[o + 1] = mist ? vel[o + 1] * Math.exp(-dt * 1.2) - .6 * dt : vel[o + 1] - 9.8 * dt;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      life[j] -= dt / Math.max(.1, lifespan[j]);
      if (onLens && camera && !mist && lensHits < 3) {
        const dx = pos[o] - cx, dy = pos[o + 1] - cy, dz = pos[o + 2] - cz;
        if (dx * dx + dy * dy + dz * dz < .16 && (vel[o] * dx + vel[o + 1] * dy + vel[o + 2] * dz) < 0) {
          projected.set(pos[o], pos[o + 1], pos[o + 2]).project(camera);
          if (projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1) { onLens(projected.x * .5 + .5, projected.y * .5 + .5, .0022 + sizes[j] * .0028); lensHits++; }
          life[j] = 0; pos[o + 1] = -1000; continue;
        }
      }
      let surface = -1.5;
      if (sampleSurface && vel[o + 1] < 0 && !mist) { sampleSurface(pos[o], pos[o + 2], elapsed, sample); if (Number.isFinite(sample.h)) surface = sample.h; }
      if ((!mist && vel[o + 1] < 0 && pos[o + 1] < surface) || life[j] <= 0) {
        if (onSurfaceImpact && !mist && life[j] > .15 && previousY >= surface && impacts < 3 && Math.random() < .12) { onSurfaceImpact(pos[o], pos[o + 2], elapsed, .008 + sizes[j] * .006); impacts++; }
        life[j] = 0; pos[o + 1] = -1000;
      }
    }
    if (any || geo.userData.dirty) {
      for (const attribute of ['position', 'aVelocity', 'aLife', 'aSize', 'aGlow', 'aKind']) geo.attributes[attribute].needsUpdate = true;
      geo.userData.dirty = any;
    }
    uniforms.uTint.value.setRGB(...tint.map((v, i) => Math.min(1, v * 1.3 + [.03, .035, .045][i])));
    if (sun) uniforms.uSunTint.value.setRGB(...sun); else uniforms.uSunTint.value.setRGB(0, 0, 0);
    uniforms.uBio.value = bio;
    return {lensHits};
  }
  return {emit, update,
    setSurfaceSampler(sampleFn, impactFn = null) { sampleSurface = sampleFn; onSurfaceImpact = impactFn; },
    get count() { let n = 0; for (let j = 0; j < MAX; j++) if (life[j] > 0) n++; return n; }
  };
}
