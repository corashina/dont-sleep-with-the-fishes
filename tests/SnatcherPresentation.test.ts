// Importance: 95/100. Keeps the attack visible and item targets aligned on both sides.
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { SnatcherPresentation } from '../src/survival/events/SnatcherPresentation';
import { lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';
import { snatcherItemDuration, SNATCHER_REACTION_DURATION, SNATCHER_REVEAL_DURATION } from '../src/survival/events/snatcherChoreography';

let models: EventModelLibrary;

beforeAll(async () => {
  const bytes = await readFile('src/assets/models/events/snatcher.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  models = await EventModelLibrary.load(['snatcher'], {
    load: async () => {
      const loader = new GLTFLoader().register(() => ({
        name: 'test-textures', loadTexture: async () => new Texture(),
      }));
      const { scene, animations } = await loader.parseAsync(data, '');
      scene.animations = animations;
      return scene;
    },
  });
});

afterAll(() => models?.dispose());

function flatWater() {
  return {
    eventModels: models,
    sampleWorldWaveInto: () => undefined,
    readWorldWaveAmplitudeScale: () => 1,
  };
}

function stage(presentation: SnatcherPresentation, seed: number): void {
  presentation.stage({ eventId: 'tentacle-attack', targetInstanceId: null, variantSeed: seed });
  void presentation.reveal();
  presentation.skip();
  presentation.update(0, 0);
}

function vertices(presentation: SnatcherPresentation): Vector3[] {
  const result: Vector3[] = [];
  presentation.boatRoot.updateWorldMatrix(true, true);
  presentation.boatRoot.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    object.skeleton.update();
    const count = object.geometry.getAttribute('position').count;
    for (let index = 0; index < count; index += 1) {
      result.push(object.getVertexPosition(index, new Vector3()).applyMatrix4(object.matrixWorld));
    }
  });
  return result;
}

