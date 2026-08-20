import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import {
  HANGING_LANTERN_DAY_INTENSITY,
  HANGING_LANTERN_LINE_LENGTH,
  HANGING_LANTERN_MOUNT,
  HANGING_LANTERN_TIP,
  createHangingLantern,
} from '../src/survival/HangingLantern';

function lanternModel(): Group {
  const root = new Group();
  const mesh = new Mesh(
    new BoxGeometry(0.22, 0.48, 0.22),
    new MeshStandardMaterial({ color: 0x6c4b2d }),
  );
  mesh.position.y = 0.24;
  root.add(mesh);
  return root;
}

describe('hanging lantern', () => {
  it('mounts at the stern center and hangs below the pole tip', () => {
    const lantern = createHangingLantern(lanternModel());
    const pivot = lantern.root.getObjectByName('hanging-lantern:swing-pivot')!;
    const model = lantern.root.getObjectByName('hanging-lantern:model')!;
    lantern.root.updateMatrixWorld(true);
    const pivotWorld = pivot.getWorldPosition(new Vector3());
    const modelBounds = new Box3().setFromObject(model);

    expect(lantern.root.position.toArray()).toEqual([
      HANGING_LANTERN_MOUNT.x,
      HANGING_LANTERN_MOUNT.y,
      HANGING_LANTERN_MOUNT.z,
    ]);
    expect(HANGING_LANTERN_MOUNT.x).toBe(0);
    expect(pivot.position.toArray()).toEqual([
      HANGING_LANTERN_TIP.x,
      HANGING_LANTERN_TIP.y,
      HANGING_LANTERN_TIP.z,
    ]);
    expect(pivotWorld.y - modelBounds.max.y).toBeCloseTo(HANGING_LANTERN_LINE_LENGTH, 5);
    expect(modelBounds.min.y).toBeGreaterThan(0.9);

    lantern.dispose();
  });

  it('builds a warm emissive model and shadow-casting point light', () => {
    const lantern = createHangingLantern(lanternModel());
    const model = lantern.root.getObjectByName('hanging-lantern:model')!;
    const mesh = model.children[0] as Mesh;
    const material = mesh.material as MeshStandardMaterial;

    expect(lantern.light).toBeInstanceOf(PointLight);
    expect(lantern.light.color.getHex()).toBe(0xffb261);
    expect(lantern.light.intensity).toBe(HANGING_LANTERN_DAY_INTENSITY);
    expect(lantern.light.distance).toBe(3.6);
    expect(lantern.light.castShadow).toBe(true);
    expect(lantern.light.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
    expect(material.emissive.getHex()).toBe(0xffc56a);
    expect(material.emissiveIntensity).toBe(1.35);

    lantern.dispose();
  });

  it('disposes owned render resources once', () => {
    const model = lanternModel();
    const modelMesh = model.children[0] as Mesh;
    const modelGeometryDispose = vi.spyOn(modelMesh.geometry, 'dispose');
    const modelMaterialDispose = vi.spyOn(modelMesh.material as MeshStandardMaterial, 'dispose');
    const lantern = createHangingLantern(model);
    const shadowDispose = vi.spyOn(lantern.light.shadow, 'dispose');

    lantern.dispose();
    lantern.dispose();

    expect(modelGeometryDispose).toHaveBeenCalledOnce();
    expect(modelMaterialDispose).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalledOnce();
    expect(lantern.root.children).toHaveLength(0);
  });
});
