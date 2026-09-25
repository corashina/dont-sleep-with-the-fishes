import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Bone, Group, Object3D, PerspectiveCamera, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SharkSwarmPresentation } from '../src/survival/events/SharkSwarmPresentation';
import { FlashlightBeam } from '../src/survival/FlashlightBeam';
import { SWARM_BREACH_DURATION } from '../src/survival/events/sharkSwarmAttack';
import { SWARM_SWIM_SPEED } from '../src/survival/events/SwarmSwimPath';
import { SWARM_DISTRACTION_TARGET } from '../src/survival/events/sharkSwarmChoreography';

async function loadSharks(): Promise<EventModelLibrary> {
  const bytes = await readFile(resolve('src/assets/models/events/shark.glb'));
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return EventModelLibrary.load(['shark'], {
    load: async () => {
      const loader = new GLTFLoader().register(() => ({
        name: 'test-textures',
        loadTexture: async () => new Texture(),
      }));
      const { scene, animations } = await loader.parseAsync(data, '');
      scene.animations = animations;
      return scene;
    },
  });
}

describe('SharkSwarmPresentation', () => {
  // Importance: 97/100. The rendered sharks must keep moving after food lands and never strike the hull.
  it.each([{ food: -1 }, { bait: -2 }])('circles the thrown offering at a steady speed: %j', async (resourceDeltas) => {
    const eventModels = await loadSharks();
    const emitCue = vi.fn();
    const presentation = new SharkSwarmPresentation({
      eventModels, emitCue, readWorldWaveAmplitudeScale: () => 0, sampleWorldWaveInto: () => {},
    } as never);
    try {
      presentation.stage({ eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: 42 });
      void presentation.reveal();
      presentation.skip();
      presentation.update(20, 0);
      const sharks = presentation.worldRoot.children.filter((object) => object.name.startsWith('swarm-shark-'));
      const previous = sharks.map((shark) => shark.position.clone());
      let complete = false;
      const done = presentation.react({ resourceDeltas, selectedInstanceId: null, brokenInstanceIds: [] } as never)
        .then(() => { complete = true; });
      for (let frame = 1; frame <= 1200; frame += 1) {
        presentation.update(20 + frame / 30, 1 / 30);
        sharks.forEach((shark, index) => {
          const last = previous[index]!;
          expect(Math.hypot(shark.position.x - last.x, shark.position.z - last.z) * 30).toBeCloseTo(SWARM_SWIM_SPEED, 2);
          last.copy(shark.position);
        });
        expect(presentation.boatRoot.rotation.z).toBe(0);
      }
      await Promise.resolve();
      expect(complete).toBe(true);
      await done;
      for (const shark of sharks) {
        const radius = Math.hypot(shark.position.x - SWARM_DISTRACTION_TARGET.x, shark.position.z - SWARM_DISTRACTION_TARGET.z);
        expect(radius).toBeGreaterThan(2.7);
        expect(radius).toBeLessThan(3.7);
      }
      expect(emitCue).not.toHaveBeenCalled();
    } finally {
      presentation.dispose();
      eventModels.dispose();
    }
  });

  // Importance: 97/100. The launch must stay ahead of the bow, independent of seed and camera direction.
  it.each([42, 123456789])('launches at the bow for seed %s', async (seed) => {
    const eventModels = await loadSharks();
    const camera = new PerspectiveCamera();
    camera.position.set(0.2, 0.88, 0.96);
    camera.rotation.y = 0.7;
    const presentation = new SharkSwarmPresentation({
      emitCue: vi.fn(),
      eventModels, camera, readWorldWaveAmplitudeScale: () => 0, sampleWorldWaveInto: () => {},
    } as never);
    try {
      presentation.stage({ eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: seed });
      void presentation.reveal();
      presentation.skip();
      presentation.boatRoot.rotation.y = 0.4;
      const bow = presentation.boatRoot.localToWorld(new Vector3(0, 0, -6));
      presentation.update(20, 0);
      const done = presentation.react({ resourceDeltas: { health: -20 }, selectedInstanceId: null } as never);
      presentation.update(20.36, SWARM_BREACH_DURATION * 0.2);
      const mouth = (shark: Object3D) => shark.getObjectByName('Head_end')!.getWorldPosition(new Vector3())
        .add(shark.getObjectByName('LowerJaw_end')!.getWorldPosition(new Vector3())).multiplyScalar(0.5);
      const launched = presentation.worldRoot.children.filter((object) => object.name.startsWith('swarm-shark-'))
        .filter((shark) => {
          const position = mouth(shark);
          return Math.hypot(position.x - bow.x, position.z - bow.z) < 1e-6;
        });
      expect(launched).toHaveLength(1);
      presentation.skip();
      await done;
      expect(launched[0]!.visible).toBe(true);
      camera.updateWorldMatrix(true, false);
      const projected = mouth(launched[0]!).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(0.001);
      expect(Math.abs(projected.y)).toBeLessThan(0.001);
      const nose = launched[0]!.getObjectByName('Head_end')!.getWorldPosition(new Vector3());
      const head = launched[0]!.getObjectByName('Head')!.getWorldPosition(new Vector3());
      expect(nose.sub(head).normalize().dot(camera.getWorldDirection(new Vector3()))).toBeCloseTo(-1, 5);
    } finally {
      presentation.dispose();
      eventModels.dispose();
    }
  });

  // Importance: 98/100. Health loss must trigger one bite; hull damage and safe choices must not.
  it.each([
    ['flashlight', { health: -50, hull: -30 }, 1],
    ['failed knife', { health: -20 }, 1],
    ['harmful sleep', { health: -50 }, 1],
    ['canned food', { food: -1 }, 0],
    ['successful knife', {}, 0],
    ['bait', { bait: -2 }, 0],
  ] as const)('plays the correct attack for %s', async (_choice, resourceDeltas, expectedJumps) => {
    const eventModels = await loadSharks();
    const camera = new PerspectiveCamera(80, 16 / 9, 0.1, 500);
    camera.position.set(0, 1.4, 0.96);
    const cameraEffectsRoot = new Group();
    cameraEffectsRoot.add(camera);
    const emitCue = vi.fn();
    const presentation = new SharkSwarmPresentation({
      eventModels, camera, cameraEffectsRoot, emitCue,
      readWorldWaveAmplitudeScale: () => 0, sampleWorldWaveInto: () => {},
    } as never);
    try {
      presentation.stage({ eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: 42 });
      void presentation.reveal();
      presentation.skip();
      presentation.update(20, 0);
      const sharks = presentation.worldRoot.children.filter((object) => object.name.startsWith('swarm-shark-'));
      const jumped = new Set<Object3D>();
      let shook = false;
      const done = presentation.react({ resourceDeltas, selectedInstanceId: null, brokenInstanceIds: [] } as never);
      for (let frame = 1; frame <= 220; frame += 1) {
        presentation.update(20 + frame / 100, 0.01);
        if (frame / 100 < SWARM_BREACH_DURATION * 0.97) expect(emitCue).not.toHaveBeenCalled();
        for (const shark of sharks) {
          if (shark.position.y > 1) jumped.add(shark);
        }
        shook ||= Math.abs(cameraEffectsRoot.rotation.x) > 0.02;
      }
      expect(jumped.size).toBe(expectedJumps);
      expect(shook).toBe(expectedJumps > 0);
      expect(emitCue).toHaveBeenCalledTimes(expectedJumps);
      if (expectedJumps > 0) expect(emitCue).toHaveBeenCalledWith({ eventId: 'swarm-of-sharks', cue: 'bite' });
      presentation.skip();
      await done;
      expect(cameraEffectsRoot.rotation.x).toBe(0);
      expect(cameraEffectsRoot.rotation.z).toBe(0);
      expect(sharks.every((shark) => shark.visible)).toBe(true);
      expect(sharks.filter((shark) => shark.position.y >= 0.1)).toHaveLength(expectedJumps);
    } finally {
      presentation.dispose();
      eventModels.dispose();
    }
  });

  // Importance: 96/100. An interrupted bite must release the event and remove camera shake.
  it.each(['skip', 'settleForVisibilityChange', 'clear', 'dispose'] as const)(
    'cleans up an active bite on %s and can stage again', async (stop) => {
      const eventModels = await loadSharks();
      const cameraEffectsRoot = new Group();
      const emitCue = vi.fn();
      const presentation = new SharkSwarmPresentation({
        eventModels, cameraEffectsRoot, emitCue,
        readWorldWaveAmplitudeScale: () => 0, sampleWorldWaveInto: () => {},
      } as never);
      const context = { eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: 42 } as const;
      try {
        presentation.stage(context);
        void presentation.reveal();
        presentation.skip();
        const done = presentation.react({ resourceDeltas: { health: -20 }, selectedInstanceId: null } as never);
        for (let frame = 1; frame <= 180 && cameraEffectsRoot.rotation.x <= 0.02; frame += 1) {
          presentation.update(frame / 100, 0.01);
        }
        expect(cameraEffectsRoot.rotation.x).toBeGreaterThan(0.02);
        presentation[stop]();
        await done;
        expect(emitCue).not.toHaveBeenCalled();
        expect(cameraEffectsRoot.rotation.x).toBe(0);
        expect(cameraEffectsRoot.rotation.z).toBe(0);
        if (stop !== 'dispose') {
          presentation.stage(context);
          presentation.update(SWARM_BREACH_DURATION, 0);
          expect(cameraEffectsRoot.rotation.x).toBe(0);
          expect(presentation.worldRoot.children.filter((object) => object.name.startsWith('swarm-shark-'))
            .every((shark) => shark.position.y < 0.1)).toBe(true);
        }
      } finally {
        presentation.dispose();
        eventModels.dispose();
      }
    },
  );

  it('fits the flashlight to the selected shark through its skeletal animation', async () => {
    const eventModels = await loadSharks();
    const presentation = new SharkSwarmPresentation({
      emitCue: vi.fn(),
      eventModels, readWorldWaveAmplitudeScale: () => 0, sampleWorldWaveInto: () => {},
    } as never);
    const beam = new FlashlightBeam();
    const actor = new Object3D();
    actor.position.set(0, 1.5, 0);
    beam.position.copy(actor.position);
    try {
      presentation.stage({ eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: 42 });
      presentation.reveal();
      presentation.skip();
      beam.setTarget(presentation.itemAimTarget);
      for (const time of [0.24, 0.7]) {
        presentation.update(time, 0.24);
        beam.updateTarget();
        beam.apply(actor, 1, 1);
        expect(beam.visible).toBe(true);
        beam.updateWorldMatrix(true, true);
        const point = new Vector3();
        presentation.itemAimTarget.model.traverse((object) => {
          if (!(object instanceof SkinnedMesh)) return;
          const count = object.geometry.getAttribute('position').count;
          for (let index = 0; index < count; index += 1) {
            object.getVertexPosition(index, point).applyMatrix4(object.matrixWorld);
            beam.beam.worldToLocal(point);
            expect(point.x).toBeGreaterThan(0);
            expect(point.x).toBeLessThanOrEqual(1 + 1e-6);
            expect(Math.hypot(point.y, point.z)).toBeLessThanOrEqual(point.x + 1e-6);
          }
        });
      }
    } finally {
      beam.dispose();
      presentation.dispose();
      eventModels.dispose();
    }
  });

  it('swims with independent production skeletons and resets seeded animation phases', async () => {
    const eventModels = await loadSharks();
    const presentation = new SharkSwarmPresentation({
      emitCue: vi.fn(),
      eventModels,
      readWorldWaveAmplitudeScale: () => 0,
      sampleWorldWaveInto: () => {},
    } as never);
    const context = { eventId: 'swarm-of-sharks', targetInstanceId: null, variantSeed: 42 } as const;
    try {
      presentation.stage(context);
      presentation.reveal();
      presentation.skip();
      const sharks = presentation.worldRoot.children.filter((object) => object.name.startsWith('swarm-shark-'));
      expect(sharks).toHaveLength(5);
      const tails = sharks.map((shark) => shark.getObjectByName('Tail4') as Bone);
      const start = tails.map((tail) => tail.quaternion.clone());
      expect(new Set(tails).size).toBe(5);
      expect(start.some((pose) => !pose.equals(start[0]!))).toBe(true);
      for (const shark of sharks) {
        const meshes: SkinnedMesh[] = [];
        shark.traverse((object) => { if (object instanceof SkinnedMesh) meshes.push(object); });
        expect(meshes.length).toBeGreaterThan(0);
        expect(shark.getObjectByName('Head')).toBeInstanceOf(Bone);
      }
      presentation.update(0.24, 0.24);
      tails.forEach((tail, index) => expect(tail.quaternion.equals(start[index]!)).toBe(false));
      const paused = tails.map((tail) => tail.quaternion.clone());
      presentation.clear();
      presentation.update(1, 0.5);
      tails.forEach((tail, index) => expect(tail.quaternion.equals(paused[index]!)).toBe(true));
      presentation.stage(context);
      tails.forEach((tail, index) => expect(tail.quaternion.equals(start[index]!)).toBe(true));
      const skeletonDisposals: ReturnType<typeof vi.spyOn>[] = [];
      sharks.forEach((shark) => shark.traverse((object) => {
        if (object instanceof SkinnedMesh) skeletonDisposals.push(vi.spyOn(object.skeleton, 'dispose'));
      }));
      presentation.dispose();
      skeletonDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    } finally {
      presentation.dispose();
      eventModels.dispose();
    }
  });
});
