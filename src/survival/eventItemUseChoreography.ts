import type { ItemId } from '../game/ItemState';
import { clamp01, pulse, smoothstep } from './animationMath';
import { eventItemMotionProfile, type EventItemMass } from './eventItemMotionProfile';
import { scaleEventItemDuration, scaleThrownItemDuration } from './eventItemTiming';
import { NET_ATTACK_BASE_DURATION, NET_ATTACK_CONTACT_PROGRESS, sampleNetAttackContact, sampleNetAttackSwing } from './netAttackChoreography';

export type EventItemUseContext =
  | 'base' | 'throw-target' | 'tape-stretch' | 'compass-search' | 'map-read'
  | 'binocular-look' | 'net-scoop' | 'net-slap' | 'bucket-scoop' | 'bucket-helmet'
  | 'trade-handover' | 'map-leak-patch'
  | 'radio-signal-receive'
  | 'flare-target' | 'flare-sky' | 'anchor-drop'
  | 'umbrella-overhead' | 'umbrella-shield'
  | 'flashlight-threat-beam' | 'flashlight-signal' | 'shotgun-fire'
  | 'knife-stab';

export type EventItemEffectKind =
  | 'none' | 'tape' | 'binocular-mask'
  | 'flare' | 'chain' | 'flashlight' | 'shotgun-smoke';

export type EventItemSurfaceFacing =
  | 'default' | 'none' | 'target' | 'target-plane' | 'target-plane-opposite';

export type EventItemFlightTarget = 'event' | 'starboard-water' | 'bucket-water';

export type EventItemDisposition = 'recover' | 'broken' | 'depart';

const MOTION_PROFILE = Symbol('event-item-motion-profile');
const ANTICIPATE = Symbol('event-item-anticipate');
const ITEM_LIFT_START = 0.08;
const MAP_LIFT_COMPLETION = 0.34;
const MAP_LOOK_COMPLETION = 0.44;
const FLASHLIGHT_MORSE_INTERVALS = Object.freeze([
  [0.42, 0.438], [0.456, 0.474], [0.492, 0.51],
  [0.564, 0.618], [0.636, 0.69], [0.708, 0.762],
  [0.816, 0.834], [0.852, 0.87], [0.888, 0.906],
] as const);
const FLASHLIGHT_MORSE_CUE_PROGRESSES = Object.freeze([
  0.42, 0.456, 0.492, 0.564, 0.636, 0.708, 0.816, 0.852, 0.888,
]);
const FLASHLIGHT_THREAT_CUE_PROGRESSES = Object.freeze([0.42]);
const SHOTGUN_ACTION_CUE_PROGRESSES = Object.freeze([0.46]);
const KNIFE_ACTION_CUE_PROGRESSES = Object.freeze([0.68]);
const KNIFE_GRIP_YAW = Math.PI / 2;
const KNIFE_GRIP_ROLL = 0.28;
const KNIFE_AIM_START = 0.36;
const KNIFE_AIM_END = 0.5;
const KNIFE_READY_LIFT = 0.34;
const KNIFE_STAB_START = 0.54;
const KNIFE_CONTACT_PROGRESS = 0.68;
const KNIFE_RETRACT_START = 0.72;
const KNIFE_RETRACT_END = 0.82;
const KNIFE_GRIP_RETURN_END = 0.96;
const KNIFE_RETURN_HOLD_PROGRESS = 0.16;
const KNIFE_GUNWALE_CLEARANCE_HEIGHT = 0.65;
const NET_SLAP_ACTION_CUE_PROGRESSES = Object.freeze([NET_ATTACK_CONTACT_PROGRESS]);
const FLARE_GUN_ACTION_CUE_PROGRESSES = Object.freeze([0.46, 0.54]);
const FLARE_GUN_READY_YAW = -Math.PI / 2 + 0.22;
const FLARE_GUN_READY_PITCH = 1.25;
const FLARE_GUN_READY_ROLL = -Math.PI / 2;
const UMBRELLA_OVERHEAD_ROTATION = Object.freeze({
  pitch: -0.7361036000458032,
  yaw: 1.3933992747114876,
  roll: -1.4509371355345577,
});
const UMBRELLA_SHIELD_VIEW_Z = -0.2;
const UMBRELLA_SHIELD_VIEW_Y = -0.075;
const UMBRELLA_SHIELD_SCALE = 1.5;
const ANCHOR_FLIGHT_START = 0.56;
const ANCHOR_IMPACT_PROGRESS = 0.84;
const ANCHOR_ACTION_CUE_PROGRESSES = Object.freeze([ANCHOR_IMPACT_PROGRESS]);
const TAPE_ACTION_CUE_PROGRESSES = Object.freeze([0.5]);
export const MAP_PATCH_CONTACT_PROGRESS = 0.78;
const MAP_PATCH_ACTION_CUE_PROGRESSES = Object.freeze([MAP_PATCH_CONTACT_PROGRESS]);
const MAP_PATCH_LIFT_START = 0.08;
const MAP_PATCH_LIFT_END = 0.22;
const MAP_PATCH_TRAVEL_START = MAP_PATCH_LIFT_END;
const MAP_PATCH_TRAVEL_END = 0.38;
const MAP_PATCH_MINIMUM_LIFT_Y = 0.42;
const MAP_PATCH_TRAVEL_ARC_HEIGHT = 0.52;
const RADIO_SIGNAL_CUE_PROGRESSES = Object.freeze([0.52]);
const BUCKET_HELMET_RAIN_CUE_PROGRESSES = Object.freeze([0.65]);
const WEIGHTED_THROW_DURATION_MULTIPLIER = 1.15;
const SCOOP_DURATION = 1.65;
const SCOOP_FLIGHT_ARC_HEIGHT = 0.9;
const SCOOP_GUNWALE_CLEARANCE = 0.28;
const NET_PICKUP_DEPTH = 0.14;
const BUCKET_BENCH_CLEARANCE_X = 0.32;
const BUCKET_HELMET_RAISE_START = 0;
const BUCKET_HELMET_OVERHEAD_PROGRESS = 0.36;
const BUCKET_HELMET_LOWER_START = 0.38;
const BUCKET_HELMET_LOWER_END = 0.72;
const BUCKET_HELMET_OVERHEAD_Y = 0.56;
const BUCKET_HELMET_WORN_Y = -0.04;
const BUCKET_HELMET_CENTER_X = 0;
const BUCKET_HELMET_SCALE = 1.35;
const NO_ACTION_CUE_PROGRESSES: readonly number[] = Object.freeze([]);
type StagedEventItemUseSample = EventItemUseSample & {
  [MOTION_PROFILE]?: ReturnType<typeof eventItemMotionProfile>;
  [ANTICIPATE]?: number;
};

