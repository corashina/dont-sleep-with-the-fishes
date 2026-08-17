import { clamp01, pulse, smoothstep } from './animationMath';
import {
  isEventPresentationRoute,
  type SupernaturalAnimationEventId,
} from './eventPresentationRoutes';
import { scaleEventItemDuration } from './eventItemTiming';
import { resetTransformPose, type MutableTransformPose } from './transformPose';

export interface SupernaturalRevealSample {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  ghostVisibility: number;
  ghostVisibilities: [number, number, number, number, number];
  flareFlash: number;
  fogCurtain: number;
  melodyClarity: number;
}

export interface SupernaturalItemSample extends MutableTransformPose {
  effect: number;
  cameraYaw: number;
  cameraPush: number;
}

export interface SupernaturalReactionOutcome {
  readonly deltas: Readonly<Record<string, number | undefined>>;
}

export interface SupernaturalReactionResponse {
  readonly choiceId?: string;
  readonly condition?: string;
}

export interface SupernaturalReactionSample {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  ghostVisibility: number;
  ghostAdvance: number;
  flareFlash: number;
  fogCurtain: number;
  sirenLunge: number;
  sirenStrike: number;
}

const REVEAL_DURATIONS: Readonly<Record<SupernaturalAnimationEventId, number>> = Object.freeze({
  ghosts: 6.4,
  'eerie-melody': 4.4,
});

const ITEM_DURATIONS = Object.freeze({
  ghosts: Object.freeze({ flareGun: 1.2, flashlight: 1.35 }),
  'eerie-melody': Object.freeze({
    bucket: 1.35,
    spyglass: 1.45,
    umbrella: 1.5,
    ductTape: 1.2,
  }),
});

export interface GhostFloatPath {
  readonly center: readonly [number, number, number];
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly period: number;
  readonly phase: number;
  readonly bobHeight: number;
  readonly bobRate: number;
}

export interface GhostFloatPose {
  readonly position: [number, number, number];
  readonly tangent: [number, number, number];
}

export const GHOST_FLOAT_PATHS = Object.freeze([
  Object.freeze({
    center: [-2.8, 0.65, -8.2] as const,
    radiusX: 5.4,
    radiusZ: 2,
    period: 18,
    phase: 0.2,
    bobHeight: 0.12,
    bobRate: 0.72,
  }),
  Object.freeze({
    center: [3.2, 0.92, -10.8] as const,
    radiusX: 6.3,
    radiusZ: 2.6,
    period: 23,
    phase: 2.4,
    bobHeight: 0.15,
    bobRate: 0.64,
  }),
  Object.freeze({
    center: [-3.6, 1.2, -13.5] as const,
    radiusX: 6.8,
    radiusZ: 2.8,
    period: 27,
    phase: 4.1,
    bobHeight: 0.18,
    bobRate: 0.58,
  }),
  Object.freeze({
    center: [3.8, 0.52, -16.4] as const,
    radiusX: 7.5,
    radiusZ: 3.2,
    period: 31,
    phase: 1.4,
    bobHeight: 0.11,
    bobRate: 0.68,
  }),
  Object.freeze({
    center: [0, 1.42, -19.2] as const,
    radiusX: 8,
    radiusZ: 3.5,
    period: 35,
    phase: 5.2,
    bobHeight: 0.2,
    bobRate: 0.54,
  }),
] as const satisfies readonly GhostFloatPath[]);

const GHOST_REVEAL_START = 0.02;
const GHOST_REVEAL_STAGGER = 0.015;

export function createGhostFloatPose(): GhostFloatPose {
  return {
    position: [0, 0, 0],
    tangent: [0, 0, 0],
  };
}

export function sampleGhostFloatPathInto(
  output: GhostFloatPose,
  path: GhostFloatPath,
  elapsedSeconds: number,
): GhostFloatPose {
  const time = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const angularSpeed = Math.PI * 2 / path.period;
  const angle = time * angularSpeed + path.phase;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const bobPhase = time * path.bobRate + path.phase * 1.7;

  output.position[0] = path.center[0] + path.radiusX * cosine;
  output.position[1] = path.center[1] + Math.sin(bobPhase) * path.bobHeight;
  output.position[2] = path.center[2] + path.radiusZ * sine;
  output.tangent[0] = -path.radiusX * sine * angularSpeed;
  output.tangent[1] = Math.cos(bobPhase) * path.bobHeight * path.bobRate;
  output.tangent[2] = path.radiusZ * cosine * angularSpeed;
  return output;
}

