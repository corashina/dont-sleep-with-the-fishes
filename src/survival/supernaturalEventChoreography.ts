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
  readonly direction: -1 | 1;
  readonly wanderX: number;
  readonly wanderZ: number;
  readonly wanderPeriod: number;
  readonly wanderPhase: number;
  readonly bobHeight: number;
  readonly bobRate: number;
}

export interface GhostFloatPose {
  readonly position: [number, number, number];
  readonly tangent: [number, number, number];
}

const GHOST_CORRIDORS = Object.freeze([
  Object.freeze([-7.8, 0.72, -8.5] as const),
  Object.freeze([6.8, 1.05, -11.7] as const),
  Object.freeze([-8.4, 1.25, -15.6] as const),
  Object.freeze([7.7, 0.62, -19.2] as const),
  Object.freeze([0, 1.5, -23] as const),
]);

function seededUnit(seed: number): number {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x1_0000_0000;
}

function pathUnit(seed: number, index: number, channel: number): number {
  return seededUnit(
    (seed | 0)
      ^ Math.imul(index + 1, 0x45d9f3b)
      ^ Math.imul(channel + 17, 0x27d4eb2d),
  );
}

export function createGhostFloatPaths(seed: number): readonly GhostFloatPath[] {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return Object.freeze(GHOST_CORRIDORS.map((corridor, index) => Object.freeze({
    center: Object.freeze([
      corridor[0] + (pathUnit(safeSeed, index, 0) - 0.5) * 1.4,
      corridor[1] + (pathUnit(safeSeed, index, 1) - 0.5) * 0.24,
      corridor[2] + (pathUnit(safeSeed, index, 2) - 0.5) * 0.7,
    ] as const),
    radiusX: 1.35 + pathUnit(safeSeed, index, 3) * 0.8,
    radiusZ: 0.62 + pathUnit(safeSeed, index, 4) * 0.42,
    period: 13 + pathUnit(safeSeed, index, 5) * 10,
    phase: pathUnit(safeSeed, index, 6) * Math.PI * 2,
    direction: pathUnit(safeSeed, index, 7) < 0.5 ? -1 : 1,
    wanderX: 0.32 + pathUnit(safeSeed, index, 8) * 0.42,
    wanderZ: 0.2 + pathUnit(safeSeed, index, 9) * 0.3,
    wanderPeriod: 7 + pathUnit(safeSeed, index, 10) * 8,
    wanderPhase: pathUnit(safeSeed, index, 11) * Math.PI * 2,
    bobHeight: 0.1 + pathUnit(safeSeed, index, 12) * 0.12,
    bobRate: 0.46 + pathUnit(safeSeed, index, 13) * 0.34,
  })));
}

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
  const angularSpeed = path.direction * Math.PI * 2 / path.period;
  const wanderSpeed = Math.PI * 2 / path.wanderPeriod;
  const angle = time * angularSpeed + path.phase;
  const wanderAngle = time * wanderSpeed + path.wanderPhase;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const bobPhase = time * path.bobRate + path.phase * 1.7;

  output.position[0] = path.center[0]
    + path.radiusX * cosine
    + path.wanderX * Math.sin(wanderAngle);
  output.position[1] = path.center[1] + Math.sin(bobPhase) * path.bobHeight;
  output.position[2] = path.center[2]
    + path.radiusZ * sine
    + path.wanderZ * Math.cos(wanderAngle);
  output.tangent[0] = -path.radiusX * sine * angularSpeed
    + path.wanderX * Math.cos(wanderAngle) * wanderSpeed;
  output.tangent[1] = Math.cos(bobPhase) * path.bobHeight * path.bobRate;
  output.tangent[2] = path.radiusZ * cosine * angularSpeed
    - path.wanderZ * Math.sin(wanderAngle) * wanderSpeed;
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
    for (let index = 0; index < GHOST_CORRIDORS.length; index += 1) {
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

function sampleGhostReaction(
  choiceId: string | undefined,
  t: number,
  output: SupernaturalReactionSample,
): void {
  const wrongChoice = choiceId !== 'flareGun';
  output.ghostVisibility = wrongChoice ? 1 : 0;
  output.ghostAdvance = wrongChoice ? smoothstep((t - 0.08) / 0.68) : 0;
  output.flareFlash = wrongChoice ? 0 : pulse(t, 0.1, 0.32, 0.6);
  output.cameraZ = wrongChoice ? 0.12 * output.ghostAdvance : 0;
  output.cameraRoll = wrongChoice ? 0.1 * pulse(t, 0.22, 0.48, 0.82) : 0;
}

function sampleSirenReaction(
  attack: boolean,
  t: number,
  output: SupernaturalReactionSample,
): void {
  if (attack) {
    output.sirenLunge = pulse(t, 0.14, 0.48, 0.88);
    output.sirenStrike = pulse(t, 0.36, 0.52, 0.72);
    output.cameraZ = 0.18 * output.sirenLunge;
    output.cameraRoll = 0.09 * output.sirenStrike;
    return;
  }
  output.fogCurtain = pulse(t, 0.08, 0.48, 0.92);
  output.cameraPitch = -0.06 * output.fogCurtain;
}

function applyReactionEnvelope(
  output: SupernaturalReactionSample,
  envelope: number,
): void {
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
    sampleGhostReaction(response?.choiceId, t, output);
  } else {
    sampleSirenReaction(attack, t, output);
  }
  applyReactionEnvelope(output, envelope);
  return true;
}
