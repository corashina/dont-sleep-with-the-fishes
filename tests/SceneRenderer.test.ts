import {
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectSceneRenderer } from '../src/rendering/SceneRenderer';

const rendererMocks = vi.hoisted(() => ({
  composers: [] as Array<{
    addPass: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
  itemAoPasses: [] as Array<{
    setContext: ReturnType<typeof vi.fn>;
    setMode: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    readonly addPass = vi.fn();
    readonly render = vi.fn();
    readonly setPixelRatio = vi.fn();
    readonly setSize = vi.fn();
    readonly dispose = vi.fn();

    constructor() {
      rendererMocks.composers.push(this);
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
  },
}));

vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    readonly dispose = vi.fn();
  },
}));

vi.mock('../src/rendering/ItemAmbientOcclusion', () => ({
  resolveItemAmbientOcclusionMode: () => 'composite',
  ItemAmbientOcclusionPass: class {
    readonly setContext = vi.fn();
    readonly setMode = vi.fn();
    readonly dispose = vi.fn();

    constructor() {
      rendererMocks.itemAoPasses.push(this);
    }
  },
  ITEM_AMBIENT_OCCLUSION_HOTKEY: 'KeyO',
  nextItemAmbientOcclusionMode: (mode: string) => {
    if (mode === 'composite') return 'debug';
    if (mode === 'debug') return 'off';
    return 'composite';
  },
}));

describe('production scene renderer', () => {
  beforeEach(() => {
    rendererMocks.composers.length = 0;
    rendererMocks.itemAoPasses.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs item AO even when no hover outline is selected', () => {
    const renderer = Object.create(WebGLRenderer.prototype) as WebGLRenderer;
    renderer.getSize = (target: Vector2) => target.set(1_280, 720);
    renderer.render = vi.fn();
    const sceneRenderer = new DirectSceneRenderer(renderer);
    const scene = new Scene();
    const camera = new PerspectiveCamera();

    sceneRenderer.render(scene, camera);

    expect(rendererMocks.composers[0]?.addPass).toHaveBeenCalledTimes(4);
    expect(rendererMocks.itemAoPasses[0]?.setContext).toHaveBeenCalledWith(scene, camera);
    expect(rendererMocks.composers[0]?.render).toHaveBeenCalledOnce();
    expect(renderer.render).not.toHaveBeenCalled();

    sceneRenderer.dispose();
    expect(rendererMocks.itemAoPasses[0]?.dispose).toHaveBeenCalledOnce();
  });

  it('cycles AO modes with O and removes the hotkey when disposed', () => {
    const keyboardTarget = new EventTarget();
    vi.stubGlobal('window', keyboardTarget);
    const renderer = Object.create(WebGLRenderer.prototype) as WebGLRenderer;
    renderer.getSize = (target: Vector2) => target.set(1_280, 720);
    const sceneRenderer = new DirectSceneRenderer(renderer, 'composite');
    const pressO = () => {
      const event = new Event('keydown');
      Object.defineProperties(event, {
        code: { value: 'KeyO' },
        repeat: { value: false },
        altKey: { value: false },
        ctrlKey: { value: false },
        metaKey: { value: false },
      });
      keyboardTarget.dispatchEvent(event);
    };

    pressO();
    pressO();
    pressO();

    expect(rendererMocks.itemAoPasses[0]?.setMode.mock.calls).toEqual([
      ['debug'],
      ['off'],
      ['composite'],
    ]);

    sceneRenderer.dispose();
    pressO();
    expect(rendererMocks.itemAoPasses[0]?.setMode).toHaveBeenCalledTimes(3);
  });
});
