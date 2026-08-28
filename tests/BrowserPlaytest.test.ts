import { describe, expect, it } from 'vitest';
import { createItemInstances } from '../src/game/itemCatalog';
import {
  BrowserPlaytestInputError,
  parseBrowserPlaytest,
} from '../src/app/BrowserPlaytest';

describe('browser playtest input', () => {
  it('keeps normal development startup without playtest input', () => {
    expect(parseBrowserPlaytest('?stats', true)).toBeNull();
  });

  it('ignores playtest input in production', () => {
    expect(parseBrowserPlaytest(
      '?playtest=survival&seed=7&missing=map-1&missing=knife-1',
      false,
    )).toBeNull();
  });

  it('uses the exact seed and removes two item instances', () => {
    const startup = parseBrowserPlaytest(
      '?playtest=survival&seed=4294967295&missing=cannedFood-2&missing=baitTin-1',
      true,
    );

    expect(startup?.seed).toBe(4294967295);
    expect(startup?.missingItemIds).toEqual(['cannedFood-2', 'baitTin-1']);
    expect(startup?.savedItems.map(({ instanceId }) => instanceId))
      .not.toContain('cannedFood-2');
    expect(startup?.savedItems.map(({ instanceId }) => instanceId))
      .not.toContain('baitTin-1');
    expect(Object.isFrozen(startup)).toBe(true);
    expect(Object.isFrozen(startup?.missingItemIds)).toBe(true);
    expect(Object.isFrozen(startup?.savedItems)).toBe(true);
    expect(startup?.savedItems.every(Object.isFrozen)).toBe(true);
    expect(startup?.savedItems.map(({ instanceId }) => instanceId)).toEqual(
      createItemInstances()
        .filter(({ instanceId }) => !['cannedFood-2', 'baitTin-1'].includes(instanceId))
        .map(({ instanceId }) => instanceId),
    );
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
