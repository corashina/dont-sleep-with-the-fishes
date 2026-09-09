// Importance: 9/10. Protects dive item, wave, camera, promise, and cleanup ownership.
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { WaveSample } from '../src/ocean/WaveField';
import { DivePresentationController } from '../src/survival/DivePresentationController';

const FIRST_SCUBA = 'scuba-1' as ItemInstanceId;
const SECOND_SCUBA = 'scuba-2' as ItemInstanceId;

function createGoggleModel(): Group {
  const root = new Group();
  const goggles = new Mesh(
    new BoxGeometry(1, 0.3, 0.2),
    new MeshStandardMaterial(),
  );
  goggles.name = 'glasses25.001';
  root.add(goggles);
  return root;
}

function createHarness() {
  const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
  camera.position.set(0, 0.88, 1.56);
  camera.lookAt(0, 0.88, -1.55);
  const initialPosition = camera.position.clone();
  const initialQuaternion = camera.quaternion.clone();
  const cameraParent = new Group();
  cameraParent.position.set(-0.3, 0.7, 0.25);
  cameraParent.rotation.set(0.12, 0, -0.08);
  cameraParent.add(camera);
  const supplies = {
    setPresentationItemHidden: vi.fn(),
  };
  const samples: Array<{
    readonly output: WaveSample;
    readonly time: number;
    readonly x: number;
    readonly z: number;
    readonly amplitudeScale: number;
  }> = [];
  const sampleWorldWaveInto = vi.fn((
    output: WaveSample,
    time: number,
    x: number,
    z: number,
    amplitudeScale: number,
  ) => {
    samples.push({ output, time, x, z, amplitudeScale });
    output.height = 0.24;
  });
  const controller = new DivePresentationController({
    camera,
    cameraControl: {
      copyBaseQuaternion: (output) => output.copy(initialQuaternion),
    },
    supplies,
    sampleWorldWaveInto,
    readWorldWaveAmplitudeScale: () => 1.35,
    goggleModel: createGoggleModel(),
  });
  return {
    camera,
    initialPosition,
    initialQuaternion,
    supplies,
    samples,
    sampleWorldWaveInto,
    controller,
  };
}

describe('DivePresentationController', () => {
  it('looks skyward and rolls backward over the gunwale before water impact', async () => {
    const { camera, controller } = createHarness();
    const impact = vi.fn();
    const dive = controller.play(FIRST_SCUBA, { onWaterImpact: impact });

    controller.update(2.2, 2.2);
    const seatedPosition = camera.position.clone();
    const seatedForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

    controller.update(2.9, 0.7);
    expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(0.8);
    expect(camera.position.clone().sub(seatedPosition).dot(seatedForward)).toBeLessThan(0);
    expect(impact).not.toHaveBeenCalled();

    controller.update(3.5, 0.6);
    const cameraUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    expect(cameraUp.y).toBeLessThan(-0.7);
    expect(impact).not.toHaveBeenCalled();

    controller.update(3.7, 0.2);
    expect(impact).toHaveBeenCalledOnce();
    controller.clear();
    await dive;
    controller.dispose();
  });

  it('owns the item, elapsed time, wave sample, camera pose, and presentation', async () => {
    const {
      camera,
      initialPosition,
      initialQuaternion,
      supplies,
      samples,
      controller,
    } = createHarness();
    const impact = vi.fn();
    const dive = controller.play(FIRST_SCUBA, {
      onWaterImpact: impact,
    });

    expect(supplies.setPresentationItemHidden).toHaveBeenCalledWith(FIRST_SCUBA, true);
    controller.update(81.1, 1.1);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ time: 81.1, amplitudeScale: 1.35 });
    expect(samples[0]!.output).toBe(samples[0]!.output);
    expect(camera.position.x).toBeGreaterThan(1.6);

    controller.update(83.6, 2.5);
    expect(samples[1]!.output).toBe(samples[0]!.output);
    expect(impact).toHaveBeenCalledOnce();
    controller.update(85.8, 2.2);
    await dive;

    const veil = camera.getObjectByName('dive-water-veil') as Mesh<
      PlaneGeometry,
      MeshBasicMaterial
    >;
    expect(veil.material.opacity).toBeCloseTo(1);

    controller.clear();
    expect(supplies.setPresentationItemHidden).toHaveBeenLastCalledWith(
      FIRST_SCUBA,
      false,
    );
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    controller.dispose();
  });

  it('restores the old item before a replacement hides the new item', async () => {
    const { camera, initialPosition, initialQuaternion, supplies, controller } = createHarness();

    const first = controller.play(FIRST_SCUBA, {
      onWaterImpact: () => undefined,
      postEntryHold: {
        durationSeconds: 3,
        cameraWorldPosition: new Vector3(4.2, -3.4, -4.3),
        cameraWorldTarget: new Vector3(0, -7.2, -11.5),
        onStart: () => undefined,
      },
    });
    controller.update(0, 5.8);
    const second = controller.play(SECOND_SCUBA, {
      onWaterImpact: () => undefined,
    });
    await first;

    expect(supplies.setPresentationItemHidden.mock.calls.slice(0, 3)).toEqual([
      [FIRST_SCUBA, true],
      [FIRST_SCUBA, false],
      [SECOND_SCUBA, true],
    ]);
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    controller.clear();
    await second;
    controller.dispose();
  });

  it('settles active work for visibility and disposes once', async () => {
    const {
      camera,
      initialPosition,
      initialQuaternion,
      supplies,
      controller,
    } = createHarness();
    const dive = controller.play(FIRST_SCUBA, {
      onWaterImpact: () => undefined,
      postEntryHold: {
        durationSeconds: 3,
        cameraWorldPosition: new Vector3(4.2, -3.4, -4.3),
        cameraWorldTarget: new Vector3(0, -7.2, -11.5),
        onStart: () => undefined,
      },
    });
    controller.update(5.8, 5.8);

    controller.settleForVisibilityChange();
    controller.settleForVisibilityChange();
    await dive;
    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    expect(supplies.setPresentationItemHidden.mock.calls.filter(
      ([instanceId, hidden]) => instanceId === FIRST_SCUBA && hidden === false,
    )).toHaveLength(1);

    controller.dispose();
    controller.dispose();
    await expect(controller.play(SECOND_SCUBA, {
      onWaterImpact: () => undefined,
    })).resolves.toBeUndefined();
    expect(supplies.setPresentationItemHidden).not.toHaveBeenCalledWith(
      SECOND_SCUBA,
      true,
    );
  });
});
