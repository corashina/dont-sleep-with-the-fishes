// Importance: 8/10 (scaled from 4/5). Protects scavenging music timing and ownership.

import { describe, expect, it, vi } from 'vitest';
import type {
  AudioListenerPose,
  AudioVoice,
  SpatialAudioEmitter,
} from '../src/audio/AudioBackend';
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
      setPaused: vi.fn(),
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
    startSpatialLoop: vi.fn((id, emitters, options) => {
      calls.push(`spatial:${id}:${emitters.length}:${options.gain}`);
      return null;
    }),
    stopLoop: vi.fn((id, fadeSeconds) => calls.push(`stopLoop:${id}:${fadeSeconds}`)),
    setLoopGain: vi.fn(),
    setListenerPose: vi.fn(),
    setPaused: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    audio: new ScavengeAudio(scope, ALARM_EMITTERS),
    calls,
    setListenerPose: scope.setListenerPose,
    stopLoop: scope.stopLoop,
  };
}

const ALARM_EMITTERS: readonly SpatialAudioEmitter[] = Object.freeze([
  { position: [0, 5.4, 9] },
  { position: [0, 5.4, 19] },
  { position: [0, 5.4, -14] },
]);

describe('ScavengeAudio', () => {
  it('fades the title ambience before one synchronized room klaxon', () => {
    const { audio, calls } = createHarness();
    audio.start();
    audio.beginRun();
    audio.beginRun();
    expect(calls).toEqual([
      'loop:roomTone',
      'spatial:shipAlarm:3:0.5',
      'play:scavengeChase',
    ]);
  });

  it('forwards one caller-owned listener pose during updates', () => {
    const { audio, setListenerPose } = createHarness();
    const pose: AudioListenerPose = {
      position: { x: 0, y: 3.7, z: 9 },
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
    };
    audio.update(null, false, 0, pose);
    expect(setListenerPose).toHaveBeenCalledExactlyOnceWith(pose);
  });

  it('replaces the chase with the countdown at 50 elapsed seconds', () => {
    const { audio, calls } = createHarness();
    audio.beginRun();
    audio.update(null, false, 49.99);
    audio.update(null, false, 50);
    audio.update(null, false, 59);
    expect(calls).toEqual([
      'spatial:shipAlarm:3:0.5',
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
      'spatial:shipAlarm:3:0.5',
      'play:scavengeChase',
      'stop:scavengeChase:0.08',
      'play:scavengeCountdown',
      'stopLoop:shipAlarm:0.12',
      'stop:scavengeCountdown:0.12',
      'play:sinkingEnding',
    ]);
  });

  it('stops the klaxon for evacuation and sinking', () => {
    const completeHarness = createHarness();
    completeHarness.audio.beginRun();
    completeHarness.audio.complete();
    expect(completeHarness.stopLoop).toHaveBeenCalledWith('shipAlarm', 0.12);

    const sinkHarness = createHarness();
    sinkHarness.audio.beginRun();
    sinkHarness.audio.sink();
    expect(sinkHarness.stopLoop).toHaveBeenCalledWith('shipAlarm', 0.12);
  });
});
