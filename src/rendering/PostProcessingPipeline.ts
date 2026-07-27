import {
  Camera,
  Color,
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
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  ITEM_AMBIENT_OCCLUSION_HOTKEY,
  ItemAmbientOcclusionPass,
  nextItemAmbientOcclusionMode,
  resolveItemAmbientOcclusionMode,
  type ItemAmbientOcclusionMode,
} from './ItemAmbientOcclusion';
import { sceneHoverOutlineTargets } from './HoverOutline';
import { PrintShader } from './PrintShader';
import { createInkFrameMask } from './inkFrameMask';
import {
  DirectSceneRenderer,
  type SceneRenderer,
  type SceneVisualState,
} from './SceneRenderer';
import {
  clampPostProcessingValue,
  resolveGrainTime,
  resolveVignetteStrength,
  selectPostProcessingProfile,
  type PostProcessingProfile,
} from './postProcessingProfiles';
import type { VisualQuality } from './visualQuality';

type PrintUniforms = {
  tDiffuse: { value: null };
  tInkFrame: { value: ReturnType<typeof createInkFrameMask> | null };
  uResolution: { value: Vector2 };
  uPixelRatio: { value: number };
  uContrast: { value: number };
  uSaturation: { value: number };
  uHighlightCompression: { value: number };
  uShadowLift: { value: number };
  uShadowTint: { value: Color };
  uShadowTintStrength: { value: number };
  uHighlightTint: { value: Color };
  uHighlightTintStrength: { value: number };
  uPosterizationLevels: { value: number };
  uInkFrameStrength: { value: number };
  uHalftoneStrength: { value: number };
  uHalftoneSizeCssPixels: { value: number };
  uVignetteStrength: { value: number };
  uGrainStrength: { value: number };
  uGrainTime: { value: number };
};

type AmbientOcclusionFactory = (
  mode: ItemAmbientOcclusionMode,
  quality: VisualQuality,
) => ItemAmbientOcclusionPass;
type PipelineFactory = (renderer: WebGLRenderer, quality: VisualQuality) => SceneRenderer;
type FallbackReporter = (error: unknown) => void;

const MAX_PIXEL_RATIO = 2;
const FALLBACK_MAX_TEXTURE_SIZE = 4_096;
const GRADE_HOTKEY = 'KeyP';

function browserSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function gradeEnabledFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('grade') !== 'off';
}

