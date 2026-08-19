// Importance: 8/10 (scaled from 4/5). Protects event staging, restoration, and owned visual resources.
import {
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { CarlitosPresentation } from '../src/survival/CarlitosPresentation';
import { CarlitosEventPresentation } from '../src/survival/events/CarlitosEventPresentation';
import type { CarlitosEventId } from '../src/survival/events/CarlitosEventPresentation';
import type {
  DedicatedEventEnvironment,
} from '../src/survival/eventPresentationTypes';
import { createTestPropModels } from './helpers/propModels';

function setup(eventId: CarlitosEventId) {
  const propModels = createTestPropModels();
  const companion = new CarlitosPresentation(propModels);
  companion.sync({
    alive: true,
    energy: 3,
    hunger: 5,
    sickness: 0,
    unhappiness: 0,
    pettedToday: false,
    deathCause: null,
  });
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0.88, 1.72);
  camera.lookAt(0, 0.55, -0.5);
  const baseCamera = camera.quaternion.clone();
  const poseRoot = companion.root.getObjectByName('carlitos-pose')!;
  const basePose = poseRoot.rotation.clone();
  const environment = {
    carlitos: companion,
    camera,
    eventModels: {
      create: vi.fn(),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    },
    supplies: {},
    vortexWave: {},
    sampleWorldWaveInto: vi.fn(),
    readWorldWaveAmplitudeScale: () => 1,
  } as unknown as DedicatedEventEnvironment;
  const presentation = new CarlitosEventPresentation(eventId, environment);
  presentation.stage({ eventId, targetInstanceId: null, variantSeed: 19 });
  return {
    propModels,
    companion,
    camera,
    baseCamera,
    poseRoot,
    basePose,
    presentation,
  };
}

function finishReveal(
  presentation: CarlitosEventPresentation,
): Promise<void> {
  const reveal = presentation.reveal();
  presentation.update(3, 2);
  return reveal;
}

