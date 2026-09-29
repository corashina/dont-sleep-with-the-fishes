import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GhostShipPresentation } from '../src/survival/GhostShipPresentation';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from '../src/survival/survivalTypes';

function fixture() {
  const model = new Group();
  const mesh = new Mesh(new BoxGeometry(8, 12, 28), new MeshStandardMaterial());
  model.add(mesh);
  const camera = new PerspectiveCamera(60, 16 / 9);
  const presentation = new GhostShipPresentation({
    propModels: { createEventModel: () => ({ root: model }) },
    camera,
  } as unknown as FocusedEventPresentationDependencies);
  return { presentation, mesh, camera };
}
const result = (resultId: string): EventResultPresentation => ({ eventId: 'ghost-ship', choiceId: 'flashlight', resultId });
const outcome: ActionOutcome = { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' };

describe('ghost ship presentation', () => {
  // Importance: 95/100. A meshless aim marker must not suppress the flashlight signal.
  it('shows the flashlight beam toward the moving ship and hides it after clearing', () => {
    const { presentation } = fixture();
    const beam = new FlashlightBeam();
    const actor = new Group();
    try {
      presentation.stage();
      beam.setTarget(presentation.itemAimTarget());
      for (const time of [0, 2, 4]) {
        presentation.update(time, 2);
        beam.updateTarget();
        beam.apply(actor, 1, 0);
        expect(beam.beam.visible).toBe(true);
        expect(beam.light.intensity).toBeGreaterThan(0);
      }
      presentation.clear();
      beam.updateTarget();
      beam.apply(actor, 1, 0);
      expect(beam.beam.visible).toBe(false);
    } finally {
      beam.dispose();
      presentation.dispose();
    }
  });

  it.each(['clear', 'dispose'] as const)('releases pending reactions on %s and supports a fresh stage', async (action) => {
    const { presentation, mesh } = fixture();
    const dispose = vi.fn();
    mesh.geometry.addEventListener('dispose', dispose);
    presentation.stage();
    const reaction = presentation.react(result('ghost-ship-signaled'), outcome);
    presentation[action]();
    await reaction;
    expect(presentation.root.visible).toBe(false);
    if (action !== 'dispose') {
      presentation.stage(1);
      expect(presentation.itemAimTarget()!.position.x).toBe(56);
      expect(presentation.root.visible).toBe(true);
    }
    presentation.dispose();
    presentation.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
