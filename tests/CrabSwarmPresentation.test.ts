// Importance: 95/100. The swarm must pause for the choice and carry the exact stolen item.
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Box3, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Raycaster, Texture, Vector3 } from 'three';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { HeartBasket } from '../src/survival/HeartBasket';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { CrabSwarmPresentation, CRAB_REVEAL_SECONDS, CRAB_RETREAT_SECONDS } from '../src/survival/events/CrabSwarmPresentation';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import type { MutableSupplyPose } from '../src/survival/BoatSupplyDisplay';

let models: EventModelLibrary;
let hull: Group;
beforeAll(async () => {
  hull = createLifeboat(LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture())).root;
  const bytes = await readFile('src/assets/models/fishing/crab.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  models = await EventModelLibrary.load(['crab'], {
    load: async () => (await new GLTFLoader().register(() => ({
      name: 'test-textures', loadTexture: async () => new Texture(),
    })).parseAsync(data, '')).scene,
  });
});
afterAll(() => models?.dispose());

function setup(seed = 42) {
  const root = new Group();
  root.position.set(0.7, 0.5, -1.5);
  const release = vi.fn();
  const releaseOnNextSync = vi.fn();
  const applyPose = vi.fn((pose: MutableSupplyPose) => {
    root.position.set(0.7 + pose.x, 0.5 + pose.y, -1.5 + pose.z);
    root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
  });
  const actor = { instanceId: 'map-1' as const, root, release, releaseOnNextSync, applyPose };
  const borrowEventActor = vi.fn(() => actor);
  const presentation = new CrabSwarmPresentation({ eventModels: models, supplies: { borrowEventActor } });
  const boat = new Group();
  boat.add(hull.clone(true), presentation.boatRoot, root);
  presentation.stage({ eventId: 'crab-swarm', targetInstanceId: 'map-1', variantSeed: seed });
  const crabs = presentation.boatRoot.children.filter(child => child.name.startsWith('swarm-crab-'));
  return { presentation, crabs, boat, root, release, releaseOnNextSync, borrowEventActor };
}

