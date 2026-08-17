import { describe, expect, it } from 'vitest';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { LIFEBOAT_GUNWALE_SURFACE_Y } from '../src/world/Lifeboat';

describe('boat storage', () => {
  it('supports Carlitos at his seated contact height on the gunwale', () => {
    const transform = boatStorageTransform({
      instanceId: 'carlitos-1',
      type: 'carlitos',
    });
    const minimumY = transform.position.y
      + ITEM_MODEL_SPECS.carlitos.normalizedBounds.min[1] * transform.scale;

    expect(minimumY).toBeCloseTo(
      LIFEBOAT_GUNWALE_SURFACE_Y + 0.22 * transform.scale,
    );
    expect(transform.rotation.y).toBe(Math.PI);
  });
});