export interface EventItemUseSample {
  cameraSpaceBlend: number;
  viewX: number;
  viewY: number;
  viewZ: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraTargetBlend: number;
  fovScale: number;
  primaryEffect: number;
  secondaryEffect: number;
  effectKind: EventItemEffectKind;
  aimBlend: number;
  targetBlend: number;
  netSwing: boolean;
  ballisticFlight: boolean;
  flightArc: number;
  flightArcHeight: number;
  flightTarget: EventItemFlightTarget;
  effectTravel: number;
  effectArc: number;
  itemVisible: boolean;
  surfaceFacing: EventItemSurfaceFacing;
  minimumLiftY: number;
}

const BUCKET_SCOOP_EVENTS: ReadonlySet<string> = new Set([
  'leak', 'school-of-fish', 'thunderstorm',
]);
const BUCKET_HELMET_EVENTS: ReadonlySet<string> = new Set([
  'shower-night', 'bad-sleep', 'eerie-melody',
]);
const UMBRELLA_OVERHEAD_EVENTS: ReadonlySet<string> = new Set([
  'shower-night', 'thunderstorm',
]);
const UMBRELLA_SHIELD_EVENTS: ReadonlySet<string> = new Set([
  'bad-sleep', 'death-stare', 'eerie-melody', 'face-on-the-moon',
]);
const FLARE_SKY_EVENTS: ReadonlySet<string> = new Set(['other-people', 'plane']);
const FLARE_TARGET_EVENTS: ReadonlySet<string> = new Set(['ghosts', 'snatcher']);
const TRADE_EVENTS: ReadonlySet<string> = new Set(['night-trader', 'handyman']);
const NET_SLAP_EVENTS: ReadonlySet<string> = new Set([
  'death-stare', 'swarm-of-sharks',
]);
const FLASHLIGHT_SIGNAL_EVENTS: ReadonlySet<string> = new Set([
  'other-people', 'plane',
]);
const ANCHOR_DROP_EVENTS: ReadonlySet<string> = new Set([
  'tornado', 'thunderstorm', 'restless-waves',
]);
const SETTLE_ROLL_EXCLUDED_CONTEXTS: ReadonlySet<EventItemUseContext> = new Set([
  'map-read', 'compass-search', 'net-scoop', 'net-slap', 'map-leak-patch', 'knife-stab',
]);
const EVENT_ITEM_USE_BASE_DURATIONS: Readonly<Record<EventItemUseContext, number>> = {
  base: 1.35,
  'throw-target': 1.35,
  'tape-stretch': 1.45,
  'compass-search': 1.6,
  'map-read': 1.55,
  'binocular-look': 1.7,
  'net-scoop': SCOOP_DURATION,
  'net-slap': NET_ATTACK_BASE_DURATION,
  'bucket-scoop': SCOOP_DURATION,
  'bucket-helmet': 1.45,
  'trade-handover': 1.35,
  'radio-signal-receive': 1.65,
  'map-leak-patch': 1.5,
  'flare-target': 1.5,
  'flare-sky': 1.65,
  'anchor-drop': 1.6,
  'umbrella-overhead': 1.45,
  'umbrella-shield': 1.35,
  'flashlight-threat-beam': 1.45,
  'flashlight-signal': 1.7,
  'shotgun-fire': 1.2,
  'knife-stab': 1.15,
};

type EventItemContextResolver = (
  eventId: string,
  choiceId: string,
) => EventItemUseContext | null;

const EVENT_ITEM_CONTEXT_RESOLVERS: Partial<Record<ItemId, EventItemContextResolver>> = {
  radio: (_eventId, choiceId) => exactChoiceContext(
    choiceId, 'radioSignal', 'radio-signal-receive',
  ),
  bucket: resolveBucketContext,
  umbrella: resolveUmbrellaContext,
  flareGun: resolveFlareContext,
  anchor: resolveAnchorContext,
  cannedFood: (_eventId, choiceId) => choiceId === 'food' || choiceId === 'cannedFood'
    ? 'throw-target'
    : null,
  baitTin: (_eventId, choiceId) => choiceId === 'bait' || choiceId === 'baitTin'
    ? 'throw-target'
    : null,
  medicalKit: (_eventId, choiceId) => exactChoiceContext(choiceId, 'medicalKit', 'throw-target'),
  energyBar: (_eventId, choiceId) => exactChoiceContext(choiceId, 'energyBar', 'throw-target'),
  swimRing: (_eventId, choiceId) => exactChoiceContext(choiceId, 'swimRing', 'throw-target'),
  ductTape: (_eventId, choiceId) => exactChoiceContext(choiceId, 'ductTape', 'tape-stretch'),
  compass: (_eventId, choiceId) => exactChoiceContext(choiceId, 'compass', 'compass-search'),
  map: resolveMapContext,
  spyglass: (_eventId, choiceId) => exactChoiceContext(choiceId, 'spyglass', 'binocular-look'),
  fishingNet: resolveFishingNetContext,
  knife: (eventId, choiceId) => eventId === 'check-the-back'
    ? null
    : exactChoiceContext(choiceId, 'knife', 'knife-stab'),
  flashlight: resolveFlashlightContext,
  shotgun: (_eventId, choiceId) => exactChoiceContext(choiceId, 'shotgun', 'shotgun-fire'),
};

export function createEventItemUseSample(): EventItemUseSample {
  return {
    cameraSpaceBlend: 0,
    viewX: 0,
    viewY: 0,
    viewZ: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    cameraYaw: 0,
    cameraPitch: 0,
    cameraTargetBlend: 0,
    fovScale: 1,
    primaryEffect: 0,
    secondaryEffect: 0,
    effectKind: 'none',
    aimBlend: 0,
    targetBlend: 0,
    netSwing: false,
    ballisticFlight: false,
    flightArc: 0,
    flightArcHeight: 0,
    flightTarget: 'event',
    effectTravel: 0,
    effectArc: 0,
    itemVisible: true,
    surfaceFacing: 'default',
    minimumLiftY: 0,
  };
}

