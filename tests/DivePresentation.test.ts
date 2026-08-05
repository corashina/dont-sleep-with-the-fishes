// Importance: 4/5. Protects dive world transitions, pooled effects, restoration, and cleanup.
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DivePresentation } from '../src/survival/DivePresentation';

function createGoggleModel(): Group {
  const root = new Group();
  const goggles = new Group();
  goggles.name = 'scubaSet:scubaGoggles';
  const glasses = new Mesh(
    new BoxGeometry(1, 0.5, 0.12),
    new MeshStandardMaterial({ color: 0x263c3d }),
  );
  glasses.name = 'glasses25.001';
  goggles.add(glasses);
  root.add(goggles);
  return root;
}

function createFixture() {
  const camera = new PerspectiveCamera();
  camera.position.set(1.2, 2.4, -0.8);
  camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.32);
  const initialPosition = camera.position.clone();
  const initialQuaternion = camera.quaternion.clone();
  const starboardQuaternion = initialQuaternion.clone().multiply(
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
  );
  const presentation = new DivePresentation({
    camera,
    starboardPosition: new Vector3(2, 2.4, -0.8),
    starboardQuaternion,
    goggleModel: createGoggleModel(),
  });
  return { camera, initialPosition, initialQuaternion, presentation };
}

describe('DivePresentation', () => {
  it('turns left at starboard, transitions goggles, exits the hull, and fires impact once', async () => {
    const { camera, presentation } = createFixture();
    const impact = vi.fn();
    const pending = presentation.start(impact);
    const goggles = presentation.root.getObjectByName('dive-goggles')!;
    const modelGoggles = presentation.root.getObjectByName('glasses25.001') as Mesh<
      BoxGeometry,
      MeshStandardMaterial
    >;
    expect(goggles.visible).toBe(false);
    presentation.update(1.1, 1.1, 0.2);
    expect(camera.position.x).toBeGreaterThan(1.8);
    expect(goggles.visible).toBe(false);
    expect(modelGoggles.material.opacity).toBe(0);
    const seatedX = camera.position.x;
    const seatedDirection = camera.getWorldDirection(new Vector3());
    const initialDirection = new Vector3(0, 0, -1).applyQuaternion(
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.32),
    );
    expect(initialDirection.angleTo(seatedDirection)).toBeCloseTo(Math.PI / 2);
    presentation.update(1.65, 0.55, 0.2);
    expect(goggles.visible).toBe(true);
    expect(modelGoggles.material.opacity).toBeGreaterThan(0);
    expect(modelGoggles.material.opacity).toBeLessThan(1);
    const transitionY = goggles.position.y;
    presentation.update(2.2, 0.55, 0.2);
    expect(goggles.position.y).toBeLessThan(transitionY);
    expect(goggles.position.y).toBeGreaterThan(0);
    expect(goggles.scale.x).toBe(1);
    expect(goggles.position.y).toBeCloseTo(0.48);
    expect(goggles.position.z).toBeCloseTo(-0.72);
    expect(goggles.rotation.z).toBeCloseTo(Math.PI);
    expect(modelGoggles.material.opacity).toBe(1);
    presentation.update(3.6, 2.5, 0.2);
    expect(camera.position.x).toBeGreaterThan(seatedX + 0.95);
    presentation.update(4.0, 0.4, 0.2);
    expect(impact).toHaveBeenCalledOnce();
    expect(presentation.root.getObjectByName('dive-water-veil')?.visible).toBe(true);
    presentation.update(5.8, 1.8, 0.2);
    await pending;
  });

  it('crosses the local wave height at impact', () => {
    const { camera, presentation } = createFixture();
    void presentation.start(() => undefined);

    presentation.update(3.59, 3.59, 0.2);
    expect(camera.position.y).toBeGreaterThan(0.2);
    presentation.update(3.6, 0.01, 0.2);
    expect(camera.position.y).toBeCloseTo(0.2);
  });

  it('crosses the sampled world surface under a rotated boat rig', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1.2, 2.4, -0.8);
    const boatRig = new Group();
    boatRig.position.set(-0.3, 0.7, 0.25);
    boatRig.rotation.set(0.12, 0, -0.08);
    boatRig.add(camera);
    const presentation = new DivePresentation({
      camera,
      starboardPosition: new Vector3(2, 2.4, -0.8),
      starboardQuaternion: new Quaternion(),
      goggleModel: createGoggleModel(),
    });
    boatRig.updateWorldMatrix(true, true);
    const entryWorld = presentation.copyWaterEntryWorldPosition(new Vector3());
    const waterHeight = -0.15;
    void presentation.start(() => undefined);

    presentation.update(3.6, 3.6, waterHeight);
    const cameraWorld = camera.getWorldPosition(new Vector3());

    expect(cameraWorld.x).toBeCloseTo(entryWorld.x);
    expect(cameraWorld.y).toBeCloseTo(waterHeight);
    expect(cameraWorld.z).toBeCloseTo(entryWorld.z);
    presentation.dispose();
  });

  it('fully hides the world while goggles and bubbles render above the veil', () => {
    const { camera, presentation } = createFixture();
    camera.fov = 65;
    camera.aspect = 32 / 9;
    void presentation.start(() => undefined);
    presentation.update(4, 4, 0.2);

    const veil = presentation.root.getObjectByName('dive-water-veil') as Mesh<
      PlaneGeometry,
      MeshBasicMaterial
    >;
    const goggles = presentation.root.getObjectByName('glasses25.001') as Mesh;
    const bubbles = presentation.root.getObjectByName('dive-bubbles') as InstancedMesh;
    const visibleHeight = 2 * Math.abs(veil.position.z)
      * Math.tan(MathUtils.degToRad(camera.fov / 2));
    expect(veil.geometry.parameters.height).toBeGreaterThan(visibleHeight);
    expect(veil.geometry.parameters.width).toBeGreaterThan(
      visibleHeight * camera.aspect,
    );
    expect(veil.material.opacity).toBe(1);
    expect(goggles.renderOrder).toBeGreaterThan(veil.renderOrder);
    expect(bubbles.renderOrder).toBeGreaterThan(veil.renderOrder);
    expect(goggles.visible).toBe(true);
    expect(bubbles.visible).toBe(true);
    const bubbleMatrix = new Matrix4();
    let minimumBubbleX = Number.POSITIVE_INFINITY;
    let maximumBubbleX = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < bubbles.count; index += 1) {
      bubbles.getMatrixAt(index, bubbleMatrix);
      minimumBubbleX = Math.min(minimumBubbleX, bubbleMatrix.elements[12]);
      maximumBubbleX = Math.max(maximumBubbleX, bubbleMatrix.elements[12]);
    }
    const visibleHalfWidth = visibleHeight * camera.aspect / 2;
    expect(minimumBubbleX).toBeLessThan(-visibleHalfWidth);
    expect(maximumBubbleX).toBeGreaterThan(visibleHalfWidth);
    presentation.root.getObjectByName('dive-goggles')?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) expect(material.transparent).toBe(true);
    });
    presentation.dispose();
  });

  it('owns and disposes the imported goggles model exactly once', () => {
    const { presentation } = createFixture();
    const glasses = presentation.root.getObjectByName('glasses25.001') as Mesh<
      BoxGeometry,
      MeshStandardMaterial
    >;
    const geometryDispose = vi.spyOn(glasses.geometry, 'dispose');
    const materialDispose = vi.spyOn(glasses.material, 'dispose');

    presentation.dispose();
    presentation.dispose();

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('reuses one fixed bubble pool without adding children during updates', () => {
    const { presentation } = createFixture();
    const bubbles = presentation.root.getObjectByName('dive-bubbles')!;
    const count = bubbles.children.length;
    expect(bubbles).toBeInstanceOf(InstancedMesh);
    expect((bubbles as InstancedMesh).count).toBe(84);
    void presentation.start(() => undefined);
    for (let frame = 0; frame < 120; frame += 1) {
      presentation.update(frame / 60, 1 / 60, 0.2);
    }
    expect(bubbles.children).toHaveLength(count);
  });

  it('restores the original pose after a restart from natural completion', async () => {
    const { camera, initialPosition, initialQuaternion, presentation } = createFixture();
    const first = presentation.start(() => undefined);
    presentation.update(5.8, 5.8, 0.2);
    await first;

    const second = presentation.start(() => undefined);
    presentation.clear();
    await second;

    expect(camera.position.toArray()).toEqual(initialPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
  });

  it.each(['clear', 'dispose', 'start'] as const)(
    'does not continue an update after impact calls %s',
    async (action) => {
      const { camera, initialPosition, initialQuaternion, presentation } = createFixture();
      let replacement: Promise<void> | undefined;
      let replacementSettled = false;
      const first = presentation.start(() => {
        if (action === 'start') {
          replacement = presentation.start(() => undefined);
          void replacement.then(() => {
            replacementSettled = true;
          });
          return;
        }
        presentation[action]();
      });
      presentation.update(5.8, 5.8, 0.2);
      await first;
      if (action === 'start') {
        expect(replacementSettled).toBe(false);
        presentation.clear();
        await replacement;
      }

      expect(camera.position.toArray()).toEqual(initialPosition.toArray());
      expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    },
  );

  it.each(['clear', 'settleForVisibilityChange', 'dispose'] as const)(
    '%s restores the exact camera pose and settles the active handle',
    async (method) => {
      const { camera, initialPosition, initialQuaternion, presentation } = createFixture();
      const pending = presentation.start(() => undefined);
      presentation.update(2.8, 2.8, 0.2);
      presentation[method]();
      await pending;
      expect(camera.position.toArray()).toEqual(initialPosition.toArray());
      expect(camera.quaternion.toArray()).toEqual(initialQuaternion.toArray());
    },
  );

  it('disposes bubble instance data, geometry, and material exactly once', () => {
    const { presentation } = createFixture();
    const bubbles = presentation.root.getObjectByName('dive-bubbles') as InstancedMesh;
    const meshDispose = vi.spyOn(bubbles, 'dispose');
    const geometryDispose = vi.spyOn(bubbles.geometry, 'dispose');
    const material = bubbles.material as MeshBasicMaterial;
    const materialDispose = vi.spyOn(material, 'dispose');

    presentation.dispose();
    presentation.dispose();

    expect(meshDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
