import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import { ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { createProp } from '../src/world/PropFactory';

describe('PropFactory', () => {
  it.each(ITEM_IDS)('builds a deliberate non-empty prop group for %s', (type) => {
    const instance = { instanceId: `${type}-1`, type } as ItemInstance;
    const prop = createProp(instance);
    let meshCount = 0;
    prop.traverse((object) => {
      if (object instanceof Mesh) meshCount += 1;
    });

    expect(prop.name).toBe(`prop:${instance.instanceId}`);
    expect(prop.getObjectByName(`prop-model:${type}`)).toBeDefined();
    expect(meshCount).toBeGreaterThan(0);
  });

  it('uses a named generic supply for unknown runtime input', () => {
    const prop = createProp({
      instanceId: 'mysterySupply-1',
      type: 'mysterySupply',
    } as unknown as ItemInstance);
    const fallback = prop.getObjectByName('generic-supply');

    expect(fallback).toBeDefined();
    expect(fallback!.children.length).toBeGreaterThan(0);
  });
});
