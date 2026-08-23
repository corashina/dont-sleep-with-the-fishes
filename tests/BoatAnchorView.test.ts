// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { DayActionId, SurvivalSnapshot } from '../src/survival/survivalTypes';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';
import { sequenceRandom } from './helpers/random';

const repairAnchor = (id = 'repair-tools', x = 320): BoatInteractionAnchor => ({
  id,
  itemType: null,
  toolId: 'repairTools',
  action: 'repair',
  remainingUses: null,
  x,
  y: 240,
  visible: true,
  depleted: false,
  hitArea: { width: 96, height: 52, depth: 2.4 },
});

const bucketAnchor = (id = 'bucket-1', x = 180): BoatInteractionAnchor => ({
  id,
  backingInstanceId: id as ItemInstanceId,
  itemType: 'bucket',
  toolId: null,
  action: null,
  remainingUses: 1,
  x,
  y: 210,
  visible: true,
  depleted: false,
});

const carlitosAnchor = (x = 860, y = 590): BoatInteractionAnchor => ({
  id: 'carlitos',
  backingInstanceId: 'carlitos-1' as ItemInstanceId,
  itemType: null,
  toolId: null,
  action: null,
  companionId: 'carlitos',
  label: 'CARLITOS',
  description: 'Check his hunger, happiness, and health.',
  remainingUses: null,
  x,
  y,
  visible: true,
  depleted: false,
});

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    ...new SurvivalSession([], {
      seed: 23,
      random: sequenceRandom([0.5]),
    }).snapshot(),
    ...overrides,
  };
}

function livingCarlitos(): NonNullable<SurvivalSnapshot['carlitos']> {
  return {
    alive: true,
    energy: 2,
    hunger: 4,
    sickness: 2,
    unhappiness: 5,
    pettedToday: false,
    deathCause: null,
  };
}

