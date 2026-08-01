import { describe, expect, it, vi } from 'vitest';
import type { AudioScope } from '../src/audio/AudioScope';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import type { FishingTerminalResult } from '../src/survival/FishingSession';
import type { ActionOutcome } from '../src/survival/survivalTypes';

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

  it('starts the dive audio at impact and finishes it once', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.action('dive');
    expect(scope.play).not.toHaveBeenCalledWith('diveEntry');

    audio.beginDive();
    audio.finishDive();
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

  it('uses the dive cue for Scuba Gear event actions', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.tool('scubaSet');

    expect(scope.play).toHaveBeenCalledWith('diveEntry');
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

  it('starts the melody only for Eerie Melody', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);

    audio.beginEvent('ghosts');
    audio.beginEvent('face-on-the-moon');
    expect(scope.startLoop).not.toHaveBeenCalledWith('eerieMelody');

    audio.beginEvent('eerie-melody');
    expect(scope.startLoop).toHaveBeenCalledWith('eerieMelody');
  });

  it('stops a safe Eerie Melody result before its motion', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);
    const safeOutcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: 'The melody fades.',
      deltas: { energy: -1 },
      cue: 'none',
    };

    audio.beginEvent('eerie-melody');
    audio.beginEventReaction('eerie-melody', safeOutcome);

    expect(scope.stopLoop).toHaveBeenCalledWith('eerieMelody', 0.02);
  });

  it('keeps an attack melody active until its result motion finishes', () => {
    const scope = createScope();
    const audio = new SurvivalAudio(scope);
    const attackOutcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: 'The siren attacks.',
      deltas: { hull: -50, health: -20 },
      cue: 'impact',
    };

    audio.beginEvent('eerie-melody');
    audio.beginEventReaction('eerie-melody', attackOutcome);

    expect(scope.stopLoop).not.toHaveBeenCalledWith('eerieMelody', 0.02);

    audio.finishEventReaction('eerie-melody');
    expect(scope.stopLoop).toHaveBeenCalledWith('eerieMelody', 0.08);
  });

  it.each(['clear', 'dispose'] as const)(
    'stops the active melody once during %s cleanup',
    (cleanup) => {
      const scope = createScope();
      const audio = new SurvivalAudio(scope);

      audio.beginEvent('eerie-melody');
      if (cleanup === 'clear') {
        audio.clearEvent();
        audio.clearEvent();
        audio.dispose();
      } else {
        audio.dispose();
        audio.dispose();
      }

      expect(scope.stopLoop).toHaveBeenCalledTimes(1);
      expect(scope.stopLoop).toHaveBeenCalledWith('eerieMelody', 0.08);
      expect(scope.dispose).toHaveBeenCalledOnce();
    },
  );
});
