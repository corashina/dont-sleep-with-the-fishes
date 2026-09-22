import { vi } from 'vitest';
import { SurvivalPhase } from '../../src/survival/SurvivalPhase';

export function createTestSurvivalPhase(...args: Parameters<typeof SurvivalPhase.forTest>): SurvivalPhase {
  const dependencies = args[0];
  const world = dependencies.world ??= {};
  world.enterFocusedEventView ??= vi.fn(async () => undefined);
  world.exitFocusedEventView ??= vi.fn(async () => undefined);
  world.projectEventInteractionBounds ??= vi.fn(() => null);
  const ui = dependencies.ui ??= {};
  ui.setEventSelection ??= vi.fn();
  ui.showFocusedEvent ??= vi.fn();
  ui.hideFocusedEvent ??= vi.fn();
  ui.updateFocusedEventTarget ??= vi.fn();
  ui.playEventChoiceBeat ??= vi.fn(async () => undefined);
  ui.restoreCommandFocus ??= vi.fn();
  return SurvivalPhase.forTest(...args);
}
