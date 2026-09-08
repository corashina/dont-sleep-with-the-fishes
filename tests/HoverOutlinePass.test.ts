import {
  BufferGeometry, Color, LessEqualDepth, Line, LineBasicMaterial, Mesh,
  MeshBasicMaterial, NoBlending, PerspectiveCamera, Points, PointsMaterial,
  Scene, SphereGeometry, Vector2, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import { expect, it, vi } from 'vitest';
import {
  configureHoverOutlinePass, HoverOutlinePass, OutlineMaskCapturePass,
} from '../src/rendering/HoverOutlinePass';

type OutlineInternals = HoverOutlinePass & {
  _fsQuad: { render(renderer: WebGLRenderer): void };
  _visibilityCache: Map<unknown, boolean>;
  _selectionCache: Set<unknown>;
  _changeVisibilityOfNonSelectedObjects(visible: boolean): void;
};

function createFixture() {
  const scene = new Scene();
  const selected = new Mesh(new SphereGeometry(), new MeshBasicMaterial());
  const other = new Mesh(new SphereGeometry(), new MeshBasicMaterial());
  const hidden = new Mesh(new SphereGeometry(), new MeshBasicMaterial());
  hidden.visible = false;
  const points = new Points(new BufferGeometry(), new PointsMaterial());
  const line = new Line(new BufferGeometry(), new LineBasicMaterial());
  scene.add(selected, other, hidden, points, line);
  const pass = new HoverOutlinePass(new Vector2(64, 64), scene, new PerspectiveCamera());
  configureHoverOutlinePass(pass);
  pass.selectedObjects = [selected];
  const capture = new OutlineMaskCapturePass(pass);
  const internals = pass as unknown as OutlineInternals;
  const write = new WebGLRenderTarget(64, 64);
  const read = new WebGLRenderTarget(64, 64);
  const initialTarget = new WebGLRenderTarget(16, 16);
  let target: WebGLRenderTarget | null = initialTarget;
  const color = new Color(0x123456);
  let alpha = 0.4;
  let stencil = true;
  const events: string[] = [];
  const renderer = {
    autoClear: true,
    shadowMap: { autoUpdate: true, needsUpdate: true },
    state: { buffers: { stencil: { setTest: (value: boolean) => { stencil = value; } } } },
    getClearColor: (value: Color) => value.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: (value: Color | number, nextAlpha: number) => {
      color.set(value); alpha = nextAlpha;
    },
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: WebGLRenderTarget | null) => { target = value; }),
    clear: vi.fn(() => { events.push('clear'); }),
    render: vi.fn(() => { events.push('scene'); }),
    copyTextureToTexture: vi.fn(() => { events.push('copy-mask'); }),
  } as unknown as WebGLRenderer;
  const imageRender = vi.spyOn(internals._fsQuad, 'render').mockImplementation(() => {
    events.push('image');
  });
  const runCapture = () => capture.render(renderer, write, read, 0, true);
  const compose = () => pass.render(renderer, write, read, 0, true);
  const assertRestored = () => {
    expect([selected.visible, other.visible, hidden.visible, points.visible, line.visible])
      .toEqual([true, true, false, true, true]);
    expect(internals._visibilityCache.size).toBe(0);
    expect(internals._selectionCache.size).toBe(0);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(stencil).toBe(true);
    expect(target).toBe(initialTarget);
    expect(color.getHex()).toBe(0x123456);
    expect(alpha).toBe(0.4);
  };
  const dispose = () => {
    pass.dispose(); write.dispose(); read.dispose(); initialTarget.dispose();
    for (const object of [selected, other, hidden, points, line]) {
      object.geometry.dispose(); (object.material as MeshBasicMaterial).dispose();
    }
  };
  return { pass, capture, scene, selected, other, renderer, write, read,
    internals, imageRender, events, runCapture, compose, assertRestored, dispose };
}

