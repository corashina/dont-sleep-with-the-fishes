import { Box3, Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { StarryNightPresentation, STARRY_NIGHT_REVEAL_SECONDS, STARRY_NIGHT_BLESSING_SECONDS } from '../src/survival/events/StarryNightPresentation';
import type { DedicatedEventEnvironment, EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { SURVIVAL_CELESTIAL_DIRECTION } from '../src/world/celestialLight';

function setup(aspect = 16/9) {
  const camera = new PerspectiveCamera(80, aspect, 0.1, 1000);
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  const presentation = new StarryNightPresentation({ camera } as DedicatedEventEnvironment);
  new Group().add(presentation.worldRoot, presentation.boatRoot);
  presentation.stage({ eventId: 'starry-night', targetInstanceId: null, variantSeed: 7 });
  return { presentation, camera, position, quaternion };
}

function result(choiceId: string): EventOutcomePresentation {
  return { outcome: { eventResult: { eventId: 'starry-night', choiceId, resultId: `starry-night-${choiceId}` } } } as EventOutcomePresentation;
}

describe('Starry Night presentation', () => {
  it('centers the enlarged constellation on the moon as the boat moves', () => {
    const { presentation, camera } = setup();
    const target = presentation.interactionTargets()[0]!.root;
    expect(target.scale.x).toBe(2.2);
    const moonDirection = new Vector3(...SURVIVAL_CELESTIAL_DIRECTION).normalize();
    for (const position of [[0, 0.88, 1.56], [2, 1.2, -3]]) {
      camera.position.set(position[0]!, position[1]!, position[2]!);
      presentation.update(0, 1);
      const direction = target.getWorldPosition(new Vector3()).sub(camera.position).normalize();
      expect(direction.distanceTo(moonDirection)).toBeLessThan(0.000001);
    }
    presentation.dispose();
  });

  it.each([16/9, 1])('keeps the whole constellation in the forward view at aspect %s', async (aspect) => {
    const { presentation, camera } = setup(aspect);
    const reveal = presentation.reveal();
    presentation.update(0, STARRY_NIGHT_REVEAL_SECONDS);
    await reveal;
    const [target] = presentation.interactionTargets();
    expect(target).toMatchObject({ id: 'starry-night:constellation', choiceId: 'wish' });
    expect(target!.root.visible).toBe(true);
    expect(target!.root.children).toHaveLength(2);
    const targetPosition = target!.root.getWorldPosition(camera.position.clone());
    camera.updateMatrixWorld();
    targetPosition.project(camera);
    expect(Math.abs(targetPosition.x)).toBeLessThan(1);
    expect(Math.abs(targetPosition.y)).toBeLessThan(1);
    const bounds = new Box3().setFromObject(target!.root);
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        const point = new Vector3(x, y, bounds.min.z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
      }
    }
    presentation.dispose();
  });

  it.each(['wish', 'sleep'])('keeps the default camera throughout %s and clears the lights', async (choiceId) => {
    const { presentation, camera, position, quaternion } = setup();
    const reveal = presentation.reveal();
    presentation.update(0, STARRY_NIGHT_REVEAL_SECONDS/2);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(0.000001);
    presentation.settleForVisibilityChange();
    await reveal;
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(0.000001);
    const reaction = presentation.react(result(choiceId));
    presentation.update(0, STARRY_NIGHT_BLESSING_SECONDS/2);
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(0.000001);
    presentation.settleForVisibilityChange();
    await reaction;
    presentation.clear();
    expect(camera.position.equals(position)).toBe(true);
    expect(camera.quaternion.angleTo(quaternion)).toBeLessThan(0.000001);
    expect(presentation.worldRoot.visible).toBe(false);
    expect(presentation.boatRoot.children[0]).toHaveProperty('intensity', 0);
    presentation.dispose();
  });

  it('cancels a reveal and disposes each owned mesh once', async () => {
    const { presentation } = setup();
    const target = presentation.interactionTargets()[0]!.root;
    const mesh = target.children[0] as import('three').Mesh;
    const dispose = vi.spyOn(mesh.geometry, 'dispose');
    const reveal = presentation.reveal();
    presentation.dispose();
    presentation.dispose();
    await reveal;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(presentation.worldRoot.children).toHaveLength(0);
  });
});
