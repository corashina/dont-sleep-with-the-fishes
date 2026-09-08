// @vitest-environment jsdom
// Importance: 8/10 (scaled from 4/5). Protects survival commands and access.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
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

  function expectMeter(
    mount: HTMLElement,
    id: string,
    value: string,
    fill: number,
    visualFill: number,
  ): void {
    const meter = mount.querySelector<HTMLElement>(`[data-meter="${id}"]`)!;
    expect(meter.getAttribute('aria-valuenow')).toBe(value);
    expect(Number.parseFloat(meter.style.getPropertyValue('--meter-value'))).toBeCloseTo(fill);
    expect(Number.parseFloat(meter.style.getPropertyValue('--meter-fill-height')))
      .toBeCloseTo(visualFill, 2);
    expect(meter.querySelector('[data-meter-fill]')).not.toBeNull();
    expect(meter.querySelector('[data-meter-outline]')).not.toBeNull();
    expect(meter.tabIndex).toBe(0);
  }

  it('renders large condition icons with bottom-up fills and accessible values', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ health: 50, hunger: 25, energy: 1, hull: 20 }), () => null);

    const expected = {
      health: ['50', 50, 50],
      hunger: ['75', 75, 49.44],
      energy: ['1', 100 / 3, 100 / 3],
      hull: ['20', 20, 19.95],
    } as const;
    Object.entries(expected).forEach(([id, [value, fill, visualFill]]) =>
      expectMeter(mount, id, value, fill, visualFill));

    const meters = mount.querySelector('[aria-label="Condition meters"]')!;
    expect(meters.querySelector('[data-meter-value]')).toBeNull();
    expect(meters.querySelector('[data-meter="health"] [data-meter-tooltip]')?.textContent).toBe('50 / 100');
    expect(meters.querySelector('[data-meter="energy"] [data-meter-tooltip]')?.textContent).toBe('1 / 3');
    const hungerArtwork = meters.querySelector('[data-meter="hunger"] [data-ui-artwork="hunger"]')!;
    expect(hungerArtwork.querySelector('[data-hunger-scale]')?.getAttribute('transform'))
      .toBe('translate(40 36) scale(.8) translate(-40 -36)');
    expect(hungerArtwork.querySelector('[data-hunger-part="body"]')?.getAttribute('d'))
      .toContain('M22 5h12c-1 11 0 20 5 25');
    expect(hungerArtwork.querySelector('[data-hunger-part="body"]')?.getAttribute('d'))
      .toContain('-5-5 2-9 7-11 14L4 67');
    expect(hungerArtwork.querySelector('[data-hunger-part="pylorus"]')).toBeNull();
    expect(hungerArtwork.querySelector('[data-hunger-part="shine"]')?.getAttribute('d')).toBe('M41 58c7 4 16 4 24 0');
    const energyArtwork = meters.querySelector('[data-meter="energy"] [data-ui-artwork="energy"]')!;
    expect(energyArtwork.querySelector('[data-energy-scale]')?.getAttribute('transform'))
      .toBe('translate(40 36) scale(1.12 1) translate(-40 -36)');
    const hullArtwork = meters.querySelector('[data-meter="hull"] [data-ui-artwork="hull"]')!;
    expect(hullArtwork.querySelector('[data-hull-scale]')?.getAttribute('transform'))
      .toBe('translate(40 36) scale(1.12) translate(-40 -36)');
    const hullBody = hullArtwork.querySelector('[data-hull-part="body"]')!;
    expect(hullBody.getAttribute('d')).not.toMatch(/[CcQqSs]/);
    expect(hullArtwork.querySelector('[data-hull-part="rim"]')?.getAttribute('d')).toBe('M9 33h62');
    expect(hullArtwork.querySelector('[data-hull-part="planks"]')).toBeNull();
    expect(hullArtwork.querySelector('[data-hull-part="cabin"]')).toBeNull();
    expect(meters.querySelector('.survival-meter__label')).toBeNull();
    expect(meters.querySelector('.survival-meter__track')).toBeNull();
    expect(meters.querySelector('[data-meter="hull"]')?.getAttribute('aria-valuetext')).toBe('20, low');
    expect(mainStyles).toMatch(
      /\.survival-condition__art\s*\{[^}]*width:\s*114px;[^}]*height:\s*105px;[^}]*stroke-width:\s*3\.75;/s,
    );
    expect(mainStyles).toMatch(
      /\.survival-meters\s*\{[^}]*display:\s*flex;[^}]*gap:\s*14px;/s,
    );
    expect(mainStyles).toMatch(
      /\.survival-condition__art \*\s*\{[^}]*vector-effect:\s*non-scaling-stroke;/s,
    );
    expect(mainStyles).toMatch(
      /\.survival-meter--hull\s*\{\s*--meter-accent:\s*#956b49;\s*\}/,
    );
    expect(mainStyles).toMatch(
      /grid-template:\s*'icon' 105px \/ 114px;/,
    );
    expect(mainStyles).toMatch(
      /\.survival-meter__tooltip\s*\{[^}]*font:\s*700 1rem\/1 var\(--font-numeral\);[^}]*text-shadow:\s*2px 2px 0 #050606;/s,
    );
    expect(mainStyles).toMatch(
      /\.survival-meter__tooltip\s*\{[^}]*top:\s*calc\(100% \+ 10px\);[^}]*bottom:\s*auto;/s,
    );
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
        alive: true,
        energy: 3,
        hunger: 3,
        sickness: 1,
        unhappiness: 3,
        pettedToday: false,
        deathCause: null,
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
    card.querySelector<HTMLButtonElement>('[data-action="treatCarlitos"]')!.click();
    expect(action.mock.calls).toEqual([
      ['petCarlitos', undefined],
      ['feedCarlitos', undefined],
      ['treatCarlitos', undefined],
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

  it('clamps the Carlitos card inside the right and bottom viewport gutters', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const root = mount.querySelector<HTMLElement>('.survival-ui')!;
    const card = mount.querySelector<HTMLElement>('[data-carlitos-card]')!;
    const viewport = {
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600,
      width: 800, height: 600, toJSON: () => ({}),
    };
    const measuredCard = {
      x: 0, y: 0, top: 0, left: 0, right: 280, bottom: 260,
      width: 280, height: 260, toJSON: () => ({}),
    };
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(viewport);
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(measuredCard);
    ui.setAnchors([carlitosAnchor(850, 590)]);
    ui.render(snapshot({
      carlitos: {
        alive: true,
        energy: 3,
        hunger: 4,
        sickness: 0,
        unhappiness: 0,
        pettedToday: false,
        deathCause: null,
      },
    }), () => null);

    mount.querySelector<HTMLButtonElement>('[data-anchor-id="carlitos"]')!.click();

    const x = Number.parseFloat(card.style.getPropertyValue('--carlitos-card-x'));
    const y = Number.parseFloat(card.style.getPropertyValue('--carlitos-card-y'));
    expect(x).toBe(viewport.width - 16 - measuredCard.width);
    expect(y).toBe(viewport.height - 16 - measuredCard.height);
    expect(x + measuredCard.width).toBeLessThanOrEqual(viewport.width - 16);
    expect(y + measuredCard.height).toBeLessThanOrEqual(viewport.height - 16);
  });

  it('closes the Carlitos card when Carlitos dies', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setAnchors([carlitosAnchor()]);
    const living = {
      alive: true,
      energy: 3,
      hunger: 4,
      sickness: 2,
      unhappiness: 5,
      pettedToday: false,
      deathCause: null,
    } as const;
    ui.render(snapshot({ carlitos: living }), () => null);
    mount.querySelector<HTMLButtonElement>('[data-anchor-id="carlitos"]')!.click();
    ui.render(snapshot({
      carlitos: { ...living, alive: false, deathCause: 'sickness' },
    }), () => null);
    expect(mount.querySelector<HTMLElement>('[data-carlitos-card]')!.hidden).toBe(true);
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
        id: 'event:wreckage',
        eventFocusId: 'wreckage',
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
      '[data-anchor-id="event:wreckage"]',
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

  it('holds a completed event outcome for two seconds and settles on dispose', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = createUI(mount);

    let settled = false;
    const hold = ui.holdEventOutcome().then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await hold;
    expect(settled).toBe(true);

    const pending = ui.holdEventOutcome();
    expect(vi.getTimerCount()).toBe(1);
    ui.dispose();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supersedes an event outcome hold without leaving its timer active', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = createUI(mount);

    let firstSettled = false;
    const first = ui.holdEventOutcome().then(() => { firstSettled = true; });
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
    targets[0]!.click();
    expect(action).toHaveBeenCalledWith('repairItem', { kind: 'itemRepair', target: 'bucket-2' });
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

  it('pauses the radio window while the journal is open', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const radioPause = vi.fn();
    ui.onRadioPauseChange = radioPause;

    ui.showJournal(journalEntries);
    ui.hideJournal();

    expect(radioPause.mock.calls).toEqual([[true], [false]]);
    ui.dispose();
  });

  it('closes the journal from its backdrop but not from the book', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const close = vi.fn(() => ui.hideJournal());
    ui.onJournalClose = close;
    ui.showJournal(journalEntries);

    mount.querySelector<HTMLElement>('[data-journal-book]')!.click();
    expect(close).not.toHaveBeenCalled();

    const layer = mount.querySelector<HTMLElement>('[data-journal]')!;
    layer.click();
    expect(close).toHaveBeenCalledOnce();
    expect(layer.hasAttribute('inert')).toBe(true);
    ui.dispose();
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

  it.each(['bucket', 'flashlight'] as const)('keeps broken %s inspectable without exposing a usable action', (itemType) => {
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
    expect(broken.getAttribute('aria-disabled')).toBe('true');
    expect(broken.querySelector('[role="tooltip"]')?.textContent).toBe(`${itemType.toUpperCase()} — BROKEN`);
    expect(broken.getAttribute('aria-description')).toContain('BROKEN');
    expect(broken.getAttribute('aria-description')).toContain('Repair with Duct Tape.');
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

  it('emits one action and blocks controls while busy', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);

    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    expect(action).toHaveBeenCalledWith('fish', undefined);

    ui.setBusy(true);
    expect(mount.querySelector('.survival-ui')?.getAttribute('aria-busy')).toBe('true');
    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    expect(action).toHaveBeenCalledOnce();
    expect(mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.hidden).toBe(false);
  });

  it('forwards one mount-local aiming pointer cast and ignores pointer input in other modes', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const cast = vi.fn();
    ui.onFishingCast = cast;
    vi.spyOn(mount, 'getBoundingClientRect').mockReturnValue({
      x: 40, y: 70, left: 40, top: 70, right: 840, bottom: 670, width: 800, height: 600,
      toJSON: () => ({}),
    });
    const layer = mount.querySelector<HTMLElement>('[data-fishing]')!;
    const message = mount.querySelector<HTMLElement>('[data-fishing-message]')!;

    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe('CLICK THE WATER TO CAST');
    layer.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 190, clientY: 230 }));
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 190, clientY: 230 }));
    expect(cast).toHaveBeenCalledOnce();
    expect(cast).toHaveBeenCalledWith({ x: 150, y: 160 });

    ui.setFishingState({ mode: 'waiting', message: 'WAIT FOR A BITE', biteTarget: null });
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe('WAIT FOR A BITE');
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 220, clientY: 260 }));
    ui.setFishingState({ mode: 'result', message: 'IT GOT AWAY', biteTarget: null });
    expect(message.hidden).toBe(true);
    layer.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 220, clientY: 260 }));
    expect(cast).toHaveBeenCalledOnce();
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

  it('opens a shared wreckage focus and returns the chosen item instance', () => {
    const style = document.createElement('style');
    style.textContent = mainStyles.match(
      /\.focused-event-view__card nav(?:\[hidden\])?\s*\{[^}]*\}/g,
    )?.join('\n') ?? '';
    const mount = document.createElement('main');
    document.body.append(style, mount);
    const ui = createUI(mount);
    const selected = vi.fn();
    const returned = vi.fn();
    const choice = vi.fn();
    ui.onFocusedEventSelect = selected;
    ui.onFocusedEventChoice = choice;
    ui.onFocusedEventBack = returned;
    ui.setAnchors([{
      id: 'event:wreckage',
      eventFocusId: 'wreckage',
      tooltip: false,
      label: 'WRECKAGE',
      description: 'Inspect the floating debris.',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 850,
      y: 360,
      visible: true,
      depleted: false,
      hitArea: { width: 180, height: 110, depth: 2 },
    }]);
    ui.beginEventPresentation();
    ui.setEventSelection(new Map());

    const anchor = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="event:wreckage"]',
    )!;
    expect(anchor.querySelector('.boat-tooltip')).toBeNull();
    expect(anchor.dataset.eventState).toBe('available');
    expect(anchor.disabled).toBe(false);
    expect(anchor.tabIndex).toBe(0);
    anchor.click();
    expect(selected).toHaveBeenCalledWith('wreckage');

    ui.showFocusedEvent({
      eventId: 'wreckage',
      target: { x: 850, y: 360, width: 180, height: 110, depth: 2, visible: true },
      choices: [
        {
          id: 'search',
          label: 'Search Debris',
          energyCost: 2,
          energyOwner: 'player',
          unavailableReason: null,
          instanceId: null,
        },
        {
          id: 'delegate-carlitos',
          label: 'Send Carlitos',
          energyCost: 3,
          energyOwner: 'carlitos',
          unavailableReason: 'Carlitos needs more energy.',
          instanceId: null,
        },
        {
          id: 'dive',
          label: 'Dive',
          energyCost: 3,
          energyOwner: 'player',
          unavailableReason: null,
          instanceId: 'scubaSet-1' as ItemInstanceId,
        },
        { id: 'leave', label: 'Leave', unavailableReason: null, instanceId: null },
      ],
    });

    const focus = mount.querySelector<HTMLElement>('[data-focused-event-view]')!;
    const focusCard = focus.querySelector<HTMLElement>('.focused-event-view__card')!;
    expect(focusCard.classList).toContain('dive-result__paper');
    expect(focus.querySelector('[data-focused-event-title]')?.textContent)
      .toBe('Wreckage Debris');
    expect(focus.getAttribute('aria-labelledby')).toBe('focused-event-title');
    expect(focus.getAttribute('aria-label')).toBeNull();
    expect(focus.dataset.anchorState).toBe('projected');
    const popupX = Number.parseFloat(focus.style.getPropertyValue('--focused-event-x'));
    const popupWidth = Number.parseFloat(focus.style.getPropertyValue('--focused-event-width'));
    const targetLeft = 850 - 180 / 2;
    const targetRight = 850 + 180 / 2;
    expect(popupX + popupWidth <= targetLeft || popupX >= targetRight).toBe(true);
    expect(focus.textContent).not.toContain('DRIFTING ITEM');
    const energyCosts = [...focus.querySelectorAll<HTMLElement>('.focused-event-view__cost')];
    expect(energyCosts.map(({ textContent }) => textContent))
      .toEqual(['⚡️⚡️', '⚡️⚡️⚡️', '⚡️⚡️⚡️']);
    expect(energyCosts.map((cost) => cost.getAttribute('aria-label')))
      .toEqual(['2 energy', '3 energy', '3 energy']);
    expect(focus.textContent).not.toContain('PLAYER');
    expect(focus.textContent).not.toContain('CARLITOS —');
    expect(mainStyles).toMatch(
      /\.focused-event-view__choice-main\s*\{[^}]*font-size:\s*1rem;/s,
    );
    expect(focus.textContent).toContain('Leave');
    expect(focus.querySelector('.event-choice__reason')?.textContent)
      .toBe('Carlitos needs more energy.');
    expect(document.activeElement).toBe(
      focus.querySelector<HTMLButtonElement>('[data-event-choice="search"]'),
    );

    focus.querySelector<HTMLButtonElement>('[data-event-choice="search"]')!.click();
    expect(choice).toHaveBeenCalledExactlyOnceWith({ id: 'search', instanceId: null });

    const back = focus.querySelector<HTMLButtonElement>('[data-focused-event-back]')!;
    expect(back.parentElement).toBe(focus);
    expect(back.parentElement).not.toBe(focusCard);
    expect(back.textContent?.trim()).toBe('');
    expect(back.querySelector('[data-return-arrow] path')?.getAttribute('d'))
      .toBe('M9 3h6v10h5l-8 8-8-8h5z');
    expect(back.getAttribute('aria-label')).toBe('Return to boat');
    expect(mainStyles).toMatch(
      /\.return-arrow-artwork\s*\{[^}]*width:\s*82px;[^}]*height:\s*82px;/s,
    );
    expect(mainStyles).toMatch(
      /\.focused-event-view__back:hover\s*\{[^}]*color:\s*#ead4a5;[^}]*\}/s,
    );
    expect(mainStyles).not.toMatch(
      /\.focused-event-view__back:hover\s*,\s*\.focused-event-view__back:focus-visible/,
    );
    expect(mainStyles).toMatch(
      /\.focused-event-view__back:focus-visible\s*\{[^}]*outline:\s*none;/s,
    );
    back.click();
    expect(returned).toHaveBeenCalledOnce();
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

  it('releases boat controls and native button keys after fishing Continue', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const cast = vi.fn();
    const exit = vi.fn();
    ui.onAction = action;
    ui.onFishingCast = cast;
    ui.onFishingViewExit = exit;
    ui.render(snapshot(), () => null);
    ui.setBusy(true);
    ui.setFishingState({ mode: 'result', message: '', biteTarget: null });
    ui.showFishingResult({ caption: 'SMALL CATCH', title: 'COD', detail: '+1 FOOD', catchTarget: null });
    ui.onFishingResultContinue = () => {
      ui.hideFishingResult();
      ui.setBusy(false);
      ui.setFishingViewExitVisible(true);
      ui.setFishingState({ mode: 'ready', message: '', biteTarget: null });
    };
    mount.querySelector<HTMLButtonElement>('[data-fishing-result-continue]')!.click();

    const rod = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const back = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;
    expect(rod.closest('[inert]')).toBeNull();
    expect(mount.querySelector('[data-survival-top]')!.hasAttribute('inert')).toBe(false);
    rod.click();
    expect(action).toHaveBeenCalledExactlyOnceWith('fish', undefined);
    for (const button of [rod, back]) {
      button.focus();
      for (const key of ['Enter', ' ', 'Tab']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    }
    back.click();
    expect(exit).toHaveBeenCalledOnce();
    expect(cast).not.toHaveBeenCalled();
  });

  it('blocks ready fishing Back during a busy action but permits aiming cancellation', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const exit = vi.fn();
    ui.onFishingViewExit = exit;
    ui.setFishingViewExitVisible(true);
    ui.setFishingState({ mode: 'ready', message: '', biteTarget: null });
    const back = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;

    ui.setBusy(true);
    back.click();
    expect(exit).not.toHaveBeenCalled();

    ui.setBusy(false);
    back.click();
    expect(exit).toHaveBeenCalledOnce();

    ui.setBusy(true);
    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    back.click();
    expect(exit).toHaveBeenCalledTimes(2);
  });

  it('blocks ready fishing controls under the Journal and pause, then restores access', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const exit = vi.fn();
    ui.onAction = action;
    ui.onFishingViewExit = exit;
    ui.render(snapshot(), () => null);
    ui.setFishingViewExitVisible(true);
    ui.setFishingState({ mode: 'ready', message: '', biteTarget: null });
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
      expect(rod.closest('[inert]')).toBeNull();
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

  it('restores direct-click command origins after cues', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const dive = mount.querySelector<HTMLButtonElement>('[data-action="dive"]')!;
    const endDay = mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;
    ui.onAction = () => undefined;

    dive.click();
    ui.restoreCommandFocus();
    expect(document.activeElement).toBe(dive);

    endDay.click();
    ui.restoreCommandFocus();
    expect(document.activeElement).toBe(endDay);

    endDay.click();
    ui.render(snapshot(), (id) => id === 'endDay' ? 'Night has already fallen.' : null);
    ui.restoreCommandFocus();
    expect(document.activeElement).toBe(mount.querySelector('[data-action="fish"]'));
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
    const pause = mount.querySelector<HTMLElement>('[data-pause]')!;

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

  it('marks journal history unread until the marker opens', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.setJournalUnread(true);
    expect(mount.querySelector<HTMLElement>('[data-journal-unread]')!.hidden).toBe(false);
    expect(mount.querySelector('[data-journal-open]')?.getAttribute('aria-label')).toContain('new entry');
    ui.setJournalUnread(false);
    expect(mount.querySelector<HTMLElement>('[data-journal-unread]')!.hidden).toBe(true);
    ui.dispose();
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
