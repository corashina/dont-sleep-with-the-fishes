import { Box3, Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SeagullPresentation } from '../src/survival/SeagullPresentation';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

function rig(seed = 0, food = 3) {
  const scene = new Group();
  const boat = new Group();
  scene.add(boat);
  const camera = new PerspectiveCamera(80, 16 / 9, 0.1, 500);
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  const models = createTestPropModels();
  const session = new SurvivalSession([], {
    seed: 17, initial: { day: 4, food }, initialEventId: 'seagull-theft',
  });
  const supplies = new BoatSupplyDisplay(models, boat, []);
  supplies.sync(session.snapshot());
  const grab = vi.fn(() => {
    session.resolveEvent({ kind: 'choice', choiceId: 'steal' });
    supplies.sync(session.snapshot());
  });
  const birds = new SeagullPresentation(camera, supplies, grab);
  scene.add(birds.root);
  birds.stage(seed);
  return { scene, boat, camera, session, supplies, grab, birds,
    dispose: () => { birds.dispose(); supplies.dispose(); models.dispose(); } };
}

describe('seagull animation', () => {
  it('keeps the last can attached after food reaches zero', async () => {
    const r = rig(0, 1);
    try {
      const reveal = r.birds.reveal();
      r.birds.update(3.9, 3.9);
      expect(r.session.snapshot().food).toBe(0);
      const actor = r.supplies.borrowEventActor(r.supplies.foodSupplyActorId)!;
      expect(actor.root.visible).toBe(true);
      r.birds.update(4.5, 0.6);
      await reveal;
      expect(r.supplies.recordFor('cannedFood')!.visibleCopies).toBe(0);
    } finally { r.dispose(); }
  });

  it('tracks the can while the boat rocks during the dive and escape', async () => {
    const r = rig();
    try {
      const reveal = r.birds.reveal();
      r.birds.update(3.3, 3.3);
      r.boat.position.y = 0.13;
      r.boat.rotation.z = 0.09;
      r.supplies.applyEventAmbientPose(0.03, 0.06);
      r.supplies.update(0.4);
      r.birds.update(3.7, 0.4);
      r.boat.rotation.z = -0.07;
      r.birds.update(4, 0.3);
      const actor = r.supplies.borrowEventActor(r.supplies.foodSupplyActorId)!;
      actor.root.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(actor.root.children[0]!);
      const grip = bounds.getCenter(new Vector3());
      grip.y = bounds.max.y;
      const beak = r.birds.root.getObjectByName('seagull-thief')!.position;
      expect(grip.distanceTo(beak)).toBeLessThan(0.0001);
      r.birds.update(4.5, 0.5);
      await reveal;
    } finally { r.dispose(); }
  });

  it('does not grab on a visibility change and releases ownership on cancellation', async () => {
    const r = rig();
    try {
      const reveal = r.birds.reveal();
      r.birds.update(3.3, 3.3);
      r.birds.settleForVisibilityChange();
      expect(r.grab).not.toHaveBeenCalled();
      r.birds.clear();
      await reveal;
      r.birds.update(10, 10);
      expect(r.grab).not.toHaveBeenCalled();
      expect(r.supplies.recordFor('cannedFood')!.visibleCopies).toBe(3);
      expect(r.supplies.recordFor('cannedFood')!.root.visible).toBe(true);
    } finally { r.dispose(); }
  });
});
