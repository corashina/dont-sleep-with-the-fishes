import { describe, expect, it, vi } from 'vitest';
import type { AudioScope } from '../src/audio/AudioScope';
import { AUDIO_MANIFEST } from '../src/audio/audioManifest';
import { ScavengeAudio } from '../src/audio/ScavengeAudio';

function audioScopeStub(): AudioScope {
  return {
    play: vi.fn(() => null),
    startLoop: vi.fn(() => null),
    startSpatialLoop: vi.fn(() => null),
    stopLoop: vi.fn(),
    setLoopGain: vi.fn(),
    setListenerPose: vi.fn(),
    setPaused: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('Scavenge intro audio', () => {
  it('configures the ship klaxon as one effects loop', () => {
    expect(AUDIO_MANIFEST.shipAlarm).toMatchObject({
      bus: 'effects',
      gain: 0.46,
      loop: true,
      maxVoices: 1,
    });
  });

  it('maps the crash cue to the approved CC0 ship-break recording', () => {
    expect(AUDIO_MANIFEST.shipCrash.url).toBe(AUDIO_MANIFEST.sinkingEnding.url);
    expect(AUDIO_MANIFEST.shipCrash).toMatchObject({
      bus: 'effects', gain: 0.68, loop: false, maxVoices: 1,
    });
  });

  it('plays the crash once per scavenging audio owner', () => {
    const scope = audioScopeStub();
    const audio = new ScavengeAudio(scope, []);
    audio.crash();
    audio.crash();
    expect(scope.play).toHaveBeenCalledTimes(1);
    expect(scope.play).toHaveBeenCalledWith('shipCrash');
  });
});
