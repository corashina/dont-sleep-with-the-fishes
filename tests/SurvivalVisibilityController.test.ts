import { describe, expect, it, vi } from 'vitest';
import { SurvivalVisibilityController } from '../src/survival/SurvivalVisibilityController';

function fakeDocument(initiallyHidden = false) {
  const listeners = new Map<string, EventListener>();
  const document = {
    hidden: initiallyHidden,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
  } as unknown as Document & { hidden: boolean };
  return {
    document,
    listeners,
    setHidden(hidden: boolean) {
      document.hidden = hidden;
      listeners.get('visibilitychange')?.(new Event('visibilitychange'));
    },
  };
}

describe('SurvivalVisibilityController', () => {
  it('owns the initial hidden state and document listener', () => {
    const fake = fakeDocument(true);
    const onHidden = vi.fn();
    const controller = new SurvivalVisibilityController(
      fake.document,
      onHidden,
      vi.fn(),
    );

    expect(controller.isHidden()).toBe(true);
    expect(fake.document.addEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(onHidden).toHaveBeenCalledOnce();
  });

  it('removes the listener when the initial hidden callback fails', () => {
    const fake = fakeDocument(true);
    const primary = new Error('initial hidden failed');

    expect(() => new SurvivalVisibilityController(
      fake.document,
      () => { throw primary; },
      vi.fn(),
    )).toThrow(primary);

    expect(fake.document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(fake.listeners.has('visibilitychange')).toBe(false);
  });

  it('keeps the initial callback error when listener rollback fails', () => {
    const fake = fakeDocument(true);
    const primary = new Error('initial hidden failed');
    const onHidden = vi.fn(() => { throw primary; });
    const onVisible = vi.fn();
    vi.mocked(fake.document.removeEventListener).mockImplementationOnce(() => {
      throw new Error('rollback failed');
    });

    expect(() => new SurvivalVisibilityController(
      fake.document,
      onHidden,
      onVisible,
    )).toThrow(primary);

    fake.setHidden(false);
    expect(onHidden).toHaveBeenCalledOnce();
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('calls hidden and visible effects for visibility changes', () => {
    const fake = fakeDocument();
    const onHidden = vi.fn();
    const onVisible = vi.fn();
    const controller = new SurvivalVisibilityController(
      fake.document,
      onHidden,
      onVisible,
    );

    fake.setHidden(true);
    fake.setHidden(false);

    expect(onHidden).toHaveBeenCalledOnce();
    expect(onVisible).toHaveBeenCalledOnce();
    expect(controller.isHidden()).toBe(false);
  });

  it('resolves multiple current waiters after visibility returns', async () => {
    const fake = fakeDocument(true);
    const controller = new SurvivalVisibilityController(
      fake.document,
      vi.fn(),
      vi.fn(),
    );
    const first = controller.waitForResume(() => true);
    const second = controller.waitForResume(() => true);

    fake.setHidden(false);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('checks each waiter lifecycle when visibility returns', async () => {
    const fake = fakeDocument(true);
    let current = true;
    const controller = new SurvivalVisibilityController(
      fake.document,
      vi.fn(),
      vi.fn(),
    );
    const resumed = controller.waitForResume(() => current);

    current = false;
    fake.setHidden(false);

    await expect(resumed).resolves.toBe(false);
  });

  it('holds visible waiters until a manual pause ends', async () => {
    const fake = fakeDocument(true);
    let paused = true;
    let settled = false;
    const controller = new SurvivalVisibilityController(
      fake.document,
      vi.fn(),
      vi.fn(),
      () => !paused,
    );
    const resumed = controller.waitForResume(() => true).then((value) => {
      settled = true;
      return value;
    });

    fake.setHidden(false);
    await Promise.resolve();
    expect(settled).toBe(false);

    paused = false;
    controller.releaseResumeWaiters();
    await expect(resumed).resolves.toBe(true);
  });

  it('removes its listener and resolves every waiter false on disposal', async () => {
    const fake = fakeDocument(true);
    const onVisible = vi.fn();
    const controller = new SurvivalVisibilityController(
      fake.document,
      vi.fn(),
      onVisible,
    );
    const first = controller.waitForResume(() => true);
    const second = controller.waitForResume(() => true);

    controller.dispose();
    fake.setHidden(false);

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(fake.document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(fake.listeners.has('visibilitychange')).toBe(false);
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('resolves every waiter when listener removal fails during disposal', async () => {
    const fake = fakeDocument(true);
    const removalError = new Error('listener removal failed');
    const onVisible = vi.fn();
    vi.mocked(fake.document.removeEventListener).mockImplementationOnce(() => {
      throw removalError;
    });
    const controller = new SurvivalVisibilityController(
      fake.document,
      vi.fn(),
      onVisible,
    );
    const first = controller.waitForResume(() => true);
    const second = controller.waitForResume(() => true);

    expect(() => controller.dispose()).toThrow(removalError);

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    fake.setHidden(false);
    expect(onVisible).not.toHaveBeenCalled();
    expect(() => controller.dispose()).not.toThrow();
    expect(fake.document.removeEventListener).toHaveBeenCalledOnce();
  });
});
