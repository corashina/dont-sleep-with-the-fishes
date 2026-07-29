import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const expectedHashes = {
  'src/assets/ship/dark-wood-color.webp':
    '7B5E5BFEB9037CC8300FA863104CE1BEC5CD184776F77C59D7CB3F18212E1441',
  'src/assets/ship/dark-wood-normal.webp':
    '7CB243AE6C56179CC66E49DFEB467F15097F225074BBF06EC42F8530312C6C22',
  'src/assets/ship/dark-wood-roughness.webp':
    '71FF0E9102388B108AC6A2C0C44776A70BBD1363435D63EC874FF7DCC4072082',
  'src/assets/ship/room-painted-wood-color.webp':
    '6734ECCC799B2954C2F3D9EE8CB4D8343EB4BBC4175DE3E8A834E078E05DDC6F',
  'src/assets/ship/room-painted-wood-normal.webp':
    '56866DE8136A804DDEC4DF7C4B32135C8D47B4F5E951EB271F153B96DC287FCB',
  'src/assets/ship/room-painted-wood-roughness.webp':
    'AD00EB72E24ABA99CB518FDA947C15713B809C88CB64A149056D7D296D478D98',
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
