// Importance: 4/5. Protects event staging, restoration, and owned visual resources.
import {
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SphereGeometry,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { CaptainWhiskersPresentation } from '../src/survival/CaptainWhiskersPresentation';
import { CaptainWhiskersEventPresentation } from '../src/survival/events/CaptainWhiskersEventPresentation';
import type { CaptainWhiskersEventId } from '../src/survival/events/CaptainWhiskersEventPresentation';
import type {
  DedicatedEventEnvironment,
} from '../src/survival/eventPresentationTypes';
import { createTestPropModels } from './helpers/propModels';

function setup(eventId: CaptainWhiskersEventId, waveAmplitude = 1) {
  const propModels = createTestPropModels();
  const companion = new CaptainWhiskersPresentation(propModels);
  companion.sync({
    alive: true,
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
  const poseRoot = companion.root.getObjectByName('captain-whiskers-pose')!;
  const basePose = poseRoot.rotation.clone();
  const sampleWorldWaveInto = vi.fn((
    output: { height: number; displacementX: number; displacementZ: number },
    time: number,
    _x: number,
    _z: number,
    amplitude: number,
  ) => {
    output.height = time * amplitude;
    output.displacementX = amplitude * 0.1;
    output.displacementZ = amplitude * -0.1;
  });
  const environment = {
    captainWhiskers: companion,
    camera,
    eventModels: {
      create: vi.fn(),
      animations: vi.fn(() => []),
      dispose: vi.fn(),
    },
    supplies: {},
    vortexWave: {},
    sampleWorldWaveInto,
    readWorldWaveAmplitudeScale: () => waveAmplitude,
  } as unknown as DedicatedEventEnvironment;
  const presentation = new CaptainWhiskersEventPresentation(eventId, environment);
  presentation.stage({ eventId, targetInstanceId: null, variantSeed: 19 });
  return {
    propModels,
    companion,
    camera,
    baseCamera,
    poseRoot,
    basePose,
    sampleWorldWaveInto,
    presentation,
  };
}

function finishReveal(
  presentation: CaptainWhiskersEventPresentation,
): Promise<void> {
  const reveal = presentation.reveal();
  presentation.update(3, 2);
  return reveal;
}

describe('CaptainWhiskersEventPresentation', () => {
  it('shows the keyed reveal anticipation before decisive travel', async () => {
    const state = setup('sick-companion');
    const reveal = state.presentation.reveal();

    state.presentation.update(1, 0.07);

    expect(state.poseRoot.rotation.x).toBeLessThan(state.basePose.x);
    state.presentation.clear();
    await reveal;
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('turns toward the real sick companion and restores camera and pose', async () => {
    const state = setup('sick-companion');

    await finishReveal(state.presentation);

    expect(state.camera.quaternion.equals(state.baseCamera)).toBe(false);
    expect(state.poseRoot.rotation.x).toBeGreaterThan(state.basePose.x);
    expect(state.companion.root.visible).toBe(true);

    state.presentation.clear();
    expect(state.camera.quaternion.equals(state.baseCamera)).toBe(true);
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('shows one separate dark false-cat silhouette', async () => {
    const state = setup('shadow-figure');

    await finishReveal(state.presentation);

    const falseCat = state.presentation.boatRoot.getObjectByName('shadow-figure:false-cat')!;
    const falseCatMesh = falseCat.getObjectByProperty('type', 'Mesh') as Mesh;
    const falseMaterial = Array.isArray(falseCatMesh.material)
      ? falseCatMesh.material[0]!
      : falseCatMesh.material;
    expect(falseCat).not.toBe(state.companion.interactionRoot);
    expect(falseCat.visible).toBe(true);
    expect((falseMaterial as MeshStandardMaterial).color.getHex()).toBeLessThan(0x303030);

    state.presentation.clear();
    expect(falseCat.visible).toBe(false);
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('shows restrained pooled eyes around the boat', async () => {
    const state = setup('sea-watcher');

    await finishReveal(state.presentation);

    const eyes = state.presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('sea-watcher:eye-'),
    );
    expect(eyes).toHaveLength(6);
    expect(eyes.every(({ visible }) => visible)).toBe(true);
    const meshes = eyes.map((eye) => eye.getObjectByProperty('type', 'Mesh') as Mesh);
    expect(new Set(meshes.map(({ geometry }) => geometry))).toHaveLength(1);
    expect(new Set(meshes.map(({ material }) => material))).toHaveLength(1);

    state.presentation.settleForVisibilityChange();
    expect(eyes.every(({ visible }) => !visible)).toBe(true);
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('samples Sea Watcher eyes at the exact rendered amplitude', async () => {
    const state = setup('sea-watcher', 0.37);

    await finishReveal(state.presentation);

    expect(state.sampleWorldWaveInto).toHaveBeenCalled();
    for (const call of state.sampleWorldWaveInto.mock.calls) {
      expect(call[4]).toBe(0.37);
    }
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it.each([
    ['choice', (state: ReturnType<typeof setup>) => state.presentation.playChoice('sleep')],
    ['item', (state: ReturnType<typeof setup>) => state.presentation.playItemUse(
      'spyglass',
      'spyglass-1' as ItemInstanceId,
    )],
    ['result', (state: ReturnType<typeof setup>) => state.presentation.react({
      outcome: {
        accepted: true,
        code: 'event-resolved',
        message: 'The watcher remains.',
        deltas: {},
        cue: 'none',
      },
      resourceDeltas: {},
      brokenInstanceIds: [],
      lostInstanceIds: [],
      consumedInstanceIds: [],
      selectedInstanceId: null,
      selectedCondition: null,
      targetInstanceId: null,
    })],
  ] as const)('keeps the current Sea Watcher wave time through %s completion', async (
    _kind,
    start,
  ) => {
    const state = setup('sea-watcher', 0.42);
    await finishReveal(state.presentation);
    state.sampleWorldWaveInto.mockClear();

    const active = start(state);
    state.presentation.update(7.25, 2);
    const completion = await active;

    const finalEyeSamples = state.sampleWorldWaveInto.mock.calls.slice(-6);
    expect(finalEyeSamples).toHaveLength(6);
    expect(finalEyeSamples.every((call) => call[1] === 7.25)).toBe(true);
    expect(finalEyeSamples.every((call) => call[4] === 0.42)).toBe(true);
    if (_kind === 'item') expect(completion).toBe(true);
    state.presentation.dispose();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('cancels item playback and restores state on clear', async () => {
    const state = setup('sick-companion');
    await finishReveal(state.presentation);
    const item = state.presentation.playItemUse('energyBar', 'energyBar-1' as ItemInstanceId);
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
    const head = state.companion.root.getObjectByName('captain-whiskers-head-pose')!;
    const baseHeadYaw = head.rotation.y;

    await finishReveal(state.presentation);

    expect(state.poseRoot.rotation.x).toBeLessThan(state.basePose.x);
    expect(Math.abs(head.rotation.y - baseHeadYaw)).toBeGreaterThan(0.1);

    state.presentation.dispose();
    expect(state.poseRoot.rotation.toArray()).toEqual(state.basePose.toArray());
    expect(head.rotation.y).toBe(baseHeadYaw);
    state.companion.dispose();
    state.propModels.dispose();
  });

  it.each(['sick-companion', 'guarded-sleep'] as const)(
    'removes the shared-pose aim target when %s disposes',
    (eventId) => {
      const state = setup(eventId);

      expect(state.presentation.itemAimTarget.parent).toBe(state.poseRoot);
      state.presentation.dispose();

      expect(state.presentation.itemAimTarget.parent).toBeNull();
      expect(state.poseRoot.getObjectByName(`${eventId}-item-aim-target`)).toBeUndefined();
      state.companion.dispose();
      state.propModels.dispose();
    },
  );

  it.each(['shadow-figure', 'sea-watcher'] as const)(
    'captures the live sick pose before staging %s',
    (eventId) => {
      const propModels = createTestPropModels();
      const companion = new CaptainWhiskersPresentation(propModels);
      const presentation = new CaptainWhiskersEventPresentation(eventId, {
        captainWhiskers: companion,
        camera: new PerspectiveCamera(),
        sampleWorldWaveInto: vi.fn(),
        readWorldWaveAmplitudeScale: () => 1,
      } as unknown as DedicatedEventEnvironment);
      const poseRoot = companion.root.getObjectByName('captain-whiskers-pose')!;
      const headRoot = companion.root.getObjectByName('captain-whiskers-head-pose')!;
      const constructorRotation = poseRoot.rotation.toArray();

      companion.sync({
        alive: true,
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
    },
  );

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

  it('disposes the pooled eye geometry and material once', () => {
    const state = setup('sea-watcher');
    const eye = state.presentation.worldRoot.getObjectByName('sea-watcher:eye-1') as Mesh;
    const geometryDispose = vi.spyOn(eye.geometry, 'dispose');
    const material = Array.isArray(eye.material) ? eye.material[0]! : eye.material;
    const materialDispose = vi.spyOn(material, 'dispose');

    state.presentation.dispose();
    state.presentation.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    state.companion.dispose();
    state.propModels.dispose();
  });

  it('rolls back owned resources when construction fails', () => {
    const propModels = createTestPropModels();
    const companion = new CaptainWhiskersPresentation(propModels);
    companion.sync({
      alive: true, hunger: 5, sickness: 0, unhappiness: 0,
      pettedToday: false, deathCause: null,
    });
    const geometryDispose = vi.spyOn(SphereGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(MeshStandardMaterial.prototype, 'dispose');
    const failure = new Error('eye construction failed');

    expect(() => new CaptainWhiskersEventPresentation('sea-watcher', {
      captainWhiskers: companion,
      camera: new PerspectiveCamera(),
    } as DedicatedEventEnvironment, {
      onEyeCreated: (eye) => {
        if (eye.name === 'sea-watcher:eye-2') throw failure;
      },
    })).toThrow(failure);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    geometryDispose.mockRestore();
    materialDispose.mockRestore();
    companion.dispose();
    propModels.dispose();
  });

  it('removes a shared-pose aim target when construction fails after attachment', () => {
    const root = new Group();
    const poseRoot = new Group();
    const headRoot = new Group();
    poseRoot.name = 'captain-whiskers-pose';
    headRoot.name = 'captain-whiskers-head-pose';
    root.add(poseRoot, headRoot);
    const failure = new Error('aim target attachment failed');
    const add = poseRoot.add.bind(poseRoot);
    poseRoot.add = (...objects) => {
      add(...objects);
      throw failure;
    };

    expect(() => new CaptainWhiskersEventPresentation('sick-companion', {
      captainWhiskers: { root },
    } as DedicatedEventEnvironment)).toThrow(failure);

    expect(poseRoot.getObjectByName('sick-companion-item-aim-target')).toBeUndefined();
  });
});
