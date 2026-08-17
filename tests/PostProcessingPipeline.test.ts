import { describe, expect, it } from 'vitest';
import {
  PerspectiveCamera,
  Scene,
  Vector2,
} from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { configureHoverOutlinePass } from '../src/rendering/PostProcessingPipeline';

describe('hover outline post-processing', () => {
  it('builds its mask from visible item fragments', () => {
    const outlinePass = new OutlinePass(
      new Vector2(1280, 720),
      new Scene(),
      new PerspectiveCamera(),
    );

    configureHoverOutlinePass(outlinePass);

    expect(outlinePass.visibleEdgeColor.getHex()).toBe(0xffffff);
    expect(outlinePass.hiddenEdgeColor.getHex()).toBe(0x000000);
    expect(outlinePass.prepareMaskMaterial.fragmentShader).toContain(
      'vec4(0.0, 0.0, 1.0, 1.0)',
    );
    expect(outlinePass.prepareMaskMaterial.vertexShader).not.toContain('textureMatrix');

    outlinePass.dispose();
  });
});
