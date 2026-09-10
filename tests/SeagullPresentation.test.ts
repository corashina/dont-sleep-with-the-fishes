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
  it.each([0, 1])('flies level with the sea when the camera starts tilted for seed %s', (seed) => {
    const r = rig(seed);
    try {
      r.camera.rotation.set(-0.12, 0.2, 0.3);
      r.birds.stage(seed);
      const bird = r.birds.root.getObjectByName('distant-seagull-0')!;
      const before = bird.getWorldPosition(new Vector3());
      void r.birds.reveal();
      r.birds.update(2, 2);
      const after = bird.getWorldPosition(new Vector3());
      expect(after.y).toBeCloseTo(before.y, 6);
      expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
    } finally { r.dispose(); }
  });

  it.each([0, 1])('enters from offscreen after dawn in direction %s', (seed) => {
    const r = rig(seed);
    try {
      for (let index = 0; index < 21; index += 1) {
        const bird = r.birds.root.getObjectByName(`distant-seagull-${index}`)!;
        const before = bird.getWorldPosition(new Vector3()).project(r.camera);
        expect(Math.abs(before.x)).toBeGreaterThan(1);
        expect(before.y).toBeGreaterThan(0.1);
        expect(before.y).toBeLessThan(0.8);
      }
      const bird = r.birds.root.getObjectByName('distant-seagull-0')!;
      const before = bird.position.x;
      const screenBefore = bird.getWorldPosition(new Vector3()).project(r.camera).x;
      r.birds.update(5, 5);
      expect(bird.position.x).toBe(before);
      void r.birds.reveal();
      r.birds.update(1, 1);
      expect(Math.sign(bird.position.x - before)).toBe(seed === 0 ? 1 : -1);
      const screenAfter = bird.getWorldPosition(new Vector3()).project(r.camera).x;
      expect(Math.abs(screenAfter - screenBefore)).toBeGreaterThan(0.15);
      expect(Math.abs(screenAfter)).toBeLessThan(1);
      const heading = new Vector3(0, 0, 1).applyQuaternion(bird.quaternion);
      expect(heading.x * (seed === 0 ? 1 : -1)).toBeGreaterThan(0.9);
      const left = bird.getObjectByName('left-wing')!;
      const right = bird.getObjectByName('right-wing')!;
      const flapBefore = left.rotation.z;
      const bodyScale = bird.scale.clone();
      r.birds.update(1.1, 0.1);
      expect(Math.abs(left.rotation.z - flapBefore)).toBeGreaterThan(0.1);
      expect(left.rotation.z).toBe(-right.rotation.z);
      expect(bird.scale.equals(bodyScale)).toBe(true);
      expect(r.grab).not.toHaveBeenCalled();
      expect(r.birds.root.getObjectByName('seagull-thief')!.visible).toBe(false);
    } finally { r.dispose(); }
  });

  it.each([0, 1])('keeps a V formation and retires birds after crossing for seed %s', (seed) => {
    const r = rig(seed);
    try {
      const leader = r.birds.root.getObjectByName('distant-seagull-0')!;
      const direction = seed === 0 ? 1 : -1;
      for (let rank = 1; rank <= 10; rank += 1) {
        const upper = r.birds.root.getObjectByName(`distant-seagull-${rank * 2 - 1}`)!;
        const lower = r.birds.root.getObjectByName(`distant-seagull-${rank * 2}`)!;
        expect(direction * (leader.position.x - upper.position.x)).toBeGreaterThan(0);
        expect(upper.position.x).toBe(lower.position.x);
        expect(upper.position.y).toBeGreaterThan(leader.position.y);
        expect(lower.position.y).toBeLessThan(leader.position.y);
      }
      void r.birds.reveal();
      r.birds.update(12, 12);
      expect(leader.visible).toBe(false);
      expect(r.birds.root.getObjectByName('distant-seagull-20')!.visible).toBe(true);
      r.birds.update(18, 6);
      r.birds.update(60, 48);
      for (let index = 0; index < 21; index += 1) {
        const bird = r.birds.root.getObjectByName(`distant-seagull-${index}`)!;
        expect(bird.visible).toBe(false);
        expect(direction * bird.getWorldPosition(new Vector3()).project(r.camera).x).toBeGreaterThan(1);
      }
      r.birds.stage(seed);
      for (let index = 0; index < 21; index += 1) {
        expect(r.birds.root.getObjectByName(`distant-seagull-${index}`)!.visible).toBe(true);
      }
    } finally { r.dispose(); }
  });

  it.each([0, 1])('waits for dawn, grips the can, and exits upward for seed %s', async (seed) => {
    const r = rig(seed);
    try {
      const done = vi.fn();
      const reveal = r.birds.reveal().then(done);
      const gull = r.birds.root.getObjectByName('seagull-thief')!;
      r.birds.update(2.99, 2.99);
      expect(gull.visible).toBe(false);
      r.birds.update(3, 0.01);
      const entry = gull.getWorldPosition(new Vector3()).project(r.camera);
      expect(entry.y).toBeGreaterThan(1);
      expect(Math.sign(entry.x)).toBe(seed === 0 ? -1 : 1);
      r.birds.update(3.7, 0.7);
      expect(r.grab).toHaveBeenCalledOnce();
      expect(r.session.snapshot().food).toBe(2);
      const actor = r.supplies.borrowEventActor(r.supplies.foodSupplyActorId)!;
      actor.root.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(actor.root.children[0]!);
      const grip = bounds.getCenter(new Vector3());
      grip.y = bounds.max.y;
      expect(grip.distanceTo(gull.position)).toBeLessThan(0.0001);
      r.birds.update(4.1, 0.4);
      actor.root.updateWorldMatrix(true, true);
      bounds.setFromObject(actor.root.children[0]!).getCenter(grip);
      grip.y = bounds.max.y;
      expect(grip.distanceTo(gull.position)).toBeLessThan(0.0001);
      expect(r.supplies.recordFor('cannedFood')!.root.visible).toBe(true);
      r.birds.update(4.5, 0.4);
      await reveal;
      expect(done).toHaveBeenCalledOnce();
      expect(gull.visible).toBe(false);
      expect(gull.getWorldPosition(new Vector3()).project(r.camera).y).toBeGreaterThan(1);
      expect(r.birds.root.visible).toBe(true);
      expect(r.grab).toHaveBeenCalledOnce();
      expect(r.supplies.recordFor('cannedFood')!.visibleCopies).toBe(2);
    } finally { r.dispose(); }
  });

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
