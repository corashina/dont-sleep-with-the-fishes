// Importance: 10/10. Protects the moon event choreography and lifecycle.
import { Object3D, PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import {
  MoonEventPresentation,
  type MoonEventPresentationEnvironment,
} from '../src/survival/MoonEventPresentation';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import type { ActionOutcome, ItemCondition } from '../src/survival/survivalTypes';
import type { EventPhysicalResponsePose } from '../src/survival/eventPhysicalResponseChoreography';
import { Skybox, type MoonFacePresentation } from '../src/world/Skybox';

const context = {
  eventId: 'face-on-the-moon',
  targetInstanceId: null,
  variantSeed: 17,
} as const;

function outcome(
  deltas: ActionOutcome['deltas'],
  choiceId = 'sleep',
): ActionOutcome {
  return {
    accepted: true,
    code: 'event-resolved',
    message: 'The moon watches.',
    deltas,
    cue: 'none',
    eventResult: {
      eventId: 'face-on-the-moon',
      choiceId,
      resultId: 'test-result',
    },
  };
}

function result(
  action: ActionOutcome,
  selectedInstanceId: ItemInstanceId | null = null,
  selectedCondition: ItemCondition | null = null,
): EventOutcomePresentation {
  return {
    outcome: action,
    resourceDeltas: action.deltas,
    gainedInstanceIds: [],
    brokenInstanceIds: selectedCondition === 'broken' && selectedInstanceId !== null
      ? [selectedInstanceId]
      : [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId,
    selectedCondition,
    targetInstanceId: null,
  };
}

async function remainsPending(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  return !settled;
}

function createHarness() {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  const basePosition = camera.position.clone();
  const baseQuaternion = camera.quaternion.clone();
  const face = {
    reveal: 0,
    grin: 0,
    starScale: 1,
    dim: 0,
    scale: 1,
  };
  const sky = {
    resetTransient: vi.fn(() => {
      face.reveal = 0;
      face.grin = 0;
      face.starScale = 1;
      face.dim = 0;
      face.scale = 1;
    }),
    setMoonFace: vi.fn((next: MoonFacePresentation) => {
      face.reveal = next.reveal;
      face.grin = next.grin;
      face.starScale = next.starScale;
      face.dim = next.dim;
      face.scale = next.scale;
    }),
  };
  const physicalOrder: string[] = [];
  const poses: EventPhysicalResponsePose[] = [];
  const supplies = {
    clearEventPose: vi.fn(() => physicalOrder.push('clear')),
    pinEventActor: vi.fn((instanceId: ItemInstanceId) => {
      physicalOrder.push(`pin:${instanceId}`);
      return true;
    }),
    applyEventItemPose: vi.fn((instanceId: ItemInstanceId, pose: EventPhysicalResponsePose) => {
      physicalOrder.push(`apply:${instanceId}`);
      poses.push({ ...pose });
      return true;
    }),
    releaseEventActor: vi.fn(() => physicalOrder.push('release')),
  };
  const itemAimTarget = new Object3D();
  const cameraControl = {
    restoreBasePose: vi.fn(() => {
      camera.position.copy(basePosition);
      camera.quaternion.copy(baseQuaternion);
    }),
  };
  const environment: MoonEventPresentationEnvironment = {
    sky,
    camera,
    cameraControl,
    supplies,
    itemAimTarget,
  };
  return {
    camera,
    cameraControl,
    basePosition,
    baseQuaternion,
    face,
    sky,
    supplies,
    physicalOrder,
    poses,
    itemAimTarget,
    presentation: new MoonEventPresentation(environment),
  };
}

describe('MoonEventPresentation', () => {
  it('keeps the authored moon face shader', () => {
    const sky = new Skybox(
      new Scene(),
      { weather: 'calm', phase: 'night', severity: 0 },
      new Texture(),
    );
    expect(sky.material.fragmentShader).toContain('referenceGrinShape');
    expect(sky.material.fragmentShader).toContain('archedBrowShape');
    expect(sky.material.fragmentShader).toContain('slantedEyeSockets');
    expect(sky.material.fragmentShader).toContain('lowerEyeArcs');
    expect(sky.material.fragmentShader).toContain('wideJaggedGrin');
    expect(sky.material.fragmentShader).toContain('splitNose');
    expect(sky.material.fragmentShader).toContain('faceReveal');
    expect(sky.material.fragmentShader).not.toContain('grinTeeth');
    sky.dispose();
  });

  it('keeps the normal-moon hold before the reveal and delayed grin', async () => {
    const { face, presentation } = createHarness();
    presentation.stage(context);
    const reveal = presentation.reveal();

    presentation.update(0.76, 0.76);
    expect(face.reveal).toBe(0);
    expect(await remainsPending(reveal)).toBe(true);

    presentation.update(3.7, 2.94);
    expect(face.reveal).toBe(0);
    expect(face.starScale).toBeLessThan(1);
    expect(face.scale).toBeGreaterThan(1.5);

    presentation.update(4.3, 0.6);
    expect(face.reveal).toBeGreaterThan(0);
    expect(face.reveal).toBeLessThan(1);
    expect(face.grin).toBeGreaterThan(0);
    expect(face.grin).toBeLessThan(0.74);

    presentation.update(5.8, 1.5);
    await reveal;
    expect(face).toMatchObject({
      reveal: 1,
      starScale: 0.16,
      dim: 0.18,
      scale: 4.15,
    });
    expect(face.grin).toBeGreaterThan(0.7);
  });

  it('widens the grin for Pressure and dims a lowered view for Energy loss', async () => {
    const {
      camera,
      cameraControl,
      basePosition,
      baseQuaternion,
      face,
      presentation,
    } = createHarness();
    presentation.stage(context);
    const reveal = presentation.reveal();
    presentation.update(5.8, 5.8);
    await reveal;

    const pressureOutcome = outcome({ pressure: 1 });
    const pressure = presentation.react(result(pressureOutcome), pressureOutcome);
    presentation.update(6.35, 0.55);
    expect(face.grin).toBeGreaterThan(0.74);
    expect(await remainsPending(pressure)).toBe(true);
    presentation.update(6.9, 0.55);
    await pressure;
    expect(face.grin).toBeLessThanOrEqual(0.96);

    const energyOutcome = outcome({ energy: -80 });
    const energy = presentation.react(result(energyOutcome), energyOutcome);
    presentation.update(7.45, 0.55);
    expect(face.dim).toBeGreaterThan(0.18);
    expect(camera.position.toArray()).toEqual(basePosition.toArray());
    expect(camera.quaternion.toArray()).not.toEqual(baseQuaternion.toArray());
    expect(await remainsPending(energy)).toBe(true);
    cameraControl.restoreBasePose();
    presentation.update(8, 0.55);
    await energy;
    expect(face.dim).toBe(0.48);
    expect(camera.quaternion.angleTo(baseQuaternion)).toBeCloseTo(0.2);
  });

  it('pins, poses, clears, and releases a broken selected actor in order', async () => {
    const { physicalOrder, poses, presentation } = createHarness();
    const instanceId = 'spyglass-1' as ItemInstanceId;
    const action = outcome({ energy: -79 }, 'spyglass');
    presentation.stage(context);
    const reaction = presentation.react(result(action, instanceId, 'broken'), action);

    expect(physicalOrder).toEqual(['clear', `pin:${instanceId}`]);
    presentation.update(0.24, 0.24);
    expect(physicalOrder.at(-1)).toBe(`apply:${instanceId}`);
    expect(poses.at(-1)?.z).toBeGreaterThan(0.3);
    expect(Math.abs(poses.at(-1)?.pitch ?? 0)).toBeGreaterThan(0.3);

    presentation.update(1.1, 0.86);
    await reaction;
    expect(physicalOrder.slice(-2)).toEqual(['clear', 'release']);
  });

  it('owns the supplied moon aim target behavior', () => {
    const { itemAimTarget, presentation } = createHarness();
    expect(presentation.itemAimTarget).toBe(itemAimTarget);
    expect(itemAimTarget.name).toBe('moon-event-item-aim-target');
    expect(itemAimTarget.position.length()).toBeCloseTo(60);
    expect(itemAimTarget.position.clone().normalize().angleTo(
      new Vector3(0, 0.24, -1).normalize(),
    )).toBeCloseTo(0);
  });

  it('reapplies the staged frame without advancing during a pause update', async () => {
    const { face, sky, presentation } = createHarness();
    presentation.stage(context);
    const reveal = presentation.reveal();
    presentation.update(1.9, 1.9);
    const held = { ...face };
    sky.resetTransient();

    presentation.update(21.9, 0);

    expect(face).toEqual(held);
    expect(await remainsPending(reveal)).toBe(true);
    presentation.update(25.8, 3.9);
    await reveal;
  });

  it('settles active work once for visibility, replacement, clear, and disposal', async () => {
    const { face, presentation } = createHarness();
    presentation.stage(context);
    let firstSettles = 0;
    const first = presentation.reveal().then(() => { firstSettles += 1; });
    const second = presentation.reveal();
    await first;
    expect(firstSettles).toBe(1);
    expect(await remainsPending(second)).toBe(true);

    presentation.settleForVisibilityChange();
    presentation.settleForVisibilityChange();
    await second;
    expect(face.reveal).toBe(1);

    const action = outcome({ energy: -80 });
    const cleared = presentation.react(result(action), action);
    presentation.clear();
    presentation.clear();
    await cleared;
    expect(face).toEqual({ reveal: 0, grin: 0, starScale: 1, dim: 0, scale: 1 });

    presentation.stage(context);
    const disposed = presentation.reveal();
    presentation.dispose();
    presentation.dispose();
    await disposed;
    expect(face).toEqual({ reveal: 0, grin: 0, starScale: 1, dim: 0, scale: 1 });
    await expect(presentation.reveal()).resolves.toBeUndefined();
  });

  it('restores the base camera pose when staging, clearing, and replacing', async () => {
    const { camera, basePosition, baseQuaternion, presentation } = createHarness();
    presentation.stage(context);
    const action = outcome({ energy: -80 });
    const reaction = presentation.react(result(action), action);
    presentation.update(1.1, 1.1);
    await reaction;
    expect(camera.quaternion.toArray()).not.toEqual(baseQuaternion.toArray());

    presentation.stage(context);
    expect(camera.position.toArray()).toEqual(basePosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());
    camera.rotateX(0.4);
    presentation.clear();
    expect(camera.quaternion.toArray()).toEqual(baseQuaternion.toArray());
  });

  it('keeps the first cleanup error and still releases work once', async () => {
    const { presentation, supplies } = createHarness();
    const firstError = new Error('clear pose');
    const secondError = new Error('release actor');
    const instanceId = 'spyglass-1' as ItemInstanceId;
    const action = outcome({ energy: -79 }, 'spyglass');
    presentation.stage(context);
    const reaction = presentation.react(result(action, instanceId, 'broken'), action);
    supplies.clearEventPose.mockImplementationOnce(() => {
      throw firstError;
    });
    supplies.releaseEventActor.mockImplementationOnce(() => {
      throw secondError;
    });

    expect(() => presentation.settleForVisibilityChange()).toThrow(firstError);
    await reaction;
    expect(supplies.releaseEventActor).toHaveBeenCalledOnce();
    expect(() => presentation.settleForVisibilityChange()).not.toThrow();
  });
});
