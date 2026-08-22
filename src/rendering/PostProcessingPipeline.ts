import {
  Camera,
  Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
  type PostProcessingControls,
  type PostProcessingControlState,
  type PostProcessingNumericSetting,
} from './postProcessingControls';

type AmbientOcclusionFactory = (
  mode: ItemAmbientOcclusionMode,
  quality: VisualQuality,
) => ItemAmbientOcclusionPass;
type PipelineFactory = (
  renderer: WebGLRenderer,
  quality: VisualQuality,
  antiAliasingQuality: AntiAliasingQuality,
) => SceneRenderer;
type FallbackReporter = (error: unknown) => void;

const MAX_PIXEL_RATIO = 2;
const FALLBACK_MAX_TEXTURE_SIZE = 4_096;
const MENU_AMBIENT_OCCLUSION = {
  low: null,
  medium: { intensity: 1.08, radius: 0.2 },
  high: { intensity: 1.18, radius: 0.17 },
} as const satisfies Readonly<Record<VisualQuality, {
  readonly intensity: number;
  readonly radius: number;
} | null>>;
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
      ambientOcclusionAvailable: true,
      ambientOcclusionMode: 'composite',
      ambientOcclusionIntensity: ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
      ambientOcclusionRadius: ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
    };
    let target: WebGLRenderTarget | undefined;
    let composer: EffectComposer | undefined;
    let bloomPass: UnrealBloomPass | undefined;
    let menuAtmospherePass: MenuAtmospherePass | undefined;
    let binocularMaskPass: BinocularMaskPass | undefined;
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
      target.samples = antiAliasingSamples(
        antiAliasingQuality,
        renderer.capabilities.maxSamples,
      );
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
      bloomPass = new UnrealBloomPass(this.size, 0, 0, 1);
      bloomPass.enabled = false;
      menuAtmospherePass = new MenuAtmospherePass();
      binocularMaskPass = new BinocularMaskPass();
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
      composer.addPass(bloomPass);
      composer.addPass(menuAtmospherePass);
      composer.addPass(binocularMaskPass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.itemAmbientOcclusionPass = itemAmbientOcclusionPass;
      this.bloomPass = bloomPass;
      this.menuAtmospherePass = menuAtmospherePass;
      this.binocularMaskPass = binocularMaskPass;
      this.outputPass = outputPass;
      this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
    } catch (error) {
      itemAmbientOcclusionPass?.dispose();
      bloomPass?.dispose();
      menuAtmospherePass?.dispose();
      binocularMaskPass?.dispose();
      outputPass?.dispose();
      if (composer === undefined) target?.dispose();
      else composer.dispose();
      throw error;
    }
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
    this.binocularMaskPass.setStrength(sceneBinocularMaskStrength(scene));
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
      this.binocularMaskPass.setSize(width, height);
    } finally {
      if (activeAmbientOcclusionPass !== null) {
        this.composer.passes.splice(1, 0, activeAmbientOcclusionPass);
      }
    }
  }

  setVisualQuality(value: VisualQuality): void {
    if (this.disposed || value === this.visualQuality) return;
    this.visualQuality = value;
    this.syncMenuProfile();
    if (this.aoUnavailable || this.itemAmbientOcclusionPass === null) return;
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