export function resolveEventItemUseContext(
  eventId: string,
  choiceId: string,
  itemId: ItemId,
): EventItemUseContext | null {
  if (TRADE_EVENTS.has(eventId)) return 'trade-handover';
  return EVENT_ITEM_CONTEXT_RESOLVERS[itemId]?.(eventId, choiceId) ?? null;
}

function exactChoiceContext(
  choiceId: string,
  expectedChoiceId: string,
  context: EventItemUseContext,
): EventItemUseContext | null {
  return choiceId === expectedChoiceId ? context : null;
}

function resolveBucketContext(eventId: string, choiceId: string): EventItemUseContext | null {
  if (choiceId !== 'bucket') return null;
  if (BUCKET_SCOOP_EVENTS.has(eventId)) return 'bucket-scoop';
  return BUCKET_HELMET_EVENTS.has(eventId) ? 'bucket-helmet' : null;
}

function resolveUmbrellaContext(eventId: string, choiceId: string): EventItemUseContext | null {
  if (choiceId !== 'umbrella') return null;
  if (UMBRELLA_OVERHEAD_EVENTS.has(eventId)) return 'umbrella-overhead';
  return UMBRELLA_SHIELD_EVENTS.has(eventId) ? 'umbrella-shield' : null;
}

function resolveFlareContext(eventId: string, choiceId: string): EventItemUseContext | null {
  if (choiceId !== 'flareGun') return null;
  if (FLARE_SKY_EVENTS.has(eventId)) return 'flare-sky';
  return FLARE_TARGET_EVENTS.has(eventId) ? 'flare-target' : null;
}

function resolveAnchorContext(eventId: string, choiceId: string): EventItemUseContext | null {
  if (choiceId !== 'anchor') return null;
  if (ANCHOR_DROP_EVENTS.has(eventId)) return 'anchor-drop';
  return eventId === 'handyman' ? 'base' : null;
}

function resolveMapContext(eventId: string, choiceId: string): EventItemUseContext | null {
  if (choiceId !== 'map') return null;
  return eventId === 'leak' ? 'map-leak-patch' : 'map-read';
}

function resolveFishingNetContext(
  eventId: string,
  choiceId: string,
): EventItemUseContext | null {
  if (choiceId !== 'fishingNet') return null;
  return NET_SLAP_EVENTS.has(eventId) ? 'net-slap' : 'net-scoop';
}

function resolveFlashlightContext(eventId: string, choiceId: string): EventItemUseContext | null {
  if (choiceId !== 'flashlight') return null;
  return FLASHLIGHT_SIGNAL_EVENTS.has(eventId)
    ? 'flashlight-signal'
    : 'flashlight-threat-beam';
}

export function eventItemUseDuration(context: EventItemUseContext): number {
  const duration = EVENT_ITEM_USE_BASE_DURATIONS[context];
  return context === 'throw-target'
    ? scaleThrownItemDuration(duration)
    : scaleEventItemDuration(duration);
}

export function eventItemUseDurationForItem(
  context: EventItemUseContext,
  itemId: ItemId,
): number {
  const duration = eventItemUseDuration(context);
  if (
    context !== 'throw-target'
    || eventItemMotionProfile(itemId).mass === 'light'
  ) return duration;
  return duration * WEIGHTED_THROW_DURATION_MULTIPLIER;
}

function resetSample(output: EventItemUseSample): void {
  output.cameraSpaceBlend = 0;
  output.viewX = 0;
  output.viewY = 0;
  output.viewZ = 0;
  output.yaw = 0;
  output.pitch = 0;
  output.roll = 0;
  output.scaleX = 1;
  output.scaleY = 1;
  output.scaleZ = 1;
  output.cameraYaw = 0;
  output.cameraPitch = 0;
  output.cameraTargetBlend = 0;
  output.fovScale = 1;
  output.primaryEffect = 0;
  output.secondaryEffect = 0;
  output.effectKind = 'none';
  output.aimBlend = 0;
  output.targetBlend = 0;
  output.netSwing = false;
  output.ballisticFlight = false;
  output.flightArc = 0;
  output.flightArcHeight = 0;
  output.flightTarget = 'event';
  output.effectTravel = 0;
  output.effectArc = 0;
  output.itemVisible = true;
  output.surfaceFacing = 'default';
  output.minimumLiftY = 0;
}

function samplePickupAndHold(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
): void {
  const staged = output as StagedEventItemUseSample;
  const profile = staged[MOTION_PROFILE] ?? eventItemMotionProfile('cannedFood');
  const anticipate = staged[ANTICIPATE] ?? 0;
  output.cameraSpaceBlend = pickup;
  output.viewX = profile.view[0] * pickup;
  output.viewY = profile.view[1] * pickup - Math.sin(Math.PI * pickup) * 0.12;
  output.viewZ = -0.64 + (profile.view[2] + 0.64) * pickup;
  output.pitch = -0.08 * anticipate;
  output.roll = -0.04 * anticipate;
  output.aimBlend = profile.aim === 'none' ? 0 : hold;
}

function sampleThrowTarget(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
  itemId: ItemId | undefined,
): void {
  samplePickupAndHold(output, pickup, hold);
  const windUp = smoothstep((progress - 0.58) / 0.12);
  const flight = clamp01((progress - 0.7) / 0.3);
  let throwRoll = -0.36;
  if (itemId === 'baitTin' || itemId === 'energyBar') throwRoll = 0.22;
  if (itemId === 'swimRing') throwRoll = 0.68;
  output.viewX += 0.24 * windUp;
  output.viewY += 0.1 * windUp;
  output.viewZ += 0.12 * windUp;
  output.yaw = -0.3 * windUp;
  output.pitch += 0.22 * windUp;
  output.roll += throwRoll * windUp;
  output.cameraYaw = -0.035 * windUp;
  output.targetBlend = flight;
  output.ballisticFlight = flight > 0;
  output.flightArc = 4 * flight * (1 - flight);
  const spinDirection = itemId === 'baitTin' || itemId === 'energyBar' ? 1 : -1;
  output.pitch += spinDirection * flight * Math.PI * 2;
  output.roll += flight * Math.PI * (itemId === 'swimRing' ? 2 : 3);
  output.itemVisible = flight < 1;
}

function sampleTapeStretch(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'tape' : 'none';
  output.viewX -= 0.12 * action;
  output.yaw = 0.18 * action;
  output.scaleX = 1 + 0.72 * action;
  output.scaleY = 1 - 0.1 * action;
  output.primaryEffect = action;
}

