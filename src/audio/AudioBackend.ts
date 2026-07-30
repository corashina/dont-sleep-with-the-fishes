import type { AudioBusId, SoundId } from './audioManifest';

export interface AudioVoice {
  readonly id: SoundId;
  setGain(gain: number, rampSeconds?: number): void;
  stop(fadeSeconds?: number): void;
  onEnded(callback: () => void): void;
}

export interface AudioBackend {
  load(): Promise<void>;
  unlock(): Promise<void>;
  play(id: SoundId): AudioVoice | null;
  setBusGain(bus: AudioBusId, gain: number, rampSeconds?: number): void;
  setMasterGain(gain: number, rampSeconds?: number): void;
  dispose(): void;
}
