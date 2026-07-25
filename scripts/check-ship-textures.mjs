import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const expectedHashes = {
  'src/assets/ship/deck-wood-color.webp':
    'D944487EAA4183783D25CCEEB797A3724D8ADBB0FF50A6795AC978122696F86B',
  'src/assets/ship/deck-wood-normal.webp':
    'EEDE7AF2F647F8C9E7F3164144935C8913DAE3C231C4259990402022CB384019',
  'src/assets/ship/deck-wood-roughness.webp':
    '5228D869454F60AD9CB6FDCDE4BD66B716CA6982130D468E7A974D417695A5C6',
};

for (const [path, expectedHash] of Object.entries(expectedHashes)) {
  await access(path);
  const bytes = await readFile(path);
  const actualHash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (actualHash !== expectedHash) {
    throw new Error(`${path} SHA-256 mismatch: expected ${expectedHash}, got ${actualHash}`);
  }
}

console.log(`Verified ${Object.keys(expectedHashes).length} committed ship texture maps.`);
