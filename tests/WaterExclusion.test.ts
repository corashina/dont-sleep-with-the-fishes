import { Group, Matrix4, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import {
  createWaterExclusion,
  pointInWaterExclusion,
} from '../src/ocean/WaterExclusion';

describe('water exclusions', () => {
  it('keeps containment aligned with a moved and rotated vessel', () => {
    const vessel = new Group();
    vessel.position.set(5, 2, -4);
    vessel.rotation.set(0.1, 0.5, -0.08);
    vessel.updateWorldMatrix(true, false);
    const region = createWaterExclusion(vessel, 1, 2.2);

    expect(pointInWaterExclusion(
      vessel.localToWorld(new Vector3(0.5, 0, 1)),
      region,
    )).toBe(true);
    expect(pointInWaterExclusion(
      vessel.localToWorld(new Vector3(1.2, 0, 0)),
      region,
    )).toBe(false);
  });

  it('keeps containment aligned through a non-uniformly scaled parent', () => {
    const rig = new Group();
    rig.position.set(-3, 1.5, 6);
    rig.rotation.set(-0.12, 0.7, 0.18);
    rig.scale.set(1.8, 0.65, 1.25);
    const vessel = new Group();
    vessel.position.set(2, -0.4, -3);
    vessel.rotation.set(0.08, -0.3, 0.05);
    rig.add(vessel);
    const region = createWaterExclusion(vessel, 1, 2.2);

    expect(pointInWaterExclusion(
      vessel.localToWorld(new Vector3(0.95, 3, -2.1)),
      region,
    )).toBe(true);
    expect(pointInWaterExclusion(
      vessel.localToWorld(new Vector3(1.05, 0, 0)),
      region,
    )).toBe(false);
    expect(pointInWaterExclusion(
      vessel.localToWorld(new Vector3(0, 0, 2.3)),
      region,
    )).toBe(false);
  });

  it('starts with explicit inactive fixed-size uniform defaults', () => {
    const ocean = new OceanRenderer();

    expect(ocean.material.uniforms.uExclusionCount!.value).toBe(0);
    expect(ocean.material.uniforms.uExclusionWorldToLocal!.value).toHaveLength(2);
    expect(ocean.material.uniforms.uExclusionBounds!.value).toHaveLength(2);
    expect(ocean.material.uniforms.uExclusionWorldToLocal!.value).toEqual([
      new Matrix4(),
      new Matrix4(),
    ]);
    expect(ocean.material.uniforms.uExclusionBounds!.value).toEqual([
      new Vector4(),
      new Vector4(),
    ]);
    ocean.dispose();
  });

  it('uploads two active exclusion transforms and bounds', () => {
    const first = new Group();
    first.position.set(2, 1, -3);
    first.rotation.y = 0.4;
    const second = new Group();
    second.position.set(-6, -2, 8);
    second.rotation.x = -0.2;
    const firstRegion = createWaterExclusion(first, 1, 2);
    const secondRegion = createWaterExclusion(second, 3.7, 10.2);
    const ocean = new OceanRenderer();

    ocean.setExclusions([firstRegion, secondRegion]);

    expect(ocean.material.uniforms.uExclusionCount!.value).toBe(2);
    expect(ocean.material.uniforms.uExclusionWorldToLocal!.value).toEqual([
      firstRegion.worldToLocal,
      secondRegion.worldToLocal,
    ]);
    expect(ocean.material.uniforms.uExclusionBounds!.value).toEqual([
      firstRegion.bounds,
      secondRegion.bounds,
    ]);
    ocean.dispose();
  });

  it('resets unused uniform slots when exclusions become inactive', () => {
    const ocean = new OceanRenderer();
    ocean.setExclusions([
      createWaterExclusion(new Group(), 1, 2),
      createWaterExclusion(new Group(), 3.7, 10.2),
    ]);

    ocean.setExclusions([]);

    expect(ocean.material.uniforms.uExclusionCount!.value).toBe(0);
    expect(ocean.material.uniforms.uExclusionWorldToLocal!.value).toEqual([
      new Matrix4(),
      new Matrix4(),
    ]);
    expect(ocean.material.uniforms.uExclusionBounds!.value).toEqual([
      new Vector4(),
      new Vector4(),
    ]);
    ocean.dispose();
  });

  it('limits active exclusions to the two fixed shader slots', () => {
    const ocean = new OceanRenderer();
    const first = createWaterExclusion(new Group(), 1, 2);
    const second = createWaterExclusion(new Group(), 3, 4);
    const third = createWaterExclusion(new Group(), 5, 6);

    ocean.setExclusions([first, second, third]);

    expect(ocean.material.uniforms.uExclusionCount!.value).toBe(2);
    expect(ocean.material.uniforms.uExclusionBounds!.value).toEqual([
      first.bounds,
      second.bounds,
    ]);
    ocean.dispose();
  });

  it('uses a fixed two-region shader mask before ocean color output', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(ocean.material.vertexShader).toContain('vWorldPosition = worldPosition.xyz;');
    expect(shader).toContain('uniform mat4 uExclusionWorldToLocal[2];');
    expect(shader).toContain('uniform vec4 uExclusionBounds[2];');
    expect(shader).toContain('for (int i = 0; i < 2; i++)');
    expect(shader.indexOf('discard;')).toBeGreaterThan(-1);
    expect(shader.indexOf('discard;')).toBeLessThan(
      shader.indexOf('gl_FragColor = vec4(color, 0.98);'),
    );
    ocean.dispose();
  });
});
