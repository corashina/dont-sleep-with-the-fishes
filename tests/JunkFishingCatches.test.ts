import { Box3, BufferGeometry, Material, Mesh, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FISHING_CATCHES, eligibleFishingCatches, selectFishingCatch } from '../src/survival/fishingCatalog';
import { fishingSettlement } from '../src/survival/fishingSettlementRules';
import { modelTriangleCount } from '../src/rendering/modelPresentation';
import type { SimpleJunkId } from '../src/survival/JunkCatchModels';

const ids: readonly SimpleJunkId[] = [
  'trafficCone', 'clothesHanger', 'toiletPlunger', 'golfBall', 'bowlingPin', 'tableTennisPaddle',
];

describe('new junk catches', () => {
  it.each(['rod', 'net'] as const)('draws every new catch with the %s and awards no food or items', (gear) => {
    const entries = eligibleFishingCatches(0, true, new Set(), 1, gear);
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    for (const id of ids) {
      const index = entries.findIndex((entry) => entry.catch.id === id);
      expect(index).toBeGreaterThanOrEqual(0);
      const before = entries.slice(0, index).reduce((sum, entry) => sum + entry.weight, 0);
      const selected = selectFishingCatch(0, true, (before + entries[index]!.weight / 2) / total, new Set(), 1, gear);
      expect(selected.id).toBe(id);
      expect(fishingSettlement({ kind: 'catch', catch: selected }, true)).toMatchObject({
        code: 'junk-caught', food: 0, deltas: {}, itemReward: null, baitConsumed: false,
      });
    }
  });

  it('retains the total junk weight when adding variety', () => {
    const weight = FISHING_CATCHES.filter((catchDefinition) => catchDefinition.kind === 'junk')
      .reduce((sum, catchDefinition) => sum + catchDefinition.baseWeight, 0);
    expect(weight).toBe(302);
  });

  it.each(ids)('builds %s at catch scale and releases all model resources', async (id) => {
    const load = vi.fn();
    const library = new FishingCatchLibrary({ load });
    const root = (await library.prepare(id))!;
    expect(load).not.toHaveBeenCalled();
    const size = new Box3().setFromObject(root).getSize(new Vector3());
    expect([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(Math.max(size.x, size.y, size.z)).toBeLessThanOrEqual(0.5);
    expect(modelTriangleCount(root, 'Missing geometry')).toBeLessThan(4000);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    const disposed = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    library.hide();
    library.dispose();
    disposed.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
