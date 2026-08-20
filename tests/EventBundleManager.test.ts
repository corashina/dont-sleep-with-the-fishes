// Importance: 9/10. Protects event loading, activation, concurrency, failure cleanup, and shutdown.
import { describe, expect, it, vi } from 'vitest';
import { AnimationClip, Group, PerspectiveCamera } from 'three';
import { ActiveEventPresenter } from '../src/survival/ActiveEventPresenter';
import {
  EventBundleLoader,
  type EventBundle,
} from '../src/survival/EventBundle';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { EventPresentationLayer } from '../src/survival/EventPresentationLayer';
import type { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import {
  EventBundleManager,
  type EventBundleLoaderLike,
} from '../src/survival/EventBundleManager';
import { createTestPropModels } from './helpers/propModels';

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
  it.each([
    [
      'palm model',
      { missingModel: 'midnightPalmTrees' },
      'Missing required Midnight Tour palm model.',
    ],
    [
      'chest model',
      { missingModel: 'chestClosed' },
      'Missing required Midnight Tour chest model.',
    ],
    [
      'shovel model',
      { missingModel: 'midnightShovel' },
      'Missing required Midnight Tour shovel model.',
    ],
    [
      'monster model',
      { missingModel: 'midnightMonster' },
      'Missing required Midnight Tour monster model.',
    ],
    [
      'monster run clip',
      { missingClip: 'CharacterArmature|Run' },
      'Missing required Midnight Tour monster clip: CharacterArmature|Run.',
    ],
    [
      'monster attack clip',
      { missingClip: 'CharacterArmature|Run_Attack' },
      'Missing required Midnight Tour monster clip: CharacterArmature|Run_Attack.',
    ],
  ] as const)(
    'rejects Midnight Tour activation when the required %s is missing',
    async (_label, missing, message) => {
      const propModels = createTestPropModels();
      const createEventModel = propModels.createEventModel.bind(propModels);
      vi.spyOn(propModels, 'createEventModel').mockImplementation((id) => {
        if ('missingModel' in missing && id === missing.missingModel) return null;
        const selected = createEventModel(id);
        if (id !== 'midnightMonster' || selected === null) return selected;
        const clipNames = [
          'CharacterArmature|Run',
          'CharacterArmature|Run_Attack',
        ].filter((name) => !('missingClip' in missing && name === missing.missingClip));
        return {
          root: selected.root,
          animations: clipNames.map((name) => new AnimationClip(name, 1)),
        };
      });
      const scene = new Group();
      const cameraRig = new Group();
      const camera = new PerspectiveCamera();
      cameraRig.add(camera);
      const loader = new EventBundleLoader({
        audio: {
          acquireEventAudio: vi.fn(async () => ({
            sounds: [],
            dispose: vi.fn(),
          })),
        },
        host: {
          createEventPresenter: () => {
            const layer = new EventPresentationLayer({
              propModels,
              waves: [],
              cameraRig,
              camera,
              supplyDisplay: {} as never,
              chestDisplay: {} as never,
              emitCue: () => undefined,
            }, {}, 'midnight-tour');
            return new ActiveEventPresenter('midnight-tour', {
              dedicated: null,
              layer,
              featured: null,
              weather: null,
              supernatural: null,
              roots: [{ parent: scene, root: layer.root }],
            });
          },
          attachEventPresenter: (presenter) => presenter.attach(),
          detachEventPresenter: (presenter) => presenter.detach(),
        },
        loadDedicatedModels: vi.fn(async () => ({
          dispose: vi.fn(),
        } as unknown as EventModelLibrary)),
        loadFeaturedModels: vi.fn(async () => ({
          clone: () => { throw new Error('Unexpected featured model clone.'); },
          dispose: vi.fn(),
        } as unknown as SurvivalEventModelLibrary)),
      });
      const manager = new EventBundleManager(loader);
      manager.beginLoad('midnight-tour');
      let activationError: unknown;

      try {
        await manager.activate('midnight-tour');
      } catch (error) {
        activationError = error;
      } finally {
        manager.dispose();
        propModels.dispose();
      }

      expect(activationError).toMatchObject({
        name: 'EventBundleLoadError',
        eventId: 'midnight-tour',
        message: `Event midnight-tour: ${message}`,
        cause: {
          message,
        },
      });
    },
  );

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
