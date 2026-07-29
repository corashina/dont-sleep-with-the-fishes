import {
  Camera,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import {
  ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
  ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
  ItemAmbientOcclusionPass,
  type ItemAmbientOcclusionMode,
} from './ItemAmbientOcclusion';
import { sceneHoverOutlineTargets } from './HoverOutline';
import {
  DirectSceneRenderer,
  type SceneRenderer,
  type SceneVisualState,
} from './SceneRenderer';
import type { VisualQuality } from './visualQuality';
import {
  clampPostProcessingSetting,
  type PostProcessingControls,
  type PostProcessingControlState,
  type PostProcessingNumericSetting,
} from './postProcessingControls';

type AmbientOcclusionFactory = (
  mode: ItemAmbientOcclusionMode,
  quality: VisualQuality,
) => ItemAmbientOcclusionPass;
type PipelineFactory = (renderer: WebGLRenderer, quality: VisualQuality) => SceneRenderer;
type FallbackReporter = (error: unknown) => void;

const MAX_PIXEL_RATIO = 2;
const FALLBACK_MAX_TEXTURE_SIZE = 4_096;

export class PostProcessingPipeline implements SceneRenderer {
  readonly postProcessingControls: PostProcessingControls = Object.freeze({
    getState: () => Object.freeze({
      ...this.controlState,
      ambientOcclusionAvailable:
        !this.aoUnavailable && this.itemAmbientOcclusionPass !== null,
    }),
    setAmbientOcclusionMode: (mode: ItemAmbientOcclusionMode) =>
      this.setAmbientOcclusionMode(mode),
    setNumeric: (setting: PostProcessingNumericSetting, value: number) =>
      this.setNumeric(setting, value),
  });
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null;
  private readonly outlinePass: OutlinePass;
  private readonly outputPass: OutputPass;
  private readonly size: Vector2;
  private readonly maxTextureSize: number;
  private readonly controlState: PostProcessingControlState;
  private aoUnavailable = false;
  private disposed = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    quality: VisualQuality = 'low',
    createAmbientOcclusion: AmbientOcclusionFactory = (mode, initialQuality) =>
      new ItemAmbientOcclusionPass(mode, initialQuality),
    private readonly reportFallback: FallbackReporter = (error) => {
      console.warn('Ambient occlusion unavailable; continuing without it.', error);
    },
  ) {
    this.controlState = {
      ambientOcclusionAvailable: true,
      ambientOcclusionMode: 'composite',
      ambientOcclusionIntensity: ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
      ambientOcclusionRadius: ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
    };
    let target: WebGLRenderTarget | undefined;
    let composer: EffectComposer | undefined;
    let outlinePass: OutlinePass | undefined;
    let outputPass: OutputPass | undefined;
    let itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null = null;
    try {
      this.size = new Vector2();
      const reportedMaxTextureSize = renderer.capabilities.maxTextureSize;
      this.maxTextureSize = Number.isFinite(reportedMaxTextureSize) && reportedMaxTextureSize > 0
        ? reportedMaxTextureSize : FALLBACK_MAX_TEXTURE_SIZE;
      renderer.getSize(this.size);
      target = new WebGLRenderTarget(Math.max(1, this.size.x), Math.max(1, this.size.y));
      target.texture.name = 'ambient-occlusion-composer';
      target.samples = 0;
      composer = new EffectComposer(renderer, target);
      this.renderPass = new RenderPass(new Scene(), new Camera());

      try {
        itemAmbientOcclusionPass = createAmbientOcclusion(
          this.controlState.ambientOcclusionMode,
          quality,
        );
      } catch (error) {
        this.reportFallback(error);
      }
      outlinePass = new OutlinePass(this.size, new Scene(), new PerspectiveCamera());
      outlinePass.visibleEdgeColor.setHex(0xffffff);
      outlinePass.hiddenEdgeColor.setHex(0xffffff);
      outlinePass.edgeStrength = 5;
      outlinePass.edgeThickness = 4;
      outlinePass.edgeGlow = 0;
      outlinePass.downSampleRatio = 2;
      outputPass = new OutputPass();

      composer.addPass(this.renderPass);
      if (itemAmbientOcclusionPass !== null) {
        try {
          composer.addPass(itemAmbientOcclusionPass);
        } catch (error) {
          const failedPass = itemAmbientOcclusionPass;
          itemAmbientOcclusionPass = null;
          failedPass.enabled = false;
          composer.removePass(failedPass);
          this.aoUnavailable = true;
          failedPass.dispose();
          this.reportFallback(error);
        }
      }
      composer.addPass(outlinePass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.itemAmbientOcclusionPass = itemAmbientOcclusionPass;
      this.outlinePass = outlinePass;
      this.outputPass = outputPass;
      this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
    } catch (error) {
      itemAmbientOcclusionPass?.dispose();
      outlinePass?.dispose();
      outputPass?.dispose();
      if (composer === undefined) target?.dispose();
      else composer.dispose();
      throw error;
    }
  }

  render(
    scene: Scene,
    camera: Camera,
    _state: Readonly<SceneVisualState>,
  ): void {
    if (this.disposed) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.itemAmbientOcclusionPass?.setContext(scene, camera);
    this.outlinePass.renderScene = scene;
    this.outlinePass.renderCamera = camera;
    this.outlinePass.selectedObjects = sceneHoverOutlineTargets(scene);
    this.composer.render(0);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (
      this.disposed || !Number.isFinite(width) || !Number.isFinite(height)
      || !Number.isFinite(pixelRatio) || width <= 0 || height <= 0
      || pixelRatio <= 0 || pixelRatio > MAX_PIXEL_RATIO
    ) return;
    const physicalWidth = width * pixelRatio;
    const physicalHeight = height * pixelRatio;
    if (
      !Number.isFinite(physicalWidth) || !Number.isFinite(physicalHeight)
      || physicalWidth > this.maxTextureSize || physicalHeight > this.maxTextureSize
    ) return;
    const ambientOcclusionPass = this.itemAmbientOcclusionPass;
    if (ambientOcclusionPass !== null) {
      try {
        ambientOcclusionPass.setSize(physicalWidth, physicalHeight);
      } catch (error) {
        this.retireAmbientOcclusion(error);
      }
    }
    const activeAmbientOcclusionPass = this.itemAmbientOcclusionPass;
    if (activeAmbientOcclusionPass !== null) {
      this.composer.removePass(activeAmbientOcclusionPass);
    }
    try {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
    } finally {
      if (activeAmbientOcclusionPass !== null) {
        this.composer.passes.splice(1, 0, activeAmbientOcclusionPass);
      }
    }
  }

  setVisualQuality(value: VisualQuality): void {
    if (
      this.disposed || this.aoUnavailable
      || this.itemAmbientOcclusionPass === null
    ) return;
    try {
      this.itemAmbientOcclusionPass.setVisualQuality(value);
    } catch (error) {
      this.retireAmbientOcclusion(error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.itemAmbientOcclusionPass?.dispose();
    this.outlinePass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }

  private setAmbientOcclusionMode(mode: ItemAmbientOcclusionMode): void {
    if (this.disposed) return;
    this.controlState.ambientOcclusionMode = mode;
    if (!this.aoUnavailable) this.itemAmbientOcclusionPass?.setMode(mode);
  }

  private setNumeric(
    setting: PostProcessingNumericSetting,
    value: number,
  ): void {
    if (this.disposed) return;
    const clamped = clampPostProcessingSetting(setting, value);
    this.controlState[setting] = clamped;
    switch (setting) {
      case 'ambientOcclusionIntensity':
        if (!this.aoUnavailable) {
          this.itemAmbientOcclusionPass?.setIntensity(clamped);
        }
        break;
      case 'ambientOcclusionRadius':
        if (!this.aoUnavailable) {
          this.itemAmbientOcclusionPass?.setRadius(clamped);
        }
        break;
    }
  }

  private retireAmbientOcclusion(error: unknown): void {
    const pass = this.itemAmbientOcclusionPass;
    if (pass === null || this.aoUnavailable) return;
    this.itemAmbientOcclusionPass = null;
    this.aoUnavailable = true;
    this.controlState.ambientOcclusionAvailable = false;
    pass.enabled = false;
    this.composer.removePass(pass);
    pass.dispose();
    this.reportFallback(error);
  }

}

export function createSceneRenderer(
  renderer: WebGLRenderer,
  quality: VisualQuality = 'low',
  createPipeline: PipelineFactory = (value, initialQuality) =>
    new PostProcessingPipeline(value, initialQuality),
  reportFallback: FallbackReporter = (error) => {
    console.warn('Post-processing unavailable; using direct scene rendering.', error);
  },
): SceneRenderer {
  try {
    return createPipeline(renderer, quality);
  } catch (error) {
    reportFallback(error);
    return new DirectSceneRenderer(renderer);
  }
}
