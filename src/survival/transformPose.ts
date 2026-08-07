export interface MutableTransformPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export function createTransformPose(): MutableTransformPose {
  return resetTransformPose({} as MutableTransformPose);
}

export function resetTransformPose<Pose extends MutableTransformPose>(
  pose: Pose,
): Pose {
  pose.x = 0;
  pose.y = 0;
  pose.z = 0;
  pose.yaw = 0;
  pose.pitch = 0;
  pose.roll = 0;
  pose.scaleX = 1;
  pose.scaleY = 1;
  pose.scaleZ = 1;
  return pose;
}

export function copyTransformPose<Pose extends MutableTransformPose>(
  source: Readonly<MutableTransformPose>,
  output: Pose,
): Pose {
  output.x = source.x;
  output.y = source.y;
  output.z = source.z;
  output.yaw = source.yaw;
  output.pitch = source.pitch;
  output.roll = source.roll;
  output.scaleX = source.scaleX;
  output.scaleY = source.scaleY;
  output.scaleZ = source.scaleZ;
  return output;
}
