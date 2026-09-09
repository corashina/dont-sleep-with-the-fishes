import { expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Box3, Group, Matrix4, Mesh, SkinnedMesh, Texture, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CarlitosPresentation, CARLITOS_PET_DURATION, CARLITOS_FEED_DURATION } from '../src/survival/CarlitosPresentation';
import { PropModelLibrary } from '../src/world/PropModelLibrary';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { createCarlitosState } from '../src/survival/CarlitosState';
import { createTestPropModels } from './helpers/propModels';

async function realCareModels() {
  const load = async (path: string, spec: typeof ITEM_MODEL_SPECS.carlitos) => {
    const bytes = await readFile(path);
    const data = new Uint8Array(bytes).buffer;
    const loader = new GLTFLoader().register(() => ({
      name: 'test-textures', loadTexture: async () => new Texture(),
    }));
    const model = await loader.parseAsync(data, '');
    normalizeLongestDimensionTemplate(model.scene, spec, (message) => new Error(message));
    const root = new Group();
    root.add(model.scene);
    return { root, animations: model.animations };
  };
  const cat = await load('src/assets/models/items/carlitos.glb', ITEM_MODEL_SPECS.carlitos);
  const hand = await load('src/assets/models/events/riggedHand.glb', EVENT_MODEL_SPECS.riggedHand);
  return PropModelLibrary.fromTemplatesForTest(
    new Map([['carlitos', cat.root]]), new Map(), new Map(),
    new Map([['carlitos', cat.animations]]), new Map([['riggedHand', hand.root]]),
  );
}

// Rasterize the rendered skin surfaces in the shared petting plane. A whole-cat
// bounding box includes empty space above the forehead and makes the hand hover.
function surfaceClearance(hand: Object3D, cat: Object3D): number {
  hand.parent!.updateWorldMatrix(true, true);
  hand.parent!.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(hand.parent!.matrixWorld).invert();
  const triangles = (root: Object3D) => {
    const result: Vector3[][] = [];
    root.traverse((mesh) => {
      if (!(mesh instanceof Mesh)) return;
      if (mesh instanceof SkinnedMesh) mesh.skeleton.update();
      const matrix = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      const vertices = Array.from({ length: mesh.geometry.attributes.position!.count }, (_, i) =>
        mesh.getVertexPosition(i, new Vector3()).applyMatrix4(matrix));
      const indices = mesh.geometry.index;
      for (let i = 0; i < (indices?.count ?? vertices.length); i += 3) {
        result.push([0, 1, 2].map((j) => vertices[indices?.getX(i + j) ?? i + j]!));
      }
    });
    return result;
  };
  const palm = triangles(hand);
  const bounds = new Box3().setFromPoints(palm.flat());
  const step = 0.002;
  const width = Math.ceil((bounds.max.x - bounds.min.x) / step) + 1;
  const depth = Math.ceil((bounds.max.z - bounds.min.z) / step) + 1;
  const rasterize = (faces: Vector3[][], upper: boolean) => {
    const heights = new Float64Array(width * depth).fill(upper ? -Infinity : Infinity);
    for (const [a, b, c] of faces as [Vector3, Vector3, Vector3][]) {
      const determinant = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(determinant) < 1e-12) continue;
      const x0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - bounds.min.x) / step));
      const x1 = Math.min(width - 1, Math.floor((Math.max(a.x, b.x, c.x) - bounds.min.x) / step));
      const z0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - bounds.min.z) / step));
      const z1 = Math.min(depth - 1, Math.floor((Math.max(a.z, b.z, c.z) - bounds.min.z) / step));
      for (let iz = z0; iz <= z1; iz += 1) for (let ix = x0; ix <= x1; ix += 1) {
        const x = bounds.min.x + ix * step;
        const z = bounds.min.z + iz * step;
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / determinant;
        const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / determinant;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const y = u * a.y + v * b.y + (1 - u - v) * c.y;
        const index = iz * width + ix;
        heights[index] = upper ? Math.max(heights[index]!, y) : Math.min(heights[index]!, y);
      }
    }
    return heights;
  };
  const underside = rasterize(palm, false);
  const fur = rasterize(triangles(cat), true);
  let gap = Infinity;
  for (let i = 0; i < fur.length; i += 1) gap = Math.min(gap, underside[i]! - fur[i]!);
  return gap;
}

