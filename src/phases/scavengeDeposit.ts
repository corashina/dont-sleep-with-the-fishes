import type { ScavengeSession } from '../game/ScavengeSession';
import type { CarryController } from '../interaction/CarryController';
import type { World } from '../world/World';

export function commitBoatDeposit(
  session: ScavengeSession,
  carry: CarryController,
  world: Pick<World, 'saveItems'>,
): boolean {
  const saved = session.saveCarriedBundle();
  if (saved === null) return false;
  carry.releaseAll();
  world.saveItems(saved);
  return true;
}
