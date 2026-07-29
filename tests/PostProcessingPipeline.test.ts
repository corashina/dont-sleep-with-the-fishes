import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
import type { ItemAmbientOcclusionPass } from '../src/rendering/ItemAmbientOcclusion';

type MockFunction = ReturnType<typeof vi.fn>;

interface ComposerMock {
  target: WebGLRenderTarget;
  passes: PassLike[];
  addPass: MockFunction;
  removePass: MockFunction;
  render: MockFunction;
  setPixelRatio: MockFunction;
  setSize: MockFunction;
  dispose: MockFunction;
}

interface PassLike {
  constructor: { name: string };
  setSize?: (width: number, height: number) => void;
}

interface PassMock {
  dispose: MockFunction;
}

const postProcessingMocks = vi.hoisted((): {
  composers: ComposerMock[];
  aoPasses: Array<{
    enabled: boolean;
    setContext: MockFunction;
    setMode: MockFunction;
    setIntensity: MockFunction;
    setRadius: MockFunction;
    setSize: MockFunction;
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
  outputPasses: PassMock[];
  aoSizeFailure: Error | null;
  aoConstructionModes: string[];
} => ({
  composers: [],
  aoPasses: [],
  outlinePasses: [],
  outputPasses: [],
  aoSizeFailure: null,
  aoConstructionModes: [],
}));

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    readonly passes: PassLike[] = [];
    private width: number;
    private height: number;
    private pixelRatio = 1;
    readonly addPass = vi.fn((pass: PassLike) => {
      this.passes.push(pass);
      pass.setSize?.(this.width * this.pixelRatio, this.height * this.pixelRatio);
    });
    readonly removePass = vi.fn((pass: PassLike) => {
      const index = this.passes.indexOf(pass);
      if (index !== -1) this.passes.splice(index, 1);
    });
    readonly render = vi.fn();
    readonly setPixelRatio = vi.fn((pixelRatio: number) => {
      this.pixelRatio = pixelRatio;
      this.setSize(this.width, this.height);
    });
    readonly setSize = vi.fn((width: number, height: number) => {
      this.width = width;
      this.height = height;
      for (const pass of this.passes) {
        pass.setSize?.(width * this.pixelRatio, height * this.pixelRatio);
      }
    });
    readonly dispose: MockFunction;
    constructor(_renderer: WebGLRenderer, readonly target: WebGLRenderTarget) {
      this.width = target.width;
      this.height = target.height;
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
  ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY: 1,
  ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS: 0.5,
  ItemAmbientOcclusionPass: class {
    enabled = true;
    readonly setContext = vi.fn();
    readonly setMode = vi.fn();
    readonly setIntensity = vi.fn();
    readonly setRadius = vi.fn();
    readonly setSize = vi.fn(() => {
      if (postProcessingMocks.aoSizeFailure !== null) {
        throw postProcessingMocks.aoSizeFailure;
      }
    });
    readonly setVisualQuality = vi.fn();
    readonly dispose = vi.fn();
    constructor(mode: string) {
      postProcessingMocks.aoConstructionModes.push(mode);
      postProcessingMocks.aoPasses.push(this);
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
    postProcessingMocks.outputPasses.length = 0;
    postProcessingMocks.aoSizeFailure = null;
    postProcessingMocks.aoConstructionModes.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the consolidated pass order and retains hover targets', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    const composer = postProcessingMocks.composers[0]!;
    expect(composer.addPass.mock.calls.map(([pass]) => pass.constructor.name)).toEqual([
      'RenderPass', 'ItemAmbientOcclusionPass', 'OutlinePass', 'OutputPass',
    ]);
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    pipeline.render(scene, camera, { kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0 });
    expect(postProcessingMocks.outlinePasses[0]?.renderScene).toBe(scene);
    expect(postProcessingMocks.outlinePasses[0]?.renderCamera).toBe(camera);
    expect(postProcessingMocks.outlinePasses[0]?.visibleEdgeColor.setHex)
      .toHaveBeenCalledWith(0xffffff);
    expect(postProcessingMocks.outlinePasses[0]?.hiddenEdgeColor.setHex)
      .toHaveBeenCalledWith(0xffffff);
  });

  it('changes only AO quality at runtime', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    pipeline.setVisualQuality('high');
    expect(postProcessingMocks.aoPasses[0]?.setVisualQuality).toHaveBeenCalledWith('high');
    expect(postProcessingMocks.composers).toHaveLength(1);
  });

  it('exposes only AO mode and numeric controls for the corner console', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    const controls = pipeline.postProcessingControls;

    controls.setAmbientOcclusionMode('debug');
    controls.setNumeric('ambientOcclusionIntensity', 0.4);
    controls.setNumeric('ambientOcclusionRadius', 0.18);

    expect(postProcessingMocks.aoPasses[0]?.setMode).toHaveBeenCalledWith('debug');
    expect(postProcessingMocks.aoPasses[0]?.setIntensity).toHaveBeenCalledWith(0.4);
    expect(postProcessingMocks.aoPasses[0]?.setRadius).toHaveBeenCalledWith(0.18);
    expect(controls.getState()).toMatchObject({
      ambientOcclusionMode: 'debug',
      ambientOcclusionIntensity: 0.4,
      ambientOcclusionRadius: 0.18,
    });
    pipeline.dispose();
  });

  it('does not use URL parameters to disable AO', () => {
    const keyboardTarget = Object.assign(new EventTarget(), {
      location: { search: '?ao=off&grade=off' },
    });
    vi.stubGlobal('window', keyboardTarget);

    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');

    expect(postProcessingMocks.aoConstructionModes).toEqual(['composite']);
    pipeline.dispose();
  });

  it('keeps outline rendering when AO construction fails', () => {
    const failure = new Error('ao unavailable');
    const reportAoFallback = vi.fn();
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low', () => { throw failure; }, reportAoFallback);
    expect(reportAoFallback).toHaveBeenCalledWith(failure);
    expect(postProcessingMocks.composers[0]?.addPass).toHaveBeenCalledTimes(3);
    pipeline.dispose();
  });

  it('keeps the composer pass chain when AO initial pass sizing fails', () => {
    const failure = new Error('ao initial sizing unavailable');
    const reportAoFallback = vi.fn();
    postProcessingMocks.aoSizeFailure = failure;

    const pipeline = new PostProcessingPipeline(
      createRenderer(),
      'low',
      undefined,
      reportAoFallback,
    );
    const composer = postProcessingMocks.composers[0]!;

    expect(reportAoFallback).toHaveBeenCalledWith(failure);
    expect(composer.passes.map((pass) => pass.constructor.name)).toEqual([
      'RenderPass', 'OutlinePass', 'OutputPass',
    ]);
    expect(postProcessingMocks.aoPasses[0]?.dispose).toHaveBeenCalledOnce();
    expect(() => pipeline.render(
      new Scene(),
      new PerspectiveCamera(),
      { kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0 },
    )).not.toThrow();

    pipeline.dispose();
    expect(postProcessingMocks.aoPasses[0]?.dispose).toHaveBeenCalledOnce();
  });

  it('retires AO after a later sizing failure and keeps the other passes resizable', () => {
    const failure = new Error('ao runtime sizing unavailable');
    const reportAoFallback = vi.fn();
    const pipeline = new PostProcessingPipeline(
      createRenderer(),
      'low',
      undefined,
      reportAoFallback,
    );
    const composer = postProcessingMocks.composers[0]!;
    postProcessingMocks.aoSizeFailure = failure;

    expect(() => pipeline.resize(640, 360, 1)).not.toThrow();

    expect(reportAoFallback).toHaveBeenCalledWith(failure);
    expect(composer.passes.map((pass) => pass.constructor.name)).toEqual([
      'RenderPass', 'OutlinePass', 'OutputPass',
    ]);
    expect(postProcessingMocks.outlinePasses[0]?.setSize)
      .toHaveBeenLastCalledWith(640, 360);
    expect(postProcessingMocks.aoPasses[0]?.dispose).toHaveBeenCalledOnce();

    pipeline.dispose();
    expect(postProcessingMocks.aoPasses[0]?.dispose).toHaveBeenCalledOnce();
  });

  it('disables AO but keeps rendering when quality reconfiguration fails', () => {
    const failure = new Error('ao resize unavailable');
    const reportAoFallback = vi.fn();
    const failingAoPass = {
      enabled: true,
      dispose: vi.fn(),
      setSize: vi.fn(),
      setVisualQuality: vi.fn(() => { throw failure; }),
    } as unknown as ItemAmbientOcclusionPass;
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low', () => failingAoPass, reportAoFallback);
    expect(() => pipeline.setVisualQuality('high')).not.toThrow();
    expect(reportAoFallback).toHaveBeenCalledWith(failure);
    expect(failingAoPass.enabled).toBe(false);
    expect(failingAoPass.dispose).toHaveBeenCalledOnce();
  });

  it('does not reconfigure AO again after a quality failure retires it', () => {
    const failure = new Error('ao resize unavailable');
    const failingAoPass = {
      enabled: true,
      dispose: vi.fn(),
      setSize: vi.fn(),
      setVisualQuality: vi.fn(() => { throw failure; }),
    } as unknown as ItemAmbientOcclusionPass;
    const pipeline = new PostProcessingPipeline(
      createRenderer(),
      'low',
      () => failingAoPass,
      vi.fn(),
    );

    pipeline.setVisualQuality('high');
    pipeline.setVisualQuality('low');

    expect(failingAoPass.setVisualQuality).toHaveBeenCalledOnce();
    expect(failingAoPass.dispose).toHaveBeenCalledOnce();
  });

  it('does not register the legacy P or O keyboard listeners', () => {
    const keyboardTarget = Object.assign(new EventTarget(), { location: { search: '' } });
    const addEventListener = vi.spyOn(keyboardTarget, 'addEventListener');
    vi.stubGlobal('window', keyboardTarget);
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low');
    expect(addEventListener).not.toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
    );
    pipeline.dispose();
  });

  it('keeps AO unavailable when console controls change after quality failure', () => {
    const failure = new Error('ao resize unavailable');
    const failingAoPass = {
      enabled: true,
      dispose: vi.fn(),
      setMode: vi.fn(),
      setIntensity: vi.fn(),
      setRadius: vi.fn(),
      setSize: vi.fn(),
      setVisualQuality: vi.fn(() => { throw failure; }),
    } as unknown as ItemAmbientOcclusionPass;
    const pipeline = new PostProcessingPipeline(createRenderer(), 'low', () => failingAoPass, vi.fn());
    pipeline.setVisualQuality('high');
    pipeline.postProcessingControls.setAmbientOcclusionMode('debug');
    pipeline.postProcessingControls.setNumeric('ambientOcclusionIntensity', 0.4);

    expect(failingAoPass.enabled).toBe(false);
    expect(failingAoPass.setMode).not.toHaveBeenCalled();
    expect(failingAoPass.setIntensity).not.toHaveBeenCalled();
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
    expect(composer.target.texture.name).toBe('ambient-occlusion-composer');
    expect(composer.target.samples).toBe(0);
    pipeline.dispose();
    pipeline.dispose();
    expect(composer.target.dispose).toHaveBeenCalledOnce();
  });

});
