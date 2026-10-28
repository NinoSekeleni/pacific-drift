// Shrink a generated GLB for the web: weld, prune, and resize textures to WebP.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
const [src, dst, size = '1024'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
await doc.transform(dedup(), weld(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [Number(size), Number(size)], quality: 82 }));
await io.write(dst, doc);
