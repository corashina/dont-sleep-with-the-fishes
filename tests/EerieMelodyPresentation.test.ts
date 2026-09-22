import { BoxGeometry, Group, Mesh, MeshStandardMaterial, ShaderMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import { supernaturalItemUseDuration, supernaturalRevealDuration } from '../src/survival/supernaturalEventChoreography';

describe('Eerie Melody fog', () => {
  it.each([-10])('keeps fog stable through every phase with health change %s', async (health) => {
    const display = {
      resetEventPoseForFrame: vi.fn(), clearEventPose: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const models = {
      create: () => {
        const model = new Group();
        model.add(new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()));
        return model;
      },
    } as unknown as EventModelLibrary;
    const animator = new SupernaturalEventAnimator(new Group(), display, models, undefined, 'eerie-melody');
    try {
      animator.stage('eerie-melody');
      const fog = animator.worldRoot.getObjectByName('supernatural-sea-mist')!;
      const snapshot = () => ({
        visible: fog.visible,
        scale: fog.scale.toArray(),
        layers: fog.children.map((child) => {
          const mesh = child as Mesh;
          const material = mesh.material as ShaderMaterial;
          return [material.uniforms.uOpacity!.value, ...mesh.position.toArray()];
        }),
      });
      const staged = snapshot();
      const advance = (duration: number) => {
        for (let frame = 0; frame < 20; frame += 1) {
          animator.update(0, duration / 20);
          expect(snapshot()).toEqual(staged);
        }
        animator.update(0, 0.001);
      };
      const reveal = animator.reveal('eerie-melody');
      advance(supernaturalRevealDuration('eerie-melody')!);
      await reveal;
      advance(3);
      const item = animator.playItemUse('eerie-melody', 'ductTape', 'ductTape-0');
      advance(supernaturalItemUseDuration('eerie-melody', 'ductTape')!);
      await item;
      const reaction = animator.react('eerie-melody', {
        accepted: true, code: 'event-resolved', message: '', deltas: { health }, cue: 'none',
      }, null);
      // Check the attack before the event's final cleanup.
      advance(0.8);
      animator.update(0, 1);
      await reaction;
      animator.clear();
      expect(fog.visible).toBe(false);
    } finally {
      animator.dispose();
    }
  });
});
