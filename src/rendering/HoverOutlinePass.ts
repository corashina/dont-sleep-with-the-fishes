import {
  Color,
  LessEqualDepth,
  Material,
  Object3D,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

type OutlinePassInternals = OutlinePass & {
  readonly _fsQuad: {
    material: Material | null;
    render(renderer: WebGLRenderer): void;
  };
  _updateSelectionCache(): void;
  readonly _visibilityCache: Map<Object3D, boolean>;
  readonly _selectionCache: Set<Object3D>;
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
  maskMaterial.depthWrite = false;
  maskMaterial.depthFunc = LessEqualDepth;
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
  private maskReady = false;

  captureMask(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    maskActive: boolean,
  ): boolean {
    this.maskReady = false;
    if (!this.enabled || this.selectedObjects.length === 0) return false;

    const internals = this as unknown as OutlinePassInternals;
    renderer.getClearColor(this.previousClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    const currentRenderTarget = renderer.getRenderTarget();
    const currentBackground = this.renderScene.background;
    const currentOverrideMaterial = this.renderScene.overrideMaterial;
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const shadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    let nonSelectedObjectsHidden = false;
    let sourceColorModified = false;
    try {
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      if (maskActive) renderer.state.buffers.stencil.setTest(false);

      // Preserve scene color before using its retained multisample depth for the mask.
      this.copyColor(renderer, readBuffer, writeBuffer);
      renderer.setRenderTarget(readBuffer);
      renderer.setClearColor(0xffffff, 1);
      sourceColorModified = true;
      renderer.clear(true, false, false);
      internals._updateSelectionCache();
      this.renderScene.background = null;
      this.renderScene.overrideMaterial = this.prepareMaskMaterial;
      nonSelectedObjectsHidden = true;
      internals._changeVisibilityOfNonSelectedObjects(false);
      renderer.render(this.renderScene, this.renderCamera);

      // Switching targets resolves the mask color. Initialize its destination first.
      renderer.setRenderTarget(this.renderTargetMaskBuffer);
      renderer.copyTextureToTexture(readBuffer.texture, this.renderTargetMaskBuffer.texture);
    } catch (error) {
      if (sourceColorModified) {
        try {
          this.copyColor(renderer, writeBuffer, readBuffer);
        } catch {
          // Keep the capture error if restoring scene color also fails.
        }
      }
      throw error;
    } finally {
      if (nonSelectedObjectsHidden) {
        internals._changeVisibilityOfNonSelectedObjects(true);
      }
      internals._visibilityCache.clear();
      internals._selectionCache.clear();
      this.renderScene.background = currentBackground;
      this.renderScene.overrideMaterial = currentOverrideMaterial;
      renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
      if (maskActive) renderer.state.buffers.stencil.setTest(true);
      renderer.setClearColor(this.previousClearColor, oldClearAlpha);
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(currentRenderTarget);
    }
    this.maskReady = true;
    return true;
  }

  override render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    maskActive: boolean,
  ): void {
    const composeMask = this.maskReady && this.enabled && this.selectedObjects.length > 0;
    this.maskReady = false;
    if (composeMask) {
      const currentRenderTarget = renderer.getRenderTarget();
      const oldAutoClear = renderer.autoClear;
      renderer.getClearColor(this.previousClearColor);
      const oldClearAlpha = renderer.getClearAlpha();
      try {
        renderer.autoClear = false;
        renderer.setClearColor(0xffffff, 1);
        if (maskActive) renderer.state.buffers.stencil.setTest(false);
        this.renderOutlineTextures(renderer, readBuffer);
      } finally {
        if (maskActive) renderer.state.buffers.stencil.setTest(true);
        renderer.setClearColor(this.previousClearColor, oldClearAlpha);
        renderer.autoClear = oldAutoClear;
        renderer.setRenderTarget(currentRenderTarget);
      }
    }
    if (this.renderToScreen) this.copyColor(renderer, readBuffer, null);
  }

  private copyColor(
    renderer: WebGLRenderer,
    source: WebGLRenderTarget,
    target: WebGLRenderTarget | null,
  ): void {
    const internals = this as unknown as OutlinePassInternals;
    internals._fsQuad.material = this.materialCopy;
    (this.copyUniforms as OutlineUniforms).tDiffuse!.value = source.texture;
    renderer.setRenderTarget(target);
    internals._fsQuad.render(renderer);
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
}

export class OutlineMaskCapturePass extends Pass {
  constructor(private readonly outline: HoverOutlinePass) {
    super();
    this.needsSwap = false;
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    maskActive: boolean,
  ): void {
    this.needsSwap = false;
    this.needsSwap = this.outline.captureMask(renderer, writeBuffer, readBuffer, maskActive);
  }
}
