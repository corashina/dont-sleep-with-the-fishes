import {
  Camera,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PosterizationPass } from './PosterizationPass';
import {
  DEFAULT_POSTERIZATION,
  normalizePosterization,
  type PosterizationSetting,
} from './posterization';
import {
  ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
  ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
  ItemAmbientOcclusionPass,
  type ItemAmbientOcclusionMode,
} from './ItemAmbientOcclusion';
import {
  BinocularMaskPass,
  sceneBinocularMaskStrength,
} from './BinocularMaskPass';
import { sceneHoverOutlineTargets } from './HoverOutline';
import {
  configureHoverOutlinePass,
  HoverOutlinePass,
} from './HoverOutlinePass';
import {
  MENU_ATMOSPHERE_QUALITY,
  MenuAtmospherePass,
} from './MenuAtmospherePass';
import {
  DirectSceneRenderer,
  type SceneRenderer,
  type SceneVisualState,
} from './SceneRenderer';
import type { VisualQuality } from './visualQuality';
import {
  antiAliasingSamples,
  type AntiAliasingQuality,
} from './antiAliasingQuality';
import {
  applyShadowQuality,
  refreshSceneShadowMaterials,
  type ShadowQuality,
} from './shadowQuality';
import {
  clampPostProcessingSetting,
  type AmbientOcclusionQuality,
  type PostProcessingControls,
  type PostProcessingControlState,
  type PostProcessingNumericSetting,
} from './postProcessingControls';

type AmbientOcclusionFactory = (
  mode: ItemAmbientOcclusionMode,
  quality: AmbientOcclusionQuality,
) => ItemAmbientOcclusionPass;
type PipelineFactory = (
  renderer: WebGLRenderer,
  quality: VisualQuality,
  antiAliasingQuality: AntiAliasingQuality,
) => SceneRenderer;
type FallbackReporter = (error: unknown) => void;

interface PipelineResources {
  readonly posterization: PosterizationPass;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null;
  readonly outlinePass: OutlinePass;
  readonly bloomPass: UnrealBloomPass;
  readonly menuAtmospherePass: MenuAtmospherePass;
  readonly binocularMaskPass: BinocularMaskPass;
  readonly outputPass: OutputPass;
}

const MAX_PIXEL_RATIO = 2;
const FALLBACK_MAX_TEXTURE_SIZE = 4_096;

function supportedTextureSize(reportedSize: number): number {
  return Number.isFinite(reportedSize) && reportedSize > 0
    ? reportedSize
    : FALLBACK_MAX_TEXTURE_SIZE;
}

function createComposerTarget(
  renderer: WebGLRenderer,
  size: Vector2,
  antiAliasingQuality: AntiAliasingQuality,
): WebGLRenderTarget {
  const target = new WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y));
  target.texture.name = 'ambient-occlusion-composer';
  target.samples = antiAliasingSamples(
    antiAliasingQuality,
    renderer.capabilities.maxSamples,
  );
  return target;
}
const MENU_AMBIENT_OCCLUSION = {
  low: null,
  high: { intensity: 1.18, radius: 0.17 },
} as const satisfies Readonly<Record<VisualQuality, {
  readonly intensity: number;
  readonly radius: number;
} | null>>;

