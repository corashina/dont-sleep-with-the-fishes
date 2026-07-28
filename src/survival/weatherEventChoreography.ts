export type WeatherAnimationEventId =
  | 'shower-night'
  | 'windy-night'
  | 'thunderstorm'
  | 'restless-waves'
  | 'man-in-the-fog';

export interface WeatherRevealSample {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  supplyRoll: number;
  supplyLift: number;
  figureVisibility: number;
  figureDistance: number;
  lightningEmphasis: number;
}

export interface WeatherItemSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  effect: number;
}

const REVEAL_DURATIONS: Readonly<Record<WeatherAnimationEventId, number>> = Object.freeze({
  'shower-night': 3.4,
  'windy-night': 3.6,
  thunderstorm: 4.0,
  'restless-waves': 3.8,
  'man-in-the-fog': 4.2,
});

const ITEM_DURATIONS: Readonly<Record<WeatherAnimationEventId, Readonly<Record<string, number>>>> = Object.freeze({
  'shower-night': Object.freeze({ bucket: 1.35, umbrella: 1.5, map: 1.4 }),
  'windy-night': Object.freeze({ fishingNet: 1.6, map: 1.45, umbrella: 1.55 }),
  thunderstorm: Object.freeze({ anchor: 1.8, bucket: 1.4, umbrella: 1.55 }),
  'restless-waves': Object.freeze({ anchor: 1.75, swimRing: 1.3 }),
  'man-in-the-fog': Object.freeze({ compass: 1.2, spyglass: 1.45, flashlight: 1.35 }),
});

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function pulse(progress: number, start: number, peak: number, end: number): number {
  if (progress <= start || progress >= end) return 0;
  return progress < peak
    ? smoothstep((progress - start) / (peak - start))
    : 1 - smoothstep((progress - peak) / (end - peak));
}

function resetReveal(output: WeatherRevealSample): void {
  output.cameraX = 0;
  output.cameraY = 0;
  output.cameraZ = 0;
  output.cameraYaw = 0;
  output.cameraPitch = 0;
  output.cameraRoll = 0;
  output.supplyRoll = 0;
  output.supplyLift = 0;
  output.figureVisibility = 0;
  output.figureDistance = 0;
  output.lightningEmphasis = 0;
}

function resetItem(output: WeatherItemSample): void {
  output.x = 0;
  output.y = 0;
  output.z = 0;
  output.yaw = 0;
  output.pitch = 0;
  output.roll = 0;
  output.scaleX = 1;
  output.scaleY = 1;
  output.scaleZ = 1;
  output.effect = 0;
}

function isWeatherEventId(eventId: string): eventId is WeatherAnimationEventId {
  return Object.hasOwn(REVEAL_DURATIONS, eventId);
}

export function weatherRevealDuration(eventId: string): number | null {
  return isWeatherEventId(eventId) ? REVEAL_DURATIONS[eventId] : null;
}

export function sampleWeatherReveal(
  eventId: string,
  progress: number,
  output: WeatherRevealSample,
): boolean {
  resetReveal(output);
  if (!isWeatherEventId(eventId)) return false;

  const t = clamp01(progress);
  if (t === 1) return true;
  const sweep = Math.sin(Math.PI * t);

  switch (eventId) {
    case 'shower-night':
      output.cameraY = 0.12 * sweep;
      output.cameraYaw = 0.32 * Math.sin(Math.PI * (t - 0.08));
      output.cameraPitch = -0.08 * pulse(t, 0.08, 0.34, 0.7);
      output.supplyLift = 0.06 * pulse(t, 0.18, 0.48, 0.82);
      break;
    case 'windy-night':
      output.cameraX = 0.18 * Math.sin(Math.PI * (t - 0.05));
      output.cameraYaw = 0.44 * Math.sin(Math.PI * (t - 0.12));
      output.cameraRoll = 0.07 * Math.sin(3 * Math.PI * t) * sweep;
      output.supplyRoll = 0.19 * Math.sin(4 * Math.PI * t) * sweep;
      output.supplyLift = 0.1 * pulse(t, 0.28, 0.52, 0.78);
      break;
    case 'thunderstorm':
      output.cameraY = 0.15 * Math.sin(2 * Math.PI * t) * sweep;
      output.cameraYaw = 0.38 * Math.sin(Math.PI * (t - 0.16));
      output.cameraPitch = -0.13 * pulse(t, 0.16, 0.52, 0.84);
      output.cameraRoll = 0.1 * Math.sin(3 * Math.PI * t) * sweep;
      output.supplyRoll = 0.16 * Math.sin(3 * Math.PI * t) * sweep;
      output.lightningEmphasis = pulse(t, 0.44, 0.55, 0.68);
      break;
    case 'restless-waves':
      output.cameraX = 0.14 * Math.sin(2 * Math.PI * t) * sweep;
      output.cameraY = 0.2 * Math.sin(3 * Math.PI * t) * sweep;
      output.cameraYaw = 0.28 * Math.sin(Math.PI * (t - 0.14));
      output.cameraRoll = 0.16 * Math.sin(2 * Math.PI * t) * sweep;
      output.supplyRoll = 0.24 * Math.sin(3 * Math.PI * t) * sweep;
      output.supplyLift = 0.13 * pulse(t, 0.16, 0.52, 0.84);
      break;
    case 'man-in-the-fog':
      output.cameraX = 0.1 * Math.sin(Math.PI * (t - 0.1));
      output.cameraYaw = 0.35 * Math.sin(Math.PI * (t - 0.18));
      output.cameraPitch = -0.06 * pulse(t, 0.16, 0.54, 0.82);
      output.figureVisibility = pulse(t, 0.38, 0.55, 0.78);
      output.figureDistance = output.figureVisibility * (1 - 0.35 * smoothstep((t - 0.38) / 0.4));
      break;
  }

  return true;
}

