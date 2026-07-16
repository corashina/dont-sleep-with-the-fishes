import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const itemIds = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
];

interface InvalidModelOptions {
  readonly externalBuffer?: boolean;
  readonly missingPosition?: boolean;
  readonly nonFinitePosition?: boolean;
  readonly missingTextureBytes?: boolean;
  readonly collinearTriangle?: boolean;
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
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(44);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);

  const buffer = options.externalBuffer
    ? { byteLength: binary.byteLength, uri: 'external.bin' }
    : { byteLength: binary.byteLength };
  const accessors = [
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
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };

  if (options.missingTextureBytes) {
    json.images = [{}];
    json.textures = [{ source: 0 }];
    json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }];
    primitive.material = 0;
  }

  if (options.externalBuffer) await writeFile(join(modelsDir, 'external.bin'), binary);
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
  });

  afterEach(async () => {
    await rm(modelsDir, { recursive: true, force: true });
  });

  function runAudit() {
    return spawnSync(
      process.execPath,
      ['scripts/check-item-models.mjs', '--assets-only', '--models-dir', modelsDir],
      { encoding: 'utf8' },
    );
  }

  it('audits an exact model set from the requested directory', () => {
    const result = runAudit();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('total: 2640 / 28000 triangles');
  });

  it('rejects an unexpected file in the requested model directory', async () => {
    await writeFile(join(modelsDir, 'unexpected.glb'), 'not approved');

    const result = runAudit();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected model entry: unexpected.glb');
  });

  it('accepts a non-degenerate planar triangle', async () => {
    await writeInvalidModel(modelsDir, {});

    const result = runAudit();

    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['missing POSITION geometry', { missingPosition: true }, 'missing POSITION geometry'],
    ['non-finite position data', { nonFinitePosition: true }, 'non-finite POSITION data'],
    ['an external buffer URI', { externalBuffer: true }, 'external buffer URI: external.bin'],
    ['a referenced texture without embedded bytes', { missingTextureBytes: true }, 'referenced texture has no embedded image bytes'],
    ['a collinear zero-area triangle', { collinearTriangle: true }, 'contains no non-degenerate world-space triangles'],
  ] as const)('rejects %s', async (_caseName, options, expectedError) => {
    await writeInvalidModel(modelsDir, options);

    const result = runAudit();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`flareGun.glb: ${expectedError}`);
  });
});
