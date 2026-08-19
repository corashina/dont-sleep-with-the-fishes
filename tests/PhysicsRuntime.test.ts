// Importance: 8/10 (scaled from 4/5). Protects physics startup and error context.
import { describe, expect, it, vi } from 'vitest';
import {
  PhysicsLoadError,
  loadPhysicsRuntime,
} from '../src/physics/PhysicsRuntime';

describe('PhysicsRuntime', () => {
  it('creates an owned Rapier world after initialization', async () => {
    const runtime = await loadPhysicsRuntime();
    const world = runtime.createWorld({ x: 0, y: -9.81, z: 0 });
    expect(world.gravity.y).toBeCloseTo(-9.81);
    world.free();
  });

  it('wraps initialization failures', async () => {
    const failure = new Error('WASM unavailable');
    await expect(loadPhysicsRuntime(() => Promise.reject(failure)))
      .rejects.toEqual(expect.objectContaining({
        name: 'PhysicsLoadError',
        message: 'Unable to initialize physics: WASM unavailable',
        cause: failure,
      }));
    expect(PhysicsLoadError.prototype).toBeInstanceOf(Error);
  });
});
