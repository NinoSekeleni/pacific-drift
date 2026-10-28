// Rain streaks around the paddler, slanted by the wind.
import * as THREE from 'three';
import { LAYER_NEAR } from './sky.js';

export function createRain(scene) {
  const N = 2600, BOX = 34, TOP = 18;
  const pos = new Float32Array(N * 6);
  const seeds = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    seeds[i * 3] = (Math.random() - 0.5) * BOX;
    seeds[i * 3 + 1] = Math.random() * TOP;
    seeds[i * 3 + 2] = (Math.random() - 0.5) * BOX;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xcfd6dc, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.layers.set(LAYER_NEAR);
  lines.renderOrder = 5;
  scene.add(lines);

  function update(dt, cam, amount, windE, windN, tint) {
    lines.visible = amount > 0.03;
    if (!lines.visible) return;
    mat.opacity = Math.min(0.42, amount * 0.4);
    mat.color.setRGB(tint[0], tint[1], tint[2]);
    const fall = 9;
    const sx = windE * 0.6, sz = -windN * 0.6;
    const len = 0.55;
    for (let i = 0; i < N; i++) {
      let y = seeds[i * 3 + 1] - fall * dt;
      seeds[i * 3] += sx * dt;
      seeds[i * 3 + 2] += sz * dt;
      if (y < -2) {
        y += TOP;
        seeds[i * 3] = (Math.random() - 0.5) * BOX;
        seeds[i * 3 + 2] = (Math.random() - 0.5) * BOX;
      }
      seeds[i * 3 + 1] = y;
      const x = cam.x + ((((seeds[i * 3] % BOX) + BOX * 1.5) % BOX) - BOX / 2);
      const z = cam.z + ((((seeds[i * 3 + 2] % BOX) + BOX * 1.5) % BOX) - BOX / 2);
      const yy = cam.y - 3 + y;
      const k = i * 6;
      pos[k] = x; pos[k + 1] = yy; pos[k + 2] = z;
      pos[k + 3] = x - (sx / fall) * len; pos[k + 4] = yy + len; pos[k + 5] = z - (sz / fall) * len;
    }
    g.attributes.position.needsUpdate = true;
  }
  return { update };
}
