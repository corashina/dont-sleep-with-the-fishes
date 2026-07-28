export type PhysicsMode = 'enabled' | 'debug' | 'off';

export const SCAVENGE_PHYSICS_ENABLED = true;
export const SCAVENGE_PHYSICS_DEBUG_MESHES = false;
export const SCAVENGE_PHYSICS_STORAGE_KEY =
  'dont-sleep-with-the-fishes:scavenge-physics-enabled';
export const SCAVENGE_PHYSICS_DEBUG_STORAGE_KEY =
  'dont-sleep-with-the-fishes:scavenge-physics-debug-meshes';

type PhysicsPreferenceReader = Pick<Storage, 'getItem'>;
type PhysicsPreferenceWriter = Pick<Storage, 'setItem'>;

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function scavengePhysicsEnabled(
  storage: PhysicsPreferenceReader | null = browserStorage(),
): boolean {
  try {
    const stored = storage?.getItem(SCAVENGE_PHYSICS_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Keep the authored default when browser storage is unavailable.
  }
  return SCAVENGE_PHYSICS_ENABLED;
}

export function setScavengePhysicsEnabled(
  enabled: boolean,
  storage: PhysicsPreferenceWriter | null = browserStorage(),
): void {
  try {
    storage?.setItem(SCAVENGE_PHYSICS_STORAGE_KEY, String(enabled));
  } catch {
    // The current session remains unchanged when storage is unavailable.
  }
}

export function scavengePhysicsDebugMeshes(
  storage: PhysicsPreferenceReader | null = browserStorage(),
): boolean {
  try {
    const stored = storage?.getItem(SCAVENGE_PHYSICS_DEBUG_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Keep the authored default when browser storage is unavailable.
  }
  return SCAVENGE_PHYSICS_DEBUG_MESHES;
}

export function setScavengePhysicsDebugMeshes(
  enabled: boolean,
  storage: PhysicsPreferenceWriter | null = browserStorage(),
): void {
  try {
    storage?.setItem(SCAVENGE_PHYSICS_DEBUG_STORAGE_KEY, String(enabled));
  } catch {
    // The current session remains unchanged when storage is unavailable.
  }
}

export function configuredPhysicsMode(
  enabled: boolean = scavengePhysicsEnabled(),
  debugMeshes: boolean = scavengePhysicsDebugMeshes(),
): PhysicsMode {
  if (!enabled) return 'off';
  return debugMeshes ? 'debug' : 'enabled';
}
