import type { AudioBusId, SoundId } from './audioManifest';

export interface AudioVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AudioListenerPose {
  readonly position: AudioVector3;
  readonly forward: AudioVector3;
  readonly up: AudioVector3;
}

export interface SpatialAudioEmitter {
  readonly position: readonly [number, number, number];
}

export interface SpatialAudioOptions {
  readonly gain: number;
  readonly refDistance: number;
  readonly maxDistance: number;
  readonly rolloffFactor: number;
}

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
  playSpatialLoop(
    id: SoundId,
    emitters: readonly SpatialAudioEmitter[],
    options: Readonly<SpatialAudioOptions>,
  ): AudioVoice | null;
  setListenerPose(pose: Readonly<AudioListenerPose>): void;
  setBusGain(bus: AudioBusId, gain: number, rampSeconds?: number): void;
  setMasterGain(gain: number, rampSeconds?: number): void;
  dispose(): void;
}
