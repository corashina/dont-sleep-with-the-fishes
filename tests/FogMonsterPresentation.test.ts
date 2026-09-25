import { describe, expect, it, vi } from 'vitest';
import { AnimationClip, Group, NumberKeyframeTrack, PerspectiveCamera, Vector3 } from 'three';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import type { ActionOutcome } from '../src/survival/survivalTypes';

function attackFixture() {
  const root = new Group();
  const claw = new Group();
  claw.name = 'claw';
  const lowerJaw = new Group(); lowerJaw.name = 'jawlow_3'; lowerJaw.position.set(0, 0.5, 1.2);
  const upperJaw = new Group(); upperJaw.name = 'jawhigh_3'; upperJaw.position.set(0, 0.7, 1.2);
  root.add(claw, lowerJaw, upperJaw);
  const emitCue = vi.fn();
  root.animations = [
    new AnimationClip('moving', 1, [new NumberKeyframeTrack('claw.rotation[x]', [0, 1], [0, 0])]),
    new AnimationClip('attack', 1.2, [new NumberKeyframeTrack('claw.rotation[x]', [0, 0.6, 1.2], [0, 1, 0])]),
  ];
  const camera = new PerspectiveCamera(80, 16 / 9, 0.1, 100);
  camera.position.set(0, 1.38, -1.42);
  const animator = new WeatherEventAnimator(new Group(), {
    clearEventPose: vi.fn(), resetEventPoseForFrame: vi.fn(),
  } as unknown as BoatSupplyDisplay, {
    create: () => ({ root, dispose: vi.fn() }),
  } as unknown as EventModelLibrary, camera, 'monster-in-the-fog', undefined, emitCue);
  animator.stage('monster-in-the-fog', 19);
  const monster = animator.worldRoot.getObjectByName('fog-monster')!;
  return { animator, monster, claw, camera, emitCue, lowerJaw, upperJaw };
}

function outcome(deltas: ActionOutcome['deltas']): ActionOutcome {
  return { accepted: true, code: 'event-resolved', message: '', deltas, cue: 'impact' };
}

describe('fog monster presentation', () => {
  // Importance: 95/100. Hull damage must show a boat bite and finish before event flow continues.
  it.each(['flashlight', 'sleep'])('approaches slowly, bites the boat, and resets after %s', async (choiceId) => {
    const { animator, monster, claw, camera, emitCue, lowerJaw, upperJaw } = attackFixture();
    const start = monster.position.clone();
    const view = camera.quaternion.clone();
    const finished = vi.fn();
    try {
      const reaction = animator.react('monster-in-the-fog', outcome({ hull: -20 }), { choiceId, actors: [] });
      void reaction.then(finished);
      animator.update(1, 1);
      expect(monster.position.z).toBeLessThan(-18);
      expect(emitCue).not.toHaveBeenCalled();
      expect(camera.quaternion.angleTo(view)).toBeLessThan(0.001);
      animator.update(3.6, 2.6);
      expect(monster.position.z).toBeGreaterThan(-5);
      expect(claw.rotation.x).toBeGreaterThan(0.5);
      expect(camera.quaternion.angleTo(view)).toBeLessThan(0.001);
      animator.update(4, 0.4);
      expect(emitCue).toHaveBeenCalledExactlyOnceWith({ eventId: 'monster-in-the-fog', cue: 'bite' });
      const mouth = lowerJaw.getWorldPosition(new Vector3()).add(upperJaw.getWorldPosition(new Vector3())).multiplyScalar(0.5);
      expect(mouth.distanceTo(new Vector3(0, 0.472, -3))).toBeLessThan(0.001);
      expect(camera.quaternion.angleTo(view)).toBeGreaterThan(0.01);
      await Promise.resolve();
      expect(finished).not.toHaveBeenCalled();
      animator.update(5, 1);
      await reaction;
      expect(monster.position.distanceTo(start)).toBeLessThan(0.001);
      expect(camera.quaternion.angleTo(view)).toBeLessThan(0.001);
      expect(claw.rotation.x).toBeCloseTo(0);
      expect(finished).toHaveBeenCalledOnce();
    } finally { animator.dispose(); }
  });

  // Importance: 95/100. Safe results must not trigger a bite.
  it.each([{}, { pressure: 1 }, { health: -20 }])('does not attack without hull loss: %j', async (deltas) => {
    const { animator, monster, claw } = attackFixture();
    try {
      const reaction = animator.react('monster-in-the-fog', outcome(deltas), null);
      animator.update(0.84, 0.84);
      await reaction;
      expect(monster.position.z).toBeLessThan(-20);
      expect(claw.rotation.x).toBeCloseTo(0);
    } finally { animator.dispose(); }
  });

  // Importance: 95/100. Interrupted attacks must resolve and release the camera and monster pose.
  it.each(['clear', 'settleForVisibilityChange', 'dispose'] as const)('cleans up an attack on %s', async (method) => {
    const { animator, monster, claw, camera } = attackFixture();
    const start = monster.position.clone();
    const view = camera.quaternion.clone();
    try {
      const reaction = animator.react('monster-in-the-fog', outcome({ hull: -20 }), null);
      animator.update(4, 4);
      expect(monster.position.z).toBeGreaterThan(-5);
      animator[method]();
      await reaction;
      expect(monster.position.distanceTo(start)).toBeLessThan(0.001);
      expect(camera.quaternion.angleTo(view)).toBeLessThan(0.001);
      expect(claw.rotation.x).toBeCloseTo(0);
      if (method !== 'settleForVisibilityChange') expect(monster.visible).toBe(false);
      if (method !== 'dispose') {
        animator.stage('monster-in-the-fog', 19);
        expect(monster.position.distanceTo(start)).toBeLessThan(0.001);
      }
    } finally { animator.dispose(); }
  });

  // Importance: 95/100. The threat must exist before the event becomes visible.
  it('shows the monster at staging and throughout the reveal, then clears it', async () => {
    const supplies = {
      clearEventPose: vi.fn(), resetEventPoseForFrame: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const models = {
      create: () => ({ root: new Group(), dispose: vi.fn() }),
    } as unknown as EventModelLibrary;
    const animator = new WeatherEventAnimator(new Group(), supplies, models, undefined, 'monster-in-the-fog');
    const monster = animator.worldRoot.getObjectByName('fog-monster')!;
    try {
      animator.stage('monster-in-the-fog', 19);
      expect(monster.visible).toBe(true);
      const reveal = animator.reveal('monster-in-the-fog');
      expect(monster.visible).toBe(true);
      for (const delta of [0, 0.1, 0.9, 1, 3.2]) {
        animator.update(0, delta);
        expect(monster.visible).toBe(true);
      }
      await reveal;
      animator.clear();
      expect(monster.visible).toBe(false);
    } finally { animator.dispose(); }
  });
});