function sampleCompassSearch(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const readingScale = 1 + 0.45 * hold;
  output.yaw = 0;
  output.pitch = 0;
  output.roll = 0;
  output.scaleX = readingScale;
  output.scaleY = readingScale;
  output.scaleZ = readingScale;
}

function sampleMapRead(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.viewX = -0.03 * pickup;
  output.viewY += 0.12 * hold;
  output.viewZ += 0.14 * hold;
  output.pitch = hold > 0 ? -0.08 * hold : 0;
  output.scaleX = 1 + 0.5 * hold;
  output.scaleY = 1 + 0.5 * hold;
  output.scaleZ = 1 + 0.5 * hold;

  const lookYaw = 0.2;
  if (progress < 0.44) {
    output.cameraYaw = 0;
  } else if (progress < 0.56) {
    const lookUpLeft = smoothstep((progress - 0.44) / 0.12);
    output.cameraYaw = lookYaw * lookUpLeft;
  } else if (progress < 0.62) {
    output.cameraYaw = lookYaw;
  } else if (progress < 0.78) {
    const lookAcross = smoothstep((progress - 0.62) / 0.16);
    output.cameraYaw = lookYaw * (1 - lookAcross * 2);
  } else if (progress < 0.84) {
    output.cameraYaw = -lookYaw;
  } else {
    const center = smoothstep((progress - 0.84) / 0.12);
    const remainingLook = 1 - center;
    output.cameraYaw = remainingLook === 0 ? 0 : -lookYaw * remainingLook;
  }
  output.roll = 0;
}

function sampleBinocularLook(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const approach = smoothstep((progress - 0.34) / 0.18);
  const passCamera = smoothstep((progress - 0.52) / 0.16);
  const mask = smoothstep((progress - 0.5) / 0.14);
  const targetLook = smoothstep((progress - 0.6) / 0.24);
  output.viewY += 0.2 * hold;
  output.viewZ += 0.62 * approach + 0.5 * passCamera;
  output.pitch = 0;
  output.scaleX = 1 + 0.35 * approach;
  output.scaleY = 1 + 0.35 * approach;
  output.scaleZ = 1 + 0.35 * approach;
  output.effectKind = mask > 0 ? 'binocular-mask' : 'none';
  output.fovScale = 1 - 0.24 * mask;
  output.primaryEffect = mask;
  output.secondaryEffect = passCamera;
  output.cameraTargetBlend = targetLook;
  output.itemVisible = progress < 0.68;
}

function sampleNetScoop(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  sampleBucketScoop(output, pickup, hold, progress, false);
  const closeHold = pickup
    * (1 - smoothstep((progress - 0.38) / 0.06));
  output.viewZ += NET_PICKUP_DEPTH * closeHold;
  output.pitch *= -1;
  output.aimBlend = 0;
}

function sampleNetSlap(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const swing = sampleNetAttackSwing(progress);
  const ready = smoothstep((progress - 0.36) / 0.14);
  const recovery = 1 - smoothstep((progress - 0.76) / 0.2);
  output.netSwing = true;
  output.yaw = -0.65 * swing;
  output.pitch = 1.1 * swing;
  output.roll = -0.35 * ready * recovery;
  output.aimBlend = ready * recovery;
  // Establish the grip before the fast arc; keep it steady through contact.
  output.targetBlend = ready * recovery;
  output.cameraTargetBlend = smoothstep((progress - 0.24) / 0.2) * recovery;
  output.primaryEffect = sampleNetAttackContact(progress);
}

function sampleNetItemUse(
  context: EventItemUseContext,
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): boolean {
  if (context === 'net-scoop') {
    sampleNetScoop(output, pickup, hold, progress);
    return true;
  }
  if (context === 'net-slap') {
    sampleNetSlap(output, pickup, hold, progress);
    return true;
  }
  return false;
}

function applyBucketBenchClearance(
  output: EventItemUseSample,
  pickup: number,
): void {
  output.viewX -= BUCKET_BENCH_CLEARANCE_X
    * pulse(pickup, 0.08, 0.52, 0.94);
}

function sampleBucketScoop(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
  clearBench = true,
): void {
  samplePickupAndHold(output, pickup, hold);
  if (clearBench) applyBucketBenchClearance(output, pickup);
  const gunwaleClearance = pulse(progress, 0.38, 0.44, 0.58);
  const outbound = smoothstep((progress - 0.44) / 0.26);
  const inbound = 1 - smoothstep((progress - 0.79) / 0.17);
  const travel = Math.min(outbound, inbound);
  const scoop = pulse(progress, 0.69, 0.75, 0.82);
  output.viewY += SCOOP_GUNWALE_CLEARANCE * gunwaleClearance
    + 0.1 * travel
    - 0.16 * scoop;
  output.viewZ += 0.08 * travel;
  output.yaw = -0.28 * travel;
  output.pitch = 0.32 * travel + 0.92 * scoop;
  output.roll = -0.24 * travel;
  output.cameraTargetBlend = Math.min(1, 1.5 * travel);
  output.targetBlend = travel;
  output.ballisticFlight = travel > 0;
  output.flightArc = 4 * travel * (1 - travel);
  output.flightArcHeight = SCOOP_FLIGHT_ARC_HEIGHT;
  output.flightTarget = 'bucket-water';
  output.primaryEffect = scoop;
}

function sampleBucketHelmet(
  output: EventItemUseSample,
  progress: number,
): void {
  const raise = smoothstep(
    (progress - BUCKET_HELMET_RAISE_START)
      / (BUCKET_HELMET_OVERHEAD_PROGRESS - BUCKET_HELMET_RAISE_START),
  );
  const lower = smoothstep(
    (progress - BUCKET_HELMET_LOWER_START)
      / (BUCKET_HELMET_LOWER_END - BUCKET_HELMET_LOWER_START),
  );
  const targetY = BUCKET_HELMET_OVERHEAD_Y
    + (BUCKET_HELMET_WORN_Y - BUCKET_HELMET_OVERHEAD_Y) * lower;
  output.cameraSpaceBlend = raise;
  output.viewX = BUCKET_HELMET_CENTER_X;
  output.viewY = targetY;
  output.viewZ = 0;
  const helmetScale = 1 + (BUCKET_HELMET_SCALE - 1) * raise;
  output.scaleX = helmetScale;
  output.scaleY = helmetScale;
  output.scaleZ = helmetScale;
  output.yaw = 0.08 * raise * (1 - lower);
  output.pitch = -Math.PI * raise;
  output.roll = -0.08 * raise * (1 - lower);
  output.primaryEffect = lower;
}