it.each([-1, 1] as const)('keeps the petting hand clear across care poses on side %s', async (side) => {
  const models = await realCareModels();
  const presentation = new CarlitosPresentation(models);
  try {
    presentation.setSeatSide(side);
    const hand = presentation.root.getObjectByName('carlitos-care-hand')!;
    const cat = presentation.root.getObjectByName('carlitos-model')!;
    for (const state of [{}, { energy: 0 }, { hunger: 1 }, { hunger: 3 }, { unhappiness: 5 }]) {
      presentation.sync(createCarlitosState(state));
      void presentation.play('pet');
      let clearance = Infinity;
      for (let frame = 1; frame <= 60; frame += 1) {
        presentation.update(CARLITOS_PET_DURATION / 60);
        if (!hand.visible) continue;
        clearance = Math.min(clearance, surfaceClearance(hand, cat));
      }
      expect(Number.isFinite(clearance)).toBe(true);
      expect(clearance, JSON.stringify(state)).toBeGreaterThanOrEqual(0.003);
      expect(clearance).toBeLessThan(0.02);
    }
  } finally {
    presentation.dispose();
    models.dispose();
  }
});

it.each([-1, 1] as const)('fades the hand near the real head on seat side %s', async (side) => {
  const models = await realCareModels();
  const presentation = new CarlitosPresentation(models);
  try {
    presentation.setSeatSide(side);
    presentation.sync(createCarlitosState());
    const hand = presentation.root.getObjectByName('carlitos-care-hand')!;
    const head = presentation.root.getObjectByName('Head_22')!;
    expect(hand.userData.modelKind).toBe('rigged');
    expect(presentation.root.getObjectByName('carlitos-food:bowl')).toBeUndefined();
    const contact = vi.fn();
    const pet = presentation.play('pet', contact);
    presentation.update(CARLITOS_PET_DURATION * 0.1);
    expect(contact).not.toHaveBeenCalled();
    const approach = hand.getWorldPosition(new Vector3());
    expect(approach.distanceTo(head.getWorldPosition(new Vector3()))).toBeLessThan(0.22);
    hand.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        expect(material.transparent).toBe(true);
        expect(material.opacity).toBeGreaterThan(0);
        expect(material.opacity).toBeLessThan(1);
      }
    });
    presentation.update(CARLITOS_PET_DURATION * 0.15);
    expect(contact).toHaveBeenCalledOnce();
    const palm = hand.getWorldPosition(new Vector3());
    expect(palm.distanceTo(head.getWorldPosition(new Vector3()))).toBeLessThan(0.18);
    expect(palm.distanceTo(approach)).toBeLessThan(0.1);
    presentation.update(CARLITOS_PET_DURATION * 0.7);
    expect(hand.getWorldPosition(new Vector3()).distanceTo(head.getWorldPosition(new Vector3()))).toBeLessThan(0.22);
    hand.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        expect(material.opacity).toBeGreaterThan(0);
        expect(material.opacity).toBeLessThan(1);
      }
    });
    presentation.update(CARLITOS_PET_DURATION);
    await pet;
    expect(hand.visible).toBe(false);

    const feed = presentation.play('feed');
    for (let frame = 0; frame < 20; frame += 1) {
      presentation.update(CARLITOS_FEED_DURATION / 19);
      expect(hand.visible).toBe(false);
      expect(presentation.root.getObjectByName('carlitos-food')).toBeUndefined();
    }
    await feed;

  } finally {
    presentation.dispose();
    models.dispose();
  }
});

it('keeps an exhausted companion visible and responsive to care', async () => {
  const models = createTestPropModels();
  const presentation = new CarlitosPresentation(models);
  try {
    presentation.sync(createCarlitosState({ hunger: 0, unhappiness: 10 }));
    expect(presentation.root.visible).toBe(true);
    expect(presentation.interactionRoot.visible).toBe(true);
    const contact = vi.fn();
    const action = presentation.play('pet', contact);
    presentation.update(CARLITOS_PET_DURATION);
    await action;
    expect(contact).toHaveBeenCalledOnce();
    expect(presentation.root.visible).toBe(true);
    presentation.sync(null);
    expect(presentation.root.visible).toBe(false);
  } finally {
    presentation.dispose();
    models.dispose();
  }
});
