import { clamp01, smootherStep } from './easing';

export interface ShipDangerState {
  progress: number;
  smokeDensity: number;
  waterFlow: number;
  alarmRate: number;
  alarmPulse: number;
}

export interface ShipAlarmPhase {
  startElapsedSeconds: number;
  elapsedAt(elapsedSeconds: number): number;
}

function keyedAlarmPulse(cycle: number): number {
  if (cycle < 0.1) return 1 - cycle / 0.1;
  if (cycle >= 0.18 && cycle < 0.28) return 0.72 * (1 - (cycle - 0.18) / 0.1);
  return 0;
}

export function createShipDangerState(): ShipDangerState {
  return {
    progress: 0,
    smokeDensity: 1,
    waterFlow: 1,
    alarmRate: 0.7,
    alarmPulse: 1,
  };
}

export function createShipAlarmPhase(): ShipAlarmPhase {
  return {
    startElapsedSeconds: 0,
    elapsedAt(elapsedSeconds: number): number {
      const safeElapsed = Number.isFinite(elapsedSeconds)
        ? Math.max(0, elapsedSeconds)
        : 0;
      return Math.max(0, safeElapsed - this.startElapsedSeconds);
    },
  };
}

export function resetShipAlarmPhase(
  phase: ShipAlarmPhase,
  elapsedSeconds: number,
): void {
  phase.startElapsedSeconds = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
}

export function sampleShipDangerStateInto(
  output: ShipDangerState,
  elapsedSeconds: number,
  durationSeconds: number,
  alarmElapsedSeconds: number,
): ShipDangerState {
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const safeAlarmElapsed = Number.isFinite(alarmElapsedSeconds)
    ? Math.max(0, alarmElapsedSeconds)
    : 0;
  const raw = durationSeconds > 0 && Number.isFinite(durationSeconds)
    ? safeElapsed / durationSeconds
    : 1;
  const progress = clamp01(raw);
  const finalRush = smootherStep(clamp01((progress - 0.65) / 0.35));
  const alarmRate = 0.7 + 1.3 * finalRush;
  const alarmCycle = (safeAlarmElapsed * alarmRate) % 1;
  output.progress = progress;
  output.smokeDensity = 1 + 0.35 * finalRush;
  output.waterFlow = 1 + 0.3 * finalRush;
  output.alarmRate = alarmRate;
  output.alarmPulse = keyedAlarmPulse(alarmCycle);
  return output;
}
