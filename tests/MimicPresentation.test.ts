// Importance: 95/100. The copy must match the player hull, stay empty, and release its water mask and resources.
import { BoxGeometry, BufferGeometry, Group, Material, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Quaternion, Texture, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MimicPresentation } from '../src/survival/MimicPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { BoatSupplyPresentationRecord } from '../src/survival/BoatSupplyDisplay';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import type { WaterExclusionRegion } from '../src/ocean/WaterExclusion';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { collectMeshResources, disposeResourceSets } from '../src/world/SceneResources';

const outcome: ActionOutcome = { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' };

function fixture(records: readonly BoatSupplyPresentationRecord[] = []) {
  const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const motion = new Group();
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0.88, 0.96);
  motion.add(camera);
  const exclusions: WaterExclusionRegion[] = [];
  const takeCameraControl = vi.fn();
  const presentation = new MimicPresentation({
    lifeboatAssets: assets, boatMotionRoot: motion, waterExclusions: exclusions,
    camera, takeCameraControl, supplyDisplay: { records: () => records },
  } as unknown as FocusedEventPresentationDependencies);
  return { assets, motion, camera, takeCameraControl, exclusions, presentation, boat: presentation.root.getObjectByName('mimic-boat')! };
}

describe('Mimic presentation', () => {
  it('uses the full player hull and materials with empty storage', () => {
    const { presentation, assets, boat } = fixture();
    const player = createLifeboat(assets);
    try {
      const meshes: Mesh[] = [];
      player.root.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
      let count = 0;
      boat.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const source = meshes[count++]!;
        expect(object.name).toBe(source.name);
        expect(object.geometry.getAttribute('position').array).toEqual(source.geometry.getAttribute('position').array);
        expect(object.position.toArray()).toEqual(source.position.toArray());
        expect(object.scale.toArray()).toEqual(source.scale.toArray());
        const sourceMaterial = source.material as MeshStandardMaterial;
        expect(object.material).toMatchObject({ color: sourceMaterial.color, map: sourceMaterial.map });
      });
      expect(count).toBe(meshes.length);
      expect(boat.getObjectByName('mimic-supplies')?.children).toHaveLength(0);
      expect(boat.children.map(({ name }) => name)).toEqual(player.root.children.map(({ name }) => name));
    } finally {
      presentation.dispose();
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      collectMeshResources(player.root, geometries, materials);
      disposeResourceSets(geometries, materials);
      assets.dispose();
    }
  });

  it('appears ahead facing the player and copies the live pose even when animation is paused', async () => {
    const { presentation, assets, boat, motion, camera, takeCameraControl, exclusions } = fixture();
    const originalPosition = camera.position.clone();
    const originalRotation = camera.quaternion.clone();
    try {
      presentation.stage();
      const reveal = presentation.reveal();
      presentation.update(12, 12);
      await reveal;
      motion.position.set(0.2, 0.4, -0.3);
      motion.rotation.set(0.1, 0.02, -0.06);
      presentation.update(5, 0);
      expect(boat.position.x).toBe(motion.position.x);
      expect(boat.position.y).toBe(motion.position.y);
      expect(boat.position.z).toBeCloseTo(motion.position.z - 9.5);
      expect(camera.position).toEqual(originalPosition);
      expect(camera.quaternion.toArray()).toEqual(originalRotation.toArray());
      expect(takeCameraControl).not.toHaveBeenCalled();
      const facing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
      expect(boat.quaternion.angleTo(motion.quaternion.clone().multiply(facing))).toBeLessThan(1e-7);
      expect(exclusions).toHaveLength(1);
      const identity = new Matrix4().elements;
      exclusions[0]!.worldToLocal.clone().multiply(boat.matrixWorld).elements.forEach((value, index) => {
        expect(value).toBeCloseTo(identity[index]!, 8);
      });
      presentation.clear();
      expect(camera.position).toEqual(originalPosition);
      expect(camera.quaternion.toArray()).toEqual(originalRotation.toArray());
    } finally { presentation.dispose(); assets.dispose(); }
  });

  it('mirrors current visible supplies and releases copies without changing player resources', () => {
    const material = new MeshStandardMaterial({ color: '#aa7733', transparent: true, opacity: 0.7 });
    const geometry = new BoxGeometry();
    const source = new Group();
    source.name = 'test-supply';
    source.position.set(0.5, 0.3, -1.2);
    source.rotation.y = 0.3;
    const item = new Mesh(geometry, material);
    item.name = 'held-item';
    const missing = item.clone();
    missing.name = 'missing-item';
    missing.visible = false;
    source.add(item, missing);
    const records = [{ root: source, visibleCopies: 1 }] as unknown as BoatSupplyPresentationRecord[];
    const { presentation, assets, boat } = fixture(records);
    const sourceDisposed = vi.fn();
    material.addEventListener('dispose', sourceDisposed);
    geometry.addEventListener('dispose', sourceDisposed);
    try {
      presentation.stage();
      const copy = boat.getObjectByName('test-supply')!;
      const copiedItem = copy.getObjectByName('held-item') as Mesh;
      const copiedMaterial = copiedItem.material as MeshStandardMaterial;
      const copyDisposed = vi.fn();
      copiedMaterial.addEventListener('dispose', copyDisposed);
      expect(copy.position).toEqual(source.position);
      expect(copy.quaternion.toArray()).toEqual(source.quaternion.toArray());
      expect(copy.parent!.scale.x).toBe(-1);
      expect(copy.getObjectByName('missing-item')!.visible).toBe(false);
      expect(copiedMaterial).not.toBe(material);
      expect(copiedMaterial.color).toEqual(material.color);
      expect(copiedMaterial.opacity).toBe(0.7);
      expect(copiedMaterial.depthWrite).toBe(material.depthWrite);
      expect(copiedMaterial.transparent).toBe(material.transparent);
      expect(material.opacity).toBe(0.7);
      void presentation.reveal();
      presentation.settleForVisibilityChange();
      const point = copiedItem.getWorldPosition(new Vector3());
      expect(point.x).toBeCloseTo(source.position.x);
      expect(point.z).toBeCloseTo(boat.position.z - source.position.z);
      expect(copiedMaterial.opacity).toBe(0.7);
      presentation.clear();
      expect(copyDisposed).toHaveBeenCalledOnce();
      expect(sourceDisposed).not.toHaveBeenCalled();
      records.length = 0;
      presentation.stage();
      expect(boat.getObjectByName('mimic-supplies')!.children).toHaveLength(0);
    } finally { presentation.dispose(); assets.dispose(); geometry.dispose(); material.dispose(); }
  });

  it.each(['mimic-pass', 'mimic-lit'])('finishes %s with an empty sea and no water mask', async (resultId) => {
    const { presentation, assets, boat, exclusions } = fixture();
    try {
      presentation.stage();
      const reveal = presentation.reveal();
      presentation.settleForVisibilityChange();
      await reveal;
      const reaction = presentation.react({ eventId: 'mimic', choiceId: resultId === 'mimic-lit' ? 'flashlight' : 'sleep', resultId }, outcome);
      presentation.update(1, 1);
      const light = presentation.root.getObjectByName('mimic-seat-light') as PointLight;
      expect(light.intensity > 0).toBe(resultId === 'mimic-lit');
      presentation.update(21, 20);
      await reaction;
      expect(boat.visible).toBe(false);
      expect(light.intensity).toBe(0);
      expect(exclusions).toHaveLength(0);
      expect(presentation.itemAimTarget()).toBeNull();
    } finally { presentation.dispose(); assets.dispose(); }
  });

  // Importance: 95/100. A depth-state switch reveals hidden hull faces and makes the boat pop at arrival.
  it('approaches over twelve seconds with solid surfaces throughout arrival and departure', async () => {
    const { presentation, assets, boat } = fixture();
    const expectSolid = () => boat.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        expect(material.transparent).toBe(false);
        expect(material.opacity).toBe(1);
        expect(material.depthWrite).toBe(true);
      }
    });
    try {
      presentation.stage();
      const reveal = presentation.reveal();
      presentation.update(6, 6);
      expectSolid();
      expect(presentation.root.userData.state).toBe('revealing');
      expect(boat.position.z).toBeCloseTo(-23.75);
      presentation.update(11.99, 5.99);
      expectSolid();
      presentation.update(12, 0.01);
      await reveal;
      expectSolid();
      expect(boat.position.z).toBeCloseTo(-9.5);
      expect(presentation.root.userData.state).toBe('watching');
      const reaction = presentation.react({ eventId: 'mimic', choiceId: 'sleep', resultId: 'mimic-pass' }, outcome);
      presentation.update(17, 5);
      expectSolid();
      presentation.settleForVisibilityChange();
      await reaction;
      expect(boat.position.z).toBeCloseTo(-38);
      expect(boat.visible).toBe(false);
    } finally { presentation.dispose(); assets.dispose(); }
  });

  it('cancels pending work and disposes only its own geometry and materials once', async () => {
    const { presentation, assets, boat, exclusions } = fixture();
    const mesh = boat.children.find((child) => child instanceof Mesh) as Mesh;
    const disposed = vi.fn();
    mesh.geometry.addEventListener('dispose', disposed);
    presentation.stage();
    const reveal = presentation.reveal();
    presentation.clear();
    await reveal;
    expect(exclusions).toHaveLength(0);
    presentation.stage();
    expect(exclusions).toHaveLength(1);
    const reaction = presentation.react({ eventId: 'mimic', choiceId: 'sleep', resultId: 'mimic-pass' }, outcome);
    presentation.dispose();
    presentation.dispose();
    await reaction;
    expect(exclusions).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
    assets.dispose();
  });
});
