// The outrigger canoe: hull, ama, booms, crab-claw sail and paddle, riding the waves with the paddler's view.
import * as THREE from 'three';
import { LAYER_NEAR } from './sky.js';

const DEG = Math.PI / 180;
export const SEAT = new THREE.Vector3(0, 0.92, 1.35);
const BOW_Z = -3.6, STERN_Z = 3.0;

function hullGeometry() {
  const stations = 48, around = 18;
  const pos = [], idx = [];
  for (let i = 0; i <= stations; i++) {
    const s = (i / stations) * 2 - 1; // -1 bow .. 1 stern
    const z = BOW_Z + ((s + 1) / 2) * (STERN_Z - BOW_Z);
    const w = 0.31 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.55) + 0.006;
    const gun = 0.34 + 0.3 * Math.pow(Math.abs(s), 3);
    const keel = -0.24 + 0.2 * Math.pow(Math.abs(s), 4);
    for (let j = 0; j <= around; j++) {
      const th = -Math.PI / 2 + (j / around) * Math.PI;
      pos.push(w * Math.sin(th), keel + (gun - keel) * (1 - Math.cos(th)), z);
    }
  }
  const R = around + 1;
  for (let i = 0; i < stations; i++) for (let j = 0; j < around; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function maskGeometry() {
  // Hull opening seen from above, just below the gunwale: hides the sea inside the canoe.
  const shape = new THREE.Shape();
  const n = 40;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * 2 - 1;
    const z = BOW_Z + ((s + 1) / 2) * (STERN_Z - BOW_Z);
    const w = 0.3 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.4)), 0.55);
    pts.push([w, z]);
  }
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [w, z] of pts) shape.lineTo(w, z);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.3, 0);
  return g;
}

