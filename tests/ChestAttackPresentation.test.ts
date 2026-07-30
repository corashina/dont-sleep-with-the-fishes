import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { DEFAULT_WAVES } from '../src/ocean/WaveField';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { ChestAttackPresentation } from '../src/survival/ChestAttackPresentation';
import { ChestDisplay } from '../src/survival/ChestDisplay';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const outcome: ActionOutcome = {
  accepted: true,
  code: 'event-resolved',
  message: 'Resolved.',
  deltas: {},
  cue: 'none',
};

function importedChest(): Group {
  const root = new Group();
  root.name = 'event-model:chestClosed';
  const body = new Mesh(
    new BoxGeometry(0.8, 0.4, 0.55),
    new MeshStandardMaterial(),
  );
  body.name = 'chestClosed:base';
  const lid = new Group();
  lid.name = 'chestClosed:lid';
  lid.position.set(0, 0.25, -0.2);
  const lidMesh = new Mesh(
    new BoxGeometry(0.82, 0.22, 0.58),
    new MeshStandardMaterial(),
  );
  lidMesh.name = 'chestClosed:lid-model';
  lid.add(lidMesh);
  root.add(body, lid);
  return root;
}

function createHarness(imported: boolean) {
  const propModels = createTestPropModels();
  if (imported) {
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => (
      id === 'chestClosed'
        ? { root: importedChest(), animations: [] }
        : null
    ));
  } else {
    vi.spyOn(propModels, 'createEventModel').mockReturnValue(null);
  }
  const boat = new Group();
  const supplyDisplay = new BoatSupplyDisplay(propModels, boat, []);
  const sharedChest = new ChestDisplay();
  boat.add(sharedChest.root);
  sharedChest.sync({ state: 'mimic', acquiredDay: 2 });
  const cameraRig = new Group();
  cameraRig.position.set(0.1, 0.2, -0.3);
  cameraRig.rotation.set(0.02, -0.04, 0.01);
  const dependencies: FocusedEventPresentationDependencies = {
    propModels,
    waves: DEFAULT_WAVES,
    cameraRig,
    supplyDisplay,
    chestDisplay: sharedChest,
  };
  const presentation = new ChestAttackPresentation(dependencies);
  const dispose = () => {
    presentation.dispose();
    sharedChest.dispose();
    supplyDisplay.dispose();
    propModels.dispose();
  };
  return {
    boat,
    cameraRig,
    sharedChest,
    presentation,
    dispose,
  };
}

async function finish(
  presentation: ChestAttackPresentation,
  pending: Promise<void>,
  time = 1,
): Promise<void> {
  presentation.update(time, 10);
  await pending;
}

