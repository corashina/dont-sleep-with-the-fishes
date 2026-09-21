import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  createSurvivalSaveDocument,
  parseSurvivalSaveDocument,
} from '../src/survival/SurvivalSaveData';

const flashlight = { instanceId: 'flashlight-1', type: 'flashlight' } as const;

describe('Flashlight condition', () => {
  it('keeps a broken Flashlight through save parsing and checkpoint restore', () => {
    const session = new SurvivalSession([flashlight], { seed: 42 });
    expect(session.setItemConditionForLab(flashlight.instanceId, 'broken')).toBe(true);
    const document = createSurvivalSaveDocument({
      scavengeElapsedSeconds: 12,
      session: session.exportCheckpoint(),
    });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(restored.snapshot().inventory[flashlight.instanceId]?.condition).toBe('broken');
  });

  it('rejects a broken Flashlight as an event response', () => {
    const session = new SurvivalSession([flashlight], {
      seed: 42, initialConditions: { 'flashlight-1': 'broken' }, initialEventId: 'death-stare',
    });
    const before = session.snapshot();
    expect(session.resolveEvent({
      kind: 'item', choiceId: 'flashlight', instanceId: flashlight.instanceId,
    })).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(session.snapshot()).toEqual(before);
  });

});
