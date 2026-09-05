import type { PerspectiveCamera, WebGLRenderer } from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type {
  VisualQuality,
  VisualQualityPreference,
} from '../rendering/visualQuality';
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
import type { MenuModelLibrary } from '../menu/MenuModelLibrary';
import type { MenuSandAssets } from '../menu/MenuSandAssets';
import type { SkyPhase } from '../world/skyPalette';
import type { SurvivalRunCheckpoint } from '../survival/SurvivalCheckpoint';

export interface PhaseContext {
  mount: HTMLElement;
  renderer: WebGLRenderer;
  sceneRenderer: SceneRenderer;
  visualQuality: VisualQualityPreference;
  waterQuality: WaterQualityPreference;
  camera: PerspectiveCamera;
  maxTextureAnisotropy: number;
  audio: AudioSystem;
  onFatalError(error: unknown): void;
}

export interface MenuAssets {
  menuModels: MenuModelLibrary;
  menuSandAssets: MenuSandAssets;
}
export interface ShipPhaseAssets {
  lifeboatAssets: LifeboatAssets;
  propModels: PropModelLibrary;
  shipFurniture: ShipFurnitureLibrary;
  skyAssets: SkyAssets;
  shipAssets: ShipAssets;
  physicsRuntime: PhysicsRuntime | null;
  physicsMode: PhysicsMode;
}
export interface SurvivalAssets {
  propModels: PropModelLibrary;
  skyAssets: SkyAssets;
  lifeboatAssets: LifeboatAssets;
}
export interface MenuPhaseContext extends PhaseContext, MenuAssets {}
export interface ShipPhaseContext extends PhaseContext, ShipPhaseAssets {}
export interface SurvivalPhaseContext extends PhaseContext, SurvivalAssets {}

export interface GamePhase {
  start(): void;
  update(time: number, deltaSeconds: number): void;
  resize(width: number, height: number): void;
  render(): void;
  setOverlayActive?(active: boolean): void;
  setVisualQuality?(value: VisualQuality): void;
  setVolumetricCloudsEnabled?(enabled: boolean): void;
  getVolumetricCloudsAvailable?(): boolean;
  setWaterQuality?(value: WaterQuality): void;
  setWeatherOverride?(id: PresentationWeatherId | null): void;
  getPresentationWeather?(): PresentationWeatherId;
  setTimeOfDayOverride?(phase: SkyPhase | null): void;
  getPresentationPhase?(): SkyPhase;
  getSurvivalCheckpoint?(): SurvivalRunCheckpoint | null;
  dispose(): void;
}
