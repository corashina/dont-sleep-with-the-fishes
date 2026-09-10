// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects survival commands and access.

import { afterEach,describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ItemId,ItemInstance,ItemInstanceId } from '../src/game/ItemState';
import type { JournalEntry } from '../src/survival/journalRecords';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';
import type { SurvivalEventDefinition } from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';
import { setLanguage } from '../src/i18n/language';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';

const activeUIs: SurvivalUI[] = [];
const activeAnchorViews: BoatAnchorView[] = [];
const mainStyles = readFileSync('src/styles/main.css', 'utf8') as string;

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

const journalEntries: readonly JournalEntry[] = [1, 2].map((day) => ({
  day,
  weather: day === 1 ? 'calm' : 'overcast',
  nightWeather: 'calm',
  actions: [],
  daytime: null,
  nighttime: { kind: 'quiet' },
}));

afterEach(() => {
  activeAnchorViews.splice(0).forEach((view) => view.dispose());
  setLanguage('en');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  activeUIs.splice(0).forEach((ui) => ui.dispose());
  document.body.innerHTML = '';
});

describe('anchor frame caches', () => {
  function fixture() {
    const host = document.createElement('main');
    document.body.append(host);
    const bounds = vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ width: 1000 } as DOMRect);
    const view = new BoatAnchorView(host);
    host.append(...view.roots);
    activeAnchorViews.push(view);
    const anchor = {
      id: 'supply:cannedFood', itemType: 'cannedFood', toolId: null, action: 'eat',
      remainingUses: 1, backingInstanceId: 'cannedFood-1', quantity: 2,
      x: 400, y: 200, visible: true, depleted: false,
    } satisfies BoatInteractionAnchor;
    return { view, anchor, bounds };
  }

  it('moves a reused projection without rebuilding content and refreshes changed inputs', () => {
    const { view, anchor } = fixture();
    view.setAnchors([anchor]);
    const button = view.anchorButton(anchor.id)!;
    const attributes = vi.spyOn(button, 'setAttribute');
    anchor.x += 40;
    view.setAnchors([anchor]);
    expect(button.style.transform).toBe('translate(440px, 200px)');
    expect(attributes.mock.calls.filter(([name]) => name === 'aria-description')).toHaveLength(0);
    anchor.quantity = 3;
    view.setAnchors([anchor]);
    expect(button.getAttribute('aria-label')).toContain('×3');
    const english = button.getAttribute('aria-label');
    setLanguage('pl');
    expect(button.getAttribute('aria-label')).not.toBe(english);
    setLanguage('en');
    const session = new SurvivalSession(saved('cannedFood'), { seed: 19 });
    view.render(session.snapshot(), new Map([['eat', 'Cannot eat now.']]));
    expect(button.getAttribute('aria-description')).toContain('Cannot eat now.');
    view.beginEventPresentation();
    view.setEventSelection(new Map([['cannedFood-1', 'offer']]));
    expect(button.getAttribute('aria-description')).not.toContain('Cannot eat now.');
    expect(button.getAttribute('aria-disabled')).toBe('false');
    view.setEventUsing('cannedFood-1');
    expect(button.dataset.eventState).toBe('selected');
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('reads the viewport at construction and resize instead of per moving anchor', () => {
    const { view, anchor, bounds } = fixture();
    expect(bounds).toHaveBeenCalledTimes(1);
    const anchors = [anchor, { ...anchor, id: 'other', x: 500 }];
    view.setAnchors(anchors);
    anchor.x = 600;
    view.setAnchors(anchors);
    expect(bounds).toHaveBeenCalledTimes(1);
    bounds.mockReturnValue({ width: 700 } as DOMRect);
    window.dispatchEvent(new Event('resize'));
    expect(bounds).toHaveBeenCalledTimes(2);
    expect(view.anchorButton(anchor.id)!.dataset.tooltipX).toBe('right');
  });
});

function createUI(mount: HTMLElement): SurvivalUI {
  const ui = new SurvivalUI(mount);
  ui.setAnchors([
    { id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish', remainingUses: null, backingInstanceId: null, x: 90, y: 180, visible: true, depleted: false },
    { id: 'bucket-test', itemType: 'bucket', toolId: null, action: null, remainingUses: null, x: 140, y: 180, visible: true, depleted: false },
    { id: 'scubaSet-test', itemType: 'scubaSet', toolId: null, action: 'dive', remainingUses: null, x: 240, y: 250, visible: true, depleted: false },
    { id: 'cannedFood-test', itemType: 'cannedFood', toolId: null, action: 'eat', remainingUses: 1, x: 340, y: 300, visible: true, depleted: false },
    {
      id: 'repair-tools', itemType: null, toolId: 'repairTools', action: 'repair', remainingUses: null,
      backingInstanceId: null,
      x: 440, y: 280, visible: true, depleted: false,
      hitArea: { width: 96, height: 52, depth: 2.4 },
    },
    { id: 'medicalKit-test', itemType: 'medicalKit', toolId: null, action: 'treat', remainingUses: 2, x: 540, y: 250, visible: true, depleted: false },
    {
      id: 'end-day-pillow', itemType: null, toolId: 'pillow', action: 'endDay',
      remainingUses: null, x: 640, y: 280, visible: true, depleted: false,
      hitArea: { width: 62, height: 84, depth: 2.4 },
    },
  ]);
  activeUIs.push(ui);
  return ui;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    ...new SurvivalSession(saved('map'), {
      seed: 7,
      random: sequenceRandom([0.5]),
    }).snapshot(),
    ...overrides,
  };
}

function testEvent(itemIds: readonly ItemId[] = ['map']): SurvivalEventDefinition {
  const selected = itemIds.length > 0 ? itemIds : ['map'] as const;
  const eventChoice = (itemId: ItemId) => ({
    id: itemId,
    label: `Use ${itemId}`,
    itemId,
    outcomes: [{ weight: 1, message: 'Test result.', effects: {} }] as const,
  });
  const [first, ...rest] = selected;
  return {
    id: 'test',
    phase: 'day',
    title: 'A shadow',
    revealText: 'A shadow moves beneath the boat.',
    prompt: 'Something moves below.',
    danger: 'dangerous',
    earliestDay: 1,
    weight: 1,
    cooldownDays: 0,
    cue: 'impact',
    choices: [eventChoice(first!), ...rest.map(eventChoice)],
  };
}

function eventWithChoices(...choiceIds: readonly string[]): SurvivalEventDefinition {
  return {
    ...testEvent(),
    choices: choiceIds.map((id) => ({
      id,
      label: id === 'retrieve' ? 'RETRIEVE' : 'LEAVE IT',
      outcomes: [{ weight: 1, message: 'Test result.', effects: {} }],
    })) as unknown as SurvivalEventDefinition['choices'],
  };
}

