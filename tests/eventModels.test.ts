// Importance: 5/5. Protects pinned model source identity and license records.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';
import {
  POLY_PIZZA_EVENT_MODEL_IDS,
  POLY_PIZZA_EVENT_MODEL_SOURCES,
} from '../scripts/poly-pizza-event-models.mjs';

const root = resolve(import.meta.dirname, '..');
const modelsRoot = resolve(root, 'src', 'assets', 'models', 'events');

describe('event model assets', () => {
  it('matches each pinned source hash and triangle count', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

    for (const id of POLY_PIZZA_EVENT_MODEL_IDS) {
      const source = POLY_PIZZA_EVENT_MODEL_SOURCES[id]!;
      const file = await readFile(resolve(modelsRoot, `${id}.glb`));
      expect(createHash('sha256').update(file).digest('hex').toUpperCase()).toBe(source.sha256);

      const document = await io.readBinary(file);
      let triangles = 0;
      for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const position = primitive.getAttribute('POSITION');
          const elements = primitive.getIndices()?.getCount() ?? position?.getCount() ?? 0;
          triangles += elements / 3;
        }
      }
      expect(triangles).toBe(source.sourceTriangles);
    }
  });

  it('records each event model in the attribution ledger', async () => {
    const ledger = await readFile(resolve(root, 'src', 'assets', 'ATTRIBUTION.md'), 'utf8');
    for (const id of POLY_PIZZA_EVENT_MODEL_IDS) {
      const source = POLY_PIZZA_EVENT_MODEL_SOURCES[id]!;
      const rows = ledger.split(/\r?\n/).filter((line) => line.startsWith(`| ${id} |`));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain(source.pageUrl);
      expect(rows[0]).toContain(source.sourceAssetId);
      expect(rows[0]).toContain(source.sha256);
      expect(rows[0]).toContain(source.license);
    }
  });
});
