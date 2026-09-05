// Importance: 8/10 (scaled from 4/5). Protects audio scope ownership, routing, pause behavior, and cleanup.
import { describe, expect, it, vi } from 'vitest';
import type {
  AudioBackend,
  AudioListenerPose,
  AudioVoice,
  SpatialAudioEmitter,
  SpatialAudioOptions,
} from '../src/audio/AudioBackend';
import { AudioSystem } from '../src/audio/AudioSystem';
import { WebAudioBackend } from '../src/audio/WebAudioBackend';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import {
  MENU_SOUND_IDS,
  SHIP_SOUND_IDS,
  SURVIVAL_SOUND_IDS,
  type AudioBusId,
  type SoundId,
} from '../src/audio/audioManifest';

class FakeVoice implements AudioVoice {
  private readonly callbacks: (() => void)[] = [];
  readonly setGain = vi.fn();
  readonly setPaused = vi.fn();
  readonly stop = vi.fn(() => {
    this.finish();
  });

  constructor(readonly id: SoundId) {}

  onEnded(callback: () => void): void {
    this.callbacks.push(callback);
  }

  finish(): void {
    for (const callback of this.callbacks.splice(0)) callback();
  }
}

class FakeAudioBackend implements AudioBackend {
  readonly voices: FakeVoice[] = [];
  readonly busGains: [AudioBusId, number, number | undefined][] = [];
  readonly masterGains: number[] = [];
  readonly dispose = vi.fn();
  readonly spatial: Array<{
    id: SoundId;
    emitters: readonly SpatialAudioEmitter[];
    options: Readonly<SpatialAudioOptions>;
  }> = [];
  readonly listenerPoses: AudioListenerPose[] = [];

  readonly acquire = vi.fn((_ids: readonly SoundId[]) => Promise.resolve());
  readonly release = vi.fn((_ids: readonly SoundId[]) => undefined);

  unlock(): Promise<void> { return Promise.resolve(); }

  play(id: SoundId): AudioVoice {
    const voice = new FakeVoice(id);
    this.voices.push(voice);
    return voice;
  }

  playSpatialLoop(
    id: SoundId,
    emitters: readonly SpatialAudioEmitter[],
    options: Readonly<SpatialAudioOptions>,
  ): AudioVoice {
    this.spatial.push({ id, emitters, options });
    return this.play(id);
  }

  setListenerPose(pose: Readonly<AudioListenerPose>): void {
    this.listenerPoses.push(pose);
  }

  setBusGain(bus: AudioBusId, gain: number, rampSeconds?: number): void {
    this.busGains.push([bus, gain, rampSeconds]);
  }

  setMasterGain(gain: number): void {
    this.masterGains.push(gain);
  }
}

