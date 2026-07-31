import { describe, expect, it, vi } from 'vitest';
import {
  Group,
  Mesh,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';
import { DEFAULT_WAVES } from '../src/ocean/WaveField';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { ChestDisplay } from '../src/survival/ChestDisplay';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { MidnightTourPresentation } from '../src/survival/MidnightTourPresentation';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const outcome: ActionOutcome = {
  accepted: true,
  code: 'event-resolved',
  message: 'Resolved.',
  deltas: {},
  cue: 'none',
};

function createHarness(withEventModels = true) {
  const propModels = createTestPropModels();
  if (!withEventModels) {
    vi.spyOn(propModels, 'createEventModel').mockReturnValue(null);
  }
  const boat = new Group();
  const supplyDisplay = new BoatSupplyDisplay(propModels, boat, []);
  const chestDisplay = new ChestDisplay();
  boat.add(chestDisplay.root);
  const cameraRig = new Group();
  cameraRig.position.set(0.1, 0.2, -0.3);
  cameraRig.rotation.set(0.02, -0.04, 0.01);
  const dependencies: FocusedEventPresentationDependencies = {
    propModels,
    waves: DEFAULT_WAVES,
    cameraRig,
    supplyDisplay,
    chestDisplay,
  };
  const presentation = new MidnightTourPresentation(dependencies);
  const dispose = () => {
    presentation.dispose();
    chestDisplay.dispose();
    supplyDisplay.dispose();
    propModels.dispose();
  };
  return {
    cameraRig,
    presentation,
    dispose,
  };
}

async function finish(
  presentation: MidnightTourPresentation,
  pending: Promise<void>,
  time = 1,
): Promise<void> {
  presentation.update(time, 10);
  await pending;
}

describe('MidnightTourPresentation', () => {
  it('raises the selected island and dead tree behind one wave', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const island = harness.presentation.root.getObjectByName('midnight-tour-island')!;
    const hiddenY = island.position.y;
    const reveal = harness.presentation.reveal();
    await finish(harness.presentation, reveal);

    expect(island.position.y).toBeGreaterThan(hiddenY);
    expect(island.getObjectByName('event-model:midnightIsland')).toBeDefined();
    expect(island.getObjectByName('event-model:deadTree')).toBeDefined();
    expect(harness.presentation.root.getObjectByName('midnight-tour-horizon-wave'))
      .toBeDefined();
    expect(island.getObjectByName('midnight-tour-rock-shelf-1')).toBeDefined();
    expect(island.getObjectByName('midnight-tour-shore-light')).toBeDefined();
    expect(
      (island.getObjectByName('midnight-tour-shore-light') as PointLight).intensity,
    ).toBeGreaterThan(2);
    expect(island.getObjectByName('midnight-tour-moon-fill')).toBeDefined();
    expect(harness.presentation.interactionTargets()).toMatchObject([{
      id: 'midnight-tour:island',
      choiceId: 'visit',
      root: island,
    }]);

    harness.dispose();
  });

  it('moves the island behind the boat when the player sails on', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const island = harness.presentation.root.getObjectByName('midnight-tour-island')!;
    const choice = harness.presentation.playChoice({
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    await finish(harness.presentation, choice, 2);

    expect(island.position.z).toBeGreaterThan(0);
    expect(harness.presentation.root.userData.state).toBe('choice-passed');

    harness.dispose();
  });

  it('uses exactly three approach beats for Visit', async () => {
    const harness = createHarness();
    const originalQuaternion = harness.cameraRig.quaternion.clone();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    harness.presentation.update(1, 0.51);
    harness.presentation.update(2, 0.51);
    harness.presentation.update(3, 0.51);
    await choice;

    expect(harness.presentation.root.userData.approachBeats).toBe(3);
    expect(harness.presentation.root.userData.approachDistance).toBeCloseTo(3.6);
    expect(harness.cameraRig.position.z).toBeLessThan(-3);
    expect(harness.cameraRig.quaternion.toArray())
      .not.toEqual(originalQuaternion.toArray());

    harness.dispose();
  });

  it('lands one selected Chest during the chest result', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    expect(harness.presentation.root.getObjectByName('midnight-tour-reward-chest'))
      .toBeUndefined();
    const reaction = harness.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-chest',
    }, outcome);
    const actor = harness.presentation.root
      .getObjectByName('midnight-tour-reward-chest')!;
    expect(actor.getObjectByName('event-model:chestClosed')).toBeDefined();
    await finish(harness.presentation, reaction);

    expect(harness.presentation.root.userData.rewardLandings).toBe(1);
    expect(actor.position.z).toBeGreaterThan(-2);

    harness.dispose();
  });

  it('scatters Bait tokens and holds their result pose', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reaction = harness.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-bait',
    }, outcome);
    await finish(harness.presentation, reaction);

    const actor = harness.presentation.root
      .getObjectByName('midnight-tour-reward-bait')!;
    expect(actor.children).toHaveLength(4);
    expect(actor.userData.scatterCount).toBe(4);
    expect(new Set(actor.children.map(({ position }) => position.x))).toHaveProperty('size', 4);
    expect(harness.presentation.root.userData.state).toBe('held-bait');

    harness.dispose();
  });

  it('drops one creature and kicks the camera for attack', async () => {
    const harness = createHarness();
    const originalQuaternion = harness.cameraRig.quaternion.clone();
    harness.presentation.stage();
    const reaction = harness.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-attack',
    }, outcome);
    harness.presentation.update(1, 0.65);

    const creatures = harness.presentation.root.children.flatMap((root) => (
      root.getObjectByName('midnight-tour-creature') === undefined
        ? []
        : [root.getObjectByName('midnight-tour-creature')!]
    ));
    expect(creatures).toHaveLength(1);
    expect(harness.presentation.root.userData.cameraKicks).toBe(1);
    expect(harness.cameraRig.quaternion.toArray())
      .not.toEqual(originalQuaternion.toArray());

    harness.presentation.settleForVisibilityChange();
    await reaction;
    harness.dispose();
  });

  it('keeps the island fixed instead of applying lifeboat wave bobbing', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const island = harness.presentation.root.getObjectByName('midnight-tour-island')!;
    const position = island.position.clone();
    const quaternion = island.quaternion.clone();

    harness.presentation.update(100, 0.5);
    harness.presentation.update(200, 0.5);

    expect(island.position.toArray()).toEqual(position.toArray());
    expect(island.quaternion.toArray()).toEqual(quaternion.toArray());
    expect(island.userData.motionSource).toBe('fixed');

    harness.dispose();
  });

  it('uses procedural island and tree fallbacks when models are missing', () => {
    const harness = createHarness(false);
    const island = harness.presentation.root.getObjectByName('midnight-tour-island')!;
    expect(island.userData.islandModel).toBe('procedural');
    expect(island.getObjectByName('midnight-tour-island-fallback')).toBeDefined();
    expect(island.getObjectByName('midnight-tour-tree-fallback-trunk')).toBeDefined();
    harness.dispose();
  });

  it('handles the defensive Food fallback with one Food actor', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reaction = harness.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-food-fallback',
    }, outcome);
    await finish(harness.presentation, reaction);

    const food = harness.presentation.root
      .getObjectByName('midnight-tour-reward-food')!;
    expect(food).toBeDefined();
    expect(
      harness.presentation.root.getObjectByName('midnight-tour-result-actors')?.children,
    ).toHaveLength(1);
    expect(harness.presentation.root.userData.state).toBe('held-food');

    harness.dispose();
  });

  it('settles active promises and restores the camera on clear', async () => {
    const harness = createHarness();
    const position = harness.cameraRig.position.clone();
    const quaternion = harness.cameraRig.quaternion.clone();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    harness.presentation.settleForVisibilityChange();
    await choice;
    harness.presentation.clear();

    expect(harness.cameraRig.position.toArray()).toEqual(position.toArray());
    expect(harness.cameraRig.quaternion.toArray()).toEqual(quaternion.toArray());
    expect(harness.presentation.root.visible).toBe(false);

    harness.dispose();
  });

  it('clears reward resources and disposes static resources exactly once', () => {
    const harness = createHarness();
    harness.presentation.stage();
    void harness.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'tour-attack',
    }, outcome);
    const creatureBody = harness.presentation.root
      .getObjectByName('midnight-tour-creature-body') as Mesh;
    const islandMesh = harness.presentation.root
      .getObjectByName('midnight-tour-rock-shelf-1') as Mesh;
    const creatureDispose = vi.spyOn(creatureBody.geometry, 'dispose');
    const islandDispose = vi.spyOn(islandMesh.geometry, 'dispose');

    harness.presentation.clear();
    harness.presentation.clear();
    expect(creatureDispose).toHaveBeenCalledOnce();

    harness.presentation.dispose();
    harness.presentation.dispose();
    expect(islandDispose).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('routes only stable Midnight Tour result IDs', () => {
    const harness = createHarness();
    harness.presentation.stage();
    expect(() => harness.presentation.react({
      eventId: 'midnight-tour',
      choiceId: 'visit',
      resultId: 'chest-fight',
    }, outcome)).toThrow('Unsupported Midnight Tour result');
    harness.dispose();
  });

  it('restores an arbitrary camera transform exactly', async () => {
    const harness = createHarness();
    const position = new Vector3(2, -1, 4);
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4);
    harness.cameraRig.position.copy(position);
    harness.cameraRig.quaternion.copy(quaternion);
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    });
    harness.presentation.settleForVisibilityChange();
    await choice;
    harness.presentation.clear();
    expect(harness.cameraRig.position.toArray()).toEqual(position.toArray());
    expect(harness.cameraRig.quaternion.toArray()).toEqual(quaternion.toArray());
    harness.dispose();
  });
});
