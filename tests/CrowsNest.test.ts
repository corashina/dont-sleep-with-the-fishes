import { describe, expect, it } from 'vitest';
import { resolveLadderTraversal } from '../src/player/LadderTraversal';
import { createCrowsNest } from '../src/world/CrowsNest';
import { FREIGHTER_DIMENSIONS, SHIP_LAYOUT } from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('mainmast crow\'s nest', () => {
  it('builds a climbable lookout with intro anchors', () => {
    const materials = createShipMaterials();
    const mast = SHIP_LAYOUT.rigging.masts[0]!;
    const build = createCrowsNest(materials, mast, SHIP_LAYOUT.rigging.crowsNest);

    try {
      expect(build.root.name).toBe('crows-nest:mainmast-lookout');
      expect(build.climbZone.id).toBe('mainmast-ladder');
      expect(build.climbZone.bottomEyeY).toBe(FREIGHTER_DIMENSIONS.deckY + 1.5);
      expect(build.climbZone.topEyeY).toBe(FREIGHTER_DIMENSIONS.deckY + 12);
      expect(build.climbZone.bottomDismount).toEqual([0, -1.3]);
      expect(build.climbZone.topDismount).toEqual([0, -0.85]);
      expect(build.introAnchors.exitPosition).toEqual([0, FREIGHTER_DIMENSIONS.deckY + 1.5, -1.3]);
      expect(build.root.getObjectByName('crows-nest-seat')).toBeDefined();
      expect(build.root.getObjectByName('mainmast-ladder:rung:0')).toBeDefined();

      const ascent = resolveLadderTraversal({
        position: {
          x: build.climbZone.climbX,
          y: build.climbZone.bottomEyeY,
          z: build.climbZone.climbZ,
        },
        activeLadderId: build.climbZone.id,
        planarMovement: [0, 0],
        verticalInput: 1,
        deltaSeconds: 10,
        floorEyeY: build.climbZone.bottomEyeY,
      }, [build.climbZone]);
      expect(ascent.position).toEqual({
        x: 0,
        y: build.climbZone.topEyeY,
        z: -0.85,
      });

      const descent = resolveLadderTraversal({
        position: {
          x: build.climbZone.climbX,
          y: build.climbZone.topEyeY,
          z: build.climbZone.climbZ,
        },
        activeLadderId: build.climbZone.id,
        planarMovement: [0, 0],
        verticalInput: -1,
        deltaSeconds: 10,
        floorEyeY: build.climbZone.topEyeY,
      }, [build.climbZone]);
      expect(descent.position).toEqual({
        x: 0,
        y: build.climbZone.bottomEyeY,
        z: -1.3,
      });
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });
});
