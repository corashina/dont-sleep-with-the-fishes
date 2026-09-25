import { BoxGeometry,Group,Mesh,MeshStandardMaterial,PerspectiveCamera } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { FlyingSaucerPresentation } from '../src/survival/FlyingSaucerPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome,EventResultPresentation } from '../src/survival/survivalTypes';

function fixture() {
  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 1, 0.4);
  const rig = new Group();
  rig.add(camera);
  const model = new Group();
  const mesh = new Mesh(new BoxGeometry(12, 2, 12), new MeshStandardMaterial());
  model.add(mesh);
  const takeCameraControl = vi.fn();
  const presentation = new FlyingSaucerPresentation({
    camera, cameraRig: rig, takeCameraControl,
    propModels: { createEventModel: () => ({ root: model }) },
  } as unknown as FocusedEventPresentationDependencies);
  return { camera, presentation, mesh, takeCameraControl };
}

const result = (resultId: string): EventResultPresentation => ({ eventId: 'flying-saucer', choiceId: 'flashlight', resultId });
const outcome: ActionOutcome = { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' };

describe('flying saucer presentation', () => {
  // Importance: 95/100. Visibility settlement must release the event flow before disposal can cancel it.
  it.each(['settle', 'dispose'] as const)('settles the pending beam hit on %s', async (action) => {
    const { presentation, camera, mesh } = fixture();
    const disposed = vi.fn();
    const finished = vi.fn();
    mesh.geometry.addEventListener('dispose', disposed);
    try {
      presentation.stage();
      const hit = presentation.react(result('ufo-beam-hit'), outcome).then(finished);
      await Promise.resolve();
      expect(finished).not.toHaveBeenCalled();
      if (action === 'settle') {
        presentation.settleForVisibilityChange();
        await Promise.resolve();
        expect(finished).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
        expect(presentation.root.userData.state).toBe('hit');
      }
      presentation.dispose();
      await hit;
      expect(finished).toHaveBeenCalledOnce();
      expect(camera.position.y).toBe(1);
      expect(disposed).toHaveBeenCalledOnce();
      presentation.dispose();
      expect(disposed).toHaveBeenCalledOnce();
    } finally {
      presentation.dispose();
    }
  });
});
