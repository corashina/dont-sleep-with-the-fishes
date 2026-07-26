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

export const ITEM_AMBIENT_OCCLUSION_LAYER = 1;
export const ITEM_AMBIENT_OCCLUSION_HOTKEY = 'KeyO';

export type ItemAmbientOcclusionMode = 'composite' | 'debug' | 'off';

export function nextItemAmbientOcclusionMode(
  mode: ItemAmbientOcclusionMode,
): ItemAmbientOcclusionMode {
  if (mode === 'composite') return 'debug';
  if (mode === 'debug') return 'off';
  return 'composite';
}

export function resolveItemAmbientOcclusionMode(search: string): ItemAmbientOcclusionMode {
  const requested = new URLSearchParams(search).get('ao');
  if (requested === 'debug' || requested === 'off') return requested;
  return 'composite';
}

export function enableItemAmbientOcclusion(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Mesh) object.layers.enable(ITEM_AMBIENT_OCCLUSION_LAYER);
  });
}

export function enableItemAmbientOcclusionOccluder(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material.transparent)) return;
    object.layers.enable(ITEM_AMBIENT_OCCLUSION_LAYER);
  });
}

export class ItemAmbientOcclusionPass extends GTAOPass {
  constructor(mode: ItemAmbientOcclusionMode = 'composite') {
    super(new Scene(), new PerspectiveCamera());
    this.blendIntensity = 0.65;
    this.updateGtaoMaterial({
      radius: 0.24,
      distanceExponent: 1.3,
      thickness: 0.3,
      distanceFallOff: 1,
      scale: 1,
      samples: 16,
      screenSpaceRadius: true,
    });
    this.updatePdMaterial({
      radius: 4,
      radiusExponent: 2,
      rings: 2,
      samples: 16,
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
    });
    this.setMode(mode);
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
}
