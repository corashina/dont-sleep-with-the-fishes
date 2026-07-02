import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/state/EventBus';
import { Phase } from '../src/state/phases';

describe('EventBus', () => {
  it('delivers typed events to handlers', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on('phaseChange', h);
    bus.emit({ type: 'phaseChange', phase: Phase.Day });
    expect(h).toHaveBeenCalledWith({ type: 'phaseChange', phase: Phase.Day });
  });
  it('unsubscribe stops delivery', () => {
    const bus = new EventBus();
    const h = vi.fn();
    const off = bus.on('resourceChange', h);
    off();
    bus.emit({ type: 'resourceChange', resource: 'hunger' });
    expect(h).not.toHaveBeenCalled();
  });
  it('does not deliver other event types', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.on('message', h);
    bus.emit({ type: 'phaseChange', phase: Phase.Day });
    expect(h).not.toHaveBeenCalled();
  });
});
