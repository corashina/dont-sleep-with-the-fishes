import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Document, NodeIO } from '@gltf-transform/core';

const triangleCounts = {
  bedBunk: 580,
  desk: 198,
  chairDesk: 588,
  bookcaseOpen: 320,
  bookcaseClosedDoors: 296,
  table: 120,
  sideTableDrawers: 238,
} as const;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XxL7WQAAAABJRU5ErkJggg==',
  'base64',
);

async function writeModel(path: string, triangles: number, instances = 1): Promise<void> {
  const positions = new Float32Array(triangles * 9);
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const offset = triangle * 9;
    positions.set([triangle, 0, 0, triangle + 0.5, 1, 0, triangle + 1, 0, 0], offset);
  }
  const document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor('position', buffer).setType('VEC3').setArray(positions);
  const texture = document.createTexture('colormap')
    .setImage(new Uint8Array(PNG_1X1))
    .setMimeType('image/png');
  const material = document.createMaterial('material').setBaseColorTexture(texture);
  const mesh = document.createMesh('mesh').addPrimitive(
    document.createPrimitive().setAttribute('POSITION', position).setMaterial(material),
  );
  const scene = document.createScene('scene');
  for (let instance = 0; instance < instances; instance += 1) {
    scene.addChild(document.createNode(`root-${instance}`).setMesh(mesh));
  }
  await mkdir(dirname(path), { recursive: true });
  await new NodeIO().write(path, document);
}

function ledgerRows(): string {
  return Object.entries(triangleCounts).map(([id, triangles]) => (
    `| ${id} | \`${id}.glb\` | ${id} / Kenney | https://kenney.nl/assets/furniture-kit | \`furniture-kit@1.0:Models/GLTF format/${id}.glb\` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | ${triangles} | ${triangles} | Furniture Kit 1.0 archive SHA-256 \`E67652D0932CEE41683F74711C03D3E192A2AF9979EF8E6B237711F5482D46B0\`; direct build; prune, deduplicate, unpartition, and embed resources. | 2026-07-15 |`
  )).join('\n');
}

describe('ship furniture model audit CLI', () => {
  let root: string;
  let modelsDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ship-furniture-audit-'));
    modelsDir = join(root, 'models');
    await mkdir(modelsDir);
    for (const [id, triangles] of Object.entries(triangleCounts)) {
      await writeModel(join(modelsDir, `${id}.glb`), triangles);
    }
    await writeFile(join(root, 'THIRD_PARTY_ASSETS.md'), ledgerRows());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function runAudit(...args: string[]) {
    return spawnSync(
      process.execPath,
      [resolve('scripts', 'check-ship-furniture.mjs'), '--models-dir', modelsDir, ...args],
      { cwd: root, encoding: 'utf8' },
    );
  }

  it('pins the seven IDs and the model and library limits', async () => {
    const source = await readFile(resolve('scripts', 'check-ship-furniture.mjs'), 'utf8');
    expect(source).toContain(
      'export const SHIP_FURNITURE_IDS = Object.keys(KENNEY_SHIP_FURNITURE_RECIPES)',
    );
    expect(source).toContain('export const MODEL_LIMIT = 1_000');
    expect(source).toContain('export const LIBRARY_LIMIT = 8_000');
  });

  it('audits exact models, embedded resources, bounds, triangles, and ledger rows', () => {
    const result = runAudit();

    expect(result.status, result.stderr).toBe(0);
    for (const [id, triangles] of Object.entries(triangleCounts)) {
      expect(result.stdout).toContain(`${id}: ${triangles} triangles`);
    }
    expect(result.stdout).toContain('total: 2340 / 8000 triangles');
  });

  it('rejects an unexpected model entry', async () => {
    await writeFile(join(modelsDir, 'unexpected.glb'), 'not approved');
    const result = runAudit('--assets-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected model entry: unexpected.glb');
  });

  it('rejects a model over 1,000 triangles', async () => {
    await writeModel(join(modelsDir, 'table.glb'), 1_001);
    const result = runAudit('--assets-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('table.glb: 1001 triangles exceeds 1000');
  });

  it('rejects a model that differs from its exact source triangle count', async () => {
    await writeModel(join(modelsDir, 'desk.glb'), 199);
    const result = runAudit('--assets-only');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('desk.glb: expected 198 triangles, received 199');
  });

  it('counts repeated scene-node mesh instances in the rendered triangle total', async () => {
    await writeModel(join(modelsDir, 'bedBunk.glb'), 290, 2);
    const result = runAudit('--assets-only');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('bedBunk: 580 triangles');
    expect(result.stdout).toContain('total: 2340 / 8000 triangles');
  });

  it('rejects an incomplete ledger row', async () => {
    const ledger = ledgerRows().replace('2026-07-15', '2026-07-14');
    await writeFile(join(root, 'THIRD_PARTY_ASSETS.md'), ledger);
    const result = runAudit();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bedBunk row is missing 2026-07-15');
  });
});
