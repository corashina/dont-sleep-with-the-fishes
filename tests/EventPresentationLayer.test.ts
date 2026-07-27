import {
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EventPresentationLayer } from '../src/survival/EventPresentationLayer';
import { collectMeshResources } from '../src/world/SceneResources';

function createLayer(reducedMotion = false): EventPresentationLayer {
  return new EventPresentationLayer(reducedMotion);
}

function geometryOf(root: Object3D, name: string): BufferGeometry {
  const object = root.getObjectByName(name);
  let geometry: BufferGeometry | undefined;
  object?.traverse((child) => {
    if (geometry === undefined && child instanceof Mesh) geometry = child.geometry;
  });
  if (geometry === undefined) throw new Error(`Expected geometry beneath ${name}`);
  return geometry;
}

function collect(root: Object3D): ReadonlyArray<BufferGeometry | Material> {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(root, geometries, materials);
  return [...geometries, ...materials];
}

describe('EventPresentationLayer', () => {
  it('builds stable named tableaus and stages only the requested event', () => {
    const layer = createLayer();
    layer.stage('drifting-bottle');

    expect(layer.root.getObjectByName('event-prop:drifting-bottle')?.visible).toBe(true);
    expect(layer.root.getObjectByName('event-prop:other-people')?.visible).toBe(false);

    layer.dispose();
  });

  it('samples the shared wave field without replacing pooled resources', () => {
    const layer = createLayer();
    layer.stage('mystery-chest');
    const geometry = geometryOf(layer.root, 'event-prop:mystery-chest');

    layer.update(12, 1 / 60);

    expect(geometryOf(layer.root, 'event-prop:mystery-chest')).toBe(geometry);
    layer.dispose();
  });

  it('restores every staged tableau to its authored base transform on clear', () => {
    const layer = createLayer();
    const prop = layer.root.getObjectByName('event-prop:drifting-loot')!;
    const basePosition = prop.position.clone();
    const baseQuaternion = prop.quaternion.clone();

    layer.stage('drifting-loot');
    layer.update(12, 1 / 60);
    expect(prop.position.equals(basePosition)).toBe(false);

    layer.clear();

    expect(prop.position.equals(basePosition)).toBe(true);
    expect(prop.quaternion.equals(baseQuaternion)).toBe(true);
    layer.dispose();
  });

  it('includes the approved identifying components in focused placeholder tableaus', () => {
    const layer = createLayer();

    expect(layer.root.getObjectByName('bottle-retrieval-line')).toBeDefined();
    expect(layer.root.getObjectByName('stern-fish-splash')).toBeDefined();
    expect(layer.root.getObjectByName('trader-cloaked-silhouette')).toBeDefined();
    layer.dispose();
  });

  it('disposes every owned geometry and material exactly once', () => {
    const layer = createLayer();
    const resources = collect(layer.root);
    const disposals = resources.map((resource) => vi.spyOn(resource, 'dispose'));

    layer.dispose();
    layer.dispose();

    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('settles reduced-motion reveals directly into their held pose', async () => {
    const layer = createLayer(true);
    layer.stage('other-people');
    const prop = layer.root.getObjectByName('event-prop:other-people')!;
    const stagedX = prop.position.x;
    const reveal = layer.reveal('other-people');

    layer.update(4, 1 / 60);
    await reveal;

    expect(prop.visible).toBe(true);
    expect(prop.position.x).not.toBe(stagedX);
    layer.dispose();
  });
});
