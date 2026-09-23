import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, ShaderMaterial, Texture } from 'three';
import { prepareScene } from '../src/rendering/prepareScene';

describe('scene preparation', () => {
  // Importance: 95/100. Cancellation between shader stages must not start more GPU work.
  it.each([false, true])('reports shader stages and respects cancellation: %s', async cancelled => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const stages: string[] = [];
    let current = true;
    const renderer = {
      initTexture: vi.fn(),
      compileAsync: vi.fn(async () => {
        expect(stages.at(-1)).toBe(renderer.compileAsync.mock.calls.length === 1
          ? 'preparingSceneShaders' : 'preparingObjectShaders');
        if (cancelled) current = false;
        return scene;
      }),
    };
    await prepareScene(renderer, scene, camera, [new Group()], () => current,
      status => stages.push(status.stage));
    expect(stages.filter(stage => stage !== 'preparingTextures')).toEqual(cancelled
      ? ['preparingSceneShaders'] : ['preparingSceneShaders', 'preparingObjectShaders']);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(cancelled ? 1 : 2);
  });

  // Importance: 95/100. Progress must reflect uploads and stop when the scene is cancelled.
  it('reports completed texture batches and stops before compiling a cancelled scene', async () => {
    const scene = new Scene();
    for (let index = 0; index < 16; index += 1) {
      scene.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: new Texture() })));
    }
    let current = true;
    const report = vi.fn();
    const renderer = {
      initTexture: vi.fn(() => { if (renderer.initTexture.mock.calls.length === 8) current = false; }),
      compileAsync: vi.fn(async () => scene),
    };
    await prepareScene(renderer, scene, new PerspectiveCamera(), [], () => current, report);
    expect(report.mock.calls.map(([status]) => status)).toEqual([
      { stage: 'preparingTextures', completed: 0, total: 16 },
      { stage: 'preparingTextures', completed: 8, total: 16 },
    ]);
    expect(renderer.initTexture).toHaveBeenCalledTimes(8);
    expect(renderer.compileAsync).not.toHaveBeenCalled();
  });

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