function mountView(): { readonly host: HTMLElement; readonly view: BoatAnchorView } {
  const host = document.createElement('main');
  host.className = 'survival-ui';
  document.body.append(host);
  const view = new BoatAnchorView(host);
  host.append(...view.roots);
  return { host, view };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('BoatAnchorView', () => {
  it('owns the exact anchor and Carlitos roots without a wrapper', () => {
    const { host, view } = mountView();

    expect([...host.children]).toEqual([view.anchorLayer, view.carlitosCard]);
    expect(view.anchorLayer.outerHTML)
      .toBe('<div class="boat-anchors" data-boat-anchors="" aria-label="Boat interaction points"></div>');
    expect(view.carlitosCard.getAttribute('aria-label')).toBe('Cat status');
    expect(view.carlitosCard.querySelectorAll('.carlitos-status')).toHaveLength(4);
  });

  it('keeps retained button identity and order while updating a stable anchor array', () => {
    const { view } = mountView();
    const anchors: BoatInteractionAnchor[] = [
      repairAnchor('first', 100),
      repairAnchor('retained', 200),
      repairAnchor('third', 300),
    ];
    view.setAnchors(anchors);
    const retained = view.anchorButton('retained')!;
    const removed = view.anchorButton('first')!;

    anchors.splice(0, 1);
    anchors[0] = repairAnchor('retained', 444);
    anchors.push(repairAnchor('new', 500));
    view.setAnchors(anchors);

    expect(view.anchorButton('retained')).toBe(retained);
    expect(retained.style.transform).toBe('translate(444px, 240px)');
    expect([...view.anchorLayer.children].map((button) => (
      (button as HTMLElement).dataset.anchorId
    ))).toEqual(['retained', 'third', 'new']);
    expect(removed.isConnected).toBe(false);

    anchors.push(repairAnchor('first', 600));
    view.setAnchors(anchors);
    expect(view.anchorButton('first')).not.toBe(removed);
  });

  it('preserves tooltips, unavailable reasons, hit areas, and unavailable focusability', () => {
    const { view } = mountView();
    const reasons = new Map<DayActionId, string | null>([
      ['repair', 'The hull needs no repair.'],
    ]);
    const unavailable = vi.fn();
    view.onUnavailableAction = unavailable;
    view.setAnchors([{ ...repairAnchor('repair-tools', 30), y: 50 }, bucketAnchor()]);
    view.render(snapshot({ hull: 100 }), reasons);

    const button = view.anchorButton('repair-tools')!;
    expect(button.style.width).toBe('96px');
    expect(button.style.height).toBe('52px');
    expect(button.dataset.tooltipX).toBe('left');
    expect(button.dataset.tooltipY).toBe('below');
    expect(view.anchorButton('bucket-1')!.style.width).toBe('54px');
    expect(view.anchorButton('bucket-1')!.style.height).toBe('54px');
    expect(button.querySelector('[role="tooltip"]')?.textContent).toBe('REPAIR');
    expect(button.getAttribute('aria-description')).toContain('UNAVAILABLE: The hull needs no repair.');
    expect(button.getAttribute('aria-description')).toContain('HULL +0');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.tabIndex).toBe(0);
    button.click();
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(
      'repair',
      'The hull needs no repair.',
    );
  });

  it('matches event state before item eligibility and preserves command and lab rules', () => {
    const { view } = mountView();
    const eventChoice = vi.fn();
    const eventItem = vi.fn();
    const action = vi.fn();
    view.onEventChoice = eventChoice;
    view.onEventItem = eventItem;
    view.onAction = action;
    view.render(snapshot({ energy: 3 }), new Map());
    view.setAnchors([
      { ...bucketAnchor(), eventChoiceId: 'retrieve' },
      {
        id: 'chest', itemType: null, toolId: 'chest', action: 'openChest',
        remainingUses: null, x: 500, y: 250, visible: true, depleted: false,
      },
    ]);
    view.beginEventPresentation();
    view.setEventSelection(
      new Map([['bucket-1' as ItemInstanceId, 'use-bucket']]),
      [{ id: 'retrieve', label: 'RETRIEVE', unavailableReason: null, anchorId: 'bucket-1' }],
    );

    const bucket = view.anchorButton('bucket-1')!;
    expect(bucket.dataset.eventChoice).toBe('retrieve');
    expect(bucket.dataset.eventState).toBe('available');
    bucket.click();
    expect(eventChoice).not.toHaveBeenCalled();
    expect(eventItem).toHaveBeenCalledWith('use-bucket', 'bucket-1');

    view.setItemAnimationLabActive(true);
    view.setEventSelection(new Map());
    const chest = view.anchorButton('chest')!;
    expect(chest.dataset.eventState).toBeUndefined();
    chest.click();
    expect(action).toHaveBeenCalledWith('openChest', chest);
  });

  it('publishes focused highlight over hover and clears removed highlights', () => {
    const { view } = mountView();
    const highlights: Array<string | null> = [];
    view.onHighlight = (id) => highlights.push(id);
    view.setAnchors([repairAnchor(), bucketAnchor()]);
    const repair = view.anchorButton('repair-tools')!;
    const bucket = view.anchorButton('bucket-1')!;

    repair.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    bucket.focus();
    repair.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    expect(highlights.at(-1)).toBe('bucket-1');

    view.setAnchors([repairAnchor()]);
    expect(highlights.at(-1)).toBeNull();
  });

  it('owns Carlitos card status, actions, placement, outside close, and death close', () => {
    const { host, view } = mountView();
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700,
      width: 1000, height: 700, toJSON: () => ({}),
    });
    vi.spyOn(view.carlitosCard, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 300,
      width: 300, height: 300, toJSON: () => ({}),
    });
    const action = vi.fn();
    view.onAction = action;
    const projectedCarlitos = carlitosAnchor();
    view.setAnchors([projectedCarlitos]);
    view.render(snapshot({ carlitos: livingCarlitos() }), new Map());
    const anchor = view.anchorButton('carlitos')!;

    anchor.click();
    expect(view.carlitosCard.hidden).toBe(false);
    expect(view.carlitosCard.dataset.placement).toBe('left');
    expect(view.carlitosCard.querySelector('[data-carlitos-hunger-label]')?.textContent)
      .toBe('PECKISH');
    expect(view.carlitosCard.querySelector('[data-carlitos-energy-label]')?.textContent)
      .toBe('2 / 3');
    expect(document.activeElement).toBe(
      view.carlitosCard.querySelector('[data-action="petCarlitos"]'),
    );
    (projectedCarlitos as { x: number }).x = 100;
    window.dispatchEvent(new Event('resize'));
    expect(view.carlitosCard.dataset.placement).toBe('right');
    view.carlitosCard.querySelector<HTMLButtonElement>('[data-action="petCarlitos"]')!.click();
    expect(action).toHaveBeenCalledWith('petCarlitos', expect.any(HTMLButtonElement));

    document.body.click();
    expect(view.carlitosCard.hidden).toBe(true);
    expect(document.activeElement).toBe(anchor);

    anchor.click();
    view.render(snapshot({ carlitos: { ...livingCarlitos(), alive: false } }), new Map());
    expect(view.carlitosCard.hidden).toBe(true);
  });

  it('blocks modal synthetic clicks and prevents handled keyboard defaults', () => {
    const { view } = mountView();
    const action = vi.fn();
    view.onAction = action;
    view.setAnchors([repairAnchor()]);
    view.render(snapshot(), new Map([['repair', null]]));
    const repair = view.anchorButton('repair-tools')!;
    view.setModalOpen(true);
    repair.click();
    expect(action).not.toHaveBeenCalled();

    view.setModalOpen(false);
    repair.click();
    expect(action).toHaveBeenCalledOnce();

    view.setAnchors([repairAnchor(), carlitosAnchor()]);
    view.render(snapshot({ carlitos: livingCarlitos() }), new Map([['repair', null]]));
    view.anchorButton('carlitos')!.click();
    expect(view.carlitosCard.hidden).toBe(false);
    view.setModalOpen(true);
    view.carlitosCard.querySelector<HTMLButtonElement>('[data-carlitos-close]')!.click();
    expect(view.carlitosCard.hidden).toBe(false);
    view.setModalOpen(false);

    view.beginEventPresentation();
    view.setEventSelection(new Map(), [
      { id: 'repair-choice', label: 'REPAIR', unavailableReason: null, anchorId: 'repair-tools' },
    ]);
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    Object.defineProperty(event, 'target', { value: repair });
    expect(view.handleCommandKeyDown(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('continues listener cleanup after the first disposal error and does not restore focus', () => {
    const { view } = mountView();
    const action = vi.fn();
    const highlights = vi.fn();
    view.onAction = action;
    view.onHighlight = highlights;
    view.setAnchors([repairAnchor()]);
    view.render(snapshot(), new Map([['repair', null]]));
    const repair = view.anchorButton('repair-tools')!;
    repair.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    const error = new Error('highlight cleanup failed');
    view.onHighlight = () => { throw error; };

    expect(() => view.dispose()).toThrow(error);
    expect(() => view.dispose()).not.toThrow();
    repair.click();
    expect(action).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(repair);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ] as const)('preserves a %s cleanup error and continues all cleanup', (_label, firstError) => {
    const { view } = mountView();
    const action = vi.fn();
    view.onAction = action;
    view.setAnchors([repairAnchor()]);
    view.render(snapshot(), new Map([['repair', null]]));
    const repair = view.anchorButton('repair-tools')!;
    repair.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    view.onHighlight = () => { throw firstError; };
    const internals = view as unknown as {
      readonly anchorLayouts: Map<string, unknown>;
    };
    const originalClear = internals.anchorLayouts.clear.bind(internals.anchorLayouts);
    const cacheClear = vi.spyOn(internals.anchorLayouts, 'clear').mockImplementation(() => {
      originalClear();
      throw new Error('later cache cleanup failed');
    });
    const listenerCleanup = vi.spyOn(view.anchorLayer, 'removeEventListener');
    const notThrown = Symbol('not thrown');
    let thrown: unknown = notThrown;

    try {
      view.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(firstError);
    expect(listenerCleanup).toHaveBeenCalled();
    expect(cacheClear).toHaveBeenCalledOnce();
    expect(internals.anchorLayouts.size).toBe(0);
    expect(() => view.onHighlight(null)).not.toThrow();
    view.onAction('repair', repair);
    expect(action).not.toHaveBeenCalled();
    expect(() => view.dispose()).not.toThrow();
    expect(cacheClear).toHaveBeenCalledOnce();
  });
});
