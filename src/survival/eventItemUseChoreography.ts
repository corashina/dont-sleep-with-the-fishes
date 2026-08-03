import type { ItemId } from '../game/ItemState';
import { clamp01, pulse, smoothstep } from './animationMath';

export type EventItemUseContext =
  | 'throw-target' | 'tape-stretch' | 'compass-search' | 'map-read'
  | 'binocular-look' | 'net-throw' | 'bucket-scoop' | 'bucket-cover'
  | 'flare-target' | 'flare-sky' | 'anchor-drop'
  | 'umbrella-overhead' | 'umbrella-shield'
  | 'flashlight-flash' | 'harpoon-shot';

export type EventItemEffectKind =
  | 'none' | 'tape' | 'binocular-mask' | 'net' | 'bucket-cover'
  | 'flare' | 'chain' | 'umbrella' | 'flashlight' | 'harpoon';

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
}

const BUCKET_SCOOP_EVENTS: ReadonlySet<string> = new Set(['leak', 'school-of-fish']);
const BUCKET_COVER_EVENTS: ReadonlySet<string> = new Set(['eerie-melody']);
const UMBRELLA_OVERHEAD_EVENTS: ReadonlySet<string> = new Set(['shower-night']);
const UMBRELLA_SHIELD_EVENTS: ReadonlySet<string> = new Set(['death-stare']);
const FLARE_SKY_EVENTS: ReadonlySet<string> = new Set(['other-people']);
const FLARE_TARGET_EVENTS: ReadonlySet<string> = new Set(['ghosts']);

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
    return null;
  }
  if (itemId === 'umbrella' && choiceId === 'umbrella') {
    if (UMBRELLA_OVERHEAD_EVENTS.has(eventId)) return 'umbrella-overhead';
    if (UMBRELLA_SHIELD_EVENTS.has(eventId)) return 'umbrella-shield';
    return null;
  }
  if (itemId === 'flareGun' && choiceId === 'flareGun') {
    if (FLARE_SKY_EVENTS.has(eventId)) return 'flare-sky';
    if (FLARE_TARGET_EVENTS.has(eventId)) return 'flare-target';
    return null;
  }
  if (itemId === 'anchor' && choiceId === 'anchor' && eventId === 'whirlpool') {
    return 'anchor-drop';
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
  if (itemId === 'harpoonGun' && choiceId === 'harpoonGun') return 'harpoon-shot';
  return null;
}

