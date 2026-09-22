import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Poly by Google models, CC BY 3.0. Source pages are recorded in src/assets/ATTRIBUTION.md.
const models = [
  ['bloodHeart', 'a82a0fd9-24dc-429c-ae5b-f894b0778171', 'b72b11530615d9095cc90c7aaafa8dd49043424479c73a4fc3d14bc0cd712f31'],
  ['flowersHeart', 'f16b3b74-1fdd-47a6-b7cd-cdf0d6f10058', 'bc67afd20c46b06535a00cc9dba10676c79ed1087d9e02d4531adb08223d8d9c'],
  ['chestHeart', 'e30ab49f-c137-4f7e-92f5-bbf6abefa1ac', '3bb4532470f7f0d6df5455a8fbc2cdf755063076116793bca14c04412c7eeece'],
];
const directory = new URL('../src/assets/models/ending/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [id, resource, expected] of models) {
  const response = await fetch(`https://static.poly.pizza/${resource}.glb`);
  if (!response.ok) throw new Error(`${id} download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== expected) {
    throw new Error(`${id} source checksum changed.`);
  }
  await writeFile(new URL(`${id}.glb`, directory), bytes);
}
