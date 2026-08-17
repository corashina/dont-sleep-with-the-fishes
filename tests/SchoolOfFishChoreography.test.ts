import { describe, expect, it } from 'vitest';
import {
  identitySchoolFishPose,
  identitySchoolSample,
  sampleSchoolFishPose,
  SCHOOL_HULL_LIMIT_Z,
  type SchoolVariant,
} from '../src/survival/events/schoolOfFishChoreography';

const VARIANT: SchoolVariant = {
  scale: 1,
  orbitAngle: 0.37,
  orbitRadiusX: 3.8,
  orbitRadiusZ: 1.6,
  depth: 0.1,
  scatterX: 6.4,
  scatterZ: 2.8,
  speed: 0.9,
  bank: 0,
  flashOffset: 0.5,
};

describe('school fish choreography', () => {
  it('keeps fish beyond the bow during every school state', () => {
    const sample = identitySchoolSample();
    const pose = identitySchoolFishPose();
    for (const gather of [0, 0.25, 0.5, 0.75, 1]) {
      sample.gather = gather;
      sample.schoolAlpha = 1;
      for (let time = 0; time <= 8; time += 0.25) {
        sampleSchoolFishPose(VARIANT, time, sample, pose);
        expect(pose.z).toBeLessThanOrEqual(SCHOOL_HULL_LIMIT_Z);
      }
    }
  });

  it('faces the model forward along its travel direction', () => {
    const sample = identitySchoolSample();
    sample.gather = 1;
    sample.schoolAlpha = 1;
    const pose = identitySchoolFishPose();
    const nextPose = identitySchoolFishPose();
    sampleSchoolFishPose(VARIANT, 0.7, sample, pose);
    sampleSchoolFishPose(VARIANT, 0.7001, sample, nextPose);

    const travelX = nextPose.x - pose.x;
    const travelZ = nextPose.z - pose.z;
    const travelLength = Math.hypot(travelX, travelZ);
    const forwardX = -Math.cos(pose.yaw);
    const forwardZ = Math.sin(pose.yaw);
    const alignment = (
      forwardX * travelX + forwardZ * travelZ
    ) / travelLength;

    expect(alignment).toBeGreaterThan(0.999);
  });
});
