// Spray thrown off the hull, after Tidewater's BoatSpray contact model (MIT, see shipped notices).
//
// The forebody waterline on each side is split into a few segments. Each knows its outward
// normal and, from frame to frame, its true velocity (forward speed, heave, pitch and roll all
// included) and how deep it sits in the passing sea. Two things throw water:
//   - pushing: the hull face moving water aside, max(0, v . n), above a threshold;
//   - impact: the segment being driven into the water, the bow dropping onto a wave or a wave
//     running up it.
// Spray grows with segment length x response; strong events also throw mist that the wind carries.
// The same function serves the 5.2 m rowboat and the 8.2 m launch, read from the hull outline.
import * as THREE from 'three';

const SEGMENTS = 5;

/** Pure response of one segment (exported for tests). */
export function segmentResponse({normalSpeed = 0, immersionRate = 0, depth = 0}) {
  if (depth < -.18 || depth > .7) return 0;
  const contact = THREE.MathUtils.smoothstep(depth, -.18, .02);
  const push = Math.max(0, normalSpeed - .55) * 1.25;
  const impact = Math.max(0, immersionRate - .45) * 1.7;
  return Math.min(9, (push + impact) * contact);
}

export function createHullSpray({canoe, ocean, spray}) {
  const segs = [];
  const local = new THREE.Vector3(), world = new THREE.Vector3(), normal = new THREE.Vector3(), quat = new THREE.Quaternion();
  const water = {};
  let vessel = null, response = 0, mistBudget = 0;

  function layout() {
    const outline = canoe.waterOutline, motor = !!canoe.group.userData.motor;
    if (!outline?.profile) return false;
    const half = outline.halfLength, profile = outline.profile;
    const beamAt = z => { const t = THREE.MathUtils.clamp((z / half + 1) * .5 * 64, 0, 63.999), i = Math.floor(t); return THREE.MathUtils.lerp(profile[i].x, profile[i + 1].x, t - i) * (motor ? .9 : .82); };
    segs.length = 0;
    // From the stem aft to the shoulder of the bow (about the first 40% of the length).
    for (const side of [-1, 1]) for (let i = 0; i < SEGMENTS; i++) {
      const z0 = -half * (.97 - i * .085), z1 = -half * (.97 - (i + 1) * .085), z = (z0 + z1) * .5;
      const x = beamAt(z) * side, slope = (beamAt(z1) - beamAt(z0)) / Math.max(.01, z1 - z0);
      // Outward and forward: the flare faces the water it meets.
      const n = new THREE.Vector3(side, .15, -slope * side * side).normalize();
      segs.push({side, point: new THREE.Vector3(x, motor ? .1 : .06, z), normal: n, length: Math.abs(z1 - z0), prev: null, prevDepth: null, budget: 0});
    }
    vessel = motor;
    return true;
  }

  return {
    get response() { return response; },
    /** Returns {response, aboard}: the total spray thrown, and how much of it the wind carries over the bow. */
    update(dt, time, {wind = {u: 0, v: 0}, scale = 1} = {}) {
      response = 0;
      if (!(dt > 0) || dt > .25) { for (const s of segs) { s.prev = null; s.prevDepth = null; } return {response: 0, aboard: 0}; }
      if (vessel !== !!canoe.group.userData.motor || !segs.length) if (!layout()) return {response: 0, aboard: 0};
      canoe.group.updateMatrixWorld(true);
      canoe.group.getWorldQuaternion(quat);
      let aboard = 0;
      for (const s of segs) {
        world.copy(local.copy(s.point)).applyMatrix4(canoe.group.matrixWorld);
        normal.copy(s.normal).applyQuaternion(quat);
        ocean.sample(world.x, world.z, time, water);
        const depth = (water.h ?? 0) - world.y;
        if (!s.prev) { s.prev = world.clone(); s.prevDepth = depth; continue; }
        const vx = (world.x - s.prev.x) / dt, vy = (world.y - s.prev.y) / dt, vz = (world.z - s.prev.z) / dt;
        s.prev.copy(world);
        const immersionRate = (depth - s.prevDepth) / dt; s.prevDepth = depth;
        // A jump of the scene origin or a teleport is not hull speed.
        if (Math.hypot(vx, vy, vz) > 25) continue;
        const r = segmentResponse({normalSpeed: vx * normal.x + vy * normal.y + vz * normal.z, immersionRate, depth}) * scale;
        if (r <= 0) continue;
        response += r * s.length;
        s.budget += r * s.length * dt * 26;
        const n = Math.min(24, Math.floor(s.budget)); s.budget -= n;
        if (n > 0) {
          const out = 1.1 + r * .55, up = 1.3 + r * .75;
          spray.emit(world.x + normal.x * .06, Math.max(world.y, water.h ?? world.y) + .02, world.z + normal.z * .06,
            normal.x * out + vx * .55, up, normal.z * out + vz * .55, n, .45 + r * .08, {size: .9 + Math.min(.6, r * .08)});
        }
        // How much the wind can carry back over the boat: spray from the bow into a headwind.
        const headwind = -(wind.u * vx + wind.v * vz) / Math.max(.5, Math.hypot(vx, vz)) + Math.hypot(vx, vz);
        aboard += r * s.length * Math.max(0, Math.min(1, headwind / 8));
      }
      if (response > 1.2) {
        mistBudget += (response - 1.2) * dt * 3;
        while (mistBudget >= 1) {
          mistBudget--;
          const s = segs[Math.floor(Math.random() * segs.length)];
          world.copy(local.copy(s.point)).applyMatrix4(canoe.group.matrixWorld);
          spray.emit(world.x, world.y + .2, world.z, wind.u * .5, .6 + Math.random() * .6, wind.v * .5, 1, .8, {mist: true});
        }
      }
      return {response, aboard};
    }
  };
}
