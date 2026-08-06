// @vitest-environment jsdom
// Importance: 4/5. Protects safe error text rendering.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createSystemScreen,
  updateSystemScreenProgress,
} from '../src/ui/SystemScreen';

const mainStyles = readFileSync('src/styles/main.css', 'utf8') as string;

describe('SystemScreen', () => {
  it('renders diagnostic text literally instead of creating markup', () => {
    const screen = createSystemScreen({
      kind: 'error',
      kicker: 'WEBGL UNAVAILABLE',
      title: 'Unable to launch',
      lead: 'This demo needs WebGL 2.',
      detail: '<script>globalThis.compromised = true</script> & missing',
    });

    expect(screen.querySelector('script')).toBeNull();
    expect(screen.querySelector('.fine-print')?.textContent)
      .toBe('<script>globalThis.compromised = true</script> & missing');
    expect(screen.querySelector('.fine-print')?.classList).toContain('ui-role-narrative');
  });

  it('renders and updates loading progress', () => {
    const screen = createSystemScreen({
      kind: 'loading',
      kicker: 'RECOVERING SUPPLIES',
      title: 'Preparing the ship',
      lead: 'Loading equipment.',
    });
    const progress = screen.querySelector<HTMLProgressElement>('.system-loading-progress');

    expect(progress).not.toBeNull();
    updateSystemScreenProgress(screen, 3, 9);
    expect(progress?.value).toBe(3);
    expect(progress?.max).toBe(9);
    expect(progress?.getAttribute('aria-valuetext')).toBe('33%');
  });
});
