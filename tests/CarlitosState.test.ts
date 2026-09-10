import { describe, expect, it } from 'vitest';
import {
  advanceCarlitosDawn, createCarlitosState, feedCarlitos, petCarlitos,
  useCarlitosHelp,
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

  it.each([{ hunger: 4 }, { unhappiness: 3 }])('holds rest when needs are mild: %j', (needs) => {
    const state = createCarlitosState({ rest: 'tired', ...needs });
    advanceCarlitosDawn(state, quiet);
    expect(state.rest).toBe('tired');
  });

  it.each([{ hunger: 3 }, { unhappiness: 5 }])('loses one state per neglected night: %j', (needs) => {
    const state = createCarlitosState(needs);
    advanceCarlitosDawn(state, quiet);
    expect(state.rest).toBe('tired');
    advanceCarlitosDawn(state, quiet);
    expect(state.rest).toBe('exhausted');
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

  it.each(['exhausted', 'tired'] as const)('blocks every active help action while %s', (rest) => {
    for (const action of ['watchCarlitos', 'delegateCarlitos'] as const) {
      const state = createCarlitosState({ rest });
      expect(useCarlitosHelp(state, action)).toBe(false);
      expect(state.rest).toBe(rest);
    }
  });

  it.each([
    ['watchCarlitos', 'tired'], ['delegateCarlitos', 'exhausted'],
  ] as const)('finishes %s as %s', (action, rest) => {
    const state = createCarlitosState();
    expect(useCarlitosHelp(state, action)).toBe(true);
    expect(state.rest).toBe(rest);
    expect(useCarlitosHelp(state, action)).toBe(false);
  });
});
