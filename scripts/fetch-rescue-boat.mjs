import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Boat by Poly by Google, CC BY 3.0: https://poly.pizza/m/84-DYhLzxNq
const url = 'https://static.poly.pizza/3b380db5-c7d5-42cd-b7d0-0952839cb589.glb';
const expected = 'cfa1315eb59f7af0e4dfbafc5343b71791107e16a4b590f7a7be53bf57ecfc3f';
const response = await fetch(url);
if (!response.ok) throw new Error(`Rescue boat download failed: ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== expected) {
  throw new Error('Rescue boat source checksum changed.');
}
const directory = new URL('../src/assets/models/ending/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('rescueBoat.glb', directory), bytes);
