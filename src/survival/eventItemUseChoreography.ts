import type { ItemId } from '../game/ItemState';
import { clamp01, pulse, smoothstep } from './animationMath';
import { eventItemMotionProfile, type EventItemMass } from './eventItemMotionProfile';
import { scaleEventItemDuration, scaleThrownItemDuration } from './eventItemTiming';

export type EventItemUseContext =
  | 'base' | 'throw-target' | 'tape-stretch' | 'compass-search' | 'map-read'
  | 'binocular-look' | 'net-scoop' | 'bucket-scoop' | 'bucket-helmet'
  | 'trade-handover' | 'cover-supplies' | 'net-spread' | 'map-leak-patch'
  | 'flare-target' | 'flare-sky' | 'anchor-drop'
  | 'umbrella-overhead' | 'umbrella-shield'
  | 'flashlight-threat-beam' | 'flashlight-signal' | 'shotgun-fire';

export type EventItemEffectKind =
  | 'none' | 'tape' | 'binocular-mask'
  | 'flare' | 'chain' | 'flashlight' | 'shotgun-smoke';

export type EventItemSurfaceFacing = 'default' | 'none' | 'target';

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
const FLARE_GUN_ACTION_CUE_PROGRESSES = Object.freeze([0.46, 0.54]);
const FLARE_GUN_READY_YAW = -Math.PI / 2 + 0.22;
const FLARE_GUN_READY_PITCH = 1.25;
const FLARE_GUN_READY_ROLL = -Math.PI / 2;
const UMBRELLA_OVERHEAD_ROTATION = Object.freeze({
  pitch: -0.7361036000458032,
  yaw: 1.3933992747114876,
  roll: -1.4509371355345577,
});
const UMBRELLA_SHIELD_ROTATION = Object.freeze({
  pitch: 0.04275258056186774,
  yaw: 0.7154158991967178,
  roll: 0.25535318456913286,
});
const ANCHOR_FLIGHT_START = 0.56;
const ANCHOR_IMPACT_PROGRESS = 0.84;
const ANCHOR_ACTION_CUE_PROGRESSES = Object.freeze([ANCHOR_IMPACT_PROGRESS]);
const TAPE_ACTION_CUE_PROGRESSES = Object.freeze([0.5]);
const WEIGHTED_THROW_DURATION_MULTIPLIER = 1.15;
const SCOOP_DURATION = 1.65;
const SCOOP_FLIGHT_ARC_HEIGHT = 0.9;
const SCOOP_GUNWALE_CLEARANCE = 0.28;
const NET_PICKUP_DEPTH = 0.14;
const BUCKET_BENCH_CLEARANCE_X = 0.32;
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
  ballisticFlight: boolean;
  flightArc: number;
  flightArcHeight: number;
  flightTarget: EventItemFlightTarget;
  effectTravel: number;
  effectArc: number;
  itemVisible: boolean;
  surfaceFacing: EventItemSurfaceFacing;
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
const FLARE_TARGET_EVENTS: ReadonlySet<string> = new Set(['ghosts']);
const BASE_BUCKET_EVENTS: ReadonlySet<string> = new Set(['flowers']);
const BASE_FLARE_EVENTS: ReadonlySet<string> = new Set(['shadow-figure']);
const TRADE_EVENTS: ReadonlySet<string> = new Set(['night-trader', 'handyman']);
const COVER_SUPPLY_MAP_EVENTS: ReadonlySet<string> = new Set([
  'shower-night', 'windy-night',
]);
const NET_SPREAD_EVENTS: ReadonlySet<string> = new Set([
  'windy-night', 'swarm-of-anglerfish',
]);
const FLASHLIGHT_SIGNAL_EVENTS: ReadonlySet<string> = new Set([
  'other-people', 'plane',
]);

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
    ballisticFlight: false,
    flightArc: 0,
    flightArcHeight: 0,
    flightTarget: 'event',
    effectTravel: 0,
    effectArc: 0,
    itemVisible: true,
    surfaceFacing: 'default',
  };
}

