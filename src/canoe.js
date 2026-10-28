// A cedar-strip Canadian canoe (navy hull, cedar interior, ash gunwales, cane seats, carved yoke),
// with a small sprit sail, a single-blade paddle and a hurricane lantern, riding the sea.
import * as THREE from 'three';
import { LAYER_NEAR } from './sky.js';

const DEG = Math.PI / 180;
export const LENGTH = 5.2;
export const BOW_Z = -LENGTH / 2, STERN_Z = LENGTH / 2;
export const SEAT = new THREE.Vector3(0, 0.86, 1.85); // paddler on the stern seat, facing the bow
const BEAM = 0.45;    // half-beam at the gunwale amidships
const KEEL = -0.13;   // waterline is y = 0 with a paddler aboard
const GUN = 0.2;      // freeboard amidships

// Wetted points: [metres forward of centre, metres to starboard, weight]
const WET = [[2.1, 0, 0.6], [1.3, 0, 1], [0.4, 0, 1], [-0.5, 0, 1], [-1.4, 0, 1], [-2.1, 0, 0.6], [0.6, 0.32, 0.7], [0.6, -0.32, 0.7], [-0.9, 0.32, 0.7], [-0.9, -0.32, 0.7]];
function solve3(A, b) {
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A) || 1e-9;
  const col = (i) => A.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/* ---------- Canoe lines ---------- */
const sAt = (z) => (2 * (z - BOW_Z)) / (STERN_Z - BOW_Z) - 1; // -1 bow .. 1 stern
export const halfBeam = (s) => BEAM * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 2.3)), 0.72);
const keelAt = (s) => KEEL + 0.075 * Math.pow(Math.abs(s), 2.6); // rocker
const sheerAt = (s) => GUN + 0.27 * Math.pow(Math.abs(s), 3.4);  // ends sweep up
const N_SE = 2.7; // cross-section squareness: round bilge, firm sides

function sectionPoint(s, th, inset = 0) {
  const B = Math.max(0.004, halfBeam(s) - inset);
  const k = keelAt(s) + inset, g = sheerAt(s);
  const st = Math.sin(th), ct = Math.cos(th);
  const x = B * Math.sign(st) * Math.pow(Math.abs(st), 2 / N_SE);
  const y = k + (g - k) * (1 - Math.pow(Math.abs(ct), 2 / N_SE));
  // Slight tumblehome near the gunwale
  const tumble = Math.pow(Math.max(0, (y - (k + (g - k) * 0.7)) / ((g - k) * 0.3)), 2) * 0.018 * Math.sign(st);
  return [x - tumble, y];
}