function itemDuration(
  eventId: string,
  choiceId: string,
): number | null {
  if (eventId === 'ghosts') {
    if (!Object.hasOwn(ITEM_DURATIONS.ghosts, choiceId)) return null;
    return ITEM_DURATIONS.ghosts[choiceId as keyof typeof ITEM_DURATIONS.ghosts];
  }
  if (eventId === 'eerie-melody') {
    if (!Object.hasOwn(ITEM_DURATIONS['eerie-melody'], choiceId)) return null;
    return ITEM_DURATIONS['eerie-melody'][
      choiceId as keyof typeof ITEM_DURATIONS['eerie-melody']
    ];
  }
  return null;
}

function resetReveal(output: SupernaturalRevealSample): void {
  output.cameraX = 0;
  output.cameraY = 0;
  output.cameraZ = 0;
  output.cameraYaw = 0;
  output.cameraPitch = 0;
  output.cameraRoll = 0;
  output.ghostVisibility = 0;
  output.ghostVisibilities[0] = 0;
  output.ghostVisibilities[1] = 0;
  output.ghostVisibilities[2] = 0;
  output.ghostVisibilities[3] = 0;
  output.ghostVisibilities[4] = 0;
  output.flareFlash = 0;
  output.fogCurtain = 0;
  output.melodyClarity = 0;
}

function resetItem(output: SupernaturalItemSample): void {
  resetTransformPose(output);
  output.effect = 0;
  output.cameraYaw = 0;
  output.cameraPush = 0;
}

function resetReaction(output: SupernaturalReactionSample): void {
  output.cameraX = 0;
  output.cameraY = 0;
  output.cameraZ = 0;
  output.cameraYaw = 0;
  output.cameraPitch = 0;
  output.cameraRoll = 0;
  output.ghostVisibility = 0;
  output.ghostAdvance = 0;
  output.flareFlash = 0;
  output.fogCurtain = 0;
  output.sirenLunge = 0;
  output.sirenStrike = 0;
}

function applyRevealEnvelope(output: SupernaturalRevealSample, envelope: number): void {
  output.cameraX *= envelope;
  output.cameraY *= envelope;
  output.cameraZ *= envelope;
  output.cameraYaw *= envelope;
  output.cameraPitch *= envelope;
  output.cameraRoll *= envelope;
  output.ghostVisibility *= envelope;
  output.ghostVisibilities[0] *= envelope;
  output.ghostVisibilities[1] *= envelope;
  output.ghostVisibilities[2] *= envelope;
  output.ghostVisibilities[3] *= envelope;
  output.ghostVisibilities[4] *= envelope;
  output.flareFlash *= envelope;
  output.fogCurtain *= envelope;
  output.melodyClarity *= envelope;
}

export function supernaturalRevealDuration(eventId: string): number | null {
  return isEventPresentationRoute(eventId, 'supernatural')
    ? REVEAL_DURATIONS[eventId]
    : null;
}

export function sampleSupernaturalReveal(
  eventId: string,
  progress: number,
  output: SupernaturalRevealSample,
): boolean {
  resetReveal(output);
  if (!isEventPresentationRoute(eventId, 'supernatural')) return false;

  const t = clamp01(progress);
  if (t === 0) return true;

  if (eventId === 'ghosts') {
    for (let index = 0; index < GHOST_FLOAT_PATHS.length; index += 1) {
      const start = GHOST_REVEAL_START + index * GHOST_REVEAL_STAGGER;
      output.ghostVisibilities[index] = smoothstep((t - start) / 0.1);
    }
    output.ghostVisibility = output.ghostVisibilities[0];
    return true;
  }

  if (t === 1) return true;
  const curtain = smoothstep((t - 0.12) / 0.42);
  output.fogCurtain = curtain;
  output.melodyClarity = smoothstep((t - 0.26) / 0.42);
  applyRevealEnvelope(output, smoothstep(t / 0.1) * (1 - smoothstep((t - 0.82) / 0.18)));
  return true;
}

export function supernaturalItemUseDuration(eventId: string, choiceId: string): number | null {
  const duration = itemDuration(eventId, choiceId);
  return duration === null ? null : scaleEventItemDuration(duration);
}

