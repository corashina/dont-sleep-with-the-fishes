import { describe, expect, it, vi } from 'vitest';
import type {
  AudioBackend,
  AudioVoice,
} from '../src/audio/AudioBackend';
import { AudioSystem } from '../src/audio/AudioSystem';
import type { SoundId } from '../src/audio/audioManifest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';

class FakeVoice implements AudioVoice {
  readonly setGain = vi.fn();
  readonly stop = vi.fn();

  constructor(readonly id: SoundId) {}

  onEnded(): void {}
}

class FakeBackend implements AudioBackend {
  readonly played: SoundId[] = [];

  load(): Promise<void> { return Promise.resolve(); }
  unlock(): Promise<void> { return Promise.resolve(); }
  play(id: SoundId): AudioVoice {
    this.played.push(id);
    return new FakeVoice(id);
  }
  setBusGain(): void {}
  setMasterGain(): void {}
  dispose(): void {}
}

function snapshot(
  overrides: Partial<SurvivalSnapshot> = {},
): SurvivalSnapshot {
  return {
    state: 'day',
    day: 1,
    pressure: 0,
    health: 100,
    hunger: 20,
    energy: 3,
    hull: 100,
    food: 1,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    chest: { state: 'none', acquiredDay: null },
    eventFlags: [],
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: {},
    savedItems: [],
    pendingEventId: null,
    pendingEventTargetId: null,
    pendingDriftingLootVariant: null,
    lastOutcome: null,
    seed: 1,
    ...overrides,
  };
}

describe('SurvivalPhase audio integration', () => {
  it('plays an accepted survival action through the phase adapter', async () => {
    const backend = new FakeBackend();
    const current = snapshot();
    const phase = SurvivalPhase.forTest({
      audio: AudioSystem.forTest(backend),
      session: {
        snapshot: () => current,
        perform: () => ({
          accepted: true,
          code: 'ate',
          message: 'Ate food.',
          deltas: { food: -1 },
          cue: 'none',
        }),
        requestDayEvent: () => ({
          accepted: false,
          code: 'none',
          message: 'No event.',
          deltas: {},
          cue: 'none',
        }),
      },
      world: { play: async () => undefined },
      ui: {},
    });

    phase.handleAction('eat');
    await Promise.resolve();

    expect(backend.played).toContain('eating');
    phase.dispose();
  });

  it('connects authored lightning strikes to thunder', () => {
    const backend = new FakeBackend();
    let strike: () => void = () => undefined;
    const phase = SurvivalPhase.forTest({
      audio: AudioSystem.forTest(backend),
      session: { snapshot: () => snapshot() },
      world: {
        setLightningStrikeListener: (listener) => { strike = listener; },
      },
      ui: {},
    });

    strike();

    expect(backend.played).toContain('thunderLightning');
    phase.dispose();
  });

  it('plays the terminal cue once', () => {
    const backend = new FakeBackend();
    const phase = SurvivalPhase.forTest({
      audio: AudioSystem.forTest(backend),
      session: { snapshot: () => snapshot({ state: 'rescued' }) },
      world: {},
      ui: {},
    });

    phase.start();
    phase.update(0, 0);

    expect(backend.played.filter((id) => id === 'rescueEnding')).toHaveLength(1);
    phase.dispose();
  });
});
