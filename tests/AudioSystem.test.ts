import { describe, expect, it, vi } from 'vitest';
import type {
  AudioBackend,
  AudioVoice,
} from '../src/audio/AudioBackend';
import { AudioSystem } from '../src/audio/AudioSystem';
import type { AudioBusId, SoundId } from '../src/audio/audioManifest';

class FakeVoice implements AudioVoice {
  private readonly callbacks: (() => void)[] = [];
  readonly setGain = vi.fn();
  readonly stop = vi.fn(() => {
    for (const callback of this.callbacks.splice(0)) callback();
  });

  constructor(readonly id: SoundId) {}

  onEnded(callback: () => void): void {
    this.callbacks.push(callback);
  }
}

class FakeAudioBackend implements AudioBackend {
  readonly voices: FakeVoice[] = [];
  readonly busGains: [AudioBusId, number, number | undefined][] = [];
  readonly masterGains: number[] = [];
  readonly dispose = vi.fn();

  load(): Promise<void> { return Promise.resolve(); }
  unlock(): Promise<void> { return Promise.resolve(); }

  play(id: SoundId): AudioVoice {
    const voice = new FakeVoice(id);
    this.voices.push(voice);
    return voice;
  }

  setBusGain(bus: AudioBusId, gain: number, rampSeconds?: number): void {
    this.busGains.push([bus, gain, rampSeconds]);
  }

  setMasterGain(gain: number): void {
    this.masterGains.push(gain);
  }
}

describe('AudioSystem', () => {
  it('stops only voices owned by the disposed scope', () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    const first = system.createScope();
    const second = system.createScope();
    const confirm = first.play('confirm') as FakeVoice;
    const denied = second.play('denied') as FakeVoice;

    first.dispose();

    expect(confirm.stop).toHaveBeenCalledOnce();
    expect(denied.stop).not.toHaveBeenCalled();
  });

  it('owns one instance of each loop per scope', () => {
    const backend = new FakeAudioBackend();
    const scope = AudioSystem.forTest(backend).createScope();
    expect(scope.startLoop('music')).toBe(scope.startLoop('music'));
    expect(backend.voices.map(({ id }) => id)).toEqual(['music']);
    expect(() => scope.startLoop('confirm')).toThrow(
      'Sound is not configured as a loop: confirm',
    );
  });

  it('applies master volume and mute without losing volume', () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    system.setVolume(0.35);
    system.setMuted(true);
    system.setMuted(false);
    expect(backend.masterGains).toEqual([0.7, 0.35, 0, 0.35]);
    expect(system.getPreference()).toEqual({ volume: 0.35, muted: false });
  });

  it('ducks ambience and music while paused', () => {
    const backend = new FakeAudioBackend();
    const scope = AudioSystem.forTest(backend).createScope();
    scope.setPaused(true);
    scope.setPaused(false);
    expect(backend.busGains).toEqual([
      ['music', 0.35, 0.15],
      ['ambience', 0.35, 0.15],
      ['music', 1, 0.15],
      ['ambience', 1, 0.15],
    ]);
    expect(backend.voices.map(({ id }) => id)).toEqual(['pause', 'resume']);
  });

  it('disposes scopes before the backend and remains idempotent', () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    const voice = system.createScope().play('confirm') as FakeVoice;
    system.dispose();
    system.dispose();
    expect(voice.stop).toHaveBeenCalledOnce();
    expect(backend.dispose).toHaveBeenCalledOnce();
  });
});
