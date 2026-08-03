import { clamp01, pulse, smoothstep, smootherstep } from './animationMath';

export type WeatherAnimationEventId =
  | 'shower-night'
  | 'windy-night'
  | 'thunderstorm'
  | 'restless-waves'
  | 'man-in-the-fog'
  | 'bad-sleep';

export type WeatherItemEffectKind =
  | 'none'
  | 'wave-anchor-stabilize'
  | 'wave-ring-buffer'
  | 'compass-bearing'
  | 'spyglass-optical-push'
  | 'fog-flashlight-sweep'
  | 'bad-sleep-bucket-rock'
  | 'bad-sleep-flashlight-glow'
  | 'bad-sleep-ring-drift'
  | 'bad-sleep-umbrella-fold';

export type WeatherReactionEffectKind =
  | 'none'
  | 'bad-sleep-exhale'
  | 'bad-sleep-umbrella-collapse'
  | 'storm-loss-lightning';

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

export interface WeatherReactionSample {
  actorX: number;
  actorY: number;
  actorZ: number;
  actorYaw: number;
  actorPitch: number;
  actorRoll: number;
  actorScaleX: number;
  actorScaleY: number;
  actorScaleZ: number;
  actorEffect: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  effectKind: WeatherReactionEffectKind;
}

interface WeatherItemChoreography {
  readonly duration: number;
  readonly effectKind: WeatherItemEffectKind;
}

const CAMERA_ONLY_WEATHER_EVENTS: ReadonlySet<string> = new Set([
  'shower-night',
  'windy-night',
  'thunderstorm',
  'restless-waves',
  'man-in-the-fog',
]);

export function isCameraOnlyWeatherEvent(eventId: string): boolean {
  return CAMERA_ONLY_WEATHER_EVENTS.has(eventId);
}

const REVEAL_DURATIONS: Readonly<Record<WeatherAnimationEventId, number>> = Object.freeze({
  'shower-night': 5.2,
  'windy-night': 3.6,
  thunderstorm: 4,
  'restless-waves': 3.8,
  'man-in-the-fog': 5.2,
  'bad-sleep': 3.4,
});

const ITEM_CHOREOGRAPHY: Readonly<
  Record<WeatherAnimationEventId, Readonly<Record<string, WeatherItemChoreography>>>
