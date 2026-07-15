import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const itemIds = [
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'medicalKit',
  'spyglass', 'fishingNet', 'bucket', 'flareGun', 'scubaSet', 'anchor',
  'bottledPaper', 'umbrella', 'swimRing', 'flashlight', 'harpoonGun',
  'energyBar', 'fishingRod',
];

interface InvalidModelOptions {
  readonly externalBuffer?: boolean;
  readonly externalTexture?: boolean;
  readonly missingPosition?: boolean;
  readonly emptyPosition?: boolean;
  readonly nonFinitePosition?: boolean;
  readonly nonFiniteBounds?: boolean;
  readonly emptyBounds?: boolean;
  readonly missingTextureBytes?: boolean;
  readonly collinearTriangle?: boolean;
  readonly outOfRangeIndex?: boolean;
}

function padToFour(bytes: Uint8Array, fill = 0): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  padded.fill(fill);
  padded.set(bytes);
  return padded;
}

function encodeGlb(json: object, binary?: Uint8Array): Uint8Array {
  const jsonBytes = padToFour(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binaryBytes = binary ? padToFour(binary) : undefined;
  const byteLength = 12 + 8 + jsonBytes.byteLength + (binaryBytes ? 8 + binaryBytes.byteLength : 0);
  const output = new Uint8Array(byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, byteLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.set(jsonBytes, 20);
  if (binaryBytes) {
    const chunkOffset = 20 + jsonBytes.byteLength;
    view.setUint32(chunkOffset, binaryBytes.byteLength, true);
    view.setUint32(chunkOffset + 4, 0x004e4942, true);
    output.set(binaryBytes, chunkOffset + 8);
  }
  return output;
}

async function writeInvalidModel(
  modelsDir: string,
  options: InvalidModelOptions,
): Promise<void> {
  const positions = new Float32Array(options.collinearTriangle
    ? [0, 0, 0, 1, 1, 1, 2, 2, 2]
    : [
        options.nonFinitePosition ? Number.NaN : 0, 0, 0,
        2, 0, 0,
        0, 1, 0,
      ]);
  const indices = new Uint16Array(options.outOfRangeIndex ? [0, 1, 3] : [0, 1, 2]);
  const binary = new Uint8Array(44);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);

  const buffer = options.externalBuffer
    ? { byteLength: binary.byteLength, uri: 'external.bin' }
    : { byteLength: binary.byteLength };
  const accessors = options.emptyPosition
    ? [
        { componentType: 5126, count: 0, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ]
    : [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ];
  const primitive: Record<string, unknown> = {
    attributes: options.missingPosition ? {} : { POSITION: 0 },
    ...(options.collinearTriangle ? {} : { indices: 1 }),
    mode: 4,
  };
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    buffers: [buffer],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    accessors,
    meshes: [{ primitives: [primitive] }],
    nodes: [{ mesh: 0, ...(options.nonFiniteBounds ? { scale: [1e308, 1e308, 1e308] } : {}) }],
    scenes: [{ nodes: options.emptyBounds ? [] : [0] }],
    scene: 0,
  };

  if (options.externalTexture || options.missingTextureBytes) {
    json.images = options.externalTexture ? [{ uri: 'texture.png' }] : [{}];
    json.textures = [{ source: 0 }];
    json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    primitive.material = 0;
  }

  if (options.externalBuffer) await writeFile(join(modelsDir, 'external.bin'), binary);
  if (options.externalTexture) await writeFile(join(modelsDir, 'texture.png'), 'external texture');
  await writeFile(
    join(modelsDir, 'flareGun.glb'),
    encodeGlb(json, options.externalBuffer ? undefined : binary),
  );
}

describe('item model audit CLI', () => {
  let modelsDir: string;

  beforeEach(async () => {
    modelsDir = await mkdtemp(join(tmpdir(), 'item-model-audit-'));
    for (const itemId of itemIds) {
      await cp(
        resolve('src', 'assets', 'models', 'items', `${itemId}.glb`),
        join(modelsDir, `${itemId}.glb`),
      );
    }
    await cp(
      resolve('src', 'assets', 'models', 'items', 'item-model-metadata.json'),
      join(modelsDir, 'item-model-metadata.json'),
    );
  });

  afterEach(async () => {
    await rm(modelsDir, { recursive: true, force: true });
  });

  function runAudit(extraArgs: readonly string[] = []) {
    return spawnSync(
      process.execPath,
      ['scripts/check-item-models.mjs', '--assets-only', '--models-dir', modelsDir, ...extraArgs],
      { encoding: 'utf8' },
    );
  }

  it('audits an exact model set from the requested directory', () => {
    const result = runAudit();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.match(/\.glb: \d+ \/ 3000 triangles/g)).toHaveLength(19);
    expect(result.stdout).toMatch(/total: \d+ \/ 40000 triangles/);
  });

  it('generates ordered finite triangle and raw-bounds metadata for every model', async () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/item-model-metadata.mjs', modelsDir, ...itemIds],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    const metadata = JSON.parse(await readFile(join(modelsDir, 'item-model-metadata.json'), 'utf8'));
    expect(Object.keys(metadata)).toEqual(itemIds);
    for (const id of itemIds) {
      expect(metadata[id].triangles).toBeGreaterThan(0);
      expect([...metadata[id].rawBounds.min, ...metadata[id].rawBounds.max].every(Number.isFinite))
        .toBe(true);
    }
  });

  it('rejects an unexpected file in the requested model directory', async () => {
    await writeFile(join(modelsDir, 'unexpected.glb'), 'not approved');

    const result = runAudit();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected model entry: unexpected.glb');
  });

  it('rejects generated metadata that differs from measured GLB values', async () => {
    const metadataPath = join(modelsDir, 'item-model-metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    metadata.flareGun.triangles += 1;
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

    const result = runAudit();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('flareGun: metadata triangle count does not match measured value');
  });

  it('rejects a third-party ledger row for a project-authored model', async () => {
    const ledgerPath = join(modelsDir, 'ledger.md');
    const ledger = await readFile(resolve('THIRD_PARTY_ASSETS.md'), 'utf8');
    await writeFile(ledgerPath, `${ledger}\n| compass | \`compass.glb\` | Compass / Project team | project | \`project-item-models@1:compass\` | project | 88 | 88 | none | 2026-07-15 |\n`);

    const result = spawnSync(
      process.execPath,
      ['scripts/check-item-models.mjs', '--models-dir', modelsDir, '--ledger-path', ledgerPath],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('project-authored compass must not have a ledger row');
  });

  it('accepts a non-degenerate planar triangle', async () => {
    await writeInvalidModel(modelsDir, {});
    const metadata = spawnSync(
      process.execPath,
      ['scripts/item-model-metadata.mjs', modelsDir, ...itemIds],
      { encoding: 'utf8' },
    );
    expect(metadata.status, metadata.stderr).toBe(0);

    const result = runAudit();

    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['missing POSITION geometry', { missingPosition: true }, 'missing POSITION geometry'],
    ['empty POSITION geometry', { emptyPosition: true }, 'empty POSITION geometry'],
    ['non-finite position data', { nonFinitePosition: true }, 'non-finite POSITION data'],
    ['non-finite model bounds', { nonFiniteBounds: true }, 'non-finite model bounds'],
    ['empty model bounds', { emptyBounds: true }, 'empty model bounds'],
    ['an external buffer URI', { externalBuffer: true }, 'external buffer URI: external.bin'],
    ['an external texture URI', { externalTexture: true }, 'external texture URI: texture.png'],
    ['a referenced texture without embedded bytes', { missingTextureBytes: true }, 'referenced texture has no embedded image bytes'],
    ['a collinear zero-area triangle', { collinearTriangle: true }, 'contains no non-degenerate world-space triangles'],
    ['an out-of-range triangle index', { outOfRangeIndex: true }, 'triangle index 3 is out of range for 3 POSITION vertices'],
  ] as const)('rejects %s', async (_caseName, options, expectedError) => {
    await writeInvalidModel(modelsDir, options);

    const result = runAudit();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`flareGun.glb: ${expectedError}`);
  });
});
