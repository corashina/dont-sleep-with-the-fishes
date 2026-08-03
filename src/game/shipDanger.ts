import { clamp01, smootherStep } from './easing';

export interface ShipDangerState {
  readonly progress: number;
  readonly fireIntensity: number;
  readonly smokeDensity: number;
  readonly waterFlow: number;
  readonly alarmRate: number;
  readonly alarmPulse: number;
}

function keyedAlarmPulse(cycle: number): number {
  if (cycle < 0.1) return 1 - cycle / 0.1;
  if (cycle >= 0.18 && cycle < 0.28) return 0.72 * (1 - (cycle - 0.18) / 0.1);
  return 0;
}

export function getShipDangerState(
  elapsedSeconds: number,
  durationSeconds: number,
): ShipDangerState {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const raw = durationSeconds > 0 && Number.isFinite(durationSeconds)
    ? safeElapsed / durationSeconds
    : 1;
  const progress = clamp01(raw);
  const finalRush = smootherStep(clamp01((progress - 0.65) / 0.35));
  const alarmRate = 0.7 + 1.3 * finalRush;
  const alarmCycle = (safeElapsed * alarmRate) % 1;
  return Object.freeze({
    progress,
    fireIntensity: 1 + 0.25 * finalRush,
    smokeDensity: 1 + 0.35 * finalRush,
    waterFlow: 1 + 0.3 * finalRush,
    alarmRate,
    alarmPulse: keyedAlarmPulse(alarmCycle),
  });
}