function hullGeometry() {
  const stations = 72, around = 36;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= stations; i++) {
    const s = (i / stations) * 2 - 1;
    // Gentle recurve at the stems
    const z0 = BOW_Z + ((s + 1) / 2) * (STERN_Z - BOW_Z);
    for (let j = 0; j <= around; j++) {
      const th = -Math.PI / 2 + (j / around) * Math.PI;
      const [x, y] = sectionPoint(s, th);
      const lift = Math.max(0, (y - GUN) / 0.27);
      const z = z0 + Math.sign(s) * 0.05 * lift * Math.pow(Math.abs(s), 6);
      pos.push(x, y, z);
      uv.push(j / around, i / stations);
    }
  }
  const R = around + 1;
  for (let i = 0; i < stations; i++) for (let j = 0; j < around; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Textures ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function rand(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }

// Western red cedar strips, running bow to stern, with the odd dark strip and fine grain
const cedarTex = () => canvasTex(1024, 1024, (g, w, h) => {
  const r = rand(7);
  const strips = 72;
  const palette = [[178, 86, 42], [196, 112, 58], [160, 70, 34], [208, 132, 72], [120, 52, 26], [186, 98, 50], [92, 40, 22]];
  for (let k = 0; k < strips; k++) {
    let c = palette[Math.floor(r() * 5)];
    if (k % 9 === 4) c = palette[6];
    if (k % 13 === 7) c = palette[4];
    const x0 = (k / strips) * w, x1 = ((k + 1) / strips) * w;
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    g.fillRect(x0, 0, x1 - x0 + 1, h);
    // grain
    for (let n = 0; n < 40; n++) {
      const y = r() * h, len = 40 + r() * 220;
      g.fillStyle = `rgba(${r() < 0.5 ? '60,24,10' : '230,160,100'},${0.05 + r() * 0.08})`;
      g.fillRect(x0 + r() * (x1 - x0), y, 1 + r() * 1.5, len);
    }
    g.fillStyle = 'rgba(40,16,6,0.35)';
    g.fillRect(x1 - 1, 0, 1, h);
  }
});
// Painted hull with a satin finish
const navyTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#18213a';
  g.fillRect(0, 0, w, h);
  const r = rand(3);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.025)`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
});
// Hand-woven cane: strands at 0, 60 and 120 degrees leaving open octagons
const caneTex = () => canvasTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#c9a15e';
  g.lineCap = 'round';
  g.lineWidth = 5;
  const step = 32;
  for (let i = -w; i < w * 2; i += step) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
  }
  g.strokeStyle = '#b48945';
  g.lineWidth = 4;
  for (let i = -w * 2; i < w * 2; i += step) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
  }
}, [3, 2]);

function rod(a, b, r, mat, seg = 8) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function createCanoe(scene) {
  const navy = new THREE.MeshStandardMaterial({ map: navyTex(), roughness: 0.32, metalness: 0.05, side: THREE.FrontSide });
  const cedar = new THREE.MeshStandardMaterial({ map: cedarTex(), roughness: 0.38, side: THREE.BackSide });
  const ash = new THREE.MeshStandardMaterial({ color: 0xd9ab6a, roughness: 0.45 });
  const walnut = new THREE.MeshStandardMaterial({ color: 0x8a4a26, roughness: 0.4 });
  const cane = new THREE.MeshStandardMaterial({ map: caneTex(), alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.7 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf0e6cf, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });

  const canoe = new THREE.Group();
  const hullGeo = hullGeometry();
  const outer = new THREE.Mesh(hullGeo, navy);
  const innerHull = new THREE.Mesh(hullGeo, cedar);
  canoe.add(outer, innerHull);

  // Gunwales: an outwale and inwale of ash following the sheer
  for (const side of [-1, 1]) {
    for (const [inset, r] of [[-0.012, 0.016], [0.02, 0.013]]) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const s = -0.985 + (i / 60) * 1.97;
        const z = BOW_Z + ((s + 1) / 2) * (STERN_Z - BOW_Z);
        pts.push(new THREE.Vector3(side * Math.max(0.01, halfBeam(s) - inset), sheerAt(s) - 0.006, z));
      }
      canoe.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, r, 6), ash));
    }
  }
  // Decks: teardrop plates at bow and stern
  for (const dir of [-1, 1]) {
    const shape = new THREE.Shape();
    const s0 = dir * 0.86;
    const n = 14;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (dir * (0.995 - 0.86) * i) / n;
      pts.push([halfBeam(s) - 0.012, BOW_Z + ((s + 1) / 2) * (STERN_Z - BOW_Z)]);
    }
    shape.moveTo(-pts[0][0], pts[0][1]);
    // concave inner edge, as in the photo
    shape.quadraticCurveTo(0, pts[0][1] + dir * 0.09, pts[0][0], pts[0][1]);
    for (const [w, z] of pts) shape.lineTo(w, z);
    for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
    const geo = new THREE.ShapeGeometry(shape, 8);
    geo.rotateX(Math.PI / 2);
    const deck = new THREE.Mesh(geo, walnut);
    deck.position.y = sheerAt(s0) - 0.012;
    deck.rotation.x = dir * -0.12;
    canoe.add(deck);
  }
  // Cane seats hung below the gunwales, thwarts and the carved centre yoke
  function across(z, drop) {
    const s = sAt(z);
    return { w: halfBeam(s) - 0.02, y: sheerAt(s) - drop };
  }
  for (const [z, depth] of [[-1.85, 0.32], [1.85, 0.36]]) {
    const a = across(z, 0.085);
    const seat = new THREE.Group();
    const frame = 0.035;
    seat.add(rod(new THREE.Vector3(-a.w, a.y, z - depth / 2), new THREE.Vector3(a.w, a.y, z - depth / 2), frame / 2, ash));
    seat.add(rod(new THREE.Vector3(-a.w, a.y, z + depth / 2), new THREE.Vector3(a.w, a.y, z + depth / 2), frame / 2, ash));
    seat.add(rod(new THREE.Vector3(-a.w * 0.82, a.y, z - depth / 2), new THREE.Vector3(-a.w * 0.82, a.y, z + depth / 2), frame / 2, ash));
    seat.add(rod(new THREE.Vector3(a.w * 0.82, a.y, z - depth / 2), new THREE.Vector3(a.w * 0.82, a.y, z + depth / 2), frame / 2, ash));
    const web = new THREE.Mesh(new THREE.PlaneGeometry(a.w * 1.6, depth * 0.92), cane);
    web.rotation.x = -Math.PI / 2;
    web.position.set(0, a.y + 0.004, z);
    seat.add(web);
    canoe.add(seat);
  }
  for (const z of [-0.95, 0.85]) {
    const a = across(z, 0.03);
    const t = new THREE.Mesh(new THREE.BoxGeometry(a.w * 2, 0.022, 0.06), ash);
    t.position.set(0, a.y, z);
    canoe.add(t);
  }
  {
    const a = across(-0.05, 0.025);
    const shape = new THREE.Shape();
    shape.moveTo(-a.w, -0.035);
    shape.lineTo(-0.16, -0.03);
    shape.bezierCurveTo(-0.11, -0.06, -0.06, 0.05, 0, 0.05);
    shape.bezierCurveTo(0.06, 0.05, 0.11, -0.06, 0.16, -0.03);
    shape.lineTo(a.w, -0.035);
    shape.lineTo(a.w, 0.035);
    shape.lineTo(-a.w, 0.035);
    const yoke = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false }), ash);
    yoke.rotation.x = -Math.PI / 2;
    yoke.position.set(0, a.y, -0.05);
    canoe.add(yoke);
  }
  // Painter line at the bow, as on the photo's canoe
  {
    const s = -0.995;
    const p0 = new THREE.Vector3(0, sheerAt(s) - 0.02, BOW_Z + 0.02);
    const pts = [p0, new THREE.Vector3(0.05, sheerAt(s) - 0.1, BOW_Z - 0.15), new THREE.Vector3(0.12, 0.02, BOW_Z - 0.45), new THREE.Vector3(0.2, -0.02, BOW_Z - 0.9)];
    canoe.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.006, 5), new THREE.MeshStandardMaterial({ color: 0xd9667a, roughness: 0.9 })));
  }

  const hullParts = canoe.children.slice(); // the built-in canoe, replaced if the Magnific model loads

  // A lid over the hull's opening that writes depth but no colour. It is drawn after the canoe and
  // before the sea, so any water that would show inside the boat fails the depth test, whatever
  // the waves are doing, while everything in the canoe has already been painted underneath it.
  const capMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  let cap = null;
  function buildCap(meshes) {
    canoe.updateMatrixWorld(true);
    const inv = canoe.matrixWorld.clone().invert();
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const pts = [];
    for (const o of meshes) {
      const pos = o.geometry.attributes.position;
      m.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
    }
    let z0 = Infinity, z1 = -Infinity;
    for (let i = 2; i < pts.length; i += 3) { z0 = Math.min(z0, pts[i]); z1 = Math.max(z1, pts[i]); }
    const N = 64, dz = (z1 - z0) / N;
    const hb = new Float32Array(N + 1), top = new Float32Array(N + 1).fill(-Infinity);
    for (let i = 0; i < pts.length; i += 3) {
      const k = Math.round((pts[i + 2] - z0) / dz);
      hb[k] = Math.max(hb[k], Math.abs(pts[i]));
    }
    for (let i = 0; i < pts.length; i += 3) {
      const k = Math.round((pts[i + 2] - z0) / dz);
      if (Math.abs(pts[i]) > hb[k] * 0.75) top[k] = Math.max(top[k], pts[i + 1]);
    }
    const verts = [], idx = [];
    let n = 0;
    for (let k = 0; k <= N; k++) {
      if (hb[k] < 0.04 || !Number.isFinite(top[k])) continue;
      // Tucked just inside the gunwales and a little below their tops, so it never overhangs the sea
      const w = Math.max(0, hb[k] * 0.93 - 0.012), y = top[k] - 0.025, z = z0 + k * dz;
      verts.push(-w, y, z, w, y, z);
      if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      n++;
    }
    if (cap) { canoe.remove(cap); cap.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    cap = new THREE.Mesh(g, capMat);
    cap.renderOrder = 1;
    cap.frustumCulled = false;
    cap.layers.set(LAYER_NEAR);
    canoe.add(cap);
  }
  buildCap(hullParts.filter((o) => o.isMesh));

  // Small sprit sail on a mast stepped at the forward thwart
  const woodSpar = new THREE.MeshStandardMaterial({ color: 0xc9995a, roughness: 0.6 });
  const rig = new THREE.Group();
  rig.position.set(0, keelAt(sAt(-0.95)) + 0.02, -0.95);
  canoe.add(rig);
  const MAST_H = 2.7, BOOM_Y = 0.55, BOOM_L = 1.7;
  rig.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, MAST_H, 0), 0.028, woodSpar));
  const boom = rod(new THREE.Vector3(0, BOOM_Y, 0), new THREE.Vector3(0, BOOM_Y, BOOM_L), 0.022, woodSpar);
  rig.add(boom);
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
  const LUFF0 = new THREE.Vector3(0, BOOM_Y, 0), HEAD = new THREE.Vector3(0, MAST_H - 0.05, 0), CLEW = new THREE.Vector3(0, BOOM_Y, BOOM_L);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function shapeSail(billow, t) {
    for (let i = 0; i <= SU; i++) {
      const u = i / SU; // foot to head
      tmpA.lerpVectors(LUFF0, HEAD, u);
      tmpB.lerpVectors(CLEW, HEAD, u);
      for (let j = 0; j <= SV; j++) {
        const v = j / SV; // luff to leech
        tmpP.lerpVectors(tmpA, tmpB, v);
        tmpP.x += Math.sin(v * Math.PI) * Math.sin((u * 0.9 + 0.05) * Math.PI) * billow * (0.95 + 0.05 * Math.sin(t * 3 + u * 6 + v * 3));
        const k = (i * (SV + 1) + j) * 3;
        sailPos[k] = tmpP.x; sailPos[k + 1] = tmpP.y; sailPos[k + 2] = tmpP.z;
      }
    }
    sailGeo.attributes.position.needsUpdate = true;
    sailGeo.computeVertexNormals();
  }
  shapeSail(0.2, 0);
  // Furled sail lying along the thwarts when lowered
  const bundle = new THREE.Group();
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 1 });
  bundle.add(rod(new THREE.Vector3(0.24, GUN - 0.04, -1.55), new THREE.Vector3(0.26, GUN - 0.03, 0.55), 0.045, canvasMat, 10));
  bundle.add(rod(new THREE.Vector3(0.3, GUN - 0.01, -1.7), new THREE.Vector3(0.3, GUN, 0.7), 0.018, woodSpar));
  for (const z of [-1.2, -0.5, 0.2]) {
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, 5, 12), new THREE.MeshStandardMaterial({ color: 0x6b5a40, roughness: 1 }));
    tie.position.set(0.245, GUN - 0.035, z);
    bundle.add(tie);
  }
  canoe.add(bundle);

  // Single-blade canoe paddle of ash
  const paddlePivot = new THREE.Group();
  canoe.add(paddlePivot);
  const paddle = new THREE.Group();
  paddlePivot.add(paddle);
  paddle.add(rod(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, -0.9, 0), 0.016, ash));
  const blade = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 10), ash);
  blade.scale.z = 0.09;
  blade.position.set(0, -1.12, 0);
  paddle.add(blade);
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.07, 4, 8), ash);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.52, 0);
  paddle.add(grip);

  // Hurricane lantern on the floor in front of the paddler
  const lantern = new THREE.Group();
  lantern.position.set(0, sheerAt(sAt(BOW_Z + 0.32)) - 0.005, BOW_Z + 0.32); // on the bow deck, lighting the water ahead
  canoe.add(lantern);
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a35, roughness: 0.55, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xfff3dd, roughness: 0.15, transparent: true, opacity: 0.35, emissive: 0x000000 });
  const lanternFallback = new THREE.Group();
  const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.06, 20), brass);
  lBase.position.y = 0.03;
  const lGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), glassMat);
  lGlobe.scale.y = 1.3;
  lGlobe.position.y = 0.13;
  const lCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.05, 20), brass);
  lCap.position.y = 0.225;
  lanternFallback.add(lBase, lGlobe, lCap);
  lantern.add(lanternFallback);
  const flameTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,240,200,1)');
    grd.addColorStop(0.25, 'rgba(255,190,90,0.85)');
    grd.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flame.scale.set(0.06, 0.09, 1);
  flame.position.y = 0.13;
  flame.renderOrder = 6;
  lantern.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  halo.scale.set(0.6, 0.6, 1);
  halo.position.y = 0.13;
  halo.renderOrder = 6;
  lantern.add(halo);
  const lampLight = new THREE.PointLight(0xffa860, 0, 14, 2);
  lampLight.position.y = 0.14;
  lantern.add(lampLight);
  let lampLevel = 0;

  canoe.traverse((o) => o.layers.set(LAYER_NEAR));
  lampLight.layers.enableAll();
  scene.add(canoe);

  let strokeT = 0, side = 1, strokes = 0, paddleVis = 0, lastCatch = -1;
  const sailState = { shown: 1, angle: 0 };
  const samp = {};
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
  let pitchS = 0, rollS = 0, heaveS = 0, yawS = 0, heaveV = 0, pitchV = 0, rollV = 0, settled = false;
  const bladeWorld = new THREE.Vector3();

  /**
   * Place the canoe on the sea and animate rig, paddle and lantern.
   * opts: { x, z, headingDeg, paddling, sailUp, apparentFromRel (deg off the bow, + starboard), windSpeed, t, dt, waveT, ocean, lantern, light, onCatch }
   */
  function update(o) {
    const h = o.headingDeg * DEG;
    const fx = Math.sin(h), fz = -Math.cos(h);
    const rx = Math.cos(h), rz = Math.sin(h);
    // Fit a plane to the sea under the hull (least squares over the wetted points)
    let S0 = 0, Sa = 0, Sc = 0, Saa = 0, Scc = 0, Sac = 0, Sy = 0, Say = 0, Scy = 0;
    for (const [al, ac, wgt] of WET) {
      o.ocean.sample(o.x + fx * al + rx * ac, o.z + fz * al + rz * ac, o.waveT, samp);
      const y = samp.h;
      S0 += wgt; Sa += wgt * al; Sc += wgt * ac; Saa += wgt * al * al; Scc += wgt * ac * ac; Sac += wgt * al * ac;
      Sy += wgt * y; Say += wgt * al * y; Scy += wgt * ac * y;
    }
    const sol = solve3([[S0, Sa, Sc], [Sa, Saa, Sac], [Sc, Sac, Scc]], [Sy, Say, Scy]);
    // A short steep crest under part of the hull lifts the canoe over it rather than burying the bow
    let over = 0;
    for (const [al, ac] of WET) {
      o.ocean.sample(o.x + fx * al + rx * ac, o.z + fz * al + rz * ac, o.waveT, samp);
      over = Math.max(over, samp.h - (sol[0] + sol[1] * al + sol[2] * ac));
    }
    const heave = sol[0] + Math.max(0, over - 0.05) * 0.85;
    const pitch = Math.atan(sol[1]);
    const roll = Math.atan(sol[2]) * 1.15; // an open canoe is tender and rolls readily
    // After a long frame (a hidden tab, a slow device) the hull simply settles where the sea now is
    if (!settled || (o.rawDt || 0) > 0.3) { heaveS = heave; pitchS = pitch; rollS = roll; heaveV = pitchV = rollV = 0; settled = true; }
    // Buoyancy: the hull is a lightly damped mass, so it lifts, overshoots a little and settles,
    // pitching over each wave and rolling with the chop. Integrated in small steps at any frame rate.
    let left = Math.min(o.rawDt || o.dt, 0.3);
    while (left > 1e-4) {
      const dt = Math.min(left, 1 / 120);
      heaveV += (26 * (heave - heaveS) - 4.2 * heaveV) * dt;
      heaveS += heaveV * dt;
      pitchV += (20 * (pitch - pitchS) - 3.6 * pitchV) * dt;
      pitchS += pitchV * dt;
      rollV += (16 * (roll - rollS) - 2.6 * rollV) * dt;
      rollS += rollV * dt;
      left -= dt;
    }
    canoe.position.set(o.x, heaveS, o.z);
    yawS = -h;
    e.set(pitchS, -h, rollS, 'YXZ');
    canoe.quaternion.setFromEuler(e);
    // Tell the sea where the hull sits so it settles around it instead of passing through
    const ou = o.ocean.uniforms;
    ou.uHull.value.set(o.x, heaveS, o.z, 1);
    ou.uHullAx.value.set(fx, fz, Math.sin(pitchS), Math.sin(rollS));

    // Sail: raise and lower smoothly, swing to leeward and fill with the wind
    const target = o.sailUp ? 1 : 0;
    if (!sailState.init) { sailState.shown = target; sailState.init = true; }
    sailState.shown += (target - sailState.shown) * Math.min(1, o.dt * 1.5);
    if (o.light) sailMat.emissive.setRGB(o.light[0] * 0.28, o.light[1] * 0.27, o.light[2] * 0.25);
    rig.visible = sailState.shown > 0.02;
    bundle.visible = sailState.shown < 0.6;
    rig.scale.set(1, Math.max(0.02, sailState.shown), 1);
    const rel = o.apparentFromRel;
    const leeward = rel >= 0 ? -1 : 1;
    const swing = leeward * Math.min(75, Math.max(8, Math.abs(rel) * 0.5));
    sailState.angle += (swing * DEG - sailState.angle) * Math.min(1, o.dt * 0.8);
    rig.rotation.y = sailState.angle; // boom trails aft and swings to leeward
    shapeSail(leeward * Math.min(0.42, 0.14 + o.windSpeed * 0.03) * (o.sailUp ? 1 : 0.2), o.t);

    // Lantern: a kerosene flame flickers; light fades in and out when trimmed
    lampLevel += ((o.lantern ? 1 : 0) - lampLevel) * Math.min(1, o.dt * 3);
    const flick = 0.86 + 0.08 * Math.sin(o.t * 17.3) + 0.06 * Math.sin(o.t * 7.1 + Math.sin(o.t * 2.3));
    lampLight.intensity = 2.6 * lampLevel * flick;
    flame.visible = halo.visible = lampLevel > 0.02;
    flame.material.opacity = lampLevel;
    halo.material.opacity = 0.22 * lampLevel * flick;
    flame.scale.set(0.06 * (0.95 + 0.05 * flick), 0.09 * flick, 1);
    glassMat.emissive.setRGB(0.55 * lampLevel * flick, 0.32 * lampLevel * flick, 0.12 * lampLevel * flick);

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
    paddlePivot.position.set(side * (halfBeam(sAt(SEAT.z - 0.4)) + 0.04), SEAT.y + 0.05 + lift * 0.4 - (1 - paddleVis) * 0.8, SEAT.z - 0.4);
    paddle.rotation.set(swingX, 0, side * (0.14 + lift));
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
    e.set(pitchS * 0.85, yawS, rollS * 0.8, 'YXZ');
    q.setFromEuler(e);
    outQuat.copy(q);
  }

  /** World position and brightness of the lantern flame. */
  function lamp(out) {
    lampLight.getWorldPosition(out);
    return lampLevel * (0.9 + 0.1 * Math.sin(performance.now() / 60));
  }

  /** Swap the built-in lantern for the generated model, 30 cm tall, flame inside its globe. */
  function applyLantern(root) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].colorSpace = THREE.NoColorSpace;
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = 0.3 / size.y;
    const holder = new THREE.Group();
    holder.add(root);
    holder.scale.setScalar(scale);
    const c = box.getCenter(new THREE.Vector3());
    holder.position.set(-c.x * scale, -box.min.y * scale, -c.z * scale);
    lantern.add(holder);
    holder.traverse((o) => o.layers.set(LAYER_NEAR));
    lanternFallback.visible = false;
    flame.position.y = halo.position.y = lampLight.position.y = 0.3 * 0.47;
  }

  /**
   * Replace the built-in canoe with a generated model: turned so its length runs bow to stern,
   * scaled to 5.2 m, centred, and lowered so its keel sits at the waterline draft.
   * Returns the measured half-beam so the sea can wrap around it.
   */
  function applyCanoe(root) {
    root.updateMatrixWorld(true);
    const pts = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(v.clone()); }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].colorSpace = THREE.NoColorSpace;
        m.side = THREE.DoubleSide;
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.05);
        if (m.roughness !== undefined) m.roughness = Math.max(0.35, Math.min(m.roughness, 0.7));
      }
    });
    const box = new THREE.Box3().setFromPoints(pts);
    const size = box.getSize(new THREE.Vector3());
    const alongX = size.x > size.z;
    const len = alongX ? size.x : size.z, wid = alongX ? size.z : size.x;
    const c = box.getCenter(new THREE.Vector3());
    // Gunwale height amidships: the highest points near the sides in the middle tenth of the length
    let gun = -Infinity;
    for (const p of pts) {
      const al = (alongX ? p.x - c.x : p.z - c.z) / len, ac = (alongX ? p.z - c.z : p.x - c.x) / wid;
      if (Math.abs(al) < 0.05 && Math.abs(ac) > 0.35) gun = Math.max(gun, p.y);
    }
    const depth = (Number.isFinite(gun) ? gun : box.max.y) - box.min.y;
    // Fit to a real 17 ft canoe: 5.2 m long, 0.92 m beam, 0.33 m from keel to gunwale amidships
    const sL = LENGTH / len, sW = (BEAM * 2 + 0.02) / wid, sH = (GUN - KEEL) / depth;
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    holder.add(inner);
    inner.add(root);
    root.position.set(-c.x, -box.min.y, -c.z);
    if (alongX) inner.rotation.y = Math.PI / 2;
    holder.scale.set(sW, sH, sL);
    holder.position.y = KEEL;
    holder.traverse((o) => o.layers.set(LAYER_NEAR));
    canoe.add(holder);
    for (const p of hullParts) p.visible = false;
    // A solid cedar shell just outside the model's inner surface: wherever the generated mesh has
    // gaps, you see planking instead of the sea underneath
    innerHull.visible = true;
    innerHull.scale.set(1.04, 1, 1.0);
    innerHull.position.y = -0.025;
    const fitted = [];
    holder.traverse((o) => { if (o.isMesh) fitted.push(o); });
    buildCap(fitted);
    canoe.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const meshes = [];
    holder.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const down = new THREE.Vector3(0, -1, 0).transformDirection(canoe.matrixWorld);
    ray.layers.enableAll();
    // Seat the lantern on the yoke, the carved board across the middle of the canoe. Find it by
    // looking for the raised run of surface amidships (beside its centre hole) and stand the lantern
    // on top, centred over the hole.
    let run = null, best = null;
    for (let z = -0.4; z <= 0.4; z += 0.01) {
      let top = -Infinity;
      for (const x of [-0.08, 0.08]) {
        ray.set(new THREE.Vector3(x, 3, z).applyMatrix4(canoe.matrixWorld), down);
        const h = ray.intersectObjects(meshes, false)[0];
        if (h) top = Math.max(top, canoe.worldToLocal(h.point.clone()).y);
      }
      if (top > 0.08) { if (!run) run = { z0: z, z1: z, y: top }; run.z1 = z; run.y = Math.max(run.y, top); }
      else if (run) { if (!best || run.z1 - run.z0 > best.z1 - best.z0) best = run; run = null; }
    }
    if (run && (!best || run.z1 - run.z0 > best.z1 - best.z0)) best = run;
    if (best) lantern.position.set(0, best.y + 0.004, (best.z0 + best.z1) / 2);
    return { halfBeam: BEAM, depth: GUN - KEEL, deck: best ? lantern.position.y : null };
  }

  return { group: canoe, update, eye, lamp, applyLantern, applyCanoe, get heave() { return heaveS; } };
}

/** Sea mask settings for this hull: (along from, along to, half-beam) and no float. */
export const HULL_MASK = { seg: [LENGTH / 2, BEAM + 0.015, 0], ama: [0, 0, 0, -50] };
