import { describe, expect, it, vi } from 'vitest';
import type { AudioScope } from '../src/audio/AudioScope';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';

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

describe('DiveAudio', () => {
  it('starts entry and underwater sounds only when beginDive is called', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.action('dive');

    expect(scope.play).not.toHaveBeenCalledWith('diveEntry');
    audio.beginDive();
    expect(scope.play).toHaveBeenCalledWith('diveEntry');
    expect(scope.startLoop).toHaveBeenCalledWith('underwaterMovement');
  });

  it('stops underwater sound and plays surface once', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.beginDive();
    audio.finishDive();
    audio.finishDive();

    expect(scope.stopLoop).toHaveBeenCalledOnce();
    expect(scope.stopLoop).toHaveBeenCalledWith('underwaterMovement', 0.2);
    expect(scope.play).toHaveBeenCalledWith('diveSurface');
  });

  it('cancels underwater sound without playing the surface cue', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.beginDive();
    audio.cancelDive();
    audio.cancelDive();

    expect(scope.stopLoop).toHaveBeenCalledOnce();
    expect(scope.stopLoop).toHaveBeenCalledWith('underwaterMovement', 0.2);
    expect(scope.play).not.toHaveBeenCalledWith('diveSurface');
  });
});