export class PostProcessingPipeline implements SceneRenderer {
  readonly postProcessingControls: PostProcessingControls = Object.freeze({
    setPosterization: (posterization: PosterizationSetting) => this.setPosterization(posterization),
    getState: () => Object.freeze({
      ...this.controlState,
      ambientOcclusionAvailable:
        !this.aoUnavailable && this.itemAmbientOcclusionPass !== null,
    }),
    setAmbientOcclusionMode: (mode: ItemAmbientOcclusionMode) =>
      this.setAmbientOcclusionMode(mode),
    setAmbientOcclusionQuality: (quality: AmbientOcclusionQuality) =>
      this.setAmbientOcclusionQuality(quality),
    setNumeric: (setting: PostProcessingNumericSetting, value: number) =>
      this.setNumeric(setting, value),
  });
  private readonly composer: EffectComposer;
  private readonly posterization: PosterizationPass;
  private readonly renderPass: RenderPass;
  private itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null;
  private readonly outlinePass: OutlinePass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly menuAtmospherePass: MenuAtmospherePass;
  private readonly binocularMaskPass: BinocularMaskPass;
  private readonly outputPass: OutputPass;
  private readonly size: Vector2;
  private readonly maxTextureSize: number;
  private readonly controlState: PostProcessingControlState;
  private visualQuality: VisualQuality;
  private antiAliasingQuality: AntiAliasingQuality;
  private shadowMaterialsNeedUpdate = false;
  private menuEffectsActive = false;
  private aoUnavailable = false;
  private disposed = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    quality: VisualQuality = 'low',
    antiAliasingQuality: AntiAliasingQuality = 'low',
    createAmbientOcclusion: AmbientOcclusionFactory = (mode, initialQuality) =>
      new ItemAmbientOcclusionPass(mode, initialQuality),
    private readonly reportFallback: FallbackReporter = (error) => {
      console.warn('Ambient occlusion unavailable; continuing without it.', error);
    },
  ) {
    this.visualQuality = quality;
    this.antiAliasingQuality = antiAliasingQuality;
    this.controlState = {
      posterization: DEFAULT_POSTERIZATION,
      ambientOcclusionAvailable: true,
      ambientOcclusionMode: 'composite',
      ambientOcclusionQuality: 'low',
      ambientOcclusionIntensity: ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
      ambientOcclusionRadius: ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
    };
    this.size = new Vector2();
    this.maxTextureSize = supportedTextureSize(renderer.capabilities.maxTextureSize);
    renderer.getSize(this.size);
    const resources = this.createPipelineResources(
      createAmbientOcclusion,
      antiAliasingQuality,
    );
    this.composer = resources.composer;
    this.posterization = resources.posterization;
    this.renderPass = resources.renderPass;
    this.itemAmbientOcclusionPass = resources.itemAmbientOcclusionPass;
    this.outlinePass = resources.outlinePass;
    this.bloomPass = resources.bloomPass;
    this.menuAtmospherePass = resources.menuAtmospherePass;
    this.binocularMaskPass = resources.binocularMaskPass;
    this.outputPass = resources.outputPass;
    this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
  }

  private createPipelineResources(
    createAmbientOcclusion: AmbientOcclusionFactory,
    antiAliasingQuality: AntiAliasingQuality,
  ): PipelineResources {
    const target = createComposerTarget(this.renderer, this.size, antiAliasingQuality);
    let composer: EffectComposer | undefined;
    let posterization: PosterizationPass | undefined;
    let outlinePass: OutlinePass | undefined;
    let bloomPass: UnrealBloomPass | undefined;
    let menuAtmospherePass: MenuAtmospherePass | undefined;
    let binocularMaskPass: BinocularMaskPass | undefined;
    let outputPass: OutputPass | undefined;
    let itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null = null;
    try {
      composer = new EffectComposer(this.renderer, target);
      const renderPass = new RenderPass(new Scene(), new Camera());
      itemAmbientOcclusionPass = this.createAmbientOcclusionPass(createAmbientOcclusion, this.controlState.ambientOcclusionQuality);
      outlinePass = new HoverOutlinePass(this.size, new Scene(), new PerspectiveCamera());
      configureHoverOutlinePass(outlinePass);
      bloomPass = new UnrealBloomPass(this.size, 0, 0, 1);
      bloomPass.enabled = false;
      menuAtmospherePass = new MenuAtmospherePass();
      binocularMaskPass = new BinocularMaskPass();
      outputPass = new OutputPass();
      posterization = new PosterizationPass();

      composer.addPass(renderPass);
      itemAmbientOcclusionPass = this.addAmbientOcclusionPass(composer, itemAmbientOcclusionPass);
      composer.addPass(outlinePass);
      composer.addPass(bloomPass);
      composer.addPass(menuAtmospherePass);
      composer.addPass(outputPass);
      composer.addPass(posterization);
      composer.addPass(binocularMaskPass);
      return {
        posterization,
        composer,
        renderPass,
        itemAmbientOcclusionPass,
        outlinePass,
        bloomPass,
        menuAtmospherePass,
        binocularMaskPass,
        outputPass,
      };
    } catch (error) {
      posterization?.dispose();
      this.disposePipelineResources(
        target,
        composer,
        itemAmbientOcclusionPass,
        outlinePass,
        bloomPass,
        menuAtmospherePass,
        binocularMaskPass,
        outputPass,
      );
      throw error;
    }
  }

  private disposePipelineResources(
    target: WebGLRenderTarget,
    composer: EffectComposer | undefined,
    itemAmbientOcclusionPass: ItemAmbientOcclusionPass | null,
    outlinePass: OutlinePass | undefined,
    bloomPass: UnrealBloomPass | undefined,
    menuAtmospherePass: MenuAtmospherePass | undefined,
    binocularMaskPass: BinocularMaskPass | undefined,
    outputPass: OutputPass | undefined,
  ): void {
    itemAmbientOcclusionPass?.dispose();
    outlinePass?.dispose();
    bloomPass?.dispose();
    menuAtmospherePass?.dispose();
    binocularMaskPass?.dispose();
    outputPass?.dispose();
    if (composer === undefined) target.dispose();
    else composer.dispose();
  }

  render(
    scene: Scene,
    camera: Camera,
    state: Readonly<SceneVisualState>,
  ): void {
    if (this.disposed) return;
    if (this.shadowMaterialsNeedUpdate) {
      refreshSceneShadowMaterials(scene);
      this.shadowMaterialsNeedUpdate = false;
    }
    const menuEffectsActive = state.kind === 'menu';
    if (menuEffectsActive !== this.menuEffectsActive) {
      this.menuEffectsActive = menuEffectsActive;
      this.syncMenuProfile();
    }
    if (menuEffectsActive) {
      this.menuAtmospherePass.setTime(state.elapsedSeconds);
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.itemAmbientOcclusionPass?.setContext(scene, camera);
    this.outlinePass.renderScene = scene;
    this.outlinePass.renderCamera = camera;
    this.outlinePass.selectedObjects = sceneHoverOutlineTargets(scene);
    this.binocularMaskPass.setStrength(sceneBinocularMaskStrength(scene));
    this.composer.render(0);
  }

  resize(width: number, height: number, pixelRatio: number): void {
    if (!this.validResize(width, height, pixelRatio)) return;
    const physicalWidth = width * pixelRatio;
    const physicalHeight = height * pixelRatio;
    if (!this.validPhysicalSize(physicalWidth, physicalHeight)) return;
    this.resizeAmbientOcclusion(physicalWidth, physicalHeight);
    this.resizeComposer(width, height, pixelRatio);
  }

  private createAmbientOcclusionPass(
    createAmbientOcclusion: AmbientOcclusionFactory,
    quality: AmbientOcclusionQuality,
  ): ItemAmbientOcclusionPass | null {
    try {
      return createAmbientOcclusion(this.controlState.ambientOcclusionMode, quality);
    } catch (error) {
      this.reportFallback(error);
      return null;
    }
  }

  private addAmbientOcclusionPass(
    composer: EffectComposer,
    pass: ItemAmbientOcclusionPass | null,
  ): ItemAmbientOcclusionPass | null {
    if (pass === null) return null;
    try {
      composer.addPass(pass);
      return pass;
    } catch (error) {
      pass.enabled = false;
      composer.removePass(pass);
      this.aoUnavailable = true;
      pass.dispose();
      this.reportFallback(error);
      return null;
    }
  }

  private validResize(width: number, height: number, pixelRatio: number): boolean {
    return !this.disposed
      && Number.isFinite(width)
      && Number.isFinite(height)
      && Number.isFinite(pixelRatio)
      && width > 0
      && height > 0
      && pixelRatio > 0
      && pixelRatio <= MAX_PIXEL_RATIO;
  }

  private validPhysicalSize(width: number, height: number): boolean {
    return Number.isFinite(width)
      && Number.isFinite(height)
      && width <= this.maxTextureSize
      && height <= this.maxTextureSize;
  }

  private resizeAmbientOcclusion(width: number, height: number): void {
    const pass = this.itemAmbientOcclusionPass;
    if (pass === null) return;
    try {
      pass.setSize(width, height);
    } catch (error) {
      this.retireAmbientOcclusion(error);
    }
  }

  private resizeComposer(width: number, height: number, pixelRatio: number): void {
    const pass = this.itemAmbientOcclusionPass;
    if (pass !== null) this.composer.removePass(pass);
    try {
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
      this.binocularMaskPass.setSize(width, height);
    } finally {
      if (pass !== null) this.composer.passes.splice(1, 0, pass);
    }
  }

  setVisualQuality(value: VisualQuality): void {
    if (this.disposed || value === this.visualQuality) return;
    this.visualQuality = value;
    this.syncMenuProfile();
  }

  private setAmbientOcclusionQuality(value: AmbientOcclusionQuality): void {
    if (this.disposed || value === this.controlState.ambientOcclusionQuality) return;
    this.controlState.ambientOcclusionQuality = value;
    if (this.aoUnavailable || this.itemAmbientOcclusionPass === null) return;
    try {
      this.itemAmbientOcclusionPass.setQuality(value);
    } catch (error) {
      this.retireAmbientOcclusion(error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.posterization.dispose();
    this.itemAmbientOcclusionPass?.dispose();
    this.outlinePass.dispose();
    this.bloomPass.dispose();
    this.menuAtmospherePass.dispose();
    this.binocularMaskPass.dispose();
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
    this.syncAmbientOcclusionProfile();
  }

  setAntiAliasingQuality(value: AntiAliasingQuality): void {
    if (this.disposed || value === this.antiAliasingQuality) return;
    this.antiAliasingQuality = value;
    const samples = antiAliasingSamples(
      value,
      this.renderer.capabilities.maxSamples,
    );
    const targets = [this.composer.renderTarget1, this.composer.renderTarget2];
    for (const target of targets) {
      if (target.samples === samples) continue;
      target.samples = samples;
      target.dispose();
    }
  }

  setShadowQuality(value: ShadowQuality): void {
    if (this.disposed || !applyShadowQuality(this.renderer, value)) return;
    this.shadowMaterialsNeedUpdate = true;
  }

  private syncMenuProfile(): void {
    const settings = MENU_ATMOSPHERE_QUALITY[this.visualQuality];
    const enabled = this.menuEffectsActive && settings.gradeStrength > 0;
    this.bloomPass.enabled = enabled;
    this.bloomPass.strength = enabled ? settings.bloomStrength : 0;
    this.bloomPass.radius = enabled ? settings.bloomRadius : 0;
    this.bloomPass.threshold = enabled ? settings.bloomThreshold : 1;
    this.menuAtmospherePass.setProfile(
      this.menuEffectsActive,
      this.visualQuality,
    );
    this.syncAmbientOcclusionProfile();
  }

  private syncAmbientOcclusionProfile(): void {
    if (this.aoUnavailable || this.itemAmbientOcclusionPass === null) return;
    const menuProfile = this.menuEffectsActive
      ? MENU_AMBIENT_OCCLUSION[this.visualQuality]
      : null;
    this.itemAmbientOcclusionPass.setIntensity(
      menuProfile?.intensity ?? this.controlState.ambientOcclusionIntensity,
    );
    this.itemAmbientOcclusionPass.setRadius(
      menuProfile?.radius ?? this.controlState.ambientOcclusionRadius,
    );
  }

  private setPosterization(posterization: PosterizationSetting): void {
    if (this.disposed) return;
    this.controlState.posterization = normalizePosterization(posterization);
    this.posterization.setState(this.controlState.posterization);
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
  antiAliasingQuality: AntiAliasingQuality = 'low',
  shadowQuality: ShadowQuality = 'low',
  createPipeline: PipelineFactory = (value, initialQuality, initialAntiAliasingQuality) =>
    new PostProcessingPipeline(value, initialQuality, initialAntiAliasingQuality),
  reportFallback: FallbackReporter = (error) => {
    console.warn('Post-processing unavailable; using direct scene rendering.', error);
  },
): SceneRenderer {
  applyShadowQuality(renderer, shadowQuality);
  try {
    return createPipeline(renderer, quality, antiAliasingQuality);
  } catch (error) {
    reportFallback(error);
    return new DirectSceneRenderer(renderer, shadowQuality);
  }
}
