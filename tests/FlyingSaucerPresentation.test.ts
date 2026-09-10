import { BoxGeometry,Group,Mesh,MeshStandardMaterial,PerspectiveCamera } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { FlyingSaucerPresentation,UFO_ABDUCTION_DURATION } from '../src/survival/FlyingSaucerPresentation';
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

  it('approaches before the beam opens, then lifts the camera before resolving', async () => {
    const { presentation, camera, takeCameraControl } = fixture();
    try {
      presentation.stage(1);
      const reveal = presentation.reveal();
      presentation.update(2, 2);
      await reveal;
      const done = vi.fn();
      const abduction = presentation.react(result('ufo-abduction'), outcome).then(done);
      const beam = presentation.root.getObjectByName('ufo-abduction-beam')!;
      presentation.update(6, 4);
      expect(beam.visible).toBe(false);
      expect(camera.position.y).toBe(1);
      expect(done).not.toHaveBeenCalled();
      presentation.update(8, 2);
      expect(beam.visible).toBe(true);
      expect(presentation.itemAimTarget()!.position.toArray()).toEqual([0, 18, -0.5]);
      presentation.update(13, UFO_ABDUCTION_DURATION - 6);
      await abduction;
      expect(done).toHaveBeenCalledOnce();
      expect(camera.position.y).toBe(13);
      expect(takeCameraControl).toHaveBeenCalledOnce();
      expect(presentation.root.userData.state).toBe('abducted');
      camera.position.set(0, 1, 0.4);
      presentation.update(14, 0);
      expect(camera.position.y).toBe(13);
    } finally { presentation.dispose(); }
  });

  it('keeps flying through staging, reveal, and safe departure without moving the camera', async () => {
    const { presentation, camera, takeCameraControl } = fixture();
    const position = camera.position.clone();
    const quaternion = camera.quaternion.clone();
    try {
      presentation.stage();
      const craft = presentation.itemAimTarget()!;
      const startX = craft.position.x;
      presentation.update(1, 1);
      expect(Math.abs(craft.position.x - startX)).toBeCloseTo(10);
      const beforeReveal = craft.position.clone();
      const reveal = presentation.reveal();
      expect(craft.position.equals(beforeReveal)).toBe(true);
      presentation.update(3, 2);
      await reveal;
      expect(Math.abs(craft.position.x - startX)).toBeCloseTo(30);
      await presentation.playChoice({ choiceId: 'sleep', instanceId: null, condition: null });
      const beforePass = craft.position.clone();
      const pass = presentation.react(result('ufo-pass'), outcome);
      expect(craft.position.equals(beforePass)).toBe(true);
      presentation.update(3, 0);
      expect(craft.position.equals(beforePass)).toBe(true);
      presentation.update(4, 1);
      expect(Math.abs(craft.position.x - beforePass.x)).toBeCloseTo(10);
      expect(camera.position.equals(position)).toBe(true);
      expect(camera.quaternion.equals(quaternion)).toBe(true);
      presentation.update(8, 4);
      await pass;
      expect(takeCameraControl).not.toHaveBeenCalled();
      expect(presentation.root.visible).toBe(false);
      expect(presentation.root.getObjectByName('ufo-abduction-beam')!.visible).toBe(false);
      presentation.clear();
      expect(camera.position.equals(position)).toBe(true);
      expect(camera.quaternion.equals(quaternion)).toBe(true);
    } finally { presentation.dispose(); }
  });

  it.each(['settle', 'dispose'] as const)('settles pending abduction on %s', async (action) => {
    const { presentation, camera, mesh } = fixture();
    const disposed = vi.fn();
    mesh.geometry.addEventListener('dispose', disposed);
    presentation.stage();
    const abduction = presentation.react(result('ufo-abduction'), outcome);
    if (action === 'settle') {
      presentation.settleForVisibilityChange();
      expect(presentation.root.userData.state).toBe('abducted');
    }
    presentation.dispose();
    await abduction;
    expect(camera.position.y).toBe(1);
    expect(disposed).toHaveBeenCalledOnce();
    presentation.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
