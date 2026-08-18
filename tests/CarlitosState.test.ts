// Importance: 5/5. Protects companion rules, state boundaries, and dawn processing.
import { describe, expect, it } from 'vitest';
import {
  advanceCarlitosDawn,
  carlitosStatus,
  carlitosWellness,
  createCarlitosState,
  feedCarlitos,
  killCarlitos,
  petCarlitos,
  spendCarlitosEnergy,
  treatCarlitos,
} from '../src/survival/CarlitosState';

const sequence = (...values: number[]) => ({ next: () => values.shift()! });

describe('Carlitos state', () => {
  it('bounds, spends, and recovers event energy', () => {
    expect(createCarlitosState().energy).toBe(3);
    expect(createCarlitosState({ energy: 8 }).energy).toBe(3);
    expect(createCarlitosState({ energy: -2 }).energy).toBe(0);

    const spent = createCarlitosState();
    expect(spendCarlitosEnergy(spent)).toBe(true);
    expect(spent.energy).toBe(0);
    expect(spendCarlitosEnergy(spent)).toBe(false);

    const recovered = createCarlitosState({ energy: 1 });
    advanceCarlitosDawn(recovered, sequence(1, 1, 1));
    expect(recovered.energy).toBe(2);

    const full = createCarlitosState({ energy: 3 });
    advanceCarlitosDawn(full, sequence(1, 1, 1));
    expect(full.energy).toBe(3);

    const dead = createCarlitosState({ energy: 1, hunger: 1 });
    advanceCarlitosDawn(dead, sequence(0));
    expect(dead).toMatchObject({ alive: false, energy: 1 });
  });

  it('maps every approved status boundary', () => {
    expect(carlitosStatus({
      ...createCarlitosState(), hunger: 4, sickness: 3, unhappiness: 7,
    })).toEqual({ hunger: 'Peckish', health: 'Sick', happiness: 'Depressed' });

    expect(carlitosStatus({
      ...createCarlitosState(), hunger: 5, sickness: 0, unhappiness: 2,
    })).toEqual({ hunger: 'Satiated', health: 'Healthy', happiness: 'Happy' });
    expect(carlitosStatus({
      ...createCarlitosState(), hunger: 3, sickness: 1, unhappiness: 4,
    })).toEqual({ hunger: 'Hungry', health: 'Unwell', happiness: 'Bored' });
    expect(carlitosStatus({
      ...createCarlitosState(), hunger: 1, sickness: 4, unhappiness: 6,
    })).toEqual({ hunger: 'Starving', health: 'Dying', happiness: 'Lonely' });
    expect(carlitosStatus({
      ...createCarlitosState(), hunger: 0, sickness: 5, unhappiness: 8,
    })).toEqual({ hunger: 'Starving', health: 'Dead', happiness: 'Miserable' });
  });

  it('pets once and removes four unhappiness', () => {
    const state = { ...createCarlitosState(), unhappiness: 6 };
    expect(petCarlitos(state)).toBe(true);
    expect(state).toMatchObject({ unhappiness: 2, pettedToday: true });
    expect(petCarlitos(state)).toBe(false);
  });

  it('feeds and treats within their approved bounds', () => {
    const state = { ...createCarlitosState(), hunger: 1, sickness: 4 };
    expect(feedCarlitos(state)).toBe(true);
    expect(treatCarlitos(state)).toBe(true);
    expect(state).toMatchObject({ hunger: 5, sickness: 0 });
    expect(feedCarlitos(state)).toBe(false);
    expect(treatCarlitos(state)).toBe(false);
  });

  it('clamps mutable needs to their approved bounds', () => {
    const state = { ...createCarlitosState(), hunger: 9, sickness: -1 };
    expect(feedCarlitos(state)).toBe(false);
    expect(treatCarlitos(state)).toBe(false);
    expect(state).toMatchObject({ hunger: 5, sickness: 0 });
  });

  it('uses the approved wellness penalty', () => {
    expect(carlitosWellness({
      ...createCarlitosState(), hunger: 5, sickness: 1, unhappiness: 4,
    })).toBe(3);
    expect(carlitosWellness({
      ...createCarlitosState(), hunger: 5, sickness: 0, unhappiness: 10,
    })).toBe(0);
  });

  it('processes dawn in the approved order', () => {
    const state = { ...createCarlitosState(), hunger: 5, sickness: 1, unhappiness: 10, pettedToday: false };
    const result = advanceCarlitosDawn(state, sequence(0.499999, 0.019999, 0.089999, 0.44));
    expect(result).toMatchObject({ alive: false, deathCause: 'misery' });
    expect(state).toMatchObject({ hunger: 4, sickness: 0, unhappiness: 11, pettedToday: false });
  });

  it('does not reduce hunger at its exclusive boundary', () => {
    const state = createCarlitosState();
    advanceCarlitosDawn(state, sequence(0.5, 0.01));
    expect(state.hunger).toBe(5);
  });

  it('uses exclusive sickness decline and recovery boundaries', () => {
    const successfulDecline = { ...createCarlitosState(), sickness: 1, pettedToday: true };
    advanceCarlitosDawn(successfulDecline, sequence(0.5, 0.019999, 0.09));
    expect(successfulDecline.sickness).toBe(2);

    const decline = { ...createCarlitosState(), sickness: 1, pettedToday: true };
    advanceCarlitosDawn(decline, sequence(0.5, 0.02, 0.119999));
    expect(decline.sickness).toBe(0);

    const recovery = { ...createCarlitosState(), sickness: 1, pettedToday: true };
    advanceCarlitosDawn(recovery, sequence(0.5, 0.02, 0.12));
    expect(recovery.sickness).toBe(1);
  });

  it('stops dawn processing when hunger reaches zero', () => {
    const state = { ...createCarlitosState(), hunger: 1 };
    const result = advanceCarlitosDawn(state, sequence(0.49));
    expect(result.deathCause).toBe('starvation');
    expect(state.alive).toBe(false);
  });

  it('kills Carlitos when sickness reaches five', () => {
    const state = { ...createCarlitosState(), sickness: 4, pettedToday: true };
    const result = advanceCarlitosDawn(state, sequence(0.5, 0.049999));
    expect(result.deathCause).toBe('sickness');
    expect(state).toMatchObject({ alive: false, sickness: 5, pettedToday: true });
  });

  it('uses an exclusive misery-death boundary and resets pet state after dawn', () => {
    const state = { ...createCarlitosState(), unhappiness: 10 };
    advanceCarlitosDawn(state, sequence(0.5, 0.01, 0.45));
    expect(state).toMatchObject({ alive: true, unhappiness: 11, pettedToday: false });

    const fatalState = { ...createCarlitosState(), unhappiness: 10 };
    advanceCarlitosDawn(fatalState, sequence(0.5, 0.01, 0.449999));
    expect(fatalState.deathCause).toBe('misery');
  });

  it('does not process a dead companion twice', () => {
    const state = createCarlitosState();
    expect(killCarlitos(state, 'misery')).toBe(true);
    expect(killCarlitos(state, 'sickness')).toBe(false);
    expect(advanceCarlitosDawn(state, sequence())).toMatchObject({ deathCause: 'misery' });
  });
});
