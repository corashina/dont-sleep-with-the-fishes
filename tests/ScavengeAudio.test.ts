import { describe, expect, it, vi } from 'vitest';
import type { AudioScope } from '../src/audio/AudioScope';
import { ScavengeAudio } from '../src/audio/ScavengeAudio';

function createScope(): AudioScope {
  return {
    play: vi.fn(() => null),
    startLoop: vi.fn(() => null),
    stopLoop: vi.fn(),
    setLoopGain: vi.fn(),
    setPaused: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('ScavengeAudio', () => {
  it('starts only ship room tone', () => {
    const scope = createScope();
    const audio = new ScavengeAudio(scope);

    audio.start();

    expect(scope.startLoop).toHaveBeenCalledOnce();
    expect(scope.startLoop).toHaveBeenCalledWith('roomTone');
  });

  it('uses one handling sound for pickup, drop, and storage', () => {
    const scope = createScope();
    const audio = new ScavengeAudio(scope);

    audio.itemHandled();
    audio.itemHandled();
    audio.itemHandled();

    expect(scope.play).toHaveBeenCalledTimes(3);
    expect(scope.play).toHaveBeenCalledWith('itemHandling');
  });

  it('plays jump and distance-based deck steps', () => {
    const scope = createScope();
    const audio = new ScavengeAudio(scope);

    audio.update({ movedDistance: 0.7, grounded: true, jumped: true }, true);
    audio.update({ movedDistance: 0.7, grounded: true, jumped: false }, true);

    expect(scope.play).toHaveBeenCalledWith('jump');
    expect(scope.play).toHaveBeenCalledWith('woodStep');
  });

  it('plays the sinking ending once', () => {
    const scope = createScope();
    const audio = new ScavengeAudio(scope);

    audio.sink();
    audio.sink();

    expect(scope.play).toHaveBeenCalledOnce();
    expect(scope.play).toHaveBeenCalledWith('sinkingEnding');
  });

  it('forwards pause state and owns scope disposal', () => {
    const scope = createScope();
    const audio = new ScavengeAudio(scope);

    audio.setPaused(true);
    audio.dispose();
    audio.itemHandled();

    expect(scope.setPaused).toHaveBeenCalledWith(true);
    expect(scope.dispose).toHaveBeenCalledOnce();
    expect(scope.play).not.toHaveBeenCalled();
  });
});
