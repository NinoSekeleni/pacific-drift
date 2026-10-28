import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
const a = [];
const zs = (process.argv[3] || '0').split(',').map(Number);
for (const z0 of zs) {
  const pts = [];
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, a); if (Math.abs(a[2] - z0) < 0.006) pts.push([+a[0].toFixed(3), +a[1].toFixed(3)]); }
  // for x bins, list min and max y
  const bins = {};
  for (const [x, y] of pts) { const k = Math.round(x * 50) / 50; (bins[k] ||= []).push(y); }
  console.log('z=' + z0, Object.keys(bins).map(Number).sort((p, q) => p - q).map((k) => `${k}:[${Math.min(...bins[k]).toFixed(3)},${Math.max(...bins[k]).toFixed(3)}]n${bins[k].length}`).join(' '));
}