export function eventItemUseDuration(context: EventItemUseContext): number {
  switch (context) {
    case 'throw-target': return 1.35;
    case 'tape-stretch': return 1.45;
    case 'compass-search': return 1.6;
    case 'map-read': return 1.55;
    case 'binocular-look': return 1.7;
    case 'net-throw': return 1.5;
    case 'bucket-scoop': return 1.45;
    case 'bucket-cover': return 1.35;
    case 'flare-target': return 1.5;
    case 'flare-sky': return 1.65;
    case 'anchor-drop': return 1.6;
    case 'umbrella-overhead': return 1.45;
    case 'umbrella-shield': return 1.35;
    case 'flashlight-flash': return 1.35;
    case 'harpoon-shot': return 1.4;
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
}

function samplePickupAndHold(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
): void {
  output.cameraSpaceBlend = pickup;
  output.viewX = 0.14 * pickup;
  output.viewY = -0.16 + 0.42 * pickup;
  output.viewZ = -0.18 - 0.76 * hold;
  output.pitch = -0.08 * pickup;
  output.roll = -0.04 * pickup;
}

function sampleThrowTarget(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  itemId: ItemId | undefined,
): void {
  samplePickupAndHold(output, pickup, hold);
  let throwRoll = -0.36;
  if (itemId === 'baitTin' || itemId === 'energyBar') throwRoll = 0.22;
  if (itemId === 'swimRing') throwRoll = 0.68;
  output.viewX += 0.58 * action;
  output.viewY += 0.12 * action;
  output.viewZ += 0.72 * action;
  output.yaw = -0.34 * action;
  output.pitch += 0.28 * action;
  output.roll += throwRoll * action;
  output.scaleX = 1 - 0.08 * action;
  output.scaleY = 1 - 0.08 * action;
  output.scaleZ = 1 - 0.08 * action;
}

function sampleTapeStretch(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = 'tape';
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
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.viewX = -0.04 * pickup;
  output.viewY += 0.11 * hold;
  output.yaw = -0.16 * hold;
  output.pitch = 0.44 * hold;
  output.roll = -0.08 * action;
  output.scaleX = 1.1;
  output.scaleY = 1.1;
}

function sampleBinocularLook(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = 'binocular-mask';
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
  output.effectKind = 'net';
  output.viewX += 0.46 * action;
  output.viewY += 0.2 * action;
  output.viewZ += 0.48 * action;
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
  output.effectKind = 'bucket-cover';
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
  output.effectKind = 'flare';
  output.viewY += (sky ? 0.52 : 0.16) * action;
  output.viewX += (sky ? 0.14 : 0.42) * action;
  output.pitch = (sky ? -0.72 : 0.08) * action;
  output.yaw = (sky ? -0.12 : -0.36) * action;
  output.primaryEffect = action;
  output.secondaryEffect = hold;
}

function sampleAnchorDrop(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = 'chain';
  output.viewY -= 0.64 * action;
  output.viewZ += 0.42 * action;
  output.yaw = 0.24 * action;
  output.roll = 0.3 * action;
  output.primaryEffect = action;
  output.secondaryEffect = 0.5 * action;
}

function sampleUmbrella(
  output: EventItemUseSample,
  pickup: number,
  hold: number,
  action: number,
  shield: boolean,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = 'umbrella';
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
  output.effectKind = 'flashlight';
  output.viewX += 0.22 * action;
  output.yaw = -0.18 * action;
  output.pitch = 0.14 * action;
  output.primaryEffect = action;
  output.secondaryEffect = pulse(action, 0.12, 0.58, 0.96);
}

function sampleHarpoonShot(
  output: EventItemUseSample, pickup: number, hold: number, action: number,
): void {
  samplePickupAndHold(output, pickup, hold);
  output.effectKind = 'harpoon';
  output.viewZ += 0.32 * action;
  output.yaw = -0.22 * action;
  output.pitch = 0.1 * action;
  output.roll = -0.08 * action;
  output.primaryEffect = action;
  output.secondaryEffect = action * action;
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
  const pickup = smoothstep(t / 0.24);
  const hold = Math.min(
    smoothstep((t - 0.16) / 0.18),
    1 - smoothstep((t - 0.9) / 0.1),
  );
  const action = pulse(t, 0.3, 0.66, 0.94);

  switch (context) {
    case 'throw-target': sampleThrowTarget(output, pickup, hold, action, itemId); break;
    case 'tape-stretch': sampleTapeStretch(output, pickup, hold, action); break;
    case 'compass-search': sampleCompassSearch(output, pickup, hold, action); break;
    case 'map-read': sampleMapRead(output, pickup, hold, action); break;
    case 'binocular-look': sampleBinocularLook(output, pickup, hold, action); break;
    case 'net-throw': sampleNetThrow(output, pickup, hold, action); break;
    case 'bucket-scoop': sampleBucketScoop(output, pickup, hold, action); break;
    case 'bucket-cover': sampleBucketCover(output, pickup, hold, action); break;
    case 'flare-target': sampleFlare(output, pickup, hold, action, false); break;
    case 'flare-sky': sampleFlare(output, pickup, hold, action, true); break;
    case 'anchor-drop': sampleAnchorDrop(output, pickup, hold, action); break;
    case 'umbrella-overhead': sampleUmbrella(output, pickup, hold, action, false); break;
    case 'umbrella-shield': sampleUmbrella(output, pickup, hold, action, true); break;
    case 'flashlight-flash': sampleFlashlightFlash(output, pickup, hold, action); break;
    case 'harpoon-shot': sampleHarpoonShot(output, pickup, hold, action); break;
  }
}
