import { describe, expect, it } from 'vitest';
import {
  configuredPhysicsMode,
  scavengePhysicsDebugMeshes,
  scavengePhysicsEnabled,
  setScavengePhysicsDebugMeshes,
  setScavengePhysicsEnabled,
  SCAVENGE_PHYSICS_DEBUG_STORAGE_KEY,
  SCAVENGE_PHYSICS_STORAGE_KEY,
  SCAVENGE_PHYSICS_DEBUG_MESHES,
  SCAVENGE_PHYSICS_ENABLED,
} from '../src/physics/PhysicsOptions';

describe('physics options', () => {
  it('keeps physics enabled and the collision overlay off by default', () => {
    expect(SCAVENGE_PHYSICS_ENABLED).toBe(true);
    expect(SCAVENGE_PHYSICS_DEBUG_MESHES).toBe(false);
    expect(configuredPhysicsMode()).toBe('enabled');
  });

  it('persists and restores the menu preference without URL flags', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    setScavengePhysicsEnabled(false, storage);

    expect(values.get(SCAVENGE_PHYSICS_STORAGE_KEY)).toBe('false');
    expect(scavengePhysicsEnabled(storage)).toBe(false);
    expect(configuredPhysicsMode(scavengePhysicsEnabled(storage))).toBe('off');

    setScavengePhysicsEnabled(true, storage);
    expect(scavengePhysicsEnabled(storage)).toBe(true);
    expect(configuredPhysicsMode(scavengePhysicsEnabled(storage))).toBe('enabled');

    setScavengePhysicsDebugMeshes(true, storage);
    expect(values.get(SCAVENGE_PHYSICS_DEBUG_STORAGE_KEY)).toBe('true');
    expect(scavengePhysicsDebugMeshes(storage)).toBe(true);
    expect(configuredPhysicsMode(true, scavengePhysicsDebugMeshes(storage))).toBe('debug');
    expect(configuredPhysicsMode(false, scavengePhysicsDebugMeshes(storage))).toBe('off');
  });
});
