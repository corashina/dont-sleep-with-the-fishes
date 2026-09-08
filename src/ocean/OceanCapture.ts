import {
  DepthTexture,
  HalfFloatType,
  LinearSRGBColorSpace,
  Matrix4,
  PlaneGeometry,
  UnsignedIntType,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type Group,
  type Material,
  type Object3D,
  type Scene,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

const MAX_CAPTURE_SIZE = 1024;

export class OceanCapture {
  readonly colorTexture: Texture;
  readonly depthTexture: DepthTexture;
  readonly reflectionTexture: Texture;
  readonly reflectionDepthTexture: DepthTexture;
  readonly reflectionMatrix = new Matrix4();
  readonly inverseProjection = new Matrix4();
  readonly cameraWorld = new Matrix4();
  readonly viewMatrix = new Matrix4();
  readonly viewport = new Vector4();

  private readonly colorTarget: WebGLRenderTarget;
  private readonly reflector: Reflector;
  private readonly reflectorTextureMatrix: Matrix4;
  private readonly savedViewport = new Vector4();
  private readonly savedScissor = new Vector4();
  private readonly reflectorWorldInverse = new Matrix4();
  private captureWidth = 1;
  private captureHeight = 1;
  private disposed = false;

  constructor() {
    this.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.depthTexture.name = 'ocean-scene-depth';

    this.colorTarget = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });
    this.colorTarget.depthTexture = this.depthTexture;
    this.colorTexture = this.colorTarget.texture;
    this.colorTexture.name = 'ocean-scene-color';
    this.colorTexture.colorSpace = LinearSRGBColorSpace;

    const geometry = new PlaneGeometry(1, 1);
    this.reflector = new Reflector(geometry, {
      textureWidth: 1,
      textureHeight: 1,
      clipBias: 0.003,
      multisample: 0,
    });
    this.reflector.name = 'ocean-reflection-capture';
    this.reflector.rotateX(-Math.PI / 2);
    this.reflector.updateMatrixWorld(true);
    this.reflectionTexture = this.reflector.getRenderTarget().texture;
    this.reflectionDepthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.reflectionDepthTexture.name = 'ocean-reflection-depth';
    this.reflector.getRenderTarget().depthTexture = this.reflectionDepthTexture;
    this.reflectionTexture.name = 'ocean-reflection';
    this.reflectionTexture.colorSpace = LinearSRGBColorSpace;
    this.reflectorTextureMatrix = (
      this.reflector.material as ShaderMaterial
    ).uniforms.textureMatrix!.value as Matrix4;
  }

  update(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    water: Object3D,
  ): void {
    if (this.disposed) return;
    if (scene.overrideMaterial !== null) return;

    const originalTarget = renderer.getRenderTarget();
    const originalCubeFace = renderer.getActiveCubeFace();
    const originalMipmapLevel = renderer.getActiveMipmapLevel();
    renderer.getViewport(this.savedViewport);
    renderer.getScissor(this.savedScissor);
    const originalScissorTest = renderer.getScissorTest();
    const originalAutoClear = renderer.autoClear;
    const originalXrEnabled = renderer.xr.enabled;
    const originalShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const originalShadowNeedsUpdate = renderer.shadowMap.needsUpdate;
    const originalOverrideMaterial = scene.overrideMaterial;
    const originalWaterVisible = water.visible;
    const originalReflectorVisible = this.reflector.visible;
    renderer.getCurrentViewport(this.viewport);

    try {
      this.resize(originalTarget);
      camera.updateMatrixWorld();
      this.inverseProjection.copy(camera.projectionMatrixInverse);
      this.cameraWorld.copy(camera.matrixWorld);
      this.viewMatrix.copy(camera.matrixWorldInverse);
      water.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false;
      renderer.autoClear = false;

      renderer.setRenderTarget(this.colorTarget);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      this.reflector.camera.layers.mask = camera.layers.mask;
      this.reflector.visible = true;
      this.reflector.forceUpdate = true;
      this.reflector.onBeforeRender(
        renderer,
        scene,
        camera,
        this.reflector.geometry,
        this.reflector.material as Material,
        this.reflector as unknown as Group,
      );

      this.reflectorWorldInverse.copy(this.reflector.matrixWorld).invert();
      this.reflectionMatrix.copy(this.reflectorTextureMatrix)
        .multiply(this.reflectorWorldInverse);
    } finally {
      water.visible = originalWaterVisible;
      scene.overrideMaterial = originalOverrideMaterial;
      this.reflector.visible = originalReflectorVisible;
      this.reflector.forceUpdate = false;
      renderer.autoClear = originalAutoClear;
      renderer.xr.enabled = originalXrEnabled;
      renderer.shadowMap.autoUpdate = originalShadowAutoUpdate;
      renderer.shadowMap.needsUpdate = originalShadowNeedsUpdate;
      renderer.setViewport(this.savedViewport);
      renderer.setScissor(this.savedScissor);
      renderer.setScissorTest(originalScissorTest);
      renderer.setRenderTarget(originalTarget, originalCubeFace, originalMipmapLevel);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.colorTarget.dispose();
    this.reflector.dispose();
    this.reflector.geometry.dispose();
  }

  private resize(renderTarget: WebGLRenderTarget | null): void {
    const sourceWidth = renderTarget?.width ?? this.viewport.z;
    const sourceHeight = renderTarget?.height ?? this.viewport.w;
    const scale = Math.min(
      0.5,
      MAX_CAPTURE_SIZE / sourceWidth,
      MAX_CAPTURE_SIZE / sourceHeight,
    );
    const width = Math.max(1, Math.floor(sourceWidth * scale));
    const height = Math.max(1, Math.floor(sourceHeight * scale));
    if (width === this.captureWidth && height === this.captureHeight) return;

    this.captureWidth = width;
    this.captureHeight = height;
    this.colorTarget.setSize(width, height);
    this.depthTexture.image.width = width;
    this.depthTexture.image.height = height;
    this.reflector.getRenderTarget().setSize(width, height);
    this.reflectionDepthTexture.image.width = width;
    this.reflectionDepthTexture.image.height = height;
  }
}
