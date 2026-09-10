import { readFile } from 'node:fs/promises';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { GhostShipPresentation } from '../src/survival/GhostShipPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome, EventResultPresentation } from '../src/survival/survivalTypes';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';

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
  it('constructs the presentation with the production sail ship asset', async () => {
    const bytes = await readFile('src/assets/models/events/ghostShip.glb');
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    const gltf = await new GLTFLoader().parseAsync(data, '');
    normalizeLongestDimensionTemplate(gltf.scene, EVENT_MODEL_SPECS.ghostShip, (message) => new Error(message));
    const presentation = new GhostShipPresentation({
      propModels: { createEventModel: () => ({ root: gltf.scene }) },
      camera: new PerspectiveCamera(60, 16 / 9),
    } as unknown as FocusedEventPresentationDependencies);
    try {
      presentation.stage();
      expect(presentation.itemAimTarget()).not.toBeNull();
    } finally { presentation.dispose(); }
  });
  it.each([0, 1])('starts distant and visible, then waits for the whole crossing, seed %s', async (seed) => {
    const { presentation, mesh } = fixture();
    try {
      presentation.stage(seed);
      const ship = presentation.itemAimTarget()!;
      const start = ship.position.clone();
      expect(start.z).toBe(-120);
      expect(Math.sign(start.x)).toBe(seed === 0 ? -1 : 1);
      const travelDirection = seed === 0 ? 1 : -1;
      expect(ship.rotation.y).toBe(travelDirection * Math.PI / 2);
      const material = mesh.material as MeshStandardMaterial;
      expect(presentation.root.visible).toBe(true);
      expect(material.opacity).toBeGreaterThan(0.5);
      const opacity = material.opacity;
      await presentation.reveal();
      expect(material.opacity).toBe(opacity);
      expect(ship.position.equals(start)).toBe(true);
      presentation.update(3, 3);
      expect(ship.position.x - start.x).toBeCloseTo(travelDirection * 7.2);
      expect(ship.position.z).toBe(start.z);
      expect(ship.position.distanceTo(start)).toBeCloseTo(7.2, 1);
      expect(material.opacity).toBe(opacity);
      const beforePass = ship.position.clone();
      const pass = presentation.react(result('ghost-ship-pass'), outcome);
      const finished = vi.fn();
      void pass.then(finished);
      expect(ship.position.equals(beforePass)).toBe(true);
      presentation.update(13, 10);
      await Promise.resolve();
      expect(finished).not.toHaveBeenCalled();
      expect(presentation.hasPassed()).toBe(false);
      expect(material.opacity).toBe(opacity);
      presentation.settleForVisibilityChange();
      expect(presentation.root.visible).toBe(true);
      expect((ship.position.x - beforePass.x) * travelDirection).toBeGreaterThan(0);
      expect(ship.position.z).toBe(beforePass.z);
      presentation.update(213, 200);
      await pass;
      expect(finished).toHaveBeenCalledOnce();
      expect(presentation.root.visible).toBe(false);
    } finally { presentation.dispose(); }
  });

  it.each([0, 1])('requires the stern to clear the normal view even through binoculars, seed %s', (seed) => {
    const { presentation, camera } = fixture();
    try {
      presentation.stage(seed);
      const ship = presentation.itemAimTarget()!;
      const direction = seed === 0 ? 1 : -1;
      const viewEdge = 120 * Math.tan(Math.PI / 6) * camera.aspect;
      ship.position.x = direction * viewEdge;
      expect(presentation.hasPassed()).toBe(false);
      camera.fov = 20;
      expect(presentation.hasPassed()).toBe(false);
      ship.position.x = direction * (viewEdge + 60);
      expect(presentation.hasPassed()).toBe(true);
      camera.aspect = 3;
      expect(presentation.hasPassed()).toBe(false);
    } finally { presentation.dispose(); }
  });

  it.each(['clear', 'dispose'] as const)('releases a pending safe crossing on %s', async (action) => {
    const { presentation } = fixture();
    presentation.stage();
    const pass = presentation.react(result('ghost-ship-pass'), outcome);
    presentation[action]();
    await pass;
    expect(presentation.root.visible).toBe(false);
    presentation.dispose();
  });

  it.each([
    [0, 'flashlight'], [1, 'flashlight'],
    [0, 'flareGun'], [1, 'flareGun'],
    [0, 'shotgun'], [1, 'shotgun'],
  ] as const)('keeps sailing without turning or fading after a signal, seed %s, item %s', async (seed, choiceId) => {
    const { presentation, mesh } = fixture();
    try {
      presentation.stage(seed);
      const reveal = presentation.reveal();
      presentation.settleForVisibilityChange();
      await reveal;
      const ship = presentation.itemAimTarget()!;
      const yaw = ship.rotation.y;
      const startX = ship.position.x;
      const material = mesh.material as MeshStandardMaterial;
      const opacity = material.opacity;
      const signaled = presentation.react({ ...result('ghost-ship-signaled'), choiceId }, outcome);
      const finished = vi.fn();
      void signaled.then(finished);
      const light = presentation.root.getObjectByName('ghost-ship-player-light') as PointLight;
      presentation.update(1.5, 1.5);
      expect(ship.rotation.y).toBe(yaw);
      expect(light.intensity).toBe(0);
      presentation.update(3.6, 2.1);
      expect(light.intensity).toBeGreaterThan(0);
      expect(ship.rotation.y).toBe(yaw);
      expect(material.opacity).toBe(opacity);
      presentation.update(6, 2.4);
      await Promise.resolve();
      expect(finished).not.toHaveBeenCalled();
      expect(light.intensity).toBe(0);
      expect(presentation.root.visible).toBe(true);
      expect(material.opacity).toBe(opacity);
      expect(ship.rotation.y).toBe(yaw);
      expect(ship.position.x - startX).toBeCloseTo((seed === 0 ? 1 : -1) * 14.4);
      presentation.settleForVisibilityChange();
      expect(presentation.root.visible).toBe(true);
      presentation.update(206, 200);
      await signaled;
      expect(finished).toHaveBeenCalledOnce();
      expect(presentation.root.visible).toBe(false);
    } finally { presentation.dispose(); }
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
