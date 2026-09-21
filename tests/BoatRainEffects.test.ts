import { describe, expect, it, vi } from 'vitest';
import { Mesh, ShaderLib, Texture, type WebGLRenderer } from 'three';
import { BoatRainEffects } from '../src/world/BoatRainEffects';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';

// Importance: 95/100. Rain must stop, wetness must clear, and resources must survive weather changes.
describe('boat rain lifecycle', () => {
  it('wets the boat, dries after rain, and releases only its own splash resources', () => {
    const build = createLifeboat(LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture()));
    const rain = new BoatRainEffects(build.root);
    const material = build.darkTimberMaterial;
    const shader = {
      uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader,
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    const wetness = shader.uniforms.shipWetStrength!;
    const splash = build.root.getObjectByName('boat-rain-splashes') as Mesh;
    const geometry = splash.geometry;
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const timberDispose = vi.spyOn(material, 'dispose');
    expect(wetness.value).toBe(0);
    expect(splash.visible).toBe(false);

    rain.setIntensity(1);
    rain.update(2, 2);
    expect(wetness.value).toBe(1);
    expect(splash.visible).toBe(true);
    expect(geometry.getAttribute('contact').count).toBeGreaterThan(50);
    rain.setIntensity(0);
    rain.update(3, 1);
    expect(splash.visible).toBe(false);
    expect(wetness.value).toBeGreaterThan(0);
    expect(wetness.value).toBeLessThan(1);
    rain.update(23, 20);
    expect(wetness.value).toBe(0);
    expect(splash.geometry).toBe(geometry);
    expect(geometryDispose).not.toHaveBeenCalled();

    rain.dispose();
    expect(build.root.getObjectByName('boat-rain-splashes')).toBeUndefined();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(timberDispose).not.toHaveBeenCalled();
  });
});
