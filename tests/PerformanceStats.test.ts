// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { PerformanceStats } from '../src/ui/PerformanceStats';

describe('PerformanceStats', () => {
  it('only records frames while visible and can be toggled at runtime', () => {
    const mount = document.createElement('main');
    const stats = new PerformanceStats(mount);
    const output = mount.querySelector<HTMLOutputElement>('[data-performance-stats]')!;

    expect(stats.isVisible()).toBe(false);
    stats.recordFrame(0.5);
    expect(output.textContent).toBe('FPS --');

    stats.setVisible(true);
    expect(stats.isVisible()).toBe(true);
    stats.recordFrame(0.25);
    stats.recordFrame(0.25);
    expect(output.textContent).toBe('FPS 4');

    stats.setVisible(false);
    expect(output.hidden).toBe(true);
    stats.dispose();
    expect(output.isConnected).toBe(false);
  });
});
