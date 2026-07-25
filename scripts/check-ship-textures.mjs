import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const expectedHashes = {
  'src/assets/ship/deck-wood-color.webp':
    'D944487EAA4183783D25CCEEB797A3724D8ADBB0FF50A6795AC978122696F86B',
  'src/assets/ship/deck-wood-normal.webp':
    'EEDE7AF2F647F8C9E7F3164144935C8913DAE3C231C4259990402022CB384019',
  'src/assets/ship/deck-wood-roughness.webp':
    '5228D869454F60AD9CB6FDCDE4BD66B716CA6982130D468E7A974D417695A5C6',
  'src/assets/ship/painted-steel-color.webp':
    'C7F844D7EE1B8450CFB754478FEC131B71A017A9823F4139D1E596EA55080350',
  'src/assets/ship/painted-steel-normal.webp':
    '48D58289EB323E328DA8E822993F7AFD7127B616185EFA76466EBA7E645D902F',
  'src/assets/ship/painted-steel-roughness.webp':
    '787F64DBD755493E6BBF89123C09B43098C17D2FA790174F3598BF222BFAE34C',
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