function sampleTradeHandover(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const offer = smoothstep((progress - 0.48) / 0.28);
  output.viewY += 0.12 * offer;
  output.viewZ -= 0.08 * offer;
  output.yaw += 0.08 * offer;
  output.pitch += 0.06 * offer;
  output.targetBlend = 0.92 * offer;
  output.cameraTargetBlend = 0.72 * offer;
  output.ballisticFlight = false;
}

function sampleRadioSignalReceive(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const listen = smoothstep((progress - 0.34) / 0.18) * hold;
  const staticJolt = pulse(progress, 0.5, 0.54, 0.62);
  const tuning = pulse(progress, 0.62, 0.74, 0.9);
  output.viewX += 0.1 * listen;
  output.viewY += 0.42 * listen;
  output.viewZ += 0.2 * listen;
  output.yaw = -0.38 * listen + 0.045 * staticJolt;
  output.pitch = -0.12 * listen;
  output.roll = -0.18 * listen + 0.035 * Math.sin(progress * Math.PI * 8) * tuning;
  output.cameraYaw = -0.08 * listen;
  output.cameraPitch = 0.035 * listen;
}

function sampleMapLeakPatch(
  output: EventItemUseSample,
  progress: number,
): void {
  const lift = smoothstep(
    (progress - MAP_PATCH_LIFT_START)
      / (MAP_PATCH_LIFT_END - MAP_PATCH_LIFT_START),
  );
  const travel = smoothstep(
    (progress - MAP_PATCH_TRAVEL_START)
      / (MAP_PATCH_TRAVEL_END - MAP_PATCH_TRAVEL_START),
  );
  samplePickupAndHold(output, travel, travel);
  const open = smoothstep((progress - 0.34) / 0.16);
  const align = smoothstep((progress - 0.44) / 0.18);
  const press = smoothstep((progress - 0.64) / 0.22);
  output.viewX -= 0.12 * open;
  output.viewY += 0.08 * open;
  output.pitch = 0;
  output.roll = -0.68 * open;
  output.scaleX = 1 + 0.28 * open;
  output.scaleY = 1 + 0.28 * open;
  output.scaleZ = 1 + 0.28 * open;
  output.targetBlend = 0.98 * press;
  output.flightArc = 4 * press * (1 - press);
  output.flightArcHeight = MAP_PATCH_TRAVEL_ARC_HEIGHT;
  output.aimBlend = align;
  output.cameraTargetBlend = 0.3 * align;
  output.ballisticFlight = false;
  output.surfaceFacing = 'target-plane-opposite';
  output.minimumLiftY = MAP_PATCH_MINIMUM_LIFT_Y * lift;
}

function sampleFlare(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const ready = pickup;
  const recoil = pulse(progress, 0.46, 0.5, 0.68);
  const launched = progress >= FLARE_GUN_ACTION_CUE_PROGRESSES[0]!;
  const travel = clamp01((progress - FLARE_GUN_ACTION_CUE_PROGRESSES[0]!) / 0.46);

  output.pitch = FLARE_GUN_READY_PITCH * ready - 0.16 * recoil;
  output.yaw = FLARE_GUN_READY_YAW * ready - 0.16 * recoil;
  output.roll = FLARE_GUN_READY_ROLL * ready + 0.06 * recoil;
  output.viewZ += 0.28 * recoil;
  output.effectKind = launched && travel < 1 ? 'flare' : 'none';
  output.primaryEffect = launched && travel < 1 ? 1 : 0;
  output.secondaryEffect = recoil;
  output.effectTravel = travel;
  output.effectArc = 4 * travel * (1 - travel);
}

function sampleAnchorDrop(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const windUp = smoothstep((progress - 0.38) / 0.16);
  const released = smoothstep((progress - 0.51) / 0.05);
  const flight = clamp01(
    (progress - ANCHOR_FLIGHT_START)
      / (ANCHOR_IMPACT_PROGRESS - ANCHOR_FLIGHT_START),
  );
  const flightArc = 4 * flight * (1 - flight);
  const lookStarboard = smoothstep((progress - 0.26) / 0.2);
  output.viewX += 0.26 * windUp;
  output.viewY += 0.18 * windUp;
  output.viewZ += 0.08 * windUp;
  output.yaw = -0.16 * windUp;
  output.pitch += 0.24 * windUp + flight * Math.PI * 1.15;
  output.roll += 0.46 * windUp + flight * Math.PI * 0.7;
  output.cameraYaw = -0.62 * lookStarboard;
  output.cameraPitch = lookStarboard * (0.3 * flightArc - 0.22 * flight);
  output.targetBlend = flight;
  output.ballisticFlight = flight > 0;
  output.flightArc = flightArc;
  output.flightArcHeight = 0.65;
  output.flightTarget = 'starboard-water';
  output.effectKind = released > 0 ? 'chain' : 'none';
  output.primaryEffect = released;
  output.secondaryEffect = flight;
  output.itemVisible = flight < 0.999;
}

function sampleUmbrella(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  shield: boolean,
  progress: number,
): void {
  if (shield) {
    const movement = smoothstep(progress);
    output.cameraSpaceBlend = movement;
    output.viewX = 0;
    output.viewY = UMBRELLA_SHIELD_VIEW_Y;
    output.viewZ = UMBRELLA_SHIELD_VIEW_Z;
    const scale = 1 + (UMBRELLA_SHIELD_SCALE - 1) * movement;
    output.scaleX = scale;
    output.scaleY = scale;
    output.scaleZ = scale;
    output.aimBlend = movement;
    return;
  }
  samplePickupAndHold(output, pickup, hold);
  output.viewX = 0;
  output.pitch = UMBRELLA_OVERHEAD_ROTATION.pitch * pickup;
  output.yaw = UMBRELLA_OVERHEAD_ROTATION.yaw * pickup;
  output.roll = UMBRELLA_OVERHEAD_ROTATION.roll * pickup;
}

function sampleFlashlightMorse(progress: number): number {
  const edge = 0.004;
  for (let index = 0; index < FLASHLIGHT_MORSE_INTERVALS.length; index += 1) {
    const interval = FLASHLIGHT_MORSE_INTERVALS[index]!;
    if (progress < interval[0] || progress > interval[1]) continue;
    return Math.min(
      smoothstep((progress - interval[0]) / edge),
      1 - smoothstep((progress - (interval[1] - edge)) / edge),
    );
  }
  return 0;
}

