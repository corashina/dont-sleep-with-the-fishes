import { describe, expect, it } from 'vitest';
import { survivalEventById } from '../src/survival/eventCatalog';
import {
  createEventItemUseSample,
  resolveEventItemUseContext,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';
import {
  identitySnatcherSample,
  sampleSnatcherItemUse,
} from '../src/survival/events/snatcherChoreography';

describe('Knife survival item', () => {

  it('always saves a Tentacle Attack target', () => {
    const choice = survivalEventById('snatcher')?.choices.find(({ id }) => id === 'knife');

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          weight: 1,
          message: 'You cut the tentacle. The supply stays aboard.',
          effects: {},
        },
      ],
    });
  });

  it('can repel the shark swarm with an 80 percent success chance', () => {
    const choice = survivalEventById('swarm-of-sharks')?.choices.find(
      ({ id }) => id === 'knife',
    );

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          weight: 80,
          message: 'You drive the sharks away from the boat.',
          effects: {},
        },
        {
          weight: 20,
          message: 'The knife breaks as a shark bites you.',
          effects: {
            resources: [{ operation: 'subtract', resource: 'health', value: 20 }],
            items: [{ kind: 'break', itemId: 'knife', quantity: 1 }],
          },
        },
      ],
    });
  });

  it('can guard Check the Back without losing the fish reward', () => {
    const choice = survivalEventById('check-the-back')?.choices.find(
      ({ id }) => id === 'knife',
    );

    expect(choice).toEqual({
      id: 'knife',
      label: 'Use Knife',
      itemId: 'knife',
      outcomes: [
        {
          resultId: 'check-the-back.fish',
          weight: 80,
          message: 'You cut up the fish before it flops overboard.',
          presentationKey: 'check-the-back.fish',
          effects: {
            resources: [{ operation: 'add', resource: 'food', value: 1 }],
          },
        },
        {
          resultId: 'check-the-back.bad',
          weight: 20,
          message: 'The anglerfish bites the knife instead. The blade snaps.',
          presentationKey: 'check-the-back.bad',
          effects: {
            items: [{ kind: 'break', itemId: 'knife', quantity: 1 }],
          },
        },
      ],
    });
  });

  it('uses a visible one-handed stab', () => {
    expect(resolveEventItemUseContext('snatcher', 'knife', 'knife')).toBe('knife-stab');
    expect(resolveEventItemUseContext('swarm-of-sharks', 'knife', 'knife'))
      .toBe('knife-stab');
    expect(resolveEventItemUseContext('check-the-back', 'knife', 'knife'))
      .toBe('knife-stab');

    const ready = createEventItemUseSample();
    sampleEventItemUse('knife-stab', 'knife', 0.4, ready);

    expect(ready.itemVisible).toBe(true);
    expect(ready.viewX).toBeGreaterThan(0.3);
    expect(ready.viewY).toBeLessThan(-0.25);
    expect(ready.pitch).toBeGreaterThan(0.25);
    expect(ready.roll).toBeLessThan(-0.4);
    expect(ready.targetBlend).toBe(0);
    expect(ready.aimBlend).toBe(0);
  });

  it('uses the point of the knife as its aim direction', () => {
    expect(eventItemMotionProfile('knife').forward).toEqual([1, 0, 0]);
  });

  it('finishes aiming before moving and stays aimed during retraction', () => {
    const pointed = createEventItemUseSample();
    const moving = createEventItemUseSample();
    const retracting = createEventItemUseSample();
    const returnedToGrip = createEventItemUseSample();

    sampleEventItemUse('knife-stab', 'knife', 0.5, pointed);
    sampleEventItemUse('knife-stab', 'knife', 0.53, moving);
    sampleEventItemUse('knife-stab', 'knife', 0.8, retracting);
    sampleEventItemUse('knife-stab', 'knife', 0.94, returnedToGrip);

    expect(pointed.aimBlend).toBe(1);
    expect(pointed.targetBlend).toBe(0);
    expect(moving.aimBlend).toBe(1);
    expect(moving.targetBlend).toBeGreaterThan(0);
    expect(retracting.aimBlend).toBe(1);
    expect(retracting.targetBlend).toBeGreaterThan(0);
    expect(returnedToGrip.aimBlend).toBe(0);
    expect(returnedToGrip.targetBlend).toBe(0);
  });

  it('stabs the active target on a raised arc', () => {
    const ready = createEventItemUseSample();
    const contact = createEventItemUseSample();

    sampleEventItemUse('knife-stab', 'knife', 0.4, ready);
    sampleEventItemUse('knife-stab', 'knife', 0.7, contact);

    expect(contact.targetBlend).toBeGreaterThan(0.9);
    expect(contact.cameraTargetBlend).toBe(0);
    expect(contact.ballisticFlight).toBe(false);
    expect(contact.flightArc).toBeGreaterThan(0);
    expect(contact.flightArcHeight).toBeGreaterThan(0.4);
    expect(contact.minimumLiftY).toBeGreaterThan(0.4);
    expect(contact.aimBlend).toBeGreaterThan(0.9);
    expect(contact.viewZ).toBeGreaterThan(-0.7);
    expect(contact.itemVisible).toBe(true);
    expect(Math.abs(contact.yaw - ready.yaw)).toBeLessThan(0.05);
    expect(Math.abs(contact.pitch - ready.pitch)).toBeLessThan(0.05);
    expect(Math.abs(contact.roll - ready.roll)).toBeLessThan(0.05);
  });

  it('keeps target travel smooth and above the gunwale', () => {
    let previousTargetBlend = 0;
    let previousAimBlend = 0;
    for (let frame = 0; frame <= 240; frame += 1) {
      const sample = createEventItemUseSample();
      sampleEventItemUse('knife-stab', 'knife', frame / 240, sample);

      expect(Math.abs(sample.targetBlend - previousTargetBlend)).toBeLessThan(0.08);
      expect(Math.abs(sample.aimBlend - previousAimBlend)).toBeLessThan(0.08);
      if (sample.targetBlend > 0) {
        expect(sample.aimBlend).toBe(1);
        expect(sample.minimumLiftY).toBeGreaterThan(0.4);
      }
      previousTargetBlend = sample.targetBlend;
      previousAimBlend = sample.aimBlend;
    }
  });

  it('retracts to the same grip and pauses before returning to the boat', () => {
    const useEnd = createEventItemUseSample();
    const outcomeStart = createEventItemUseSample();
    const handPause = createEventItemUseSample();
    const returnMotion = createEventItemUseSample();

    sampleEventItemUse('knife-stab', 'knife', 1, useEnd);
    sampleEventItemOutcome('knife-stab', 'knife', 'recover', 0, outcomeStart);
    sampleEventItemOutcome('knife-stab', 'knife', 'recover', 0.12, handPause);
    sampleEventItemOutcome('knife-stab', 'knife', 'recover', 0.4, returnMotion);

    expect(outcomeStart).toEqual(useEnd);
    expect(handPause).toEqual(useEnd);
    expect(returnMotion.cameraSpaceBlend).toBeLessThan(1);
    expect(useEnd.targetBlend).toBe(0);
    expect(useEnd.aimBlend).toBe(0);
  });

  it('returns usable and broken knives through the same exact motion', () => {
    const usable = createEventItemUseSample();
    const broken = createEventItemUseSample();

    sampleEventItemOutcome('knife-stab', 'knife', 'recover', 0.55, usable);
    sampleEventItemOutcome('knife-stab', 'knife', 'broken', 0.55, broken);

    expect(broken).toEqual(usable);

    sampleEventItemOutcome('knife-stab', 'knife', 'recover', 1, usable);
    sampleEventItemOutcome('knife-stab', 'knife', 'broken', 1, broken);

    expect(broken).toEqual(usable);
    expect(usable.cameraSpaceBlend).toBe(0);
    expect(usable.yaw).toBe(0);
    expect(usable.pitch).toBe(0);
    expect(usable.roll).toBe(0);
    expect(usable.itemVisible).toBe(true);
  });

  it('makes the tentacle recoil when the knife connects', () => {
    const contact = identitySnatcherSample();

    expect(sampleSnatcherItemUse('knife', 0.7, contact)).toBe(true);
    expect(contact.recoilStrength).toBeGreaterThan(0.95);
    expect(Math.abs(contact.creatureX)).toBeGreaterThan(0.1);
    expect(Math.abs(contact.creatureRoll)).toBeGreaterThan(0.1);
  });
});
