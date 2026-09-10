// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';
import { focusedChoicesFor } from '../src/survival/SurvivalEventFlow';
import { survivalEventById, type InspectableEventId } from '../src/survival/eventCatalog';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const activeUIs: SurvivalUI[] = [];

afterEach(() => {
  activeUIs.splice(0).forEach((ui) => ui.dispose());
  document.body.innerHTML = '';
});

function fixture(eventId: string) {
  const session = new SurvivalSession([
    { instanceId: 'scubaSet-1', type: 'scubaSet' },
  ], { seed: 72, initial: { day: 4, energy: 3 }, initialEventId: eventId });
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new SurvivalUI(mount);
  activeUIs.push(ui);
  const action = vi.fn();
  const eventItem = vi.fn();
  const inspect = vi.fn();
  ui.onAction = action;
  ui.onEventItem = eventItem;
  ui.onFocusedEventSelect = inspect;
  const anchors: BoatInteractionAnchor[] = [
    {
      id: 'supply:scubaSet', itemType: 'scubaSet', toolId: null, action: 'dive',
      backingInstanceId: 'scubaSet-1', quantity: 1, usableQuantity: 1, brokenQuantity: 0,
      remainingUses: null, x: 100, y: 200, visible: true, depleted: false,
    },
    {
      id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish',
      remainingUses: null, x: 300, y: 200, visible: true, depleted: false,
    },
    {
      id: `event:${eventId}`, itemType: null, toolId: null, action: null,
      eventFocusId: eventId as InspectableEventId,
      remainingUses: null, x: 500, y: 200, visible: true, depleted: false,
    },
  ];
  const render = () => ui.render(session.snapshot(), (id) => session.availableReason(id));
  render();
  ui.setAnchors(anchors);
  ui.beginEventPresentation();
  ui.setEventSelection(new Map(), []);
  ui.setBusy(false);
  const button = (id: string) => mount.querySelector<HTMLButtonElement>(`[data-anchor-id="${id}"]`)!;
  return { session, ui, action, eventItem, inspect, render, button };
}

describe.each(['drifting-chest', 'drifting-supplies'] as const)('day commands during %s', (eventId) => {
  it('starts a dive from the scuba button and keeps loot pending', () => {
    const rig = fixture(eventId);
    expect(rig.session.availableReason('dive')).toBeNull();
    const scuba = rig.button('supply:scubaSet');
    expect(scuba.getAttribute('aria-disabled')).toBe('false');
    expect(scuba.tabIndex).toBe(0);
    rig.ui.onAction = (action) => {
      rig.action(action);
      expect(action).toBe('dive');
      expect(rig.session.perform('dive').accepted).toBe(true);
      rig.render();
    };
    scuba.click();
    expect(rig.action).toHaveBeenCalledExactlyOnceWith('dive');
    expect(rig.eventItem).not.toHaveBeenCalled();
    expect(rig.session.snapshot()).toMatchObject({ state: 'dayEvent', pendingEventId: eventId, energy: 0 });
    expect(scuba.getAttribute('aria-disabled')).toBe('true');
    rig.button(`event:${eventId}`).click();
    expect(rig.inspect).toHaveBeenCalledExactlyOnceWith(eventId);
  });

  it('allows routine tools while retaining busy, popup, and pause locks', () => {
    const rig = fixture(eventId);
    const fish = rig.button('fishing-tools');
    fish.click();
    expect(rig.action).toHaveBeenCalledExactlyOnceWith('fish', undefined);
    rig.action.mockClear();

    rig.ui.setBusy(true);
    fish.click();
    rig.button('supply:scubaSet').click();
    expect(rig.action).not.toHaveBeenCalled();
    rig.ui.setBusy(false);

    rig.ui.showFocusedEvent({
      eventId, target: null,
      choices: focusedChoicesFor(survivalEventById(eventId)!, rig.session.snapshot()),
    });
    rig.button('supply:scubaSet').click();
    expect(rig.action).not.toHaveBeenCalled();
    rig.ui.hideFocusedEvent();

    rig.ui.setPaused(true);
    rig.button('supply:scubaSet').click();
    expect(rig.action).not.toHaveBeenCalled();
    rig.ui.setPaused(false);
    rig.button('supply:scubaSet').click();
    expect(rig.action).toHaveBeenCalledExactlyOnceWith('dive', undefined);
  });

  it('shows the energy limit instead of silently consuming a rejected dive', () => {
    const rig = fixture(eventId);
    rig.ui.render({ ...rig.session.snapshot(), energy: 2 }, (action) => (
      action === 'dive' ? 'Diving requires three energy.' : null
    ));
    const scuba = rig.button('supply:scubaSet');
    expect(scuba.getAttribute('aria-disabled')).toBe('true');
    expect(scuba.getAttribute('aria-description')).toContain('Diving requires three energy.');
    scuba.click();
    expect(rig.action).not.toHaveBeenCalled();
    expect(rig.eventItem).not.toHaveBeenCalled();
  });
});

it('keeps normal day commands blocked during a required event', () => {
  const rig = fixture('leak');
  rig.button('supply:scubaSet').click();
  rig.button('fishing-tools').click();
  expect(rig.action).not.toHaveBeenCalled();
});