function sampleFlashlightSignal(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const ready = smoothstep((progress - 0.34) / 0.08) * hold;
  const signal = sampleFlashlightMorse(progress);
  output.effectKind = signal > 0 ? 'flashlight' : 'none';
  output.roll = -0.1 * ready - 0.025 * signal;
  output.primaryEffect = signal;
  output.secondaryEffect = signal;
}

function sampleFlashlightThreatBeam(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const ready = smoothstep((progress - 0.34) / 0.08) * hold;
  const fade = 1 - smoothstep((progress - 0.9) / 0.08);
  const beam = ready * fade;
  output.effectKind = beam > 0 ? 'flashlight' : 'none';
  output.roll = -0.1 * ready + 0.025 * Math.sin(progress * Math.PI * 2) * ready;
  output.primaryEffect = beam;
  output.secondaryEffect = beam;
}

function sampleShotgunFire(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  smoke: number,
  smokeTravel: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = smoke > 0 ? 'shotgun-smoke' : 'none';
  output.viewZ += 0.28 * action;
  output.yaw = -0.16 * action;
  output.pitch = 0.16 * action;
  output.roll = -0.06 * action;
  output.primaryEffect = smoke;
  output.secondaryEffect = smokeTravel;
}

function sampleKnifeStab(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, hold, hold);
  const aimIn = smoothstep(
    (progress - KNIFE_AIM_START) / (KNIFE_AIM_END - KNIFE_AIM_START),
  );
  const aimOut = 1 - smoothstep(
    (progress - KNIFE_RETRACT_END) / (KNIFE_GRIP_RETURN_END - KNIFE_RETRACT_END),
  );
  const stab = smoothstep(
    (progress - KNIFE_STAB_START) / (KNIFE_CONTACT_PROGRESS - KNIFE_STAB_START),
  ) * (1 - smoothstep(
    (progress - KNIFE_RETRACT_START) / (KNIFE_RETRACT_END - KNIFE_RETRACT_START),
  ));
  output.yaw = KNIFE_GRIP_YAW * hold;
  output.pitch = 0;
  output.roll = KNIFE_GRIP_ROLL * hold;
  output.aimBlend = aimIn * aimOut * hold;
  output.viewY += KNIFE_READY_LIFT * output.aimBlend;
  output.targetBlend = stab;
  output.flightArc = 4 * stab * (1 - stab);
  output.flightArcHeight = KNIFE_GUNWALE_CLEARANCE_HEIGHT;
  output.primaryEffect = stab;
}

export function sampleEventItemUse(
  context: EventItemUseContext,
  progress: number,
  output: EventItemUseSample,
): void;
export function sampleEventItemUse(
  context: EventItemUseContext,
  itemId: ItemId,
  progress: number,
  output: EventItemUseSample,
): void;
export function sampleEventItemUse(
  context: EventItemUseContext,
  itemIdOrProgress: ItemId | number,
  progressOrOutput: number | EventItemUseSample,
  optionalOutput?: EventItemUseSample,
): void {
  const itemId = typeof itemIdOrProgress === 'string' ? itemIdOrProgress : undefined;
  const progress = typeof itemIdOrProgress === 'number'
    ? itemIdOrProgress
    : progressOrOutput as number;
  const output = optionalOutput ?? progressOrOutput as EventItemUseSample;
  resetSample(output);

  const t = clamp01(progress);
  const anticipate = pulse(t, 0, 0.07, 0.14);
  const liftCompletion = liftCompletionForItem(itemId ?? 'cannedFood');
  const pickup = smoothstep((t - ITEM_LIFT_START) / (liftCompletion - ITEM_LIFT_START));
  const hold = Math.min(pickup, 1);
  const settle = pulse(t, 0.32, 0.42, 0.52);
  const action = pulse(t, 0.48, 0.7, 0.9);
  const staged = output as StagedEventItemUseSample;
  staged[MOTION_PROFILE] = eventItemMotionProfile(itemId ?? 'cannedFood');
  staged[ANTICIPATE] = anticipate;

  if (!sampleHeldEventItemUse(context, output, pickup, hold, action, t)) {
    sampleTargetedEventItemUse(context, output, itemId, pickup, hold, t);
  }

  if (!SETTLE_ROLL_EXCLUDED_CONTEXTS.has(context)) {
    output.roll += 0.03 * settle;
  }
}

function sampleHeldEventItemUse(
  context: EventItemUseContext,
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  progress: number,
): boolean {
  switch (context) {
    case 'base': samplePickupAndHold(output, pickup, hold); return true;
    case 'tape-stretch': sampleTapeStretch(output, pickup, hold, action); return true;
    case 'compass-search': sampleCompassSearch(output, pickup, hold); return true;
    case 'map-read': sampleMapRead(output, pickup, hold, progress); return true;
    case 'binocular-look': sampleBinocularLook(output, pickup, hold, progress); return true;
    case 'bucket-helmet': sampleBucketHelmet(output, progress); return true;
    case 'trade-handover': sampleTradeHandover(output, pickup, hold, progress); return true;
    case 'radio-signal-receive': sampleRadioSignalReceive(output, pickup, hold, progress); return true;
    case 'umbrella-overhead': sampleUmbrella(output, pickup, hold, false, progress); return true;
    case 'umbrella-shield': sampleUmbrella(output, pickup, hold, true, progress); return true;
    default: return false;
  }
}

function sampleTargetedEventItemUse(
  context: EventItemUseContext,
  output: EventItemUseSample,
  itemId: ItemId | undefined,
  pickup: number,
  hold: number,
  progress: number,
): void {
  if (sampleNetItemUse(context, output, pickup, hold, progress)) return;
  switch (context) {
    case 'throw-target': sampleThrowTarget(output, pickup, hold, progress, itemId); break;
    case 'bucket-scoop': sampleBucketScoop(output, pickup, hold, progress); break;
    case 'map-leak-patch': sampleMapLeakPatch(output, progress); break;
    case 'flare-target': sampleFlare(output, pickup, hold, progress); break;
    case 'flare-sky': sampleFlare(output, pickup, hold, progress); break;
    case 'anchor-drop': sampleAnchorDrop(output, pickup, hold, progress); break;
    case 'flashlight-threat-beam': sampleFlashlightThreatBeam(output, pickup, hold, progress); break;
    case 'flashlight-signal': sampleFlashlightSignal(output, pickup, hold, progress); break;
    case 'shotgun-fire': sampleShotgunFire(
      output,
      pickup,
      hold,
      pulse(progress, 0.42, 0.5, 0.68),
      pulse(progress, 0.46, 0.53, 0.66),
      smoothstep((progress - 0.46) / 0.2),
    ); break;
    case 'knife-stab': sampleKnifeStab(output, pickup, hold, progress); break;
  }
}