describe('ChestAttackPresentation', () => {
  it('reveals with two rattles and an open authored mouth', async () => {
    const harness = createHarness(false);
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    await finish(harness.presentation, reveal);

    const mimic = harness.boat.getObjectByName('chest-attack-mimic')!;
    expect(harness.presentation.root.userData.revealRattles).toBe(2);
    expect(mimic.userData.mouthOpen).toBe(1);
    expect(mimic.userData.bite).toBeGreaterThan(0);
    expect(mimic.getObjectByName('mimic-mouth-shadow')).toBeDefined();
    expect(mimic.getObjectByName('mimic-gum-upper')).toBeDefined();
    expect(mimic.getObjectByName('mimic-tongue')).toBeDefined();
    expect(
      mimic.children.some(({ name }) => name === 'chest-mimic-parts'),
    ).toBe(true);

    harness.dispose();
  });

  it('closes the lid with the Net before rule resolution', async () => {
    const harness = createHarness(false);
    harness.presentation.stage();
    harness.presentation.settleForVisibilityChange();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;

    const choice = harness.presentation.playChoice({
      choiceId: 'fishingNet',
      instanceId: null,
      condition: null,
    });
    await finish(harness.presentation, choice, 2);

    const mimic = harness.boat.getObjectByName('chest-attack-mimic')!;
    expect(mimic.userData.mouthOpen).toBe(0);
    expect(mimic.userData.bound).toBe(1);
    expect(harness.presentation.root.getObjectByName('chest-attack-net')?.visible)
      .toBe(true);

    harness.dispose();
  });

  it('shows one bite and one strike for Fight', async () => {
    const harness = createHarness(false);
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const choice = harness.presentation.playChoice({
      choiceId: 'fight',
      instanceId: null,
      condition: null,
    });
    harness.presentation.settleForVisibilityChange();
    await choice;
    const reaction = harness.presentation.react({
      eventId: 'chest-attack',
      choiceId: 'fight',
      resultId: 'chest-fight',
    }, outcome);
    await finish(harness.presentation, reaction, 3);

    expect(harness.presentation.root.userData.bites).toBe(1);
    expect(harness.presentation.root.userData.strikes).toBe(1);
    expect(harness.boat.getObjectByName('chest-attack-mimic')?.userData.broken)
      .toBe(1);

    harness.dispose();
  });

  it('lowers the camera before the hidden bite', async () => {
    const harness = createHarness(false);
    const originalY = harness.cameraRig.position.y;
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const choice = harness.presentation.playChoice({
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    await finish(harness.presentation, choice, 2);

    expect(harness.cameraRig.position.y).toBeLessThan(originalY);
    expect(harness.presentation.root.userData.cameraLoweredBeforeBite).toBe(true);
    expect(harness.presentation.root.userData.bites).toBe(0);

    const reaction = harness.presentation.react({
      eventId: 'chest-attack',
      choiceId: 'sleep',
      resultId: 'chest-hide',
    }, outcome);
    await finish(harness.presentation, reaction, 3);
    expect(harness.presentation.root.userData.bites).toBe(1);
    expect(harness.boat.getObjectByName('chest-attack-mimic')?.visible).toBe(false);

    harness.dispose();
  });

  it('routes only the three stable Chest Attack results', async () => {
    const harness = createHarness(false);
    const routes = [
      ['chest-bound', 'held-bound'],
      ['chest-fight', 'held-destroyed'],
      ['chest-hide', 'held-overboard'],
    ] as const;
    for (const [resultId, state] of routes) {
      harness.presentation.stage();
      const reaction = harness.presentation.react({
        eventId: 'chest-attack',
        choiceId: 'test',
        resultId,
      }, outcome);
      harness.presentation.settleForVisibilityChange();
      await reaction;
      expect(harness.presentation.root.userData.state).toBe(state);
      harness.presentation.clear();
    }
    expect(() => harness.presentation.react({
      eventId: 'chest-attack',
      choiceId: 'test',
      resultId: 'tour-chest',
    }, outcome)).toThrow('Unsupported Chest Attack result');

    harness.dispose();
  });

  it('uses imported and procedural Chest forms', () => {
    const selected = createHarness(true);
    const selectedMimic = selected.boat.getObjectByName('chest-attack-mimic')!;
    expect(selectedMimic.userData.modelKind).toBe('imported');
    expect(selectedMimic.getObjectByName('event-model:chestClosed')).toBeDefined();
    expect(selectedMimic.getObjectByName('chest-lid')).toBeDefined();
    selected.dispose();

    const fallback = createHarness(false);
    const fallbackMimic = fallback.boat.getObjectByName('chest-attack-mimic')!;
    expect(fallbackMimic.userData.modelKind).toBe('procedural');
    expect(fallbackMimic.getObjectByName('chest-body')).toBeDefined();
    fallback.dispose();
  });

  it('clear restores camera and shared Chest pose', async () => {
    const harness = createHarness(false);
    const cameraPosition = harness.cameraRig.position.clone();
    const cameraQuaternion = harness.cameraRig.quaternion.clone();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const choice = harness.presentation.playChoice({
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    harness.presentation.settleForVisibilityChange();
    await choice;

    harness.presentation.clear();

    expect(harness.cameraRig.position.toArray()).toEqual(cameraPosition.toArray());
    expect(harness.cameraRig.quaternion.toArray()).toEqual(cameraQuaternion.toArray());
    expect(harness.sharedChest.root.visible).toBe(true);
    expect(harness.sharedChest.root.userData.mouthOpen).toBeCloseTo(0.46);
    expect(harness.boat.getObjectByName('chest-attack-mimic')?.visible).toBe(false);

    harness.dispose();
  });

  it('settles promises and disposes owned mouth and model resources once', async () => {
    const harness = createHarness(true);
    harness.presentation.stage();
    const pending = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await pending;

    const mimic = harness.boat.getObjectByName('chest-attack-mimic')!;
    const mouth = mimic.getObjectByName('mimic-mouth-shadow') as Mesh;
    const model = mimic.getObjectByName('chestClosed:base') as Mesh;
    const mouthDispose = vi.spyOn(mouth.geometry, 'dispose');
    const modelDispose = vi.spyOn(model.geometry, 'dispose');

    harness.presentation.dispose();
    harness.presentation.dispose();

    expect(mouthDispose).toHaveBeenCalledOnce();
    expect(modelDispose).toHaveBeenCalledOnce();
    harness.sharedChest.dispose();
    harness.dispose();
  });

  it('restores arbitrary camera transforms exactly', async () => {
    const harness = createHarness(false);
    const position = new Vector3(2, -1, 4);
    const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.6);
    harness.cameraRig.position.copy(position);
    harness.cameraRig.quaternion.copy(quaternion);
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'sleep',
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
