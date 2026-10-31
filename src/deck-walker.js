// Walking aboard the 8.2 m launch, adapted from Tidewater's Player (deck mode) and
// BoatModel._buildColliders (MIT, public/licenses/tidewater-MIT.txt).
//
// Everything here is in Tidewater's boat frame: +Z forward, +X port, y = 0 at the design
// waterline. Pacific Drift mounts that model turned half a turn, so canoe-local coordinates are
// (-x, y, -z). The player moves with the rocking hull because positions are boat-relative and
// are turned into world space by the canoe group's transform every frame.
import * as THREE from 'three';
import {HullLines} from './vendor/tidewater/boat/HullLines.js';
import {houseHalfWidth} from './vendor/tidewater/boat/HullBuilder.js';
import {HOUSE,roofTopY} from './vendor/tidewater/boat/Wheelhouse.js';
import {TRAPS,TRAP,HAULER} from './vendor/tidewater/boat/DeckGear.js';

export const EYE = 1.62;           // standing eye height above the feet
const RADIUS = 0.24;               // body radius on deck
const STEP = 0.36;                 // highest ledge stepped onto
const HEIGHT = 1.75;
const HELM_REACH = 0.8;            // metres from the helm seat to take the wheel
export const HELM = {x: HOUSE.helmX, z: HOUSE.seatZ};
export const HELM_EYE = new THREE.Vector3(HOUSE.helmX, 1.85, 0.3);

export function buildLaunchColliders(L = new HullLines()) {
  const boxes = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const add = (tag, min, max, walkable = false, solid = true) => boxes.push({tag, center: new THREE.Vector3().addVectors(min, max).multiplyScalar(.5), half: new THREE.Vector3().subVectors(max, min).multiplyScalar(.5), walkable, solid});
  const inner = z => L.halfBreadth(L.tAtSheerZ(z), L.deckY) - L.shell;
  add('deck', V(-inner(-1.5), L.deckY - .1, L.zAft + L.shell), V(inner(-1.5), L.deckY, HOUSE.dash.zFace), true, false);
  for (const [z0, z1] of [[L.zAft, -2.3], [-2.3, -.7], [-.7, L.houseFront]]) {
    const t0 = L.tAtSheerZ(z0), t1 = L.tAtSheerZ(z1), top = Math.max(L.sheerY(t0), L.sheerY(t1)) + .045;
    const xo = Math.max(L.sheerX(t0), L.sheerX(t1)), xi = Math.min(inner(z0), inner(z1));
    for (const s of [1, -1]) add('bulwark', V(Math.min(s * xi, s * xo), L.deckY, z0), V(Math.max(s * xi, s * xo), top, z1));
  }
  add('transom', V(-L.sheerX(0), L.deckY, L.zAft), V(L.sheerX(0), L.sheerY(0) + .045, L.zAft + L.shell));
  for (const s of [1, -1]) {
    const x0 = houseHalfWidth(L, L.houseBack) - HOUSE.wallT, x1 = houseHalfWidth(L, L.houseBack);
    add('houseWall', V(Math.min(s * x0, s * x1), L.sheerY(L.tAtSheerZ(L.houseBack)), L.houseBack), V(Math.max(s * x0, s * x1), HOUSE.roofUnderY, L.houseFront));
  }
  const d = HOUSE.dash;
  add('console', V(-d.halfW, L.deckY, d.zFace), V(d.halfW, d.yTop, L.houseFront));
  add('helmSeat', V(HOUSE.helmX - .23, L.deckY, HOUSE.seatZ - .24), V(HOUSE.helmX + .23, 1.05, HOUSE.seatZ + .21));
  add('bench', V(.65, L.deckY, .075), V(1.07, L.deckY + .47, .825), true);
  add('roof', V(-1.25, HOUSE.roofUnderY, HOUSE.roofZ0), V(1.25, roofTopY(0), HOUSE.roofZ1), true);
  for (const [x, level, z] of TRAPS) {
    const y0 = L.deckY + .03 + level * (TRAP.H + .035);
    add('trap', V(x - TRAP.W / 2, y0, z - TRAP.L / 2), V(x + TRAP.W / 2, y0 + TRAP.H, z + TRAP.L / 2), true);
  }
  add('hauler', V(HAULER.x - .2, L.deckY, HAULER.z - .08), V(HAULER.x + .2, HAULER.y + .2, HAULER.z + .25));
  add('baitBarrel', V(.6, L.deckY, -1.06), V(1.12, L.deckY + .8, -.54));
  for (const [z0, z1] of [[L.houseFront, 2.4], [2.4, 3.3], [3.3, 4.15]]) {
    const t0 = L.tAtSheerZ(z0), t1 = L.tAtSheerZ(z1), w = L.sheerX(t0) - L.shell;
    add('foredeck', V(-w, L.deckY, z0), V(w, (L.sheerY(t0) + L.sheerY(t1)) / 2 + .06, z1), true);
  }
  return boxes;
}

/** Tidewater boat frame <-> Pacific Drift canoe-local frame (a half turn about Y). */
export const toCanoeLocal = (v, out = new THREE.Vector3()) => out.set(-v.x, v.y, -v.z);
export const fromCanoeLocal = (v, out = new THREE.Vector3()) => out.set(-v.x, v.y, -v.z);