function rod(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function createCanoe(scene) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.85, side: THREE.DoubleSide });
  const woodLight = new THREE.MeshStandardMaterial({ color: 0x7b5b3c, roughness: 0.9 });
  const lashing = new THREE.MeshStandardMaterial({ color: 0x9c8a66, roughness: 1 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a4, roughness: 0.95, side: THREE.DoubleSide });

  const canoe = new THREE.Group();
  const hull = new THREE.Mesh(hullGeometry(), wood);
  canoe.add(hull);

  const mask = new THREE.Mesh(maskGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false }));
  mask.renderOrder = 1;
  canoe.add(mask);

  // Seat and thwarts
  for (const z of [-2.2, -0.9, 0.35, 1.75]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.035, 0.14), woodLight);
    t.position.set(0, 0.3, z);
    canoe.add(t);
  }
  // Ama (float) to port, with booms
  const AMA_X = -2.1;
  const ama = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 3.7, 6, 12), woodLight);
  ama.rotation.x = Math.PI / 2;
  ama.position.set(AMA_X, 0.02, -0.3);
  canoe.add(ama);
  for (const z of [-1.05, 0.85]) {
    canoe.add(rod(new THREE.Vector3(0.28, 0.4, z), new THREE.Vector3(AMA_X + 0.05, 0.42, z), 0.045, woodLight));
    canoe.add(rod(new THREE.Vector3(AMA_X + 0.05, 0.42, z), new THREE.Vector3(AMA_X, 0.1, z), 0.035, woodLight));
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 10), lashing);
    lash.position.set(0.25, 0.38, z);
    lash.rotation.y = Math.PI / 2;
    canoe.add(lash);
  }

  // Crab-claw sail rig, pivoting at the mast step
  const rig = new THREE.Group();
  rig.position.set(0, 0.32, -1.5);
  canoe.add(rig);
  const sparA = rod(new THREE.Vector3(0, 0, -0.9), new THREE.Vector3(-0.15, 4.3, 0.9), 0.04, woodLight);
  const sparB = rod(new THREE.Vector3(0, 0, -0.9), new THREE.Vector3(0.1, 2.2, 2.6), 0.035, woodLight);
  rig.add(sparA, sparB);
  const SU = 16, SV = 10;
  const sailGeo = new THREE.BufferGeometry();
  const sailPos = new Float32Array((SU + 1) * (SV + 1) * 3);
  sailGeo.setAttribute('position', new THREE.BufferAttribute(sailPos, 3));
  const sIdx = [];
  for (let i = 0; i < SU; i++) for (let j = 0; j < SV; j++) {
    const a = i * (SV + 1) + j, b = a + 1, c = a + SV + 1, d = c + 1;
    sIdx.push(a, c, b, b, c, d);
  }
  sailGeo.setIndex(sIdx);
  const sail = new THREE.Mesh(sailGeo, sailMat);
  rig.add(sail);
  const P0 = new THREE.Vector3(0, 0, -0.9), PA = new THREE.Vector3(-0.15, 4.3, 0.9), PB = new THREE.Vector3(0.1, 2.2, 2.6);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function shapeSail(billow, t) {
    for (let i = 0; i <= SU; i++) {
      const u = i / SU; // along the spars from the foot
      tmpA.lerpVectors(P0, PA, u);
      tmpB.lerpVectors(P0, PB, u);
      for (let j = 0; j <= SV; j++) {
        const v = j / SV; // across between spars
        tmpP.lerpVectors(tmpA, tmpB, v);
        // Concave crab-claw head between the spar tips
        const bulge = Math.sin(v * Math.PI) * u;
        tmpP.y -= bulge * u * 0.9;
        tmpP.x += Math.sin(v * Math.PI) * Math.sin(u * Math.PI * 0.9) * billow * (0.95 + 0.05 * Math.sin(t * 3 + u * 6));
        const k = (i * (SV + 1) + j) * 3;
        sailPos[k] = tmpP.x; sailPos[k + 1] = tmpP.y; sailPos[k + 2] = tmpP.z;
      }
    }
    sailGeo.attributes.position.needsUpdate = true;
    sailGeo.computeVertexNormals();
  }
  shapeSail(0.3, 0);
  // Lowered sail bundle along the hull
  const bundle = new THREE.Group();
  const furled = new THREE.MeshStandardMaterial({ color: 0x9d9278, roughness: 1 });
  bundle.add(rod(new THREE.Vector3(0.1, 0.42, -2.9), new THREE.Vector3(0.1, 0.46, 0.1), 0.055, furled));
  bundle.add(rod(new THREE.Vector3(-0.12, 0.45, -3.0), new THREE.Vector3(-0.1, 0.48, 0.0), 0.04, woodLight));
  canoe.add(bundle);

  // Paddle, held from the seat
  const paddlePivot = new THREE.Group();
  canoe.add(paddlePivot);
  const paddle = new THREE.Group();
  paddlePivot.add(paddle);
  paddle.add(rod(new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(0, -0.95, 0), 0.018, woodLight));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.012), woodLight);
  blade.position.set(0, -1.15, 0);
  paddle.add(blade);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), woodLight);
  grip.position.set(0, 0.56, 0);
  paddle.add(grip);

  canoe.traverse((o) => { o.layers.set(LAYER_NEAR); o.renderOrder = o === mask ? 1 : 0; });
  scene.add(canoe);

  let strokeT = 0, side = 1, strokes = 0, paddleVis = 0, lastCatch = -1;
  const sailState = { shown: 1, angle: 0 };
  const sampA = {}, sampB = {}, sampC = {};
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
  let pitchS = 0, rollS = 0, heaveS = 0, yawS = 0;
  const bladeWorld = new THREE.Vector3();

  /**
   * Place the canoe on the sea and animate rig and paddle.
   * opts: { x, z, headingDeg, paddling, sailUp, apparentFromRel (deg, relative to bow), windSpeed, t, dt, ocean, onCatch }
   */
  function update(o) {
    const h = o.headingDeg * DEG;
    const fx = Math.sin(h), fz = -Math.cos(h);
    const rx = Math.cos(h), rz = Math.sin(h);
    o.ocean.sample(o.x + fx * 2.6, o.z + fz * 2.6, o.waveT, sampA);
    o.ocean.sample(o.x - fx * 2.4, o.z - fz * 2.4, o.waveT, sampB);
    o.ocean.sample(o.x, o.z, o.waveT, sampC);
    // Buoyant hull rides the local surface; never let a crest climb over the gunwale beneath the paddler
    const heave = Math.max((sampA.h + sampB.h + sampC.h * 2) / 4, sampC.h - 0.06);
    const pitch = Math.atan2(sampA.h - sampB.h, 5.0);
    const roll = -Math.atan(sampC.sx * rx + sampC.sz * rz) * 0.35;
    const k = 1 - Math.exp(-o.dt * 5);
    heaveS += (heave - heaveS) * (1 - Math.exp(-o.dt * 9));
    pitchS += (pitch - pitchS) * k;
    rollS += (roll - rollS) * k;
    canoe.position.set(o.x, heaveS, o.z);
    yawS = -h;
    e.set(pitchS, -h, rollS, 'YXZ');
    canoe.quaternion.setFromEuler(e);

    // Sail: raise and lower smoothly, swing to leeward and fill with the wind
    const target = o.sailUp ? 1 : 0;
    if (!sailState.init) { sailState.shown = target; sailState.init = true; }
    sailState.shown += (target - sailState.shown) * Math.min(1, o.dt * 1.5);
    // Woven pandanus lets light through: the sail glows on its shaded side
    if (o.light) sailMat.emissive.setRGB(o.light[0] * 0.32, o.light[1] * 0.3, o.light[2] * 0.26);
    rig.visible = sailState.shown > 0.02;
    bundle.visible = sailState.shown < 0.6;
    rig.scale.set(1, Math.max(0.02, sailState.shown), 1);
    const rel = o.apparentFromRel; // wind coming from this angle off the bow, degrees (+ starboard)
    const leeward = rel >= 0 ? -1 : 1;
    const swing = leeward * Math.min(70, Math.max(10, Math.abs(rel) * 0.5));
    sailState.angle += (swing * DEG - sailState.angle) * Math.min(1, o.dt * 0.8);
    rig.rotation.y = sailState.angle;
    shapeSail(leeward * Math.min(0.75, 0.12 + o.windSpeed * 0.04) * (o.sailUp ? 1 : 0.2), o.t);

    // Paddle strokes, switching sides every few strokes
    paddleVis += ((o.paddling ? 1 : 0) - paddleVis) * Math.min(1, o.dt * 4);
    paddlePivot.visible = paddleVis > 0.02;
    if (o.paddling) {
      strokeT += o.dt / 1.15;
      if (strokeT >= 1) { strokeT -= 1; strokes++; if (strokes % 7 === 0) side = -side; }
    }
    const ph = strokeT;
    const pull = ph < 0.6;
    const u = pull ? ph / 0.6 : (ph - 0.6) / 0.4;
    const swingX = pull ? -0.75 + 1.2 * u : 0.45 - 1.2 * u;
    const lift = pull ? 0 : Math.sin(u * Math.PI) * 0.35;
    paddlePivot.position.set(side * 0.36, SEAT.y + 0.08 + lift * 0.4 - (1 - paddleVis) * 0.8, SEAT.z - 0.35);
    paddle.rotation.set(swingX, 0, side * (0.18 + lift));
    if (o.paddling && pull && u < 0.12 && lastCatch !== strokes) {
      lastCatch = strokes;
      blade.getWorldPosition(bladeWorld);
      o.onCatch && o.onCatch(bladeWorld.x, bladeWorld.z);
    }
  }

  /** World transform of the paddler's eye. */
  function eye(outPos, outQuat) {
    canoe.updateMatrixWorld();
    outPos.copy(SEAT).applyMatrix4(canoe.matrixWorld);
    // The paddler keeps their head steadier than the hull
    e.set(pitchS * 0.45, yawS, rollS * 0.4, 'YXZ');
    q.setFromEuler(e);
    outQuat.copy(q);
  }

  return { group: canoe, update, eye, get heave() { return heaveS; } };
}
