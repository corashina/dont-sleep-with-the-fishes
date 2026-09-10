// @vitest-environment jsdom
import { expect,it,vi } from 'vitest';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { ACTION_FOR_ITEM } from '../src/survival/BoatInteractionProjector';

it('offers net fishing at two energy and reports why one energy is insufficient', () => {
  const host = document.createElement('main');
  document.body.append(host);
  const view = new BoatAnchorView(host);
  host.append(...view.roots);
  const game = new SurvivalSession([{ instanceId: 'fishingNet-1', type: 'fishingNet' }], { seed: 1 });
  const action = vi.fn();
  const unavailable = vi.fn();
  view.onAction = action;
  view.onUnavailableAction = unavailable;
  try {
    view.setAnchors([{
      id: 'supply:fishingNet', itemType: 'fishingNet', toolId: null, action: ACTION_FOR_ITEM.fishingNet!,
      remainingUses: null, backingInstanceId: 'fishingNet-1', quantity: 1,
      x: 400, y: 200, visible: true, depleted: false,
    }]);
    view.render(game.snapshot(), new Map([['netFish', null]]));
    const button = view.anchorButton('supply:fishingNet')!;
    expect(button.textContent).toContain('⚡⚡');
    button.click();
    expect(action).toHaveBeenCalledWith('netFish', button);
    const tired = new SurvivalSession([{ instanceId: 'fishingNet-1', type: 'fishingNet' }], {
      seed: 1, initial: { energy: 1 },
    });
    const reason = tired.availableReason('netFish');
    view.render(tired.snapshot(), new Map([['netFish', reason]]));
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(unavailable).toHaveBeenCalledWith('netFish', reason);
  } finally {
    view.dispose();
    host.remove();
  }
});
