export type SupernaturalAnimationEventId = 'ghosts' | 'eerie-melody';

export interface SupernaturalRevealSample {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraRoll: number;
  ghostVisibility: number;
  ghostDistances: [number, number, number, number, number];
  ghostSideOffsets: [number, number, number, number, number];
  flareFlash: number;
  fogCurtain: number;
  sirenHeadTurn: number;
  sirenLunge: number;
  melodyClarity: number;
}

export interface SupernaturalItemSample {
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
  ghosts: 4,
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

export const GHOST_FLIGHT_PATHS = Object.freeze([
  Object.freeze({ start: [-7.2, 0.92, -6.2] as const, end: [6.4, 1.18, -7.1] as const }),
  Object.freeze({ start: [7.4, 1.2, -8.4] as const, end: [-5.8, 0.98, -9.1] as const }),
  Object.freeze({ start: [-6.3, 1.28, -11.2] as const, end: [4.8, 1.5, -10.4] as const }),
  Object.freeze({ start: [6.1, 1.52, -13.4] as const, end: [-4.7, 1.26, -12.2] as const }),
  Object.freeze({ start: [-4.2, 1.04, -15.2] as const, end: [6.7, 1.42, -14.1] as const }),
] as const);

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

function isSupernaturalEventId(eventId: string): eventId is SupernaturalAnimationEventId {
  return Object.hasOwn(REVEAL_DURATIONS, eventId);
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
  output.ghostDistances[0] = 0;
  output.ghostDistances[1] = 0;
  output.ghostDistances[2] = 0;
  output.ghostDistances[3] = 0;
  output.ghostDistances[4] = 0;
  output.ghostSideOffsets[0] = 0;
  output.ghostSideOffsets[1] = 0;
  output.ghostSideOffsets[2] = 0;
  output.ghostSideOffsets[3] = 0;
  output.ghostSideOffsets[4] = 0;
  output.flareFlash = 0;
  output.fogCurtain = 0;
  output.sirenHeadTurn = 0;
  output.sirenLunge = 0;
  output.melodyClarity = 0;
}

function resetItem(output: SupernaturalItemSample): void {
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
  output.flareFlash *= envelope;
  output.fogCurtain *= envelope;
  output.sirenHeadTurn *= envelope;
  output.sirenLunge *= envelope;
  output.melodyClarity *= envelope;
}

export function supernaturalRevealDuration(eventId: string): number | null {
  return isSupernaturalEventId(eventId) ? REVEAL_DURATIONS[eventId] : null;
}

export function sampleSupernaturalReveal(
  eventId: string,
  progress: number,
  output: SupernaturalRevealSample,
): boolean {
  resetReveal(output);
  if (!isSupernaturalEventId(eventId)) return false;

  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;

  if (eventId === 'ghosts') {
    const ghosts = smoothstep((t - 0.06) / 0.18)
      * (1 - smoothstep((t - 0.84) / 0.12));
    const flight = smoothstep((t - 0.08) / 0.76);
    output.cameraYaw = 0.18 * smoothstep(t / 0.38);
    output.cameraPitch = -0.06 * smoothstep((t - 0.22) / 0.42);
    output.ghostVisibility = ghosts;
    for (let index = 0; index < GHOST_FLIGHT_PATHS.length; index += 1) {
      const path = GHOST_FLIGHT_PATHS[index]!;
      output.ghostDistances[index] = -(
        path.start[2] + (path.end[2] - path.start[2]) * flight
      );
      output.ghostSideOffsets[index] = path.start[0]
        + (path.end[0] - path.start[0]) * flight;
    }
    output.flareFlash = pulse(t, 0.34, 0.47, 0.62);
  } else {
    const curtain = smoothstep((t - 0.12) / 0.42);
    output.cameraX = -0.1 * smoothstep((t - 0.18) / 0.42);
    output.cameraPitch = -0.08 * smoothstep((t - 0.18) / 0.44);
    output.fogCurtain = curtain;
    output.melodyClarity = smoothstep((t - 0.26) / 0.42);
    output.sirenHeadTurn = smoothstep((t - 0.58) / 0.22);
    output.sirenLunge = 0.1 * pulse(t, 0.72, 0.82, 0.94);
  }

  applyRevealEnvelope(output, smoothstep(t / 0.1) * (1 - smoothstep((t - 0.82) / 0.18)));
  return true;
}

export function supernaturalItemUseDuration(eventId: string, choiceId: string): number | null {
  return itemDuration(eventId, choiceId);
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
  if (!isSupernaturalEventId(eventId)) return false;

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
