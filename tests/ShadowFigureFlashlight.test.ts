// Importance: 95/100. The selected flashlight must emit a beam toward the false cat.
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CarlitosEventPresentation } from '../src/survival/events/CarlitosEventPresentation';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { createEventItemUseSample, resolveEventItemUseContext, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import type { BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import type { DedicatedEventEnvironment } from '../src/survival/eventPresentationTypes';

describe('Shadow Figure flashlight', () => {
  it('lights the false cat when selected and stops after the event clears', () => {
    const root = new Group();
    const pose = new Group();
    pose.name = 'carlitos-pose';
    const head = new Group();
    head.name = 'carlitos-head-pose';
    const interaction = new Group();
    interaction.name = 'carlitos-interaction';
    const hand = new Group();
    hand.name = 'carlitos-care-hand';
    const mesh = new Mesh(new BoxGeometry(0.5, 0.6, 0.5), new MeshStandardMaterial());
    pose.add(head, mesh);
    interaction.add(pose);
    root.add(interaction, hand);
    root.position.set(-1.2, 0.5, -2);
    const presentation = new CarlitosEventPresentation('shadow-figure', {
      carlitos: { root },
    } as unknown as DedicatedEventEnvironment);
    const actor: BorrowedSupplyActor = {
      instanceId: 'flashlight-1', root: new Group(), applyPose: vi.fn(),
      releaseOnNextSync: vi.fn(), release: vi.fn(),
    };
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(new PerspectiveCamera(), effects);
    const sample = createEventItemUseSample();
    try {
      presentation.stage({ eventId: 'shadow-figure', targetInstanceId: null, variantSeed: 19 });
      adapter.begin(actor, 'flashlight', presentation.itemAimTarget);
      const context = resolveEventItemUseContext('shadow-figure', 'flashlight', 'flashlight')!;
      sampleEventItemUse(context, 'flashlight', 0.6, sample);
      adapter.apply(sample);
      expect(effects.flashlight.beam.visible).toBe(true);
      expect(effects.flashlight.light.intensity).toBeGreaterThan(0);
      presentation.clear();
      adapter.apply(sample);
      expect(effects.flashlight.beam.visible).toBe(false);
    } finally {
      adapter.dispose();
      presentation.dispose();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  });
});
