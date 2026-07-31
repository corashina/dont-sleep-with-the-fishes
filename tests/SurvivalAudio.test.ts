import { describe, expect, it, vi } from 'vitest';
import type { AudioScope } from '../src/audio/AudioScope';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import type { FishingTerminalResult } from '../src/survival/FishingSession';

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

describe('SurvivalAudio', () => {
  it('starts the weather ambience layers without background music', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.start();

    expect(scope.startLoop).toHaveBeenCalledWith('calmOcean');
    expect(scope.startLoop).toHaveBeenCalledWith('boatCreak');
    expect(scope.startLoop).toHaveBeenCalledTimes(6);
    expect(scope.startLoop).not.toHaveBeenCalledWith('underwaterMovement');
  });

  it('crossfades all weather layers', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.setWeather('thunderstorm');

    expect(scope.setLoopGain).toHaveBeenCalledWith('roughOcean', 0.9, 1.5);
    expect(scope.setLoopGain).toHaveBeenCalledWith('strongWind', 0.8, 1.5);
    expect(scope.setLoopGain).toHaveBeenCalledWith('rain', 1, 1.5);
  });

  it('uses the shared eating sound for food and energy bars', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.action('eat');
    audio.action('useEnergyBar');

    expect(scope.play).toHaveBeenCalledTimes(2);
    expect(scope.play).toHaveBeenCalledWith('eating');
  });

  it('uses the short dive sequence', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.action('dive');
    audio.finishDive();

    expect(scope.play).toHaveBeenNthCalledWith(1, 'diveEntry');
    expect(scope.startLoop).toHaveBeenCalledWith('underwaterMovement');
    expect(scope.stopLoop).toHaveBeenCalledWith('underwaterMovement', 0.2);
    expect(scope.play).toHaveBeenNthCalledWith(2, 'diveSurface');
  });

  it('maps fish, junk, and miss results', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);
    const fish = {
      kind: 'catch',
      catch: { kind: 'fish' },
    } as FishingTerminalResult;
    const junk = {
      kind: 'catch',
      catch: { kind: 'junk' },
    } as FishingTerminalResult;

    audio.fishingResult(fish);
    audio.fishingResult(junk);
    audio.fishingResult({ kind: 'miss' });

    expect(scope.play).toHaveBeenNthCalledWith(1, 'fishCatch');
    expect(scope.play).toHaveBeenNthCalledWith(2, 'junkCatch');
    expect(scope.play).toHaveBeenNthCalledWith(3, 'fishingMiss');
  });

  it('maps current event tools to their selected sounds', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.tool('bucket');
    audio.tool('umbrella');
    audio.tool('anchor');
    audio.tool('flashlight');
    audio.tool('flareGun');
    audio.tool('harpoonGun');

    expect(scope.play).toHaveBeenNthCalledWith(1, 'bucketRain');
    expect(scope.play).toHaveBeenNthCalledWith(2, 'umbrella');
    expect(scope.play).toHaveBeenNthCalledWith(3, 'anchorChain');
    expect(scope.play).toHaveBeenNthCalledWith(4, 'flashlight');
    expect(scope.play).toHaveBeenNthCalledWith(5, 'flareGun');
    expect(scope.play).toHaveBeenNthCalledWith(6, 'harpoonGun');
  });

  it('maps dedicated event actions onto current cues', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.eventAction('leak', 'ductTape');
    audio.eventAction('school-of-fish', 'fishingNet');
    audio.eventAction('snatcher', 'harpoonGun');
    audio.eventAction('whirlpool', 'anchor');
    audio.eventAction('death-stare', 'damage');
    audio.eventAction('swarm-of-anglerfish', 'fishingNet');

    expect(scope.play).toHaveBeenNthCalledWith(1, 'tapeRepair');
    expect(scope.play).toHaveBeenNthCalledWith(2, 'fishCatch');
    expect(scope.play).toHaveBeenNthCalledWith(3, 'harpoonGun');
    expect(scope.play).toHaveBeenNthCalledWith(4, 'anchorChain');
    expect(scope.play).toHaveBeenNthCalledWith(5, 'hardWaveImpact');
    expect(scope.play).toHaveBeenNthCalledWith(6, 'itemHandling');
  });

  it('plays the selected terminal sound', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.ending('rescued');
    audio.ending('dead');
    audio.ending('sunk');

    expect(scope.play).toHaveBeenNthCalledWith(1, 'rescueEnding');
    expect(scope.play).toHaveBeenNthCalledWith(2, 'deathEnding');
    expect(scope.play).toHaveBeenNthCalledWith(3, 'sinkingEnding');
  });
});
