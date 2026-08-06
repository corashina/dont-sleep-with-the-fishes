// Importance: 4/5. Protects audio scope ownership, routing, pause behavior, and cleanup.
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
import type { AudioBusId, SoundId } from '../src/audio/audioManifest';

class FakeVoice implements AudioVoice {
  private readonly callbacks: (() => void)[] = [];
  readonly setGain = vi.fn();
  readonly setPaused = vi.fn();
  readonly stop = vi.fn(() => {
    for (const callback of this.callbacks.splice(0)) callback();
  });

  constructor(readonly id: SoundId) {}

  onEnded(callback: () => void): void {
    this.callbacks.push(callback);
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

  load(): Promise<void> { return Promise.resolve(); }
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

    audio.beginEvent('school-of-fish');
    expect(movement.stop).toHaveBeenCalledExactlyOnceWith(0.08);
  });

  it('uses a yawn instead of the event sting for Bad Sleep', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventReveal('bad-sleep');

    expect(backend.voices.map(({ id }) => id)).toEqual(['yawn']);
  });

  it('uses the exact sound for each event item', () => {
    const backend = new FakeAudioBackend();
    const audio = new SurvivalAudio(AudioSystem.forTest(backend).createScope());

    audio.eventItem('ductTape');
    audio.eventItem('flareGun');
    audio.eventItem('shotgun');
    audio.eventItem('flashlight');
    audio.eventItem('anchor');
    audio.eventItem('umbrella');
    audio.eventItem('map');

    expect(backend.voices.map(({ id }) => id)).toEqual([
      'tapeRepair',
      'flareGun',
      'shotgun',
      'flashlight',
      'anchorChain',
      'umbrella',
      'itemHandling',
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
