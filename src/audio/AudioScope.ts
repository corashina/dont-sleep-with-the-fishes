import type { AudioBackend, AudioVoice } from './AudioBackend';
import {
  AUDIO_MANIFEST,
  type AudioBusId,
  type SoundId,
} from './audioManifest';

const GAME_AUDIO_BUSES: readonly AudioBusId[] = Object.freeze([
  'music',
  'ambience',
  'effects',
]);

export interface AudioScope {
  play(id: SoundId): AudioVoice | null;
  startLoop(id: SoundId): AudioVoice | null;
  stopLoop(id: SoundId, fadeSeconds?: number): void;
  setLoopGain(id: SoundId, gain: number, rampSeconds?: number): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export class OwnedAudioScope implements AudioScope {
  private readonly loops = new Map<SoundId, AudioVoice>();
  private readonly effects = new Set<AudioVoice>();
  private paused = false;
  private disposed = false;

  constructor(
    private readonly backend: AudioBackend,
    private readonly onDispose: (scope: OwnedAudioScope) => void,
  ) {}

  play(id: SoundId): AudioVoice | null {
    if (this.disposed) return null;
    const voice = this.backend.play(id);
    if (voice === null) return null;
    this.effects.add(voice);
    voice.onEnded(() => this.effects.delete(voice));
    return voice;
  }

  startLoop(id: SoundId): AudioVoice | null {
    if (this.disposed) return null;
    if (!AUDIO_MANIFEST[id].loop) {
      throw new Error(`Sound is not configured as a loop: ${id}`);
    }
    const current = this.loops.get(id);
    if (current !== undefined) return current;
    const voice = this.backend.play(id);
    if (voice === null) return null;
    this.loops.set(id, voice);
    voice.onEnded(() => {
      if (this.loops.get(id) === voice) this.loops.delete(id);
    });
    return voice;
  }

  stopLoop(id: SoundId, fadeSeconds = 0.05): void {
    const voice = this.loops.get(id);
    if (voice === undefined) return;
    this.loops.delete(id);
    voice.stop(fadeSeconds);
  }

  setLoopGain(id: SoundId, gain: number, rampSeconds = 0.05): void {
    this.loops.get(id)?.setGain(gain, rampSeconds);
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    for (const bus of GAME_AUDIO_BUSES) {
      this.backend.setBusGain(bus, paused ? 0 : 1, 0.05);
    }
    this.play(paused ? 'pause' : 'resume');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const voice of this.loops.values()) voice.stop(0.1);
    for (const voice of this.effects) voice.stop();
    this.loops.clear();
    this.effects.clear();
    this.onDispose(this);
  }
}
