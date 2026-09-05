import { domainMessage as t } from '../i18n/domainMessages';
import type { RandomSource } from './survivalTypes';

export type CarlitosDeathCause =
  | 'starvation' | 'sickness' | 'misery';

export const CARLITOS_MAX_ENERGY = 3;

export interface CarlitosState {
  alive: boolean;
  energy: number;
  hunger: number;
  sickness: number;
  unhappiness: number;
  pettedToday: boolean;
  deathCause: CarlitosDeathCause | null;
}

export type CarlitosSnapshot = Readonly<CarlitosState>;

export interface CarlitosStatus {
  readonly hunger: string;
  readonly health: string;
  readonly happiness: string;
}

export function createCarlitosState(
  initial: Partial<CarlitosSnapshot> = {},
): CarlitosState {
  const state: CarlitosState = {
    alive: true,
    energy: CARLITOS_MAX_ENERGY,
    hunger: 5,
    sickness: 0,
    unhappiness: 0,
    pettedToday: false,
    deathCause: null,
    ...initial,
  };
  state.energy = clampCarlitosEnergy(state.energy);
  return state;
}

export function carlitosStatus(state: CarlitosSnapshot): CarlitosStatus {
  return {
    hunger: hungerStatus(state.hunger),
    health: healthStatus(state.sickness),
    happiness: happinessStatus(state.unhappiness),
  };
}

export function carlitosWellness(state: CarlitosSnapshot): number {
  return clampNeed(state.hunger) - clampNeed(state.sickness) - unhappinessPenalty(state.unhappiness);
}

export function spendCarlitosEnergy(
  state: CarlitosState,
  amount: number,
): boolean {
  state.energy = clampCarlitosEnergy(state.energy);
  if (!state.alive || state.energy < amount) return false;
  state.energy -= amount;
  return true;
}

export function petCarlitos(state: CarlitosState): boolean {
  if (!state.alive || state.pettedToday) {
    return false;
  }

  state.unhappiness = Math.max(0, state.unhappiness - 4);
  state.pettedToday = true;
  return true;
}

export function feedCarlitos(state: CarlitosState): boolean {
  if (!state.alive) {
    return false;
  }

  state.hunger = clampNeed(state.hunger);
  if (state.hunger === 5) return false;

  state.hunger = 5;
  return true;
}

export function treatCarlitos(state: CarlitosState): boolean {
  if (!state.alive) {
    return false;
  }

  state.sickness = clampNeed(state.sickness);
  if (state.sickness === 0) return false;

  state.sickness = 0;
  return true;
}

export function killCarlitos(
  state: CarlitosState,
  cause: CarlitosDeathCause,
): boolean {
  if (!state.alive) {
    return false;
  }

  state.alive = false;
  state.deathCause = cause;
  return true;
}

export function advanceCarlitosDawn(
  state: CarlitosState,
  random: RandomSource,
): CarlitosSnapshot {
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
    killCarlitos(state, 'starvation');
    return state;
  }

  if (random.next() < (state.sickness + 1) / 100) {
    state.sickness = clampNeed(state.sickness + 1);
  }
  if (state.sickness === 5) {
    killCarlitos(state, 'sickness');
    return state;
  }

  if (state.sickness > 0 && random.next() < ((5 - state.sickness) * 3) / 100) {
    state.sickness = 0;
  }

  if (!state.pettedToday) {
    state.unhappiness += 1;
  }
  if (state.unhappiness > 10 && random.next() < 0.45) {
    killCarlitos(state, 'misery');
    return state;
  }

  state.energy = clampCarlitosEnergy(state.energy + 1);
  state.pettedToday = false;
  return state;
}

function hungerStatus(hunger: number): CarlitosStatus['hunger'] {
  if (hunger >= 5) return t('satiated');
  if (hunger === 4) return t('peckish');
  if (hunger >= 2) return t('hungry');
  return t('starving');
}

function healthStatus(sickness: number): CarlitosStatus['health'] {
  if (sickness <= 0) return t('healthy');
  if (sickness === 1) return t('unwell');
  if (sickness <= 3) return t('sick');
  if (sickness === 4) return t('dying');
  return t('dead');
}

function happinessStatus(unhappiness: number): CarlitosStatus['happiness'] {
  if (unhappiness <= 2) return t('happy');
  if (unhappiness <= 4) return t('bored');
  if (unhappiness <= 6) return t('lonely');
  if (unhappiness === 7) return t('depressed');
  return t('miserable');
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

function clampCarlitosEnergy(value: number): number {
  return Math.min(CARLITOS_MAX_ENERGY, Math.max(0, Math.trunc(value)));
}
