import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { VisualQualityPreference } from '../rendering/visualQuality';
import type {
  WaterQuality,
  WaterQualityPreference,
} from '../rendering/waterQuality';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';
import type { LifeboatAssets } from '../world/LifeboatAssets';
import type { ShipAssets } from '../world/ShipAssets';
import type { PhysicsRuntime } from '../physics/PhysicsRuntime';
import type { PhysicsMode } from '../physics/PhysicsOptions';
import type { PresentationWeatherId } from '../weather/presentationWeather';
import type { AudioSystem } from '../audio/AudioSystem';
import type { SurvivalEventModels } from '../survival/SurvivalEventModelLibrary';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  sceneRenderer: SceneRenderer;
  visualQuality: VisualQualityPreference;
  waterQuality: WaterQualityPreference;
  camera: PerspectiveCamera;
  propModels: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  maxTextureAnisotropy: number;
  skyAssets: SkyAssets;
  lifeboatAssets: LifeboatAssets;
  shipAssets: ShipAssets;
  physicsRuntime: PhysicsRuntime | null;
  physicsMode: PhysicsMode;
  audio: AudioSystem;
  eventModels: SurvivalEventModels;
}

export interface GamePhase {
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  setOverlayActive?(active: boolean): void;
  setWaterQuality?(value: WaterQuality): void;
  setWeatherOverride?(id: PresentationWeatherId | null): void;
  getPresentationWeather?(): PresentationWeatherId;
  dispose(): void;
}
