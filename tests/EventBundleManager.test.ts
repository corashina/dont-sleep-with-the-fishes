// Importance: 9/10. Protects event loading, activation, concurrency, failure cleanup, and shutdown.
import { describe, expect, it, vi } from 'vitest';
import { AnimationClip, Group, PerspectiveCamera } from 'three';
import {
  EventBundle,
  EventBundleLoader,
} from '../src/survival/EventBundle';
import type { EventPresentationAdapter } from '../src/survival/EventPresentationAdapter';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import type { SurvivalEventModelLibrary } from '../src/survival/SurvivalEventModelLibrary';
import {
  EventBundleManager,
  type EventBundleLoaderLike,
} from '../src/survival/EventBundleManager';
import { createFocusedAdapter } from '../src/survival/eventPresentationAdapters';
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

function adapter(eventId: EventPresentationAdapter['eventId']): EventPresentationAdapter {
  return {
    eventId,
    roots: [],
    stage: vi.fn(),
    reveal: vi.fn(async () => undefined),
    playChoice: vi.fn(async () => undefined),
    playItemUse: vi.fn(async () => false),
    itemAimTarget: vi.fn(() => null),
    interactionRoot: vi.fn(() => null),
    resultRoot: vi.fn(() => null),
    react: vi.fn(async () => undefined),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
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
          createEventPresentation: () => createFocusedAdapter(
            'midnight-tour',
            {
              worldParent: scene,
              focusedDependencies: {
                propModels,
                waves: [],
                cameraRig,
                camera,
                supplyDisplay: {} as never,
                chestDisplay: {} as never,
                emitCue: () => undefined,
              },
              focusedFactories: {},
            } as never,
          ),
          attach: (presentation) => {
            for (const root of presentation.roots) root.parent.add(root.root);
          },
          detach: (presentation) => {
            for (const root of presentation.roots) root.root.removeFromParent();
          },
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
        createEventPresentation: vi.fn(),
        attach: vi.fn(),
        detach: vi.fn(),
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

  it('attaches through the host and disposes the adapter once', () => {
    const presentation = adapter('leak');
    const host = {
      createEventPresentation: vi.fn(() => presentation),
      attach: vi.fn(),
      detach: vi.fn(),
    };
    const eventBundle = new EventBundle(
      'leak',
      host,
      presentation,
      { dispose: vi.fn() } as unknown as SurvivalEventModelLibrary,
      { dispose: vi.fn() } as unknown as EventModelLibrary,
      { sounds: [], dispose: vi.fn() },
    );

    eventBundle.attach();
    eventBundle.dispose();
    eventBundle.dispose();

    expect(host.attach).toHaveBeenCalledWith(presentation);
    expect(host.detach).toHaveBeenCalledWith(presentation);
    expect(presentation.dispose).toHaveBeenCalledOnce();
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
