// Importance: 8/10. Protects stored shadow quality and live renderer updates.

import { describe, expect, it, vi } from 'vitest';
import {
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PCFSoftShadowMap,
  Scene,
  type WebGLRenderer,
} from 'three';
import { DirectSceneRenderer } from '../src/rendering/SceneRenderer';
import {
  createShadowQualityPreference,
  SHADOW_QUALITY_STORAGE_KEY,
} from '../src/rendering/shadowQuality';

describe('shadow quality', () => {
  it.each([
    { stored: 'low', expected: 'low' },
    { stored: 'high', expected: 'high' },
    { stored: 'medium', expected: 'low' },
    { stored: null, expected: 'low' },
  ] as const)('loads $stored as $expected', ({ stored, expected }) => {
    const storage = {
      getItem: vi.fn(() => stored),
      setItem: vi.fn(),
    };
    const preference = createShadowQualityPreference(
      () => undefined,
      storage,
    );

    expect(preference.get()).toBe(expected);
  });

  it('stores and applies High', () => {
    const apply = vi.fn();
    const storage = {
      getItem: vi.fn(() => 'low'),
      setItem: vi.fn(),
    };
    const preference = createShadowQualityPreference(apply, storage);

    preference.set('high');

    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
    expect(storage.setItem).toHaveBeenCalledWith(
      SHADOW_QUALITY_STORAGE_KEY,
      'high',
    );
  });

  it('changes the shadow filter and refreshes scene materials before rendering', () => {
    const render = vi.fn();
    const renderer = {
      shadowMap: { type: PCFSoftShadowMap },
      render,
    } as unknown as WebGLRenderer;
    const sceneRenderer = new DirectSceneRenderer(renderer, 'low');
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    scene.add(new Mesh(undefined, material));
    const initialVersion = material.version;

    expect(renderer.shadowMap.type).toBe(PCFShadowMap);

    sceneRenderer.setShadowQuality('high');
    sceneRenderer.render(scene, undefined as never, {
      kind: 'menu',
      elapsedSeconds: 0,
    });

    expect(renderer.shadowMap.type).toBe(PCFSoftShadowMap);
    expect(material.version).toBe(initialVersion + 1);
    expect(render).toHaveBeenCalledOnce();
  });
});
