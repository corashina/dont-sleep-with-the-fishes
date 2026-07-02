import type { ResourceKey } from '../state/EventBus';

export type Cost = Partial<Record<ResourceKey, number>>;

export interface NightEventDef {
  id: string;
  name: string;
  description: string;
  validCounters: string[];     // item ids that resolve safely
  failureCost: Cost;           // applied if wrong/none chosen
  worseWithItem?: string;      // trap item
  worseCost?: Cost;            // applied if trap item chosen
  weight: number;              // base random weight
  isRescue?: boolean;
}

export const NIGHT_EVENTS: NightEventDef[] = [
  {
    id: 'leak',
    name: 'Leak',
    description: 'Water gushes through a cracked plank. Patch it fast.',
    validCounters: ['ductTape'],
    failureCost: { hull: 30 },
    weight: 3,
  },
  {
    id: 'giantSquid',
    name: 'Giant Squid',
    description: 'A massive tentacle coils around the hull.',
    validCounters: ['anchor'],
    failureCost: { hull: 60 },
    weight: 2,
  },
  {
    id: 'eerieMelody',
    name: 'Eerie Melody',
    description: 'A haunting song drifts across the water. Do NOT shine a light.',
    validCounters: ['ductTape'],
    failureCost: { health: 20 },
    worseWithItem: 'flashlight',
    worseCost: { health: 45, morale: 20 },
    weight: 2,
  },
  {
    id: 'hope',
    name: 'Hope',
    description: 'Lights on the horizon — a passing ship! Signal them!',
    validCounters: ['flareGun'],
    failureCost: {},
    weight: 1,
    isRescue: true,
  },
];

export const NIGHT_EVENT_BY_ID: Record<string, NightEventDef> =
  Object.fromEntries(NIGHT_EVENTS.map((e) => [e.id, e]));

import { Rng, weightedPick } from '../utils/rng';
import { HOPE_GUARANTEE_DAY, type GameState } from '../state/GameState';
import { CREWMATES } from './crewmates';
import { ITEMS } from './items';

export type NightOutcome = 'safe' | 'failure' | 'worse';

export interface NightResult {
  outcome: NightOutcome;
  rescued: boolean;
  message: string;
}

export function resolveNight(
  state: GameState,
  eventId: string,
  itemId: string,
): NightResult {
  const def = NIGHT_EVENT_BY_ID[eventId];
  if (!def) throw new Error(`unknown night event ${eventId}`);

  const crewmate = state.crewmate ? CREWMATES[state.crewmate] : null;
  const applyCost = (cost: Cost) => {
    for (const [key, dmg] of Object.entries(cost)) {
      let amount = dmg as number;
      if (crewmate && crewmate.monsterEvents.includes(eventId)) {
        amount = Math.round(amount * crewmate.monsterDamageMultiplier);
      }
      state.adjustResource(key as ResourceKey, -amount);
    }
  };

  // trap item takes priority
  if (def.worseWithItem && itemId === def.worseWithItem && def.worseCost) {
    applyCost(def.worseCost);
    return { outcome: 'worse', rescued: false, message: `${def.name}: the light made it worse!` };
  }

  if (itemId && def.validCounters.includes(itemId)) {
    if (def.isRescue) {
      state.rescued = true;
      return { outcome: 'safe', rescued: true, message: `${def.name}: you signal the ship — rescued!` };
    }
    return { outcome: 'safe', rescued: false, message: `${def.name}: the ${ITEMS[itemId]?.name ?? itemId} holds.` };
  }

  applyCost(def.failureCost);
  return { outcome: 'failure', rescued: false, message: `${def.name}: you weren't ready.` };
}

export function pickNightEvent(rng: Rng, day: number, hopeAppeared: boolean): string {
  if (!hopeAppeared && day >= HOPE_GUARANTEE_DAY) return 'hope';
  const idx = weightedPick(
    rng,
    NIGHT_EVENTS.map((e) => ({ weight: e.weight })),
    0,
  );
  return NIGHT_EVENTS[idx].id;
}
