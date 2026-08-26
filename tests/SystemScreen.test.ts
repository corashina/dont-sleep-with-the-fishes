// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createSystemScreen,
  updateSystemScreenProgress,
} from '../src/ui/SystemScreen';

describe('SystemScreen', () => {
  it('shows only loading progress', () => {
    const screen = createSystemScreen({
      kind: 'loading',
    });

    const progress = screen.querySelector<HTMLProgressElement>('.system-loading-progress');

    expect(screen.querySelector('.kicker')).toBeNull();
    expect(screen.querySelector('h1')).toBeNull();
    expect(screen.querySelector('.lead')).toBeNull();
    expect(screen.textContent).toBe('');
    expect(progress?.nextElementSibling).toBeNull();

    updateSystemScreenProgress(screen, 3, 9);

    expect(progress?.value).toBe(3);
    expect(progress?.max).toBe(9);
  });
});
