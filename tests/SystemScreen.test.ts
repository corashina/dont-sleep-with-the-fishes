// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createSystemScreen } from '../src/ui/SystemScreen';

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
});
