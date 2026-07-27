import RAPIER from '@dimforge/rapier3d-deterministic-compat';

export interface PhysicsVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class PhysicsLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`Unable to initialize physics: ${message}`, options);
    this.name = 'PhysicsLoadError';
  }
}

export class PhysicsRuntime {
  constructor(readonly rapier: typeof RAPIER) {}

  createWorld(gravity: PhysicsVector3): RAPIER.World {
    return new this.rapier.World(gravity);
  }
}

export async function loadPhysicsRuntime(
  initialize: () => Promise<unknown> = () => RAPIER.init(),
): Promise<PhysicsRuntime> {
  try {
    await initialize();
    return new PhysicsRuntime(RAPIER);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new PhysicsLoadError(message, { cause });
  }
}
