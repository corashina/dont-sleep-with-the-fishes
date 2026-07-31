import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type {
  ItemId,
  ItemInstanceId,
} from '../src/game/ItemState';
import { DEFAULT_WAVES } from '../src/ocean/WaveField';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { ChestDisplay } from '../src/survival/ChestDisplay';
import type {
  FocusedEventPresentationDependencies,
} from '../src/survival/FocusedEventPresentation';
import { HandymanPresentation } from '../src/survival/HandymanPresentation';
import type {
  ActionOutcome,
  SurvivalInventorySnapshot,
  SurvivalSnapshot,
} from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const ITEM_PAYMENTS = [
  'spyglass',
  'flashlight',
  'flareGun',
  'harpoonGun',
  'scubaSet',
  'medicalKit',
  'fishingNet',
  'bucket',
  'ductTape',
  'energyBar',
  'anchor',
] as const satisfies readonly ItemId[];

const outcome: ActionOutcome = {
  accepted: true,
  code: 'event-resolved',
  message: 'Resolved.',
  deltas: {},
  cue: 'none',
};

function inventory(): SurvivalInventorySnapshot {
  return Object.fromEntries(ITEM_PAYMENTS.map((type) => {
    const instanceId = `${type}-1` as ItemInstanceId;
    return [instanceId, {
      instanceId,
      type,
      condition: 'usable' as const,
    }];
  }));
}

function snapshot(): SurvivalSnapshot {
  return {
    state: 'nightEvent',
    day: 24,
    pressure: 3,
    health: 100,
    hunger: 10,
    energy: 2,
    hull: 100,
    food: 2,
    bait: 2,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 1,
    rescueProgress: 0,
    chest: { state: 'closed', acquiredDay: 4 },
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: inventory(),
    savedItems: [],
    pendingEventId: 'handyman',
    pendingDriftingLootVariant: null,
    lastOutcome: null,
    seed: 8,
  };
}

function createSkinnedBody(
  name: string,
  skeleton: Skeleton,
): SkinnedMesh {
  const geometry = new BoxGeometry(1.1, 0.22, 0.75);
  const vertexCount = geometry.getAttribute('position').count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) {
    skinWeights[index * 4] = 1;
  }
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(skinWeights, 4),
  );
  const body = new SkinnedMesh(
    geometry,
    new MeshStandardMaterial(),
  );
  body.name = name;
  body.bind(skeleton);
  return body;
}

function riggedHand(options: {
  readonly disconnected?: boolean;
  readonly unbound?: boolean;
  readonly sharedSkeletonMeshes?: boolean;
} = {}): Group {
  const root = new Group();
  root.name = 'event-model:riggedHand';
  const handMain = new Bone();
  handMain.name = 'HandMain';
  root.add(handMain);
  const bones: Bone[] = [handMain];
  const names = [
    ['ThumbRoot', 'ThumbMiddle', 'ThumbTop'],
    ['IndexF_lower', 'IndexF_middle', 'IndexF_tip'],
    ['MiddleF_lower', 'MiddleF_middle', 'MiddleF_tip'],
    ['RingF_lower', 'RingF_middle', 'RingF_tip'],
    ['PinkyF_lower', 'PinkyF_middle', 'PinkyF_tip'],
  ] as const;
  for (const chain of names) {
    let parent: Bone | Group = handMain;
    for (const name of chain) {
      const joint = new Bone();
      joint.name = name;
      if (options.disconnected === true) root.add(joint);
      else parent.add(joint);
      bones.push(joint);
      parent = joint;
    }
  }
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(
    options.unbound === true ? [handMain] : bones,
  );
  root.add(createSkinnedBody('rigged-hand-test-mesh', skeleton));
  if (options.sharedSkeletonMeshes === true) {
    root.add(createSkinnedBody('rigged-hand-test-mesh-2', skeleton));
  }
  return root;
}

