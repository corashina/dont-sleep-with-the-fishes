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
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import {
  AUDIO_MANIFEST,
  EVENT_ONLY_SOUND_IDS,
  SHARED_SOUND_IDS,
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

  it('registers Midnight Tour sounds with the required settings', () => {
    expect(EVENT_ONLY_SOUND_IDS).toEqual(expect.arrayContaining([
      'midnightShovel',
      'midnightMonsterAttack',
    ]));
    expect(AUDIO_MANIFEST.midnightShovel.loop).toBe(false);
    expect(AUDIO_MANIFEST.midnightMonsterAttack.loop).toBe(false);
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

  it('loads only shared sounds during system startup', async () => {
    const backend = new FakeAudioBackend();
    const system = await AudioSystem.loadWithBackend(backend);

    expect(backend.acquire).toHaveBeenCalledExactlyOnceWith(SHARED_SOUND_IDS);

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

  it('loops tentacle movement only during Tentacle Attack', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginEvent('snatcher');
    const movement = backend.voices.at(-1)!;
    expect(movement.id).toBe('tentacleMovement');

    audio.finishEventReaction('snatcher');
    expect(movement.stop).toHaveBeenCalledExactlyOnceWith(0.08);
  });

  it('loops leaking water only during the Leak event', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginEvent('leak');
    const leak = backend.voices.at(-1)!;
    expect(leak.id).toBe('leak');

    audio.finishEventReaction('leak');
    expect(leak.stop).toHaveBeenCalledExactlyOnceWith(0.08);
  });

  it('loops tornado wind only during the Tornado event', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginEvent('tornado');
    const tornadoWind = backend.voices.at(-1)!;
    expect(tornadoWind.id).toBe('tornadoWind');

    audio.finishEventReaction('tornado');
    expect(tornadoWind.stop).toHaveBeenCalledExactlyOnceWith(0.08);
  });

  it('finishes Wreckage dive audio after its reaction', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginDive();
    const movement = backend.voices.find(({ id }) => id === 'underwaterMovement')!;
    audio.finishEventReaction('wreckage');

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

  it('plays and owns the Plane flyby sound', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.beginEvent('plane');
    const flyby = backend.voices.at(-1)!;
    expect(flyby.id).toBe('planeFlyby');
    expect(AUDIO_MANIFEST.planeFlyby.loop).toBe(false);

    audio.clearEvent();
    expect(flyby.stop).toHaveBeenCalledExactlyOnceWith(0.08);
  });

  it('uses a yawn instead of the event sting for Bad Sleep', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventReveal('bad-sleep');

    expect(backend.voices.map(({ id }) => id)).toEqual(['yawn']);
  });

  it('uses the spirit breath instead of the event sting for Ghosts', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventReveal('ghosts');

    expect(backend.voices.map(({ id }) => id)).toEqual(['ghostSpiritBreath']);
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

  it('plays the recovered chest sound when the chest opens', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.action('openChest');

    expect(backend.voices.map(({ id }) => id)).toEqual(['chest']);
  });

  it('plays Chest Attack movement and impact cues', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.chestAttackCue('wood');
    audio.chestAttackCue('attack');

    expect(backend.voices.map(({ id }) => id)).toEqual([
      'chest',
      'midnightMonsterAttack',
    ]);
  });

  it('plays distinct Check the Back result cues', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.checkBackCue('fish');
    audio.checkBackCue('anglerfish');

    expect(backend.voices.map(({ id }) => id)).toEqual([
      'checkBackFish',
      'checkBackAnglerfish',
    ]);
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

  it.each([
    'drifting-barrel',
    'drifting-chest',
  ])('does not play a reveal sound for %s', (eventId) => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventReveal(eventId);

    expect(backend.voices).toEqual([]);
  });

  it('cycles through all thunder recordings', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.thunder();
    audio.thunder();
    audio.thunder();
    audio.thunder();

    expect(backend.voices.map(({ id }) => id)).toEqual([
      'thunderLightning',
      'thunderLightningCrack',
      'thunderLightningDry',
      'thunderLightning',
    ]);
  });

  it('loads all thunder recordings as effects', () => {
    expect([
      AUDIO_MANIFEST.thunderLightning,
      AUDIO_MANIFEST.thunderLightningCrack,
      AUDIO_MANIFEST.thunderLightningDry,
    ].map(({ bus, loop }) => ({ bus, loop }))).toEqual([
      { bus: 'effects', loop: false },
      { bus: 'effects', loop: false },
      { bus: 'effects', loop: false },
    ]);
  });

  it('uses exact event item sounds and keeps the map and compass silent', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventItem('ductTape');
    audio.eventItem('flareGun');
    audio.eventItem('shotgun');
    audio.eventItem('flashlight');
    audio.eventItem('anchor');
    audio.eventItem('umbrella');
    audio.bucketHelmetRain();
    audio.eventItem('map');
    audio.eventItem('compass');

    expect(backend.voices.map(({ id }) => id)).toEqual([
      'ductTapePickup',
      'flareGun',
      'shotgun',
      'flashlight',
      'anchorChain',
      'umbrella',
      'bucketRain',
    ]);
  });

  it('applies master volume and mute without losing volume', () => {
    const backend = new FakeAudioBackend();
    const system = AudioSystem.forTest(backend);
    system.setVolume(0.35);
    system.setMuted(true);
    system.setMuted(false);
    expect(backend.masterGains).toEqual([0.7, 0.35, 0, 0.35]);
    expect(system.getPreference()).toEqual({ volume: 0.35, muted: false });
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

  it('layers the flare gun shot before the flare launch', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventItemCue('flareGun', 0);
    audio.eventItemCue('flareGun', 1);

    expect(backend.voices.map(({ id }) => id)).toEqual([
      'flareGunShot',
      'flareGun',
    ]);
  });

  it('plays the anchor splash at the water-contact cue', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventItem('anchor');
    audio.eventItemCue('anchor', 0);

    expect(backend.voices.map(({ id }) => id)).toEqual(['anchorChain', 'anchorSplash']);
  });

  it('plays the incoming signal at the Radio reception cue', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventItemCue('radio', 0);

    expect(backend.voices.map(({ id }) => id)).toEqual(['radioSignal']);
  });

  it('plays duct tape when the map seals the leak', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventItemCue('map', 0);

    expect(backend.voices.map(({ id }) => id)).toEqual(['tapeRepair']);
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
