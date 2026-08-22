// Importance: 9/10. Protects the warning, automatic bite, and net interception.
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { MutableSupplyPose } from '../src/survival/BoatSupplyDisplay';
import { ChestAttackPresentation } from '../src/survival/ChestAttackPresentation';
import type { ChestEventPose } from '../src/survival/ChestDisplay';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';

function createFixture() {
  const cameraRig = new Group();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  cameraRig.add(camera);
  const originalQuaternion = camera.quaternion.clone();
  const chestRoot = new Group();
  const chestPoses: ChestEventPose[] = [];
  const netPoses: MutableSupplyPose[] = [];
  const emitCue = vi.fn();
  const pinEventActor = vi.fn(() => true);
  const dependencies = {
    camera,
    cameraRig,
    waves: [],
    propModels: {},
    boatMotionRoot: new Group(),
    chestDisplay: {
      root: chestRoot,
      stageMimic: vi.fn(() => { chestRoot.visible = true; }),
      applyEventPose: vi.fn((pose: ChestEventPose) => {
        chestPoses.push({ ...pose });
      }),
      restorePose: vi.fn(),
    },
    supplyDisplay: {
      pinEventActor,
      applyEventItemPose: vi.fn((_instanceId: string, pose: MutableSupplyPose) => {
        netPoses.push({ ...pose });
        return true;
      }),
      releaseEventActor: vi.fn(),
      clearEventPose: vi.fn(),
    },
    emitCue,
  } as unknown as FocusedEventPresentationDependencies;
  return {
    camera,
    originalQuaternion,
    chestPoses,
    netPoses,
    emitCue,
    pinEventActor,
    presentation: new ChestAttackPresentation(dependencies),
  };
}

describe('ChestAttackPresentation', () => {
  it('plays wood movement while the player searches left and right', async () => {
    const fixture = createFixture();
    fixture.presentation.stage();
    const reveal = fixture.presentation.reveal();

    expect(fixture.emitCue).toHaveBeenCalledExactlyOnceWith({
      eventId: 'chest-attack',
      cue: 'wood',
    });
    fixture.presentation.update(0.6, 0.6);
    expect(fixture.presentation.root.userData.searchLeft).toBe(1);
    expect(fixture.camera.quaternion.toArray()).not.toEqual(
      fixture.originalQuaternion.toArray(),
    );
    fixture.presentation.update(1.4, 0.8);
    expect(fixture.presentation.root.userData.searchRight).toBe(1);
    fixture.presentation.update(2.4, 1);
    await reveal;

    expect(fixture.camera.quaternion.toArray()).toEqual(
      fixture.originalQuaternion.toArray(),
    );
    fixture.presentation.dispose();
  });

  it('turns around, bites, and emits the Midnight Tour attack cue once', async () => {
    const fixture = createFixture();
    fixture.presentation.stage();
    const attack = fixture.presentation.playChoice({
      choiceId: 'attack',
      instanceId: null,
      condition: null,
    });
    fixture.presentation.update(0.6, 0.6);
    fixture.presentation.update(1.15, 0.55);
    await attack;

    const direction = fixture.camera.getWorldDirection(new Vector3());
    expect(direction.z).toBeGreaterThan(0.9);
    expect(fixture.chestPoses.at(-1)).toMatchObject({ mouthOpen: 1, bite: 1 });
    expect(fixture.presentation.root.userData.state).toBe('impact');
    expect(fixture.emitCue).toHaveBeenCalledExactlyOnceWith({
      eventId: 'chest-attack',
      cue: 'attack',
    });
    fixture.presentation.dispose();
  });

  it('turns around and throws the selected physical net onto the chest', async () => {
    const fixture = createFixture();
    fixture.presentation.stage();
    const binding = fixture.presentation.playChoice({
      choiceId: 'fishingNet',
      instanceId: 'fishingNet-1',
      condition: 'usable',
    });
    fixture.presentation.update(0.75, 0.75);
    fixture.presentation.update(1.45, 0.7);
    await binding;

    const direction = fixture.camera.getWorldDirection(new Vector3());
    expect(direction.z).toBeGreaterThan(0.9);
    expect(fixture.pinEventActor).toHaveBeenCalledWith('fishingNet-1');
    expect(fixture.netPoses.at(-1)).toMatchObject({ x: 0.96, z: 3.24 });
    expect(fixture.chestPoses.at(-1)).toMatchObject({ bound: 1, bite: 0 });
    expect(fixture.emitCue).not.toHaveBeenCalled();
    fixture.presentation.dispose();
  });
});
