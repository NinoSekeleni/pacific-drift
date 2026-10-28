import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
let tris = 0, verts = 0;
const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION');
  verts += pos.getCount();
  const idx = p.getIndices();
  tris += (idx ? idx.getCount() : pos.getCount()) / 3;
  const a = [];
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, a); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], a[k]); max[k] = Math.max(max[k], a[k]); } }
}
console.log('meshes', root.listMeshes().length, 'tris', tris, 'verts', verts);
console.log('bbox min', min.map((v) => v.toFixed(3)), 'max', max.map((v) => v.toFixed(3)));
for (const t of root.listTextures()) console.log('texture', t.getMimeType(), t.getSize(), (t.getImage().byteLength / 1024).toFixed(0) + ' KB');
for (const n of root.listNodes()) console.log('node', n.getName(), n.getTranslation(), n.getRotation(), n.getScale());