> = Object.freeze({
  'shower-night': Object.freeze({
    bucket: Object.freeze({ duration: 1.35, effectKind: 'none' }),
    umbrella: Object.freeze({ duration: 1.5, effectKind: 'none' }),
    map: Object.freeze({ duration: 1.4, effectKind: 'none' }),
  }),
  'windy-night': Object.freeze({
    fishingNet: Object.freeze({ duration: 1.6, effectKind: 'none' }),
    map: Object.freeze({ duration: 1.45, effectKind: 'none' }),
    umbrella: Object.freeze({ duration: 1.55, effectKind: 'none' }),
  }),
  thunderstorm: Object.freeze({
    anchor: Object.freeze({ duration: 1.8, effectKind: 'none' }),
    bucket: Object.freeze({ duration: 1.4, effectKind: 'none' }),
    umbrella: Object.freeze({ duration: 1.55, effectKind: 'none' }),
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
  'bad-sleep': Object.freeze({
    bucket: Object.freeze({ duration: 1.3, effectKind: 'bad-sleep-bucket-rock' }),
    flashlight: Object.freeze({ duration: 1.25, effectKind: 'bad-sleep-flashlight-glow' }),
    swimRing: Object.freeze({ duration: 1.35, effectKind: 'bad-sleep-ring-drift' }),
    umbrella: Object.freeze({ duration: 1.4, effectKind: 'bad-sleep-umbrella-fold' }),
  }),
});

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

function resetReaction(output: WeatherReactionSample): void {
  output.actorX = 0;
  output.actorY = 0;
  output.actorZ = 0;
  output.actorYaw = 0;
  output.actorPitch = 0;
  output.actorRoll = 0;
  output.actorScaleX = 1;
  output.actorScaleY = 1;
  output.actorScaleZ = 1;
  output.actorEffect = 0;
  output.cameraX = 0;
  output.cameraY = 0;
  output.cameraZ = 0;
  output.cameraYaw = 0;
  output.cameraPitch = 0;
  output.cameraRoll = 0;
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

function multiplyItem(output: WeatherItemSample, envelope: number): void {
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
}

function multiplyReactionCamera(output: WeatherReactionSample, envelope: number): void {
  output.cameraX *= envelope;
  output.cameraY *= envelope;
  output.cameraZ *= envelope;
  output.cameraYaw *= envelope;
  output.cameraPitch *= envelope;
  output.cameraRoll *= envelope;
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
    case 'shower-night': {
      const yaw = 0.3;
      const pitch = 0.52;
      if (t < 0.298) {
        output.cameraYaw = yaw * smootherstep((t - 0.135) / 0.163);
        output.cameraPitch = pitch * smootherstep((t - 0.106) / 0.173);
      } else if (t < 0.375) {
        output.cameraYaw = yaw;
        output.cameraPitch = pitch;
      } else if (t < 0.683) {
        const lookAcross = smootherstep((t - 0.375) / 0.308);
        output.cameraYaw = yaw * (1 - lookAcross * 2);
        output.cameraPitch = pitch + Math.sin(lookAcross * Math.PI) * 0.06;
      } else if (t < 0.769) {
        output.cameraYaw = -yaw;
        output.cameraPitch = pitch;
      } else {
        output.cameraYaw = -yaw
          * (1 - smootherstep((t - 0.769) / 0.193));
        output.cameraPitch = pitch
          * (1 - smootherstep((t - 0.798) / 0.202));
      }
      return true;
    }
    case 'windy-night': {
      if (t < 0.24) {
        output.cameraYaw = 0.34 * smootherstep(t / 0.24);
      } else if (t < 0.42) {
        output.cameraYaw = 0.34;
      } else if (t < 0.72) {
        output.cameraYaw = 0.34 - 0.68 * smootherstep((t - 0.42) / 0.3);
      } else {
        output.cameraYaw = -0.34;
      }
      output.cameraPitch = 0.025 * Math.sin(2 * Math.PI * t) * sweep;
      break;
    }
    case 'thunderstorm':
      output.cameraYaw = 0.13 * Math.sin(2 * Math.PI * t) * sweep;
      output.cameraPitch = -0.24 * pulse(t, 0.1, 0.54, 0.9);
      output.lightningEmphasis = pulse(t, 0.44, 0.55, 0.68);
      break;
    case 'restless-waves':
      output.cameraYaw = 0.25 * Math.sin(2 * Math.PI * t) * sweep;
      output.cameraPitch = -0.2 * pulse(t, 0.08, 0.5, 0.92);
      break;
    case 'man-in-the-fog':
      output.cameraYaw = 0.23 * smoothstep((t - 0.08) / 0.3);
      output.cameraPitch = -0.08 * smoothstep((t - 0.12) / 0.3);
      output.figureVisibility = smoothstep((t - 0.2) / 0.18)
        * (1 - smoothstep((t - 0.84) / 0.12));
      output.figureDistance = 0;
      break;
    case 'bad-sleep':
      return true;
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

  if (isCameraOnlyWeatherEvent(eventId)) {
    const direction = choiceId === 'bucket' || choiceId === 'map' ? 1 : -1;
    switch (eventId) {
      case 'shower-night':
        break;
      case 'windy-night':
        output.cameraYaw = direction * 0.14 * Math.sin(Math.PI * t) * hold;
        output.cameraPush = 0.075 * impact;
        break;
      case 'thunderstorm':
        output.cameraYaw = direction * 0.11 * impact;
        output.cameraPush = 0.12 * impact;
        break;
      case 'restless-waves':
        output.cameraYaw = choiceId === 'anchor'
          ? -0.1 * Math.sin(2 * Math.PI * t) * hold
          : 0.13 * Math.sin(2 * Math.PI * t) * hold;
        output.cameraPush = choiceId === 'anchor'
          ? 0.07 * pulse(t, 0.12, 0.44, 0.8)
          : 0.12 * impact;
        output.effect = impact;
        break;
      case 'man-in-the-fog':
        if (choiceId === 'compass') {
          output.effect = hold;
          output.cameraYaw = 0.18 * Math.sin(Math.PI * (t - 0.1)) * hold;
        } else if (choiceId === 'spyglass') {
          output.effect = hold;
          output.cameraPush = 0.28 * pulse(t, 0.2, 0.54, 0.88);
        } else {
          output.effect = pulse(t, 0.08, 0.5, 0.94);
          output.cameraYaw = 0.3 * Math.sin(Math.PI * (t - 0.1)) * hold;
        }
        break;
    }
    const envelope = smoothstep(t / 0.08)
      * (1 - smoothstep((t - 0.76) / 0.24));
    multiplyItem(output, envelope);
    return true;
  }

  switch (eventId) {
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
    case 'bad-sleep':
      switch (choiceId) {
        case 'bucket':
          output.y = 0.46 * hold;
          output.roll = 0.16 * Math.sin(2 * Math.PI * t) * hold;
          output.effect = pulse(t, 0.12, 0.5, 0.86);
          break;
        case 'flashlight':
          output.y = 0.3 * hold;
          output.pitch = -0.12 * hold;
          output.effect = pulse(t, 0.08, 0.46, 0.9);
          output.cameraYaw = 0.08 * Math.sin(Math.PI * t) * hold;
          break;
        case 'swimRing':
          output.x = 0.18 * Math.sin(2 * Math.PI * t) * hold;
          output.y = 0.16 * hold;
          output.roll = 0.1 * hold;
          output.scaleX = 1 + 0.08 * hold;
          output.scaleZ = 1 + 0.08 * hold;
          output.effect = hold;
          break;
        case 'umbrella':
          output.y = 0.66 * hold;
          output.pitch = -0.14 * hold;
          output.roll = -0.18 * pulse(t, 0.2, 0.58, 0.86);
          output.scaleY = 1 - 0.1 * pulse(t, 0.28, 0.6, 0.84);
          output.effect = pulse(t, 0.2, 0.58, 0.86);
          break;
      }
      break;
  }

  const ingressEnvelope = smoothstep(t / 0.08);
  const returnEnvelope = 1 - smoothstep((t - 0.76) / 0.24);
  multiplyItem(output, ingressEnvelope * returnEnvelope);
  return true;
}

export function weatherReactionDuration(
  eventId: string,
  choiceId: string,
  actorCount: number,
): number | null {
  if (!isWeatherEventId(eventId)) return null;
  const actors = Math.max(0, Math.floor(actorCount));
  switch (eventId) {
    case 'shower-night': return 1.25 + Math.min(actors, 2) * 0.18;
    case 'windy-night': return 1.45 + Math.min(actors, 2) * 0.28;
    case 'bad-sleep': return choiceId === 'umbrella' ? 1.4 : 1.2;
    case 'thunderstorm': return choiceId === 'anchor' ? 1.5 : 1.35;
    case 'restless-waves':
    case 'man-in-the-fog':
      return 0.84;
    default: return actors > 0 ? 1.25 : 1.1;
  }
}

export function sampleWeatherReaction(
  eventId: string,
  choiceId: string,
  actorIndex: number,
  actorCount: number,
  condition: 'broken' | 'lost' | null,
  hullDelta: number,
  progress: number,
  output: WeatherReactionSample,
): boolean {
  resetReaction(output);
  if (!isWeatherEventId(eventId) || weatherReactionDuration(eventId, choiceId, actorCount) === null) {
    return false;
  }

  const t = clamp01(progress);
  if (t === 0) return true;
  const index = Math.max(0, Math.floor(actorIndex));
  const count = Math.max(0, Math.floor(actorCount));
  const staggered = clamp01((t - Math.min(index, count) * 0.16) / 0.72);
  const actorBeat = smoothstep(staggered / 0.72)
    + 0.12 * pulse(staggered, 0.18, 0.46, 0.74);
  const hullBeat = pulse(t, 0.14, 0.38, 0.62);
  const hullImpact = clamp01(-hullDelta / 40) * hullBeat;

  if (isCameraOnlyWeatherEvent(eventId)) {
    const direction = choiceId === 'bucket' || choiceId === 'map' ? 1 : -1;
    switch (eventId) {
      case 'shower-night':
        break;
      case 'windy-night':
        output.cameraX = direction * 0.08 * hullBeat;
        output.cameraYaw = direction * 0.1 * actorBeat;
        output.cameraRoll = direction * 0.11 * actorBeat;
        break;
      case 'thunderstorm':
        output.cameraX = direction * (0.08 * actorBeat + 0.12 * hullImpact);
        output.cameraY = -0.09 * hullImpact;
        output.cameraPitch = 0.07 * hullImpact;
        output.cameraRoll = direction * (0.1 * actorBeat + 0.12 * hullImpact);
        if (condition === 'lost') {
          output.effectKind = 'storm-loss-lightning';
          output.actorEffect = actorBeat;
        }
        break;
    }
    const envelope = smoothstep(t / 0.08)
      * (1 - smoothstep((t - 0.76) / 0.24));
    multiplyReactionCamera(output, envelope);
    return true;
  }

  switch (eventId) {
    case 'bad-sleep':
      if (choiceId === 'umbrella' && condition === 'broken') {
        output.effectKind = 'bad-sleep-umbrella-collapse';
        output.actorY = -0.22 * actorBeat;
        output.actorScaleY = 1 - 0.34 * actorBeat;
        output.actorRoll = -0.26 * actorBeat;
      } else {
        output.effectKind = 'bad-sleep-exhale';
        output.actorY = -0.06 * actorBeat;
        output.cameraY = -0.04 * hullBeat;
      }
      output.actorEffect = actorBeat;
      break;
    default:
      return true;
  }

  const envelope = smoothstep(t / 0.08) * (1 - smoothstep((t - 0.76) / 0.24));
  multiplyReactionCamera(output, envelope);
  return true;
}
