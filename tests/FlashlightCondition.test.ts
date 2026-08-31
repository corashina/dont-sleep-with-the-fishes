import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  createSurvivalSaveDocument,
  parseSurvivalSaveDocument,
} from '../src/survival/SurvivalSaveData';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
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

  it('removes both diving bonuses while Flashlight is broken', () => {
    const balance = SURVIVAL_BALANCE.diving;
    const rolls = [
      (balance.success + balance.flashlightSuccess) / 2,
      (balance.injury + balance.flashlightInjury) / 2,
      0,
    ];
    const dive = (condition: 'usable' | 'broken') => {
      const session = new SurvivalSession([
        flashlight, { instanceId: 'scubaSet-1', type: 'scubaSet' },
      ], {
        seed: 42, weather: 'calm', random: sequenceRandom(rolls),
        initialConditions: { 'flashlight-1': condition },
      });
      return { outcome: session.perform('dive'), snapshot: session.snapshot() };
    };
    const usable = dive('usable');
    const broken = dive('broken');
    expect(usable.outcome).toMatchObject({ accepted: true, code: 'dive-recovered' });
    expect(broken.outcome).toMatchObject({ accepted: true, code: 'dive-empty' });
    expect(broken.snapshot.health).toBe(usable.snapshot.health - balance.injuryDamage);
  });
});