export function sampleSupernaturalItemUse(
  eventId: string,
  choiceId: string,
  progress: number,
  output: SupernaturalItemSample,
): boolean {
  resetItem(output);
  if (itemDuration(eventId, choiceId) === null) return false;

  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  const hold = Math.min(smoothstep(t / 0.28), 1 - smoothstep((t - 0.68) / 0.32));
  const impact = pulse(t, 0.22, 0.52, 0.84);

  if (eventId === 'ghosts') {
    if (choiceId === 'flareGun') {
      output.y = 0.34 * hold;
      output.z = -0.28 * hold;
      output.pitch = -0.28 * hold;
      output.roll = -0.12 * impact;
      output.effect = pulse(t, 0.34, 0.47, 0.62);
      output.cameraYaw = 0.08 * impact;
    } else {
      output.y = 0.3 * hold;
      output.yaw = 0.54 * impact;
      output.pitch = -0.18 * hold;
      output.effect = pulse(t, 0.16, 0.52, 0.9);
    }
  } else {
    switch (choiceId) {
      case 'bucket':
        output.y = 0.42 * hold;
        output.pitch = -0.56 * impact;
        output.roll = 0.16 * hold;
        output.effect = impact;
        break;
      case 'spyglass':
        output.y = 0.38 * hold;
        output.z = -0.46 * hold;
        output.scaleX = 1 + 0.2 * hold;
        output.scaleY = 1 + 0.2 * hold;
        output.scaleZ = 1 + 0.2 * hold;
        output.effect = hold;
        output.cameraPush = 0.28 * impact;
        break;
      case 'umbrella':
        output.y = 0.64 * hold;
        output.roll = -0.22 * hold + 0.24 * impact;
        output.scaleX = 1 + 0.1 * hold;
        output.scaleZ = 1 + 0.1 * hold;
        output.effect = impact;
        break;
      case 'ductTape':
        output.x = -0.28 * hold;
        output.y = 0.22 * hold;
        output.yaw = -0.3 * impact;
        output.scaleX = 1 + 0.16 * impact;
        output.effect = impact;
        break;
    }
  }

  const envelope = smoothstep(t / 0.08) * (1 - smoothstep((t - 0.8) / 0.2));
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
  return true;
}

export function sampleSupernaturalReaction(
  eventId: string,
  outcome: SupernaturalReactionOutcome,
  response: SupernaturalReactionResponse | undefined,
  progress: number,
  output: SupernaturalReactionSample,
): boolean {
  resetReaction(output);
  if (!isEventPresentationRoute(eventId, 'supernatural')) return false;

  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  const hullDamage = Math.min(0, outcome.deltas.hull ?? 0);
  const healthDamage = Math.min(0, outcome.deltas.health ?? 0);
  const attack = hullDamage < 0 || healthDamage < 0;
  const envelope = smoothstep(t / 0.12) * (1 - smoothstep((t - 0.76) / 0.24));

  if (eventId === 'ghosts') {
    const wrongChoice = response?.choiceId !== 'flareGun';
    output.ghostVisibility = wrongChoice ? 1 : 0;
    output.ghostAdvance = wrongChoice ? smoothstep((t - 0.08) / 0.68) : 0;
    output.flareFlash = response?.choiceId === 'flareGun' ? pulse(t, 0.1, 0.32, 0.6) : 0;
    output.cameraZ = wrongChoice ? 0.12 * output.ghostAdvance : 0;
    output.cameraRoll = wrongChoice ? 0.1 * pulse(t, 0.22, 0.48, 0.82) : 0;
  } else if (attack) {
    output.sirenLunge = pulse(t, 0.14, 0.48, 0.88);
    output.sirenStrike = pulse(t, 0.36, 0.52, 0.72);
    output.cameraZ = 0.18 * output.sirenLunge;
    output.cameraRoll = 0.09 * output.sirenStrike;
  } else {
    output.fogCurtain = pulse(t, 0.08, 0.48, 0.92);
    output.cameraPitch = -0.06 * output.fogCurtain;
  }

  output.cameraX *= envelope;
  output.cameraY *= envelope;
  output.cameraZ *= envelope;
  output.cameraYaw *= envelope;
  output.cameraPitch *= envelope;
  output.cameraRoll *= envelope;
  output.ghostVisibility *= envelope;
  output.ghostAdvance *= envelope;
  output.flareFlash *= envelope;
  output.fogCurtain *= envelope;
  output.sirenLunge *= envelope;
  output.sirenStrike *= envelope;
  return true;
}