export function createDeckWalker({lines = new HullLines(), colliders = null, onStep = () => {}} = {}) {
  const L = lines, boxes = colliders || buildLaunchColliders(L);
  const pos = new THREE.Vector3(.25, L.deckY, -1.6);   // feet, boat frame
  const vel = new THREE.Vector3();
  let grounded = true, bob = 0, stepDist = 0;
  let glide = null; // {from,to,t,duration,done}

  function groundAt(x, z, maxY) {
    let g = L.deckY;
    for (const c of boxes) {
      if (!c.walkable) continue;
      if (Math.abs(x - c.center.x) > c.half.x || Math.abs(z - c.center.z) > c.half.z) continue;
      const top = c.center.y + c.half.y;
      if (top <= maxY && top > g) g = top;
    }
    return g;
  }
  function resolve(p, oldX, oldZ) {
    for (let iter = 0; iter < 2; iter++) for (const c of boxes) {
      if (!c.solid) continue;
      const top = c.center.y + c.half.y, bot = c.center.y - c.half.y;
      if (top <= p.y + STEP || bot >= p.y + HEIGHT) continue;
      const ex = c.half.x + RADIUS, ez = c.half.z + RADIUS, dx = p.x - c.center.x, dz = p.z - c.center.z;
      if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue;
      const px = ex - Math.abs(dx), pz = ez - Math.abs(dz);
      if (px < pz) { p.x += Math.sign(dx || (oldX - c.center.x) || 1) * px; vel.x = 0; }
      else { p.z += Math.sign(dz || (oldZ - c.center.z) || 1) * pz; vel.z = 0; }
    }
    p.z = THREE.MathUtils.clamp(p.z, L.zAft + L.shell + RADIUS, 4.0);
    const halfIn = Math.max(.15, L.halfBreadth(L.tAtSheerZ(p.z), Math.max(p.y, L.deckY)) - L.shell - RADIUS);
    p.x = THREE.MathUtils.clamp(p.x, -halfIn, halfIn);
  }
  function settle() { pos.y = groundAt(pos.x, pos.z, pos.y + STEP); }

  return {
    get position() { return pos; },
    get grounded() { return grounded; },
    get gliding() { return !!glide; },
    /** Distance from the feet to the helm seat, in metres. */
    helmDistance() { return Math.hypot(pos.x - HELM.x, pos.z - HELM.z); },
    nearHelm() { return Math.hypot(pos.x - HELM.x, pos.z - HELM.z) < HELM_REACH; },
    /** Open deck, clear of the wheelhouse: where a rod can be cast from. */
    onOpenDeck() { return pos.z < L.houseBack - .05 || pos.z > L.houseFront + .05; },
    place(x, z) { pos.set(x, L.deckY, z); vel.set(0, 0, 0); resolve(pos, x, z); settle(); glide = null; },
    /** Walk smoothly to a spot instead of teleporting there (used by helm and fishing). */
    glideTo(x, z, duration = .8, done = null) { glide = {from: pos.clone(), to: new THREE.Vector3(x, L.deckY, z), t: 0, duration, done}; },
    standFromHelm() { this.place(HELM.x + .5, HELM.z - .2); },
    /**
     * input: forward/right in -1..1, yaw (look direction relative to the bow, + = port),
     * brisk for a quicker pace. Returns metres moved this step.
     */
    update(dt, {forward = 0, right = 0, yaw = 0, brisk = false} = {}) {
      dt = Math.min(dt, .1);
      const ox = pos.x, oz = pos.z;
      if (glide) {
        glide.t = Math.min(1, glide.t + dt / glide.duration);
        const k = glide.t * glide.t * (3 - 2 * glide.t);
        pos.lerpVectors(glide.from, glide.to, k); settle();
        if (glide.t >= 1) { const done = glide.done; glide = null; done?.(); }
      } else {
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        let wx = sy * forward - cy * right, wz = cy * forward + sy * right;
        const len = Math.hypot(wx, wz); if (len > 1) { wx /= len; wz /= len; }
        const speed = brisk ? 2.3 : 1.45, k = 1 - Math.exp(-12 * dt);
        vel.x += (wx * speed - vel.x) * k; vel.z += (wz * speed - vel.z) * k;
        vel.y -= 9.81 * dt;
        pos.addScaledVector(vel, dt);
        resolve(pos, ox, oz);
        const g = groundAt(pos.x, pos.z, pos.y + STEP);
        if (pos.y <= g) { pos.y = g; if (vel.y < 0) vel.y = 0; grounded = true; } else grounded = pos.y - g < .04;
      }
      const moved = Math.hypot(pos.x - ox, pos.z - oz);
      if (grounded && moved > 0) { bob += moved * 2.4; stepDist += moved; if (stepDist > .62) { stepDist = 0; onStep(); } }
      return moved;
    },
    /** Eye position in canoe-local coordinates. Head bob is small; the hull motion does the rest. */
    eyeLocal(out = new THREE.Vector3()) { return out.set(-pos.x, pos.y + EYE + Math.sin(bob) * .018, -pos.z); },
    colliders: boxes
  };
}
