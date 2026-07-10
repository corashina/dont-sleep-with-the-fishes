import type { WaveSample } from './WaveField';

export interface BoatHeightSamples {
  bow: number;
  stern: number;
  port: number;
  starboard: number;
}

export interface BoatFootprint {
  length: number;
  width: number;
}

export interface BoatPose {
  y: number;
  pitch: number;
  roll: number;
  driftX: number;
  driftZ: number;
}

export type WaveSampleProvider = (
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
) => WaveSample;

export function deriveBoatPose(samples: BoatHeightSamples, footprint: BoatFootprint): BoatPose {
  const y = (samples.bow + samples.stern + samples.port + samples.starboard) / 4;
  return {
    y,
    pitch: Math.atan2(samples.bow - samples.stern, footprint.length),
    roll: Math.atan2(samples.port - samples.starboard, footprint.width),
    driftX: 0,
    driftZ: 0,
  };
}

export function smoothBoatPose(
  current: BoatPose,
  target: BoatPose,
  deltaSeconds: number,
  damping: number,
): BoatPose {
  const factor = 1 - Math.exp(-Math.max(0, damping) * Math.max(0, deltaSeconds));
  const mix = (from: number, to: number): number => from + (to - from) * factor;
  return {
    y: mix(current.y, target.y),
    pitch: mix(current.pitch, target.pitch),
    roll: mix(current.roll, target.roll),
    driftX: mix(current.driftX, target.driftX),
    driftZ: mix(current.driftZ, target.driftZ),
  };
}

export class BoatBuoyancy {
  constructor(
    private readonly sample: WaveSampleProvider,
    private readonly footprint: BoatFootprint = { length: 4, width: 2 },
  ) {}

  sampleTarget(time: number, anchorX: number, anchorZ: number, amplitudeScale: number): BoatPose {
    const halfLength = this.footprint.length / 2;
    const halfWidth = this.footprint.width / 2;
    const bow = this.sample(time, anchorX, anchorZ - halfLength, amplitudeScale);
    const stern = this.sample(time, anchorX, anchorZ + halfLength, amplitudeScale);
    const port = this.sample(time, anchorX - halfWidth, anchorZ, amplitudeScale);
    const starboard = this.sample(time, anchorX + halfWidth, anchorZ, amplitudeScale);
    const pose = deriveBoatPose(
      { bow: bow.height, stern: stern.height, port: port.height, starboard: starboard.height },
      this.footprint,
    );
    const centerNormalX = (bow.normal.x + stern.normal.x + port.normal.x + starboard.normal.x) / 4;
    const centerNormalZ = (bow.normal.z + stern.normal.z + port.normal.z + starboard.normal.z) / 4;
    pose.driftX = Math.max(-0.35, Math.min(0.35, -centerNormalX * 0.3));
    pose.driftZ = Math.max(-0.35, Math.min(0.35, -centerNormalZ * 0.3));
    return pose;
  }
}
