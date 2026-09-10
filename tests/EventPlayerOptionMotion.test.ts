import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createEventItemUseSample, eventItemActionCueProgresses, eventItemUseDurationForItem,
  resolveEventItemUseContext, sampleEventItemOutcome, sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import {
  identitySnatcherSample, sampleSnatcherItemUse, snatcherItemDuration,
} from '../src/survival/events/snatcherChoreography';
import {
  createSwarmSample, createSwarmSharkPose, createSwarmVariants,
  sampleSwarmReaction, sampleSwarmSharkPose, SWARM_DISTRACTION_TARGET,
} from '../src/survival/events/sharkSwarmChoreography';
import { createUnderUsPose, sampleUnderUsReaction } from '../src/survival/events/underUsChoreography';
import { OtherPeoplePresentation } from '../src/survival/OtherPeoplePresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';

describe('event option motion', () => {
  it('synchronizes the net strike and tentacle recoil at contact', () => {
    expect(resolveEventItemUseContext('snatcher', 'fishingNet', 'fishingNet')).toBe('net-slap');
    expect(snatcherItemDuration('fishingNet')).toBe(eventItemUseDurationForItem('net-slap', 'fishingNet'));
    const contact = eventItemActionCueProgresses('net-slap')[0]! + 0.012;
    const creature = identitySnatcherSample();
    const net = createEventItemUseSample();
    sampleSnatcherItemUse('fishingNet', contact, creature);
    sampleEventItemUse('net-slap', 'fishingNet', contact, net);
    expect(creature.recoilStrength).toBeGreaterThan(0.9);
    expect(net.primaryEffect).toBeCloseTo(creature.recoilStrength);
  });

  it('moves every shark to the thrown Food without showing a fish reward or attack', () => {
    const sample = createSwarmSample();
    sampleSwarmReaction({ attacked: false, foodDelta: -2, baitDelta: 0, brokenItem: false }, 1, sample);
    expect(sample.attack).toBe(0);
    expect(sample.catchStrength).toBe(0);
    const pose = createSwarmSharkPose();
    for (const variant of createSwarmVariants(41)) {
      sampleSwarmSharkPose(variant, 8, sample, pose);
      expect(Math.abs(pose.x - SWARM_DISTRACTION_TARGET.x)).toBeLessThan(1);
      expect(Math.abs(pose.z - SWARM_DISTRACTION_TARGET.z)).toBeLessThan(2);
    }
  });

  it('moves the shadow toward Food without the flashlight impact', () => {
    const food = createUnderUsPose();
    const bait = createUnderUsPose();
    sampleUnderUsReaction('cannedFood', 0.8, food);
    sampleUnderUsReaction('baitTin', 0.8, bait);
    expect(food).toEqual(bait);
    expect(food.x).toBeGreaterThan(0);
    expect(food.roll).toBe(0);
    expect(food.light).toBe(0);
  });

  it('presses Tape toward supplies and hides it after consumption', () => {
    expect(resolveEventItemUseContext('windy-night', 'ductTape', 'ductTape')).toBe('tape-secure');
    const sample = createEventItemUseSample();
    sampleEventItemUse('tape-secure', 'ductTape', 0.8, sample);
    expect(sample.targetBlend).toBeGreaterThan(0.5);
    expect(sample.effectKind).toBe('tape');
    expect(sample.ballisticFlight).toBe(false);
    sampleEventItemOutcome('tape-secure', 'ductTape', 'depart', 0, sample);
    expect(sample.itemVisible).toBe(false);
    expect(sample.cameraTargetBlend).toBeCloseTo(0.65);
    sampleEventItemOutcome('tape-secure', 'ductTape', 'depart', 0.5, sample);
    expect(sample.cameraTargetBlend).toBeCloseTo(0.325);
    sampleEventItemOutcome('tape-secure', 'ductTape', 'depart', 1, sample);
    expect(sample.cameraTargetBlend).toBe(0);
    expect(sample.itemVisible).toBe(false);
  });

  it('routes a Radio call separately from dawn reception and restores its pose', () => {
    expect(resolveEventItemUseContext('other-people', 'radio', 'radio')).toBe('radio-call');
    expect(resolveEventItemUseContext('item-animation-lab', 'radioSignal', 'radio')).toBe('radio-signal-receive');
    const sample = createEventItemUseSample();
    sampleEventItemUse('radio-call', 'radio', 0.8, sample);
    expect(sample.itemVisible).toBe(true);
    sampleEventItemOutcome('radio-call', 'radio', 'recover', 1, sample);
    expect(sample.cameraSpaceBlend).toBe(0);
    expect(sample.cameraYaw).toBeCloseTo(0);
  });
});

describe('Other People Radio reply', () => {
  it('flashes a reply, keeps cruising, and clears without entering rescue', async () => {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(2, 2, 5), new MeshStandardMaterial()));
    const presentation = new OtherPeoplePresentation({
      camera: new PerspectiveCamera(55, 1, 0.1, 1000),
      propModels: { createEventModel: () => ({ root: model }) },
      supplyDisplay: { releaseEventActor: vi.fn(), clearEventPose: vi.fn() },
    } as unknown as FocusedEventPresentationDependencies);
    presentation.stage();
    await presentation.playChoice({ choiceId: 'radio', instanceId: 'radio-1', condition: 'usable' });
    const result = { eventId: 'other-people', choiceId: 'radio', resultId: 'people-signaled' };
    const reply = presentation.react(result, {
      accepted: true, code: 'event', message: '', deltas: { rescueLead: 5 }, cue: 'sighting',
    });
    const beacon = presentation.root.getObjectByName('other-people-horizon-light-starboard')!;
    const light = beacon.children.find((object) => object instanceof Mesh) as Mesh;
    const material = light.material as MeshStandardMaterial;
    const before = material.emissiveIntensity;
    presentation.update(0.56, 0.56);
    expect(material.emissiveIntensity).toBeGreaterThan(before);
    expect(presentation.root.userData.answerPulses).toBe(1);
    presentation.settleForVisibilityChange();
    await reply;
    expect(presentation.root.userData.state).toBe('signal-sent');
    expect(presentation.root.userData.courseTurns).toBe(0);
    presentation.clear();
    expect(presentation.root.visible).toBe(false);
    expect(presentation.root.userData.holdOnClear).toBe(false);
    presentation.dispose();
  });
});
