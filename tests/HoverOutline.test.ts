import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
} from 'three';
import {
  HOVER_OUTLINE_NAME,
  HoverOutline,
  sceneHoverOutlineTargets,
} from '../src/rendering/HoverOutline';

describe('HoverOutline', () => {
  it('registers the exact multipart target instead of a convex proxy', () => {
    const scene = new Scene();
    const target = new Group();
    target.add(
      new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
      new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
    );
    scene.add(target);
    const outline = new HoverOutline();

    outline.setTarget(target);

    expect(sceneHoverOutlineTargets(scene)).toEqual([target]);
    expect(target.getObjectByName(HOVER_OUTLINE_NAME)).toBeInstanceOf(Object3D);
    expect(target.getObjectByName(HOVER_OUTLINE_NAME)).not.toBeInstanceOf(Mesh);

    outline.setTarget(null);
    expect(sceneHoverOutlineTargets(scene)).toEqual([]);
    expect(target.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
    outline.dispose();
  });
});
