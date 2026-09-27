// Importance: 95/100. The beam and moving targets must stay synchronized without reviving cleared ghosts.
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import {
  createEventItemUseSample, eventItemUseDuration, resolveEventItemUseContext,
  sampleEventItemUse, eventItemActionCueProgresses,
} from '../src/survival/eventItemUseChoreography';
import { supernaturalItemUseDuration } from '../src/survival/supernaturalEventChoreography';

function rig() {
  const models = { create: () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(0.5, 1, 0.5), new MeshStandardMaterial()));
    return root;
  } } as unknown as EventModelLibrary;
  const supplies = { resetEventPoseForFrame: vi.fn(), clearEventPose: vi.fn() } as unknown as BoatSupplyDisplay;
  const animator = new SupernaturalEventAnimator(new Group(), supplies, models, new PerspectiveCamera(), 'ghosts');
  animator.stage('ghosts', 17);
  const ghosts = Array.from({ length: 5 }, (_, index) => animator.worldRoot.getObjectByName('ghost-' + (index + 1))!);
  return { animator, ghosts };
}

describe('Ghosts flashlight sequence', () => {
  it('aims, flashes three times, and drives each ghost away before selecting the next', async () => {
    const { animator, ghosts } = rig();
    const context = resolveEventItemUseContext('ghosts', 'flashlight', 'flashlight')!;
    const duration = eventItemUseDuration(context);
    expect(duration).toBe(supernaturalItemUseDuration('ghosts', 'flashlight'));
    const sample = createEventItemUseSample();
    const played = animator.playItemUse('ghosts', 'flashlight', 'flashlight-1');
    let previous = 0;
    const step = (progress: number) => {
      animator.update(progress * duration, (progress - previous) * duration);
      sampleEventItemUse(context, 'flashlight', progress, sample);
      previous = progress;
    };
    try {
      expect(eventItemActionCueProgresses(context)).toHaveLength(15);
      for (let index = 0; index < 5; index += 1) {
        const progress = (cycle: number) => 0.2 + (index + cycle) * 0.15;
        step(progress(0.21));
        expect(sample.primaryEffect).toBe(0);
        expect(animator.itemAimTarget('ghosts')!.position.distanceTo(ghosts[index]!.position)).toBeLessThan(0.00001);
        for (const flash of [0.275, 0.405, 0.535]) {
          step(progress(flash));
          expect(sample.primaryEffect).toBeGreaterThan(0.99);
          expect(ghosts[index]!.visible).toBe(true);
          expect(animator.itemAimTarget('ghosts')!.position.distanceTo(ghosts[index]!.position)).toBeLessThan(0.00001);
          step(progress(flash + 0.07));
          expect(sample.primaryEffect).toBe(0);
        }
        const before = ghosts[index]!.position.clone();
        step(progress(0.85));
        expect(sample.primaryEffect).toBe(0);
        expect(ghosts[index]!.position.y).toBeGreaterThan(before.y + 3);
        expect(ghosts[index]!.position.z).toBeLessThan(before.z - 8);
        step(progress(0.99));
        expect(ghosts.map(ghost => ghost.visible)).toEqual(ghosts.map((_, ghostIndex) => ghostIndex > index));
      }
      step(1);
      expect(await played).toBe(true);
      const reaction = animator.react('ghosts', { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' }, { choiceId: 'flashlight', actors: [] });
      animator.update(20, 0.4);
      expect(ghosts.every(ghost => !ghost.visible)).toBe(true);
      animator.update(21, 1);
      await reaction;
      animator.update(22, 1);
      expect(ghosts.every(ghost => !ghost.visible)).toBe(true);
    } finally { animator.dispose(); }
  });

  it.each(['clear', 'settleForVisibilityChange'] as const)('cancels through %s and resets for another event', async method => {
    const { animator, ghosts } = rig();
    try {
      const played = animator.playItemUse('ghosts', 'flashlight', 'flashlight-1');
      animator.update(6, 6);
      animator[method]();
      expect(await played).toBe(false);
      expect(ghosts.every(ghost => !ghost.visible)).toBe(true);
      animator.stage('ghosts', 19);
      expect(ghosts.every(ghost => ghost.visible)).toBe(true);
    } finally { animator.dispose(); }
  });
});
