import {
  Color, DepthTexture, HalfFloatType, LinearSRGBColorSpace, Matrix4,
  UnsignedIntType, Vector4, WebGLRenderTarget,
  type Camera, type Scene, type WebGLRenderer,
} from 'three';
import { UNDERWATER_GLOW_LAYER } from '../rendering/renderLayers';
import { UnderwaterGlowScattering } from './UnderwaterGlowScattering';

/** Isolate luminous bodies so water can transmit their light in either quality mode. */
export class UnderwaterGlowCapture {
  readonly depthTexture = new DepthTexture(1, 1, UnsignedIntType);
  private readonly target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthTexture: this.depthTexture,
    depthBuffer: true,
    stencilBuffer: false,
  });
  readonly colorTexture = this.target.texture;
  private readonly scattering = new UnderwaterGlowScattering();
  readonly scatteringTexture = this.scattering.texture;
  readonly inverseProjection = new Matrix4();
  readonly viewMatrix = new Matrix4();
  readonly viewport = new Vector4();
  private readonly savedViewport = new Vector4();
  private readonly savedScissor = new Vector4();
  private readonly savedColor = new Color();

  constructor() {
    this.colorTexture.name = 'underwater-glow-color';
    this.colorTexture.colorSpace = LinearSRGBColorSpace;
    this.depthTexture.name = 'underwater-glow-depth';
  }

  update(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    const target = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const autoClear = renderer.autoClear;
    const xr = renderer.xr.enabled;
    const shadows = renderer.shadowMap.autoUpdate;
    const shadowsPending = renderer.shadowMap.needsUpdate;
    const layers = camera.layers.mask;
    const background = scene.background;
    const alpha = renderer.getClearAlpha();
    const scissorTest = renderer.getScissorTest();
    renderer.getClearColor(this.savedColor);
    renderer.getViewport(this.savedViewport);
    renderer.getScissor(this.savedScissor);
    renderer.getCurrentViewport(this.viewport);
    // Preserve thin tentacles; the regular water capture runs at half resolution.
    const scale = Math.min(1, 2048 / this.viewport.z, 2048 / this.viewport.w);
    const width = Math.max(1, Math.floor(this.viewport.z * scale));
    const height = Math.max(1, Math.floor(this.viewport.w * scale));
    if (width !== this.target.width || height !== this.target.height) this.target.setSize(width, height);
    this.inverseProjection.copy(camera.projectionMatrixInverse);
    this.viewMatrix.copy(camera.matrixWorldInverse);
    try {
      camera.layers.set(UNDERWATER_GLOW_LAYER);
      scene.background = null;
      renderer.autoClear = true;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(this.target);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      this.scattering.update(renderer, this.colorTexture, width, height);
    } finally {
      camera.layers.mask = layers;
      scene.background = background;
      renderer.autoClear = autoClear;
      renderer.xr.enabled = xr;
      renderer.shadowMap.autoUpdate = shadows;
      renderer.shadowMap.needsUpdate = shadowsPending;
      renderer.setClearColor(this.savedColor, alpha);
      renderer.setRenderTarget(target, face, mip);
      renderer.setViewport(this.savedViewport);
      renderer.setScissor(this.savedScissor);
      renderer.setScissorTest(scissorTest);
    }
  }

  dispose(): void {
    this.target.dispose();
    this.scattering.dispose();
  }
}
