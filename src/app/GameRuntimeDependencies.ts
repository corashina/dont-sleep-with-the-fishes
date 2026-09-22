import type { Clock, PerspectiveCamera, WebGLRenderer } from 'three';
import type { GameFactories } from '../Game';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { AntiAliasingQualityPreference } from '../rendering/antiAliasingQuality';
import type { ShadowQualityPreference } from '../rendering/shadowQuality';
import type { VisualQualityPreference } from '../rendering/visualQuality';
import type { WaterQuality, WaterQualityPreference } from '../rendering/waterQuality';
import type { SystemTuningPreference } from '../ui/systemTuningPreference';
import type { SurvivalSaveStorage } from '../browser/SurvivalSaveStore';
import type { PhaseResourceSource } from './PhaseResources';
import type { BrowserPlaytestStartup } from './BrowserPlaytest';

export interface GameRuntimeDependencies {
  readonly mount: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly sceneRenderer: SceneRenderer;
  readonly antiAliasingQuality: AntiAliasingQualityPreference;
  readonly shadowQuality: ShadowQualityPreference;
  readonly visualQuality: VisualQualityPreference;
  readonly createWaterQuality: (apply: (value: WaterQuality) => void) => WaterQualityPreference;
  readonly systemTuning: SystemTuningPreference;
  readonly camera: PerspectiveCamera;
  readonly clock: Pick<Clock, 'start' | 'getDelta'>;
  readonly resources: PhaseResourceSource;
  readonly saveStorage: SurvivalSaveStorage | null;
  readonly factories: GameFactories;
  readonly createSeed: () => number;
  readonly onFatalError: (error: unknown) => void;
  readonly browserPlaytest: BrowserPlaytestStartup | null;
}
