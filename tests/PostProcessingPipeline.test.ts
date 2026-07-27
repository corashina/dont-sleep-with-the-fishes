import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataTexture,
  PerspectiveCamera,
  Scene,
  Vector2,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import {
  PostProcessingPipeline,
  createSceneRenderer,
} from '../src/rendering/PostProcessingPipeline';
import { PrintShader } from '../src/rendering/PrintShader';
import type { ItemAmbientOcclusionPass } from '../src/rendering/ItemAmbientOcclusion';

type MockFunction = ReturnType<typeof vi.fn>;

interface ComposerMock {
  target: WebGLRenderTarget;
  addPass: MockFunction;
  render: MockFunction;
  setPixelRatio: MockFunction;
  setSize: MockFunction;
  dispose: MockFunction;
}

interface PassMock {
  uniforms?: Record<string, { value: unknown }>;
  dispose: MockFunction;
}

const postProcessingMocks = vi.hoisted((): {
  composers: ComposerMock[];
  aoPasses: Array<{
    enabled: boolean;
    setContext: MockFunction;
    setMode: MockFunction;
    setVisualQuality: MockFunction;
    dispose: MockFunction;
  }>;
  outlinePasses: Array<{
    renderScene: Scene;
    renderCamera: PerspectiveCamera;
    selectedObjects: object[];
    visibleEdgeColor: { setHex: MockFunction };
    hiddenEdgeColor: { setHex: MockFunction };
    edgeStrength: number;
    edgeThickness: number;
    edgeGlow: number;
    downSampleRatio: number;
    setSize: MockFunction;
    dispose: MockFunction;
  }>;
  printPasses: PassMock[];
  outputPasses: PassMock[];
} => ({ composers: [], aoPasses: [], outlinePasses: [], printPasses: [], outputPasses: [] }));

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    readonly addPass = vi.fn();
    readonly render = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();
    readonly dispose: MockFunction;
    constructor(_renderer: WebGLRenderer, readonly target: WebGLRenderTarget) {
      vi.spyOn(target, 'dispose');
      this.dispose = vi.fn(() => target.dispose());
      postProcessingMocks.composers.push(this);
    }
  },
}));

vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    constructor(public scene: Scene, public camera: PerspectiveCamera) {}
  },
}));

vi.mock('three/addons/postprocessing/OutlinePass.js', () => ({
  OutlinePass: class {
    readonly visibleEdgeColor = { setHex: vi.fn() };
    readonly hiddenEdgeColor = { setHex: vi.fn() };
    readonly setSize = vi.fn();
    readonly dispose = vi.fn();
    renderScene = new Scene();
    renderCamera = new PerspectiveCamera();
    selectedObjects: object[] = [];
    edgeStrength = 0;
    edgeThickness = 0;
    edgeGlow = 0;
    downSampleRatio = 1;
    constructor() { postProcessingMocks.outlinePasses.push(this); }
  },
}));

vi.mock('../src/rendering/ItemAmbientOcclusion', () => ({
  resolveItemAmbientOcclusionMode: () => 'composite',
  nextItemAmbientOcclusionMode: () => 'debug',
  ITEM_AMBIENT_OCCLUSION_HOTKEY: 'KeyO',
  ItemAmbientOcclusionPass: class {
    enabled = true;
    readonly setContext = vi.fn();
    readonly setMode = vi.fn();
    readonly setVisualQuality = vi.fn();
    readonly dispose = vi.fn();
    constructor() { postProcessingMocks.aoPasses.push(this); }
  },
}));

vi.mock('three/addons/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    readonly uniforms: Record<string, { value: unknown }>;
    readonly dispose = vi.fn();
    constructor(shader: typeof PrintShader) {
      this.uniforms = Object.fromEntries(Object.entries(shader.uniforms).map(([name, uniform]) => {
        const value: unknown = uniform.value;
        const clone = typeof value === 'object' && value !== null && 'clone' in value
          ? value.clone : null;
        return [name, { value: typeof clone === 'function' ? clone.call(value) : value }];
      }));
      postProcessingMocks.printPasses.push(this);
    }
  },
}));

vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    readonly dispose = vi.fn();
    constructor() { postProcessingMocks.outputPasses.push(this); }
  },
}));

function createRenderer(): WebGLRenderer & { render: MockFunction } {
  return {
    capabilities: { maxSamples: 4, maxTextureSize: 4096 },
    getSize: (target: Vector2) => target.set(320, 180),
    getPixelRatio: () => 1,
    render: vi.fn(),
  } as unknown as WebGLRenderer & { render: MockFunction };
}

