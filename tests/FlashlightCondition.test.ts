import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  createSurvivalSaveDocument,
  parseSurvivalSaveDocument,
} from '../src/survival/SurvivalSaveData';
import { sequenceRandom } from './helpers/random';

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

  it('repairs a broken Flashlight with Duct Tape', () => {
    const session = new SurvivalSession([
      flashlight, { instanceId: 'ductTape-1', type: 'ductTape' },
    ], { seed: 42, initialConditions: { 'flashlight-1': 'broken' } });
    expect(session.perform('repairItem', {
      kind: 'itemRepair', target: flashlight.instanceId,
    })).toMatchObject({ accepted: true, code: 'item-repaired' });
    expect(session.snapshot().inventory[flashlight.instanceId]?.condition).toBe('usable');
    expect(session.snapshot().inventory['ductTape-1']?.condition).toBe('consumed');
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

  it.each([
    [0.7, 0.2, 0],
    [0.6, 0.2, 0.5, 0, 0.95],
  ])('keeps dive results identical with usable, broken, or absent Flashlight (%s)', (...rolls) => {
    const dive = (condition?: 'usable' | 'broken') => {
      const session = new SurvivalSession([
        ...(condition ? [flashlight] : []), { instanceId: 'scubaSet-1', type: 'scubaSet' },
      ], {
        seed: 42, weather: 'calm', random: sequenceRandom(rolls),
        initialConditions: condition ? { 'flashlight-1': condition } : {},
      });
      return session.perform('dive');
    };
    expect(dive('usable')).toEqual(dive());
    expect(dive('broken')).toEqual(dive());
  });
});
