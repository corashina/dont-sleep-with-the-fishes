import { Euler, type Object3D, type Quaternion, type Vector3 } from 'three';
import {
  deriveBoatPoseInto,
  smoothBoatPoseInto,
  type BoatFootprint,
  type BoatHeightSamples,
  type BoatPose,
  type WaveSampleIntoProvider,
} from '../ocean/BoatBuoyancy';
import type { WaveSample } from '../ocean/WaveField';

const DRIFT_LIMIT = 0.35;
const DRIFT_RESPONSE = 0.3;
const TILT_RESPONSE = 0.3;

export interface DriftingWater {
  readonly sampleWaveInto: WaveSampleIntoProvider;
  readonly readAmplitudeScale: () => number;
}

export function applyDriftingWavePose(
  subject: Object3D,
  basePosition: Readonly<Vector3>,
  baseQuaternion: Readonly<Quaternion>,
  wave: WaveSample,
  time: number,
  water: DriftingWater,
): void {
  water.sampleWaveInto(
    wave,
    time,
    basePosition.x,
    basePosition.z,
    water.readAmplitudeScale(),
  );
  subject.position.set(
    basePosition.x + Math.max(
      -DRIFT_LIMIT,
      Math.min(DRIFT_LIMIT, -wave.normal.x * DRIFT_RESPONSE),
    ),
    basePosition.y + wave.height,
    basePosition.z + Math.max(
      -DRIFT_LIMIT,
      Math.min(DRIFT_LIMIT, -wave.normal.z * DRIFT_RESPONSE),
    ),
  );
  subject.quaternion.copy(baseQuaternion);
  subject.rotateX(Math.atan2(wave.normal.z, wave.normal.y) * TILT_RESPONSE);
  subject.rotateZ(-Math.atan2(wave.normal.x, wave.normal.y) * TILT_RESPONSE);
}

function waveSample(): WaveSample {
  return { height: 0, displacementX: 0, displacementZ: 0, normal: { x: 0, y: 1, z: 0 } };
}

// A long, heavy body rides the mean of the waves under its ends and flanks.
// It lags the water, so short chop passes under it and long swells tip it slowly.
export class HeavyDriftingFloat {
  private readonly samples = [waveSample(), waveSample(), waveSample(), waveSample()] as const;
  private readonly heights: BoatHeightSamples = { bow: 0, stern: 0, port: 0, starboard: 0 };
  private readonly target: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly pose: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
  private readonly tilt = new Euler();

  constructor(
    private readonly footprint: BoatFootprint,
    private readonly damping: number,
  ) {}

  // Pass an infinite delta to settle at once.
  apply(
    subject: Object3D,
    basePosition: Readonly<Vector3>,
    baseQuaternion: Readonly<Quaternion>,
    time: number,
    delta: number,
    water: DriftingWater,
  ): void {
    const [bow, stern, port, starboard] = this.samples;
    const amplitude = water.readAmplitudeScale();
    const halfLength = this.footprint.length / 2;
    const halfWidth = this.footprint.width / 2;
    const { x, z } = basePosition;
    water.sampleWaveInto(bow, time, x, z - halfLength, amplitude);
    water.sampleWaveInto(stern, time, x, z + halfLength, amplitude);
    water.sampleWaveInto(port, time, x - halfWidth, z, amplitude);
    water.sampleWaveInto(starboard, time, x + halfWidth, z, amplitude);
    this.heights.bow = bow.height;
    this.heights.stern = stern.height;
    this.heights.port = port.height;
    this.heights.starboard = starboard.height;
    deriveBoatPoseInto(this.target, this.heights, this.footprint);
    const normalX = (bow.normal.x + stern.normal.x + port.normal.x + starboard.normal.x) / 4;
    const normalZ = (bow.normal.z + stern.normal.z + port.normal.z + starboard.normal.z) / 4;
    this.target.driftX = Math.max(-DRIFT_LIMIT, Math.min(DRIFT_LIMIT, -normalX * DRIFT_RESPONSE));
    this.target.driftZ = Math.max(-DRIFT_LIMIT, Math.min(DRIFT_LIMIT, -normalZ * DRIFT_RESPONSE));
    smoothBoatPoseInto(this.pose, this.pose, this.target, delta, this.damping);
    subject.position.set(
      basePosition.x + this.pose.driftX,
      basePosition.y + this.pose.y,
      basePosition.z + this.pose.driftZ,
    );
    // The current turns the body a little while it drifts.
    this.tilt.set(this.pose.pitch, 0.05 * Math.sin(time * 0.21), -this.pose.roll);
    subject.quaternion.setFromEuler(this.tilt).multiply(baseQuaternion);
  }
}
