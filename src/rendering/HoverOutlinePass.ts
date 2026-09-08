import {
  Color,
  Material,
  Object3D,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

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
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    maskActive: boolean,
  ): void {
    if (this.selectedObjects.length > 0) {
      const autoUpdate = renderer.shadowMap.autoUpdate;
      const needsUpdate = renderer.shadowMap.needsUpdate;
      try {
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = false;
        this.renderVisibleOutline(renderer, readBuffer, maskActive);
      } finally {
        renderer.shadowMap.autoUpdate = autoUpdate;
        renderer.shadowMap.needsUpdate = needsUpdate;
      }
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
    const currentRenderTarget = renderer.getRenderTarget();
    const currentBackground = this.renderScene.background;
    const currentOverrideMaterial = this.renderScene.overrideMaterial;
    let selectedObjectsHidden = false;
    let nonSelectedObjectsHidden = false;
    let colorWritesDisabled = false;
    try {
      renderer.autoClear = false;
      if (maskActive) renderer.state.buffers.stencil.setTest(false);
      renderer.setClearColor(0xffffff, 1);
      internals._updateSelectionCache();
      this.renderScene.background = null;
      this.renderScene.overrideMaterial = null;

      renderer.setRenderTarget(this.renderTargetMaskBuffer);
      renderer.clear();
      selectedObjectsHidden = true;
      internals._changeVisibilityOfSelectedObjects(false);
      colorWritesDisabled = true;
      this.disableSceneColorWrites();
      renderer.render(this.renderScene, this.renderCamera);
      this.restoreSceneColorWrites();
      colorWritesDisabled = false;
      internals._changeVisibilityOfSelectedObjects(true);
      selectedObjectsHidden = false;

      nonSelectedObjectsHidden = true;
      internals._changeVisibilityOfNonSelectedObjects(false);
      this.renderScene.overrideMaterial = this.prepareMaskMaterial;
      renderer.render(this.renderScene, this.renderCamera);
      internals._changeVisibilityOfNonSelectedObjects(true);
      nonSelectedObjectsHidden = false;

      this.renderScene.background = currentBackground;
      this.renderScene.overrideMaterial = currentOverrideMaterial;
      this.renderOutlineTextures(renderer, readBuffer);
    } finally {
      if (colorWritesDisabled) this.restoreSceneColorWrites();
      if (selectedObjectsHidden) internals._changeVisibilityOfSelectedObjects(true);
      if (nonSelectedObjectsHidden) {
        internals._changeVisibilityOfNonSelectedObjects(true);
      }
      this.renderScene.background = currentBackground;
      this.renderScene.overrideMaterial = currentOverrideMaterial;
      if (maskActive) renderer.state.buffers.stencil.setTest(true);
      renderer.setClearColor(this.previousClearColor, this.oldClearAlpha);
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(currentRenderTarget);
    }
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
