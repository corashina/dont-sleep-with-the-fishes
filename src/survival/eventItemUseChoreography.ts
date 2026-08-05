import type { ItemId } from '../game/ItemState';
import { clamp01, pulse, smoothstep } from './animationMath';
import { eventItemMotionProfile, type EventItemMass } from './eventItemMotionProfile';
import { scaleEventItemDuration } from './eventItemTiming';

export type EventItemUseContext =
  | 'base' | 'throw-target' | 'tape-stretch' | 'compass-search' | 'map-read'
  | 'binocular-look' | 'net-throw' | 'bucket-scoop' | 'bucket-cover'
  | 'flare-target' | 'flare-sky' | 'anchor-drop'
  | 'umbrella-overhead' | 'umbrella-shield'
  | 'flashlight-flash' | 'shotgun-fire';

export type EventItemEffectKind =
  | 'none' | 'tape' | 'binocular-mask' | 'net' | 'bucket-cover'
  | 'flare' | 'chain' | 'umbrella' | 'flashlight' | 'shotgun-smoke';

export type EventItemDisposition = 'recover' | 'broken' | 'depart';

const MOTION_PROFILE = Symbol('event-item-motion-profile');
const ANTICIPATE = Symbol('event-item-anticipate');
const ITEM_LIFT_START = 0.08;
const MAP_LIFT_COMPLETION = 0.34;
const MAP_LOOK_COMPLETION = 0.44;
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
  fovScale: number;
  primaryEffect: number;
  secondaryEffect: number;
  effectKind: EventItemEffectKind;
  aimBlend: number;
  targetBlend: number;
  ballisticFlight: boolean;
  flightArc: number;
  itemVisible: boolean;
}

const BUCKET_SCOOP_EVENTS: ReadonlySet<string> = new Set([
  'leak', 'school-of-fish', 'shower-night', 'thunderstorm',
]);
const BUCKET_COVER_EVENTS: ReadonlySet<string> = new Set([
  'bad-sleep', 'eerie-melody',
]);
const UMBRELLA_OVERHEAD_EVENTS: ReadonlySet<string> = new Set([
  'shower-night', 'windy-night', 'thunderstorm',
]);
const UMBRELLA_SHIELD_EVENTS: ReadonlySet<string> = new Set([
  'bad-sleep', 'death-stare', 'eerie-melody', 'face-on-the-moon',
]);
const FLARE_SKY_EVENTS: ReadonlySet<string> = new Set(['other-people']);
const FLARE_TARGET_EVENTS: ReadonlySet<string> = new Set(['ghosts']);
const BASE_BUCKET_EVENTS: ReadonlySet<string> = new Set(['flowers', 'handyman']);
const BASE_UMBRELLA_EVENTS: ReadonlySet<string> = new Set(['night-trader']);
const BASE_FLARE_EVENTS: ReadonlySet<string> = new Set(['shadow-figure', 'handyman']);

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
    fovScale: 1,
    primaryEffect: 0,
    secondaryEffect: 0,
    effectKind: 'none',
    aimBlend: 0,
    targetBlend: 0,
    ballisticFlight: false,
    flightArc: 0,
    itemVisible: true,
  };
}

export function resolveEventItemUseContext(
  eventId: string,
  choiceId: string,
  itemId: ItemId,
): EventItemUseContext | null {
  if (itemId === 'bucket' && choiceId === 'bucket') {
    if (BUCKET_SCOOP_EVENTS.has(eventId)) return 'bucket-scoop';
    if (BUCKET_COVER_EVENTS.has(eventId)) return 'bucket-cover';
    return BASE_BUCKET_EVENTS.has(eventId) ? 'base' : null;
  }
  if (itemId === 'umbrella' && choiceId === 'umbrella') {
    if (UMBRELLA_OVERHEAD_EVENTS.has(eventId)) return 'umbrella-overhead';
    if (UMBRELLA_SHIELD_EVENTS.has(eventId)) return 'umbrella-shield';
    return BASE_UMBRELLA_EVENTS.has(eventId) ? 'base' : null;
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
      eventId === 'whirlpool'
      || eventId === 'thunderstorm'
      || eventId === 'restless-waves'
    )
  ) {
    return 'anchor-drop';
  }
  if (itemId === 'anchor' && choiceId === 'anchor' && eventId === 'handyman') {
    return 'base';
  }
  if (itemId === 'scubaSet' && choiceId === 'scubaSet' && eventId === 'handyman') {
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
  if (itemId === 'bottledPaper' && choiceId === 'bottledPaper') return 'throw-target';
  if (itemId === 'ductTape' && choiceId === 'ductTape') return 'tape-stretch';
  if (itemId === 'compass' && choiceId === 'compass') return 'compass-search';
  if (itemId === 'map' && choiceId === 'map') return 'map-read';
  if (itemId === 'spyglass' && choiceId === 'spyglass') return 'binocular-look';
  if (itemId === 'fishingNet' && choiceId === 'fishingNet') return 'net-throw';
  if (itemId === 'flashlight' && choiceId === 'flashlight') return 'flashlight-flash';
  if (itemId === 'shotgun' && choiceId === 'shotgun') return 'shotgun-fire';
  return null;
}

