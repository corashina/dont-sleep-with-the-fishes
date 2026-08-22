import { Camera, Scene, type WebGLRenderer } from 'three';
import type { WeatherId } from '../survival/survivalTypes';
import type { PostProcessingControls } from './postProcessingControls';
import type { VisualQuality } from './visualQuality';
import type { AntiAliasingQuality } from './antiAliasingQuality';
import {
  applyShadowQuality,
  refreshSceneShadowMaterials,
  type ShadowQuality,
} from './shadowQuality';

export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
}

export interface MenuVisualState {
  kind: 'menu';
  elapsedSeconds: number;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
}

export type SceneVisualState =
  | MenuVisualState
  | ScavengeVisualState
  | SurvivalVisualState;

export interface SceneRenderer {
  readonly postProcessingControls?: PostProcessingControls;
  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void;
  resize(width: number, height: number, pixelRatio: number): void;
  setAntiAliasingQuality?(value: AntiAliasingQuality): void;
  setShadowQuality?(value: ShadowQuality): void;
  setVisualQuality?(value: VisualQuality): void;
  dispose(): void;
}

export class DirectSceneRenderer implements SceneRenderer {
  private disposed = false;
  private shadowMaterialsNeedUpdate = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    shadowQuality: ShadowQuality = 'low',
  ) {
    applyShadowQuality(renderer, shadowQuality);
  }

  render(scene: Scene, camera: Camera, _state?: Readonly<SceneVisualState>): void {
    if (this.disposed) return;
    if (this.shadowMaterialsNeedUpdate) {
      refreshSceneShadowMaterials(scene);
      this.shadowMaterialsNeedUpdate = false;
    }
    this.renderer.render(scene, camera);
  }

  resize(_width?: number, _height?: number, _pixelRatio?: number): void {}

  setAntiAliasingQuality(_value?: AntiAliasingQuality): void {}

  setShadowQuality(value: ShadowQuality): void {
    if (this.disposed || !applyShadowQuality(this.renderer, value)) return;
    this.shadowMaterialsNeedUpdate = true;
  }

  setVisualQuality(_value?: VisualQuality): void {}

  dispose(): void {
    this.disposed = true;
  }
}
