import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, ShaderMaterial, Texture } from 'three';
import { prepareScene } from '../src/rendering/prepareScene';

describe('scene preparation', () => {
  it('uploads hidden materials and shader textures once before compiling', async () => {
    const texture = new Texture();
    const targetTexture = new Texture();
    targetTexture.isRenderTargetTexture = true;
    const scene = new Scene();
    const hidden = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture }));
    hidden.visible = false;
    scene.add(hidden, new Mesh(new BoxGeometry(), new ShaderMaterial({
      uniforms: { image: { value: texture }, target: { value: targetTexture } },
    })));
    const calls: string[] = [];
    const renderer = {
      initTexture: vi.fn(() => calls.push('texture')),
      compileAsync: vi.fn(async () => { calls.push('compile'); return scene; }),
    };
    await prepareScene(renderer, scene, new PerspectiveCamera());
    expect(renderer.initTexture).toHaveBeenCalledExactlyOnceWith(texture);
    expect(calls).toEqual(['texture', 'compile']);
  });

  it('waits for shader completion and preserves template ownership', async () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const owner = new Group();
    const template = new Group();
    owner.add(template);
    let finish!: () => void;
    const renderer = {
      initTexture: vi.fn(),
      compileAsync: vi.fn(async () => scene),
    };
    renderer.compileAsync.mockImplementationOnce(() => new Promise<Scene>(resolve => {
      finish = () => resolve(scene);
    }));
    let ready = false;
    const pending = prepareScene(renderer, scene, camera, [template]).then(() => { ready = true; });
    await Promise.resolve();
    expect(ready).toBe(false);
    finish();
    await pending;
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    expect(renderer.compileAsync.mock.calls[1]).toEqual([expect.any(Group), camera, scene]);
    expect(template.parent).toBe(owner);
  });

  it('does not compile a scene after its owner is disposed', async () => {
    const scene = new Scene();
    const renderer = { initTexture: vi.fn(), compileAsync: vi.fn(async () => scene) };
    await prepareScene(renderer, scene, new PerspectiveCamera(), [], () => false);
    expect(renderer.compileAsync).not.toHaveBeenCalled();
  });
});
