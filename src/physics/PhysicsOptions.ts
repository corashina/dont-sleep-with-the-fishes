export type PhysicsMode = 'enabled' | 'debug' | 'off';

export const SCAVENGE_PHYSICS_ENABLED = true;
export const SCAVENGE_PHYSICS_DEBUG_MESHES = false;

export function configuredPhysicsMode(): PhysicsMode {
  if (!SCAVENGE_PHYSICS_ENABLED) return 'off';
  return SCAVENGE_PHYSICS_DEBUG_MESHES ? 'debug' : 'enabled';
}
