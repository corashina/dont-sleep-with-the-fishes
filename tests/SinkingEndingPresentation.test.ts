// Importance: 95/100. Protects crack/break/fall ordering, the blackout boundary, and scene cleanup.
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, ShaderMaterial } from 'three';
import {
  SinkingEndingPresentation, SINKING_BREAK_TIME, SINKING_FALL_TIME, SINKING_BLACKOUT_TIME, SINKING_DURATION,
} from '../src/survival/SinkingEndingPresentation';

function fixture() {
  const camera = new PerspectiveCamera();
  const cameraRig = new Group();
  const boatRig = new Group();
  const hull = new Mesh(new BoxGeometry(3, 0.2, 5), new MeshBasicMaterial());
  hull.name = 'lifeboat-hull-strake-0';
  boatRig.add(hull);
  cameraRig.add(camera);
  const sound = vi.fn();
  const ending = new SinkingEndingPresentation(boatRig, cameraRig, camera, sound);
  const blackout = camera.getObjectByName('sinking-blackout') as Mesh;
  return { ending, camera, cameraRig, boatRig, hull, blackout, sound };
}

describe('sinking ending', () => {
  it('shows the crack, broken hull, and a brief fall before cutting to black', () => {
    const { ending, cameraRig, boatRig, hull, blackout, sound } = fixture();
    ending.apply(SINKING_BREAK_TIME - 0.001);
    const previousHeight = cameraRig.position.y;
    expect(blackout.visible).toBe(false);
    expect(sound.mock.calls.flat()).toEqual(['strain']);
    ending.apply(SINKING_BREAK_TIME);
    expect(cameraRig.position.y).toBeCloseTo(previousHeight, 5);
    expect(blackout.visible).toBe(false);
    expect(blackout.material).toMatchObject({ transparent: true, opacity: 1, depthTest: false });
    expect(sound.mock.calls.flat()).toEqual(['strain', 'break']);
    ending.apply(SINKING_FALL_TIME);
    expect(hull.visible).toBe(false);
    expect(boatRig.children.filter((object) => object.name.startsWith('sinking-')).every((object) => object.visible)).toBe(true);
    expect(blackout.visible).toBe(false);
    ending.apply(SINKING_FALL_TIME + 0.15);
    expect(cameraRig.position.y).toBeLessThan(previousHeight - 0.1);
    expect(blackout.visible).toBe(false);
    const pose = cameraRig.position.clone();
    ending.apply(SINKING_FALL_TIME + 0.15);
    expect(cameraRig.position).toEqual(pose);
    ending.apply(SINKING_BLACKOUT_TIME - 0.001);
    expect(blackout.visible).toBe(false);
    ending.apply(SINKING_BLACKOUT_TIME);
    expect(blackout.visible).toBe(true);
    ending.apply(SINKING_DURATION);
    expect(blackout.visible).toBe(true);
    ending.dispose();
  });

  it('orders sounds once through skipped and repeated final frames', () => {
    const { ending, sound, blackout } = fixture();
    ending.apply(SINKING_DURATION);
    ending.apply(SINKING_DURATION);
    expect(blackout.visible).toBe(true);
    ending.dispose();
    expect(sound.mock.calls.flat()).toEqual(['strain', 'break', 'finish']);
  });

  it('restores the camera and boat and disposes its blackout once when interrupted', () => {
    const { ending, camera, cameraRig, boatRig, hull, blackout, sound } = fixture();
    const disposeHull = vi.spyOn(hull.geometry, 'dispose');
    const disposeHullMaterial = vi.spyOn(hull.material, 'dispose');
    const disposeGeometry = vi.spyOn(blackout.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(blackout.material as ShaderMaterial, 'dispose');
    ending.apply(SINKING_BLACKOUT_TIME);
    ending.dispose();
    ending.dispose();
    expect(camera.children).toHaveLength(0);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(boatRig.position.toArray()).toEqual([0, 0, 0]);
    expect(boatRig.children).toEqual([hull]);
    expect(hull.visible).toBe(true);
    expect(disposeHull).not.toHaveBeenCalled();
    expect(disposeHullMaterial).not.toHaveBeenCalled();
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(sound.mock.calls.flat()).toEqual(['strain', 'break', 'finish']);
  });
});
