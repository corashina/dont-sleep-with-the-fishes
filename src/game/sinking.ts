import { clamp01, smootherStep } from './easing';

export interface SinkingState {
  progress: number;
  rollRadians: number;
  pitchRadians: number;
  sinkOffset: number;
  alarmRate: number;
  waveAmplitudeScale: number;
}

export function getSinkingState(elapsedSeconds: number, durationSeconds: number): SinkingState {
  const raw = durationSeconds <= 0 ? 1 : elapsedSeconds / durationSeconds;
  const progress = clamp01(raw);
  const eased = smootherStep(progress);
  const finalRush = clamp01((progress - 0.75) / 0.25);

  return {
    progress,
    rollRadians: 0,
    pitchRadians: 0,
    sinkOffset: 0,
    alarmRate: 0.7 + 1.3 * finalRush,
    waveAmplitudeScale: 1 + 0.35 * eased,
  };
}
