import { describe, expect, it, vi } from 'vitest';
import type { EventPresentationAdapter } from '../src/survival/EventPresentationAdapter';

describe('EventPresentationAdapter', () => {
  it('defines the normalized presenter contract', () => {
    const adapter: EventPresentationAdapter = {
      eventId: 'leak',
      roots: [],
      stage: vi.fn(),
      reveal: vi.fn(async () => undefined),
      playChoice: vi.fn(async () => undefined),
      playItemUse: vi.fn(async () => false),
      itemAimTarget: vi.fn(() => null),
      interactionTargets: vi.fn(() => []),
      interactionRoot: vi.fn(() => null),
      resultRoot: vi.fn(() => null),
      react: vi.fn(async () => undefined),
      update: vi.fn(),
      settleForVisibilityChange: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };

    expect(adapter.eventId).toBe('leak');
  });
});