function createHarness(options: {
  readonly importedHand?: boolean;
  readonly invalidHand?: boolean;
  readonly disconnectedHand?: boolean;
  readonly unboundHand?: boolean;
  readonly sharedSkeletonMeshes?: boolean;
} = {}) {
  const propModels = createTestPropModels();
  if (
    options.importedHand === true
    || options.invalidHand === true
    || options.disconnectedHand === true
    || options.unboundHand === true
  ) {
    const createEventModel = propModels.createEventModel.bind(propModels);
    vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => {
      if (id !== 'riggedHand') return createEventModel(id);
      return {
        root: options.invalidHand === true
          ? new Group()
          : riggedHand({
            disconnected: options.disconnectedHand,
            unbound: options.unboundHand,
            sharedSkeletonMeshes: options.sharedSkeletonMeshes,
          }),
        animations: [],
      };
    });
  }
  const boat = new Group();
  const supplyDisplay = new BoatSupplyDisplay(propModels, boat, []);
  supplyDisplay.sync(snapshot());
  const chestDisplay = new ChestDisplay();
  boat.add(chestDisplay.root);
  chestDisplay.sync({ state: 'closed', acquiredDay: 4 });
  const cameraRig = new Group();
  cameraRig.position.set(0.15, 0.22, -0.31);
  cameraRig.rotation.set(0.03, -0.05, 0.01);
  cameraRig.add(new PerspectiveCamera());
  const dependencies: FocusedEventPresentationDependencies = {
    propModels,
    waves: DEFAULT_WAVES,
    cameraRig,
    supplyDisplay,
    chestDisplay,
  };
  const presentation = new HandymanPresentation(dependencies);
  boat.add(presentation.root);
  const dispose = () => {
    presentation.dispose();
    chestDisplay.dispose();
    supplyDisplay.dispose();
    propModels.dispose();
  };
  return {
    boat,
    cameraRig,
    chestDisplay,
    supplyDisplay,
    presentation,
    dispose,
  };
}

async function finish(
  harness: ReturnType<typeof createHarness>,
  pending: Promise<void>,
  time = 1,
): Promise<void> {
  harness.presentation.update(time, 10);
  harness.supplyDisplay.update(0);
  await pending;
}