it('saves color before clearing only source color and draws selected geometry once', () => {
  const f = createFixture();
  vi.mocked(f.renderer.render).mockImplementation(() => {
    f.events.push('scene');
    expect(f.renderer.getRenderTarget()).toBe(f.read);
    expect(f.selected.visible).toBe(true);
    expect(f.other.visible).toBe(false);
    expect(f.scene.overrideMaterial).toBe(f.pass.prepareMaskMaterial);
    expect(f.pass.prepareMaskMaterial.depthWrite).toBe(false);
    expect(f.pass.prepareMaskMaterial.depthFunc).toBe(LessEqualDepth);
    expect(f.renderer.shadowMap.autoUpdate).toBe(false);
    expect(f.renderer.shadowMap.needsUpdate).toBe(false);
  });
  f.imageRender.mockImplementationOnce(() => {
    f.events.push('save');
    expect(f.renderer.getRenderTarget()).toBe(f.write);
    expect(f.pass.materialCopy.uniforms.tDiffuse!.value).toBe(f.read.texture);
    expect(f.pass.materialCopy.depthTest).toBe(false);
    expect(f.pass.materialCopy.depthWrite).toBe(false);
    expect(f.pass.materialCopy.blending).toBe(NoBlending);
  });
  try {
    expect(f.capture.needsSwap).toBe(false);
    f.runCapture();
    expect(f.events).toEqual(['save', 'clear', 'scene', 'copy-mask']);
    expect(f.renderer.clear).toHaveBeenCalledExactlyOnceWith(true, false, false);
    expect(f.renderer.render).toHaveBeenCalledExactlyOnceWith(f.scene, f.pass.renderCamera);
    expect(f.renderer.copyTextureToTexture).toHaveBeenCalledExactlyOnceWith(
      f.read.texture, f.pass.renderTargetMaskBuffer.texture,
    );
    expect(f.renderer.setRenderTarget).toHaveBeenCalledWith(f.pass.renderTargetMaskBuffer);
    expect(f.capture.needsSwap).toBe(true);
    f.assertRestored();
    f.compose();
    expect(f.renderer.render).toHaveBeenCalledTimes(1);
    expect(f.imageRender).toHaveBeenCalledTimes(6);
    f.assertRestored();
  } finally { f.dispose(); }
});

it('uses either composer target as the retained depth source', () => {
  const f = createFixture();
  try {
    f.runCapture();
    f.capture.render(f.renderer, f.read, f.write, 0, false);
    expect(f.renderer.copyTextureToTexture).toHaveBeenLastCalledWith(
      f.write.texture, f.pass.renderTargetMaskBuffer.texture,
    );
    expect(f.capture.needsSwap).toBe(true);
  } finally { f.dispose(); }
});

it('uses the new scene and camera without retaining previous phase meshes', () => {
  const f = createFixture();
  const nextScene = new Scene();
  const nextCamera = new PerspectiveCamera();
  const nextSelected = f.selected.clone();
  const nextOther = f.other.clone();
  nextScene.add(nextSelected, nextOther);
  try {
    f.runCapture();
    f.assertRestored();
    f.pass.renderScene = nextScene;
    f.pass.renderCamera = nextCamera;
    f.pass.selectedObjects = [nextSelected];
    vi.mocked(f.renderer.render).mockImplementation((scene, camera) => {
      expect(scene).toBe(nextScene);
      expect(camera).toBe(nextCamera);
      expect(nextOther.visible).toBe(false);
      expect(f.other.visible).toBe(true);
      expect(f.internals._selectionCache.has(f.selected)).toBe(false);
      expect(f.internals._visibilityCache.has(f.other)).toBe(false);
    });
    f.capture.render(f.renderer, f.read, f.write, 0, false);
    expect(nextOther.visible).toBe(true);
    f.assertRestored();
  } finally { f.dispose(); }
});

