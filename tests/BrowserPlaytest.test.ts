import { describe, expect, it } from 'vitest';
import {
  parseBrowserPlaytest,
} from '../src/app/BrowserPlaytest';

describe('browser playtest input', () => {
  it('ignores playtest input in production', () => {
    expect(parseBrowserPlaytest(
      '?playtest=survival&seed=7&missing=map-1&missing=knife-1',
      false,
    )).toBeNull();
  });
});
