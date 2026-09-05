export interface PerformanceStatsControls {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
}

export interface AudioControls {
  readonly volume: number;
  setVolume(volume: number): void;
}

export interface CameraControls {
  readonly fieldOfView: number;
  setFieldOfView(fieldOfView: number): void;
}

export interface SaveControls {
  readonly enabled: boolean;
  readonly savedDay: number | null;
  setEnabled(enabled: boolean): void;
  continueSavedRun(): void;
}

export interface VolumetricCloudControls {
  readonly enabled: boolean;
  readonly available: boolean;
  setEnabled(enabled: boolean): void;
}
