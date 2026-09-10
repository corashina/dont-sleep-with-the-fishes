import { describe,expect,it } from 'vitest';
import {
  advanceCarlitosDawn,
  carlitosEnergyLimit,
  createCarlitosState,
  feedCarlitos,
  petCarlitos,
  spendCarlitosEnergy,
} from '../src/survival/CarlitosState';

const quiet = { next: () => 0.99 };

describe('Carlitos condition and recovery', () => {

  it('combines hunger and mood in the energy limit', () => {
    expect(createCarlitosState({ hunger: 3 }).energy).toBe(2);
    expect(createCarlitosState({ hunger: 3, unhappiness: 3 }).energy).toBe(1);
    expect(createCarlitosState({ hunger: 3, unhappiness: 5 }).energy).toBe(0);
  });

  it('keeps prolonged neglect bounded and permits full recovery', () => {
    const state = createCarlitosState();
    for (let day = 0; day < 1000; day += 1) advanceCarlitosDawn(state, { next: () => 0 });
    expect(state).toMatchObject({ hunger: 0, energy: 0, unhappiness: 10 });
    expect(state).not.toHaveProperty('alive');
    expect(state).not.toHaveProperty('deathCause');
    expect(spendCarlitosEnergy(state, 1)).toBe(false);
    expect(feedCarlitos(state)).toBe(true);
    for (let day = 0; day < 5; day += 1) {
      petCarlitos(state);
      advanceCarlitosDawn(state, quiet);
    }
    expect(state).toMatchObject({ energy: 3, hunger: 5 });
    expect(spendCarlitosEnergy(state, 3)).toBe(true);
  });

  it('allows every care action at zero energy, then restores energy through rest', () => {
    const state = createCarlitosState({ hunger: 0, unhappiness: 5 });
    expect(feedCarlitos(state)).toBe(true);
    expect(petCarlitos(state)).toBe(true);
    expect(carlitosEnergyLimit(state)).toBe(3);
    expect(state.energy).toBe(0);
    advanceCarlitosDawn(state, quiet);
    expect(state.energy).toBe(1);
    expect(spendCarlitosEnergy(state, 2)).toBe(false);
    expect(spendCarlitosEnergy(state, 1)).toBe(true);
  });

  it('reduces stored energy when worsening condition lowers the limit', () => {
    const state = createCarlitosState({ hunger: 4, unhappiness: 2 });
    advanceCarlitosDawn(state, { next: () => 0.4 });
    expect(state).toMatchObject({ hunger: 3, unhappiness: 3, energy: 1 });
  });
});
