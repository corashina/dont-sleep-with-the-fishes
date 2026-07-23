import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataTexture,
  PerspectiveCamera,
  Scene,
  type Vector2,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import {
  PostProcessingPipeline,
  createSceneRenderer,
} from '../src/rendering/PostProcessingPipeline';
import { PrintShader } from '../src/rendering/PrintShader';

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
  printPasses: PassMock[];
  outputPasses: PassMock[];
  setSizeFailure: Error | null;
} => ({
  composers: [],
  printPasses: [],
  outputPasses: [],
  setSizeFailure: null,
}));

const inkFrameMocks = vi.hoisted((): { frames: DataTexture[] } => ({
  frames: [],
}));

vi.mock('../src/rendering/inkFrameMask', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/rendering/inkFrameMask')>();
  return {
    ...actual,
    createInkFrameMask: vi.fn((size?: number) => {
      const frame = actual.createInkFrameMask(size);
      vi.spyOn(frame, 'dispose');
      inkFrameMocks.frames.push(frame);
      return frame;
    }),
  };
});

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    readonly addPass = vi.fn();
    readonly render = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn(() => {
      if (postProcessingMocks.setSizeFailure !== null) {
        throw postProcessingMocks.setSizeFailure;
      }
    });
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

vi.mock('three/addons/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    readonly uniforms: Record<string, { value: unknown }>;
    readonly dispose = vi.fn();

    constructor(shader: typeof PrintShader) {
      this.uniforms = Object.fromEntries(Object.entries(shader.uniforms).map(([name, uniform]) => {
        const value: unknown = uniform.value;
        const clone = typeof value === 'object' && value !== null && 'clone' in value
          ? value.clone
          : null;
        return [name, { value: typeof clone === 'function' ? clone.call(value) : value }];
      }));
      postProcessingMocks.printPasses.push(this);
    }
  },
}));

vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    readonly dispose = vi.fn();

    constructor() {
      postProcessingMocks.outputPasses.push(this);
    }
  },
}));

function createRenderer(
  maxTextureSize?: number,
  pixelRatio = 1,
): WebGLRenderer & { render: MockFunction } {
  const render = vi.fn();
  return {
    capabilities: { maxSamples: 4, maxTextureSize },
    getSize: (target: Vector2) => target.set(320, 180),
    getPixelRatio: () => pixelRatio,
    render,
  } as unknown as WebGLRenderer & { render: MockFunction };
}

