import { describe, expect, it } from 'vitest';
import {
  BrowserPlaytestInputError,
  parseBrowserPlaytest,
} from '../src/app/BrowserPlaytest';

describe('browser playtest input', () => {
  it('ignores playtest input in production', () => {
    expect(parseBrowserPlaytest(
      '?playtest=survival&seed=7&missing=map-1&missing=knife-1',
      false,
    )).toBeNull();
  });

  it.each([
    ['?playtest=survival&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=01&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=1&seed=2&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=4294967296&missing=map-1&missing=knife-1', 'seed'],
    ['?playtest=survival&seed=1&missing=map-1', 'missing'],
    ['?playtest=survival&seed=1&missing=map-1&missing=map-1', 'missing'],
    ['?playtest=survival&seed=1&missing=map&missing=knife-1', 'missing'],
    ['?playtest=menu&seed=1&missing=map-1&missing=knife-1', 'playtest'],
    ['?playtest=survival&playtest=survival&seed=1&missing=map-1&missing=knife-1', 'playtest'],
  ])('rejects %s at %s', (search, parameter) => {
    expect(() => parseBrowserPlaytest(search, true)).toThrow(
      new BrowserPlaytestInputError(parameter),
    );
  });
});
