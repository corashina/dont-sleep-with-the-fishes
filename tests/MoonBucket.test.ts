// Importance: 95/100. Protects bucket eligibility, inventory, and the saved dawn result.
import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';

describe('Face on the Moon bucket choice', () => {
  it('keeps the bucket usable and wakes with two energy after saving', () => {
    const session = new SurvivalSession([{ type: 'bucket', instanceId: 'bucket-1' }], {
      seed: 41, initialEventId: 'face-on-the-moon',
    });
    expect(session.resolveEvent({ kind: 'item', choiceId: 'bucket', instanceId: 'bucket-1' }))
      .toMatchObject({ accepted: true, nextDawnEnergy: 2 });
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');

    const restored = SurvivalSession.restore(session.exportCheckpoint());
    expect(restored.beginDawn().accepted).toBe(true);
    expect(restored.snapshot().energy).toBe(2);
    expect(restored.snapshot().inventory['bucket-1']?.condition).toBe('usable');
  });

  it.each(['missing', 'broken'] as const)('rejects a %s bucket without changing the event', (condition) => {
    const session = new SurvivalSession(
      condition === 'missing' ? [] : [{ type: 'bucket', instanceId: 'bucket-1' }],
      {
        seed: 41, initialEventId: 'face-on-the-moon',
        initialConditions: condition === 'broken' ? { 'bucket-1': 'broken' } : {},
      },
    );
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'item', choiceId: 'bucket', instanceId: 'bucket-1' }).accepted)
      .toBe(false);
    expect(session.snapshot()).toEqual(before);
  });
});
