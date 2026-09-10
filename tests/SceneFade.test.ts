import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import { expect, it, vi } from 'vitest';
import { SceneFade } from '../src/rendering/SceneFade';

it('isolates shared materials, fades lights, and restores and disposes fade resources', () => {
  const source = new MeshStandardMaterial({ opacity: 0.8, alphaTest: 0.4 });
  const geometry = new BoxGeometry();
  const materials = [source, source];
  const first = new Mesh(geometry, materials);
  const second = new Mesh(geometry, source);
  const light = new PointLight(0xffffff, 5);
  const root = new Group();
  root.add(first, second, light);
  const fade = new SceneFade();
  try {
    fade.begin([root]);
    const faded = second.material;
    expect(faded).not.toBe(source);
    expect(first.material[0]).toBe(faded);
    expect(first.material[1]).toBe(faded);
    const dispose = vi.spyOn(faded, 'dispose');
    fade.apply(0.5);
    expect(faded.opacity).toBe(0.4);
    expect(faded.transparent).toBe(true);
    expect(faded.depthWrite).toBe(false);
    expect(faded.alphaTest).toBe(0);
    expect(light.intensity).toBe(2.5);
    expect(source.opacity).toBe(0.8);
    expect(source.transparent).toBe(false);
    expect(source.depthWrite).toBe(true);
    expect(source.alphaTest).toBe(0.4);
    fade.reset();
    expect(first.material).toBe(materials);
    expect(second.material).toBe(source);
    expect(light.intensity).toBe(5);
    expect(dispose).toHaveBeenCalledOnce();
    fade.reset();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    fade.reset();
    geometry.dispose();
    source.dispose();
    light.dispose();
  }
});