describe('post-processing pipeline construction', () => {
  beforeEach(() => {
    postProcessingMocks.composers.length = 0;
    postProcessingMocks.printPasses.length = 0;
    postProcessingMocks.outputPasses.length = 0;
    postProcessingMocks.setSizeFailure = null;
    inkFrameMocks.frames.length = 0;
  });

  it('falls back to direct rendering when pipeline construction throws', () => {
    const render = vi.fn();
    const renderer = { render } as unknown as WebGLRenderer;
    const failure = new Error('composer unavailable');
    const reportFallback = vi.fn();
    const sceneRenderer = createSceneRenderer(
      renderer,
      () => { throw failure; },
      reportFallback,
    );
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    });

    expect(reportFallback).toHaveBeenCalledWith(failure);
    expect(render).toHaveBeenCalledWith(scene, camera);
    sceneRenderer.dispose();
    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 1, sinkingProgress: 0, reducedMotion: false,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it('returns the constructed pipeline when setup succeeds', () => {
    const pipeline = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    const renderer = {} as WebGLRenderer;
    expect(createSceneRenderer(renderer, () => pipeline, vi.fn())).toBe(pipeline);
  });

  it('disposes constructed resources when initial resize throws before falling back', () => {
    const failure = new Error('initial composer resize failed');
    postProcessingMocks.setSizeFailure = failure;
    const renderer = createRenderer();
    const reportFallback = vi.fn();

    const sceneRenderer = createSceneRenderer(
      renderer,
      (value) => new PostProcessingPipeline(value),
      reportFallback,
    );

    expect(reportFallback).toHaveBeenCalledWith(failure);
    expect(postProcessingMocks.printPasses[0]?.dispose).toHaveBeenCalledOnce();
    expect(postProcessingMocks.outputPasses[0]?.dispose).toHaveBeenCalledOnce();
    expect(postProcessingMocks.composers[0]?.dispose).toHaveBeenCalledOnce();
    expect(postProcessingMocks.composers[0]?.target.dispose).toHaveBeenCalledOnce();

    const scene = new Scene();
    const camera = new PerspectiveCamera();
    sceneRenderer.render(scene, camera, {
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    });
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });

  it('disposes the ink frame when renderer sizing fails before composer construction', () => {
    const failure = new Error('renderer sizing failed');
    const renderer = createRenderer();
    renderer.getSize = vi.fn(() => {
      throw failure;
    });
    const reportFallback = vi.fn();

    const sceneRenderer = createSceneRenderer(
      renderer,
      (value) => new PostProcessingPipeline(value),
      reportFallback,
    );

    expect(reportFallback).toHaveBeenCalledWith(failure);
    expect(inkFrameMocks.frames).toHaveLength(1);
    expect(inkFrameMocks.frames[0]?.dispose).toHaveBeenCalledOnce();
    expect(postProcessingMocks.composers).toHaveLength(0);

    sceneRenderer.dispose();
  });

  it('leaves composer size and uniforms unchanged for invalid or extreme resize inputs', () => {
    const pipeline = new PostProcessingPipeline(createRenderer(1_024));
    const composer = postProcessingMocks.composers[0];
    const uniforms = postProcessingMocks.printPasses[0]?.uniforms;
    const resolution = uniforms?.uResolution?.value as Vector2;
    const initialResolution = resolution.clone();
    const initialPixelRatio = uniforms?.uPixelRatio?.value;

    pipeline.resize(Number.NaN, 180, 1);
    pipeline.resize(320, 180, 3);
    pipeline.resize(600, 180, 2);
    pipeline.resize(Number.MAX_VALUE, 180, 2);

    expect(composer?.setPixelRatio).toHaveBeenCalledOnce();
    expect(composer?.setSize).toHaveBeenCalledOnce();
    expect(resolution).toEqual(initialResolution);
    expect(uniforms?.uPixelRatio?.value).toBe(initialPixelRatio);
  });

  it('uses a finite texture-size bound when renderer capabilities omit one', () => {
    const pipeline = new PostProcessingPipeline(createRenderer());
    const composer = postProcessingMocks.composers[0];

    pipeline.resize(Number.MAX_VALUE, Number.MAX_VALUE, 1);

    expect(composer?.setPixelRatio).toHaveBeenCalledOnce();
    expect(composer?.setSize).toHaveBeenCalledOnce();
  });

  it('defines CSS-pixel screen-space sampling without remote textures', () => {
    expect(PrintShader.uniforms.uPixelRatio.value).toBe(1);
    expect(PrintShader.fragmentShader).toContain('gl_FragCoord.xy / uPixelRatio');
    expect(PrintShader.fragmentShader).toContain('uChromaticAberrationCssPixels * uPixelRatio');
    expect(PrintShader.fragmentShader).toContain('uniform sampler2D tInkFrame');
    expect(PrintShader.fragmentShader).toContain('uPosterizationLevels');
    expect(PrintShader.fragmentShader).toContain('uInkFrameStrength');
    expect(PrintShader.fragmentShader).not.toMatch(/https?:\/\//);
  });

  it('disposes the generated ink frame exactly once', () => {
    const pipeline = new PostProcessingPipeline(createRenderer());
    const shaderPass = postProcessingMocks.printPasses[0];
    const frame = shaderPass?.uniforms?.tInkFrame?.value as DataTexture;
    const disposeFrame = vi.mocked(frame.dispose);

    pipeline.dispose();
    pipeline.dispose();

    expect(disposeFrame).toHaveBeenCalledOnce();
  });

  it('avoids Three injected shader helper name collisions', () => {
    expect(PrintShader.fragmentShader).not.toMatch(/\bfloat\s+luminance\s*\(/);
    expect(PrintShader.fragmentShader).toMatch(/\bfloat\s+printLuminance\s*\(/);
    expect(PrintShader.fragmentShader.match(/\bprintLuminance\s*\(/g)).toHaveLength(3);
  });
});
