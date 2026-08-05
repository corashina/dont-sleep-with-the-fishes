import { describe, expect, it } from 'vitest';
import { SCAVENGE_PHYSICS_OBJECT_SPECS } from '../src/world/ScavengePhysicsObjectCatalog';
import {
  SCAVENGE_PHYSICS_OBJECT_PLACEMENTS,
  selectScavengePhysicsObjectPlacements,
} from '../src/world/ScavengePhysicsObjectPlacement';
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
});
