import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { PropModelLibrary } from '../world/PropModelLibrary';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  reducedMotion: MediaQueryList;
  propModels: PropModelLibrary;
}

export interface GamePhase {
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}
