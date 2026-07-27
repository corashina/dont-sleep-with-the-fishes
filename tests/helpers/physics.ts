import {
  loadPhysicsRuntime,
  type PhysicsRuntime,
} from '../../src/physics/PhysicsRuntime';

let runtimePromise: Promise<PhysicsRuntime> | undefined;

export function testPhysicsRuntime(): Promise<PhysicsRuntime> {
  runtimePromise ??= loadPhysicsRuntime();
  return runtimePromise;
}