function liftCompletionForMass(mass: EventItemMass): number {
  switch (mass) {
    case 'light': return MAP_LIFT_COMPLETION;
    case 'medium': return 0.38;
    case 'heavy': return 0.44;
  }
}

function liftCompletionForItem(itemId: ItemId): number {
  return itemId === 'bucket'
    ? MAP_LIFT_COMPLETION
    : liftCompletionForMass(eventItemMotionProfile(itemId).mass);
}

export function eventItemActionCueProgresses(
  context: EventItemUseContext,
): readonly number[] {
  const meleeCues = meleeActionCueProgresses(context);
  if (meleeCues !== null) return meleeCues;
  if (context === 'shotgun-fire') return SHOTGUN_ACTION_CUE_PROGRESSES;
  if (context === 'anchor-drop') return ANCHOR_ACTION_CUE_PROGRESSES;
  if (context === 'tape-stretch') return TAPE_ACTION_CUE_PROGRESSES;
  if (context === 'map-leak-patch') return MAP_PATCH_ACTION_CUE_PROGRESSES;
  if (context === 'flare-target' || context === 'flare-sky') {
    return FLARE_GUN_ACTION_CUE_PROGRESSES;
  }
  if (context === 'flashlight-threat-beam') return FLASHLIGHT_THREAT_CUE_PROGRESSES;
  if (context === 'flashlight-signal') return FLASHLIGHT_MORSE_CUE_PROGRESSES;
  if (context === 'radio-signal-receive') return RADIO_SIGNAL_CUE_PROGRESSES;
  if (context === 'bucket-helmet') return BUCKET_HELMET_RAIN_CUE_PROGRESSES;
  return NO_ACTION_CUE_PROGRESSES;
}

function meleeActionCueProgresses(
  context: EventItemUseContext,
): readonly number[] | null {
  if (context === 'knife-stab') return KNIFE_ACTION_CUE_PROGRESSES;
  if (context === 'net-slap') return NET_SLAP_ACTION_CUE_PROGRESSES;
  return null;
}

export function sampleEventItemOutcome(
  context: EventItemUseContext,
  itemId: ItemId,
  disposition: EventItemDisposition,
  progress: number,
  output: EventItemUseSample,
): void {
  sampleEventItemUse(context, itemId, 1, output);
  const t = clamp01(progress);
  const profile = eventItemMotionProfile(itemId);

  if (sampleImmediateEventItemOutcome(
    context, itemId, disposition, t, profile, output,
  )) return;

  if (disposition === 'depart') {
    output.targetBlend = t;
    output.aimBlend = profile.aim === 'none' ? 0 : 1 - t;
    output.itemVisible = t < 1;
    return;
  }

  if (sampleRecoveringEventItemOutcome(context, itemId, t, profile, output)) return;
  sampleDefaultEventItemOutcome(t, profile, output);
}

function sampleImmediateEventItemOutcome(
  context: EventItemUseContext,
  itemId: ItemId,
  disposition: EventItemDisposition,
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): boolean {
  switch (context) {
    case 'throw-target': output.itemVisible = false; return true;
    case 'bucket-helmet': return true;
    case 'umbrella-shield': return true;
    case 'trade-handover': sampleTradeOutcome(itemId, disposition, progress, output); return true;
    case 'shotgun-fire': sampleShotgunOutcome(progress, output); return true;
    case 'binocular-look': sampleBinocularOutcome(progress, output); return true;
    case 'flare-target': sampleFlareOutcome(progress, output); return true;
    case 'flare-sky': sampleFlareOutcome(progress, output); return true;
    case 'umbrella-overhead': sampleUmbrellaOutcome(progress, output); return true;
    case 'tape-stretch': sampleTapeOutcome(progress, profile, output); return true;
    default: return false;
  }
}

function sampleTradeOutcome(
  itemId: ItemId,
  disposition: EventItemDisposition,
  progress: number,
  output: EventItemUseSample,
): void {
  if (disposition === 'depart') {
    output.targetBlend = 0.88 + 0.12 * smoothstep(progress);
    output.cameraTargetBlend = 0.12 * (1 - smoothstep(progress));
  } else {
    sampleEventItemUse('trade-handover', itemId, 1 - smoothstep(progress), output);
  }
  output.itemVisible = progress < 1;
}

function sampleShotgunOutcome(progress: number, output: EventItemUseSample): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  samplePickupAndHold(output, pickup, pickup);
  output.itemVisible = progress < 1;
}

function sampleBinocularOutcome(progress: number, output: EventItemUseSample): void {
  resetSample(output);
  const mask = 1 - smoothstep(progress);
  output.effectKind = mask > 0 ? 'binocular-mask' : 'none';
  output.primaryEffect = mask;
  output.fovScale = 1 - 0.24 * mask;
  output.cameraTargetBlend = mask;
  output.itemVisible = false;
}

function sampleFlareOutcome(progress: number, output: EventItemUseSample): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  sampleFlare(output, pickup, pickup, 1);
  output.itemVisible = progress < 1;
}

function sampleUmbrellaOutcome(progress: number, output: EventItemUseSample): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  sampleUmbrella(output, pickup, pickup, false, 1);
  output.itemVisible = progress < 1;
}

function sampleTapeOutcome(
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  const staged = output as StagedEventItemUseSample;
  staged[MOTION_PROFILE] = profile;
  staged[ANTICIPATE] = 0;
  sampleTapeStretch(output, pickup, pickup, 0);
  output.itemVisible = progress < 1;
}

