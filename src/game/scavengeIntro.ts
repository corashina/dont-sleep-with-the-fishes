export const SCAVENGE_INTRO_DURATION_SECONDS = 10;
export const SCAVENGE_INTRO_CRASH_SECONDS = 6;

export interface ScavengeIntroAnchors {
  readonly seatedPosition: readonly [number, number, number];
  readonly standingPosition: readonly [number, number, number];
  readonly ladderBottomPosition: readonly [number, number, number];
  readonly exitPosition: readonly [number, number, number];
}

export interface ScavengeIntroFrame {
  cameraPosition: [number, number, number];
  cameraYaw: number;
  cameraPitch: number;
  impactY: number;
  impactPitch: number;
  impactRoll: number;
  debrisActive: boolean;
  complete: boolean;
}

const VIEW_KEYS = [
  [0, Math.PI, 0],
  [1, Math.PI, 0],
  [3.5, Math.PI + 0.65, 0],
  [6, Math.PI - 0.65, 0],
  [7.2, 0, -1.05],
  [7.5, Math.PI, -0.35],
  [9.5, Math.PI, -0.15],
  [10, Math.PI, 0],
] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function copyPosition(
  output: [number, number, number],
  source: readonly [number, number, number],
): void {
  output[0] = source[0];
  output[1] = source[1];
  output[2] = source[2];
}

function interpolatePosition(
  output: [number, number, number],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  progress: number,
): void {
  if (progress >= 1) {
    copyPosition(output, end);
    return;
  }
  const t = smooth(progress);
  output[0] = start[0] + (end[0] - start[0]) * t;
  output[1] = start[1] + (end[1] - start[1]) * t;
  output[2] = start[2] + (end[2] - start[2]) * t;
}

function sampleView(output: ScavengeIntroFrame, elapsed: number): void {
  for (let index = 1; index < VIEW_KEYS.length; index += 1) {
    const start = VIEW_KEYS[index - 1]!;
    const end = VIEW_KEYS[index]!;
    if (elapsed > end[0]) continue;
    const t = smooth((elapsed - start[0]) / (end[0] - start[0]));
    output.cameraYaw = start[1] + (end[1] - start[1]) * t;
    output.cameraPitch = start[2] + (end[2] - start[2]) * t;
    return;
  }
  output.cameraYaw = Math.PI;
  output.cameraPitch = 0;
}

export function advanceScavengeIntroElapsed(current: number, delta: number): number {
  const safeCurrent = Number.isFinite(current)
    ? Math.max(0, Math.min(SCAVENGE_INTRO_DURATION_SECONDS, current))
    : 0;
  if (!Number.isFinite(delta) || delta <= 0) return safeCurrent;
  return Math.min(SCAVENGE_INTRO_DURATION_SECONDS, safeCurrent + delta);
}

export function crossedScavengeIntroTime(
  previous: number,
  current: number,
  eventTime: number,
): boolean {
  return previous < eventTime && current >= eventTime;
}

export function createScavengeIntroFrame(): ScavengeIntroFrame {
  return {
    cameraPosition: [0, 0, 0],
    cameraYaw: Math.PI,
    cameraPitch: 0,
    impactY: 0,
    impactPitch: 0,
    impactRoll: 0,
    debrisActive: false,
    complete: false,
  };
}

export function sampleScavengeIntroFrameInto(
  output: ScavengeIntroFrame,
  elapsedSeconds: number,
  anchors: ScavengeIntroAnchors,
): ScavengeIntroFrame {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.min(SCAVENGE_INTRO_DURATION_SECONDS, elapsedSeconds))
    : 0;
  if (elapsed <= 1) {
    interpolatePosition(
      output.cameraPosition,
      anchors.seatedPosition,
      anchors.standingPosition,
      elapsed,
    );
  } else if (elapsed <= 7.5) {
    copyPosition(output.cameraPosition, anchors.standingPosition);
  } else if (elapsed <= 9.5) {
    interpolatePosition(
      output.cameraPosition, anchors.standingPosition,
      anchors.ladderBottomPosition, (elapsed - 7.5) / 2,
    );
  } else {
    interpolatePosition(
      output.cameraPosition, anchors.ladderBottomPosition,
      anchors.exitPosition, (elapsed - 9.5) / 0.5,
    );
  }
  sampleView(output, elapsed);
  const impactTime = clamp01(elapsed - SCAVENGE_INTRO_CRASH_SECONDS);
  if (impactTime >= 1) {
    output.impactY = 0;
    output.impactPitch = 0;
    output.impactRoll = 0;
  } else {
    const pulse = Math.sin(impactTime * Math.PI * 3) * (1 - impactTime);
    output.impactY = -0.08 * pulse;
    output.impactPitch = 0.045 * pulse;
    output.impactRoll = -0.07 * pulse;
  }
  output.debrisActive = elapsed >= 6 && elapsed < 7.5;
  output.complete = elapsed >= SCAVENGE_INTRO_DURATION_SECONDS;
  return output;
}