it.each(['empty', 'disabled'] as const)('skips %s selection after a populated frame', (mode) => {
  const f = createFixture();
  try {
    f.runCapture();
    if (mode === 'empty') f.pass.selectedObjects = [];
    else f.pass.enabled = false;
    f.imageRender.mockClear();
    vi.mocked(f.renderer.render).mockClear();
    f.runCapture();
    f.pass.enabled = true;
    f.pass.selectedObjects = [f.selected];
    f.compose();
    expect(f.capture.needsSwap).toBe(false);
    expect(f.imageRender).not.toHaveBeenCalled();
    expect(f.renderer.render).not.toHaveBeenCalled();
  } finally { f.dispose(); }
});

it('does not compose a mask twice or before capture', () => {
  const f = createFixture();
  try {
    f.compose();
    expect(f.imageRender).not.toHaveBeenCalled();
    f.runCapture();
    f.compose();
    f.imageRender.mockClear();
    f.compose();
    expect(f.imageRender).not.toHaveBeenCalled();
  } finally { f.dispose(); }
});

it.each(['scene', 'copy-mask'] as const)('restores state and saved color after %s failure', (stage) => {
  const f = createFixture();
  const background = new Color(0xabcdef);
  const override = new MeshBasicMaterial();
  f.scene.background = background;
  f.scene.overrideMaterial = override;
  try {
    f.runCapture();
    f.imageRender.mockClear();
    const failure = new Error(stage);
    vi.mocked(stage === 'scene' ? f.renderer.render : f.renderer.copyTextureToTexture)
      .mockImplementationOnce(() => { throw failure; });
    expect(f.runCapture).toThrow(failure);
    expect(f.capture.needsSwap).toBe(false);
    expect(f.imageRender).toHaveBeenCalledTimes(2);
    expect(f.pass.materialCopy.uniforms.tDiffuse!.value).toBe(f.write.texture);
    expect(f.scene.background).toBe(background);
    expect(f.scene.overrideMaterial).toBe(override);
    f.assertRestored();
    f.imageRender.mockClear();
    f.compose();
    expect(f.imageRender).not.toHaveBeenCalled();
  } finally { override.dispose(); f.dispose(); }
});

it('keeps the original error when color restoration also fails', () => {
  const f = createFixture();
  try {
    vi.mocked(f.renderer.render).mockImplementationOnce(() => { throw new Error('selected failed'); });
    f.imageRender.mockImplementationOnce(() => undefined).mockImplementationOnce(() => {
      throw new Error('restore failed');
    });
    expect(f.runCapture).toThrow('selected failed');
    f.assertRestored();
  } finally { f.dispose(); }
});

it('does not restore visibility or source color when saving color fails', () => {
  const f = createFixture();
  const visibility = vi.spyOn(f.internals, '_changeVisibilityOfNonSelectedObjects');
  try {
    f.imageRender.mockImplementationOnce(() => { throw new Error('save failed'); });
    expect(f.runCapture).toThrow('save failed');
    expect(visibility).not.toHaveBeenCalled();
    expect(f.renderer.clear).not.toHaveBeenCalled();
    expect(f.imageRender).toHaveBeenCalledOnce();
    f.assertRestored();
  } finally { f.dispose(); }
});

it('restores renderer state and consumes the mask after composition fails', () => {
  const f = createFixture();
  try {
    f.runCapture();
    f.imageRender.mockImplementationOnce(() => { throw new Error('compose failed'); });
    expect(f.compose).toThrow('compose failed');
    f.assertRestored();
    f.imageRender.mockClear();
    f.compose();
    expect(f.imageRender).not.toHaveBeenCalled();
  } finally { f.dispose(); }
});

it('copies the scene to the screen without a captured mask', () => {
  const f = createFixture();
  try {
    f.pass.renderToScreen = true;
    f.compose();
    expect(f.imageRender).toHaveBeenCalledOnce();
    expect(f.renderer.getRenderTarget()).toBe(null);
    expect(f.pass.materialCopy.uniforms.tDiffuse!.value).toBe(f.read.texture);
    expect(f.renderer.render).not.toHaveBeenCalled();
  } finally { f.dispose(); }
});
