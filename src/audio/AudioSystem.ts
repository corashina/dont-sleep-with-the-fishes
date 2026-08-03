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

class SilentAudioBackend implements AudioBackend {
  load(): Promise<void> { return Promise.resolve(); }
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

export class AudioSystem {
  private readonly preference: AudioPreference;
  private readonly scopes = new Set<OwnedAudioScope>();
  private unlockListening = false;
  private disposed = false;

  private constructor(
    private readonly backend: AudioBackend,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
    listenForUnlock: boolean,
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
      await backend.load();
      return new AudioSystem(backend, undefined, true);
    } catch (cause) {
      backend.dispose();
      throw new AudioLoadError('Required audio files could not be loaded.', { cause });
    }
  }

  static forTest(
    backend: AudioBackend,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null = null,
  ): AudioSystem {
    return new AudioSystem(backend, storage, false);
  }

  static silent(): AudioSystem {
    return new AudioSystem(new SilentAudioBackend(), null, false);
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
    for (const scope of [...this.scopes]) scope.dispose();
    this.scopes.clear();
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
