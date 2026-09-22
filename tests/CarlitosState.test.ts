import { describe, expect, it } from 'vitest';
import {
  advanceCarlitosDawn, createCarlitosState, feedCarlitos, petCarlitos,
} from '../src/survival/CarlitosState';

const quiet = { next: () => 0.99 };

describe('Carlitos rest and care', () => {
  it('recovers one state per cared-for night, up to rested', () => {
    const state = createCarlitosState({ rest: 'exhausted' });
    for (const rest of ['tired', 'rested', 'rested']) {
      advanceCarlitosDawn(state, quiet);
      expect(state.rest).toBe(rest);
    }
  });

  it('uses bedtime care before random morning hunger and mood changes', () => {
    const state = createCarlitosState({ rest: 'tired', unhappiness: 2 });
    advanceCarlitosDawn(state, { next: () => 0 });
    expect(state).toMatchObject({ rest: 'rested', hunger: 4, unhappiness: 3 });
  });

  it('keeps neglect bounded and allows care before full recovery', () => {
    const state = createCarlitosState();
    for (let day = 0; day < 1000; day += 1) advanceCarlitosDawn(state, { next: () => 0 });
    expect(state).toMatchObject({ rest: 'exhausted', hunger: 0, unhappiness: 10 });
    expect(feedCarlitos(state)).toBe(true);
    expect(petCarlitos(state)).toBe(true);
    expect(state.rest).toBe('exhausted');
    for (let day = 0; day < 5; day += 1) {
      petCarlitos(state);
      advanceCarlitosDawn(state, quiet);
    }
    expect(state.rest).toBe('rested');
  });
});
