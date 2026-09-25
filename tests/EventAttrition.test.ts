// Importance: 95/100. Successful defenses must preserve supplies while breaking the selected tool at the intended odds.
import { expect, it, vi } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';

it.each([
  ['tentacle-attack', 'knife', 0.70, 0],
  ['tentacle-attack', 'fishingNet', 0.65, 0],
  ['restless-waves', 'anchor', 0.70, 0],
  ['tornado', 'anchor', 0.65, -10],
  ['dangerous-waters', 'anchor', 0.65, -10],
  ['leak', 'bucket', 0.65, -5],
  ['windy-night', 'fishingNet', 0.65, 0],
] as const)('%s wears the %s while preserving supplies', (eventId, itemId, boundary, damage) => {
  for (const [roll, condition] of [[boundary - 0.001, 'usable'], [boundary, 'broken']] as const) {
    const instanceId: ItemInstanceId = `${itemId}-1`;
    const next = vi.fn(() => 0);
    const session = new SurvivalSession([
      { type: itemId, instanceId },
      { type: 'cannedFood', instanceId: 'cannedFood-1' },
    ], { seed: 1, random: { next }, initialEventId: eventId });
    next.mockReturnValueOnce(roll);

    const result = session.resolveEvent({ kind: 'item', choiceId: itemId, instanceId });

    expect(result.accepted).toBe(true);
    expect(session.snapshot().inventory[instanceId]?.condition).toBe(condition);
    expect(session.snapshot().inventory['cannedFood-1']?.condition).toBe('usable');
    expect(session.snapshot().food).toBe(1);
    expect(session.snapshot().health).toBe(100);
    expect(result.deltas.hull ?? 0).toBe(condition === 'broken' ? damage : 0);
  }
});

// Importance: 95/100. Anchor failure must apply the full damage range without losing the broken item.
it.each(['dangerous-waters', 'tornado'])('%s anchor failure deals up to 20 hull damage', (eventId) => {
  const itemId: ItemId = 'anchor';
  const next = vi.fn(() => 0);
  const session = new SurvivalSession([{ type: itemId, instanceId: 'anchor-1' }], {
    seed: 1, random: { next }, initialEventId: eventId,
  });
  next.mockReturnValueOnce(0.99).mockReturnValueOnce(0.999);

  const result = session.resolveEvent({ kind: 'item', choiceId: itemId, instanceId: 'anchor-1' });

  expect(result).toMatchObject({ accepted: true, deltas: { hull: -20 } });
  expect(session.snapshot().inventory['anchor-1']?.condition).toBe('broken');
});