export function resolveEventItemUseContext(
  eventId: string,
  choiceId: string,
  itemId: ItemId,
): EventItemUseContext | null {
  if (TRADE_EVENTS.has(eventId)) return 'trade-handover';
  if (itemId === 'bucket' && choiceId === 'bucket') {
    if (BUCKET_SCOOP_EVENTS.has(eventId)) return 'bucket-scoop';
    if (BUCKET_HELMET_EVENTS.has(eventId)) return 'bucket-helmet';
    return BASE_BUCKET_EVENTS.has(eventId) ? 'base' : null;
  }
  if (itemId === 'umbrella' && choiceId === 'umbrella') {
    if (eventId === 'windy-night') return 'cover-supplies';
    if (UMBRELLA_OVERHEAD_EVENTS.has(eventId)) return 'umbrella-overhead';
    if (UMBRELLA_SHIELD_EVENTS.has(eventId)) return 'umbrella-shield';
    return null;
  }
  if (itemId === 'flareGun' && choiceId === 'flareGun') {
    if (FLARE_SKY_EVENTS.has(eventId)) return 'flare-sky';
    if (FLARE_TARGET_EVENTS.has(eventId)) return 'flare-target';
    return BASE_FLARE_EVENTS.has(eventId) ? 'base' : null;
  }
  if (
    itemId === 'anchor'
    && choiceId === 'anchor'
    && (
      eventId === 'tornado'
      || eventId === 'thunderstorm'
      || eventId === 'restless-waves'
    )
  ) {
    return 'anchor-drop';
  }
  if (itemId === 'anchor' && choiceId === 'anchor' && eventId === 'handyman') {
    return 'base';
  }
  if (itemId === 'scubaSet' && choiceId === 'dive' && eventId === 'wreckage') {
    return 'base';
  }
  if (
    itemId === 'cannedFood'
    && (choiceId === 'food' || choiceId === 'cannedFood')
  ) return 'throw-target';
  if (
    itemId === 'baitTin'
    && (choiceId === 'bait' || choiceId === 'baitTin')
  ) return 'throw-target';
  if (itemId === 'medicalKit' && choiceId === 'medicalKit') return 'throw-target';
  if (itemId === 'energyBar' && choiceId === 'energyBar') return 'throw-target';
  if (itemId === 'swimRing' && choiceId === 'swimRing') return 'throw-target';
  if (itemId === 'ductTape' && choiceId === 'ductTape') return 'tape-stretch';
  if (itemId === 'compass' && choiceId === 'compass') return 'compass-search';
  if (itemId === 'map' && choiceId === 'map') {
    if (eventId === 'leak') return 'map-leak-patch';
    if (COVER_SUPPLY_MAP_EVENTS.has(eventId)) return 'cover-supplies';
    return 'map-read';
  }
  if (itemId === 'spyglass' && choiceId === 'spyglass') return 'binocular-look';
  if (itemId === 'fishingNet' && choiceId === 'fishingNet') {
    return NET_SPREAD_EVENTS.has(eventId) ? 'net-spread' : 'net-scoop';
  }
  if (itemId === 'rope' && choiceId === 'rope') return 'base';
  if (itemId === 'flashlight' && choiceId === 'flashlight') {
    return FLASHLIGHT_SIGNAL_EVENTS.has(eventId)
      ? 'flashlight-signal'
      : 'flashlight-threat-beam';
  }
  if (itemId === 'shotgun' && choiceId === 'shotgun') return 'shotgun-fire';
  return null;
}

