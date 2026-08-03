import type { RandomSource } from './survivalTypes';

export type CaptainWhiskersDeathCause =
  | 'starvation' | 'sickness' | 'misery' | 'sea-watcher';

export interface CaptainWhiskersState {
  alive: boolean;
  hunger: number;
  sickness: number;
  unhappiness: number;
  pettedToday: boolean;
  deathCause: CaptainWhiskersDeathCause | null;
}

export type CaptainWhiskersSnapshot = Readonly<CaptainWhiskersState>;

export interface CaptainWhiskersStatus {
  readonly hunger: 'Satiated' | 'Peckish' | 'Hungry' | 'Starving';
  readonly health: 'Healthy' | 'Unwell' | 'Sick' | 'Dying' | 'Dead';
  readonly happiness: 'Happy' | 'Bored' | 'Lonely' | 'Depressed' | 'Miserable';
}

export function createCaptainWhiskersState(
  initial: Partial<CaptainWhiskersSnapshot> = {},
): CaptainWhiskersState {
  return {
    alive: true,
    hunger: 5,
    sickness: 0,
    unhappiness: 0,
    pettedToday: false,
    deathCause: null,
    ...initial,
  };
}

export function captainWhiskersStatus(state: CaptainWhiskersSnapshot): CaptainWhiskersStatus {
  return {
    hunger: hungerStatus(state.hunger),
    health: healthStatus(state.sickness),
    happiness: happinessStatus(state.unhappiness),
  };
}

export function captainWhiskersWellness(state: CaptainWhiskersSnapshot): number {
  return clampNeed(state.hunger) - clampNeed(state.sickness) - unhappinessPenalty(state.unhappiness);
}

export function petCaptainWhiskers(state: CaptainWhiskersState): boolean {
  if (!state.alive || state.pettedToday) {
    return false;
  }

  state.unhappiness = Math.max(0, state.unhappiness - 4);
  state.pettedToday = true;
  return true;
}

export function feedCaptainWhiskers(state: CaptainWhiskersState): boolean {
  if (!state.alive) {
    return false;
  }

  state.hunger = clampNeed(state.hunger);
  if (state.hunger === 5) return false;

  state.hunger = 5;
  return true;
}

export function treatCaptainWhiskers(state: CaptainWhiskersState): boolean {
  if (!state.alive) {
    return false;
  }

  state.sickness = clampNeed(state.sickness);
  if (state.sickness === 0) return false;

  state.sickness = 0;
  return true;
}

export function killCaptainWhiskers(
  state: CaptainWhiskersState,
  cause: CaptainWhiskersDeathCause,
): boolean {
  if (!state.alive) {
    return false;
  }

  state.alive = false;
  state.deathCause = cause;
  return true;
}

export function advanceCaptainWhiskersDawn(
  state: CaptainWhiskersState,
  random: RandomSource,
): CaptainWhiskersSnapshot {
  if (!state.alive) {
    return state;
  }

  state.hunger = clampNeed(state.hunger);
  state.sickness = clampNeed(state.sickness);
  state.unhappiness = Math.max(0, state.unhappiness);

  if (random.next() < 0.5) {
    state.hunger -= 1;
  }
  if (state.hunger === 0) {
    killCaptainWhiskers(state, 'starvation');
    return state;
  }

  if (random.next() < (state.sickness + 1) / 100) {
    state.sickness = clampNeed(state.sickness + 1);
  }
  if (state.sickness === 5) {
    killCaptainWhiskers(state, 'sickness');
    return state;
  }

  if (state.sickness > 0 && random.next() < ((5 - state.sickness) * 3) / 100) {
    state.sickness = 0;
  }

  if (!state.pettedToday) {
    state.unhappiness += 1;
  }
  if (state.unhappiness > 10 && random.next() < 0.45) {
    killCaptainWhiskers(state, 'misery');
    return state;
  }

  state.pettedToday = false;
  return state;
}

function hungerStatus(hunger: number): CaptainWhiskersStatus['hunger'] {
  if (hunger >= 5) return 'Satiated';
  if (hunger === 4) return 'Peckish';
  if (hunger >= 2) return 'Hungry';
  return 'Starving';
}

function healthStatus(sickness: number): CaptainWhiskersStatus['health'] {
  if (sickness <= 0) return 'Healthy';
  if (sickness === 1) return 'Unwell';
  if (sickness <= 3) return 'Sick';
  if (sickness === 4) return 'Dying';
  return 'Dead';
}

function happinessStatus(unhappiness: number): CaptainWhiskersStatus['happiness'] {
  if (unhappiness <= 2) return 'Happy';
  if (unhappiness <= 4) return 'Bored';
  if (unhappiness <= 6) return 'Lonely';
  if (unhappiness === 7) return 'Depressed';
  return 'Miserable';
}

function unhappinessPenalty(unhappiness: number): number {
  if (unhappiness <= 2) return 0;
  if (unhappiness <= 4) return 1;
  if (unhappiness <= 6) return 2;
  if (unhappiness === 7) return 3;
  if (unhappiness <= 9) return 4;
  return 5;
}

function clampNeed(value: number): number {
  return Math.min(5, Math.max(0, value));
}
