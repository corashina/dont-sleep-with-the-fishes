import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { EventPresentationAdapter } from '../src/survival/EventPresentationAdapter';
import { EventPresentationHost } from '../src/survival/EventPresentationHost';

function createAdapter(
  eventId: EventPresentationAdapter['eventId'] = 'leak',
  roots = [{ parent: new Group(), root: new Group() }],
): EventPresentationAdapter {
  return {
    eventId,
    roots,
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
}

describe('EventPresentationHost', () => {
  it('attaches roots and delegates the normalized lifecycle', async () => {
    const attachmentOrder: string[] = [];
    const first = { parent: new Group(), root: new Group() };
    const second = { parent: new Group(), root: new Group() };
    vi.spyOn(first.parent, 'add').mockImplementation((root) => {
      attachmentOrder.push('first');
      return Group.prototype.add.call(first.parent, root);
    });
    vi.spyOn(second.parent, 'add').mockImplementation((root) => {
      attachmentOrder.push('second');
      return Group.prototype.add.call(second.parent, root);
    });
    const adapter = createAdapter('leak', [first, second]);
    const host = new EventPresentationHost();
    const context = { eventId: 'leak' as const, targetInstanceId: null, variantSeed: 3 };
    const choice = { id: 'seal' } as never;
    const reaction = {} as never;

    host.attach(adapter);
    expect(attachmentOrder).toEqual(['first', 'second']);
    expect(first.parent.children).toEqual([first.root]);
    expect(second.parent.children).toEqual([second.root]);
    expect(host.activeEventId()).toBe('leak');
    const aimTarget = new Group();
    const interactionTargets = [{
      id: 'custom-target',
      label: 'CUSTOM',
      description: 'Custom target.',
      choiceId: 'inspect',
      root: new Group(),
    }];
    const interactionRoot = new Group();
    const resultRoot = new Group();
    vi.mocked(adapter.itemAimTarget).mockReturnValue(aimTarget);
    vi.mocked(adapter.interactionTargets).mockReturnValue(interactionTargets);
    vi.mocked(adapter.interactionRoot).mockReturnValue(interactionRoot);
    vi.mocked(adapter.resultRoot).mockReturnValue(resultRoot);
    expect(host.itemAimTarget()).toBe(aimTarget);
    expect(host.interactionTargets()).toBe(interactionTargets);
    expect(host.interactionRoot('seal')).toBe(interactionRoot);
    expect(host.resultRoot('seal')).toBe(resultRoot);

    host.stage(context);
    await host.reveal();
    await host.playChoice(choice);
    await host.playItemUse('seal', 'cannedFood-1');
    await host.react(reaction);
    host.update(11, 0.5);
    host.settleForVisibilityChange();
    host.clear();

    expect(adapter.stage).toHaveBeenCalledWith(context);
    expect(adapter.reveal).toHaveBeenCalledOnce();
    expect(adapter.playChoice).toHaveBeenCalledWith(choice);
    expect(adapter.playItemUse).toHaveBeenCalledWith('seal', 'cannedFood-1');
    expect(adapter.react).toHaveBeenCalledWith(reaction);
    expect(adapter.update).toHaveBeenCalledWith(11, 0.5);
    expect(adapter.settleForVisibilityChange).toHaveBeenCalledOnce();
    expect(adapter.clear).toHaveBeenCalledOnce();
    expect(host.activeEventId()).toBe('leak');

    host.detach(adapter);
    expect(first.root.parent).toBeNull();
    expect(second.root.parent).toBeNull();
    expect(host.activeEventId()).toBeNull();
  });

  it('rejects duplicate attachment and detaching a different adapter', () => {
    const host = new EventPresentationHost();
    const adapter = createAdapter();
    const other = createAdapter('flowers');

    host.attach(adapter);

    expect(() => host.attach(adapter)).toThrow('Event presentation is already attached.');
    expect(() => host.attach(other)).toThrow('Event presentation is already attached.');
    expect(() => host.detach(other)).toThrow('Cannot detach an inactive event presentation.');
  });

  it('rolls back attached roots in reverse order and preserves the attachment error', () => {
    const first = { parent: new Group(), root: new Group() };
    const failingParent = new Group();
    const attachmentError = new Error('attach failed');
    const removeError = new Error('remove failed');
    const originalRemove = first.root.removeFromParent.bind(first.root);
    const remove = vi.spyOn(first.root, 'removeFromParent').mockImplementation(() => {
      if (remove.mock.calls.length > 1) throw removeError;
      return originalRemove();
    });
    vi.spyOn(failingParent, 'add').mockImplementation(() => {
      throw attachmentError;
    });
    const adapter = createAdapter('leak', [first, { parent: failingParent, root: new Group() }]);
    const host = new EventPresentationHost();

    expect(() => host.attach(adapter)).toThrow(attachmentError);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(host.activeEventId()).toBeNull();
  });

  it('clears once for each staged activation and skips cleared work during disposal', () => {
    const host = new EventPresentationHost();
    const adapter = createAdapter();
    const context = { eventId: 'leak' as const, targetInstanceId: null, variantSeed: 3 };

    host.attach(adapter);
    host.stage(context);
    host.clear();
    host.clear();
    host.stage(context);
    host.clear();
    host.dispose();

    expect(adapter.stage).toHaveBeenCalledTimes(2);
    expect(adapter.clear).toHaveBeenCalledTimes(2);
  });

  it('cleans up after a clear failure and leaves disposal to the bundle', () => {
    const order: string[] = [];
    const first = new Group();
    const second = new Group();
    const clearError = new Error('clear failed');
    const adapter = createAdapter('leak', [
      { parent: new Group(), root: first },
      { parent: new Group(), root: second },
    ]);
    vi.mocked(adapter.clear).mockImplementation(() => {
      order.push('clear');
      throw clearError;
    });
    vi.spyOn(first, 'removeFromParent').mockImplementation(() => {
      order.push('first');
      return Group.prototype.removeFromParent.call(first);
    });
    vi.spyOn(second, 'removeFromParent').mockImplementation(() => {
      order.push('second');
      return Group.prototype.removeFromParent.call(second);
    });
    const host = new EventPresentationHost();

    host.attach(adapter);
    order.length = 0;
    expect(() => host.dispose()).toThrow(clearError);
    host.dispose();

    expect(adapter.clear).toHaveBeenCalledOnce();
    expect(adapter.dispose).not.toHaveBeenCalled();
    expect(order).toEqual(['clear', 'second', 'first']);
    expect(first.parent).toBeNull();
    expect(second.parent).toBeNull();
    expect(() => host.attach(createAdapter())).toThrow('Event presentation host is disposed.');
  });
});
