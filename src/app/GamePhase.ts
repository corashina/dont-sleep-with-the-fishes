import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  sceneRenderer: SceneRenderer;
  camera: PerspectiveCamera;
  reducedMotion: MediaQueryList;
  propModels: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  maxTextureAnisotropy: number;
  skyAssets: SkyAssets;
}

export interface GamePhase {
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}
