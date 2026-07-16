import {
  Camera,
  Color,
  HalfFloatType,
  Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PrintShader } from './PrintShader';
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

type PrintUniforms = {
  tDiffuse: { value: null };
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
  uHalftoneStrength: { value: number };
  uHalftoneSizeCssPixels: { value: number };
  uVignetteStrength: { value: number };
  uChromaticAberrationCssPixels: { value: number };
  uGrainStrength: { value: number };
  uGrainTime: { value: number };
};
type PipelineFactory = (renderer: WebGLRenderer) => SceneRenderer;
type FallbackReporter = (error: unknown) => void;
const MAX_PIXEL_RATIO = 2;
const FALLBACK_MAX_TEXTURE_SIZE = 4_096;

export class PostProcessingPipeline implements SceneRenderer {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly printPass: ShaderPass;
  private readonly outputPass: OutputPass;
  private readonly uniforms: PrintUniforms;
  private readonly size = new Vector2();
  private readonly maxTextureSize: number;
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {
    const reportedMaxTextureSize = renderer.capabilities.maxTextureSize;
    this.maxTextureSize = Number.isFinite(reportedMaxTextureSize) && reportedMaxTextureSize > 0
      ? reportedMaxTextureSize
      : FALLBACK_MAX_TEXTURE_SIZE;
    renderer.getSize(this.size);
    const target = new WebGLRenderTarget(
      Math.max(1, this.size.x),
      Math.max(1, this.size.y),
      { type: HalfFloatType },
    );
    target.texture.name = 'restrained-print-composer';
    target.samples = Math.min(4, Math.max(0, renderer.capabilities.maxSamples ?? 0));

    let composer!: EffectComposer;
    let renderPass!: RenderPass;
    let printPass!: ShaderPass;
    let outputPass!: OutputPass;
    try {
      composer = new EffectComposer(renderer, target);
      renderPass = new RenderPass(new Scene(), new Camera());
      printPass = new ShaderPass(PrintShader);
      outputPass = new OutputPass();
      composer.addPass(renderPass);
      composer.addPass(printPass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.renderPass = renderPass;
      this.printPass = printPass;
      this.outputPass = outputPass;
      this.uniforms = printPass.uniforms as PrintUniforms;
      this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
    } catch (error) {
      printPass?.dispose();
      outputPass?.dispose();
      if (composer === undefined) target.dispose();
      else composer.dispose();
      throw error;
    }
  }

  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void {
    if (this.disposed) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.applyProfile(selectPostProcessingProfile(state), state);
    this.composer.render(0);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (
      this.disposed
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || !Number.isFinite(pixelRatio)
      || width <= 0
      || height <= 0
      || pixelRatio <= 0
      || pixelRatio > MAX_PIXEL_RATIO
    ) return;
    const physicalWidth = width * pixelRatio;
    const physicalHeight = height * pixelRatio;
    if (
      !Number.isFinite(physicalWidth)
      || !Number.isFinite(physicalHeight)
      || physicalWidth > this.maxTextureSize
      || physicalHeight > this.maxTextureSize
    ) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.uniforms.uResolution.value.set(physicalWidth, physicalHeight);
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.printPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }

  private applyProfile(
    profile: Readonly<PostProcessingProfile>,
    state: Readonly<SceneVisualState>,
  ): void {
    const uniforms = this.uniforms;
    uniforms.uContrast.value = clampPostProcessingValue(profile.contrast, 0.8, 1.2, 1);
    uniforms.uSaturation.value = clampPostProcessingValue(profile.saturation, 0.7, 1.1, 1);
    uniforms.uHighlightCompression.value = clampPostProcessingValue(
      profile.highlightCompression, 0, 0.3, 0,
    );
    uniforms.uShadowLift.value = clampPostProcessingValue(profile.shadowLift, 0, 0.08, 0);
    uniforms.uShadowTint.value.setHex(clampPostProcessingValue(
      profile.shadowTint, 0, 0xffffff, 0x123039,
    ));
    uniforms.uShadowTintStrength.value = clampPostProcessingValue(
      profile.shadowTintStrength, 0, 0.25, 0,
    );
    uniforms.uHighlightTint.value.setHex(clampPostProcessingValue(
      profile.highlightTint, 0, 0xffffff, 0xd8aa6d,
    ));
    uniforms.uHighlightTintStrength.value = clampPostProcessingValue(
      profile.highlightTintStrength, 0, 0.25, 0,
    );
    uniforms.uHalftoneStrength.value = clampPostProcessingValue(
      profile.halftoneStrength, 0, 0.15, 0,
    );
    uniforms.uHalftoneSizeCssPixels.value = clampPostProcessingValue(
      profile.halftoneSizeCssPixels, 3, 8, 5,
    );
    uniforms.uVignetteStrength.value = resolveVignetteStrength(state, profile);
    uniforms.uChromaticAberrationCssPixels.value = clampPostProcessingValue(
      profile.chromaticAberrationCssPixels, 0, 0.9, 0,
    );
    uniforms.uGrainStrength.value = clampPostProcessingValue(profile.grainStrength, 0, 0.06, 0);
    uniforms.uGrainTime.value = clampPostProcessingValue(resolveGrainTime(state), 0, 86_400, 0);
  }
}

export function createSceneRenderer(
  renderer: WebGLRenderer,
  createPipeline: PipelineFactory = (value) => new PostProcessingPipeline(value),
  reportFallback: FallbackReporter = (error) => {
    console.warn('Post-processing unavailable; using direct scene rendering.', error);
  },
): SceneRenderer {
  try {
    return createPipeline(renderer);
  } catch (error) {
    reportFallback(error);
    return new DirectSceneRenderer(renderer);
  }
}
