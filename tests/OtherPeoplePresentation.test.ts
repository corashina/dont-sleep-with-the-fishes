import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { OtherPeoplePresentation } from '../src/survival/OtherPeoplePresentation';

describe('Other People departure', () => {
  it.each([0, 1])('keeps cruise motion while fading, then restores the next event (seed %s)', async (seed) => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
    const material = new MeshStandardMaterial();
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(2, 2, 5), material));
    const presentation = new OtherPeoplePresentation({
      camera,
      propModels: { createEventModel: () => ({ root: model }) },
      supplyDisplay: { releaseEventActor: vi.fn(), clearEventPose: vi.fn() },
    } as unknown as FocusedEventPresentationDependencies);
    try {
      presentation.stage(seed);
      const reveal = presentation.reveal();
      presentation.update(3.4, 3.4);
      await reveal;
      const ship = presentation.root.getObjectByName('other-people-ship')!;
      const beforeCruise = ship.position.clone();
      presentation.update(4.4, 1);
      const cruiseStep = ship.position.clone().sub(beforeCruise);
      const cameraRotation = camera.quaternion.clone();
      const shipRotation = ship.quaternion.clone();
      const departureStart = ship.position.clone();
      const result = presentation.react({
        eventId: 'other-people', choiceId: 'sleep', resultId: 'people-pass',
      }, { accepted: true, code: 'event', message: '', deltas: {}, cue: 'sighting' });
      expect(ship.position.distanceTo(departureStart)).toBe(0);
      for (let second = 1; second <= 4; second += 1) {
        presentation.update(4.4 + second, 1);
        expect(ship.position.distanceTo(departureStart.clone().addScaledVector(cruiseStep, second)))
          .toBeLessThan(1e-10);
        expect(ship.quaternion.equals(shipRotation)).toBe(true);
        expect(camera.quaternion.equals(cameraRotation)).toBe(true);
        expect(material.opacity).toBeGreaterThan(0);
        expect(material.opacity).toBeLessThan(1);
      }
      presentation.update(8.6, 0.21);
      await result;
      expect(ship.visible).toBe(false);
      expect(material.opacity).toBe(0);
      presentation.clear();
      presentation.stage(seed);
      expect(ship.visible).toBe(true);
      expect(material.opacity).toBe(1);
      expect(material.transparent).toBe(false);
      expect(material.depthWrite).toBe(true);
    } finally {
      presentation.dispose();
    }
  });
});
