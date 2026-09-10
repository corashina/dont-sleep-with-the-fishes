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
      'monster idle clip',
      { missingClip: 'CharacterArmature|Idle' },
      'Missing required Midnight Tour monster clip: CharacterArmature|Idle.',
    ],
    [
      'monster attack clip',
      { missingClip: 'CharacterArmature|Idle_Attack' },
      'Missing required Midnight Tour monster clip: CharacterArmature|Idle_Attack.',
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
          'CharacterArmature|Idle',
          'CharacterArmature|Idle_Attack',
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
        dedicatedModels: {
          dispose: vi.fn(),
        } as unknown as EventModelLibrary,
        featuredModels: {
          clone: () => { throw new Error('Unexpected featured model clone.'); },
          dispose: vi.fn(),
        } as unknown as SurvivalEventModelLibrary,
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

  it('releases event audio but retains prepared models when presentation construction fails', async () => {
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
        createEventPresentation: vi.fn(() => { throw new Error('model failed'); }),
        attach: vi.fn(),
        detach: vi.fn(),
      },
      dedicatedModels: {} as EventModelLibrary,
      featuredModels: {
        dispose: featuredDispose,
      } as unknown as SurvivalEventModelLibrary,
    });

    await expect(loader.load('leak')).rejects.toMatchObject({
      name: 'EventBundleLoadError',
      eventId: 'leak',
    });
    expect(audioDispose).toHaveBeenCalledOnce();
    expect(featuredDispose).not.toHaveBeenCalled();
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

  it('disposes every bundle resource when attachment fails', async () => {
    const attachmentError = new Error('attachment failed');
    const cleanupError = new Error('detach cleanup failed');
    const presentation = adapter('leak');
    const audioDispose = vi.fn();
    const host = {
      createEventPresentation: vi.fn(() => presentation),
      attach: vi.fn(() => { throw attachmentError; }),
      detach: vi.fn(() => { throw cleanupError; }),
    };
    const eventBundle = new EventBundle(
      'leak',
      host,
      presentation,
      { sounds: [], dispose: audioDispose },
    );
    const manager = new EventBundleManager({ load: async () => eventBundle });

    manager.beginLoad('leak');
    await expect(manager.activate('leak')).rejects.toBe(attachmentError);

    expect(host.detach).toHaveBeenCalledWith(presentation);
    expect(presentation.dispose).toHaveBeenCalledOnce();
    expect(audioDispose).toHaveBeenCalledOnce();
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

  it('cancels pending activation before a late bundle can attach', async () => {
    const log: string[] = [];
    const pending = deferred<EventBundle>();
    const manager = new EventBundleManager({ load: () => pending.promise });
    manager.beginLoad('leak');
    const activation = manager.activate('leak');

    manager.cancelPendingActivation();
    pending.resolve(bundle('leak', log));

    await expect(activation).rejects.toThrow(
      'Event bundle activation was cancelled: leak',
    );
    expect(log).toEqual(['dispose:leak']);
    manager.releaseActive();
    expect(log).toEqual(['dispose:leak']);
  });

  it('shares concurrent activation and keeps the active bundle owned', async () => {
    const log: string[] = [];
    const pending = deferred<EventBundle>();
    const manager = new EventBundleManager({ load: () => pending.promise });
    manager.beginLoad('leak');

    const first = manager.activate('leak');
    const second = manager.activate('leak');
    expect(first).toBe(second);

    const loaded = bundle('leak', log);
    pending.resolve(loaded);
    await expect(first).resolves.toBe(loaded);
    await expect(second).resolves.toBe(loaded);

    expect(loaded.attach).toHaveBeenCalledOnce();
    expect(loaded.dispose).not.toHaveBeenCalled();
    manager.cancelPendingActivation();
    expect(loaded.dispose).not.toHaveBeenCalled();
    manager.releaseActive();
    expect(loaded.dispose).toHaveBeenCalledOnce();
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
