import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  PerspectiveCamera,
  Scene,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DriftingLootPresentation } from '../src/survival/DriftingLootPresentation';
import { createTestShipFurniture } from './helpers/shipFurniture';

function createRig() {
  const furniture = createTestShipFurniture();
  const sternTarget = new Group();
  sternTarget.position.set(0.72, 0.58, 1.05);
  sternTarget.rotation.set(0.06, -0.12, 0.03);
  const presentation = new DriftingLootPresentation({
    barrel: furniture.clone('barrel'),
    crate: furniture.clone('cargoCrate'),
  }, sternTarget);
  const scene = new Scene();
  scene.add(sternTarget, presentation.root);
  return { furniture, presentation, scene, sternTarget };
}

function activeRoot(presentation: DriftingLootPresentation): Group {
  const root = ['barrel', 'crate']
    .map((variant) => presentation.root.getObjectByName(`drifting-loot:${variant}`))
    .find((object) => object?.visible);
  if (!(root instanceof Group)) throw new Error('Expected active drifting-loot root');
  return root;
}

function borrowedResources(root: Group): Array<BufferGeometry | Material> {
  const resources: Array<BufferGeometry | Material> = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    resources.push(object.geometry);
    resources.push(...(Array.isArray(object.material) ? object.material : [object.material]));
  });
  return resources;
}

describe('DriftingLootPresentation', () => {
  it('stages only the deterministic variant', () => {
    const rig = createRig();
    rig.presentation.stage('barrel');
    expect(rig.presentation.root.getObjectByName('drifting-loot:barrel')?.visible).toBe(true);
    expect(rig.presentation.root.getObjectByName('drifting-loot:crate')?.visible).toBe(false);
    rig.presentation.stage('crate');
    expect(rig.presentation.root.getObjectByName('drifting-loot:barrel')?.visible).toBe(false);
    expect(rig.presentation.root.getObjectByName('drifting-loot:crate')?.visible).toBe(true);
    rig.presentation.dispose();
    rig.furniture.dispose();
  });

  it('moves the floating pose through the shared wave field', () => {
    const rig = createRig();
    rig.presentation.stage('barrel');
    const root = activeRoot(rig.presentation);
    const stagedPosition = root.position.clone();
    const stagedQuaternion = root.quaternion.clone();

    rig.presentation.update(12, 1 / 60);

    expect(root.position.equals(stagedPosition)).toBe(false);
    expect(root.quaternion.equals(stagedQuaternion)).toBe(false);
    rig.presentation.dispose();
    rig.furniture.dispose();
  });

  it('retrieves for 1.1 seconds, then follows the moving stern target', async () => {
    const rig = createRig();
    rig.presentation.stage('crate');
    rig.presentation.update(2, 1 / 60);
    const pending = rig.presentation.retrieve();
    let settled = false;
    void pending.then(() => { settled = true; });

    rig.presentation.update(2.5, 1.09);
    await Promise.resolve();
    expect(settled).toBe(false);

    rig.presentation.update(2.6, 0.01);
    await pending;
    const root = activeRoot(rig.presentation);
    rig.scene.updateMatrixWorld(true);
    expect(root.position.toArray()).toEqual(rig.sternTarget.position.toArray());
    root.quaternion.toArray().forEach((value, index) => {
      expect(value).toBeCloseTo(rig.sternTarget.quaternion.toArray()[index]!);
    });

    rig.sternTarget.position.set(-0.4, 0.81, 1.2);
    rig.sternTarget.rotation.set(-0.02, 0.22, -0.05);
    rig.presentation.update(3, 1 / 60);
    rig.scene.updateMatrixWorld(true);
    expect(root.position.toArray()).toEqual(rig.sternTarget.position.toArray());
    root.quaternion.toArray().forEach((value, index) => {
      expect(value).toBeCloseTo(rig.sternTarget.quaternion.toArray()[index]!);
    });
    rig.presentation.dispose();
    rig.furniture.dispose();
  });

  it('projects visible bounds only while held', async () => {
    const rig = createRig();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.position.set(0, 1.2, 5);
    camera.lookAt(0, 0.5, 0);
    rig.scene.add(camera);
    rig.presentation.stage('barrel');
    expect(rig.presentation.projectHeld(camera, 800, 600)).toBeNull();

    const retrieve = rig.presentation.retrieve();
    rig.presentation.update(1, 1.1);
    await retrieve;

    expect(rig.presentation.projectHeld(camera, 800, 600)).toEqual(
      expect.objectContaining({ visible: true }),
    );
    rig.presentation.clear();
    expect(rig.presentation.projectHeld(camera, 800, 600)).toBeNull();
    rig.presentation.dispose();
    rig.furniture.dispose();
  });

  it('recedes for 0.8 seconds and hides the active root', async () => {
    const rig = createRig();
    rig.presentation.stage('crate');
    const root = activeRoot(rig.presentation);
    const pending = rig.presentation.recede();
    let settled = false;
    void pending.then(() => { settled = true; });

    rig.presentation.update(1, 0.79);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(root.visible).toBe(true);

    rig.presentation.update(2, 0.01);
    await pending;
    expect(root.visible).toBe(false);
    rig.presentation.dispose();
    rig.furniture.dispose();
  });

  it('clear restores both base poses and settles an active promise', async () => {
    const rig = createRig();
    const barrel = rig.presentation.root.getObjectByName('drifting-loot:barrel')!;
    const crate = rig.presentation.root.getObjectByName('drifting-loot:crate')!;
    const barrelBase = {
      position: barrel.position.clone(),
      quaternion: barrel.quaternion.clone(),
    };
    const crateBase = {
      position: crate.position.clone(),
      quaternion: crate.quaternion.clone(),
    };
    rig.presentation.stage('barrel');
    const pending = rig.presentation.retrieve();
    rig.presentation.update(1, 0.4);

    rig.presentation.clear();
    await pending;

    expect(barrel.position.equals(barrelBase.position)).toBe(true);
    expect(barrel.quaternion.equals(barrelBase.quaternion)).toBe(true);
    expect(crate.position.equals(crateBase.position)).toBe(true);
    expect(crate.quaternion.equals(crateBase.quaternion)).toBe(true);
    expect(barrel.visible).toBe(false);
    expect(crate.visible).toBe(false);
    rig.presentation.dispose();
    rig.furniture.dispose();
  });

  it('removes its root without disposing borrowed model resources', () => {
    const rig = createRig();
    const resources = borrowedResources(rig.presentation.root);
    const disposals = resources.map((resource) => vi.spyOn(resource, 'dispose'));

    rig.presentation.dispose();
    rig.presentation.dispose();

    expect(rig.presentation.root.parent).toBeNull();
    disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    rig.furniture.dispose();
  });
});
