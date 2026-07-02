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
