// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createSystemScreen } from '../src/ui/SystemScreen';

describe('SystemScreen', () => {
  it('builds the shared poster hierarchy with explicit typography roles', () => {
    const screen = createSystemScreen({
      kind: 'loading',
      kicker: 'RECOVERING SUPPLIES',
      title: 'Preparing the ship',
      lead: 'Loading the equipment you will need to survive.',
    });

    expect(screen.classList).toContain('system-screen');
    expect(screen.classList).toContain('system-screen--loading');
    expect(screen.querySelector('.kicker')?.classList).toContain('ui-role-context');
    expect(screen.querySelector('h1')?.classList).toContain('ui-role-display');
    expect(screen.querySelector('.lead')?.classList).toContain('ui-role-narrative');
    expect(screen.querySelector('.fine-print')).toBeNull();
  });

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
});
