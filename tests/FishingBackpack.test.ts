import { describe,expect,it } from 'vitest';
import { ITEM_IDS,type ItemId } from '../src/game/ItemState';
import { eligibleFishingCatches,selectFishingCatch } from '../src/survival/fishingCatalog';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument,parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { formatFishingResult } from '../src/survival/SurvivalFishingFlow';
import { createJournalEntry } from '../src/survival/journalRecords';
import { journalItemChanges } from '../src/survival/journalItemChanges';

describe('fishing backpack', () => {
  it.each(['map'] as const)('settles and saves a missing %s exactly once', (missing) => {
    const saved = ITEM_IDS.filter((id) => id !== missing)
      .map((type) => ({ type, instanceId: `${type}-1` as const }));
    const session = new SurvivalSession(saved, {
      seed: 24, initialConditions: { 'compass-1': 'broken' },
    });
    const before = session.snapshot();
    const started = session.beginFishing();
    if (!started.accepted) throw new Error('Fishing unavailable');
    const attempt = started.attempt;
    attempt.cast({ x: 4, z: -2 });
    attempt.completeCast();
    attempt.advance(attempt.snapshot().biteDelaySeconds);
    const result = attempt.reel().result!;
    attempt.completeReel();
    const outcome = session.finishFishing(attempt.snapshot().id, result);
    expect(result).toMatchObject({ catch: { id: 'backpack', reward: { itemId: missing } } });
    expect(session.snapshot().inventory[`${missing}-1`]?.condition).toBe('usable');
    expect(session.snapshot().inventory['compass-1']?.condition).toBe('broken');
    expect(formatFishingResult(result, outcome).items).toEqual([{ itemId: missing, quantity: 1, condition: 'usable' }]);
    expect(session.snapshot().food).toBe(before.food);
    expect(session.snapshot().bait).toBe(before.bait);
    expect(session.snapshot().recoveredFood).toBe(before.recoveredFood);
    expect(session.snapshot().recoveredBait).toBe(before.recoveredBait);
    expect(session.finishFishing(attempt.snapshot().id, result).accepted).toBe(false);
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 0, session: session.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(restored.snapshot()).toEqual(session.snapshot());
    const entry = createJournalEntry(1, 'calm', restored.exportCheckpoint().pendingJournalActions, null, { kind: 'quiet' });
    expect(journalItemChanges(entry).day.map(({ itemId, kind }) => ({ itemId, kind })))
      .toEqual([{ itemId: missing, kind: 'gain' }]);
  });

  it('only awards the missing item and disappears when all eligible items are present', () => {
    const present = new Set<ItemId>(ITEM_IDS.filter((id) => id !== 'map'));
    for (const roll of [0.90, 0.95, 0.999999]) {
      expect(selectFishingCatch(3, true, roll, present).reward).toMatchObject({ itemId: 'map' });
    }
    present.add('map');
    expect(eligibleFishingCatches(3, true, present).some((entry) => entry.catch.id === 'backpack')).toBe(false);
    expect(selectFishingCatch(3, true, 0.999999, present).id).not.toBe('backpack');
  });
});
