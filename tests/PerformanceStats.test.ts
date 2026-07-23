// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { PerformanceStats } from '../src/ui/PerformanceStats';

afterEach(() => { document.body.innerHTML = ''; });

describe('PerformanceStats', () => {
  it('hides FPS output by default and exposes it only when requested', () => {
    const mount = document.createElement('main');
    const normal = new PerformanceStats(mount);
    expect(mount.querySelector<HTMLOutputElement>('[data-performance-stats]')?.hidden).toBe(true);
    normal.dispose();
    const debug = new PerformanceStats(mount, true);
    expect(mount.querySelector<HTMLOutputElement>('[data-performance-stats]')?.hidden).toBe(false);
    debug.dispose();
  });
});