// Importance: 4/5. Protects scavenging music timing and ownership.

import { describe, expect, it, vi } from 'vitest';
import type { AudioVoice } from '../src/audio/AudioBackend';
import type { AudioScope } from '../src/audio/AudioScope';
import { ScavengeAudio } from '../src/audio/ScavengeAudio';
import type { SoundId } from '../src/audio/audioManifest';

function createHarness() {
  const calls: string[] = [];
  const voices = new Map<SoundId, AudioVoice>();
  const voice = (id: SoundId): AudioVoice => {
    const created: AudioVoice = {
      id,
      setGain: vi.fn(),
      stop: vi.fn((fadeSeconds) => calls.push(`stop:${id}:${fadeSeconds}`)),
      onEnded: vi.fn(),
    };
    voices.set(id, created);
    return created;
  };
  const scope: AudioScope = {
    play: vi.fn((id: SoundId) => {
      calls.push(`play:${id}`);
      return id === 'sinkingEnding' ? null : voice(id);
    }),
    startLoop: vi.fn((id: SoundId) => {
      calls.push(`loop:${id}`);
      return null;
    }),
    stopLoop: vi.fn(),
    setLoopGain: vi.fn(),
    setPaused: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    audio: new ScavengeAudio(scope),
    calls,
  };
}

describe('ScavengeAudio', () => {
  it('starts room tone before play and starts music once when the run begins', () => {
    const { audio, calls } = createHarness();
    audio.start();
    audio.beginRun();
    audio.beginRun();
    expect(calls).toEqual(['loop:roomTone', 'play:scavengeChase']);
  });

  it('replaces the chase with the countdown at 50 elapsed seconds', () => {
    const { audio, calls } = createHarness();
    audio.beginRun();
    audio.update(null, false, 49.99);
    audio.update(null, false, 50);
    audio.update(null, false, 59);
    expect(calls).toEqual([
      'play:scavengeChase',
      'stop:scavengeChase:0.08',
      'play:scavengeCountdown',
    ]);
  });

  it('cuts the active countdown before the sinking sound', () => {
    const { audio, calls } = createHarness();
    audio.beginRun();
    audio.update(null, false, 50);
    audio.sink();
    expect(calls).toEqual([
      'play:scavengeChase',
      'stop:scavengeChase:0.08',
      'play:scavengeCountdown',
      'stop:scavengeCountdown:0.12',
      'play:sinkingEnding',
    ]);
  });
});
