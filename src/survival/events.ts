import type { ItemId } from '../game/ItemState';
import type {
  PresentationCue,
  RandomSource,
  ResourceDelta,
  RiskLabel,
  SurvivalEventDefinition,
  WeatherId,
} from './survivalTypes';

// The original runtime catalog stays active until the canonical wiki catalog is
// supplied. New code can use the generic engine through these explicit aliases.
export {
  drawWeightedEvent as drawWeightedCanonicalEvent,
  eligibleEvents as eligibleCanonicalEvents,
  resolveEventOutcome,
} from './outcomeResolver';

interface EventSeed {
  id: string;
  phase: 'day' | 'night';
  title: string;
  prompt: string;
  danger: RiskLabel;
  earliestDay: number;
  counter: ItemId;
  counterMessage: string;
  counterDeltas: ResourceDelta;
  endureMessage: string;
  endureDeltas: ResourceDelta;
  cue: PresentationCue;
  counterCue?: PresentationCue;
  weight?: number;
  cooldownDays?: number;
  weather?: readonly WeatherId[];
  rescue?: boolean;
}

function defineEvent(seed: EventSeed): SurvivalEventDefinition {
  return {
    id: seed.id,
    phase: seed.phase,
    title: seed.title,
    prompt: seed.prompt,
    danger: seed.danger,
    earliestDay: seed.earliestDay,
    weight: seed.weight ?? 10,
    cooldownDays: seed.cooldownDays ?? 3,
    weather: seed.weather,
    responses: [{
      itemId: seed.counter,
      message: seed.counterMessage,
      deltas: seed.counterDeltas,
      cue: seed.counterCue ?? seed.cue,
      consume: true,
      rescue: seed.rescue,
    }],
    unsuitable: {
      message: `That item cannot help. ${seed.endureMessage}`,
      deltas: seed.endureDeltas,
      cue: seed.cue,
    },
    endure: { message: seed.endureMessage, deltas: seed.endureDeltas, cue: seed.cue },
    cue: seed.cue,
  };
}

