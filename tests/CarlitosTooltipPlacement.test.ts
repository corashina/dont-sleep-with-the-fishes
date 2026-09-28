// Importance: 95/100. Companion labels must not cover nearby item controls or leave the viewport.
import { describe, expect, it } from 'vitest';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';
import { CarlitosTooltipPlacement } from '../src/ui/CarlitosTooltipPlacement';

function anchor(id: string, x: number, y: number): BoatInteractionAnchor {
  return { id, x, y, visible: true, depleted: false, itemType: null, toolId: null,
    action: null, remainingUses: null, hitArea: { width: 54, height: 54, depth: 1 } };
}

describe('Carlitos tooltip placement', () => {
  it.each([[1280, 720], [390, 844], [844, 390]])('avoids nearby controls and screen edges at %s × %s', (width, height) => {
    const result = new CarlitosTooltipPlacement();
    for (const x of [30, width / 2, width - 30]) {
      for (const y of [30, height / 2, height - 30]) {
        const cat = anchor('carlitos', x, y);
        const food = anchor('food', x, y - 75);
        const rod = anchor('rod', x + 65, y);
        const anchors = new Map([cat, food, rod].map(item => [item.id, item]));
        expect(result.place(cat, anchors, 140, 40, width, height)).toBe(true);
        expect(result.x).toBeGreaterThanOrEqual(12);
        expect(result.y).toBeGreaterThanOrEqual(12);
        expect(result.x + 140).toBeLessThanOrEqual(width - 12);
        expect(result.y + 40).toBeLessThanOrEqual(height - 12);
        for (const item of anchors.values()) {
          const overlapWidth = Math.min(result.x + 140, item.x + 27) - Math.max(result.x, item.x - 27);
          const overlapHeight = Math.min(result.y + 40, item.y + 27) - Math.max(result.y, item.y - 27);
          expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
        }
      }
    }
  });

  it('rejects labels that cannot fit without covering controls', () => {
    const result = new CarlitosTooltipPlacement();
    const cat = anchor('carlitos', 200, 200);
    const obstacle = { ...anchor('item', 200, 200), hitArea: { width: 400, height: 400, depth: 1 } };
    expect(result.place(cat, new Map([['item', obstacle]]), 140, 40, 400, 400)).toBe(false);
    expect(result.place(cat, new Map(), 500, 40, 400, 400)).toBe(false);
  });
});