describe('Crab swarm presentation', () => {
  // Importance: 95/100. Reported rotation snaps must not return during boarding or retreat.
  it.each([0, 42, 71, 99])('turns continuously while walking for seed %s', seed => {
    const { presentation, crabs } = setup(seed);
    const previous = crabs.map(crab => crab.quaternion.clone());
    try {
      for (const retreat of [false, true]) {
        if (retreat) void presentation.react({ lostInstanceIds: [] } as unknown as EventOutcomePresentation);
        else void presentation.reveal();
        crabs.forEach((crab, index) => previous[index]!.copy(crab.quaternion));
        const frames = Math.ceil((retreat ? CRAB_RETREAT_SECONDS : CRAB_REVEAL_SECONDS) * 60);
        let worst = { angle: 0, frame: 0, crab: '', position: [] as number[], normal: [] as number[] };
        for (let frame = 1; frame <= frames; frame += 1) {
          presentation.update(frame / 60, 1 / 60);
          crabs.forEach((crab, index) => {
            const angle = previous[index]!.angleTo(crab.quaternion) * 180 / Math.PI;
            if (angle > worst.angle) worst = { angle, frame, crab: crab.name,
              position: crab.position.toArray(), normal: new Vector3(0, 1, 0).applyQuaternion(crab.quaternion).toArray() };
            previous[index]!.copy(crab.quaternion);
          });
        }
        expect(worst.angle, `retreat=${retreat}: ${JSON.stringify(worst)}`).toBeLessThan(15);
      }
    } finally { presentation.dispose(); }
  });
  // Importance: 95/100. Reported item intersections must stay fixed across the random crab rotations.
  it.each([0, 42, 71, 99])('keeps the moved crabs clear of the basket, flashlight and radio for seed %s', seed => {
    const { presentation, crabs } = setup(seed);
    const itemBox = (id: 'flashlight' | 'radio' | 'compass' | 'spyglass' | 'baitTin') => {
      const spec = ITEM_MODEL_SPECS[id];
      const pose = boatSupplyTransform(id, 0);
      return new Box3(new Vector3(...spec.normalizedBounds.min), new Vector3(...spec.normalizedBounds.max))
        .applyMatrix4(new Matrix4().compose(pose.position, new Quaternion().setFromEuler(pose.rotation),
          new Vector3().setScalar(pose.scale))).expandByScalar(0.01);
    };
    const basket = new HeartBasket(0.37, 0.25);
    basket.root.position.set(1.05, 0.22, -1.62);
    const obstacles = [itemBox('flashlight'), itemBox('radio'), itemBox('compass'), itemBox('spyglass'),
      itemBox('baitTin'), new Box3().setFromObject(basket.root).expandByScalar(0.01)];
    try {
      void presentation.reveal();
      presentation.skip();
      for (const index of [0, 1, 7]) {
        const bounds = new Box3().setFromObject(crabs[index]!);
        obstacles.forEach((obstacle, obstacleIndex) => {
          expect(bounds.intersectsBox(obstacle), `Crab ${index} ${JSON.stringify(bounds)}, obstacle ${obstacleIndex} ${JSON.stringify(obstacle)}`).toBe(false);
        });
      }
    } finally { presentation.dispose(); basket.dispose(); }
  });
  // Importance: 95/100. All eight crabs must land on wood at the requested rail, floor, and wall positions.
  it('keeps contact with wood and splits the resting poses between rails, floor and walls', () => {
    const { presentation, crabs, boat } = setup();
    const wood = ['lifeboat-hull-planks', 'survival-gunwale', 'lifeboat-display-bench-seat',
      'lifeboat-floorboards', 'survival-floor'].map(name => boat.getObjectByName(name)!);
    const ray = new Raycaster();
    const normal = new Vector3();
    try {
      void presentation.reveal();
      for (let frame = 1; frame <= 100; frame += 1) {
        presentation.update(frame, CRAB_REVEAL_SECONDS / 100);
        boat.updateMatrixWorld(true);
        for (const crab of crabs) {
          if (!crab.visible) continue;
          normal.set(0, 1, 0).applyQuaternion(crab.quaternion);
          ray.ray.origin.copy(crab.position).addScaledVector(normal, 0.05);
          ray.ray.direction.copy(normal).negate();
          const hit = ray.intersectObjects(wood, true)[0];
          expect(hit, `No wood below ${crab.name} at frame ${frame}`).toBeDefined();
          expect(hit!.distance, `${crab.name} frame ${frame}: ${crab.position.toArray()} hit ${hit!.object.name}`).toBeGreaterThanOrEqual(0.049);
          // The body turns between two contacting wood planes at an inside corner.
          expect(hit!.distance).toBeLessThan(crabs.indexOf(crab) < 4 ? 0.3 : 0.08);
        }
      }
      for (const [index, crab] of crabs.entries()) {
        normal.set(0, 1, 0).applyQuaternion(crab.quaternion);
        if (index < 4) {
          expect(normal.y).toBeCloseTo(1);
          expect(crab.position.y).toBeCloseTo(index < 2 ? 0.48 : -0.3065);
          expect(crab.position.z).toBeCloseTo(index < 2 ? -2.85 : -0.85, 1);
          if (index < 2) {
            expect(Math.abs(crab.position.x)).toBeGreaterThan(0.6);
          } else {
            expect(crab.position.x).toBeCloseTo(index === 2 ? -0.65 : 0.26);
            const facing = new Vector3(0, 0, -1).applyQuaternion(crab.quaternion);
            expect(facing.z).toBeGreaterThan(0.95);
          }
        } else {
          expect(Math.abs(normal.y)).toBeLessThan(0.1);
          expect(normal.x * crab.position.x).toBeLessThan(0);
        }
      }
    } finally { presentation.dispose(); }
  });
  // Importance: 90/100. The shell must stay orange without changing the shared fishing model.
  it('colors every event crab orange without changing the model template', () => {
    const source = models.create('crab');
    const colors = (root: Group) => {
      const result: number[] = [];
      root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof MeshStandardMaterial) result.push(material.color.getHex());
        }
      });
      return result;
    };
    const before = colors(source.root);
    const { presentation, crabs } = setup();
    const fresh = models.create('crab');
    try {
      for (const crab of crabs) {
        const shades = colors(crab as Group);
        expect(shades.length).toBeGreaterThan(0);
        expect(shades.every(color => color === 0xeb792c)).toBe(true);
      }
      expect(colors(fresh.root)).toEqual(before);
    } finally { presentation.dispose(); source.dispose(); fresh.dispose(); }
  });

  // Importance: 95/100. Separate motion must remain repeatable, finish on time, and retain the choice pause.
  it('varies arrival times, approach angles, rotation and speed from the event seed', () => {
    const first = setup(42);
    const repeat = setup(42);
    const different = setup(71);
    const positions = ({ crabs }: ReturnType<typeof setup>) => crabs.map(crab => [
      ...crab.position.toArray(), ...crab.quaternion.toArray(), crab.visible,
    ]);
    try {
      for (const rig of [first, repeat, different]) void rig.presentation.reveal();
      const startZ = first.crabs.map(crab => crab.position.z);
      const arrivals = new Array<number>(8).fill(-1);
      const finishes = new Array<number>(8).fill(-1);
      const previous = first.crabs.map(crab => crab.position.clone());
      for (let frame = 1; frame <= 100; frame += 1) {
        for (const rig of [first, repeat, different]) rig.presentation.update(frame, CRAB_REVEAL_SECONDS / 100);
        expect(positions(first)).toEqual(positions(repeat));
        first.crabs.forEach((crab, index) => {
          if (crab.visible && arrivals[index] === -1) arrivals[index] = frame;
          if (crab.visible && crab.position.equals(previous[index]!) && finishes[index] === -1) finishes[index] = frame;
          previous[index]!.copy(crab.position);
        });
      }
      expect(new Set(arrivals).size).toBeGreaterThan(4);
      expect(new Set(finishes).size).toBeGreaterThan(4);
      expect(new Set(finishes.map((finish, index) => finish - arrivals[index]!)).size).toBeGreaterThan(4);
      expect(finishes.every(frame => frame > 0 && frame < 100)).toBe(true);
      expect(first.crabs.every((crab, index) => Math.abs(crab.position.z - startZ[index]!) > 0.01)).toBe(true);
      expect(new Set(first.crabs.map(crab => crab.rotation.y)).size).toBe(8);
      expect(positions(first)).not.toEqual(positions(different));
    } finally { first.presentation.dispose(); repeat.presentation.dispose(); different.presentation.dispose(); }
  });

  it('climbs both sides with eight crabs, then freezes for unlimited choice time', async () => {
    const { presentation, crabs } = setup();
    try {
      expect(crabs).toHaveLength(8);
      expect(crabs.filter(crab => crab.position.x < 0)).toHaveLength(4);
      expect(crabs.filter(crab => crab.position.x > 0)).toHaveLength(4);
      const reveal = presentation.reveal();
      presentation.update(1, CRAB_REVEAL_SECONDS * 0.5);
      expect(crabs.every(crab => crab.visible)).toBe(true);
      const halfway = crabs.map(crab => Math.abs(crab.position.x));
      presentation.update(2, CRAB_REVEAL_SECONDS * 0.5);
      await reveal;
      expect(crabs.some((crab, index) => Math.abs(crab.position.x) < halfway[index]!)).toBe(true);
      for (const crab of crabs.slice(4, 7)) {
        expect(crab.position.y).toBeGreaterThanOrEqual(0.13);
        expect(crab.position.y).toBeLessThanOrEqual(0.19);
      }
      expect(crabs[7]!.position.y).toBeGreaterThanOrEqual(-0.11);
      expect(crabs[7]!.position.y).toBeLessThanOrEqual(-0.05);
      const transforms = crabs.map(crab => [crab.position.toArray(), crab.quaternion.toArray()]);
      presentation.update(600, 600);
      expect(crabs.map(crab => [crab.position.toArray(), crab.quaternion.toArray()])).toEqual(transforms);
    } finally { presentation.dispose(); }
  });

  it.each([false, true])('ends with every crab gone, theft=%s', async stolen => {
    const { presentation, crabs, root, borrowEventActor, releaseOnNextSync, release } = setup();
    try {
      void presentation.reveal();
      presentation.skip();
      const reaction = presentation.react({ lostInstanceIds: stolen ? ['map-1'] : [] } as unknown as EventOutcomePresentation);
      presentation.update(3, CRAB_RETREAT_SECONDS * 0.6);
      if (stolen) {
        expect(borrowEventActor).toHaveBeenCalledExactlyOnceWith('map-1');
        expect(root.position.x).toBeGreaterThan(0.7);
      } else expect(borrowEventActor).not.toHaveBeenCalled();
      presentation.update(4, CRAB_RETREAT_SECONDS * 0.4);
      await reaction;
      expect(crabs.every(crab => !crab.visible)).toBe(true);
      if (stolen) {
        expect(root.scale.x).toBe(0);
        expect(releaseOnNextSync).toHaveBeenCalledOnce();
      }
      presentation.clear();
      if (stolen) expect(release).toHaveBeenCalledOnce();
    } finally { presentation.dispose(); }
  });

  it('settles reveal and theft on visibility changes and cancels cleanly on disposal', async () => {
    const { presentation, crabs, release } = setup();
    const reveal = presentation.reveal();
    presentation.settleForVisibilityChange();
    await reveal;
    expect(crabs.every(crab => crab.visible)).toBe(true);
    const reaction = presentation.react({ lostInstanceIds: ['map-1'] } as unknown as EventOutcomePresentation);
    presentation.settleForVisibilityChange();
    await reaction;
    expect(crabs.every(crab => !crab.visible)).toBe(true);
    presentation.stage({ eventId: 'crab-swarm', targetInstanceId: null, variantSeed: 1 });
    const pending = presentation.reveal();
    presentation.dispose();
    await pending;
    expect(release).toHaveBeenCalledOnce();
    expect(presentation.boatRoot.children).toHaveLength(0);
  });
});
