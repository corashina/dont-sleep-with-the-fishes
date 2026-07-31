export type WeatherAnimationEventId =
  | 'shower-night'
  | 'windy-night'
  | 'thunderstorm'
  | 'restless-waves'
  | 'man-in-the-fog';

export type WeatherItemEffectKind =
  | 'none'
  | 'shower-rain-catch'
  | 'shower-umbrella-shed'
  | 'shower-map-canopy'
  | 'wind-net-lash'
  | 'wind-map-flight'
  | 'wind-umbrella-invert'
  | 'storm-anchor-check'
  | 'storm-bucket-bail'
  | 'storm-umbrella-brace'
  | 'wave-anchor-stabilize'
  | 'wave-ring-buffer'
  | 'compass-bearing'
  | 'spyglass-optical-push'
  | 'fog-flashlight-sweep';

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
  cameraYaw: number;
  cameraPush: number;
  supplyRoll: number;
  effectKind: WeatherItemEffectKind;
}

interface WeatherItemChoreography {
  readonly duration: number;
  readonly effectKind: Exclude<WeatherItemEffectKind, 'none'>;
}

const REVEAL_DURATIONS: Readonly<Record<WeatherAnimationEventId, number>> = Object.freeze({
  'shower-night': 3.4,
  'windy-night': 3.6,
  thunderstorm: 4,
  'restless-waves': 3.8,
  'man-in-the-fog': 5.2,
});

const ITEM_CHOREOGRAPHY: Readonly<
  Record<WeatherAnimationEventId, Readonly<Record<string, WeatherItemChoreography>>>
> = Object.freeze({
  'shower-night': Object.freeze({
    bucket: Object.freeze({ duration: 1.35, effectKind: 'shower-rain-catch' }),
    umbrella: Object.freeze({ duration: 1.5, effectKind: 'shower-umbrella-shed' }),
    map: Object.freeze({ duration: 1.4, effectKind: 'shower-map-canopy' }),
  }),
  'windy-night': Object.freeze({
    fishingNet: Object.freeze({ duration: 1.6, effectKind: 'wind-net-lash' }),
    map: Object.freeze({ duration: 1.45, effectKind: 'wind-map-flight' }),
    umbrella: Object.freeze({ duration: 1.55, effectKind: 'wind-umbrella-invert' }),
  }),
  thunderstorm: Object.freeze({
    anchor: Object.freeze({ duration: 1.8, effectKind: 'storm-anchor-check' }),
    bucket: Object.freeze({ duration: 1.4, effectKind: 'storm-bucket-bail' }),
    umbrella: Object.freeze({ duration: 1.55, effectKind: 'storm-umbrella-brace' }),
  }),
  'restless-waves': Object.freeze({
    anchor: Object.freeze({ duration: 1.75, effectKind: 'wave-anchor-stabilize' }),
    swimRing: Object.freeze({ duration: 1.3, effectKind: 'wave-ring-buffer' }),
  }),
  'man-in-the-fog': Object.freeze({
    compass: Object.freeze({ duration: 1.2, effectKind: 'compass-bearing' }),
    spyglass: Object.freeze({ duration: 1.45, effectKind: 'spyglass-optical-push' }),
    flashlight: Object.freeze({ duration: 1.35, effectKind: 'fog-flashlight-sweep' }),
  }),
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
  output.cameraYaw = 0;
  output.cameraPush = 0;
  output.supplyRoll = 0;
  output.effectKind = 'none';
}

function isWeatherEventId(eventId: string): eventId is WeatherAnimationEventId {
  return Object.hasOwn(REVEAL_DURATIONS, eventId);
}

function itemChoreography(
  eventId: string,
  choiceId: string,
): WeatherItemChoreography | null {
  if (!isWeatherEventId(eventId)) return null;
  const choices = ITEM_CHOREOGRAPHY[eventId];
  return Object.hasOwn(choices, choiceId) ? choices[choiceId]! : null;
}

function multiplyReveal(output: WeatherRevealSample, envelope: number): void {
  output.cameraX *= envelope;
  output.cameraY *= envelope;
  output.cameraZ *= envelope;
  output.cameraYaw *= envelope;
  output.cameraPitch *= envelope;
  output.cameraRoll *= envelope;
  output.supplyRoll *= envelope;
  output.supplyLift *= envelope;
  output.figureVisibility *= envelope;
  output.figureDistance *= envelope;
  output.lightningEmphasis *= envelope;
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
  if (t === 0 || t === 1) return true;
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
    case 'restless-waves': {
      const riseCarrier = (
        Math.sin(Math.PI * t)
        + 0.72 * Math.sin(3 * Math.PI * t)
        + 0.38 * Math.sin(5 * Math.PI * t)
      );
      output.cameraX = 0.14 * Math.sin(2 * Math.PI * t) * sweep;
      output.cameraY = 0.18 * riseCarrier * Math.sin(3 * Math.PI * t);
      output.cameraYaw = 0.28 * Math.sin(Math.PI * (t - 0.14));
      output.cameraRoll = 0.15 * Math.sin(2 * Math.PI * t);
      break;
    }
    case 'man-in-the-fog':
      output.cameraX = 0.1 * Math.sin(Math.PI * (t - 0.1));
      output.cameraYaw = 0.35 * Math.sin(Math.PI * (t - 0.18));
      output.cameraPitch = -0.06 * pulse(t, 0.16, 0.54, 0.82);
      output.figureVisibility = smoothstep((t - 0.2) / 0.18)
        * (1 - smoothstep((t - 0.84) / 0.12));
      output.figureDistance = 0;
      break;
  }

  const ingressEnvelope = smoothstep(t / 0.12);
  const returnEnvelope = 1 - smoothstep(
    (t - (eventId === 'man-in-the-fog' ? 0.9 : 0.72))
      / (eventId === 'man-in-the-fog' ? 0.1 : 0.28),
  );
  multiplyReveal(output, ingressEnvelope * returnEnvelope);
  return true;
}

