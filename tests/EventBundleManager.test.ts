// Importance: 9/10. Protects event loading, activation, concurrency, failure cleanup, and shutdown.
import { describe, expect, it, vi } from 'vitest';
import {
  EventBundleLoader,
  type EventBundle,
} from '../src/survival/EventBundle';
import type { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import {
  EventBundleManager,
  type EventBundleLoaderLike,
} from '../src/survival/EventBundleManager';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((complete) => { resolve = complete; }),
    resolve,
  };
}

function bundle(eventId: EventBundle['eventId'], log: string[]): EventBundle {
  return {
    eventId,
    attach: vi.fn(() => log.push(`attach:${eventId}`)),
    dispose: vi.fn(() => log.push(`dispose:${eventId}`)),
  } as unknown as EventBundle;
}

describe('EventBundleManager', () => {
  it('cleans completed siblings when one event resource fails', async () => {
    const audioDispose = vi.fn();
    const featuredDispose = vi.fn();
    const loader = new EventBundleLoader({
      audio: {
        acquireEventAudio: vi.fn(async () => ({
          sounds: [],
          dispose: audioDispose,
        })),
      },
      host: {
        createEventPresenter: vi.fn(),
        attachEventPresenter: vi.fn(),
        detachEventPresenter: vi.fn(),
      },
      loadDedicatedModels: vi.fn(async () => {
        throw new Error('model failed');
      }),
      loadFeaturedModels: vi.fn(async () => ({
        dispose: featuredDispose,
      } as unknown as SurvivalEventModelLibrary)),
    });

    await expect(loader.load('leak')).rejects.toMatchObject({
      name: 'EventBundleLoadError',
      eventId: 'leak',
    });
    expect(audioDispose).toHaveBeenCalledOnce();
    expect(featuredDispose).toHaveBeenCalledOnce();
  });

  it('loads, activates, and releases one event bundle', async () => {
    const log: string[] = [];
    const pending = deferred<EventBundle>();
    const loader: EventBundleLoaderLike = {
      load: vi.fn((eventId) => {
        log.push(`load:${eventId}`);
        return pending.promise;
      }),
    };
    const manager = new EventBundleManager(loader);

    const load = manager.beginLoad('leak');
    expect(log).toEqual(['load:leak']);
    pending.resolve(bundle('leak', log));
    await load;
    await manager.activate('leak');
    manager.releaseActive();

    expect(log).toEqual(['load:leak', 'attach:leak', 'dispose:leak']);
  });

  it('reuses the same pending event and rejects a conflicting event', () => {
    const pending = deferred<EventBundle>();
    const loader: EventBundleLoaderLike = { load: vi.fn(() => pending.promise) };
    const manager = new EventBundleManager(loader);

    expect(manager.beginLoad('leak')).toBe(manager.beginLoad('leak'));
    expect(() => manager.beginLoad('ghosts')).toThrow(
      'Event bundle leak is already loading',
    );
  });

  it('disposes a late bundle after manager shutdown', async () => {
    const log: string[] = [];
    const pending = deferred<EventBundle>();
    const manager = new EventBundleManager({ load: () => pending.promise });

    const load = manager.beginLoad('leak');
    manager.dispose();
    pending.resolve(bundle('leak', log));
    await load;

    expect(log).toEqual(['dispose:leak']);
  });
});