describe('post-processing pipeline', () => {
  beforeEach(() => {
    postProcessingMocks.composers.length = 0;
    postProcessingMocks.aoPasses.length = 0;
    postProcessingMocks.outlinePasses.length = 0;
    postProcessingMocks.printPasses.length = 0;
    postProcessingMocks.outputPasses.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the consolidated pass order and retains hover targets', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    const composer = postProcessingMocks.composers[0]!;
    expect(composer.addPass.mock.calls.map(([pass]) => pass.constructor.name)).toEqual([
      'RenderPass', 'ItemAmbientOcclusionPass', 'OutlinePass', 'ShaderPass', 'OutputPass',
    ]);
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    pipeline.render(scene, camera, { kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0 });
    expect(postProcessingMocks.outlinePasses[0]?.renderScene).toBe(scene);
    expect(postProcessingMocks.outlinePasses[0]?.renderCamera).toBe(camera);
  });

  it('changes only AO quality at runtime', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    pipeline.setVisualQuality('high');
    expect(postProcessingMocks.aoPasses[0]?.setVisualQuality).toHaveBeenCalledWith('high');
    expect(postProcessingMocks.printPasses).toHaveLength(1);
    expect(postProcessingMocks.composers).toHaveLength(1);
  });

  it('samples scene color once and omits chromatic aberration', () => {
    expect(PrintShader.fragmentShader.match(/texture2D\(tDiffuse/g)).toHaveLength(1);
    expect(PrintShader.fragmentShader).not.toContain('uChromaticAberration');
  });

  it('keeps grade and outline when AO construction fails', () => {
    const failure = new Error('ao unavailable');
    const reportAoFallback = vi.fn();
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low', () => { throw failure; }, reportAoFallback);
    expect(reportAoFallback).toHaveBeenCalledWith(failure);
    expect(postProcessingMocks.composers[0]?.addPass).toHaveBeenCalledTimes(4);
    pipeline.dispose();
  });

  it('disables AO but keeps rendering when quality reconfiguration fails', () => {
    const failure = new Error('ao resize unavailable');
    const reportAoFallback = vi.fn();
    const failingAoPass = {
      enabled: true, setVisualQuality: vi.fn(() => { throw failure; }),
    } as unknown as ItemAmbientOcclusionPass;
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low', () => failingAoPass, reportAoFallback);
    expect(() => pipeline.setVisualQuality('high')).not.toThrow();
    expect(reportAoFallback).toHaveBeenCalledWith(failure);
    expect(failingAoPass.enabled).toBe(false);
  });

  it('removes comparison listeners when initial sizing fails after registration', () => {
    const keyboardTarget = Object.assign(new EventTarget(), { location: { search: '' } });
    const removeEventListener = vi.spyOn(keyboardTarget, 'removeEventListener');
    vi.stubGlobal('window', keyboardTarget);
    const failure = new Error('pixel ratio unavailable');
    const renderer = createRenderer();
    renderer.getPixelRatio = vi.fn(() => { throw failure; });

    expect(() => new PostProcessingPipeline(renderer, 'low')).toThrow(failure);

    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener.mock.calls.map(([type]) => type).sort())
      .toEqual(['keydown', 'keydown']);
  });

  it('keeps AO unavailable when KeyO is pressed after quality reconfiguration fails', () => {
    const keyboardTarget = Object.assign(new EventTarget(), { location: { search: '' } });
    vi.stubGlobal('window', keyboardTarget);
    const failure = new Error('ao resize unavailable');
    const failingAoPass = {
      enabled: true,
      dispose: vi.fn(),
      setMode: vi.fn(),
      setVisualQuality: vi.fn(() => { throw failure; }),
    } as unknown as ItemAmbientOcclusionPass;
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low', () => failingAoPass, vi.fn());
    pipeline.setVisualQuality('high');
    const keyO = new Event('keydown');
    Object.defineProperties(keyO, {
      code: { value: 'KeyO' }, repeat: { value: false }, altKey: { value: false },
      ctrlKey: { value: false }, metaKey: { value: false },
    });

    keyboardTarget.dispatchEvent(keyO);

    expect(failingAoPass.enabled).toBe(false);
    expect(failingAoPass.setMode).not.toHaveBeenCalled();
    pipeline.dispose();
  });

  it('falls back to direct rendering when pipeline construction fails', () => {
    const renderer = { render: vi.fn() } as unknown as WebGLRenderer;
    const failure = new Error('composer unavailable');
    const sceneRenderer = createSceneRenderer(renderer, 'high', () => { throw failure; }, vi.fn());
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    sceneRenderer.render(scene, camera, { kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0 });
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });

  it('uses a standard 8-bit composer target and disposes it once', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    const composer = postProcessingMocks.composers[0]!;
    expect(composer.target.texture.name).toBe('illustrated-post-composer');
    expect(composer.target.samples).toBe(0);
    pipeline.dispose();
    pipeline.dispose();
    expect(composer.target.dispose).toHaveBeenCalledOnce();
  });

  it('keeps the generated ink frame owned by the pipeline', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    const frame = postProcessingMocks.printPasses[0]?.uniforms?.tInkFrame?.value as DataTexture;
    vi.spyOn(frame, 'dispose');
    pipeline.dispose();
    expect(frame.dispose).toHaveBeenCalledOnce();
  });
});
