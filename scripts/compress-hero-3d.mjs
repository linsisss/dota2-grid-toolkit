// Shrinks the 3D hero's models (assets/dota-hero/sf-arcana/models) in place with EXT_meshopt_compression
// (the page's GLTFLoader decodes it with three's meshopt decoder). make-hero-3d.mjs runs it last, after
// it read the plain models to fit the particle snapshots. Already compressed models are left alone, so
// running it twice changes nothing.
//
// What is lossy, and by how much (meshopt's filters, as gltfpack does by default):
// - animations: redundant keyframes go (resample); rotations keep 16 bits, translations and scales a
//   12-bit mantissa;
// - normals and tangents: 8-bit octahedral; UVs 12 bits, skin weights 8 bits.
// Positions stay exact floats: quantizing them would move the dequantization into the skins' inverse
// bind matrices, which the page also uses to put the particle snapshots on the bones (scene.js skin()).
//
// node scripts/compress-hero-3d.mjs [models dir]
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const QUANTIZED = /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/;

export async function compressHeroModels(dir) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const sizes = [];
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.glb')).sort()) {
    const file = join(dir, name), before = statSync(file).size, doc = await io.read(file);
    if (doc.getRoot().listExtensionsUsed().some((ext) => ext.extensionName === 'EXT_meshopt_compression')) { sizes.push([name, before, before]); continue; }
    await doc.transform(resample(), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ pattern: QUANTIZED, patternTargets: QUANTIZED }));
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    await io.write(file, doc);
    sizes.push([name, before, statSync(file).size]);
  }
  return sizes;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(process.argv[2] || new URL('../assets/dota-hero/sf-arcana/models/', import.meta.url).pathname);
  for (const [name, before, after] of await compressHeroModels(dir))
    console.log(`${name}: ${(before / 1024).toFixed(0)} → ${(after / 1024).toFixed(0)} КБ`);
}
