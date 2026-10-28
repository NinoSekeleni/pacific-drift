// Spray thrown off the bow in a chop and water dripping from the paddle; glows with plankton at night.
import * as THREE from 'three';
import { LAYER_NEAR } from './sky.js';

export function createSpray(scene) {
  const MAX = 900;
  const pos = new Float32Array(MAX * 3).fill(-1000);
  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  let next = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  })();
  const mat = new THREE.PointsMaterial({ size: 0.045, map: tex, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.layers.set(LAYER_NEAR);
  pts.renderOrder = 4;
  scene.add(pts);

  function emit(x, y, z, vx, vy, vz, n, spread = 0.8) {
    for (let i = 0; i < n; i++) {
      const j = next;
      next = (next + 1) % MAX;
      pos[j * 3] = x + (Math.random() - 0.5) * 0.1;
      pos[j * 3 + 1] = y;
      pos[j * 3 + 2] = z + (Math.random() - 0.5) * 0.1;
      vel[j * 3] = vx + (Math.random() - 0.5) * spread;
      vel[j * 3 + 1] = vy * (0.6 + Math.random() * 0.8);
      vel[j * 3 + 2] = vz + (Math.random() - 0.5) * spread;
      life[j] = 1;
    }
  }

  /** dt seconds; tint is the light colour; bio 0..1 makes drops glow green-blue at night. */
  function update(dt, tint, bio) {
    let any = false;
    for (let j = 0; j < MAX; j++) {
      if (life[j] <= 0) continue;
      any = true;
      vel[j * 3 + 1] -= 9.8 * dt;
      pos[j * 3] += vel[j * 3] * dt;
      pos[j * 3 + 1] += vel[j * 3 + 1] * dt;
      pos[j * 3 + 2] += vel[j * 3 + 2] * dt;
      life[j] -= dt * 0.9;
      if (pos[j * 3 + 1] < -1.5 || life[j] <= 0) { life[j] = 0; pos[j * 3 + 1] = -1000; }
    }
    if (any || geo.userData.dirty) { geo.attributes.position.needsUpdate = true; geo.userData.dirty = any; }
    const day = [Math.min(1, tint[0] * 1.4 + 0.1), Math.min(1, tint[1] * 1.4 + 0.1), Math.min(1, tint[2] * 1.4 + 0.12)];
    mat.color.setRGB(day[0] * (1 - bio) + 0.15 * bio, day[1] * (1 - bio) + 1.0 * bio, day[2] * (1 - bio) + 0.9 * bio);
    mat.blending = bio > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending;
  }
  return { emit, update };
}