export function eventItemUseDuration(context: EventItemUseContext): number {
  switch (context) {
    case 'base': return scaleEventItemDuration(1.35);
    case 'throw-target': return scaleThrownItemDuration(1.35);
    case 'tape-stretch': return scaleEventItemDuration(1.45);
    case 'compass-search': return scaleEventItemDuration(1.6);
    case 'map-read': return scaleEventItemDuration(1.55);
    case 'binocular-look': return scaleEventItemDuration(1.7);
    case 'net-scoop': return scaleEventItemDuration(SCOOP_DURATION);
    case 'bucket-scoop': return scaleEventItemDuration(SCOOP_DURATION);
    case 'bucket-helmet': return scaleEventItemDuration(1.45);
    case 'trade-handover': return scaleEventItemDuration(1.35);
    case 'cover-supplies': return scaleEventItemDuration(1.5);
    case 'net-spread': return scaleEventItemDuration(1.55);
    case 'map-leak-patch': return scaleEventItemDuration(1.5);
    case 'flare-target': return scaleEventItemDuration(1.5);
    case 'flare-sky': return scaleEventItemDuration(1.65);
    case 'anchor-drop': return scaleEventItemDuration(1.6);
    case 'umbrella-overhead': return scaleEventItemDuration(1.45);
    case 'umbrella-shield': return scaleEventItemDuration(1.35);
    case 'flashlight-threat-beam': return scaleEventItemDuration(1.45);
    case 'flashlight-signal': return scaleEventItemDuration(1.7);
    case 'shotgun-fire': return scaleEventItemDuration(1.2);
  }
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
  output.ballisticFlight = false;
  output.flightArc = 0;
  output.flightArcHeight = 0;
  output.flightTarget = 'event';
  output.effectTravel = 0;
  output.effectArc = 0;
  output.itemVisible = true;
  output.surfaceFacing = 'default';
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
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const readingScale = 1 + 0.45 * hold;
  const turnLeft = pulse(progress, 0.42, 0.55, 0.68);
  const turnRight = pulse(progress, 0.64, 0.77, 0.9);
  output.yaw = 0.14 * (turnLeft - turnRight);
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
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  applyBucketBenchClearance(output, pickup);
  output.viewX *= 1 - action;
  output.viewY += 0.68 * action;
  output.viewZ += 0.68 * action;
  output.yaw = 0.08 * action;
  output.pitch = -Math.PI * 0.78 * action;
  output.roll = -0.08 * action;
  output.primaryEffect = action;
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
  output.targetBlend = 0.88 * offer;
  output.cameraTargetBlend = 0.12 * offer;
  output.ballisticFlight = false;
}

function sampleCoverSupplies(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  itemId: ItemId | undefined,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.viewX += (0.52 - output.viewX) * action;
  output.viewY += (-0.58 - output.viewY) * action;
  output.viewZ += (-1.02 - output.viewZ) * action;
  output.yaw = 0.24 * action;
  output.pitch = (itemId === 'umbrella' ? -0.28 : -0.16) * action;
  output.roll = (itemId === 'umbrella' ? -1.28 : -0.92) * action;
  output.surfaceFacing = 'none';
}

function sampleNetSpread(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.viewX -= 0.22 * action;
  output.viewY += 0.44 * action;
  output.viewZ += 0.08 * action;
  output.yaw = 0.22 * action;
  output.pitch = -1.08 * action;
  output.roll = -0.34 * action;
  output.aimBlend = 0;
}

