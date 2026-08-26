// Importance: 10/10. Protects full-view umbrella shielding and its event hold state.
import { describe, expect, it, vi } from 'vitest';
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BoatSupplyDisplay,
  BorrowedSupplyActor,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import {
  createEventItemUseSample,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';

const INSTANCE_ID = 'umbrella-1' as ItemInstanceId;

function applyRootPose(
  root: Group,
  pose: Parameters<BorrowedSupplyActor['applyPose']>[0],
): void {
  root.position.set(pose.x, pose.y, pose.z);
  root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
  root.scale.set(
    pose.scaleX * 0.5,
    pose.scaleY * 0.5,
    pose.scaleZ * 0.5,
  );
}

function outcome(): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Done.',
      deltas: {},
      cue: 'none',
    },
    resourceDeltas: {},
    gainedInstanceIds: [],
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: INSTANCE_ID,
    selectedCondition: 'usable',
    targetInstanceId: null,
  };
}

describe('umbrella shield presentation', () => {
  it('keeps the camera-facing canopy full-screen with its handle below center', () => {
    const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 1000);
    const root = new Group();
    const material = new MeshStandardMaterial();
    const canopy = new Mesh(new RingGeometry(0, 0.45, 32), material);
    root.add(canopy);
    const actor: BorrowedSupplyActor = {
      instanceId: INSTANCE_ID,
      root,
      applyPose: (pose) => applyRootPose(root, pose),
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();

    adapter.begin(actor, 'umbrella', null, true, 'x');
    sampleEventItemUse('umbrella-shield', 'umbrella', 1, sample);
    adapter.apply(sample);
    root.updateWorldMatrix(true, true);

    const center = new Vector3(-0.032, 0, 0)
      .applyMatrix4(root.matrixWorld)
      .project(camera);
    const right = new Vector3(-0.032, 0, 0.45)
      .applyMatrix4(root.matrixWorld)
      .project(camera);
    const top = new Vector3(-0.032, 0.45, 0)
      .applyMatrix4(root.matrixWorld)
      .project(camera);
    const normal = new Vector3(1, 0, 0).applyQuaternion(root.quaternion);

    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeLessThan(-0.35);
    expect(center.y).toBeGreaterThan(-0.55);
    expect(Math.abs(right.x)).toBeGreaterThan(1);
    expect(Math.abs(top.y)).toBeGreaterThan(1);
    expect(normal.angleTo(new Vector3(0, 0, 1))).toBeLessThan(1e-6);

    adapter.dispose();
    canopy.geometry.dispose();
    material.dispose();
  });

  it('uses one curve for the full shield movement', () => {
    const samples = [0, 0.25, 0.5, 0.75, 1].map((progress) => {
      const sample = createEventItemUseSample();
      sampleEventItemUse('umbrella-shield', 'umbrella', progress, sample);
      return sample;
    });

    for (let index = 0; index < samples.length; index += 1) {
      expect(samples[index]!.cameraSpaceBlend)
        .toBeCloseTo(samples[index]!.aimBlend);
    }
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.cameraSpaceBlend)
        .toBeGreaterThan(samples[index - 1]!.cameraSpaceBlend);
      expect(samples[index]!.scaleX)
        .toBeGreaterThan(samples[index - 1]!.scaleX);
    }
    expect(samples[0]!.cameraSpaceBlend).toBe(0);
    expect(samples.at(-1)!.cameraSpaceBlend).toBe(1);
    expect(samples.at(-1)!.viewY).toBeCloseTo(-0.075);
  });

  it('keeps one rotation path across small camera changes', () => {
    const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 1000);
    const root = new Group();
    const actor: BorrowedSupplyActor = {
      instanceId: INSTANCE_ID,
      root,
      applyPose: (pose) => applyRootPose(root, pose),
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    sampleEventItemUse('umbrella-shield', 'umbrella', 0.5, sample);
    adapter.begin(actor, 'umbrella', null, true, 'x');

    camera.rotation.y = -0.00001;
    adapter.apply(sample);
    const leftRotation = root.quaternion.clone();
    camera.rotation.y = 0.00001;
    adapter.apply(sample);
    const rightRotation = root.quaternion.clone();

    expect(leftRotation.angleTo(rightRotation)).toBeLessThan(0.001);
    adapter.dispose();
  });

  it('keeps the final shield pose through the outcome', () => {
    const held = createEventItemUseSample();
    const reaction = createEventItemUseSample();
    sampleEventItemUse('umbrella-shield', 'umbrella', 1, held);
    sampleEventItemOutcome('umbrella-shield', 'umbrella', 'recover', 1, reaction);

    expect(reaction.itemVisible).toBe(true);
    expect(reaction.viewX).toBeCloseTo(held.viewX);
    expect(reaction.viewY).toBeCloseTo(held.viewY);
    expect(reaction.viewZ).toBeCloseTo(held.viewZ);
    expect(reaction.scaleX).toBeCloseTo(held.scaleX);
  });

  it('releases the held shield only when the event clears', async () => {
    const root = new Group();
    const actor: BorrowedSupplyActor = {
      instanceId: INSTANCE_ID,
      root,
      applyPose: vi.fn(),
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const supplies = {
      borrowEventActor: vi.fn(() => actor),
      stowEventItemUntilDay: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const adapter = new EventItemUseAdapter(
      new PerspectiveCamera(),
      new EventItemEffects(),
    );
    const controller = new EventItemUseController(supplies, adapter);
    const use = controller.play({
      eventId: 'death-stare',
      choiceId: 'umbrella',
      instanceId: INSTANCE_ID,
      itemId: 'umbrella',
      context: 'umbrella-shield',
      aimTarget: null,
    });

    controller.update(10);
    await use;
    await controller.react(outcome());
    controller.update(10);

    expect(root.visible).toBe(true);
    expect(actor.release).not.toHaveBeenCalled();

    controller.clear('night');

    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
  });
});