function sampleRecoveringEventItemOutcome(
  context: EventItemUseContext,
  itemId: ItemId,
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): boolean {
  switch (context) {
    case 'net-slap':
      sampleEventItemUse(context, itemId, 1, output);
      output.cameraSpaceBlend *= 1 - smoothstep(progress);
      return true;
    case 'knife-stab': sampleKnifeOutcome(itemId, progress, output); return true;
    case 'map-read': sampleMapOutcome(itemId, progress, output); return true;
    case 'compass-search': sampleCompassOutcome(progress, profile, output); return true;
    case 'radio-signal-receive': sampleRadioOutcome(progress, profile, output); return true;
    case 'flashlight-threat-beam': sampleFlashlightOutcome(context, progress, output); return true;
    case 'flashlight-signal': sampleFlashlightOutcome(context, progress, output); return true;
  }
  if (itemId === 'bucket') {
    sampleBucketOutcome(progress, profile, output);
    return true;
  }
  if (context !== 'net-scoop') return false;
  sampleNetOutcome(progress, profile, output);
  return true;
}

function sampleKnifeOutcome(
  itemId: ItemId,
  progress: number,
  output: EventItemUseSample,
): void {
  sampleEventItemUse('knife-stab', itemId, 1, output);
  const returnProgress = smoothstep(
    (progress - KNIFE_RETURN_HOLD_PROGRESS) / (1 - KNIFE_RETURN_HOLD_PROGRESS),
  );
  const remaining = 1 - returnProgress;
  if (remaining === 0) {
    output.cameraSpaceBlend = 0;
    output.yaw = 0;
    output.pitch = 0;
    output.roll = 0;
    output.aimBlend = 0;
    output.cameraYaw = 0;
    output.cameraPitch = 0;
    output.cameraTargetBlend = 0;
    output.targetBlend = 0;
    output.primaryEffect = 0;
    output.itemVisible = true;
    return;
  }
  output.cameraSpaceBlend *= remaining;
  output.yaw *= remaining;
  output.pitch *= remaining;
  output.roll *= remaining;
  output.aimBlend *= remaining;
  output.cameraYaw *= remaining;
  output.cameraPitch *= remaining;
  output.cameraTargetBlend = 0;
  output.targetBlend = 0;
  output.primaryEffect = 0;
  output.itemVisible = true;
}

function sampleMapOutcome(
  itemId: ItemId,
  progress: number,
  output: EventItemUseSample,
): void {
  sampleEventItemUse('map-read', itemId, MAP_LOOK_COMPLETION * (1 - progress), output);
}

function sampleCompassOutcome(
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  const staged = output as StagedEventItemUseSample;
  staged[MOTION_PROFILE] = profile;
  sampleCompassSearch(output, pickup, pickup);
  output.itemVisible = progress < 1;
}

function sampleRadioOutcome(
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  const staged = output as StagedEventItemUseSample;
  staged[MOTION_PROFILE] = profile;
  sampleRadioSignalReceive(output, pickup, pickup, 1);
  output.itemVisible = true;
}

function sampleFlashlightOutcome(
  context: 'flashlight-threat-beam' | 'flashlight-signal',
  progress: number,
  output: EventItemUseSample,
): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  if (context === 'flashlight-signal') {
    sampleFlashlightSignal(output, pickup, pickup, 1);
  } else {
    sampleFlashlightThreatBeam(output, pickup, pickup, 1);
  }
  output.itemVisible = progress < 1;
}

function sampleBucketOutcome(
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  const staged = output as StagedEventItemUseSample;
  staged[MOTION_PROFILE] = profile;
  samplePickupAndHold(output, pickup, pickup);
  applyBucketBenchClearance(output, pickup);
  output.itemVisible = progress < 1;
}

function sampleNetOutcome(
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): void {
  resetSample(output);
  const pickup = 1 - smoothstep(progress);
  const staged = output as StagedEventItemUseSample;
  staged[MOTION_PROFILE] = profile;
  samplePickupAndHold(output, pickup, pickup);
  output.aimBlend = 0;
  output.itemVisible = progress < 1;
}

function sampleDefaultEventItemOutcome(
  progress: number,
  profile: ReturnType<typeof eventItemMotionProfile>,
  output: EventItemUseSample,
): void {
  const returnToGrip = smoothstep(progress / 0.5);
  if (progress <= 0.5) {
    output.viewX += (profile.grip[0] - output.viewX) * returnToGrip;
    output.viewY += (profile.grip[1] - output.viewY) * returnToGrip;
    output.viewZ += (profile.grip[2] - output.viewZ) * returnToGrip;
  } else {
    const stow = smoothstep((progress - 0.5) / 0.5);
    output.viewX = profile.grip[0];
    output.viewY = profile.grip[1] + (-1.35 - profile.grip[1]) * stow;
    output.viewZ = profile.grip[2];
  }
  output.aimBlend = 0;
  output.itemVisible = progress < 1;
}

export function eventItemOutcomeDuration(
  itemId: ItemId,
  disposition: EventItemDisposition,
): number {
  if (disposition !== 'depart') {
    const recoveryDuration = eventItemRecoveryDuration(itemId);
    if (recoveryDuration !== null) return recoveryDuration;
  }
  const fixedDuration = fixedEventItemOutcomeDuration(itemId);
  if (fixedDuration !== null) return fixedDuration;
  const mass = eventItemMotionProfile(itemId).mass;
  const base = disposition === 'depart' ? 0.5 : 0.7;
  return scaleEventItemDuration(base + eventItemMassDurationOffset(mass));
}

function eventItemRecoveryDuration(itemId: ItemId): number | null {
  switch (itemId) {
    case 'compass': return eventItemUseDuration('compass-search')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
    case 'map': return eventItemUseDuration('map-read') * MAP_LOOK_COMPLETION;
    case 'flashlight': return eventItemUseDuration('flashlight-signal')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
    case 'bucket': return eventItemUseDuration('flashlight-signal')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
    case 'fishingNet': return eventItemUseDuration('net-scoop')
      * (liftCompletionForMass(eventItemMotionProfile(itemId).mass) - ITEM_LIFT_START);
    default: return null;
  }
}

function fixedEventItemOutcomeDuration(itemId: ItemId): number | null {
  switch (itemId) {
    case 'shotgun': {
      const liftWindow = liftCompletionForMass(
        eventItemMotionProfile(itemId).mass,
      ) - ITEM_LIFT_START;
      return eventItemUseDuration('shotgun-fire') * liftWindow;
    }
    case 'spyglass': return scaleEventItemDuration(0.45);
    case 'ductTape': return eventItemUseDuration('tape-stretch')
      * (liftCompletionForItem(itemId) - ITEM_LIFT_START);
    default: return null;
  }
}

function eventItemMassDurationOffset(mass: EventItemMass): number {
  switch (mass) {
    case 'heavy': return 0.18;
    case 'medium': return 0.09;
    case 'light': return 0;
  }
}