export const SURVIVAL_EVENTS: readonly SurvivalEventDefinition[] = [
  defineEvent({
    id: 'day-heat-haze', phase: 'day', title: 'Heat Haze',
    prompt: 'The sun turns the lifeboat into an oven and your focus begins to slip.',
    danger: 'uncertain', earliestDay: 1, counter: 'waterJug', weather: ['calm', 'overcast'],
    counterMessage: 'A measured drink clears your head.', counterDeltas: { energy: 1 },
    endureMessage: 'The heat leaves you badly burned and faint.', endureDeltas: { health: -8 }, cue: 'none',
  }),
  defineEvent({
    id: 'day-tangled-debris', phase: 'day', title: 'Tangled Debris',
    prompt: 'A knotted raft of debris scrapes alongside the hull.',
    danger: 'uncertain', earliestDay: 1, counter: 'flashlight',
    counterMessage: 'The beam reveals a safe handhold and a useful brace.', counterDeltas: { repairMaterial: 1 },
    endureMessage: 'You recover a brace, but sharp wreckage cuts you.', endureDeltas: { health: -6, repairMaterial: 1 }, cue: 'impact',
  }),
  defineEvent({
    id: 'day-sudden-squall', phase: 'day', title: 'Sudden Squall',
    prompt: 'A black squall line bears down before you can prepare.',
    danger: 'dangerous', earliestDay: 2, counter: 'ductTape', weather: ['overcast', 'squall'],
    counterMessage: 'A hurried tape seal limits the flooding.', counterDeltas: { hull: -3 },
    endureMessage: 'The squall tears open weak seams in the hull.', endureDeltas: { hull: -15 }, cue: 'storm',
  }),
  defineEvent({
    id: 'day-circling-gulls', phase: 'day', title: 'Circling Gulls',
    prompt: 'Gulls wheel above a patch of water where fish are feeding.',
    danger: 'uncertain', earliestDay: 1, counter: 'fishingRod',
    counterMessage: 'You cast into the boil and land a fish.', counterDeltas: { food: 1 },
    endureMessage: 'The birds steal one fish from your exposed stores.', endureDeltas: { food: -1 }, cue: 'fish',
  }),
  defineEvent({
    id: 'day-dark-shape', phase: 'day', title: 'Dark Shape Below',
    prompt: 'A vast shadow turns beneath the lifeboat and rises.',
    danger: 'dangerous', earliestDay: 3, counter: 'flareGun', weight: 5, cooldownDays: 5,
    counterMessage: 'The flare startles the shape away before it strikes.', counterDeltas: {}, counterCue: 'sighting',
    endureMessage: 'The creature slams the hull before disappearing.', endureDeltas: { hull: -12 }, cue: 'impact',
  }),
  defineEvent({
    id: 'day-floating-wreckage', phase: 'day', title: 'Floating Wreckage',
    prompt: 'A half-submerged crate drifts past amid splintered boards.',
    danger: 'uncertain', earliestDay: 2, counter: 'flashlight',
    counterMessage: 'You inspect the crate and safely recover food and bait.', counterDeltas: { food: 1, bait: 1 },
    endureMessage: 'You grab bait, but hidden glass opens a cut.', endureDeltas: { health: -5, bait: 1 }, cue: 'dive',
  }),
  defineEvent({
    id: 'day-hull-leak', phase: 'day', title: 'Hull Leak',
    prompt: 'A seam gives way and seawater begins to jet through.',
    danger: 'dangerous', earliestDay: 2, counter: 'ductTape',
    counterMessage: 'The tape patch closes the seam and reinforces it.', counterDeltas: { hull: 5 },
    endureMessage: 'The unchecked leak ruins a wide section of the hull.', endureDeltas: { hull: -18 }, cue: 'impact', counterCue: 'repair',
  }),
  defineEvent({
    id: 'day-distant-aircraft', phase: 'day', title: 'Distant Aircraft',
    prompt: 'An aircraft glints on the horizon, almost lost in the glare.',
    danger: 'safe', earliestDay: 5, counter: 'flareGun', weight: 3, cooldownDays: 8,
    counterMessage: 'Your flare is seen. The aircraft circles back toward you.', counterDeltas: {},
    endureMessage: 'The aircraft fades away, but the sighting renews your hope.', endureDeltas: { rescueProgress: 10 },
    cue: 'sighting', counterCue: 'rescue', rescue: true,
  }),
  defineEvent({
    id: 'night-hull-impact', phase: 'night', title: 'Hull Impact',
    prompt: 'Something heavy knocks against the hull in the darkness.',
    danger: 'dangerous', earliestDay: 1, counter: 'flashlight',
    counterMessage: 'The beam lets you fend the debris away.', counterDeltas: { hull: -2 },
    endureMessage: 'Repeated impacts crack the hull.', endureDeltas: { hull: -12 }, cue: 'impact',
  }),
  defineEvent({
    id: 'night-violent-weather', phase: 'night', title: 'Violent Weather',
    prompt: 'Wind and steep waves batter the lifeboat without warning.',
    danger: 'dangerous', earliestDay: 2, counter: 'ductTape', weather: ['overcast', 'squall'],
    counterMessage: 'Tape holds the worst split together through the storm.', counterDeltas: { hull: -5 },
    endureMessage: 'The unreinforced hull takes a savage beating.', endureDeltas: { hull: -20 }, cue: 'storm',
  }),
  defineEvent({
    id: 'night-strange-lights', phase: 'night', title: 'Strange Lights',
    prompt: 'Unfamiliar lights blink near the horizon, then go dark.',
    danger: 'uncertain', earliestDay: 3, counter: 'flashlight',
    counterMessage: 'A steady signal earns a distant answering flash.', counterDeltas: { rescueProgress: 10 },
    endureMessage: 'You strain into the darkness until exhaustion makes you ill.', endureDeltas: { health: -5 }, cue: 'sighting',
  }),
  defineEvent({
    id: 'night-fish-activity', phase: 'night', title: 'Fish Activity',
    prompt: 'Silver flashes churn the water beside the boat.',
    danger: 'safe', earliestDay: 1, counter: 'fishingRod',
    counterMessage: 'A quick cast brings in a fish.', counterDeltas: { food: 1 },
    endureMessage: 'The school passes harmlessly into the night.', endureDeltas: {}, cue: 'fish',
  }),
  defineEvent({
    id: 'night-distant-calls', phase: 'night', title: 'Distant Calls',
    prompt: 'Faint human voices carry across the black water.',
    danger: 'uncertain', earliestDay: 4, counter: 'flareGun',
    counterMessage: 'A flare answers the calls and marks your position.', counterDeltas: { rescueProgress: 15 },
    endureMessage: 'Calling back until your throat is raw drains your strength.', endureDeltas: { health: -8 }, cue: 'sighting',
  }),
  defineEvent({
    id: 'night-drifting-wreckage', phase: 'night', title: 'Drifting Wreckage',
    prompt: 'Timbers grind around the boat where you cannot see them.',
    danger: 'uncertain', earliestDay: 2, counter: 'flashlight',
    counterMessage: 'The light guides you to a usable timber.', counterDeltas: { repairMaterial: 1 },
    endureMessage: 'A timber scars the hull, though you pull it aboard afterward.', endureDeltas: { hull: -8, repairMaterial: 1 }, cue: 'impact',
  }),
  defineEvent({
    id: 'night-oppressive-darkness', phase: 'night', title: 'Oppressive Darkness',
    prompt: 'Clouds erase every star and the darkness closes in.',
    danger: 'uncertain', earliestDay: 1, counter: 'flashlight',
    counterMessage: 'The familiar beam keeps panic at bay.', counterDeltas: {},
    endureMessage: 'Hours of blind panic leave you shaken and weak.', endureDeltas: { health: -6 }, cue: 'darkness',
  }),
  defineEvent({
    id: 'night-calm-water', phase: 'night', title: 'Calm Water',
    prompt: 'The sea settles to glass, offering a rare moment of quiet.',
    danger: 'safe', earliestDay: 1, counter: 'waterJug', weather: ['calm'], weight: 6, cooldownDays: 2,
    counterMessage: 'A sip of water settles the ache in your stomach.', counterDeltas: { hunger: -5 },
    endureMessage: 'You rest quietly until the moment passes.', endureDeltas: {}, cue: 'none',
  }),
];

