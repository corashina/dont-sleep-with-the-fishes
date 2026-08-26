import type {
  AudioBackend,
  AudioListenerPose,
  SpatialAudioEmitter,
  SpatialAudioOptions,
} from './AudioBackend';
import {
  createAudioPreference,
  type AudioControlState,
  type AudioPreference,
} from './audioPreference';
import {
  OwnedAudioScope,
  type AudioScope,
} from './AudioScope';
import { WebAudioBackend } from './WebAudioBackend';
import {
  SHARED_SOUND_IDS,
  type SoundId,
} from './audioManifest';

class SilentAudioBackend implements AudioBackend {
  acquire(): Promise<void> { return Promise.resolve(); }
  release(): void {}
  unlock(): Promise<void> { return Promise.resolve(); }
  play(): null { return null; }
  playSpatialLoop(
    _id: Parameters<AudioBackend['playSpatialLoop']>[0],
    _emitters: readonly SpatialAudioEmitter[],
    _options: Readonly<SpatialAudioOptions>,
  ): null { return null; }
  setListenerPose(_pose: Readonly<AudioListenerPose>): void {}
  setBusGain(): void {}
  setMasterGain(): void {}
  dispose(): void {}
}

export class AudioLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AudioLoadError';
  }
}

export interface EventAudioLease {
  readonly sounds: readonly SoundId[];
  dispose(): void;
}

export class AudioSystem {
  private readonly preference: AudioPreference;
  private readonly scopes = new Set<OwnedAudioScope>();
  private readonly eventLeases = new Set<EventAudioLease>();
  private unlockListening = false;
  private disposed = false;

  private constructor(
    private readonly backend: AudioBackend,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
    listenForUnlock: boolean,
    private readonly ownsSharedAudio: boolean,
  ) {
    const onPreferenceChange = (state: Readonly<AudioControlState>): void => {
      this.applyPreference(state);
    };
    this.preference = storage === undefined
      ? createAudioPreference(onPreferenceChange)
      : createAudioPreference(onPreferenceChange, storage);
    this.applyPreference(this.preference.get(), 0);
    if (listenForUnlock) this.installUnlockListeners();
  }

  static async load(): Promise<AudioSystem> {
    const Context = globalThis.AudioContext;
    if (Context === undefined) return AudioSystem.silent();
    let backend: WebAudioBackend;
    try {
      backend = new WebAudioBackend(new Context());
    } catch {
      return AudioSystem.silent();
    }
    try {
      return await AudioSystem.loadWithBackend(backend, undefined, true);
    } catch (cause) {
      backend.dispose();
      throw new AudioLoadError('Required audio files could not be loaded.', { cause });
    }
  }

  static async loadWithBackend(
    backend: AudioBackend,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined = null,
    listenForUnlock = false,
  ): Promise<AudioSystem> {
    try {
      await backend.acquire(SHARED_SOUND_IDS);
      return new AudioSystem(backend, storage, listenForUnlock, true);
    } catch (cause) {
      backend.dispose();
      throw new AudioLoadError('Required audio files could not be loaded.', { cause });
    }
  }

  static forTest(
    backend: AudioBackend,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
  ): AudioSystem {
    return new AudioSystem(backend, storage, false, false);
  }

  static silent(
    storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined = undefined,
  ): AudioSystem {
    return new AudioSystem(new SilentAudioBackend(), storage, false, false);
  }

  createScope(): AudioScope {
    if (this.disposed) return new OwnedAudioScope(new SilentAudioBackend(), () => undefined);
    const scope = new OwnedAudioScope(
      this.backend,
      (owned) => this.scopes.delete(owned),
    );
    this.scopes.add(scope);
    return scope;
  }

  async acquireEventAudio(sounds: readonly SoundId[]): Promise<EventAudioLease> {
    if (this.disposed) throw new Error('Audio system is disposed.');
    const ownedSounds = Object.freeze([...new Set(sounds)]);
    await this.backend.acquire(ownedSounds);
    if (this.disposed) {
      this.backend.release(ownedSounds);
      throw new Error('Audio system was disposed while loading event audio.');
    }
    let disposed = false;
    const lease: EventAudioLease = {
      sounds: ownedSounds,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.eventLeases.delete(lease);
        const soundSet = new Set<SoundId>(ownedSounds);
        for (const scope of this.scopes) scope.stopSounds(soundSet);
        this.backend.release(ownedSounds);
      },
    };
    this.eventLeases.add(lease);
    return lease;
  }

  getPreference(): Readonly<AudioControlState> {
    return this.preference.get();
  }

  setVolume(volume: number): void {
    if (!this.disposed) this.preference.setVolume(volume);
  }

  setMuted(muted: boolean): void {
    if (!this.disposed) this.preference.setMuted(muted);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeUnlockListeners();
    for (const lease of [...this.eventLeases]) lease.dispose();
    this.eventLeases.clear();
    for (const scope of [...this.scopes]) scope.dispose();
    this.scopes.clear();
    if (this.ownsSharedAudio) this.backend.release(SHARED_SOUND_IDS);
    this.backend.dispose();
  }

  private applyPreference(
    state: Readonly<AudioControlState>,
    rampSeconds = 0.05,
  ): void {
    this.backend.setMasterGain(state.muted ? 0 : state.volume, rampSeconds);
  }

  private installUnlockListeners(): void {
    if (typeof document === 'undefined' || this.unlockListening) return;
    this.unlockListening = true;
    document.addEventListener('pointerdown', this.handleUnlock, { capture: true });
    document.addEventListener('keydown', this.handleUnlock, { capture: true });
  }

  private removeUnlockListeners(): void {
    if (typeof document === 'undefined' || !this.unlockListening) return;
    this.unlockListening = false;
    document.removeEventListener('pointerdown', this.handleUnlock, { capture: true });
    document.removeEventListener('keydown', this.handleUnlock, { capture: true });
  }

  private readonly handleUnlock = (): void => {
    if (this.disposed) return;
    void this.backend.unlock().then(
      () => this.removeUnlockListeners(),
      () => undefined,
    );
  };
}
