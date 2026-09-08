export interface PosterizationSetting {
  readonly enabled: boolean;
  readonly strength: number;
}

export const DEFAULT_POSTERIZATION: PosterizationSetting = Object.freeze({ enabled: true, strength: 0.25 });

export function normalizePosterization(value: unknown): PosterizationSetting {
  const setting = typeof value === 'object' && value !== null
    ? value as Record<string, unknown> : {};
  return Object.freeze({
    enabled: typeof setting.enabled === 'boolean' ? setting.enabled : DEFAULT_POSTERIZATION.enabled,
    strength: typeof setting.strength === 'number' && Number.isFinite(setting.strength)
      ? Math.min(1, Math.max(0, setting.strength)) : DEFAULT_POSTERIZATION.strength,
  });
}
