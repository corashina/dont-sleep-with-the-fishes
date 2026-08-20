import {
  Camera,
  Color,
  Material,
  Object3D,
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
import { sceneHoverOutlineTargets } from './HoverOutline';
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
const MENU_AMBIENT_OCCLUSION = {
  low: null,
  medium: { intensity: 1.08, radius: 0.2 },
  high: { intensity: 1.18, radius: 0.17 },
} as const satisfies Readonly<Record<VisualQuality, {
  readonly intensity: number;
  readonly radius: number;
} | null>>;
type MaterialObject = Object3D & {
  readonly material?: Material | Material[];
};

type OutlinePassInternals = OutlinePass & {
  readonly _fsQuad: {
    material: Material | null;
    render(renderer: WebGLRenderer): void;
  };
  _updateSelectionCache(): void;
  _changeVisibilityOfSelectedObjects(visible: boolean): void;
  _changeVisibilityOfNonSelectedObjects(visible: boolean): void;
};

type OutlineUniforms = Record<string, { value: unknown }>;
const OUTLINE_BLUR_DIRECTIONS = OutlinePass as typeof OutlinePass & {
  readonly BlurDirectionX: Vector2;
  readonly BlurDirectionY: Vector2;
};

export function configureHoverOutlinePass(outlinePass: OutlinePass): void {
  outlinePass.visibleEdgeColor.setHex(0xffffff);
  outlinePass.hiddenEdgeColor.setHex(0x000000);
  outlinePass.edgeStrength = 5;
  outlinePass.edgeThickness = 4;
  outlinePass.edgeGlow = 0;
  outlinePass.downSampleRatio = 2;

  const maskMaterial = outlinePass.prepareMaskMaterial;
  maskMaterial.vertexShader = `
    #include <batching_pars_vertex>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    void main() {
      #include <batching_vertex>
      #include <skinbase_vertex>
      #include <begin_vertex>
      #include <morphtarget_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
    }
  `;
  maskMaterial.fragmentShader = `void main() {
    gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
  }`;
  maskMaterial.needsUpdate = true;
}

export class HoverOutlinePass extends OutlinePass {
  private readonly previousClearColor = new Color();
  private readonly depthMaterials = new Set<Material>();
  private readonly depthMaterialList: Material[] = [];
  private readonly depthColorWrites: boolean[] = [];
  private readonly disableObjectColorWrite = (object: Object3D): void => {
    const material = (object as MaterialObject).material;
    if (material === undefined) return;
    if (Array.isArray(material)) {
      for (const entry of material) this.disableMaterialColorWrite(entry);
      return;
    }
    this.disableMaterialColorWrite(material);
  };

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    if (this.selectedObjects.length > 0) {
      this.renderVisibleOutline(renderer, readBuffer, maskActive);
    }
    if (this.renderToScreen) {
      const internals = this as unknown as OutlinePassInternals;
      internals._fsQuad.material = this.materialCopy;
      (this.copyUniforms as OutlineUniforms).tDiffuse!.value = readBuffer.texture;
      renderer.setRenderTarget(null);
      internals._fsQuad.render(renderer);
    }
  }

  private renderVisibleOutline(
    renderer: WebGLRenderer,
    readBuffer: WebGLRenderTarget,
    maskActive: boolean,
  ): void {
    const internals = this as unknown as OutlinePassInternals;
    renderer.getClearColor(this.previousClearColor);
    this.oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    const currentBackground = this.renderScene.background;
    const currentOverrideMaterial = this.renderScene.overrideMaterial;
    renderer.autoClear = false;
    if (maskActive) renderer.state.buffers.stencil.setTest(false);
    renderer.setClearColor(0xffffff, 1);
    internals._updateSelectionCache();
    this.renderScene.background = null;
    this.renderScene.overrideMaterial = null;

    renderer.setRenderTarget(this.renderTargetMaskBuffer);
    renderer.clear();
    internals._changeVisibilityOfSelectedObjects(false);
    this.disableSceneColorWrites();
    try {
      renderer.render(this.renderScene, this.renderCamera);
    } finally {
      this.restoreSceneColorWrites();
      internals._changeVisibilityOfSelectedObjects(true);
    }

    internals._changeVisibilityOfNonSelectedObjects(false);
    this.renderScene.overrideMaterial = this.prepareMaskMaterial;
    try {
      renderer.render(this.renderScene, this.renderCamera);
    } finally {
      internals._changeVisibilityOfNonSelectedObjects(true);
    }

    this.renderScene.background = currentBackground;
    this.renderScene.overrideMaterial = currentOverrideMaterial;
    this.renderOutlineTextures(renderer, readBuffer);
    if (maskActive) renderer.state.buffers.stencil.setTest(true);
    renderer.setClearColor(this.previousClearColor, this.oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  private renderOutlineTextures(
    renderer: WebGLRenderer,
    readBuffer: WebGLRenderTarget,
  ): void {
    const internals = this as unknown as OutlinePassInternals;
    internals._fsQuad.material = this.materialCopy;
    (this.copyUniforms as OutlineUniforms).tDiffuse!.value =
      this.renderTargetMaskBuffer.texture;
    renderer.setRenderTarget(this.renderTargetMaskDownSampleBuffer);
    renderer.clear();
    internals._fsQuad.render(renderer);

    this.tempPulseColor1.copy(this.visibleEdgeColor);
    this.tempPulseColor2.copy(this.hiddenEdgeColor);
    if (this.pulsePeriod > 0) {
      const pulse = 0.625
        + Math.cos(performance.now() * 0.01 / this.pulsePeriod) * 0.375;
      this.tempPulseColor1.multiplyScalar(pulse);
      this.tempPulseColor2.multiplyScalar(pulse);
    }

    internals._fsQuad.material = this.edgeDetectionMaterial;
    this.edgeDetectionMaterial.uniforms.maskTexture!.value =
      this.renderTargetMaskDownSampleBuffer.texture;
    this.edgeDetectionMaterial.uniforms.texSize!.value.set(
      this.renderTargetMaskDownSampleBuffer.width,
      this.renderTargetMaskDownSampleBuffer.height,
    );
    this.edgeDetectionMaterial.uniforms.visibleEdgeColor!.value = this.tempPulseColor1;
    this.edgeDetectionMaterial.uniforms.hiddenEdgeColor!.value = this.tempPulseColor2;
    renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
    renderer.clear();
    internals._fsQuad.render(renderer);

    internals._fsQuad.material = this.separableBlurMaterial1;
    this.separableBlurMaterial1.uniforms.colorTexture!.value =
      this.renderTargetEdgeBuffer1.texture;
    this.separableBlurMaterial1.uniforms.direction!.value =
      OUTLINE_BLUR_DIRECTIONS.BlurDirectionX;
    this.separableBlurMaterial1.uniforms.kernelRadius!.value = this.edgeThickness;
    renderer.setRenderTarget(this.renderTargetBlurBuffer1);
    renderer.clear();
    internals._fsQuad.render(renderer);
    this.separableBlurMaterial1.uniforms.colorTexture!.value =
      this.renderTargetBlurBuffer1.texture;
    this.separableBlurMaterial1.uniforms.direction!.value =
      OUTLINE_BLUR_DIRECTIONS.BlurDirectionY;
    renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
    renderer.clear();
    internals._fsQuad.render(renderer);

    internals._fsQuad.material = this.overlayMaterial;
    this.overlayMaterial.uniforms.maskTexture!.value = this.renderTargetMaskBuffer.texture;
    this.overlayMaterial.uniforms.edgeTexture1!.value = this.renderTargetEdgeBuffer1.texture;
    this.overlayMaterial.uniforms.edgeTexture2!.value = this.renderTargetEdgeBuffer2.texture;
    this.overlayMaterial.uniforms.patternTexture!.value = this.patternTexture;
    this.overlayMaterial.uniforms.edgeStrength!.value = this.edgeStrength;
    this.overlayMaterial.uniforms.edgeGlow!.value = this.edgeGlow;
    this.overlayMaterial.uniforms.usePatternTexture!.value = this.usePatternTexture;
    renderer.setRenderTarget(readBuffer);
    internals._fsQuad.render(renderer);
  }

  private disableSceneColorWrites(): void {
    this.depthMaterials.clear();
    this.depthMaterialList.length = 0;
    this.depthColorWrites.length = 0;
    this.renderScene.traverse(this.disableObjectColorWrite);
  }

  private disableMaterialColorWrite(material: Material): void {
    if (this.depthMaterials.has(material)) return;
    this.depthMaterials.add(material);
    this.depthMaterialList.push(material);
    this.depthColorWrites.push(material.colorWrite);
    material.colorWrite = false;
  }

  private restoreSceneColorWrites(): void {
    for (let index = 0; index < this.depthMaterialList.length; index += 1) {
      this.depthMaterialList[index]!.colorWrite = this.depthColorWrites[index]!;
    }
    this.depthMaterials.clear();
    this.depthMaterialList.length = 0;
    this.depthColorWrites.length = 0;
  }
}

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
  private readonly bloomPass: UnrealBloomPass;
  private readonly menuAtmospherePass: MenuAtmospherePass;
  private readonly binocularMaskPass: BinocularMaskPass;
  private readonly outputPass: OutputPass;
  private readonly size: Vector2;
  private readonly maxTextureSize: number;
  private readonly controlState: PostProcessingControlState;
  private visualQuality: VisualQuality;
  private menuEffectsActive = false;
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
    this.visualQuality = quality;
    this.controlState = {
      ambientOcclusionAvailable: true,
      ambientOcclusionMode: 'composite',
      ambientOcclusionIntensity: ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
      ambientOcclusionRadius: ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
    };
    let target: WebGLRenderTarget | undefined;
    let composer: EffectComposer | undefined;
    let outlinePass: OutlinePass | undefined;
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
      outlinePass = new HoverOutlinePass(this.size, new Scene(), new PerspectiveCamera());
      configureHoverOutlinePass(outlinePass);
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
      composer.addPass(outlinePass);
      composer.addPass(bloomPass);
      composer.addPass(menuAtmospherePass);
      composer.addPass(binocularMaskPass);
      composer.addPass(outputPass);

      this.composer = composer;
      this.itemAmbientOcclusionPass = itemAmbientOcclusionPass;
      this.outlinePass = outlinePass;
      this.bloomPass = bloomPass;
      this.menuAtmospherePass = menuAtmospherePass;
      this.binocularMaskPass = binocularMaskPass;
      this.outputPass = outputPass;
      this.resize(this.size.x, this.size.y, renderer.getPixelRatio());
    } catch (error) {
      itemAmbientOcclusionPass?.dispose();
      outlinePass?.dispose();
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