export interface LegacyEventEligibility {
  phase: 'day' | 'night';
  day: number;
  weather: WeatherId;
  lastEventId: string | null;
  lastSeenDay: ReadonlyMap<string, number>;
}

export type EventEligibility = LegacyEventEligibility;

export function eligibleEvents(
  catalog: readonly SurvivalEventDefinition[],
  criteria: LegacyEventEligibility,
): SurvivalEventDefinition[] {
  return catalog.filter((event) => {
    if (event.phase !== criteria.phase || event.id === criteria.lastEventId) return false;
    if (criteria.day < event.earliestDay || (event.latestDay !== undefined && criteria.day > event.latestDay)) return false;
    if (event.weather !== undefined && !event.weather.includes(criteria.weather)) return false;
    const lastSeen = criteria.lastSeenDay.get(event.id);
    return lastSeen === undefined || criteria.day - lastSeen >= event.cooldownDays;
  });
}

const LEGACY_FALLBACKS: Readonly<Record<'day' | 'night', SurvivalEventDefinition>> = {
  day: {
    id: 'day-calm-fallback', phase: 'day', title: 'Quiet Waters', prompt: 'The day passes without incident.',
    danger: 'safe', earliestDay: 1, weight: 1, cooldownDays: 0, responses: [],
    unsuitable: { message: 'The day remains quiet.', deltas: {}, cue: 'none' },
    endure: { message: 'The day remains quiet.', deltas: {}, cue: 'none' }, cue: 'none',
  },
  night: {
    id: 'night-calm-fallback', phase: 'night', title: 'Quiet Night', prompt: 'The night passes without incident.',
    danger: 'safe', earliestDay: 1, weight: 1, cooldownDays: 0, responses: [],
    unsuitable: { message: 'The night remains quiet.', deltas: {}, cue: 'none' },
    endure: { message: 'The night remains quiet.', deltas: {}, cue: 'none' }, cue: 'none',
  },
};

export function drawWeightedEvent(
  pool: readonly SurvivalEventDefinition[],
  random: RandomSource,
  fallbackPhase: 'day' | 'night' = 'day',
): SurvivalEventDefinition {
  if (pool.length === 0) return LEGACY_FALLBACKS[fallbackPhase];
  const totalWeight = pool.reduce((sum, event) => sum + Math.max(0, event.weight), 0);
  if (totalWeight <= 0) return pool[0]!;
  const roll = random.next() * totalWeight;
  let boundary = 0;
  for (const event of pool) {
    boundary += Math.max(0, event.weight);
    if (roll < boundary) return event;
  }
  return pool[pool.length - 1]!;
}