export function weatherItemUseDuration(eventId: string, choiceId: string): number | null {
  if (!isWeatherEventId(eventId)) return null;
  return ITEM_DURATIONS[eventId][choiceId] ?? null;
}

export function sampleWeatherItemUse(
  eventId: string,
  choiceId: string,
  progress: number,
  output: WeatherItemSample,
): boolean {
  resetItem(output);
  if (weatherItemUseDuration(eventId, choiceId) === null) return false;

  const t = clamp01(progress);
  if (t === 1) return true;
  const up = smoothstep(Math.min(1, t / 0.42));
  const down = 1 - smoothstep(Math.max(0, (t - 0.58) / 0.42));
  const hold = Math.min(up, down);

  switch (choiceId) {
    case 'bucket':
      output.y = 0.38 * hold;
      output.pitch = -0.34 * hold;
      output.roll = 0.15 * hold;
      output.effect = hold;
      break;
    case 'umbrella':
      output.y = 0.62 * hold;
      output.pitch = -0.12 * hold;
      output.roll = -0.18 * hold;
      output.scaleX = 1 + 0.12 * hold;
      output.scaleZ = 1 + 0.12 * hold;
      output.effect = hold;
      break;
    case 'map':
      if (eventId === 'windy-night') {
        output.x = -0.72 * smoothstep(t / 0.7);
        output.y = 0.2 * pulse(t, 0.06, 0.38, 0.92);
        output.yaw = 0.7 * smoothstep(t / 0.7);
        output.roll = -0.35 * smoothstep(t / 0.7);
        output.effect = pulse(t, 0.06, 0.38, 0.92);
      } else {
        output.y = 0.56 * hold;
        output.pitch = -0.2 * hold;
        output.scaleX = 1 + 0.16 * hold;
        output.scaleZ = 1 + 0.16 * hold;
        output.effect = hold;
      }
      break;
    case 'fishingNet':
      output.x = 0.34 * hold;
      output.y = 0.28 * hold;
      output.yaw = 0.48 * hold;
      output.roll = 0.28 * Math.sin(Math.PI * t) * hold;
      output.effect = hold;
      break;
    case 'anchor':
      output.y = -0.9 * smoothstep((t - 0.2) / 0.7);
      output.z = -0.5 * smoothstep((t - 0.2) / 0.7);
      output.pitch = 0.45 * smoothstep((t - 0.2) / 0.7);
      output.effect = smoothstep((t - 0.16) / 0.72);
      break;
    case 'swimRing':
      output.y = -0.24 * pulse(t, 0.1, 0.46, 0.86);
      output.z = -0.18 * pulse(t, 0.1, 0.46, 0.86);
      output.pitch = 0.28 * pulse(t, 0.1, 0.46, 0.86);
      output.scaleY = 1 - 0.18 * pulse(t, 0.1, 0.46, 0.86);
      output.effect = pulse(t, 0.1, 0.46, 0.86);
      break;
    case 'compass':
      output.y = 0.45 * hold;
      output.z = -0.28 * hold;
      output.pitch = -0.18 * hold;
      output.scaleX = 1 + 0.2 * hold;
      output.scaleY = 1 + 0.2 * hold;
      output.scaleZ = 1 + 0.2 * hold;
      output.effect = hold;
      break;
    case 'spyglass':
      output.y = 0.38 * hold;
      output.z = -0.52 * hold;
      output.pitch = -0.1 * hold;
      output.scaleX = 1 + 0.24 * hold;
      output.scaleY = 1 + 0.24 * hold;
      output.scaleZ = 1 + 0.24 * hold;
      output.effect = hold;
      break;
    case 'flashlight':
      output.y = 0.3 * hold;
      output.yaw = -0.7 + 1.4 * smoothstep(t / 0.85);
      output.pitch = -0.2 * hold;
      output.effect = pulse(t, 0.1, 0.5, 0.95);
      break;
  }

  return true;
}
