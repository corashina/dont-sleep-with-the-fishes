// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { GamePhase } from '../src/app/GamePhase';
import { CANONICAL_EVENTS } from '../src/canonical/events';
import { PARITY_AUDIT } from '../src/canonical/parityAudit';
import { Game } from '../src/Game';
import { ScavengeSession, type ScavengeResult } from '../src/game/ScavengeSession';
import { createItemInstances, ITEM_IDS } from '../src/game/ItemState';
import { sequenceRandom } from '../src/survival/random';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function phase(overrides: Partial<GamePhase> = {}): GamePhase {
  return {
    start: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

describe('wiki gameplay parity integration', () => {
  it('carries expanded scavenging supplies through survival mechanics and a full restart', () => {
    const expandedCatalog = createItemInstances();
    const scavengeSessions: ScavengeSession[] = [];
    const scavengePhases: GamePhase[] = [];
    const survivalSessions: SurvivalSession[] = [];
    const completions: Array<(completed: Readonly<ScavengeResult>) => void> = [];
    const game = Game.forTest({
      createScavenge: (_context, onComplete) => {
        const session = new ScavengeSession();
        const createdPhase = phase({ start: vi.fn(() => session.start()) });
        scavengeSessions.push(session);
        scavengePhases.push(createdPhase);
        completions.push(onComplete);
        return createdPhase;
      },
      createSurvival: (_context, result, seed) => {
        const session = new SurvivalSession(result.savedItems, {
          seed,
          initial: { day: 2 },
          initialEventId: 'shower-night',
          random: sequenceRandom([0, 0, 0, 0]),
        });
        survivalSessions.push(session);
        return phase();
      },
    }, { createSeed: vi.fn().mockReturnValueOnce(11).mockReturnValueOnce(12) });

    game.start();
    const scavenge = scavengeSessions[0]!;
    expect(Object.keys(scavenge.snapshot().items)).toHaveLength(expandedCatalog.length);

    for (const instanceId of ['fishingRod-1', 'baitTin-1', 'ductTape-1', 'map-1'] as const) {
      expect(scavenge.pickUp(instanceId)).toBe(true);
      expect(scavenge.saveCarried()).toMatchObject({ instanceId });
    }
    expect(scavenge.evacuate()).toBe(true);

    const result = scavenge.result()!;
    expect(result.savedItems.map(({ instanceId }) => instanceId)).toEqual([
      'ductTape-1', 'fishingRod-1', 'baitTin-1', 'map-1',
    ]);
    completions[0]!(result);

    const survival = survivalSessions[0]!;
    expect(scavengePhases[0]!.dispose).toHaveBeenCalledOnce();
    expect(survival.snapshot().inventory).toMatchObject({
      fishingRod: { instances: [{ instanceId: 'fishingRod-1', condition: 'usable' }] },
      baitTin: { instances: [{ instanceId: 'baitTin-1', condition: 'consumed', charges: 0 }] },
      ductTape: { instances: [{ instanceId: 'ductTape-1', condition: 'usable', charges: 1 }] },
      map: { instances: [{ instanceId: 'map-1', condition: 'usable' }] },
    });

    expect(survival.resolveEventChoice('map')).toMatchObject({
      accepted: true,
      code: 'event-resolved',
    });
    expect(survival.snapshot().inventory.map.instances[0]?.condition).toBe('broken');
    expect(survival.beginDawn()).toMatchObject({ accepted: true, code: 'dawn', cue: 'dawn' });
    expect(survival.snapshot()).toMatchObject({ day: 3, danger: 0 });

    expect(survival.useItem('ductTape', 'map-1')).toMatchObject({
      accepted: true,
      code: 'item-repaired',
    });
    expect(survival.snapshot().inventory.map.instances[0]?.condition).toBe('usable');
    expect(survival.perform('fish', 'useBait')).toMatchObject({
      accepted: true,
      code: 'fish-caught',
      message: 'You caught Cod.',
      deltas: { energy: -2, food: 1, bait: -1 },
    });
    expect(survival.snapshot()).toMatchObject({ day: 3, food: 1, bait: 2, danger: 0 });

    game.restart();

    expect(scavengeSessions).toHaveLength(2);
    expect(scavengeSessions[1]).not.toBe(scavenge);
    expect(scavenge.snapshot()).toMatchObject({
      status: 'success', savedCount: 4, carriedWeight: 0, carriedItems: [],
    });
    const restarted = scavengeSessions[1]!.snapshot();
    expect(restarted).toMatchObject({
      status: 'running', savedCount: 0, carriedWeight: 0, carriedItems: [],
    });
    expect(Object.keys(restarted.items)).toHaveLength(expandedCatalog.length);
    expect(expandedCatalog.every(({ instanceId }) => (
      restarted.items[instanceId]!.status === 'available'
    ))).toBe(true);
    expect(restarted.savedCount).toBe(0);
    game.dispose();
  });

  it('keeps every story-excluded audit entry outside runtime item and event catalogs', () => {
    const storyExcluded = PARITY_AUDIT.filter(({ classification }) => (
      classification === 'story-excluded'
    ));
    const approvedRuntimeIds = new Set(PARITY_AUDIT.filter(({ classification }) => (
      classification === 'included' || classification === 'preserved'
    )).map(({ runtimeId }) => runtimeId).filter((id): id is string => id !== undefined));

    expect(storyExcluded.length).toBeGreaterThan(0);
    expect(storyExcluded.every(({ runtimeId }) => runtimeId === undefined)).toBe(true);
    expect(ITEM_IDS.every((id) => approvedRuntimeIds.has(id))).toBe(true);
    expect(CANONICAL_EVENTS.every(({ id }) => approvedRuntimeIds.has(id))).toBe(true);
  });
});
