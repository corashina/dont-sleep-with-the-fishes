import {
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { expect, it, vi } from 'vitest';
import { HoverOutlinePass } from '../src/rendering/HoverOutlinePass';

type OutlineInternals = HoverOutlinePass & {
  _fsQuad: { render(renderer: WebGLRenderer): void };
};

function createPass(): {
  pass: HoverOutlinePass;
  scene: Scene;
  selected: Mesh;
  other: Mesh;
} {
  const scene = new Scene();
  const selected = new Mesh(new SphereGeometry(), new MeshBasicMaterial());
  const other = new Mesh(new SphereGeometry(), new MeshBasicMaterial());
  scene.add(selected, other);
  const pass = new HoverOutlinePass(
    new Vector2(64, 64),
    scene,
    new PerspectiveCamera(),
  );
  pass.selectedObjects = [selected];
  vi.spyOn((pass as unknown as OutlineInternals)._fsQuad, 'render')
    .mockImplementation(() => undefined);
  return { pass, scene, selected, other };
}

function createRenderer(onRender?: () => void): {
  renderer: WebGLRenderer;
  render: ReturnType<typeof vi.fn>;
  stencilTest: () => boolean;
  target: () => unknown;
  clearColor: () => Color;
  clearAlpha: () => number;
} {
  let color = new Color(0x123456);
  let alpha = 0.4;
  let stencil = true;
  let renderTarget: unknown = { name: 'initial-target' };
  const render = vi.fn(() => onRender?.());
  const renderer = {
    autoClear: true,
    shadowMap: { autoUpdate: true, needsUpdate: true },
    state: { buffers: { stencil: { setTest: (value: boolean) => { stencil = value; } } } },
    getClearColor: (target: Color) => target.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: (value: Color | number, nextAlpha: number) => {
      color = value instanceof Color ? value.clone() : new Color(value);
      alpha = nextAlpha;
    },
    getRenderTarget: () => renderTarget,
    setRenderTarget: (value: unknown) => { renderTarget = value; },
    clear: vi.fn(),
    render,
  } as unknown as WebGLRenderer;
  return {
    renderer,
    render,
    stencilTest: () => stencil,
    target: () => renderTarget,
    clearColor: () => color,
    clearAlpha: () => alpha,
  };
}

it('disables shadow refreshes during both outline scene renders', () => {
  const { pass } = createPass();
  const shadowStates: Array<[boolean, boolean]> = [];
  const testRenderer = createRenderer(() => {
    shadowStates.push([
      testRenderer.renderer.shadowMap.autoUpdate,
      testRenderer.renderer.shadowMap.needsUpdate,
    ]);
  });
  try {
    pass.render(
      testRenderer.renderer,
      new WebGLRenderTarget(64, 64),
      new WebGLRenderTarget(64, 64),
      0,
      false,
    );
    expect(shadowStates).toEqual([[false, false], [false, false]]);
    expect(testRenderer.renderer.shadowMap.autoUpdate).toBe(true);
    expect(testRenderer.renderer.shadowMap.needsUpdate).toBe(true);
  } finally {
    pass.dispose();
  }
});

it('restores scene and renderer state when the selected render fails', () => {
  const { pass, scene, selected, other } = createPass();
  const background = new Color(0xabcdef);
  const overrideMaterial = new MeshBasicMaterial();
  scene.background = background;
  scene.overrideMaterial = overrideMaterial;
  let renderCount = 0;
  const testRenderer = createRenderer(() => {
    renderCount += 1;
    if (renderCount === 2) throw new Error('mask render failed');
  });
  const initialTarget = testRenderer.target();
  const initialColor = testRenderer.clearColor().clone();
  try {
    expect(() => pass.render(
      testRenderer.renderer,
      new WebGLRenderTarget(64, 64),
      new WebGLRenderTarget(64, 64),
      0,
      true,
    )).toThrow('mask render failed');
    expect(selected.visible).toBe(true);
    expect(other.visible).toBe(true);
    expect((selected.material as MeshBasicMaterial).colorWrite).toBe(true);
    expect((other.material as MeshBasicMaterial).colorWrite).toBe(true);
    expect(scene.background).toBe(background);
    expect(scene.overrideMaterial).toBe(overrideMaterial);
    expect(testRenderer.renderer.autoClear).toBe(true);
    expect(testRenderer.stencilTest()).toBe(true);
    expect(testRenderer.target()).toBe(initialTarget);
    expect(testRenderer.clearColor()).toEqual(initialColor);
    expect(testRenderer.clearAlpha()).toBe(0.4);
    expect(testRenderer.renderer.shadowMap.autoUpdate).toBe(true);
    expect(testRenderer.renderer.shadowMap.needsUpdate).toBe(true);
  } finally {
    pass.dispose();
    overrideMaterial.dispose();
  }
});
