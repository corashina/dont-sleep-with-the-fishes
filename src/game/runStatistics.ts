export interface SurvivalReading {
  readonly day: number;
  readonly health: number;
  readonly hunger: number;
  readonly hull: number;
}

export interface ScavengeReading {
  readonly seconds: number;
  readonly savedCount: number;
}
