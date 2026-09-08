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
