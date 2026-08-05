// Importance: 5/5. Protects companion rules, state boundaries, and dawn processing.
import { describe, expect, it } from 'vitest';
import {
  advanceCaptainWhiskersDawn,
  captainWhiskersStatus,
  captainWhiskersWellness,
  createCaptainWhiskersState,
  feedCaptainWhiskers,
  killCaptainWhiskers,
  petCaptainWhiskers,
  treatCaptainWhiskers,
} from '../src/survival/CaptainWhiskersState';

const sequence = (...values: number[]) => ({ next: () => values.shift()! });

describe('Captain Whiskers state', () => {
  it('maps every approved status boundary', () => {
    expect(captainWhiskersStatus({
      ...createCaptainWhiskersState(), hunger: 4, sickness: 3, unhappiness: 7,
    })).toEqual({ hunger: 'Peckish', health: 'Sick', happiness: 'Depressed' });

    expect(captainWhiskersStatus({
      ...createCaptainWhiskersState(), hunger: 5, sickness: 0, unhappiness: 2,
    })).toEqual({ hunger: 'Satiated', health: 'Healthy', happiness: 'Happy' });
    expect(captainWhiskersStatus({
      ...createCaptainWhiskersState(), hunger: 3, sickness: 1, unhappiness: 4,
    })).toEqual({ hunger: 'Hungry', health: 'Unwell', happiness: 'Bored' });
    expect(captainWhiskersStatus({
      ...createCaptainWhiskersState(), hunger: 1, sickness: 4, unhappiness: 6,
    })).toEqual({ hunger: 'Starving', health: 'Dying', happiness: 'Lonely' });
    expect(captainWhiskersStatus({
      ...createCaptainWhiskersState(), hunger: 0, sickness: 5, unhappiness: 8,
    })).toEqual({ hunger: 'Starving', health: 'Dead', happiness: 'Miserable' });
  });

  it('pets once and removes four unhappiness', () => {
    const state = { ...createCaptainWhiskersState(), unhappiness: 6 };
    expect(petCaptainWhiskers(state)).toBe(true);
    expect(state).toMatchObject({ unhappiness: 2, pettedToday: true });
    expect(petCaptainWhiskers(state)).toBe(false);
  });

  it('feeds and treats within their approved bounds', () => {
    const state = { ...createCaptainWhiskersState(), hunger: 1, sickness: 4 };
    expect(feedCaptainWhiskers(state)).toBe(true);
    expect(treatCaptainWhiskers(state)).toBe(true);
    expect(state).toMatchObject({ hunger: 5, sickness: 0 });
    expect(feedCaptainWhiskers(state)).toBe(false);
    expect(treatCaptainWhiskers(state)).toBe(false);
  });

  it('clamps mutable needs to their approved bounds', () => {
    const state = { ...createCaptainWhiskersState(), hunger: 9, sickness: -1 };
    expect(feedCaptainWhiskers(state)).toBe(false);
    expect(treatCaptainWhiskers(state)).toBe(false);
    expect(state).toMatchObject({ hunger: 5, sickness: 0 });
  });

  it('uses the approved wellness penalty', () => {
    expect(captainWhiskersWellness({
      ...createCaptainWhiskersState(), hunger: 5, sickness: 1, unhappiness: 4,
    })).toBe(3);
    expect(captainWhiskersWellness({
      ...createCaptainWhiskersState(), hunger: 5, sickness: 0, unhappiness: 10,
    })).toBe(0);
  });

  it('processes dawn in the approved order', () => {
    const state = { ...createCaptainWhiskersState(), hunger: 5, sickness: 1, unhappiness: 10, pettedToday: false };
    const result = advanceCaptainWhiskersDawn(state, sequence(0.499999, 0.019999, 0.089999, 0.44));
    expect(result).toMatchObject({ alive: false, deathCause: 'misery' });
    expect(state).toMatchObject({ hunger: 4, sickness: 0, unhappiness: 11, pettedToday: false });
  });

  it('does not reduce hunger at its exclusive boundary', () => {
    const state = createCaptainWhiskersState();
    advanceCaptainWhiskersDawn(state, sequence(0.5, 0.01));
    expect(state.hunger).toBe(5);
  });

  it('uses exclusive sickness decline and recovery boundaries', () => {
    const successfulDecline = { ...createCaptainWhiskersState(), sickness: 1, pettedToday: true };
    advanceCaptainWhiskersDawn(successfulDecline, sequence(0.5, 0.019999, 0.09));
    expect(successfulDecline.sickness).toBe(2);

    const decline = { ...createCaptainWhiskersState(), sickness: 1, pettedToday: true };
    advanceCaptainWhiskersDawn(decline, sequence(0.5, 0.02, 0.119999));
    expect(decline.sickness).toBe(0);

    const recovery = { ...createCaptainWhiskersState(), sickness: 1, pettedToday: true };
    advanceCaptainWhiskersDawn(recovery, sequence(0.5, 0.02, 0.12));
    expect(recovery.sickness).toBe(1);
  });

  it('stops dawn processing when hunger reaches zero', () => {
    const state = { ...createCaptainWhiskersState(), hunger: 1 };
    const result = advanceCaptainWhiskersDawn(state, sequence(0.49));
    expect(result.deathCause).toBe('starvation');
    expect(state.alive).toBe(false);
  });

  it('kills Whiskers when sickness reaches five', () => {
    const state = { ...createCaptainWhiskersState(), sickness: 4, pettedToday: true };
    const result = advanceCaptainWhiskersDawn(state, sequence(0.5, 0.049999));
    expect(result.deathCause).toBe('sickness');
    expect(state).toMatchObject({ alive: false, sickness: 5, pettedToday: true });
  });

  it('uses an exclusive misery-death boundary and resets pet state after dawn', () => {
    const state = { ...createCaptainWhiskersState(), unhappiness: 10 };
    advanceCaptainWhiskersDawn(state, sequence(0.5, 0.01, 0.45));
    expect(state).toMatchObject({ alive: true, unhappiness: 11, pettedToday: false });

    const fatalState = { ...createCaptainWhiskersState(), unhappiness: 10 };
    advanceCaptainWhiskersDawn(fatalState, sequence(0.5, 0.01, 0.449999));
    expect(fatalState.deathCause).toBe('misery');
  });

  it('does not process a dead companion twice', () => {
    const state = createCaptainWhiskersState();
    expect(killCaptainWhiskers(state, 'sea-watcher')).toBe(true);
    expect(killCaptainWhiskers(state, 'misery')).toBe(false);
    expect(advanceCaptainWhiskersDawn(state, sequence())).toMatchObject({ deathCause: 'sea-watcher' });
  });
});