export function eventItemUseDuration(context: EventItemUseContext): number {
  switch (context) {
    case 'base': return scaleEventItemDuration(1.35);
    case 'throw-target': return scaleEventItemDuration(1.35);
    case 'tape-stretch': return scaleEventItemDuration(1.45);
    case 'compass-search': return scaleEventItemDuration(1.6);
    case 'map-read': return scaleEventItemDuration(1.55);
    case 'binocular-look': return scaleEventItemDuration(1.7);
    case 'net-throw': return scaleEventItemDuration(1.5);
    case 'bucket-scoop': return scaleEventItemDuration(1.45);
    case 'bucket-cover': return scaleEventItemDuration(1.35);
    case 'flare-target': return scaleEventItemDuration(1.5);
    case 'flare-sky': return scaleEventItemDuration(1.65);
    case 'anchor-drop': return scaleEventItemDuration(1.6);
    case 'umbrella-overhead': return scaleEventItemDuration(1.45);
    case 'umbrella-shield': return scaleEventItemDuration(1.35);
    case 'flashlight-flash': return scaleEventItemDuration(1.35);
    case 'shotgun-fire': return scaleEventItemDuration(1.2);
  }
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
  output.fovScale = 1;
  output.primaryEffect = 0;
  output.secondaryEffect = 0;
  output.effectKind = 'none';
  output.aimBlend = 0;
  output.targetBlend = 0;
  output.ballisticFlight = false;
  output.flightArc = 0;
  output.itemVisible = true;
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
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.viewY += 0.06 * action;
  output.yaw = -0.34 * hold + 0.42 * action;
  output.pitch = 0.28 * hold;
  output.roll = 0.1 * action;
  output.cameraYaw = 0.12 * action;
  output.cameraPitch = -0.05 * action;
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

  const lookLeft = pulse(progress, 0.5, 0.61, 0.72);
  const lookRight = pulse(progress, 0.7, 0.81, 0.92);
  output.cameraYaw = 0.055 * (lookLeft - lookRight);
  output.cameraPitch = 0;
  output.roll = 0;
}

function sampleBinocularLook(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = hold > 0 ? 'binocular-mask' : 'none';
  output.viewY += 0.2 * hold;
  output.viewZ -= 0.14 * hold;
  output.pitch = 0.08 * action;
  output.fovScale = 1 - 0.28 * hold;
  output.primaryEffect = hold;
  output.secondaryEffect = action;
}

function sampleNetThrow(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'net' : 'none';
  output.viewX += 0.46 * action;
  output.viewY += 0.2 * action;
  output.viewZ += 0.25 * action;
  output.yaw = -0.48 * action;
  output.pitch += 0.2 * action;
  output.roll += 0.42 * action;
  output.scaleX = 1 + 0.34 * action;
  output.scaleY = 1 + 0.2 * action;
  output.primaryEffect = action;
}

function sampleBucketScoop(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.viewY -= 0.56 * action;
  output.viewZ += 0.2 * action;
  output.pitch = 0.62 * action;
  output.roll = -0.18 * action;
  output.primaryEffect = action;
}

function sampleBucketCover(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'bucket-cover' : 'none';
  output.viewY += 0.5 * action;
  output.viewZ -= 0.18 * action;
  output.pitch = -0.42 * action;
  output.primaryEffect = action;
}

function sampleFlare(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  sky: boolean,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'flare' : 'none';
  output.viewY += (sky ? 0.52 : 0.16) * action;
  output.viewX += (sky ? 0.14 : 0.42) * action;
  output.pitch = (sky ? -0.72 : 0.08) * action;
  output.yaw = (sky ? -0.12 : -0.36) * action;
  output.primaryEffect = action;
  output.secondaryEffect = hold;
}