describe('tentacle attack framing', () => {
  // Importance: 95/100. Every attack must send the tentacle underwater and hide it before the result completes.
  it.each(['shotgun', 'fishingNet', 'knife'])('sinks back out of sight after %s', async (choice) => {
    const presentation = new SnatcherPresentation(flatWater());
    try {
      stage(presentation, 1);
      const tentacle = presentation.boatRoot.getObjectByName('tentacle-attack-tentacle')!;
      const revealed = tentacle.position.clone();
      const attack = presentation.playItemUse(choice, 'knife-1');
      presentation.skip();
      await expect(attack).resolves.toBe(true);
      const retreat = presentation.react({} as never);
      expect(tentacle.position.toArray()).toEqual(revealed.toArray());
      presentation.update(0.9, SNATCHER_REACTION_DURATION * 0.75);
      expect(tentacle.position.y).toBeLessThan(revealed.y - 1);
      expect(tentacle.position.x).toBe(revealed.x);
      presentation.update(1.2, SNATCHER_REACTION_DURATION * 0.25);
      await retreat;
      expect(tentacle.visible).toBe(false);
      stage(presentation, 1);
      expect(tentacle.visible).toBe(true);
      const nextAttack = presentation.playItemUse(choice, 'knife-1');
      presentation.skip();
      await nextAttack;
      const skippedRetreat = presentation.react({} as never);
      presentation.settleForVisibilityChange();
      await skippedRetreat;
      expect(tentacle.visible).toBe(false);
    } finally { presentation.dispose(); }
  });

  // Importance: 95/100. The production skin must clear the hull through every attack stage on either side.
  it.each([0, 1])('keeps the animated tentacle outside the hull, seed %s', (seed) => {
    const presentation = new SnatcherPresentation(flatWater());
    let minimumClearance = Infinity;
    const advance = (duration: number) => {
      for (let frame = 0; frame < 40; frame += 1) {
        presentation.update(frame * duration / 40, duration / 40);
        for (const point of vertices(presentation)) {
          const halfWidth = lifeboatHullHalfWidthAt(point.z);
          if (halfWidth !== null) minimumClearance = Math.min(minimumClearance, Math.abs(point.x) - halfWidth);
        }
      }
    };
    try {
      for (const choice of ['knife', 'shotgun', 'fishingNet', 'cannedFood']) {
        presentation.stage({ eventId: 'tentacle-attack', targetInstanceId: null, variantSeed: seed });
        void presentation.reveal();
        advance(SNATCHER_REVEAL_DURATION);
        advance(4);
        void presentation.playItemUse(choice, 'knife-1');
        advance(snatcherItemDuration(choice));
        void presentation.react({} as never);
        advance(SNATCHER_REACTION_DURATION);
      }
      expect(minimumClearance).toBeGreaterThan(0.12);
    } finally { presentation.dispose(); }
  });

  it.each([0, 1])('keeps the side attack visible in wide and narrow viewports, seed %s', (seed) => {
    const presentation = new SnatcherPresentation(flatWater());
    const camera = new PerspectiveCamera(80, 16 / 9, 0.1, 500);
    camera.position.set(0, 0.88, 0.96);
    camera.lookAt(0, 0.88, -1.55);
    camera.updateMatrixWorld();
    try {
      stage(presentation, seed);
      for (let frame = 0; frame < 24; frame += 1) {
        presentation.update(frame / 12, 1 / 12);
        const exposed = vertices(presentation).filter((point) => point.y > 0);
        expect(exposed.length).toBeGreaterThan(0);
        const projected = exposed.map((point) => point.project(camera));
        expect(Math.max(...projected.map((point) => Math.abs(point.x)))).toBeLessThan(0.95);
        expect(Math.max(...projected.map((point) => Math.abs(point.y)))).toBeLessThan(0.95);
        expect(Math.min(...projected.map((point) => point.z))).toBeGreaterThan(-1);
        expect(Math.max(...projected.map((point) => point.z))).toBeLessThan(1);
        camera.aspect = 535 / 575;
        camera.updateProjectionMatrix();
        const narrow = vertices(presentation).filter((point) => point.y > 0).map((point) => point.project(camera));
        const visible = narrow.filter((point) => Math.abs(point.x) < 1 && Math.abs(point.y) < 1);
        expect(visible.length / narrow.length).toBeGreaterThan(0.25);
        camera.aspect = 16 / 9;
        camera.updateProjectionMatrix();
      }
    } finally { presentation.dispose(); }
  });

  it.each(['knife', 'shotgun', 'fishingNet', 'cannedFood'])(
    'mirrors the animated skin and %s target, including retreat and restaging', (choice) => {
      const left = new SnatcherPresentation(flatWater());
      const right = new SnatcherPresentation(flatWater());
      const assertMirrored = () => {
        const leftPoints = vertices(left);
        const rightPoints = vertices(right);
        leftPoints.push(left.itemAimTarget.getWorldPosition(new Vector3()));
        rightPoints.push(right.itemAimTarget.getWorldPosition(new Vector3()));
        let maxError = 0;
        for (let index = 0; index < leftPoints.length; index += 1) {
          const a = leftPoints[index]!;
          const b = rightPoints[index]!;
          maxError = Math.max(maxError, Math.abs(a.x + b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
        }
        expect(maxError).toBeLessThan(0.00001);
        expect(left.itemAimTarget.getWorldPosition(new Vector3()).x).toBeLessThan(0);
        expect(right.itemAimTarget.getWorldPosition(new Vector3()).x).toBeGreaterThan(0);
      };
      try {
        stage(left, 0);
        stage(right, 1);
        assertMirrored();
        void left.playItemUse(choice, 'knife-1');
        void right.playItemUse(choice, 'knife-1');
        const step = snatcherItemDuration(choice) / 8;
        for (let frame = 1; frame <= 8; frame += 1) {
          left.update(frame * step, step);
          right.update(frame * step, step);
          assertMirrored();
        }
        void left.react({} as never);
        void right.react({} as never);
        for (let frame = 1; frame <= 8; frame += 1) {
          left.update(frame * 0.15, 0.15);
          right.update(frame * 0.15, 0.15);
          assertMirrored();
        }
        stage(left, 1);
        stage(right, 0);
        expect(left.itemAimTarget.getWorldPosition(new Vector3()).x).toBeGreaterThan(0);
        expect(right.itemAimTarget.getWorldPosition(new Vector3()).x).toBeLessThan(0);
      } finally { left.dispose(); right.dispose(); }
    },
  );
});