describe('CarlitosEventPresentation', () => {
  it('shows the keyed reveal anticipation before decisive travel', async () => {
    const state = setup('guarded-sleep');
    const reveal = state.presentation.reveal();

    state.presentation.update(1, 0.07);

    expect(state.poseRoot.rotation.x).toBeGreaterThan(state.basePose.x);
    state.presentation.clear();
    await reveal;
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('spawns one static dark false-cat opposite Carlitos', async () => {
    const state = setup('shadow-figure');
    const falseCat = state.presentation.boatRoot.getObjectByName('shadow-figure:false-cat')!;
    const falseCatMesh = falseCat.getObjectByProperty('type', 'Mesh') as Mesh;
    const falseMaterial = Array.isArray(falseCatMesh.material)
      ? falseCatMesh.material[0]!
      : falseCatMesh.material;
    const startPosition = falseCat.position.clone();
    const startRotation = falseCat.rotation.clone();
    const startScale = falseCat.scale.clone();
    expect(falseCat).not.toBe(state.companion.interactionRoot);
    expect(falseCat.visible).toBe(true);
    expect(falseCat.position.x).toBeCloseTo(-state.companion.root.position.x);
    expect(falseCat.position.y).toBeCloseTo(state.companion.root.position.y);
    expect(falseCat.position.z).toBeCloseTo(state.companion.root.position.z);
    expect(falseCat.rotation.toArray()).toEqual(state.companion.root.rotation.toArray());
    expect(falseCat.scale.toArray()).toEqual(state.companion.root.scale.toArray());
    expect(falseMaterial).toBeInstanceOf(MeshStandardMaterial);
    expect(falseMaterial.name).toBe('shadow-figure-silhouette-material');
    expect((falseMaterial as MeshStandardMaterial).color.getHex()).toBe(0x030506);
    expect((falseMaterial as MeshStandardMaterial).map).toBeNull();
    expect(state.camera.quaternion.equals(state.baseCamera)).toBe(true);

    const reveal = state.presentation.reveal();
    state.presentation.update(0.3, 0.3);
    expect(falseCat.visible).toBe(true);
    expect(falseCat.position.toArray()).toEqual(startPosition.toArray());
    expect(falseCat.rotation.toArray()).toEqual(startRotation.toArray());
    expect(falseCat.scale.toArray()).toEqual(startScale.toArray());
    state.presentation.update(1, 1);
    await reveal;

    state.presentation.clear();
    expect(falseCat.visible).toBe(false);
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('cancels item playback and restores state on clear', async () => {
    const state = setup('shadow-figure');
    await finishReveal(state.presentation);
    const item = state.presentation.playItemUse('spyglass', 'spyglass-1' as ItemInstanceId);
    state.presentation.update(4, 0.2);

    state.presentation.clear();

    await expect(item).resolves.toBe(false);
    expect(state.camera.quaternion.equals(state.baseCamera)).toBe(true);
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('skips once and restores camera, companion, and owned visuals', async () => {
    const state = setup('shadow-figure');
    const falseCat = state.presentation.boatRoot.getObjectByName('shadow-figure:false-cat')!;
    let completions = 0;
    const reveal = state.presentation.reveal().then(() => {
      completions += 1;
    });
    state.presentation.update(2, 0.3);
    expect(falseCat.visible).toBe(true);

    state.presentation.skip();
    state.presentation.skip();
    await reveal;

    expect(completions).toBe(1);
    expect(falseCat.visible).toBe(false);
    expect(state.camera.quaternion.equals(state.baseCamera)).toBe(true);
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('holds the real companion in an alert guarded-sleep pose', async () => {
    const state = setup('guarded-sleep');
    const head = state.companion.root.getObjectByName('carlitos-head-pose')!;
    const baseHeadYaw = head.rotation.y;

    await finishReveal(state.presentation);

    const cameraLocal = state.camera.getWorldPosition(new Vector3());
    state.poseRoot.parent!.worldToLocal(cameraLocal);
    const expectedBodyYaw = Math.atan2(
      -(cameraLocal.x - state.poseRoot.position.x),
      -(cameraLocal.z - state.poseRoot.position.z),
    );
    const cameraPosition = state.camera.getWorldPosition(new Vector3());
    const targetPosition = state.presentation.itemAimTarget.getWorldPosition(new Vector3());
    const expectedView = targetPosition.sub(cameraPosition).normalize();
    const cameraView = state.camera.getWorldDirection(new Vector3());
    expect(state.poseRoot.rotation.x).toBeLessThan(state.basePose.x);
    expect(state.poseRoot.rotation.y).toBeCloseTo(expectedBodyYaw);
    expect(head.rotation.y).toBe(0);
    expect(cameraView.dot(expectedView)).toBeGreaterThan(0.999);

    const choice = state.presentation.playChoice('watch');
    state.presentation.update(1, 0.3);
    const heldCameraPosition = state.camera.getWorldPosition(new Vector3());
    const heldTargetPosition = state.presentation.itemAimTarget.getWorldPosition(new Vector3());
    const heldExpectedView = heldTargetPosition.sub(heldCameraPosition).normalize();
    expect(state.camera.getWorldDirection(new Vector3()).dot(heldExpectedView))
      .toBeGreaterThan(0.999);

    state.presentation.clear();
    await choice;
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    expect(head.rotation.y).toBe(baseHeadYaw);
    expect(state.camera.quaternion.equals(state.baseCamera)).toBe(true);
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('removes the shared-pose aim target when Guarded Sleep disposes', () => {
    const state = setup('guarded-sleep');

    expect(state.presentation.itemAimTarget.parent).toBe(state.poseRoot);
    state.presentation.dispose();

    expect(state.presentation.itemAimTarget.parent).toBeNull();
    expect(state.poseRoot.getObjectByName('guarded-sleep-item-aim-target')).toBeUndefined();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('captures the live sick pose before staging Shadow Figure', () => {
      const eventId = 'shadow-figure';
      const propModels = createTestPropModels();
      const companion = new CarlitosPresentation(propModels);
      const presentation = new CarlitosEventPresentation(eventId, {
        carlitos: companion,
        camera: new PerspectiveCamera(),
        sampleWorldWaveInto: vi.fn(),
        readWorldWaveAmplitudeScale: () => 1,
      } as unknown as DedicatedEventEnvironment);
      const poseRoot = companion.root.getObjectByName('carlitos-pose')!;
      const headRoot = companion.root.getObjectByName('carlitos-head-pose')!;
      const constructorRotation = poseRoot.rotation.toArray();

      companion.sync({
        alive: true,
        energy: 3,
        hunger: 5,
        sickness: 2,
        unhappiness: 0,
        pettedToday: false,
        deathCause: null,
      });
      const livePosition = poseRoot.position.toArray();
      const liveRotation = poseRoot.rotation.toArray();
      const liveHeadRotation = headRoot.rotation.toArray();
      expect(liveRotation).not.toEqual(constructorRotation);

      presentation.stage({ eventId, targetInstanceId: null, variantSeed: 23 });
      presentation.clear();

      expect(poseRoot.position.toArray()).toEqual(livePosition);
      expect(poseRoot.rotation.toArray()).toEqual(liveRotation);
      expect(headRoot.rotation.toArray()).toEqual(liveHeadRotation);
      presentation.dispose();
      companion.dispose();
      propModels.dispose();
    });

  it('disposes each owned false-cat material once', () => {
    const state = setup('shadow-figure');
    const falseCat = state.presentation.boatRoot.getObjectByName('shadow-figure:false-cat')!;
    const materials = new Set<Material>();
    falseCat.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of entries) materials.add(material);
    });
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    state.presentation.dispose();
    state.presentation.dispose();

    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledOnce();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('removes a shared-pose aim target when construction fails after attachment', () => {
    const root = new Group();
    const poseRoot = new Group();
    const headRoot = new Group();
    poseRoot.name = 'carlitos-pose';
    headRoot.name = 'carlitos-head-pose';
    root.add(poseRoot, headRoot);
    const failure = new Error('aim target attachment failed');
    const add = poseRoot.add.bind(poseRoot);
    poseRoot.add = (...objects) => {
      add(...objects);
      throw failure;
    };

    expect(() => new CarlitosEventPresentation('guarded-sleep', {
      carlitos: { root },
    } as DedicatedEventEnvironment)).toThrow(failure);

    expect(poseRoot.getObjectByName('guarded-sleep-item-aim-target')).toBeUndefined();
  });
});
