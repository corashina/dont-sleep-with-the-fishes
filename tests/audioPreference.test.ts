// Importance: 8/10 (scaled from 4/5). Protects persisted audio settings and failure recovery.
import { describe, expect, it, vi } from 'vitest';
import {
  createAudioPreference,
  DEFAULT_AUDIO_CONTROL_STATE,
} from '../src/audio/audioPreference';

describe('audio preference', () => {
  it('defaults to 70 percent and unmuted', () => {
    const preference = createAudioPreference(() => undefined, null);
    expect(preference.get()).toEqual(DEFAULT_AUDIO_CONTROL_STATE);
  });

  it('clamps volume and preserves it while muted', () => {
    const changes: unknown[] = [];
    const preference = createAudioPreference((state) => changes.push(state), null);
    preference.setVolume(2);
    preference.setMuted(true);
    expect(preference.get()).toEqual({ volume: 1, muted: true });
    expect(changes).toEqual([
      { volume: 1, muted: false },
      { volume: 1, muted: true },
    ]);
  });

  it('loads and saves one stable record', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ volume: 0.35, muted: true })),
      setItem: vi.fn(),
    };
    const preference = createAudioPreference(() => undefined, storage);
    expect(preference.get()).toEqual({ volume: 0.35, muted: true });
    preference.setMuted(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      'dont-sleep-with-the-fishes.audio',
      JSON.stringify({ volume: 0.35, muted: false }),
    );
  });

  it('survives invalid data and storage failures', () => {
    const storage = {
      getItem: vi.fn(() => '{bad json'),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    const preference = createAudioPreference(() => undefined, storage);
    expect(preference.get()).toEqual(DEFAULT_AUDIO_CONTROL_STATE);
    expect(() => preference.setVolume(0.4)).not.toThrow();
    expect(preference.get().volume).toBe(0.4);
  });
});
