import { describe, expect, it } from 'vitest';
import type { CollisionBox } from '../src/player/collisions';
import { mulberry32 } from '../src/survival/random';
import { SCAVENGE_PHYSICS_OBJECT_SPECS } from '../src/world/ScavengePhysicsObjectCatalog';
import {
  SCAVENGE_PHYSICS_OBJECT_PLACEMENTS,
  scavengePhysicsObjectBlocksDoor,
  selectScavengePhysicsObjectPlacements,
  validateScavengePhysicsObjectPlacementPool,
  type ScavengePhysicsObjectPlacement,
} from '../src/world/ScavengePhysicsObjectPlacement';
import { PLAYER_LAYOUT_RADIUS, SHIP_LAYOUT } from '../src/world/ShipLayout';
import { sequenceRandom } from './helpers/random';

describe('scavenge physics object placement', () => {
  it('defines fourteen unique categorized positions', () => {
    expect(SCAVENGE_PHYSICS_OBJECT_PLACEMENTS).toHaveLength(14);
    expect(new Set(SCAVENGE_PHYSICS_OBJECT_PLACEMENTS.map(({ id }) => id)).size).toBe(14);
    expect(SCAVENGE_PHYSICS_OBJECT_PLACEMENTS.map(({ category }) => category).sort())
      .toEqual([
        ...Array(4).fill('center'),
        ...Array(4).fill('door'),
        ...Array(4).fill('exterior'),
        ...Array(2).fill('storage'),
      ]);
  });

  it('selects the required category counts deterministically', () => {
    const ids = SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ id }) => id);
    const leftRandom = sequenceRandom([0.1, 0.8, 0.3]);
    const rightRandom = sequenceRandom([0.1, 0.8, 0.3]);
    const left = selectScavengePhysicsObjectPlacements(ids, () => leftRandom.next());
    const right = selectScavengePhysicsObjectPlacements(ids, () => rightRandom.next());
    expect([...left]).toEqual([...right]);
    const categories = [...left.values()].map(({ category }) => category);
    expect(categories.filter((value) => value === 'door')).toHaveLength(2);
    expect(categories.filter((value) => value === 'exterior')).toHaveLength(2);
    expect(categories.filter((value) => value === 'center')).toHaveLength(2);
    expect(categories.filter((value) => value === 'storage')).toHaveLength(1);
  });

  it('changes assignments when the random sequence changes', () => {
    const ids = SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ id }) => id);
    const firstRandom = sequenceRandom([0.05, 0.15, 0.25, 0.35]);
    const secondRandom = sequenceRandom([0.95, 0.85, 0.75, 0.65]);
    const first = selectScavengePhysicsObjectPlacements(ids, () => firstRandom.next());
    const second = selectScavengePhysicsObjectPlacements(ids, () => secondRandom.next());
    expect([...first.entries()]).not.toEqual([...second.entries()]);
  });

  it('only assigns objects that close each selected doorway', () => {
    const ids = SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ id }) => id);
    for (let seed = 0; seed < 64; seed += 1) {
      const random = mulberry32(seed);
      const selection = selectScavengePhysicsObjectPlacements(ids, () => random.next());
      for (const [id, placement] of selection) {
        if (placement.category !== 'door') continue;
        const spec = SCAVENGE_PHYSICS_OBJECT_SPECS.find((candidate) => candidate.id === id)!;
        expect(scavengePhysicsObjectBlocksDoor(spec, placement)).toBe(true);
      }
    }
  });

  it('uses actual openings and player width for every eligible door assignment', () => {
    const doors = SCAVENGE_PHYSICS_OBJECT_PLACEMENTS.filter(
      ({ category }) => category === 'door',
    );
    expect(doors).toHaveLength(4);
    for (const placement of doors) {
      const door = SHIP_LAYOUT.doors.find(({ id }) => id === placement.doorId)!;
      expect(door).toBeDefined();
      for (const spec of SCAVENGE_PHYSICS_OBJECT_SPECS) {
        if (!scavengePhysicsObjectBlocksDoor(spec, placement)) continue;
        const collider = spec.collider;
        const halfWidth = collider.kind === 'sphere' || collider.kind === 'cylinder'
          ? collider.radius
          : door.orientation === 'aft'
            ? Math.abs(Math.cos(placement.rotationY)) * collider.halfExtents.x
              + Math.abs(Math.sin(placement.rotationY)) * collider.halfExtents.z
            : Math.abs(Math.sin(placement.rotationY)) * collider.halfExtents.x
              + Math.abs(Math.cos(placement.rotationY)) * collider.halfExtents.z;
        const sideGap = door.width / 2 - halfWidth;
        expect(sideGap).toBeLessThan(PLAYER_LAYOUT_RADIUS * 2);
      }
    }
  });

  it('rejects duplicate coordinates', () => {
    const first = SCAVENGE_PHYSICS_OBJECT_PLACEMENTS[0]!;
    const duplicate = {
      ...SCAVENGE_PHYSICS_OBJECT_PLACEMENTS[1]!,
      position: { ...first.position },
    };
    expect(() => validateScavengePhysicsObjectPlacementPool(
      [first, duplicate],
      [] as CollisionBox[],
      [],
    )).toThrow('Duplicate scavenge physics object placement position');
  });

  it('rejects invalid categories', () => {
    const invalid = {
      ...SCAVENGE_PHYSICS_OBJECT_PLACEMENTS[0]!,
      category: 'corridor',
    } as unknown as ScavengePhysicsObjectPlacement;
    expect(() => validateScavengePhysicsObjectPlacementPool(
      [invalid],
      [] as CollisionBox[],
      [],
    )).toThrow('Invalid scavenge physics object placement category');
  });
});
