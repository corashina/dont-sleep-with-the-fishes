import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const itemIds = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
];

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
    expect(result.stdout).toContain('total: 26494 / 28000 triangles');
  });

  it('rejects an unexpected file in the requested model directory', async () => {
    await writeFile(join(modelsDir, 'unexpected.glb'), 'not approved');

    const result = runAudit();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unexpected model entry: unexpected.glb');
  });
});
