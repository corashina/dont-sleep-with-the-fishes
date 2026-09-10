import { domainMessage as t } from '../i18n/domainMessages';
import type { CompanionEventActionId, RandomSource } from './survivalTypes';

export type CarlitosRest = 'exhausted' | 'tired' | 'rested';
export const CARLITOS_MAX_UNHAPPINESS = 10;

export interface CarlitosState {
  rest: CarlitosRest;
  hunger: number;
  unhappiness: number;
  pettedToday: boolean;
}

export type CarlitosSnapshot = Readonly<CarlitosState>;

export interface CarlitosStatus {
  readonly rest: string;
  readonly hunger: string;
  readonly happiness: string;
}

export function createCarlitosState(
  initial: Partial<CarlitosSnapshot> = {},
): CarlitosState {
  const state: CarlitosState = {
    rest: 'rested',
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
    rest: t(state.rest),
    hunger: t(hungerStatus(state.hunger)),
    happiness: t(happinessStatus(state.unhappiness)),
  };
}

export function carlitosHelpUnavailableMessage(state: CarlitosSnapshot): 'carlitosTired' | 'carlitosExhausted' | null {
  if (state.rest === 'rested') return null;
  return state.rest === 'tired' ? 'carlitosTired' : 'carlitosExhausted';
}

export function useCarlitosHelp(
  state: CarlitosState,
  action: CompanionEventActionId,
): boolean {
  if (state.rest !== 'rested') return false;
  state.rest = action === 'watchCarlitos' ? 'tired' : 'exhausted';
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

  // Rest depends on bedtime care, before morning hunger and mood changes.
  if (state.hunger === 5 && state.unhappiness <= 2) {
    state.rest = state.rest === 'exhausted' ? 'tired' : 'rested';
  } else if (state.hunger <= 3 || state.unhappiness >= 5) {
    state.rest = state.rest === 'rested' ? 'tired' : 'exhausted';
  }

  if (random.next() < 0.5) {
    state.hunger = Math.max(0, state.hunger - 1);
  }

  if (!state.pettedToday) {
    state.unhappiness = Math.min(CARLITOS_MAX_UNHAPPINESS, state.unhappiness + 1);
  }

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

function clampNeed(value: number): number {
  return Math.min(5, Math.max(0, value));
}

function normalizeCarlitos(state: CarlitosState): void {
  state.hunger = clampNeed(state.hunger);
  state.unhappiness = Math.min(CARLITOS_MAX_UNHAPPINESS, Math.max(0, Math.trunc(state.unhappiness)));
}
