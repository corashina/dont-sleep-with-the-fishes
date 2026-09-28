// Importance: 95/100. The beam and moving targets must stay synchronized without reviving cleared ghosts.
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
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
  it('aims, flashes three times, and fades each ghost before selecting the next', async () => {
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
        step(progress(0.85));
        expect(sample.primaryEffect).toBe(0);
        expect(ghosts[index]!.visible).toBe(true);
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

  it('renders a beam at each ghost during every flash', () => {
    const { animator, ghosts } = rig();
    const beam = new FlashlightBeam();
    const actor = new Group();
    const center = new Vector3();
    const context = resolveEventItemUseContext('ghosts', 'flashlight', 'flashlight')!;
    const duration = eventItemUseDuration(context);
    const sample = createEventItemUseSample();
    void animator.playItemUse('ghosts', 'flashlight', 'flashlight-1');
    beam.setTarget(animator.itemAimTarget('ghosts'));
    let previous = 0;
    try {
      for (let index = 0; index < ghosts.length; index += 1) {
        for (const flash of [0.275, 0.405, 0.535]) {
          const progress = 0.2 + (index + flash) * 0.15;
          animator.update(progress * duration, (progress - previous) * duration);
          previous = progress;
          sampleEventItemUse(context, 'flashlight', progress, sample);
          beam.updateTarget();
          beam.apply(actor, sample.primaryEffect, sample.secondaryEffect);
          expect(beam.beam.visible).toBe(true);
          expect(beam.light.intensity).toBeGreaterThan(0);
          expect(beam.copyTargetCenter(center)).toBe(true);
          expect(center.distanceTo(ghosts[index]!.position)).toBeLessThan(0.00001);
        }
      }
    } finally { beam.dispose(); animator.dispose(); }
  });

  it('fades each ghost on its float path without moving other ghosts away', () => {
    const { animator, ghosts } = rig();
    const control = rig();
    const duration = supernaturalItemUseDuration('ghosts', 'flashlight')!;
    const materials = ghosts.map(ghost => (ghost.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>).material);
    void animator.playItemUse('ghosts', 'flashlight', 'flashlight-1');
    let previous = 0;
    try {
      for (let index = 0; index < ghosts.length; index += 1) {
        let previousOpacity = 0.56;
        for (const fade of [0.63, 0.72, 0.85, 0.99]) {
          const progress = 0.2 + (index + fade) * 0.15;
          const delta = (progress - previous) * duration;
          animator.update(progress * duration, delta);
          control.animator.update(progress * duration, delta);
          previous = progress;
          expect(materials[index]!.opacity).toBeLessThan(previousOpacity);
          previousOpacity = materials[index]!.opacity;
          expect(ghosts[index]!.position.distanceTo(control.ghosts[index]!.position)).toBeLessThan(0.00001);
          for (let next = index + 1; next < ghosts.length; next += 1) {
            expect(materials[next]!.opacity).toBeCloseTo(0.56);
          }
        }
        expect(materials[index]!.opacity).toBe(0);
      }
    } finally { animator.dispose(); control.animator.dispose(); }
  });
});
