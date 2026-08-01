const STORAGE_KEY = 'dont-sleep-with-the-fishes.audio';

export const DEFAULT_AUDIO_CONTROL_STATE = Object.freeze({
  volume: 0.7,
  muted: false,
});

export interface AudioControlState {
  readonly volume: number;
  readonly muted: boolean;
}

export interface AudioPreference {
  get(): Readonly<AudioControlState>;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_AUDIO_CONTROL_STATE.volume;
  return Math.min(1, Math.max(0, volume));
}

function readState(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): AudioControlState {
  if (storage === null) return { ...DEFAULT_AUDIO_CONTROL_STATE };
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_AUDIO_CONTROL_STATE };
    const parsed = JSON.parse(stored) as Partial<AudioControlState>;
    return {
      volume: typeof parsed.volume === 'number'
        ? clampVolume(parsed.volume)
        : DEFAULT_AUDIO_CONTROL_STATE.volume,
      muted: typeof parsed.muted === 'boolean'
        ? parsed.muted
        : DEFAULT_AUDIO_CONTROL_STATE.muted,
    };
  } catch {
    return { ...DEFAULT_AUDIO_CONTROL_STATE };
  }
}

export function createAudioPreference(
  onChange: (state: Readonly<AudioControlState>) => void,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = browserStorage(),
): AudioPreference {
  let state = readState(storage);

  const publish = (next: AudioControlState): void => {
    if (next.volume === state.volume && next.muted === state.muted) return;
    state = next;
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The current session can still use the preference.
    }
    onChange(Object.freeze({ ...state }));
  };

  return {
    get: () => Object.freeze({ ...state }),
    setVolume: (volume) => publish({
      volume: clampVolume(volume),
      muted: state.muted,
    }),
    setMuted: (muted) => publish({
      volume: state.volume,
      muted,
    }),
  };
}
import { browserStorage } from '../browser/storage';
