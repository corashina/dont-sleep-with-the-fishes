import { domainMessage as t } from '../i18n/domainMessages';
import type { RandomSource } from './survivalTypes';

export const CARLITOS_MAX_ENERGY = 3;
export const CARLITOS_MAX_UNHAPPINESS = 10;

export interface CarlitosState {
  energy: number;
  hunger: number;
  unhappiness: number;
  pettedToday: boolean;
}

export type CarlitosSnapshot = Readonly<CarlitosState>;

export interface CarlitosStatus {
  readonly hunger: string;
  readonly happiness: string;
}

export function createCarlitosState(
  initial: Partial<CarlitosSnapshot> = {},
): CarlitosState {
  const state: CarlitosState = {
    energy: CARLITOS_MAX_ENERGY,
    hunger: 5,
    unhappiness: 0,
    pettedToday: false,
    ...initial,
  };
  normalizeCarlitos(state);
  return state;
}

export function carlitosStatus(state: CarlitosSnapshot): CarlitosStatus {
  return {
    hunger: t(hungerStatus(state.hunger)),
    happiness: t(happinessStatus(state.unhappiness)),
  };
}

export function carlitosEnergyLimit(state: CarlitosSnapshot): number {
  const wellness = clampNeed(state.hunger) - unhappinessPenalty(state.unhappiness);
  return Math.min(CARLITOS_MAX_ENERGY, Math.max(0, wellness - 1));
}

export function spendCarlitosEnergy(
  state: CarlitosState,
  amount: number,
): boolean {
  normalizeCarlitos(state);
  if (!Number.isInteger(amount) || amount <= 0 || state.energy < amount) return false;
  state.energy -= amount;
  return true;
}

export function petCarlitos(state: CarlitosState): boolean {
  normalizeCarlitos(state);
  if (state.pettedToday || state.unhappiness <= 2) {
    return false;
  }

  state.unhappiness = Math.max(0, state.unhappiness - 4);
  state.pettedToday = true;
  return true;
}

export function feedCarlitos(state: CarlitosState): boolean {
  normalizeCarlitos(state);
  if (state.hunger === 5) return false;

  state.hunger = 5;
  return true;
}

export function advanceCarlitosDawn(
  state: CarlitosState,
  random: RandomSource,
): CarlitosSnapshot {
  normalizeCarlitos(state);

  if (random.next() < 0.5) {
    state.hunger = Math.max(0, state.hunger - 1);
  }

  if (!state.pettedToday) {
    state.unhappiness = Math.min(CARLITOS_MAX_UNHAPPINESS, state.unhappiness + 1);
  }

  state.energy = Math.min(carlitosEnergyLimit(state), state.energy + 1);
  state.pettedToday = false;
  return state;
}

export function hungerStatus(hunger: number): 'satiated' | 'peckish' | 'hungry' | 'starving' {
  if (hunger >= 5) return 'satiated';
  if (hunger === 4) return 'peckish';
  if (hunger >= 2) return 'hungry';
  return 'starving';
}

export function happinessStatus(unhappiness: number): 'happy' | 'bored' | 'lonely' | 'depressed' | 'miserable' {
  if (unhappiness <= 2) return 'happy';
  if (unhappiness <= 4) return 'bored';
  if (unhappiness <= 6) return 'lonely';
  if (unhappiness === 7) return 'depressed';
  return 'miserable';
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

function normalizeCarlitos(state: CarlitosState): void {
  state.hunger = clampNeed(state.hunger);
  state.unhappiness = Math.min(CARLITOS_MAX_UNHAPPINESS, Math.max(0, Math.trunc(state.unhappiness)));
  state.energy = Math.min(carlitosEnergyLimit(state), Math.max(0, Math.trunc(state.energy)));
}