describe('HandymanPresentation', () => {
  it('shows fingertips before the palm and taps the hull once', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.update(0.18, 0.18);

    expect(
      harness.presentation.root.getObjectByName('handyman-fingertips')
        ?.visible,
    ).toBe(true);
    expect(
      harness.presentation.root.getObjectByName('handyman-palm')?.visible,
    ).toBe(false);

    await finish(harness, reveal, 2);
    expect(harness.presentation.root.userData.revealOrder)
      .toEqual(['fingertips', 'palm']);
    expect(harness.presentation.root.userData.hullTaps).toBe(1);
    expect(
      harness.presentation.root.getObjectByName('handyman-palm')?.visible,
    ).toBe(true);
    harness.dispose();
  });

  it('samples the shared wave field at the wrist while held', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reveal = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await reveal;
    const wrist = harness.presentation.root.getObjectByName(
      'handyman-wrist',
    )!;

    harness.presentation.update(3, 0);
    const firstY = wrist.position.y;
    const firstHeight = wrist.userData.waveHeight as number;
    harness.presentation.update(9, 0);

    expect(wrist.userData.motionSource).toBe('shared-wave-field');
    expect(wrist.userData.waveSampleTime).toBe(9);
    expect(wrist.position.y).not.toBe(firstY);
    expect(wrist.userData.waveHeight).not.toBe(firstHeight);
    harness.dispose();
  });

  it('moves every item payment into the palm before resolution', async () => {
    const harness = createHarness();
    for (const choiceId of ITEM_PAYMENTS) {
      harness.presentation.stage();
      const choice = harness.presentation.playChoice({
        choiceId,
        instanceId: `${choiceId}-1` as ItemInstanceId,
        condition: 'usable',
      });
      await finish(harness, choice, 2);
      expect(harness.presentation.root.userData.paymentInPalm).toBe(true);
      expect(harness.presentation.root.userData.paymentVisible).toBe(false);
      expect(harness.presentation.root.userData.fingerCurl).toBe(1);
      harness.presentation.clear();
    }
    harness.dispose();
  });

  it('keeps payment visible until the fingers finish closing', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'spyglass',
      instanceId: 'spyglass-1' as ItemInstanceId,
      condition: 'usable',
    });

    harness.presentation.update(1, 0.72);
    harness.supplyDisplay.update(0);
    expect(harness.presentation.root.userData.fingerCurl).toBeLessThan(1);
    expect(harness.presentation.root.userData.paymentVisible).toBe(true);

    harness.presentation.update(2, 0.13);
    harness.supplyDisplay.update(0);
    expect(harness.presentation.root.userData.fingerCurl).toBe(1);
    expect(harness.presentation.root.userData.paymentVisible).toBe(true);

    await finish(harness, choice, 3);
    expect(harness.presentation.root.userData.fingerCurl).toBe(1);
    expect(harness.presentation.root.userData.paymentVisible).toBe(false);
    harness.dispose();
  });

  it('uses the persistent Chest as payment and restores it on clear', async () => {
    const harness = createHarness();
    const chestPosition = harness.chestDisplay.root.position.clone();
    const chestQuaternion = harness.chestDisplay.root.quaternion.clone();
    const chestScale = harness.chestDisplay.root.scale.clone();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'chest',
      instanceId: null,
      condition: null,
    });
    harness.presentation.update(2, 0.45);
    expect(harness.chestDisplay.root.position.toArray())
      .not.toEqual(chestPosition.toArray());
    await finish(harness, choice, 3);

    expect(
      harness.presentation.root.userData.chestPaymentUsesPersistentChest,
    ).toBe(true);
    expect(harness.chestDisplay.root.visible).toBe(false);
    expect(
      harness.presentation.root.getObjectByName('handyman-payment-chest'),
    ).toBeUndefined();

    const reaction = harness.presentation.react({
      eventId: 'handyman',
      choiceId: 'chest',
      resultId: 'handyman-reward',
    }, outcome);
    const reward = harness.presentation.root.getObjectByName(
      'handyman-reward-anchor',
    )!;
    harness.presentation.update(4, 0.45);
    expect(reward.visible).toBe(false);
    expect(harness.presentation.root.userData.fingerCurl).toBeLessThan(1);
    await finish(harness, reaction, 5);
    expect(reward.visible).toBe(true);
    expect(reward.userData.itemType).toBe('anchor');
    expect(harness.presentation.root.userData.exchangeOverlap).toBe(false);

    harness.presentation.clear();
    expect(harness.chestDisplay.root.visible).toBe(true);
    expect(harness.chestDisplay.root.position.toArray())
      .toEqual(chestPosition.toArray());
    expect(harness.chestDisplay.root.quaternion.toArray())
      .toEqual(chestQuaternion.toArray());
    expect(harness.chestDisplay.root.scale.toArray())
      .toEqual(chestScale.toArray());
    harness.dispose();
  });

  it('reveals a reward only after the fingers reopen', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'spyglass',
      instanceId: 'spyglass-1' as ItemInstanceId,
      condition: 'usable',
    });
    harness.presentation.settleForVisibilityChange();
    await choice;
    const reaction = harness.presentation.react({
      eventId: 'handyman',
      choiceId: 'spyglass',
      resultId: 'handyman-reward',
    }, outcome);
    const reward = harness.presentation.root.getObjectByName(
      'handyman-reward-flashlight',
    )!;
    expect(reward.visible).toBe(false);

    harness.presentation.update(3, 0.52);
    expect(harness.presentation.root.userData.fingerCurl).toBeLessThan(1);
    expect(reward.visible).toBe(false);
    await finish(harness, reaction, 4);
    expect(reward.visible).toBe(true);
    expect(harness.presentation.root.userData.fingerCurl).toBe(0);
    expect(harness.presentation.root.userData.state).toBe('held-reward');
    harness.dispose();
  });

  it('shows one authored Food actor for the fallback result', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reaction = harness.presentation.react({
      eventId: 'handyman',
      choiceId: 'spyglass',
      resultId: 'handyman-food-fallback',
    }, outcome);
    await finish(harness, reaction);

    const food = harness.presentation.root.getObjectByName(
      'handyman-reward-food-token',
    )!;
    expect(food.userData.itemType).toBe('cannedFood');
    expect(
      harness.presentation.root.getObjectByName('handyman-reward-actors')
        ?.children,
    ).toHaveLength(1);
    expect(harness.presentation.root.userData.state).toBe('held-food');
    harness.dispose();
  });

  it('closes around the camera and kicks the hull after Touch', async () => {
    const harness = createHarness();
    const cameraPosition = harness.cameraRig.position.clone();
    const cameraQuaternion = harness.cameraRig.quaternion.clone();
    const supply = harness.supplyDisplay.recordFor('spyglass')!.root;
    const supplyPosition = supply.position.clone();
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'touch',
      instanceId: null,
      condition: null,
    });
    await finish(harness, choice, 2);
    expect(harness.cameraRig.position.toArray())
      .not.toEqual(cameraPosition.toArray());

    const reaction = harness.presentation.react({
      eventId: 'handyman',
      choiceId: 'touch',
      resultId: 'handyman-touch',
    }, outcome);
    harness.presentation.update(3, 0.8);
    harness.supplyDisplay.update(0);
    expect(harness.presentation.root.userData.cameraGrabbed).toBe(true);
    expect(harness.presentation.root.userData.hullKicks).toBe(1);
    expect(supply.position.toArray()).not.toEqual(supplyPosition.toArray());
    await finish(harness, reaction, 4);
    const heldPosition = harness.cameraRig.position.clone();
    const heldQuaternion = harness.cameraRig.quaternion.clone();

    harness.cameraRig.position.set(0, 0, 0);
    harness.cameraRig.quaternion.identity();
    harness.presentation.update(5, 1 / 60);
    expect(harness.cameraRig.position.toArray())
      .toEqual(heldPosition.toArray());
    expect(harness.cameraRig.quaternion.toArray())
      .toEqual(heldQuaternion.toArray());

    harness.presentation.clear();
    harness.supplyDisplay.update(0);
    expect(harness.cameraRig.position.toArray())
      .toEqual(cameraPosition.toArray());
    expect(harness.cameraRig.quaternion.toArray())
      .toEqual(cameraQuaternion.toArray());
    expect(supply.position.toArray()).toEqual(supplyPosition.toArray());
    harness.dispose();
  });

  it('shrugs once and sinks after Sleep', async () => {
    const harness = createHarness();
    harness.presentation.stage();
    const reaction = harness.presentation.react({
      eventId: 'handyman',
      choiceId: 'sleep',
      resultId: 'handyman-sleep',
    }, outcome);
    await finish(harness, reaction);

    expect(harness.presentation.root.userData.shrugs).toBe(1);
    expect(harness.presentation.root.userData.sank).toBe(true);
    expect(
      harness.presentation.root.getObjectByName('handyman-wrist')?.visible,
    ).toBe(false);
    expect(harness.presentation.root.userData.state).toBe('held-sleep');
    harness.dispose();
  });

  it('uses named imported joints and a procedural fallback', () => {
    const imported = createHarness({ importedHand: true });
    expect(
      imported.presentation.root.getObjectByName('handyman-palm')
        ?.userData.modelKind,
    ).toBe('imported');
    expect(
      imported.presentation.root.getObjectByName('event-model:riggedHand'),
    ).toBeDefined();
    imported.dispose();

    const fallback = createHarness({ invalidHand: true });
    expect(
      fallback.presentation.root.getObjectByName('handyman-palm')
        ?.userData.modelKind,
    ).toBe('procedural');
    expect(
      fallback.presentation.root.getObjectByName(
        'handyman-procedural-palm',
      ),
    ).toBeDefined();
    expect(
      fallback.presentation.root.getObjectByName(
        'handyman-procedural-finger-1-joint-2',
      ),
    ).toBeDefined();
    fallback.dispose();
  });

  it('rejects disconnected or inactive imported finger chains', () => {
    const disconnected = createHarness({ disconnectedHand: true });
    expect(
      disconnected.presentation.root.getObjectByName('handyman-palm')
        ?.userData.modelKind,
    ).toBe('procedural');
    expect(
      disconnected.presentation.root.getObjectByName(
        'event-model:riggedHand',
      ),
    ).toBeUndefined();
    disconnected.dispose();

    const unbound = createHarness({ unboundHand: true });
    expect(
      unbound.presentation.root.getObjectByName('handyman-palm')
        ?.userData.modelKind,
    ).toBe('procedural');
    expect(
      unbound.presentation.root.getObjectByName('event-model:riggedHand'),
    ).toBeUndefined();
    unbound.dispose();
  });

  it('settles promises and disposes each imported Skeleton once', async () => {
    const harness = createHarness({
      importedHand: true,
      sharedSkeletonMeshes: true,
    });
    harness.presentation.stage();
    const pending = harness.presentation.reveal();
    harness.presentation.settleForVisibilityChange();
    await pending;
    const mesh = harness.presentation.root.getObjectByName(
      'rigged-hand-test-mesh',
    ) as SkinnedMesh;
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    const material = Array.isArray(mesh.material)
      ? mesh.material[0]!
      : mesh.material;
    const materialDispose = vi.spyOn(material, 'dispose');
    mesh.skeleton.computeBoneTexture();
    const boneTexture = mesh.skeleton.boneTexture!;
    const skeletonDispose = vi.spyOn(mesh.skeleton, 'dispose');
    const boneTextureDispose = vi.spyOn(boneTexture, 'dispose');
    const secondMesh = harness.presentation.root.getObjectByName(
      'rigged-hand-test-mesh-2',
    ) as SkinnedMesh;
    expect(secondMesh.skeleton).toBe(mesh.skeleton);

    harness.presentation.dispose();
    harness.presentation.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(skeletonDispose).toHaveBeenCalledOnce();
    expect(boneTextureDispose).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it('restores arbitrary camera transforms exactly', async () => {
    const harness = createHarness();
    const position = new Vector3(2, -1, 4);
    const quaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      0.6,
    );
    harness.cameraRig.position.copy(position);
    harness.cameraRig.quaternion.copy(quaternion);
    harness.presentation.stage();
    const choice = harness.presentation.playChoice({
      choiceId: 'touch',
      instanceId: null,
      condition: null,
    });
    harness.presentation.settleForVisibilityChange();
    await choice;
    harness.presentation.clear();
    expect(harness.cameraRig.position.toArray()).toEqual(position.toArray());
    expect(harness.cameraRig.quaternion.toArray())
      .toEqual(quaternion.toArray());
    harness.dispose();
  });

  it('routes only stable Handyman result IDs', () => {
    const harness = createHarness();
    harness.presentation.stage();
    expect(() => harness.presentation.react({
      eventId: 'handyman',
      choiceId: 'spyglass',
      resultId: 'trader-reward',
    }, outcome)).toThrow('Unsupported Handyman result');
    harness.dispose();
  });
});
