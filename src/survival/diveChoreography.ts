export const DIVE_SEAT_END_SECONDS = 1.1;
export const DIVE_GOGGLES_END_SECONDS = 2.2;
export const DIVE_IMPACT_SECONDS = 3.6;
export const DIVE_ENTRY_DURATION_SECONDS = 5.8;
export const DIVE_SEAT_CAMERA_X = 1.66;
export const DIVE_OUTWARD_DISTANCE = 1.05;

export interface DivePose {
  elapsed: number;
  cameraX: number;
  cameraOutward: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  entryProgress: number;
  goggleLift: number;
  goggleSettle: number;
  waterCoverage: number;
  bubbleStrength: number;
  submerged: boolean;
}

export function createDivePose(): DivePose {
  return {
    elapsed: 0,
    cameraX: 0,
    cameraOutward: 0,
    cameraY: 0,
    cameraZ: 0,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    entryProgress: 0,
    goggleLift: 0,
    goggleSettle: 0,
    waterCoverage: 0,
    bubbleStrength: 0,
    submerged: false,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(start: number, end: number, value: number): number {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function smootherstep(start: number, end: number, value: number): number {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return progress * progress * progress
    * (progress * (progress * 6 - 15) + 10);
}

function keyedPulse(
  elapsed: number,
  start: number,
  peak: number,
  end: number,
): number {
  return elapsed <= peak
    ? smoothstep(start, peak, elapsed)
    : 1 - smoothstep(peak, end, elapsed);
}

export function sampleDivePose(elapsedSeconds: number, output: DivePose): DivePose {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? clamp(elapsedSeconds, 0, DIVE_ENTRY_DURATION_SECONDS)
    : 0;
  const seatProgress = smootherstep(0, DIVE_SEAT_END_SECONDS, elapsed);
  const goggleProgress = smoothstep(
    DIVE_SEAT_END_SECONDS,
    DIVE_GOGGLES_END_SECONDS,
    elapsed,
  );
  const impactProgress = smoothstep(
    DIVE_GOGGLES_END_SECONDS,
    DIVE_IMPACT_SECONDS,
    elapsed,
  );
  const underwaterProgress = smoothstep(
    DIVE_IMPACT_SECONDS,
    5,
    elapsed,
  );
  const rollAnticipation = keyedPulse(elapsed, 1.95, 2.1, 2.28);
  const impactJolt = keyedPulse(elapsed, 3.52, DIVE_IMPACT_SECONDS, 3.84);
  const submerged = elapsed >= DIVE_IMPACT_SECONDS;

  output.elapsed = elapsed;
  output.cameraX = DIVE_SEAT_CAMERA_X * seatProgress;
  output.cameraOutward = DIVE_OUTWARD_DISTANCE * impactProgress;
  output.cameraY = -0.16 * impactProgress - 0.72 * underwaterProgress;
  output.cameraZ = -0.18 * impactProgress - 0.44 * underwaterProgress;
  output.cameraYaw = 0.12 * impactProgress;
  output.cameraPitch = -2.58 * impactProgress;
  output.cameraRoll = 0.07 * impactProgress
    - 0.035 * rollAnticipation
    + 0.02 * impactJolt;
  output.entryProgress = impactProgress;
  output.goggleLift = goggleProgress;
  output.goggleSettle = goggleProgress;
  output.waterCoverage = submerged ? 1 : 0;
  output.bubbleStrength = underwaterProgress;
  output.submerged = submerged;

  return output;
}
