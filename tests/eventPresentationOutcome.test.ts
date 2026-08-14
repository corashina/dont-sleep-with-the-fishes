// Importance: 4/5. Protects stable event change summaries and presentation seeds.
import { describe, expect, it } from 'vitest';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import {
  deriveEventOutcomePresentation,
  deriveEventVariantSeed,
} from '../src/survival/eventPresentationOutcome';

function snapshot(inventory: SurvivalSnapshot['inventory']): SurvivalSnapshot {
  return {
    inventory,
    pendingEventTargetId: null,
  } as SurvivalSnapshot;
}

describe('event presentation outcome', () => {
  it('derives sorted, concrete event changes', () => {
    const before = snapshot({
      'bucket-1': { instanceId: 'bucket-1', type: 'bucket', condition: 'usable' },
      'map-1': { instanceId: 'map-1', type: 'map', condition: 'usable' },
      'ductTape-1': { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
    });
    const after = snapshot({
      'bucket-1': { instanceId: 'bucket-1', type: 'bucket', condition: 'broken' },
      'map-1': { instanceId: 'map-1', type: 'map', condition: 'lost' },
      'ductTape-1': { instanceId: 'ductTape-1', type: 'ductTape', condition: 'consumed' },
      'energyBar-1': {
        instanceId: 'energyBar-1',
        type: 'energyBar',
        condition: 'usable',
      },
    });

    const result = deriveEventOutcomePresentation(
      before,
      after,
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The leak takes two items.',
        deltas: { hull: -18 },
        cue: 'impact',
      },
      'bucket-1',
    );

    expect(result.resourceDeltas).toEqual({ hull: -18 });
    expect(result.gainedInstanceIds).toEqual(['energyBar-1']);
    expect(result.brokenInstanceIds).toEqual(['bucket-1']);
    expect(result.lostInstanceIds).toEqual(['map-1']);
    expect(result.consumedInstanceIds).toEqual(['ductTape-1']);
    expect(result.selectedInstanceId).toBe('bucket-1');
    expect(result.selectedCondition).toBe('broken');
  });

  it('reports fallback food without reporting an occupied item slot as gained', () => {
    const inventory = {
      'energyBar-1': {
        instanceId: 'energyBar-1' as const,
        type: 'energyBar' as const,
        condition: 'usable' as const,
      },
    };

    const result = deriveEventOutcomePresentation(
      snapshot(inventory),
      snapshot(inventory),
      {
        accepted: true,
        code: 'event-resolved',
        message: 'The occupied slot yields food.',
        deltas: { food: 1 },
        cue: 'none',
      },
      null,
    );

    expect(result.resourceDeltas).toEqual({ food: 1 });
    expect(result.gainedInstanceIds).toEqual([]);
  });

  it('derives stable unsigned variant seeds', () => {
    const first = deriveEventVariantSeed(42, 6, 'leak');
    expect(deriveEventVariantSeed(42, 6, 'leak')).toBe(first);
    expect(deriveEventVariantSeed(42, 6, 'whirlpool')).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0xffffffff);
  });
});