function sampleMapLeakPatch(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  const open = smoothstep((progress - 0.34) / 0.16);
  const press = smoothstep((progress - 0.5) / 0.22);
  output.viewX -= 0.12 * open;
  output.viewY += 0.08 * open;
  output.roll = -0.68 * open;
  output.scaleX = 1 + 0.28 * open;
  output.scaleY = 1 + 0.28 * open;
  output.scaleZ = 1 + 0.28 * open;
  output.targetBlend = 0.94 * press;
  output.aimBlend = press;
  output.cameraTargetBlend = 0.24 * press;
  output.ballisticFlight = false;
  output.surfaceFacing = 'target';
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
): void {
  samplePickupAndHold(output, pickup, hold);
  if (!shield) output.viewX = 0;
  const rotation = shield
    ? UMBRELLA_SHIELD_ROTATION
    : UMBRELLA_OVERHEAD_ROTATION;
  output.pitch = rotation.pitch * pickup;
  output.yaw = rotation.yaw * pickup;
  output.roll = rotation.roll * pickup;
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

  switch (context) {
    case 'base': samplePickupAndHold(output, pickup, hold); break;
    case 'throw-target': sampleThrowTarget(output, pickup, hold, t, itemId); break;
    case 'tape-stretch': sampleTapeStretch(output, pickup, hold, action); break;
    case 'compass-search': sampleCompassSearch(output, pickup, hold, t); break;
    case 'map-read': sampleMapRead(output, pickup, hold, t); break;
    case 'binocular-look': sampleBinocularLook(output, pickup, hold, t); break;
    case 'net-scoop': sampleNetScoop(output, pickup, hold, t); break;
    case 'bucket-scoop': sampleBucketScoop(output, pickup, hold, t); break;
    case 'bucket-helmet': sampleBucketHelmet(output, pickup, hold, action); break;
    case 'trade-handover': sampleTradeHandover(output, pickup, hold, t); break;
    case 'cover-supplies': sampleCoverSupplies(output, pickup, hold, action, itemId); break;
    case 'net-spread': sampleNetSpread(output, pickup, hold, action); break;
    case 'map-leak-patch': sampleMapLeakPatch(output, pickup, hold, t); break;
    case 'flare-target': sampleFlare(output, pickup, hold, t); break;
    case 'flare-sky': sampleFlare(output, pickup, hold, t); break;
    case 'anchor-drop': sampleAnchorDrop(output, pickup, hold, t); break;
    case 'umbrella-overhead': sampleUmbrella(output, pickup, hold, false); break;
    case 'umbrella-shield': sampleUmbrella(output, pickup, hold, true); break;
    case 'flashlight-threat-beam':
      sampleFlashlightThreatBeam(output, pickup, hold, t);
      break;
    case 'flashlight-signal': sampleFlashlightSignal(output, pickup, hold, t); break;
    case 'shotgun-fire':
      sampleShotgunFire(
        output,
        pickup,
        hold,
        pulse(t, 0.42, 0.5, 0.68),
        pulse(t, 0.46, 0.53, 0.66),
        smoothstep((t - 0.46) / 0.2),
      );
      break;
  }

  if (
    context !== 'map-read'
    && context !== 'net-scoop'
    && context !== 'map-leak-patch'
  ) {
    output.roll += 0.03 * settle;
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
  if (context === 'shotgun-fire') return SHOTGUN_ACTION_CUE_PROGRESSES;
  if (context === 'anchor-drop') return ANCHOR_ACTION_CUE_PROGRESSES;
  if (context === 'tape-stretch') return TAPE_ACTION_CUE_PROGRESSES;
  if (context === 'flare-target' || context === 'flare-sky') {
    return FLARE_GUN_ACTION_CUE_PROGRESSES;
  }
  if (context === 'flashlight-threat-beam') return FLASHLIGHT_THREAT_CUE_PROGRESSES;
  if (context === 'flashlight-signal') return FLASHLIGHT_MORSE_CUE_PROGRESSES;
  return NO_ACTION_CUE_PROGRESSES;
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

  if (context === 'throw-target') {
    output.itemVisible = false;
    return;
  }

  if (context === 'trade-handover' && disposition === 'depart') {
    output.targetBlend = 0.88 + 0.12 * smoothstep(t);
    output.cameraTargetBlend = 0.12 * (1 - smoothstep(t));
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'trade-handover' || context === 'map-leak-patch') {
    sampleEventItemUse(context, itemId, 1 - smoothstep(t), output);
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'shotgun-fire') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    samplePickupAndHold(output, pickup, pickup);
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'binocular-look') {
    resetSample(output);
    const mask = 1 - smoothstep(t);
    output.effectKind = mask > 0 ? 'binocular-mask' : 'none';
    output.primaryEffect = mask;
    output.fovScale = 1 - 0.24 * mask;
    output.cameraTargetBlend = mask;
    output.itemVisible = false;
    return;
  }

  if (context === 'flare-target' || context === 'flare-sky') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    sampleFlare(output, pickup, pickup, 1);
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'umbrella-overhead' || context === 'umbrella-shield') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    sampleUmbrella(output, pickup, pickup, context === 'umbrella-shield');
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'tape-stretch') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    const staged = output as StagedEventItemUseSample;
    staged[MOTION_PROFILE] = profile;
    staged[ANTICIPATE] = 0;
    sampleTapeStretch(output, pickup, pickup, 0);
    output.itemVisible = t < 1;
    return;
  }

  if (disposition === 'depart') {
    output.targetBlend = t;
    output.aimBlend = profile.aim === 'none' ? 0 : 1 - t;
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'map-read') {
    sampleEventItemUse(
      context,
      itemId,
      MAP_LOOK_COMPLETION * (1 - t),
      output,
    );
    return;
  }

  if (context === 'compass-search') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    const staged = output as StagedEventItemUseSample;
    staged[MOTION_PROFILE] = profile;
    sampleCompassSearch(output, pickup, pickup, 1);
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'flashlight-threat-beam' || context === 'flashlight-signal') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    if (context === 'flashlight-signal') {
      sampleFlashlightSignal(output, pickup, pickup, 1);
    } else {
      sampleFlashlightThreatBeam(output, pickup, pickup, 1);
    }
    output.itemVisible = t < 1;
    return;
  }

  if (itemId === 'bucket') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    const staged = output as StagedEventItemUseSample;
    staged[MOTION_PROFILE] = eventItemMotionProfile(itemId);
    samplePickupAndHold(output, pickup, pickup);
    applyBucketBenchClearance(output, pickup);
    output.itemVisible = t < 1;
    return;
  }

  if (context === 'net-scoop') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    const staged = output as StagedEventItemUseSample;
    staged[MOTION_PROFILE] = profile;
    samplePickupAndHold(output, pickup, pickup);
    output.aimBlend = 0;
    output.itemVisible = t < 1;
    return;
  }

  const returnToGrip = smoothstep(t / 0.5);
  if (t <= 0.5) {
    output.viewX += (profile.grip[0] - output.viewX) * returnToGrip;
    output.viewY += (profile.grip[1] - output.viewY) * returnToGrip;
    output.viewZ += (profile.grip[2] - output.viewZ) * returnToGrip;
  } else {
    const stow = smoothstep((t - 0.5) / 0.5);
    output.viewX = profile.grip[0];
    output.viewY = profile.grip[1] + (-1.35 - profile.grip[1]) * stow;
    output.viewZ = profile.grip[2];
  }
  output.aimBlend = 0;
  output.itemVisible = t < 1;
}

