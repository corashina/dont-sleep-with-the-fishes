import {
  PCFShadowMap,
  PCFSoftShadowMap,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three';
import {
  browserStorage,
  createStoredPreference,
  type PreferenceStorage,
  type StoredPreference,
} from '../browser/storage';

export type ShadowQuality = 'low' | 'high';

export const DEFAULT_SHADOW_QUALITY: ShadowQuality = 'high';
export const SHADOW_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.shadow-quality';

export interface ShadowQualityPreference
  extends StoredPreference<ShadowQuality> {}

export function parseShadowQuality(value: unknown): ShadowQuality {
  return value === 'low' || value === 'high' ? value : DEFAULT_SHADOW_QUALITY;
}

export function applyShadowQuality(
  renderer: WebGLRenderer,
  quality: ShadowQuality,
): boolean {
  const type = quality === 'high' ? PCFSoftShadowMap : PCFShadowMap;
  if (renderer.shadowMap.type === type) return false;
  renderer.shadowMap.type = type;
  return true;
}

export function refreshSceneShadowMaterials(scene: Scene): void {
  scene.traverse((object) => {
    const material = (object as { material?: Material | readonly Material[] })
      .material;
    if (material === undefined) return;
    if (Array.isArray(material)) {
      material.forEach((item) => {
        item.needsUpdate = true;
      });
      return;
    }
    (material as Material).needsUpdate = true;
  });
}

export function createShadowQualityPreference(
  apply: (value: ShadowQuality) => void = () => undefined,
  storage: PreferenceStorage | null = browserStorage(),
): ShadowQualityPreference {
  return createStoredPreference(
    DEFAULT_SHADOW_QUALITY,
    SHADOW_QUALITY_STORAGE_KEY,
    parseShadowQuality,
    apply,
    storage,
  );
}
