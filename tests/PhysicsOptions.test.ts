import { describe, expect, it } from 'vitest';
import {
  configuredPhysicsMode,
  SCAVENGE_PHYSICS_DEBUG_MESHES,
  SCAVENGE_PHYSICS_ENABLED,
} from '../src/physics/PhysicsOptions';

describe('physics options', () => {
  it('keeps physics enabled and the collision overlay off by default', () => {
    expect(SCAVENGE_PHYSICS_ENABLED).toBe(true);
    expect(SCAVENGE_PHYSICS_DEBUG_MESHES).toBe(false);
    expect(configuredPhysicsMode()).toBe('enabled');
  });
});