export function weatherItemUseDuration(eventId: string, choiceId: string): number | null {
  return itemChoreography(eventId, choiceId)?.duration ?? null;
}

export function sampleWeatherItemUse(
  eventId: string,
  choiceId: string,
  progress: number,
  output: WeatherItemSample,
): boolean {
  resetItem(output);
  const choreography = itemChoreography(eventId, choiceId);
  if (choreography === null) return false;

  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  output.effectKind = choreography.effectKind;
  const up = smoothstep(t / 0.34);
  const down = 1 - smoothstep((t - 0.66) / 0.34);
  const hold = Math.min(up, down);
  const impact = pulse(t, 0.28, 0.56, 0.84);

  switch (eventId) {
    case 'shower-night':
      switch (choiceId) {
        case 'bucket':
          output.y = 0.42 * hold;
          output.x = -0.12 * impact;
          output.pitch = -0.48 * pulse(t, 0.3, 0.62, 0.9);
          output.roll = 0.14 * hold;
          output.effect = pulse(t, 0.08, 0.4, 0.72);
          break;
        case 'umbrella':
          output.y = 0.66 * hold;
          output.pitch = -0.1 * hold;
          output.roll = -0.2 * hold + 0.08 * impact;
          output.scaleX = 1 + 0.13 * hold;
          output.scaleZ = 1 + 0.13 * hold;
          output.effect = pulse(t, 0.22, 0.58, 0.88);
          break;
        case 'map':
          output.y = 0.54 * hold;
          output.pitch = -0.24 * hold;
          output.roll = 0.1 * impact;
          output.scaleX = 1 + 0.18 * hold;
          output.scaleY = 1 - 0.1 * impact;
          output.scaleZ = 1 + 0.12 * hold;
          output.effect = impact;
          break;
      }
      break;
    case 'windy-night':
      switch (choiceId) {
        case 'fishingNet':
          output.x = 0.36 * hold;
          output.y = 0.3 * hold;
          output.yaw = 0.5 * hold;
          output.roll = 0.3 * Math.sin(Math.PI * t) * hold;
          output.scaleX = 1 + 0.22 * hold;
          output.scaleZ = 1 + 0.16 * hold;
          output.effect = impact;
          break;
        case 'map': {
          const travel = smoothstep(t / 0.72);
          output.x = -0.94 * travel;
          output.y = 0.22 * pulse(t, 0.04, 0.38, 0.9);
          output.yaw = 0.78 * travel;
          output.roll = -0.42 * travel + Math.sin(8 * Math.PI * t) * 0.08 * hold;
          output.effect = pulse(t, 0.04, 0.42, 0.92);
          break;
        }
        case 'umbrella':
          output.x = -0.46 * hold;
          output.y = 0.58 * hold;
          output.pitch = -0.16 * hold;
          output.roll = 0.68 * impact;
          output.scaleX = 1 - 0.16 * impact;
          output.scaleZ = 1 + 0.18 * impact;
          output.effect = impact;
          break;
      }
      break;
    case 'thunderstorm':
      switch (choiceId) {
        case 'anchor': {
          const drop = smoothstep((t - 0.12) / 0.64);
          output.x = 0.24 * hold;
          output.y = -0.94 * drop;
          output.z = -0.58 * drop;
          output.pitch = 0.48 * drop;
          output.roll = -0.08 * impact;
          output.effect = smoothstep((t - 0.12) / 0.6);
          break;
        }
        case 'bucket':
          output.x = 0.22 * impact;
          output.y = 0.4 * hold;
          output.pitch = -0.58 * pulse(t, 0.3, 0.6, 0.9);
          output.roll = -0.22 * hold + 0.18 * impact;
          output.effect = impact;
          break;
        case 'umbrella':
          output.x = 0.16 * impact;
          output.y = 0.7 * hold;
          output.pitch = -0.18 * hold;
          output.roll = -0.24 * hold + 0.3 * impact;
          output.scaleX = 1 + 0.1 * hold;
          output.scaleZ = 1 + 0.1 * hold;
          output.effect = impact;
          break;
      }
      break;
    case 'restless-waves':
      switch (choiceId) {
        case 'anchor':
          output.cameraYaw = -0.1 * Math.sin(2 * Math.PI * t) * hold;
          output.cameraPush = 0.07 * pulse(t, 0.12, 0.44, 0.8);
          output.effect = impact;
          break;
        case 'swimRing':
          output.cameraYaw = 0.13 * Math.sin(2 * Math.PI * t) * hold;
          output.cameraPush = 0.12 * impact;
          output.effect = impact;
          break;
      }
      break;
    case 'man-in-the-fog':
      switch (choiceId) {
        case 'compass':
          output.effect = hold;
          output.cameraYaw = 0.18 * Math.sin(Math.PI * (t - 0.1)) * hold;
          break;
        case 'spyglass':
          output.effect = hold;
          output.cameraPush = 0.28 * pulse(t, 0.2, 0.54, 0.88);
          break;
        case 'flashlight':
          output.effect = pulse(t, 0.08, 0.5, 0.94);
          output.cameraYaw = 0.3 * Math.sin(Math.PI * (t - 0.1)) * hold;
          break;
      }
      break;
  }

  const ingressEnvelope = smoothstep(t / 0.08);
  const returnEnvelope = 1 - smoothstep((t - 0.76) / 0.24);
  const envelope = ingressEnvelope * returnEnvelope;
  output.x *= envelope;
  output.y *= envelope;
  output.z *= envelope;
  output.yaw *= envelope;
  output.pitch *= envelope;
  output.roll *= envelope;
  output.scaleX = 1 + (output.scaleX - 1) * envelope;
  output.scaleY = 1 + (output.scaleY - 1) * envelope;
  output.scaleZ = 1 + (output.scaleZ - 1) * envelope;
  output.effect *= envelope;
  output.cameraYaw *= envelope;
  output.cameraPush *= envelope;
  output.supplyRoll *= envelope;
  return true;
}
