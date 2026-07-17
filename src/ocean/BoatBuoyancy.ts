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

export type WaveSampleIntoProvider = (
  output: WaveSample,
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
) => void;

export function deriveBoatPoseInto(
  output: BoatPose,
  samples: BoatHeightSamples,
  footprint: BoatFootprint,
): void {
  output.y = (samples.bow + samples.stern + samples.port + samples.starboard) / 4;
  output.pitch = Math.atan2(samples.bow - samples.stern, footprint.length);
  output.roll = Math.atan2(samples.port - samples.starboard, footprint.width);
  output.driftX = 0;
  output.driftZ = 0;
}

export function deriveBoatPose(samples: BoatHeightSamples, footprint: BoatFootprint): BoatPose {
  const output: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  deriveBoatPoseInto(output, samples, footprint);
  return output;
}

export function smoothBoatPoseInto(
  output: BoatPose,
  current: BoatPose,
  target: BoatPose,
  deltaSeconds: number,
  damping: number,
): void {
  const factor = 1 - Math.exp(-Math.max(0, damping) * Math.max(0, deltaSeconds));
  output.y = current.y + (target.y - current.y) * factor;
  output.pitch = current.pitch + (target.pitch - current.pitch) * factor;
  output.roll = current.roll + (target.roll - current.roll) * factor;
  output.driftX = current.driftX + (target.driftX - current.driftX) * factor;
  output.driftZ = current.driftZ + (target.driftZ - current.driftZ) * factor;
}

export function smoothBoatPose(
  current: BoatPose,
  target: BoatPose,
  deltaSeconds: number,
  damping: number,
): BoatPose {
  const output: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  smoothBoatPoseInto(output, current, target, deltaSeconds, damping);
  return output;
}

export class BoatBuoyancy {
  private readonly bow: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly stern: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly port: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly starboard: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly heights: BoatHeightSamples = { bow: 0, stern: 0, port: 0, starboard: 0 };

  constructor(
    private readonly sample: WaveSampleProvider,
    private readonly footprint: BoatFootprint = { length: 4, width: 2 },
    private readonly sampleIntoProvider?: WaveSampleIntoProvider,
  ) {}

  private sampleInto(
    output: WaveSample,
    time: number,
    x: number,
    z: number,
    amplitudeScale: number,
  ): void {
    if (this.sampleIntoProvider) {
      this.sampleIntoProvider(output, time, x, z, amplitudeScale);
      return;
    }
    const value = this.sample(time, x, z, amplitudeScale);
    output.height = value.height;
    output.displacementX = value.displacementX;
    output.displacementZ = value.displacementZ;
    output.normal.x = value.normal.x;
    output.normal.y = value.normal.y;
    output.normal.z = value.normal.z;
  }

  sampleTargetInto(
    output: BoatPose,
    time: number,
    anchorX: number,
    anchorZ: number,
    amplitudeScale: number,
  ): void {
    const halfLength = this.footprint.length / 2;
    const halfWidth = this.footprint.width / 2;
    this.sampleInto(this.bow, time, anchorX, anchorZ - halfLength, amplitudeScale);
    this.sampleInto(this.stern, time, anchorX, anchorZ + halfLength, amplitudeScale);
    this.sampleInto(this.port, time, anchorX - halfWidth, anchorZ, amplitudeScale);
    this.sampleInto(this.starboard, time, anchorX + halfWidth, anchorZ, amplitudeScale);
    this.heights.bow = this.bow.height;
    this.heights.stern = this.stern.height;
    this.heights.port = this.port.height;
    this.heights.starboard = this.starboard.height;
    deriveBoatPoseInto(output, this.heights, this.footprint);
    const centerNormalX = (
      this.bow.normal.x + this.stern.normal.x + this.port.normal.x + this.starboard.normal.x
    ) / 4;
    const centerNormalZ = (
      this.bow.normal.z + this.stern.normal.z + this.port.normal.z + this.starboard.normal.z
    ) / 4;
    output.driftX = Math.max(-0.35, Math.min(0.35, -centerNormalX * 0.3));
    output.driftZ = Math.max(-0.35, Math.min(0.35, -centerNormalZ * 0.3));
  }

  sampleTarget(time: number, anchorX: number, anchorZ: number, amplitudeScale: number): BoatPose {
    const output: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
    this.sampleTargetInto(output, time, anchorX, anchorZ, amplitudeScale);
    return output;
  }
}
