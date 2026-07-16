import type { Camera, Scene, WebGLRenderer } from 'three';
import type { WeatherId } from '../survival/survivalTypes';

export interface ScavengeVisualState {
  kind: 'scavenge';
  elapsedSeconds: number;
  sinkingProgress: number;
  reducedMotion: boolean;
}

export interface SurvivalVisualState {
  kind: 'survival';
  elapsedSeconds: number;
  phase: 'day' | 'night';
  weather: WeatherId;
  reducedMotion: boolean;
}

export type SceneVisualState = ScavengeVisualState | SurvivalVisualState;

export interface SceneRenderer {
  render(scene: Scene, camera: Camera, state: Readonly<SceneVisualState>): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export class DirectSceneRenderer implements SceneRenderer {
  private disposed = false;

  constructor(private readonly renderer: WebGLRenderer) {}

  render(scene: Scene, camera: Camera): void {
    if (this.disposed) return;
    this.renderer.render(scene, camera);
  }

  resize(_width: number, _height: number, _pixelRatio: number): void {}

  dispose(): void {
    this.disposed = true;
  }
}
