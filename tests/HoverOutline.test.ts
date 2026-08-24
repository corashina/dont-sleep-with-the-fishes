import { Group, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import {
  HOVER_OUTLINE_NAME,
  HoverOutline,
  sceneHoverOutlineTargets,
} from '../src/rendering/HoverOutline';

describe('HoverOutline', () => {
  it('registers one scene target and removes it during cleanup', () => {
    const scene = new Scene();
    const target = new Group();
    scene.add(target);
    const outline = new HoverOutline();

    outline.setTarget(target);
    expect(sceneHoverOutlineTargets(scene)).toEqual([target]);
    expect(target.getObjectByName(HOVER_OUTLINE_NAME)).toBeDefined();

    outline.dispose();
    expect(sceneHoverOutlineTargets(scene)).toEqual([]);
    expect(target.getObjectByName(HOVER_OUTLINE_NAME)).toBeUndefined();
  });
});
