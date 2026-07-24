import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const TEXTURE_DIRECTORY = resolve('src', 'assets', 'lifeboat');
const EXPECTED_TEXTURES = {
  'wood-planks-color.webp': '7a31ae86ae9b0a0b18671859788549cedc08323271b6f2f580cdafd4a36dcada',
  'wood-planks-normal.webp': 'd7031ee7e5d1184de6bbace40f097c12cf8e4f1ecc5c46f9b909ef112f66209c',
  'wood-planks-roughness.webp': 'e0ddad3ce2d94b7ad7fb69277fc7c068df64a40ceda242f787594006300e9b9b',
};

async function verifyTexture(name, expectedSha256) {
  const path = resolve(TEXTURE_DIRECTORY, name);
  const bytes = await readFile(path);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${name}: SHA-256 mismatch (received ${actualSha256})`);
  }

  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== 'webp' || metadata.width !== 512 || metadata.height !== 512) {
    throw new Error(
      `${name}: expected 512x512 WebP, received ${metadata.width}x${metadata.height} ${metadata.format}`,
    );
  }
  console.log(`${name}: ${metadata.width}x${metadata.height} ${metadata.format} ${actualSha256}`);
}

async function main() {
  const errors = [];
  try {
    const entries = await readdir(TEXTURE_DIRECTORY, { withFileTypes: true });
    const actualNames = entries.map((entry) => entry.name).sort();
    const expectedNames = Object.keys(EXPECTED_TEXTURES).sort();
    if (
      entries.some((entry) => !entry.isFile())
      || actualNames.join('|') !== expectedNames.join('|')
    ) {
      errors.push(`unexpected texture entries: ${actualNames.join(', ')}`);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const [name, expectedSha256] of Object.entries(EXPECTED_TEXTURES)) {
    try {
      await verifyTexture(name, expectedSha256);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

await main();