export function eventItemOutcomeDuration(
  itemId: ItemId,
  disposition: EventItemDisposition,
): number {
  if (itemId === 'compass' && disposition !== 'depart') {
    return eventItemUseDuration('compass-search')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
  }
  if (itemId === 'map' && disposition !== 'depart') {
    return eventItemUseDuration('map-read') * MAP_LOOK_COMPLETION;
  }
  if (itemId === 'shotgun') {
    const liftWindow = liftCompletionForMass(
      eventItemMotionProfile(itemId).mass,
    ) - ITEM_LIFT_START;
    return eventItemUseDuration('shotgun-fire') * liftWindow;
  }
  if (itemId === 'spyglass') return scaleEventItemDuration(0.45);
  if (itemId === 'flashlight' && disposition !== 'depart') {
    return eventItemUseDuration('flashlight-signal')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
  }
  if (itemId === 'ductTape') {
    return eventItemUseDuration('tape-stretch')
      * (liftCompletionForItem(itemId) - ITEM_LIFT_START);
  }
  if (itemId === 'bucket' && disposition !== 'depart') {
    return eventItemUseDuration('flashlight-signal')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
  }
  if (itemId === 'fishingNet' && disposition !== 'depart') {
    return eventItemUseDuration('net-scoop')
      * (liftCompletionForMass(eventItemMotionProfile(itemId).mass) - ITEM_LIFT_START);
  }
  const mass = eventItemMotionProfile(itemId).mass;
  const base = disposition === 'depart' ? 0.5 : 0.7;
  const massOffset = mass === 'heavy' ? 0.18 : mass === 'medium' ? 0.09 : 0;
  return scaleEventItemDuration(base + massOffset);
}
