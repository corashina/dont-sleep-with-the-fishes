import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, type SphereGeometry, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { LighthousePresentation } from '../src/survival/LighthousePresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';

function setup() {
  const model = new Group();
  const geometry = new BoxGeometry(4, 24, 4);
  const material = new MeshStandardMaterial();
  model.add(new Mesh(geometry, material));
  const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(0, 2, 0);
  const presentation = new LighthousePresentation({
    camera, propModels: { createEventModel: () => ({ root: model }) },
  } as unknown as FocusedEventPresentationDependencies);
  return { presentation, camera, geometry, material };
}

describe('lighthouse presentation', () => {
  it('places repeatable variants well to either side of the forward view', () => {
    const { presentation } = setup();
    presentation.stage(0);
    const left = presentation.itemAimTarget().getWorldPosition(new Vector3());
    presentation.stage(1);
    const right = presentation.itemAimTarget().getWorldPosition(new Vector3());
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBe(-left.x);
    expect(right.y).toBe(left.y);
    expect(right.z).toBe(left.z);
    expect(Math.atan2(Math.abs(left.x), -left.z)).toBeGreaterThan(Math.PI / 6);
    presentation.stage(0);
    expect(presentation.itemAimTarget().getWorldPosition(new Vector3())).toEqual(left);
    presentation.dispose();
  });

  it('flashes toward the player and dims when the beam faces away', () => {
    const { presentation, camera } = setup();
    presentation.stage();
    const target = presentation.itemAimTarget().getWorldPosition(new Vector3());
    camera.position.set(target.x, target.y, target.z + 260);
    presentation.update(0, 0);
    const beacon = presentation.root.getObjectByName('lighthouse-beacon') as Mesh<SphereGeometry, MeshBasicMaterial>;
    const brightness = beacon.material.color.r;
    presentation.update(4, 4);
    expect(beacon.material.color.r).toBeLessThan(brightness / 3);
    presentation.dispose();
  });

  it('keeps the tower distant and fixed while the beam completes an eight-second turn', () => {
    const { presentation } = setup();
    presentation.stage();
    const position = presentation.itemAimTarget().getWorldPosition(new Vector3());
    expect(position.length()).toBeGreaterThan(250);
    const beam = presentation.root.getObjectByName('lighthouse-rotating-beam')!;
    presentation.update(2, 2);
    expect(beam.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(presentation.itemAimTarget().getWorldPosition(new Vector3())).toEqual(position);
    presentation.update(8, 6);
    expect(beam.rotation.y).toBeCloseTo(0);
    presentation.dispose();
  });

  it('leaves camera control with the player through reveal, visibility changes, and clear', async () => {
    const { presentation, camera } = setup();
    const initial = camera.quaternion.clone();
    const position = camera.position.clone();
    presentation.stage();
    const reveal = presentation.reveal();
    presentation.update(1, 1);
    presentation.settleForVisibilityChange();
    await reveal;
    expect(camera.quaternion.equals(initial)).toBe(true);
    expect(camera.position.equals(position)).toBe(true);
    camera.rotation.y = 0.7;
    camera.position.x = 2;
    const playerRotation = camera.quaternion.clone();
    const playerPosition = camera.position.clone();
    presentation.update(2, 1);
    presentation.clear();
    expect(camera.quaternion.equals(playerRotation)).toBe(true);
    expect(camera.position.equals(playerPosition)).toBe(true);
    expect(presentation.root.visible).toBe(false);
    presentation.dispose();
  });

  it('cancels pending animation and releases model resources once', async () => {
    const { presentation, geometry, material } = setup();
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    presentation.stage();
    const reveal = presentation.reveal();
    presentation.dispose();
    presentation.dispose();
    await reveal;
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
