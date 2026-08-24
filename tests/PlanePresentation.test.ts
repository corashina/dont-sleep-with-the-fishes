import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { PlanePresentation } from '../src/survival/PlanePresentation';
import { resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';

function createPresentation(camera = new PerspectiveCamera()): PlanePresentation {
  const model = new Group();
  model.add(new Mesh(
    new BoxGeometry(3, 0.5, 2),
    new MeshStandardMaterial({
      color: 0xffffff,
      map: new Texture(),
    }),
  ));
  const dependencies = {
    propModels: {
      createEventModel: vi.fn(() => ({ root: model, animations: [] })),
    },
    waves: [],
    cameraRig: new Group(),
    camera,
    supplyDisplay: {
      pinEventActor: vi.fn(() => true),
      releaseEventActor: vi.fn(),
      releaseEventActorOnNextSync: vi.fn(),
      clearEventPose: vi.fn(),
      applyEventItemPose: vi.fn(),
    },
    chestDisplay: {},
    emitCue: vi.fn(),
  } as unknown as FocusedEventPresentationDependencies;
  return new PlanePresentation(dependencies);
}

describe('PlanePresentation', () => {
  it('keeps the player camera fixed during the opening flight', async () => {
    const camera = new PerspectiveCamera();
    camera.position.set(2, 3, 4);
    camera.rotation.set(0.1, -0.2, 0.05);
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    const presentation = createPresentation(camera);

    presentation.stage(0);
    const reveal = presentation.reveal();
    presentation.update(2, 2);
    await reveal;

    expect(camera.position.distanceTo(position)).toBe(0);
    expect(camera.quaternion.angleTo(quaternion)).toBe(0);
    presentation.dispose();
  });

  it('keeps one speed from entry through the choice window', async () => {
    const presentation = createPresentation();
    const airplane = presentation.root.getObjectByName('plane-aircraft')!;
    presentation.stage(0);
    const reveal = presentation.reveal();

    const samples = [airplane.position.clone()];
    for (let index = 1; index <= 4; index += 1) {
      presentation.update(index * 0.5, 0.5);
      samples.push(airplane.position.clone());
    }
    await reveal;
    presentation.update(2.5, 0.5);
    samples.push(airplane.position.clone());

    const distances = samples.slice(1).map((sample, index) => (
      sample.distanceTo(samples[index]!)
    ));
    expect(distances[0]).toBeGreaterThan(0);
    distances.slice(1).forEach((distance) => {
      expect(distance).toBeCloseTo(distances[0]!, 5);
    });
    presentation.dispose();
  });

  it.each([0, 1])('starts outside view and enters view shortly for seed %i', (seed) => {
    const camera = new PerspectiveCamera(80, 16 / 9, 0.1, 500);
    camera.updateProjectionMatrix();
    const presentation = createPresentation(camera);
    const airplane = presentation.root.getObjectByName('plane-aircraft')!;

    presentation.stage(seed);
    const startScreenPosition = airplane.position.clone().project(camera);
    presentation.reveal();
    presentation.update(1.5, 1.5);
    const visibleScreenPosition = airplane.position.clone().project(camera);

    expect(Math.abs(startScreenPosition.x)).toBeGreaterThan(1.15);
    expect(Math.abs(visibleScreenPosition.x)).toBeLessThan(1);
    presentation.dispose();
  });

  it('uses the original plane texture for its night glow', () => {
    const presentation = createPresentation();
    const model = presentation.root.getObjectByName('event-model:airplane')!;
    const mesh = model.children[0] as Mesh;
    const planeMaterial = mesh.material as MeshStandardMaterial;

    expect(planeMaterial.emissiveIntensity).toBe(0.2);
    expect(planeMaterial.emissiveMap).toBe(planeMaterial.map);
    expect(planeMaterial.emissive.getHex()).toBe(0xffffff);
    presentation.dispose();
  });

  it.each([
    { seed: 0, side: 'left', direction: 1 },
    { seed: 1, side: 'right', direction: -1 },
  ])('flies from the $side at high altitude while facing its path', async ({
    seed,
    side,
    direction,
  }) => {
    const presentation = createPresentation();
    const airplane = presentation.root.getObjectByName('plane-aircraft')!;

    presentation.stage(seed);
    const start = airplane.position.clone();
    const reveal = presentation.reveal();
    presentation.update(2, 2);
    await reveal;

    const cruiseStart = airplane.position.clone();
    presentation.update(4.2, 1);
    const travel = airplane.position.clone().sub(cruiseStart).normalize();
    const facing = new Vector3(1, 0, 0)
      .applyQuaternion(airplane.quaternion)
      .normalize();
    expect(presentation.root.getObjectByName('event-model:airplane')).toBeDefined();
    expect(presentation.root.userData.eventSide).toBe(side);
    expect(start.x * direction).toBeLessThan(0);
    expect(airplane.position.x * direction).toBeGreaterThan(start.x * direction);
    expect(start.y).toBeGreaterThanOrEqual(23);
    expect(airplane.position.y).toBeGreaterThanOrEqual(23);
    expect(facing.dot(travel)).toBeGreaterThan(0.99);
    expect(presentation.root.userData.state).toBe('revealed');
    presentation.dispose();
  });

  it('supports signals and lets the plane pass', async () => {
    const presentation = createPresentation();
    presentation.stage();
    const airplane = presentation.root.getObjectByName('plane-aircraft')!;
    const reveal = presentation.reveal();
    presentation.update(2, 2);
    await reveal;

    const signal = presentation.playChoice({
      choiceId: 'flashlight',
      instanceId: 'flashlight-1',
      condition: 'usable',
    });
    presentation.update(2, 2);
    await signal;
    await presentation.react({
      eventId: 'plane',
      choiceId: 'flashlight',
      resultId: 'plane-signaled',
    }, {} as never);
    expect(presentation.root.userData.state).toBe('signal-sent');

    const pass = presentation.playChoice({
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    presentation.update(1, 1);
    await pass;
    const exitStart = airplane.position.clone();
    const reaction = presentation.react({
      eventId: 'plane',
      choiceId: 'sleep',
      resultId: 'plane-pass',
    }, {} as never);
    presentation.update(0.5, 0.5);
    expect(airplane.position.distanceTo(exitStart)).toBeCloseTo(10, 5);
    presentation.settleForVisibilityChange();
    await reaction;
    const exitTravel = airplane.position.clone().sub(exitStart).normalize();
    const exitFacing = new Vector3(1, 0, 0)
      .applyQuaternion(airplane.quaternion)
      .normalize();
    expect(presentation.root.userData.state).toBe('held-pass');
    expect(exitFacing.dot(exitTravel)).toBeGreaterThan(0.99);
    expect(airplane.visible).toBe(false);
    presentation.dispose();
  });

  it('uses the shared flare-to-sky motion', () => {
    expect(resolveEventItemUseContext('plane', 'flareGun', 'flareGun'))
      .toBe('flare-sky');
  });
});