function press(selector: string, key: string): void {
  document.querySelector<HTMLButtonElement>(selector)!.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  );
}

function openContextualEvent(ui: SurvivalUI): void {
  ui.beginEventPresentation();
  void ui.showEventReveal(eventWithChoices('retrieve', 'leave'));
  ui.setEventSelection(new Map(), [
    { id: 'retrieve', label: 'RETRIEVE', unavailableReason: null },
    { id: 'leave', label: 'LEAVE IT', unavailableReason: null },
  ]);
}

const carlitosAnchor = (x = 720, y = 360) => ({
  id: 'carlitos',
  backingInstanceId: 'carlitos-1' as ItemInstanceId,
  itemType: null,
  toolId: null,
  action: null,
  companionId: 'carlitos' as const,
  label: 'CARLITOS',
  description: 'Check his hunger, happiness, and health.',
  remainingUses: null,
  x,
  y,
  visible: true,
  depleted: false,
});

describe('SurvivalUI', () => {
  it('dismisses only the top popup and consumes the outside click', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.onPauseChange = (paused) => ui.setPaused(paused);
    const settled = vi.fn();
    const result = ui.showRewardResult({ title: 'DIVE RESULT', reward: null, lines: ['Nothing found.'] });
    void result.then(settled);
    const popup = mount.querySelector<HTMLElement>('[data-dive-result]')!;
    popup.querySelector<HTMLElement>('.dive-result__paper')!.click();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    ui.setPaused(true);
    mount.querySelector<HTMLElement>('[data-pause]')!.click();
    expect(mount.querySelector('[data-pause]')!.classList.contains('is-visible')).toBe(false);
    expect(popup.hasAttribute('inert')).toBe(false);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    const background = document.createElement('button');
    const backgroundAction = vi.fn();
    background.addEventListener('click', backgroundAction);
    mount.append(background);
    background.click();
    await result;
    expect(settled).toHaveBeenCalledOnce();
    expect(backgroundAction).not.toHaveBeenCalled();
    expect(popup.classList.contains('is-visible')).toBe(false);
  });

  it('restamps accessible meter values after a covered transition', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const changed = snapshot({ health: 60, energy: 0 });
    ui.render(changed, () => null);
    const health = mount.querySelector<HTMLElement>('[data-meter="health"]')!;
    const energy = mount.querySelector<HTMLElement>('[data-meter="energy"]')!;
    const observer = new MutationObserver(() => undefined);
    observer.observe(mount, {
      attributes: true,
      attributeFilter: ['aria-valuemax', 'aria-valuenow', 'aria-valuetext'],
      subtree: true,
    });

    ui.render(changed, () => null);

    const records = observer.takeRecords();
    observer.disconnect();
    expect(records.some(({ target, attributeName }) => (
      target === health && attributeName === 'aria-valuenow'
    ))).toBe(true);
    expect(records.some(({ target, attributeName }) => (
      target === energy && attributeName === 'aria-valuenow'
    ))).toBe(true);
    expect(health.getAttribute('aria-valuenow')).toBe('60');
    expect(energy.getAttribute('aria-valuenow')).toBe('0');
  });

  it('supports Carlitos pointer, keyboard, dismissal, focus, and action flows', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    const radioPause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
    ui.onRadioPauseChange = radioPause;
    ui.setAnchors([carlitosAnchor(1000, 760)]);
    ui.render(snapshot({
      carlitos: {

        energy: 3,
        hunger: 3,
        unhappiness: 3,
        pettedToday: false,

      },
    }), () => null);

    const anchor = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="carlitos"]',
    )!;
    const card = mount.querySelector<HTMLElement>('[data-carlitos-card]')!;
    anchor.click();
    expect(card.hidden).toBe(false);
    expect(radioPause).toHaveBeenLastCalledWith(true);
    anchor.click();
    expect(card.hidden).toBe(true);
    expect(radioPause).toHaveBeenLastCalledWith(false);
    anchor.click();
    expect(card.hidden).toBe(false);
    expect(Number.parseFloat(card.style.getPropertyValue('--carlitos-card-x'))).toBeGreaterThanOrEqual(16);
    expect(Number.parseFloat(card.style.getPropertyValue('--carlitos-card-y'))).toBeGreaterThanOrEqual(16);
    card.querySelector<HTMLButtonElement>('[data-action="petCarlitos"]')!.click();
    card.querySelector<HTMLButtonElement>('[data-action="feedCarlitos"]')!.click();
    expect(action.mock.calls).toEqual([
      ['petCarlitos', undefined],
      ['feedCarlitos', undefined],
    ]);

    card.querySelector<HTMLButtonElement>('[data-carlitos-close]')!.click();
    expect(card.hidden).toBe(true);
    expect(document.activeElement).toBe(anchor);

    press('[data-anchor-id="carlitos"]', ' ');
    expect(card.hidden).toBe(false);
    press('[data-anchor-id="carlitos"]', ' ');
    expect(card.hidden).toBe(true);
    press('[data-anchor-id="carlitos"]', ' ');
    expect(card.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card.hidden).toBe(true);
    expect(pause).not.toHaveBeenCalled();

    anchor.click();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(card.hidden).toBe(true);

    anchor.click();
    ui.beginEventPresentation();
    expect(card.hidden).toBe(true);
    ui.clearEventPresentation();

    anchor.click();
    ui.setPaused(true);
    expect(card.hidden).toBe(true);
    ui.setPaused(false);

    anchor.click();
    ui.setAnchors([]);
    expect(card.hidden).toBe(true);
    expect(document.activeElement).not.toBe(anchor);
  });

  it.each(['click', 'Enter', ' '] as const)(
    'keeps a Handyman item trade separate from the nearby Hand for %s activation',
    (activation) => {
      const mount = document.createElement('main');
      document.body.append(mount);
      const ui = createUI(mount);
      const onEventItem = vi.fn();
      const onEventChoice = vi.fn();
      ui.onEventItem = onEventItem;
      ui.onEventChoice = onEventChoice;
      ui.render(new SurvivalSession(saved('swimRing'), { seed: 3 }).snapshot(), () => null);
      ui.setAnchors([
        {
          id: 'supply:swimRing', itemType: 'swimRing', supplyGroupId: 'swimRing',
          backingInstanceId: 'swimRing-1', toolId: null, action: null, remainingUses: null,
          quantity: 1, x: 240, y: 180, visible: true, depleted: false,
          hitArea: { width: 60, height: 60, depth: 2 },
        },
        {
          id: 'handyman:hand', itemType: null, toolId: null, action: null,
          eventChoiceId: 'touch', label: 'HAND', tooltip: false, remainingUses: null,
          x: 260, y: 180, visible: true, depleted: false,
          hitArea: { width: 80, height: 80, depth: 3 },
        },
      ]);
      ui.beginEventPresentation();
      ui.setEventSelection(new Map([['swimRing-1', 'swimRing']]), [{
        id: 'touch', label: 'Touch the Hand', unavailableReason: null, anchorId: 'handyman:hand',
      }]);
      const ring = mount.querySelector<HTMLButtonElement>('[data-anchor-id="supply:swimRing"]')!;
      const hand = mount.querySelector<HTMLButtonElement>('[data-anchor-id="handyman:hand"]')!;
      expect(ring.getAttribute('aria-disabled')).toBe('false');
      expect(Number(ring.style.zIndex)).toBeGreaterThan(Number(hand.style.zIndex));

      if (activation === 'click') ring.querySelector<HTMLElement>('[role="tooltip"]')!.click();
      else {
        ring.focus();
        press('[data-anchor-id="supply:swimRing"]', activation);
      }

      expect(onEventItem).toHaveBeenCalledExactlyOnceWith('swimRing', 'swimRing-1');
      expect(onEventChoice).not.toHaveBeenCalled();
    },
  );

  it('keeps event targets above overlapping inventory targets', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setAnchors([
      {
        id: 'shotgun-overlap',
        itemType: 'shotgun',
        toolId: null,
        action: null,
        remainingUses: 1,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 40, height: 40, depth: 1 },
      },
      {
        id: 'event:drifting-supplies',
        eventFocusId: 'drifting-supplies',
        itemType: null,
        toolId: null,
        action: null,
        remainingUses: null,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 40, height: 40, depth: 2 },
      },
    ]);

    const shotgun = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="shotgun-overlap"]',
    )!;
    const event = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="event:drifting-supplies"]',
    )!;

    expect(Number(event.style.zIndex)).toBeGreaterThan(Number(shotgun.style.zIndex));
  });

  it('keeps routine tools above overlapping passive supplies', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setAnchors([
      {
        id: 'bait-overlap',
        itemType: 'baitTin',
        toolId: null,
        action: null,
        remainingUses: 2,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 50, height: 36, depth: 1 },
      },
      {
        id: 'fishing-overlap',
        itemType: null,
        toolId: 'fishingRod',
        action: 'fish',
        remainingUses: null,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 44, height: 181, depth: 3 },
      },
    ]);

    const bait = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bait-overlap"]')!;
    const fishing = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-overlap"]')!;

    expect(Number(fishing.style.zIndex)).toBeGreaterThan(Number(bait.style.zIndex));
  });

  it('keeps actionable supplies above overlapping routine tools', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setAnchors([
      {
        id: 'food-overlap',
        itemType: 'cannedFood',
        toolId: null,
        action: 'eat',
        remainingUses: 1,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 50, height: 50, depth: 3 },
      },
      {
        id: 'fishing-overlap',
        itemType: null,
        toolId: 'fishingRod',
        action: 'fish',
        remainingUses: null,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 44, height: 181, depth: 1 },
      },
    ]);

    const food = mount.querySelector<HTMLButtonElement>('[data-anchor-id="food-overlap"]')!;
    const fishing = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-overlap"]')!;

    expect(Number(food.style.zIndex)).toBeGreaterThan(Number(fishing.style.zIndex));
  });

  it('keeps an available Island choice above overlapping unavailable items', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setAnchors([
      {
        id: 'shotgun-overlap',
        itemType: 'shotgun',
        toolId: null,
        action: null,
        remainingUses: 1,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 40, height: 40, depth: 1 },
      },
      {
        id: 'midnight-tour:island',
        eventChoiceId: 'visit',
        itemType: null,
        toolId: null,
        action: null,
        remainingUses: null,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 96, height: 78, depth: 3 },
      },
    ]);
    ui.beginEventPresentation();
    ui.setEventSelection(new Map(), [{
      id: 'visit',
      label: 'Visit the island',
      unavailableReason: null,
      anchorId: 'midnight-tour:island',
    }]);

    const shotgun = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="shotgun-overlap"]',
    )!;
    const island = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="midnight-tour:island"]',
    )!;

    expect(shotgun.dataset.eventState).toBe('unavailable');
    expect(island.dataset.eventState).toBe('available');
    expect(Number(island.style.zIndex)).toBeGreaterThan(Number(shotgun.style.zIndex));
    ui.setEventSelection(new Map(), [{
      id: 'visit', label: 'Visit island', unavailableReason: null,
    }, {
      id: 'sleep', label: 'Skip island', unavailableReason: null,
    }]);
    expect(island.getAttribute('aria-disabled')).toBe('true');
  });

  it('cycles overlapping boat items with the wheel and arrow keys', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    ui.setAnchors([
      {
        id: 'bucket-overlap',
        itemType: 'bucket',
        toolId: null,
        action: null,
        remainingUses: null,
        x: 300,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 40, height: 40, depth: 1 },
      },
      {
        id: 'scuba-overlap',
        itemType: 'scubaSet',
        toolId: null,
        action: 'dive',
        remainingUses: null,
        x: 310,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 40, height: 40, depth: 2 },
      },
      {
        id: 'map-clear',
        itemType: 'map',
        toolId: null,
        action: null,
        remainingUses: null,
        x: 500,
        y: 220,
        visible: true,
        depleted: false,
        hitArea: { width: 40, height: 40, depth: 1 },
      },
    ]);

    const bucket = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="bucket-overlap"]',
    )!;
    const scuba = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="scuba-overlap"]',
    )!;
    const map = mount.querySelector<HTMLButtonElement>('[data-anchor-id="map-clear"]')!;

    expect(bucket.dataset.overlapCount).toBe('2');
    expect(scuba.dataset.overlapCount).toBe('2');
    expect(map.dataset.overlapCount).toBeUndefined();
    expect(bucket.getAttribute('aria-keyshortcuts')).toBe('ArrowLeft ArrowRight');
    expect(bucket.querySelector('[data-overlap-cycle]')).toBeNull();
    const scubaDepth = scuba.style.zIndex;

    bucket.focus();
    press('[data-anchor-id="bucket-overlap"]', 'ArrowRight');

    expect(document.activeElement).toBe(scuba);
    expect(Number(scuba.style.zIndex)).toBeGreaterThan(Number(bucket.style.zIndex));
    expect(highlight).toHaveBeenLastCalledWith('scuba-overlap');

    scuba.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 1,
    }));

    expect(document.activeElement).toBe(bucket);
    expect(Number(bucket.style.zIndex)).toBeGreaterThan(Number(scuba.style.zIndex));
    expect(scuba.style.zIndex).toBe(scubaDepth);
    expect(highlight).toHaveBeenLastCalledWith('bucket-overlap');
  });

  it.each(['Enter', ' '] as const)(
    'activates an eligible aggregate item anchor with %s',
    (key) => {
      const mount = document.createElement('main');
      document.body.append(mount);
      const ui = createUI(mount);
      const onEventItem = vi.fn();
      const backingInstanceId = 'flashlight-2' as ItemInstanceId;
      ui.onEventItem = onEventItem;
      ui.render(new SurvivalSession(saved('flashlight', 'flashlight'), {
        seed: 3,
      }).snapshot(), () => null);
      ui.setAnchors([{
        id: 'supply:flashlight',
        itemType: 'flashlight',
        supplyGroupId: 'flashlight',
        toolId: null,
        action: null,
        remainingUses: null,
        quantity: 2,
        usableQuantity: 2,
        brokenQuantity: 0,
        backingInstanceId,
        x: 240,
        y: 180,
        visible: true,
        depleted: false,
      }]);
      ui.beginEventPresentation();
      ui.setEventSelection(new Map([[backingInstanceId, 'flashlight']]));
      const anchor = mount.querySelector<HTMLButtonElement>(
        '[data-anchor-id="supply:flashlight"]',
      )!;

      expect(anchor.dataset.backingInstanceId).toBe(backingInstanceId);
      expect(anchor.getAttribute('aria-disabled')).toBe('false');
      anchor.focus();
      press('[data-anchor-id="supply:flashlight"]', key);

      expect(onEventItem).toHaveBeenCalledExactlyOnceWith(
        'flashlight',
        backingInstanceId,
      );
    },
  );

  it('guards aggregate item keyboard activation when ineligible, busy, or selected', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventItem = vi.fn();
    const backingInstanceId = 'baitTin-2' as ItemInstanceId;
    ui.onEventItem = onEventItem;
    ui.render(new SurvivalSession(saved('baitTin', 'baitTin'), {
      seed: 3,
    }).snapshot(), () => null);
    ui.setAnchors([{
      id: 'supply:baitTin',
      itemType: 'baitTin',
      supplyGroupId: 'baitTin',
      toolId: null,
      action: null,
      remainingUses: null,
      quantity: 2,
      usableQuantity: 2,
      brokenQuantity: 0,
      backingInstanceId,
      x: 240,
      y: 180,
      visible: true,
      depleted: false,
    }]);
    ui.beginEventPresentation();

    ui.setEventSelection(new Map([['baitTin-1', 'baitTin']]));
    press('[data-anchor-id="supply:baitTin"]', 'Enter');

    ui.setEventSelection(new Map([[backingInstanceId, 'baitTin']]));
    ui.setBusy(true);
    press('[data-anchor-id="supply:baitTin"]', 'Enter');

    ui.setBusy(false);
    ui.setEventUsing(backingInstanceId);
    press('[data-anchor-id="supply:baitTin"]', ' ');

    expect(onEventItem).not.toHaveBeenCalled();
  });

  it.each(['pointer', 'keyboard'] as const)(
    'shows a distinct selected keyed response for %s activation',
    async (input) => {
      vi.useFakeTimers();
      const mount = document.createElement('main');
      document.body.append(mount);
      const ui = createUI(mount);
      openContextualEvent(ui);
      ui.onEventChoice = (choiceId) => {
        ui.setBusy(true);
        void ui.playEventChoiceBeat(choiceId);
      };
      const choice = mount.querySelector<HTMLButtonElement>('[data-event-choice="retrieve"]')!;

      if (input === 'pointer') choice.click();
      else {
        choice.focus();
        press('[data-event-choice="retrieve"]', 'Enter');
      }

      expect(choice.dataset.eventState).toBe('selected');
      expect(choice.getAttribute('aria-pressed')).toBe('true');
      expect(choice.getAttribute('aria-disabled')).toBe('true');
      await vi.runAllTimersAsync();
    },
  );

  it('settles and clears an active contextual press beat during lifecycle cleanup', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    openContextualEvent(ui);

    const beat = ui.playEventChoiceBeat('retrieve');
    ui.clearEventPresentation();
    await beat;

    expect(mount.querySelector('[data-event-choice]')).toBeNull();
    expect(mount.querySelector<HTMLElement>('[data-event-choices]')?.hidden).toBe(true);
  });

  it('supersedes an event outcome hold without leaving its timer active', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = createUI(mount);

    let firstSettled = false;
    void ui.holdEventOutcome().then(() => { firstSettled = true; });
    expect(vi.getTimerCount()).toBe(1);
    let replacementSettled = false;
    const replacement = ui.holdEventOutcome().then(() => { replacementSettled = true; });

    await Promise.resolve();
    expect(firstSettled).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(replacementSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await replacement;
    expect(replacementSettled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    ui.dispose();
  });

  it('keeps unavailable contextual choices focusable while explaining and suppressing them', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventChoice = vi.fn();
    ui.onEventChoice = onEventChoice;
    ui.beginEventPresentation();
    void ui.showEventReveal(eventWithChoices('retrieve'));
    ui.setEventSelection(new Map(), [
      { id: 'retrieve', label: 'RETRIEVE', unavailableReason: 'The crate is out of reach.' },
    ]);

    const choice = mount.querySelector<HTMLButtonElement>('[data-event-choice="retrieve"]')!;
    expect(choice.disabled).toBe(false);
    expect(choice.getAttribute('aria-disabled')).toBe('true');
    expect(choice.getAttribute('aria-description')).toBe('The crate is out of reach.');
    expect(choice.textContent).toContain('The crate is out of reach.');
    choice.focus();
    expect(document.activeElement).toBe(choice);
    choice.click();
    press('[data-event-choice="retrieve"]', ' ');
    expect(onEventChoice).not.toHaveBeenCalled();
  });

  it('chooses only broken repairable instance targets with a discriminated option', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const state = new SurvivalSession(saved('ductTape', 'bucket', 'flashlight', 'compass'), {
      seed: 2,
      initialConditions: { 'bucket-2': 'broken', 'compass-4': 'broken' },
    }).snapshot();
    const action = vi.fn();
    ui.onAction = action;
    ui.render(state, () => null);
    ui.setAnchors([{ id: 'ductTape-1', itemType: 'ductTape', toolId: null, action: 'repairItem', remainingUses: 1, x: 100, y: 100, visible: true, depleted: false }]);
    mount.querySelector<HTMLButtonElement>('[data-action="repairItem"]')!.click();
    const dialog = mount.querySelector<HTMLElement>('[data-repair-options]')!;
    expect(dialog.classList).toContain('routine-dialog');
    expect(dialog.classList).not.toContain('survival-overlay');
    expect(dialog.classList).not.toContain('cinematic-overlay');
    expect(dialog.dataset.anchorState).toBe('fallback');
    ui.setAnchors([
      { id: 'ductTape-1', itemType: 'ductTape', toolId: null, action: 'repairItem', remainingUses: 1, x: 100, y: 100, visible: true, depleted: false },
      {
        id: 'repair-tools',
        itemType: null,
        toolId: 'repairTools',
        action: 'repair',
        remainingUses: null,
        x: 900,
        y: 420,
        visible: true,
        depleted: false,
        hitArea: { width: 72, height: 64, depth: 2 },
      },
    ]);
    expect(mount.querySelector('[data-repair-options]')).toBe(dialog);
    expect(dialog.dataset.anchorState).toBe('projected');
    expect(dialog.dataset.placement).toBe('left');
    const targets = [...mount.querySelectorAll<HTMLButtonElement>('[data-repair-target]')];
    expect(targets.map(({ dataset }) => dataset.repairTarget)).toEqual(['bucket-2', 'compass-4']);
    expect([...mount.querySelectorAll<HTMLButtonElement>('[data-discard-target]')]
      .map(({ dataset }) => dataset.discardTarget)).toEqual(['bucket-2', 'compass-4']);
    const thumbnail = targets[0]!.querySelector<HTMLImageElement>('img')!;
    expect(thumbnail.src).toContain('/bucket.png');
    expect(targets[0]!.getAttribute('aria-label')).toBe('BUCKET — BROKEN');
    setLanguage('pl');
    expect(targets[0]!.querySelector('img')).toBe(thumbnail);
    expect(targets[0]!.getAttribute('aria-label')).toContain('WIADRO');
    expect(targets[0]!.title).toBe(targets[0]!.getAttribute('aria-label'));
    setLanguage('en');
    thumbnail.click();
    expect(action).toHaveBeenCalledWith('repairItem', { kind: 'itemRepair', target: 'bucket-2' });
    expect(dialog.classList.contains('is-visible')).toBe(false);
    action.mockClear();
    ui.openRepairOptions();
    mount.querySelector<HTMLButtonElement>('[data-repair-cancel]')!.click();
    expect(dialog.classList.contains('is-visible')).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('opens broken item actions without tape and dispatches discard for that instance', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);
    const instanceId = 'bucket-1' as ItemInstanceId;
    const state = new SurvivalSession(saved('bucket'), {
      seed: 1,
      initialConditions: { [instanceId]: 'broken' as const },
    }).snapshot();
    const action = vi.fn();
    ui.onAction = action;
    ui.render(state, (id) => id === 'repairItem' ? 'No Duct Tape remains.' : null);
    ui.setAnchors([{
      id: instanceId, itemType: 'bucket', toolId: null, action: null, remainingUses: 0,
      quantity: 1, usableQuantity: 0, brokenQuantity: 1,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const anchor = mount.querySelector<HTMLButtonElement>(`[data-anchor-id="${instanceId}"]`)!;
    expect(anchor.getAttribute('aria-disabled')).toBe('false');
    expect(anchor.getAttribute('aria-description')).toContain('Choose Repair or Discard.');
    anchor.click();

    const dialog = mount.querySelector<HTMLElement>('[data-repair-options]')!;
    expect(dialog.classList).toContain('is-visible');
    const repair = dialog.querySelector<HTMLButtonElement>('[data-repair-target]')!;
    expect(repair.getAttribute('aria-disabled')).toBe('true');
    expect(repair.disabled).toBe(false);
    expect(dialog.querySelector('[data-repair-unavailable]')?.textContent)
      .toBe('Repair unavailable: No Duct Tape remains.');
    repair.click();
    expect(action).not.toHaveBeenCalled();

    dialog.querySelector<HTMLButtonElement>('[data-discard-target]')!.click();
    expect(action).toHaveBeenCalledWith('discardItem', { kind: 'itemDiscard', target: instanceId });
    expect(dialog.classList).not.toContain('is-visible');
  });

  it('shows event feedback and routes only eligible physical anchors', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);
    const state = new SurvivalSession(saved('bucket', 'umbrella'), { seed: 3 }).snapshot();
    ui.render(state, () => null);
    ui.setAnchors([
      { id: 'bucket-1', itemType: 'bucket', toolId: null, action: null, remainingUses: null, x: 140, y: 180, visible: true, depleted: false },
      { id: 'umbrella-2', itemType: 'umbrella', toolId: null, action: null, remainingUses: null, x: 240, y: 180, visible: true, depleted: false },
      { id: 'end-day-pillow', itemType: null, toolId: 'pillow', action: 'endDay', remainingUses: null, x: 640, y: 280, visible: true, depleted: false },
    ]);
    const selected = vi.fn();
    ui.onEventItem = selected;

    ui.beginEventPresentation();
    expect(mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')?.hidden).toBe(false);
    expect(mount.querySelector('[data-action="endDay"]')?.getAttribute('aria-disabled')).toBe('true');
    const reveal = ui.showEventReveal(testEvent(['bucket']));
    await vi.runAllTimersAsync();
    await reveal;
    expect(mount.querySelector('[data-event]')).toBeNull();
    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.querySelector<HTMLElement>('[data-event-title]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect(caption.querySelector<HTMLElement>('[data-event-risk]')?.hidden).toBe(true);
    expect(caption.querySelector<HTMLElement>('[data-event-detail]')?.hidden).toBe(true);
    expect(caption.dataset.danger).toBe('dangerous');
    expect(caption.classList).not.toContain('is-visible');
    expect(caption.getAttribute('aria-label')).toBeNull();
    await Promise.resolve();
    expect(mount.querySelector('[data-survival-announcer]')?.textContent).toBe(
      'Dangerous event. A shadow moves beneath the boat.',
    );

    ui.setEventSelection(new Map([['bucket-1', 'bucket']]));
    expect(caption.classList).not.toContain('is-visible');
    const bucket = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-1"]')!;
    const umbrella = mount.querySelector<HTMLButtonElement>('[data-anchor-id="umbrella-2"]')!;
    expect(bucket.dataset.eventState).toBe('available');
    expect(bucket.getAttribute('aria-disabled')).toBe('false');
    expect(bucket.querySelector('[role="tooltip"]')?.textContent).toBe('BUCKET');
    expect(umbrella.dataset.eventState).toBe('unavailable');
    expect(umbrella.disabled).toBe(false);
    expect(umbrella.tabIndex).toBe(0);
    expect(umbrella.querySelector('[role="tooltip"]')?.textContent).toBe('UMBRELLA');

    umbrella.click();
    expect(selected).not.toHaveBeenCalled();
    bucket.click();
    expect(selected).toHaveBeenCalledWith('bucket', 'bucket-1');

    ui.setEventSelection(new Map());
    expect(mount.querySelector('[data-endure]')).toBeNull();

    ui.clearEventPresentation();
    expect(mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')?.hidden).toBe(false);
    expect(mount.querySelector('[data-action="endDay"]')?.getAttribute('aria-disabled')).toBe('false');
  });

  it('does not rewrite anchor layout for equal rounded values', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const anchor = {
      id: 'repair-tools',
      itemType: null,
      toolId: 'repairTools' as const,
      action: 'repair' as const,
      remainingUses: null,
      x: 440.1,
      y: 280.1,
      visible: true,
      depleted: false,
      hitArea: { width: 96.1, height: 52.1, depth: 2.4 },
    };
    ui.setAnchors([anchor]);
    const button = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="repair-tools"]',
    )!;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(button, {
      attributes: true,
      attributeFilter: ['style', 'hidden', 'data-target-kind', 'class'],
    });

    ui.setAnchors([{
      ...anchor,
      x: 440.2,
      y: 280.2,
      hitArea: { width: 96.2, height: 52.2, depth: 2.4 },
    }]);
    await Promise.resolve();

    expect(mutations).toEqual([]);
    observer.disconnect();
  });

  it('restores focus to the marker after manual Escape closes the journal', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const marker = mount.querySelector<HTMLButtonElement>('[data-journal-open]')!;
    ui.onJournalClose = () => ui.hideJournal();
    marker.focus();
    ui.showJournal(journalEntries);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(marker);
    expect(mount.querySelector('[data-journal]')?.hasAttribute('inert')).toBe(true);
  });

  it('locks ordinary anchors until event choices become available', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setAnchors([
      {
        id: 'bucket-1',
        itemType: 'bucket',
        toolId: null,
        action: null,
        remainingUses: null,
        x: 140,
        y: 180,
        visible: true,
        depleted: false,
      },
      {
        id: 'end-day-pillow',
        itemType: null,
        toolId: 'pillow',
        action: 'endDay',
        remainingUses: null,
        x: 640,
        y: 280,
        visible: true,
        depleted: false,
      },
      {
        id: 'scubaSet-1',
        itemType: 'scubaSet',
        toolId: null,
        action: 'dive',
        remainingUses: null,
        x: 240,
        y: 250,
        visible: true,
        depleted: false,
      },
      {
        id: 'repair-tools',
        itemType: null,
        toolId: 'repairTools',
        action: 'repair',
        remainingUses: null,
        x: 440,
        y: 280,
        visible: true,
        depleted: false,
      },
    ]);
    ui.render(snapshot(), () => null);

    const bucket = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-1"]')!;
    const pillow = mount.querySelector<HTMLButtonElement>('[data-anchor-id="end-day-pillow"]')!;
    const scuba = mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-1"]')!;
    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;

    ui.beginEventPresentation();

    expect(bucket.dataset.eventState).toBe('locked');
    expect(bucket.disabled).toBe(true);
    expect(bucket.tabIndex).toBe(-1);
    expect(pillow.dataset.eventState).toBe('locked');
    expect(pillow.disabled).toBe(true);
    expect(repair.dataset.eventState).toBe('locked');
    expect(repair.disabled).toBe(true);

    bucket.focus();
    expect(document.activeElement).not.toBe(bucket);

    ui.setEventSelection(new Map([['bucket-1', 'bucket'] as const]));

    expect(bucket.dataset.eventState).toBe('available');
    expect(bucket.disabled).toBe(false);
    expect(bucket.tabIndex).toBe(0);
    expect(scuba.dataset.eventState).toBe('unavailable');
    expect(scuba.disabled).toBe(false);
    expect(scuba.tabIndex).toBe(0);
    expect(scuba.getAttribute('aria-disabled')).toBe('true');
    expect(scuba.querySelector('.boat-tooltip')?.textContent).toContain('SCUBA');
    expect(pillow.dataset.eventState).toBe('locked');
    expect(repair.dataset.eventState).toBe('locked');
  });

  it('keeps unavailable anchors focusable and suppresses their commands', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const onAction = vi.fn();
    ui.onAction = onAction;
    ui.render(snapshot(), (action) => action === 'fish' ? 'Fishing is unavailable in this weather.' : null);
    ui.setAnchors([{
      id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const button = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(onAction).not.toHaveBeenCalled();
  });

  it.each(['bucket', 'flashlight'] as const)('keeps broken %s inspectable and exposes its item actions', (itemType) => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const instanceId = `${itemType}-1` as ItemInstanceId;
    const state = new SurvivalSession(saved(itemType), {
      seed: 1,
      initialConditions: { [instanceId]: 'broken' as const },
    }).snapshot();
    ui.render(state, () => null);
    ui.setAnchors([{
      id: instanceId, itemType, toolId: null, action: null, remainingUses: 0,
      quantity: 1, usableQuantity: 0, brokenQuantity: 1,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const broken = mount.querySelector<HTMLButtonElement>(`[data-anchor-id="${instanceId}"]`)!;
    expect(broken.disabled).toBe(false);
    expect(broken.getAttribute('aria-disabled')).toBe('false');
    expect(broken.querySelector('[role="tooltip"]')?.textContent).toBe(`${itemType.toUpperCase()} — BROKEN`);
    expect(broken.getAttribute('aria-description')).toContain('BROKEN');
    expect(broken.getAttribute('aria-description')).toContain('Choose Repair or Discard.');
    expect(broken.dataset.condition).toBe('broken');
    broken.focus();
    expect(document.activeElement).toBe(broken);
  });

  it('uses the authored sleep-cover duration while preserving supersession and disposal', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);
    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;

    let firstSettled = false;
    const first = ui.setSleepCovered(true);
    void first.then(() => { firstSettled = true; });
    expect(cover.classList).toContain('is-covered');
    await vi.advanceTimersByTimeAsync(2_499);
    expect(firstSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await first;

    const second = ui.setSleepCovered(false);
    expect(cover.classList).not.toContain('is-covered');
    const replacement = ui.setSleepCovered(true);
    await second;
    await vi.advanceTimersByTimeAsync(2_500);
    await replacement;

    const pendingAtDispose = ui.setSleepCovered(true);
    ui.dispose();
    await pendingAtDispose;
    expect(mainStyles).toMatch(/\.sleep-cover\s*\{[^}]*transition:\s*opacity 2\.5s/s);
    expect(mainStyles).not.toMatch(/prefers-reduced[-]motion/);
  });

  it('keeps a covered scene pending for two browser frames', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    let settled = false;

    const pending = ui.settleCoveredScene();
    void pending.then(() => { settled = true; });
    expect(requestFrame).toHaveBeenCalledTimes(1);

    callbacks.shift()!(16);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(requestFrame).toHaveBeenCalledTimes(2);

    callbacks.shift()!(32);
    await pending;
    expect(settled).toBe(true);
    expect(cancelFrame).not.toHaveBeenCalled();
  });

  it('paints the instant attack blackout before allowing scene cleanup', async () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callbacks.push(callback));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const mount = document.createElement('main');
    const ui = createUI(mount);
    await ui.setSleepCoverProfile('midnight-attack');
    let settled = false;
    const pending = ui.setSleepCovered(true);
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mount.querySelector('[data-sleep-cover]')!.classList).toContain('is-covered');
    callbacks.shift()!(16);
    await Promise.resolve();
    expect(settled).toBe(false);
    callbacks.shift()!(32);
    await pending;
    expect(settled).toBe(true);
  });

  it('holds the bite blackout for three seconds and releases its timer on disposal', async () => {
    vi.useFakeTimers();
    const ui = createUI(document.createElement('main'));
    let settled = false;
    const hold = ui.holdSleep(3_000);
    void hold.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await hold;
    const cancelled = ui.holdSleep(3_000);
    ui.dispose();
    await cancelled;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles superseded and disposed covered-scene waits without stale frames', async () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    const cancelFrame = vi.fn((handle: number) => { callbacks.delete(handle); });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);

    const first = ui.settleCoveredScene();
    const second = ui.settleCoveredScene();
    await first;
    expect(cancelFrame).toHaveBeenCalledWith(1);

    ui.dispose();
    await second;
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(callbacks.size).toBe(0);
  });

  it('rearms aiming after a rejected cast but keeps a synchronously accepted cast gated', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const acceptedResults = [false, true];
    const cast = vi.fn(() => acceptedResults.shift() ?? true);
    ui.onFishingCast = cast;
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({
      x: 20, y: 30, left: 20, top: 30, right: 820, bottom: 630,
      width: 800, height: 600,
      toJSON: () => ({}),
    });
    const layer = mount.querySelector<HTMLElement>('[data-fishing]')!;
    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });

    layer.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 80, clientY: 90 }));
    layer.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 180, clientY: 190 }));
    layer.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 280, clientY: 290 }));

    expect(cast.mock.calls).toEqual([
      [{ x: 60, y: 60 }],
      [{ x: 160, y: 160 }],
    ]);
  });

  it('maps Enter and Space to centered casts or reels only in their matching modes', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const cast = vi.fn();
    const reel = vi.fn(() => true);
    ui.onFishingCast = cast;
    ui.onFishingReel = reel;

    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
    expect(cast).toHaveBeenCalledOnce();
    expect(cast).toHaveBeenCalledWith(null);

    ui.setFishingState({ mode: 'waiting', message: 'WAIT FOR A BITE', biteTarget: null });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    ui.setFishingState({ mode: 'result', message: 'IT GOT AWAY', biteTarget: null });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(cast).toHaveBeenCalledOnce();
    expect(reel).not.toHaveBeenCalled();

    ui.setFishingState({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true },
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(reel).toHaveBeenCalledOnce();
  });

  it('focuses and repositions the urgent bite target without duplicate reel intents', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const reel = vi.fn(() => true);
    ui.onFishingReel = reel;
    const bite = mount.querySelector<HTMLButtonElement>('[data-fishing-bite]')!;
    const target = { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true };

    ui.setFishingState({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: target,
    });
    expect(document.activeElement).toBe(bite);
    expect(bite.getAttribute('aria-label')).toBe('BITE - REEL NOW');
    expect(mount.querySelector('[data-fishing-live]')?.getAttribute('aria-live')).toBe('assertive');
    expect(bite.style.transform).toBe('translate(160px, 90px)');
    expect(bite.style.width).toBe('60px');
    expect(bite.style.height).toBe('44px');

    Object.assign(target, { x: 220, y: 130, width: 72, height: 48, depth: 2 });
    ui.updateFishingBiteTarget(target);
    expect(bite.style.transform).toBe('translate(220px, 130px)');
    expect(mainStyles).toMatch(
      /\.fishing-bite-target\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
    );
    expect(mainStyles).not.toContain('fishing-bite-pulse');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }));
    bite.click();
    expect(reel).toHaveBeenCalledOnce();
  });

  it('isolates background actions during fishing while Escape and pause remain operable', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);
    const fishing = mount.querySelector<HTMLElement>('[data-fishing]')!;
    const bite = mount.querySelector<HTMLButtonElement>('[data-fishing-bite]')!;

    ui.setFishingState({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true },
    });
    expect(mount.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);
    expect(mount.querySelector('[data-survival-top]')?.hasAttribute('inert')).toBe(true);
    expect(fishing.hasAttribute('inert')).toBe(false);
    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    expect(action).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pause).toHaveBeenCalledWith(true);

    ui.setPaused(true);
    expect(fishing.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(mount.querySelector('[data-resume]'));
    ui.setPaused(false);
    expect(fishing.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(bite);
  });

  it('announces fishing state changes but not projected-position-only updates', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const live = mount.querySelector<HTMLElement>('[data-fishing-live]')!;
    const publications: string[] = [];
    const observer = new MutationObserver(() => publications.push(live.textContent ?? ''));
    observer.observe(live, { childList: true, subtree: true, characterData: true });

    ui.setFishingState({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true },
    });
    await Promise.resolve();
    ui.updateFishingBiteTarget({
      x: 220, y: 130, width: 72, height: 48, depth: 2, visible: true,
    });
    await Promise.resolve();

    observer.disconnect();
    expect(publications.filter((message) => message === 'BITE - REEL NOW')).toHaveLength(1);
  });

  it('focuses the back control when no focused event choice is available', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);

    ui.showFocusedEvent({
      eventId: 'drifting-supplies',
      target: null,
      choices: [
        {
          id: 'retrieve',
          label: 'RETRIEVE',
          energyCost: 3,
          energyOwner: 'player',
          unavailableReason: 'You need more energy.',
          instanceId: null,
        },
        {
          id: 'delegate-carlitos',
          label: 'SEND CARLITOS',
          energyCost: 3,
          energyOwner: 'carlitos',
          unavailableReason: 'Carlitos needs more energy.',
          instanceId: null,
        },
      ],
    });

    expect(document.activeElement).toBe(
      mount.querySelector<HTMLButtonElement>('[data-focused-event-back]'),
    );
  });

  it('preserves native Back activation while aiming and keeps Tab inside fishing', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const cast = vi.fn();
    const exit = vi.fn();
    ui.onFishingCast = cast;
    ui.onFishingViewExit = exit;
    ui.setFishingViewExitVisible(true);
    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    const back = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;
    back.focus();

    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      back.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    back.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(back);
    expect(cast).not.toHaveBeenCalled();
    back.click();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('accepts a water click after Continue while boat controls stay locked', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const cast = vi.fn(() => true);
    const exit = vi.fn();
    ui.onAction = action;
    ui.onFishingCast = cast;
    ui.onFishingViewExit = exit;
    ui.render(snapshot(), () => null);
    ui.setBusy(true);
    ui.setFishingState({ mode: 'result', message: '', biteTarget: null });
    ui.showFishingResult({ items: [{ itemId: 'cannedFood', quantity: 1, condition: 'usable' }], message: '', catchTarget: null });
    ui.onFishingResultContinue = () => {
      ui.hideFishingResult();
      ui.setFishingViewExitVisible(true);
      ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    };
    mount.querySelector<HTMLButtonElement>('[data-fishing-result-close]')!.click();

    const rod = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const back = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;
    expect(rod.closest('[inert]')).not.toBeNull();
    expect(mount.querySelector('[data-survival-top]')!.hasAttribute('inert')).toBe(true);
    rod.click();
    expect(action).not.toHaveBeenCalled();
    mount.querySelector<HTMLElement>('[data-fishing]')!.click();
    expect(cast).toHaveBeenCalledOnce();
    back.click();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('blocks aiming controls under the Journal and pause, then restores access', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const exit = vi.fn();
    ui.onAction = action;
    ui.onFishingViewExit = exit;
    ui.render(snapshot(), () => null);
    ui.setFishingViewExitVisible(true);
    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    const rod = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const back = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;

    for (const modal of ['journal', 'pause']) {
      if (modal === 'journal') ui.showJournal(journalEntries);
      else ui.setPaused(true);
      expect(rod.closest('[inert]')).not.toBeNull();
      expect(back.closest('[inert]')).not.toBeNull();
      rod.click();
      back.click();
      expect(action).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      if (modal === 'journal') ui.hideJournal();
      else ui.setPaused(false);
      expect(rod.closest('[inert]')).not.toBeNull();
      expect(back.closest('[inert]')).toBeNull();
    }

    ui.setBusy(true);
    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    expect(rod.closest('[inert]')).not.toBeNull();
    expect(back.closest('[inert]')).toBeNull();
  });

  it('disposes fishing listeners, pending fade work, inert state, and focused controls once', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const cast = vi.fn();
    const reel = vi.fn();
    ui.onFishingCast = cast;
    ui.onFishingReel = reel;
    ui.setFishingState({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true },
    });
    const pendingFade = ui.setFishingFade(true);

    ui.dispose();
    ui.dispose();
    await pendingFade;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(cast).not.toHaveBeenCalled();
    expect(reel).not.toHaveBeenCalled();
    expect(mount.querySelector('.survival-ui')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('prefers the latest clicked command over a stale focused command', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const dive = mount.querySelector<HTMLButtonElement>('[data-action="dive"]')!;
    fish.focus();
    ui.onAction = () => undefined;

    dive.click();
    ui.restoreCommandFocus();

    expect(document.activeElement).toBe(dive);
  });

  it('requests pause on Escape and resumes accessibly', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const pause = vi.fn();
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pause).toHaveBeenCalledWith(true);
    ui.setPaused(true);
    const pauseMenu = mount.querySelector<HTMLElement>('[data-pause]')!;
    expect(pauseMenu.classList).toContain('is-visible');
    expect(pauseMenu.textContent).not.toContain('PAUSED');
    expect(pauseMenu.textContent).not.toContain('The sea will wait until you return.');
    expect([...pauseMenu.querySelectorAll('button')].every(
      (button) => button.classList.contains('primary-action'),
    )).toBe(true);
    expect(pauseMenu.querySelector('.secondary-action')).toBeNull();
    expect(document.activeElement).toBe(mount.querySelector('[data-resume]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pause).toHaveBeenLastCalledWith(false);
    ui.setPaused(false);
    ui.setPaused(true);
    mount.querySelector<HTMLButtonElement>('[data-resume]')!.click();
    expect(pause).toHaveBeenLastCalledWith(false);
  });

  it('restores the command origin when a command-driven pause closes', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const dive = mount.querySelector<HTMLButtonElement>('[data-action="dive"]')!;
    ui.onAction = () => ui.setPaused(true);

    dive.click();
    expect(document.activeElement).toBe(mount.querySelector('[data-resume]'));
    ui.setPaused(false);
    expect(document.activeElement).toBe(dive);
  });

  it('keeps scene items inspectable during an event while modal states isolate commands', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const anchorLayer = mount.querySelector<HTMLElement>('[data-boat-anchors]')!;

    void ui.showEventReveal(testEvent());
    ui.setEventSelection(new Map());
    expect(anchorLayer.hasAttribute('inert')).toBe(false);
    fish.click();
    expect(action).not.toHaveBeenCalled();

    ui.clearEventPresentation();
    expect(anchorLayer.hasAttribute('inert')).toBe(false);
    fish.click();
    expect(action).toHaveBeenCalledOnce();

    ui.setPaused(true);
    fish.click();
    expect(action).toHaveBeenCalledOnce();
    ui.setPaused(false);
    fish.click();
    expect(action).toHaveBeenCalledTimes(2);

    ui.showEnding({ id: 'sinking', day: 2, savedPickupCount: 4, cause: { eventId: null } });
    fish.click();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('makes pause topmost and restores the underlying ending focus', () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const restarted = vi.fn();
    ui.onRestart = restarted;
    ui.render(snapshot(), () => null);

    ui.showEnding({ id: 'sinking', day: 2, savedPickupCount: 4, cause: { eventId: null } });
    const endingLayer = mount.querySelector<HTMLElement>('[data-ending]')!;
    const endingTitle = mount.querySelector<HTMLElement>('[data-ending-title]')!;
    vi.advanceTimersByTime(1500);
    ui.setPaused(true);
    expect(endingLayer.hasAttribute('inert')).toBe(true);
    mount.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(restarted).not.toHaveBeenCalled();
    ui.setPaused(false);
    expect(endingLayer.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(endingTitle);
  });

  it('removes document and button listeners exactly once on dispose', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;

    ui.dispose();
    ui.dispose();
    fish.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(action).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(mount.children).toHaveLength(0);
  });
});
