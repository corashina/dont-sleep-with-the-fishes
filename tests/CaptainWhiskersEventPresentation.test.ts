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
import { CaptainWhiskersPresentation } from '../src/survival/CaptainWhiskersPresentation';
import { CaptainWhiskersEventPresentation } from '../src/survival/events/CaptainWhiskersEventPresentation';
import type { CaptainWhiskersEventId } from '../src/survival/events/CaptainWhiskersEventPresentation';
import type {
  DedicatedEventEnvironment,
} from '../src/survival/eventPresentationTypes';
import { createTestPropModels } from './helpers/propModels';

function setup(eventId: CaptainWhiskersEventId) {
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
    sampleWorldWaveInto: vi.fn(),
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
});