describe('AudioSystem', () => {
  it.each([
    ['fishingNet', 'netImpact'],
    ['knife', 'knifeImpact'],
  ] as const)('plays the %s impact at the action cue, separate from item handling', (itemId, soundId) => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.eventItem(itemId);
    expect(backend.voices.map(({ id }) => id)).toEqual(['itemHandling']);
    audio.eventItemCue(itemId, 0);
    expect(backend.voices.map(({ id }) => id)).toEqual(['itemHandling', soundId]);
    audio.dispose();
    audio.eventItemCue(itemId, 0);
    expect(backend.voices).toHaveLength(2);
  });
  it('plays every pet meow once before reshuffling without an adjacent repeat', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(
      AudioSystem.forTest(backend).createScope(),
      () => 0,
    );

    for (let index = 0; index < 14; index += 1) audio.petCarlitos();

    const ids = backend.voices.map(({ id }) => id);
    expect(new Set(ids.slice(0, 7))).toHaveLength(7);
    expect(new Set(ids.slice(7, 14))).toHaveLength(7);
    for (let index = 1; index < ids.length; index += 1) {
      expect(ids[index]).not.toBe(ids[index - 1]);
    }
    expect(ids.every((id) => id.startsWith('catMeow'))).toBe(true);
  });

  it('owns Midnight Tour sounds and stops each active voice', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.midnightTourCue('dig-start');
    audio.midnightTourCue('dig-start');
    audio.update(6);
    audio.midnightTourCue('attack');
    audio.clearMidnightTour();

    expect(backend.voices.filter(({ id }) => id === 'midnightShovel')).toHaveLength(1);
    expect(backend.voices.filter(({ id }) => id === 'midnightMonsterAttack')).toHaveLength(1);
    expect(backend.voices.find(({ id }) => id === 'midnightShovel')?.stop)
      .toHaveBeenCalledExactlyOnceWith(0.05);
  });

  it('uses the Midnight Tour monster sound for Chest Attack', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.chestAttackCue('attack');

    expect(backend.voices.map(({ id }) => id)).toEqual(['midnightMonsterAttack']);
  });

  it('starts audio without acquiring phase sounds', async () => {
    const backend = new FakeAudioBackend();
    const system = await AudioSystem.loadWithBackend(backend);

    expect(backend.acquire).not.toHaveBeenCalled();

    system.dispose();
  });

  it('leases phase sounds and leaves incoming shared voices playing', async () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    const menu = await system.acquirePhaseAudio(MENU_SOUND_IDS);
    const ship = await system.acquirePhaseAudio(SHIP_SOUND_IDS);
    const survival = await system.acquirePhaseAudio(SURVIVAL_SOUND_IDS);
    const incoming = system.createScope();
    const voice = incoming.play('confirm') as FakeVoice;
    menu.dispose(); menu.dispose();
    expect(backend.acquire.mock.calls.map(call => call[0])).toEqual([MENU_SOUND_IDS, SHIP_SOUND_IDS, SURVIVAL_SOUND_IDS]);
    expect(backend.release).toHaveBeenCalledExactlyOnceWith(MENU_SOUND_IDS);
    expect(voice.stop).not.toHaveBeenCalled();
    incoming.dispose(); ship.dispose(); survival.dispose(); system.dispose();
  });

  it('retains actual shared backend buffers until the last phase releases them', async () => {
    const context = {
      createGain: () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: {
        value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
      } }),
      destination: {}, currentTime: 0, state: 'running', close: async () => undefined,
      decodeAudioData: async () => ({ duration: 1 }),
    };
    const fetchAudio = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }));
    const backend = new WebAudioBackend(context as unknown as AudioContext, fetchAudio as unknown as typeof fetch);
    const system = AudioSystem.forTest(backend);
    const menu = await system.acquirePhaseAudio(MENU_SOUND_IDS);
    const ship = await system.acquirePhaseAudio(SHIP_SOUND_IDS);
    const buffers = (backend as unknown as { buffers: Map<SoundId, AudioBuffer> }).buffers;
    const sharedBuffer = buffers.get('confirm');
    menu.dispose();
    expect(buffers.has('menuAmbient')).toBe(false);
    expect(buffers.get('confirm')).toBe(sharedBuffer);
    expect(buffers.has('roomTone')).toBe(true);
    ship.dispose();
    expect(buffers.size).toBe(0);
    system.dispose();
  });

  it('releases event buffers after owned voices stop', async () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    const scope = system.createScope();
    const lease = await system.acquireEventAudio(['tentacleMovement']);
    const voice = scope.startLoop('tentacleMovement') as FakeVoice;

    lease.dispose();

    expect(voice.stop).toHaveBeenCalledOnce();
    expect(backend.release).toHaveBeenCalledWith(['tentacleMovement']);
  });

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
    expect(scope.startLoop('calmOcean')).toBe(scope.startLoop('calmOcean'));
    expect(backend.voices.map(({ id }) => id)).toEqual(['calmOcean']);
    expect(() => scope.startLoop('confirm')).toThrow(
      'Sound is not configured as a loop: confirm',
    );
  });

  it('owns one synchronized spatial loop and forwards its listener pose', () => {
    const backend = new FakeAudioBackend();
    const scope = AudioSystem.forTest(backend).createScope();
    const emitters = [{ position: [0, 5, 0] as const }];
    const options = { gain: 0.5, refDistance: 1.5, maxDistance: 11, rolloffFactor: 1 };
    const pose: AudioListenerPose = {
      position: { x: 0, y: 3.7, z: 0 },
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
    };
    expect(scope.startSpatialLoop('shipAlarm', emitters, options))
      .toBe(scope.startSpatialLoop('shipAlarm', emitters, options));
    scope.setListenerPose(pose);
    expect(backend.spatial).toEqual([{ id: 'shipAlarm', emitters, options }]);
    expect(backend.listenerPoses).toEqual([pose]);
  });

  it('finishes Wreckage dive audio after its focused animation', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginDive();
    const movement = backend.voices.find(({ id }) => id === 'underwaterMovement')!;
    audio.finishDive();

    expect(movement.stop).toHaveBeenCalledExactlyOnceWith(0.2);
    expect(backend.voices.at(-1)?.id).toBe('diveSurface');
  });

  it('cancels Wreckage dive audio when the event clears', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginDive();
    const movement = backend.voices.find(({ id }) => id === 'underwaterMovement')!;
    audio.clearEvent();
    audio.clearEvent();

    expect(movement.stop).toHaveBeenCalledExactlyOnceWith(0.2);
    expect(backend.voices.some(({ id }) => id === 'diveSurface')).toBe(false);
  });

  it('starts two distinct overlapping meows for Shadow Figure', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(
      AudioSystem.forTest(backend).createScope(),
      () => 0,
    );

    audio.eventReveal('shadow-figure');

    expect(backend.voices[0]?.id).toBe('eventReveal');
    expect(backend.voices[1]?.id).toMatch(/^catMeow/);
    audio.update(0.1);
    expect(backend.voices).toHaveLength(2);
    audio.update(0.03);
    expect(backend.voices[2]?.id).toMatch(/^catMeow/);
    expect(backend.voices[2]?.id).not.toBe(backend.voices[1]?.id);
    expect(backend.voices[1]?.stop).not.toHaveBeenCalled();
  });

  it('cancels the second Shadow Figure meow when the event clears', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventReveal('shadow-figure');
    audio.clearEvent();
    audio.update(1);

    expect(backend.voices.filter(({ id }) => id.startsWith('catMeow'))).toHaveLength(1);
  });

  it('plays an incoming radio signal until it ends or the player answers', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    const expired = vi.fn();

    expect(audio.beginRadioSignal(expired)).toBe(true);
    const firstSignal = backend.voices.at(-1)!;
    expect(firstSignal.id).toBe('radioSignal');
    firstSignal.finish();
    expect(expired).toHaveBeenCalledOnce();

    expect(audio.beginRadioSignal(expired)).toBe(true);
    const secondSignal = backend.voices.at(-1)!;
    audio.action('answerRadio');

    expect(secondSignal.stop).toHaveBeenCalledExactlyOnceWith(0.03);
    expect(backend.voices.at(-1)?.id).toBe('radioReply');
    expect(expired).toHaveBeenCalledOnce();
  });

  it('uses hull repair audio only for hull repair', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.action('repair');
    expect(backend.voices.at(-1)?.id).toBe('hullRepair');

    audio.action('repairItem', { kind: 'itemRepair', target: 'compass-1' });
    expect(backend.voices.at(-1)?.id).toBe('tapeRepair');
  });

  it('pauses only the incoming radio signal for player panels', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginRadioSignal(() => undefined);
    const signal = backend.voices.at(-1)!;
    signal.setPaused.mockClear();

    audio.setRadioSignalPaused(true);
    audio.setRadioSignalPaused(false);

    expect(signal.setPaused.mock.calls).toEqual([[true], [false]]);
  });

  it('applies master volume and mute without losing volume', () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    system.setVolume(0.35);
    system.setMuted(true);
    system.setMuted(false);
    expect(backend.masterGains).toEqual([0.25, 0.35, 0, 0.35]);
    expect(system.getPreference()).toEqual({ volume: 0.35, muted: false });
  });

  it('restores volume and mute through the silent fallback', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const first = AudioSystem.silent(storage);
    first.setVolume(0.35);
    first.setMuted(true);
    first.dispose();

    const restored = AudioSystem.silent(storage);

    expect(restored.getPreference()).toEqual({ volume: 0.35, muted: true });
  });

  it('silences game audio while paused and keeps interface feedback', () => {
    const backend = new FakeAudioBackend();
    const scope = AudioSystem.forTest(backend).createScope();
    const music = scope.play('scavengeChase') as FakeVoice;
    scope.setPaused(true);
    scope.setPaused(false);
    expect(backend.busGains).toEqual([
      ['music', 0, 0.05],
      ['ambience', 0, 0.05],
      ['effects', 0, 0.05],
      ['music', 1, 0.05],
      ['ambience', 1, 0.05],
      ['effects', 1, 0.05],
    ]);
    expect(music.setPaused.mock.calls).toEqual([[true], [false]]);
    expect(backend.voices.map(({ id }) => id)).toEqual([
      'scavengeChase',
      'pause',
      'resume',
    ]);
  });

  it('starts game voices paused when they are created from a paused scope', () => {
    const backend = new FakeAudioBackend();
    const scope = AudioSystem.forTest(backend).createScope();
    scope.setPaused(true);

    const music = scope.play('scavengeChase') as FakeVoice;
    const feedback = scope.play('confirm') as FakeVoice;

    expect(music.setPaused).toHaveBeenCalledExactlyOnceWith(true);
    expect(feedback.setPaused).not.toHaveBeenCalled();
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