export class PostProcessingPipeline implements SceneRenderer {
  private readonly inkFrame: ReturnType<typeof createInkFrameMask>;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null;
  private readonly outlinePass: OutlinePass;
  private readonly printPass: ShaderPass;
  private readonly outputPass: OutputPass;
  private readonly uniforms: PrintUniforms;
  private readonly size: Vector2;
  private readonly maxTextureSize: number;
  private itemAmbientOcclusionMode: ItemAmbientOcclusionMode;
  private gradeEnabled: boolean;
  private aoUnavailable = false;
  private aoHotkeyRegistered = false;
  private gradeHotkeyRegistered = false;
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
    this.inkFrame = createInkFrameMask();
    let target: WebGLRenderTarget | undefined;
    let composer: EffectComposer | undefined;
    let outlinePass: OutlinePass | undefined;
    let printPass: ShaderPass | undefined;
    let outputPass: OutputPass | undefined;
    let itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null = null;
    try {
      this.size = new Vector2();
      const reportedMaxTextureSize = renderer.capabilities.maxTextureSize;
      this.maxTextureSize = Number.isFinite(reportedMaxTextureSize) && reportedMaxTextureSize > 0
        ? reportedMaxTextureSize : FALLBACK_MAX_TEXTURE_SIZE;
      renderer.getSize(this.size);
      target = new WebGLRenderTarget(Math.max(1, this.size.x), Math.max(1, this.size.y));
      target.texture.name = 'illustrated-post-composer';
      target.samples = 0;
      composer = new EffectComposer(renderer, target);
      this.renderPass = new RenderPass(new Scene(), new Camera());
      this.itemAmbientOcclusionMode = resolveItemAmbientOcclusionMode(browserSearch());
      this.gradeEnabled = gradeEnabledFromSearch(browserSearch());

      try {
        itemAmbientOcclusionPass = createAmbientOcclusion(this.itemAmbientOcclusionMode, quality);
      } catch (error) {
        this.reportFallback(error);
      }
      outlinePass = new OutlinePass(this.size, new Scene(), new PerspectiveCamera());
      outlinePass.visibleEdgeColor.setHex(0xffffff);
      outlinePass.hiddenEdgeColor.setHex(0x000000);
      outlinePass.edgeStrength = 5;
      outlinePass.edgeThickness = 4;
      outlinePass.edgeGlow = 0;
      outlinePass.downSampleRatio = 2;
      printPass = new ShaderPass(PrintShader);
      outputPass = new OutputPass();
      printPass.enabled = this.gradeEnabled;

      composer.addPass(this.renderPass);
      if (itemAmbientOcclusionPass !== null) composer.addPass(itemAmbientOcclusionPass);
      composer.addPass(outlinePass);
      composer.addPass(printPass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.itemAmbientOcclusionPass = itemAmbientOcclusionPass;
      this.outlinePass = outlinePass;
      this.printPass = printPass;
      this.outputPass = outputPass;
      this.uniforms = printPass.uniforms as PrintUniforms;
      this.uniforms.tInkFrame.value = this.inkFrame;
      this.registerComparisonHotkeys();
      this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
    } catch (error) {
      this.removeComparisonHotkeys();
      itemAmbientOcclusionPass?.dispose();
      outlinePass?.dispose();
      printPass?.dispose();
      outputPass?.dispose();
      if (composer === undefined) target?.dispose();
      else composer.dispose();
      this.inkFrame.dispose();
      throw error;
    }
  }

  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void {
    if (this.disposed) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.itemAmbientOcclusionPass?.setContext(scene, camera);
    this.outlinePass.renderScene = scene;
    this.outlinePass.renderCamera = camera;
    this.outlinePass.selectedObjects = sceneHoverOutlineTargets(scene);
    this.applyProfile(selectPostProcessingProfile(state), state);
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
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.uniforms.uResolution.value.set(physicalWidth, physicalHeight);
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  setVisualQuality(value: VisualQuality): void {
    if (this.disposed || this.itemAmbientOcclusionPass === null) return;
    try {
      this.itemAmbientOcclusionPass.setVisualQuality(value);
    } catch (error) {
      this.reportFallback(error);
      this.itemAmbientOcclusionPass.enabled = false;
      this.aoUnavailable = true;
      this.removeAmbientOcclusionHotkey();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeComparisonHotkeys();
    this.inkFrame.dispose();
    this.itemAmbientOcclusionPass?.dispose();
    this.outlinePass.dispose();
    this.printPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }

  private registerComparisonHotkeys(): void {
    if (typeof window === 'undefined') return;
    if (this.itemAmbientOcclusionPass !== null) {
      window.addEventListener('keydown', this.handleAmbientOcclusionHotkey);
      this.aoHotkeyRegistered = true;
    }
    window.addEventListener('keydown', this.handleGradeHotkey);
    this.gradeHotkeyRegistered = true;
  }

  private readonly handleAmbientOcclusionHotkey = (event: KeyboardEvent): void => {
    if (this.aoUnavailable || !this.isComparisonHotkey(event, ITEM_AMBIENT_OCCLUSION_HOTKEY)) return;
    this.itemAmbientOcclusionMode = nextItemAmbientOcclusionMode(this.itemAmbientOcclusionMode);
    this.itemAmbientOcclusionPass?.setMode(this.itemAmbientOcclusionMode);
  };

  private readonly handleGradeHotkey = (event: KeyboardEvent): void => {
    if (!this.isComparisonHotkey(event, GRADE_HOTKEY)) return;
    this.gradeEnabled = !this.gradeEnabled;
    this.printPass.enabled = this.gradeEnabled;
  };

  private isComparisonHotkey(event: KeyboardEvent, code: string): boolean {
    return !this.disposed && event.code === code && !event.repeat
      && !event.altKey && !event.ctrlKey && !event.metaKey;
  }

  private removeComparisonHotkeys(): void {
    this.removeAmbientOcclusionHotkey();
    if (this.gradeHotkeyRegistered && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleGradeHotkey);
    }
    this.gradeHotkeyRegistered = false;
  }

  private removeAmbientOcclusionHotkey(): void {
    if (this.aoHotkeyRegistered && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleAmbientOcclusionHotkey);
    }
    this.aoHotkeyRegistered = false;
  }

  private applyProfile(
    profile: Readonly<PostProcessingProfile>,
    state: Readonly<SceneVisualState>,
  ): void {
    const uniforms = this.uniforms;
    uniforms.uContrast.value = clampPostProcessingValue(profile.contrast, 0.8, 1.2, 1);
    uniforms.uSaturation.value = clampPostProcessingValue(profile.saturation, 0.7, 1.1, 1);
    uniforms.uHighlightCompression.value = clampPostProcessingValue(profile.highlightCompression, 0, 0.3, 0);
    uniforms.uShadowLift.value = clampPostProcessingValue(profile.shadowLift, 0, 0.08, 0);
    uniforms.uShadowTint.value.setHex(clampPostProcessingValue(profile.shadowTint, 0, 0xffffff, 0x123039));
    uniforms.uShadowTintStrength.value = clampPostProcessingValue(profile.shadowTintStrength, 0, 0.25, 0);
    uniforms.uHighlightTint.value.setHex(clampPostProcessingValue(profile.highlightTint, 0, 0xffffff, 0xd8aa6d));
    uniforms.uHighlightTintStrength.value = clampPostProcessingValue(profile.highlightTintStrength, 0, 0.25, 0);
    uniforms.uPosterizationLevels.value = clampPostProcessingValue(profile.posterizationLevels, 4, 16, 12);
    uniforms.uInkFrameStrength.value = clampPostProcessingValue(profile.inkFrameStrength, 0, 0.95, 0);
    uniforms.uHalftoneStrength.value = clampPostProcessingValue(profile.halftoneStrength, 0, 0.15, 0);
    uniforms.uHalftoneSizeCssPixels.value = clampPostProcessingValue(profile.halftoneSizeCssPixels, 3, 8, 5);
    uniforms.uVignetteStrength.value = resolveVignetteStrength(state, profile);
    uniforms.uGrainStrength.value = clampPostProcessingValue(profile.grainStrength, 0, 0.06, 0);
    uniforms.uGrainTime.value = clampPostProcessingValue(resolveGrainTime(state), 0, 86_400, 0);
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