function sampleAnchorDrop(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  progress: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'chain' : 'none';
  const overSide = Math.min(
    smoothstep((progress - 0.28) / 0.2),
    1 - smoothstep((progress - 0.9) / 0.06),
  );
  const lowered = pulse(progress, 0.48, 0.72, 0.9);
  output.viewX += 2.45 * overSide;
  output.viewY += 0.08 * overSide - 0.84 * lowered;
  output.viewZ += 0.18 * overSide;
  output.yaw = 0.16 * overSide;
  output.roll = -0.18 * overSide + 0.08 * lowered;
  output.primaryEffect = action;
  output.secondaryEffect = lowered;
}

function sampleUmbrella(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  shield: boolean,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'umbrella' : 'none';
  output.viewY += (shield ? 0.14 : 0.66) * action;
  output.viewZ -= (shield ? 0.42 : 0.12) * action;
  output.pitch = (shield ? 0.18 : -0.6) * action;
  output.yaw = (shield ? -0.32 : 0.08) * action;
  output.primaryEffect = action;
}

function sampleFlashlightFlash(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = action > 0 ? 'flashlight' : 'none';
  output.viewX += 0.08 * action;
  output.yaw = -0.18 * action;
  output.primaryEffect = action;
  output.secondaryEffect = pulse(action, 0.12, 0.58, 0.96);
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
  const liftCompletion = liftCompletionForMass(
    eventItemMotionProfile(itemId ?? 'cannedFood').mass,
  );
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
    case 'compass-search': sampleCompassSearch(output, pickup, hold, action); break;
    case 'map-read': sampleMapRead(output, pickup, hold, t); break;
    case 'binocular-look': sampleBinocularLook(output, pickup, hold, action); break;
    case 'net-throw': sampleNetThrow(output, pickup, hold, action); break;
    case 'bucket-scoop': sampleBucketScoop(output, pickup, hold, action); break;
    case 'bucket-cover': sampleBucketCover(output, pickup, hold, action); break;
    case 'flare-target': sampleFlare(output, pickup, hold, action, false); break;
    case 'flare-sky': sampleFlare(output, pickup, hold, action, true); break;
    case 'anchor-drop': sampleAnchorDrop(output, pickup, hold, action, t); break;
    case 'umbrella-overhead': sampleUmbrella(output, pickup, hold, action, false); break;
    case 'umbrella-shield': sampleUmbrella(output, pickup, hold, action, true); break;
    case 'flashlight-flash': sampleFlashlightFlash(output, pickup, hold, action); break;
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

  if (context !== 'map-read') output.roll += 0.03 * settle;
}

function liftCompletionForMass(mass: EventItemMass): number {
  switch (mass) {
    case 'light': return MAP_LIFT_COMPLETION;
    case 'medium': return 0.38;
    case 'heavy': return 0.44;
  }
}

export function eventItemActionCueProgress(
  context: EventItemUseContext,
): number | null {
  return context === 'shotgun-fire' ? 0.46 : null;
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

  if (context === 'shotgun-fire') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    samplePickupAndHold(output, pickup, pickup);
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

  if (context === 'flashlight-flash') {
    resetSample(output);
    const pickup = 1 - smoothstep(t);
    sampleFlashlightFlash(output, pickup, pickup, 0);
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
  if (itemId === 'map' && disposition !== 'depart') {
    return eventItemUseDuration('map-read') * MAP_LOOK_COMPLETION;
  }
  if (itemId === 'shotgun') {
    const liftWindow = liftCompletionForMass(
      eventItemMotionProfile(itemId).mass,
    ) - ITEM_LIFT_START;
    return eventItemUseDuration('shotgun-fire') * liftWindow;
  }
  if (itemId === 'flashlight' && disposition !== 'depart') {
    return eventItemUseDuration('flashlight-flash')
      * (MAP_LIFT_COMPLETION - ITEM_LIFT_START);
  }
  const mass = eventItemMotionProfile(itemId).mass;
  const base = disposition === 'depart' ? 0.5 : 0.7;
  const massOffset = mass === 'heavy' ? 0.18 : mass === 'medium' ? 0.09 : 0;
  return scaleEventItemDuration(base + massOffset);
}
