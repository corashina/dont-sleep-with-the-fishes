import { Camera, Scene, type WebGLRenderer } from 'three';
import type { WeatherId } from '../survival/survivalTypes';
import type { VisualQuality } from './visualQuality';

export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
}

export type SceneVisualState = ScavengeVisualState | SurvivalVisualState;

export interface SceneRenderer {
  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void;
  resize(width: number, height: number, pixelRatio: number): void;
  setVisualQuality?(value: VisualQuality): void;
  dispose(): void;
}

export class DirectSceneRenderer implements SceneRenderer {
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {}

  render(scene: Scene, camera: Camera, _state?: Readonly<SceneVisualState>): void {
    if (!this.disposed) this.renderer.render(scene, camera);
  }

  resize(_width?: number, _height?: number, _pixelRatio?: number): void {}

  setVisualQuality(_value?: VisualQuality): void {}

  dispose(): void {
    this.disposed = true;
  }
}
