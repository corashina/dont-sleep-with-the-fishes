// Importance: 8/10 (scaled from 4/5). Protects audio scope ownership, routing, pause behavior, and cleanup.
import { describe,expect,it,vi } from 'vitest';
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
import { ScavengeAudio } from '../src/audio/ScavengeAudio';
import { SURVIVAL_EVENT_IDS } from '../src/survival/eventCatalog';
import { EVENT_BUNDLE_SPECS } from '../src/survival/eventBundleManifest';
import {
  AUDIO_MANIFEST,
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
  // Importance: 98/100. All ending popups must ring and leave gameplay sounds stopped.
  it.each(['rescue', 'kraken', 'death', 'sinking'] as const)('rings at the %s popup and stays quiet afterward', (id) => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.start();
    audio.update(8);
    audio.ending(id);
    expect(backend.voices.some(voice => voice.id === 'eventComplete')).toBe(false);
    const previous = [...backend.voices];
    audio.endingPopup();
    for (const voice of previous) expect(voice.stop).toHaveBeenCalled();
    const bell = backend.voices.find(voice => voice.id === 'eventComplete')!;
    expect(bell).toBeDefined();
    bell.finish();
    const count = backend.voices.length;
    audio.update(60);
    audio.setWeather('thunderstorm');
    audio.thunder();
    audio.start();
    expect(backend.voices).toHaveLength(count);
    audio.dispose();
  });

  // Importance: 98/100. Dorothy must ring once at its popup and stop sinking sounds.
  it('rings once at the Dorothy popup and keeps the ship sounds stopped', () => {
    expect(SHIP_SOUND_IDS).toContain('eventComplete');
    const backend = new FakeAudioBackend();
    const audio = new ScavengeAudio(AudioSystem.forTest(backend).createScope(), []);
    audio.start();
    audio.beginRun();
    audio.sink();
    audio.crash();
    expect(backend.voices.some(voice => voice.id === 'eventComplete')).toBe(false);
    const previous = [...backend.voices];
    audio.endingPopup();
    for (const voice of previous) expect(voice.stop).toHaveBeenCalled();
    audio.endingPopup();
    audio.update(null, false, 60);
    expect(backend.voices.filter(voice => voice.id === 'eventComplete')).toHaveLength(1);
    expect(backend.voices.at(-1)?.id).toBe('eventComplete');
    audio.dispose();
  });

  // Importance: 98/100. Animation completion must not play the popup bell early.
  it.each(SURVIVAL_EVENT_IDS)('waits for a popup after %s completes', (eventId) => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.beginEvent(eventId);
    expect(backend.voices.some(({ id }) => id === 'eventComplete')).toBe(false);
    audio.finishEventReaction();
    audio.finishEventReaction();
    if (eventId === 'kraken') audio.ending('kraken');
    expect(backend.voices.filter(({ id }) => id === 'eventComplete')).toHaveLength(0);
    audio.dispose();
  });

  // Importance: 98/100. Reproduces water continuing and restarting after the Kraken ending.
  it('stops all existing game sounds at the Kraken ending and prevents new waves', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.start();
    audio.setWeather('thunderstorm');
    audio.update(4);
    audio.beginEvent('kraken');
    audio.beginEventReaction('kraken', { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' });
    const existing = [...backend.voices];
    audio.finishEventReaction();
    audio.ending('kraken');
    for (const voice of existing) expect(voice.stop).toHaveBeenCalledOnce();
    audio.completionPopup();
    const bell = backend.voices.find(({ id }) => id === 'eventComplete')!;
    expect(bell).toBeDefined();
    bell.finish();
    const count = backend.voices.length;
    audio.setWeather('calm');
    audio.start();
    audio.update(60);
    audio.thunder();
    audio.ending('kraken');
    expect(backend.voices).toHaveLength(count);
    audio.dispose();
  });

  // Importance: 95/100. Cancellation must never sound like completion.
  it('does not ring when an event is cancelled', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.beginEvent('kraken');
    audio.clearEvent();
    audio.finishEventReaction();
    expect(backend.voices.some(({ id }) => id === 'eventComplete')).toBe(false);
    audio.dispose();
  });

  // Importance: 95/100. Completion must silence water, then restore the current gameplay weather.
  it('keeps the bell clear of weather and dawn sounds until it finishes', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.start();
    audio.update(8);
    const wave = backend.voices.find(({ id }) => id === 'lightWaveImpact')!;
    const ocean = backend.voices.find(({ id }) => id === 'calmOcean')!;
    audio.beginEvent('flowers');
    audio.finishEventReaction();
    audio.completionPopup();
    expect(wave.stop).toHaveBeenCalledOnce();
    expect(ocean.setGain).toHaveBeenLastCalledWith(0, 0.15);
    const bell = backend.voices.find(({ id }) => id === 'eventComplete')!;
    const count = backend.voices.length;
    audio.setWeather('rain');
    audio.update(60);
    audio.thunder();
    audio.dawn();
    expect(backend.voices).toHaveLength(count);
    expect(ocean.setGain).toHaveBeenLastCalledWith(0, 0.15);
    audio.setPaused(true);
    expect(bell.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    bell.finish();
    expect(ocean.setGain).toHaveBeenLastCalledWith(0.35, 1.5);
    audio.update(8);
    expect(backend.voices.at(-1)?.id).toBe('lightWaveImpact');
    audio.dispose();
  });

  // Importance: 95/100. Storm ambience must cover choices and reactions, then stop with its event.
  it('keeps heavy thunder playing throughout the event and owns pause and cleanup', () => {
    expect(EVENT_BUNDLE_SPECS.thunderstorm.sounds).toContain('stormRumble');
    expect(AUDIO_MANIFEST.stormRumble.loop).toBe(true);
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.start();
    audio.setWeather('thunderstorm');
    audio.beginEvent('thunderstorm');
    audio.eventReveal('thunderstorm');
    const rumble = backend.voices.find(({ id }) => id === 'stormRumble')!;
    expect(rumble.setGain).toHaveBeenLastCalledWith(1, 0.6);
    audio.update(30);
    audio.thunder();
    expect(rumble.stop).not.toHaveBeenCalled();
    expect(backend.voices.filter(({ id }) => id === 'stormRumble')).toHaveLength(1);
    audio.setPaused(true);
    expect(rumble.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    expect(rumble.setPaused).toHaveBeenLastCalledWith(false);
    audio.beginEventReaction('thunderstorm', {
      accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'storm',
    });
    expect(rumble.stop).not.toHaveBeenCalled();
    audio.finishEventReaction();
    expect(rumble.stop).toHaveBeenCalledWith(0.8);
    audio.beginEvent('thunderstorm');
    const nextRumble = backend.voices.filter(({ id }) => id === 'stormRumble').at(-1)!;
    audio.dispose();
    expect(nextRumble.stop).toHaveBeenCalled();
  });

  // Importance: 90/100. The monster sound must pause and stop with its event.
  it('owns the underwater presence loop through pause, departure and cleanup', () => {
    expect(EVENT_BUNDLE_SPECS['something-under-us'].sounds).toEqual(['underUsPresence']);
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.beginEvent('something-under-us');
    audio.eventReveal('something-under-us');
    expect(backend.voices.map(({ id }) => id)).toEqual(['underUsPresence']);
    const voice = backend.voices[0]!;
    expect(voice.setGain).toHaveBeenCalledWith(0, 0);
    expect(voice.setGain).toHaveBeenLastCalledWith(1, 2.5);
    audio.setPaused(true);
    expect(voice.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    expect(voice.setPaused).toHaveBeenLastCalledWith(false);
    audio.beginEventReaction('something-under-us', {
      accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'darkness',
    });
    expect(voice.setGain).toHaveBeenLastCalledWith(0, 3.5);
    audio.finishEventReaction();
    expect(voice.stop).toHaveBeenCalledWith(0.3);
    audio.beginEvent('something-under-us');
    const nextVoice = backend.voices[1]!;
    audio.dispose();
    expect(nextVoice.stop).toHaveBeenCalled();
  });

  // Importance: 95/100. Ending audio must stop surface loops and avoid a second break at the popup.
  it('times sinking audio and stops its loops before the ending popup', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.start();
    audio.sinkingCue('strain');
    const strain = backend.voices.find((voice) => voice.id === 'sinkingCreak')!;
    expect(strain.setGain).toHaveBeenLastCalledWith(1, 1.6);
    audio.sinkingCue('break');
    expect(strain.stop).toHaveBeenCalledWith(0.15);
    const crack = backend.voices.find((voice) => voice.id === 'sinkingEnding')!;
    audio.setPaused(true);
    expect(crack.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    audio.sinkingCue('finish');
    audio.ending('sinking');
    audio.update(20);
    expect(crack.stop).toHaveBeenCalledWith(0.7);
    expect(backend.voices.some((voice) => voice.id === 'underwaterMovement')).toBe(false);
    expect(backend.voices.filter((voice) => voice.id === 'sinkingEnding')).toHaveLength(1);
    expect(backend.voices.some((voice) => voice.id === 'lightWaveImpact')).toBe(false);
    audio.dispose();
  });

  it('fades in the selected seagull ambience and stops it when the event clears', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.beginEvent('seagull-theft');
    audio.eventReveal('seagull-theft');
    expect(backend.voices.map(({ id }) => id)).toEqual(['seagulls']);
    const voice = backend.voices[0]!;
    expect(voice.setGain).toHaveBeenCalledWith(0, 0);
    expect(voice.setGain).toHaveBeenCalledWith(1, 2);
    audio.setPaused(true);
    expect(voice.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    expect(voice.setPaused).toHaveBeenLastCalledWith(false);
    audio.clearEvent();
    expect(voice.stop).toHaveBeenCalledWith(0.8);
    audio.dispose();
  });

  it('plays the selected fishing sounds and owns the net sound through pause and disposal', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    expect(SURVIVAL_SOUND_IDS).toContain('fishingNet');
    audio.fishingCast();
    audio.setFishingReeling(true);
    audio.setFishingReeling(true);
    audio.fishingNet();
    audio.fishingNetSplash();
    expect(backend.voices.map(({ id }) => id)).toEqual(['fishingCast', 'fishingReel', 'fishingNet', 'anchorSplash']);
    const net = backend.voices[2]!;
    audio.setPaused(true);
    expect(net.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    expect(net.setPaused).toHaveBeenLastCalledWith(false);
    const reel = backend.voices[1]!;
    expect(reel.setPaused).toHaveBeenLastCalledWith(false);
    audio.setFishingReeling(false);
    expect(reel.stop).toHaveBeenCalledWith(0.08);
    audio.dispose();
    expect(net.stop).toHaveBeenCalled();
  });

  it('plays the UFO sound through reveal, pauses it, and fades it on departure', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.beginEvent('flying-saucer');
    audio.eventReveal('flying-saucer');
    expect(backend.voices.map(({ id }) => id)).toEqual(['ufoFlyby']);
    const voice = backend.voices[0]!;
    expect(voice.setGain).toHaveBeenCalledWith(0, 0);
    expect(voice.setGain).toHaveBeenCalledWith(1, 1.2);
    audio.setPaused(true);
    expect(voice.setPaused).toHaveBeenLastCalledWith(true);
    audio.setPaused(false);
    expect(voice.setPaused).toHaveBeenLastCalledWith(false);
    audio.beginEventReaction('flying-saucer', {
      accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none',
      eventResult: { eventId: 'flying-saucer', choiceId: 'sleep', resultId: 'ufo-pass' },
    });
    expect(voice.setGain).toHaveBeenLastCalledWith(0, 5);
    audio.finishEventReaction();
    expect(voice.stop).toHaveBeenCalledWith(0.08);
    audio.dispose();
  });

  it('sounds the rescue horn first and stops the engine at the finish screen', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    expect(SURVIVAL_SOUND_IDS).toContain('rescueHorn');
    audio.ending('rescue');
    expect(backend.voices.map(({ id }) => id)).toEqual(['rescueHorn', 'rescueEnding']);
    expect(backend.voices[1]!.setGain).toHaveBeenCalledWith(0.2);
    audio.setPaused(true);
    expect(backend.voices[0]!.setPaused).toHaveBeenCalledWith(true);
    expect(backend.voices[1]!.setPaused).toHaveBeenCalledWith(true);
    audio.finishRescue();
    expect(backend.voices[1]!.stop).toHaveBeenCalledWith(0.6);
    audio.dispose();
    expect(backend.voices[0]!.stop).toHaveBeenCalled();
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
      decodeAudioData: async (bytes: ArrayBuffer) => {
        // Browser decoding transfers the input buffer to the decoder.
        structuredClone(bytes, { transfer: [bytes] });
        return { duration: 1 };
      },
    };
    const fetchAudio = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3])));
    const backend = new WebAudioBackend(context as unknown as AudioContext, fetchAudio as unknown as typeof fetch);
    const system = AudioSystem.forTest(backend);
    const menu = await system.acquirePhaseAudio(MENU_SOUND_IDS);
    const ship = await system.acquirePhaseAudio(SHIP_SOUND_IDS);
    const buffers = (backend as unknown as { buffers: Map<SoundId, AudioBuffer> }).buffers;
    expect(buffers.has('shipCrash')).toBe(true);
    expect(buffers.has('sinkingEnding')).toBe(true);
    expect(fetchAudio.mock.calls.filter(([url]) => url === AUDIO_MANIFEST.shipCrash.url)).toHaveLength(1);
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

  // Importance: 95/100. A successful Kraken ending must not play rescue or death audio.
  it('keeps Kraken ending audio separate from rescue and death', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.ending('kraken');
    expect(backend.voices.map(({ id }) => id)).not.toEqual(expect.arrayContaining(['rescueHorn']));
    expect(backend.voices.map(({ id }) => id).filter((id) => ['rescueHorn', 'rescueEnding', 'deathEnding'].includes(id))).toEqual([]);
    audio.dispose();
  });

  // Importance: 96/100. Kraken water and handover loops must stop on every exit.
  it.each(['reaction', 'ending', 'clear'] as const)('stops the Kraken handover loop on %s', (exit) => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());
    audio.beginEvent('kraken');
    const water = backend.voices.find(({ id }) => id === 'underwaterMovement')!;
    expect(water).toBeDefined();
    expect(water.setGain).toHaveBeenLastCalledWith(0.65, 3);
    audio.beginEventReaction('kraken', { accepted: true, code: 'event-resolved', message: '', deltas: {}, cue: 'none' });
    expect(water.setGain).toHaveBeenLastCalledWith(0, 11);
    const tentacle = backend.voices.find(({ id }) => id === 'tentacleMovement')!;
    expect(tentacle).toBeDefined();
    if (exit === 'reaction') audio.finishEventReaction();
    else if (exit === 'ending') audio.ending('kraken');
    else audio.clearEvent();
    expect(tentacle.stop).toHaveBeenCalledOnce();
    expect(water.stop).toHaveBeenCalledOnce();
    audio.dispose();
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
