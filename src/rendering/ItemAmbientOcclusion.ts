import {
  Camera,
  Mesh,
  PerspectiveCamera,
  Scene,
  type Object3D,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import type { VisualQuality } from './visualQuality';

export const ITEM_AMBIENT_OCCLUSION_LAYER = 1;
export const ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY = 1;
export const ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS = 0.5;

export type ItemAmbientOcclusionMode = 'composite' | 'debug' | 'off';

export const ITEM_AMBIENT_OCCLUSION_QUALITY = {
  low: {
    resolutionScale: 0.4,
    gtaoSamples: 6,
    denoiseRings: 1,
    denoiseSamples: 4,
  },
  high: {
    resolutionScale: 1,
    gtaoSamples: 16,
    denoiseRings: 2,
    denoiseSamples: 16,
  },
} as const;

function hasTransparentMaterial(mesh: Mesh): boolean {
  if (Array.isArray(mesh.material)) {
    return mesh.material.some((material) => material.transparent);
  }
  return mesh.material.transparent;
}

export function enableItemAmbientOcclusion(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || hasTransparentMaterial(object)) return;
    object.layers.enable(ITEM_AMBIENT_OCCLUSION_LAYER);
  });
}

export function enableItemAmbientOcclusionOccluder(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || hasTransparentMaterial(object)) return;
    object.layers.enable(ITEM_AMBIENT_OCCLUSION_LAYER);
  });
}

export class ItemAmbientOcclusionPass extends GTAOPass {
  private visualQuality: VisualQuality;
  private fullWidth = 1;
  private fullHeight = 1;

  constructor(
    mode: ItemAmbientOcclusionMode = 'composite',
    quality: VisualQuality = 'low',
  ) {
    super(new Scene(), new PerspectiveCamera());
    this.visualQuality = quality;
    this.blendIntensity = ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY;
    this.updateGtaoMaterial({
      radius: ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
      distanceExponent: 1.3,
      thickness: 0.3,
      distanceFallOff: 1,
      scale: 1,
      screenSpaceRadius: true,
    });
    this.applyVisualQuality();
    this.setMode(mode);
  }

  setVisualQuality(value: VisualQuality): void {
    if (value === this.visualQuality) return;
    this.visualQuality = value;
    this.applyVisualQuality();
    this.resizeInternalTargets();
  }

  setIntensity(value: number): void {
    if (!Number.isFinite(value)) return;
    this.blendIntensity = Math.min(1, Math.max(0, value));
  }

  setRadius(value: number): void {
    if (!Number.isFinite(value)) return;
    this.updateGtaoMaterial({
      radius: Math.min(0.5, Math.max(0.05, value)),
    });
  }

  override setSize(width: number, height: number): void {
    this.fullWidth = width;
    this.fullHeight = height;
    this.resizeInternalTargets();
  }

  setMode(mode: ItemAmbientOcclusionMode): void {
    this.enabled = mode !== 'off';
    this.output = mode === 'debug'
      ? GTAOPass.OUTPUT.AO
      : GTAOPass.OUTPUT.Default;
  }

  setContext(scene: Scene, camera: Camera): void {
    this.scene = scene;
    this.camera = camera;
    const perspectiveCamera = camera instanceof PerspectiveCamera ? 1 : 0;
    if (this.gtaoMaterial.defines.PERSPECTIVE_CAMERA !== perspectiveCamera) {
      this.gtaoMaterial.defines.PERSPECTIVE_CAMERA = perspectiveCamera;
      this.gtaoMaterial.needsUpdate = true;
    }
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const originalCameraLayerMask = this.camera.layers.mask;
    this.camera.layers.set(ITEM_AMBIENT_OCCLUSION_LAYER);
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      this.camera.layers.mask = originalCameraLayerMask;
    }
  }

  private applyVisualQuality(): void {
    const quality = ITEM_AMBIENT_OCCLUSION_QUALITY[this.visualQuality];
    this.updateGtaoMaterial({ samples: quality.gtaoSamples });
    this.updatePdMaterial({
      radius: 4,
      radiusExponent: 2,
      rings: quality.denoiseRings,
      samples: quality.denoiseSamples,
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
    });
  }

  private resizeInternalTargets(): void {
    const scale = ITEM_AMBIENT_OCCLUSION_QUALITY[this.visualQuality].resolutionScale;
    super.setSize(
      Math.max(1, Math.floor(this.fullWidth * scale)),
      Math.max(1, Math.floor(this.fullHeight * scale)),
    );
  }
}
