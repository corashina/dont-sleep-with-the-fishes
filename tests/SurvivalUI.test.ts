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

const activeUIs: SurvivalUI[] = [];
const mainStyles = readFileSync('src/styles/main.css', 'utf8') as string;

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

const journalEntries: readonly JournalEntry[] = [1, 2].map((day) => ({
  day,
  weather: day === 1 ? 'calm' : 'overcast',
  actions: [],
  daytime: null,
  nighttime: {
    kind: 'event',
    event: {
      phase: 'night',
      eventId: `night-${day}`,
      title: 'Quiet Night',
      prompt: `Night ${day} settled over the boat.`,
      attemptedItemId: null,
      attemptedChoiceId: null,
      choiceLabel: 'Endure',
      outcomeCode: 'event-resolved',
      outcomeMessage: 'I made it through until morning.',
      inventoryMutations: [],
    },
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  activeUIs.splice(0).forEach((ui) => ui.dispose());
  document.body.innerHTML = '';
});

function createUI(mount: HTMLElement): SurvivalUI {
  const ui = new SurvivalUI(mount);
  ui.setAnchors([
    { id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish', remainingUses: null, x: 90, y: 180, visible: true, depleted: false },
    { id: 'bucket-test', itemType: 'bucket', toolId: null, action: null, remainingUses: null, x: 140, y: 180, visible: true, depleted: false },
    { id: 'scubaSet-test', itemType: 'scubaSet', toolId: null, action: 'dive', remainingUses: null, x: 240, y: 250, visible: true, depleted: false },
    { id: 'cannedFood-test', itemType: 'cannedFood', toolId: null, action: 'eat', remainingUses: 1, x: 340, y: 300, visible: true, depleted: false },
    {
      id: 'repair-tools', itemType: null, toolId: 'repairTools', action: 'repair', remainingUses: null,
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

describe('item animation lab caption', () => {
  it('keeps the caption hidden while world items remain selectable', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);

    ui.beginEventPresentation();
    ui.showItemAnimationLab();
    ui.setEventSelection(new Map<ItemInstanceId, string>([
      ['bucket-1', 'bucket'],
      ['scubaSet-test' as ItemInstanceId, 'scubaSet'],
    ]));

    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.classList.contains('is-visible')).toBe(false);
    expect(caption.getAttribute('aria-hidden')).toBe('true');
    expect(caption.getAttribute('aria-label')).toBeNull();
    expect(caption.querySelector<HTMLElement>('[data-event-title]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect(caption.querySelector<HTMLElement>('[data-event-detail]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-detail]')?.textContent).toBe('');
    expect(
      mount.querySelector<HTMLElement>('[data-anchor-id="scubaSet-test"]')
        ?.getAttribute('aria-label'),
    ).toBe('SCUBA GEAR');
  });

  it('shows and selects animations for an item with multiple routes', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventChoice = vi.fn();
    ui.onEventChoice = onEventChoice;
    ui.beginEventPresentation();
    ui.showItemAnimationLab();
    ui.setEventSelection(new Map([['bucket-1' as ItemInstanceId, 'bucket']]));

    ui.showItemAnimationLabChoices([
      { id: 'bucket-scoop', label: 'Scoop from water', unavailableReason: null },
      { id: 'bucket-helmet', label: 'Wear as helmet', unavailableReason: null },
    ]);

    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.classList.contains('is-visible')).toBe(true);
    expect(caption.classList.contains('item-animation-dialog')).toBe(true);
    expect(caption.querySelector<HTMLElement>('[data-event-title]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect([...caption.querySelectorAll<HTMLButtonElement>('[data-event-choice]')]
      .map((button) => button.textContent)).toEqual([
      'Scoop from water',
      'Wear as helmet',
    ]);

    caption.querySelector<HTMLButtonElement>('[data-event-choice="bucket-helmet"]')!.click();
    expect(onEventChoice).toHaveBeenCalledExactlyOnceWith('bucket-helmet');

    ui.hideItemAnimationLabChoices();
    expect(caption.classList.contains('is-visible')).toBe(false);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect(caption.querySelector('[data-event-choice]')).toBeNull();
  });

  it('activates the fixed repair toolbox as a lab item', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventItem = vi.fn();
    ui.onEventItem = onEventItem;
    ui.beginEventPresentation();
    ui.showItemAnimationLab();
    ui.setEventSelection(new Map<ItemInstanceId, string>([
      ['repair-tools' as ItemInstanceId, 'toolboxRepair'],
    ]));

    const toolbox = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="repair-tools"]',
    )!;
    expect(toolbox.dataset.eventState).toBe('available');
    expect(toolbox.getAttribute('aria-disabled')).toBe('false');

    toolbox.click();

    expect(onEventItem).toHaveBeenCalledExactlyOnceWith(
      'toolboxRepair',
      'repair-tools',
    );
  });

  it('activates fishing from the fixed lab rod', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventItem = vi.fn();
    ui.onEventItem = onEventItem;
    ui.beginEventPresentation();
    ui.showItemAnimationLab();
    ui.setEventSelection(new Map<ItemInstanceId, string>([
      ['fishing-tools' as ItemInstanceId, 'fish'],
    ]));

    const rod = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="fishing-tools"]',
    )!;
    expect(rod.dataset.eventState).toBe('available');
    expect(rod.getAttribute('aria-disabled')).toBe('false');

    rod.click();

    expect(onEventItem).toHaveBeenCalledExactlyOnceWith(
      'fish',
      'fishing-tools',
    );
  });

  it('opens the test chest from the lab', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onAction = vi.fn();
    ui.onAction = onAction;
    ui.render(snapshot({ energy: 3 }), () => null);
    ui.setAnchors([{
      id: 'persistent-chest',
      label: 'OPEN',
      description: 'A closed chest.',
      itemType: null,
      toolId: 'chest',
      action: 'openChest',
      remainingUses: null,
      quantity: 1,
      x: 400,
      y: 300,
      visible: true,
      depleted: false,
    }]);
    ui.beginEventPresentation();
    ui.showItemAnimationLab();
    ui.setEventSelection(new Map());

    const chest = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="persistent-chest"]',
    )!;
    expect(chest.disabled).toBe(false);
    expect(chest.getAttribute('aria-disabled')).toBe('false');

    chest.click();

    expect(onAction).toHaveBeenCalledExactlyOnceWith('openChest', undefined);
  });

  it.each(['pointer', 'keyboard'] as const)(
    'opens Carlitos stats from his lab anchor with %s input',
    (input) => {
      const mount = document.createElement('main');
      document.body.append(mount);
      const ui = createUI(mount);
      const onEventItem = vi.fn();
      const onAction = vi.fn();
      ui.onEventItem = onEventItem;
      ui.onAction = onAction;
      ui.render(snapshot({
        carlitos: {
          alive: true,
          energy: 2,
          hunger: 4,
          sickness: 1,
          unhappiness: 5,
          pettedToday: false,
          deathCause: null,
        },
      }), () => null);
      ui.setAnchors([carlitosAnchor()]);
      ui.beginEventPresentation();
      ui.showItemAnimationLab();
      ui.setEventSelection(new Map<ItemInstanceId, string>([
        ['carlitos-1' as ItemInstanceId, 'carlitos'],
      ]));

      const carlitos = mount.querySelector<HTMLButtonElement>(
        '[data-anchor-id="carlitos"]',
      )!;
      expect(carlitos.dataset.eventState).toBe('available');
      expect(carlitos.getAttribute('aria-label')).toBe('CARLITOS');
      expect(carlitos.querySelector<HTMLElement>('[role="tooltip"]')!.hidden)
        .toBe(true);

      if (input === 'pointer') carlitos.click();
      else {
        carlitos.focus();
        press('[data-anchor-id="carlitos"]', 'Enter');
      }

      expect(onEventItem).not.toHaveBeenCalled();
      const card = mount.querySelector<HTMLElement>('[data-carlitos-card]')!;
      expect(card.hidden).toBe(false);
      expect(card.querySelector('[data-carlitos-hunger-label]')?.textContent)
        .toBe('PECKISH');
      expect(card.querySelector('[data-carlitos-happiness]')?.textContent)
        .toBe('LONELY');
      expect(card.querySelector('[data-carlitos-health]')?.textContent)
        .toBe('UNWELL');
      expect(card.querySelector('[data-carlitos-energy-label]')?.textContent)
        .toBe('2 / 3');

      card.querySelector<HTMLButtonElement>('[data-action="petCarlitos"]')!.click();
      expect(onAction).toHaveBeenCalledExactlyOnceWith('petCarlitos', undefined);

      if (input === 'pointer') carlitos.click();
      else press('[data-anchor-id="carlitos"]', 'Enter');
      expect(card.hidden).toBe(true);
    },
  );
});

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

function labels(selector: string): string[] {
  return [...document.querySelectorAll<HTMLElement>(selector)].map((element) => element.textContent!.trim());
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
  it('shows a cause-aware ending with day and pickup count', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.showEnding({
      id: 'rescue', day: 30, savedPickupCount: 18, signalAssisted: true,
    });

    expect(mount.querySelector('[data-ending-title]')?.textContent).toBe('RESCUE FOUND YOU');
    expect(mount.querySelector('[data-ending-body]')?.textContent)
      .toBe('A distant crew followed the signs you left across the sea.');
    expect(mount.querySelector('[data-ending-stats]')?.textContent)
      .toBe('DAY 30 · 18 PICKUPS SAVED');
    expect(mount.querySelector('[data-ending-cause]')?.textContent).toBe('');
    expect(mount.textContent).not.toMatch(/seed|rescue lead|effective day/i);
  });

  it('uses the scuba parchment material on the selected popups', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const panels = [
      '[data-drifting-item-focus] > div',
      '[data-fishing-result] > div',
      '[data-repair-options] > div',
      '[data-pause] > div',
      '[data-ending] > div',
      '[data-carlitos-card]',
    ];

    panels.forEach((selector) => {
      expect(mount.querySelector(selector)?.classList).toContain('scuba-popup-paper');
    });
    expect(mainStyles).toMatch(/\.scuba-popup-paper\.scuba-popup-paper\s*\{[^}]*linear-gradient\(145deg,\s*#ead8ad,\s*#c9aa77 72%,\s*#af8958\)/s);
    expect(mainStyles).not.toContain('radial-gradient(circle at 82% 18%');
    ui.dispose();
  });

  it('renders large condition icons with bottom-up fills and accessible values', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ health: 50, hunger: 25, energy: 1, hull: 20 }), () => null);

    const expected = {
      health: ['50', 50],
      hunger: ['75', 75],
      energy: ['1', 100 / 3],
      hull: ['20', 20],
    } as const;
    for (const [id, [value, fill]] of Object.entries(expected)) {
      const meter = mount.querySelector<HTMLElement>(`[data-meter="${id}"]`)!;
      expect(meter.getAttribute('aria-valuenow')).toBe(value);
      expect(Number.parseFloat(meter.style.getPropertyValue('--meter-value'))).toBeCloseTo(fill);
      const visualFill = Number.parseFloat(meter.style.getPropertyValue('--meter-fill-height'));
      if (id === 'hunger') expect(visualFill).toBeCloseTo(49.44, 2);
      else if (id === 'hull') expect(visualFill).toBeCloseTo(19.95, 2);
      else expect(visualFill).toBeCloseTo(fill);
      expect(meter.querySelector('[data-meter-fill]')).not.toBeNull();
      expect(meter.querySelector('[data-meter-outline]')).not.toBeNull();
      expect(meter.tabIndex).toBe(0);
    }

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

  it('shows one bonus energy above the standard meter limit', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ energy: 4 }), () => null);

    const meter = mount.querySelector<HTMLElement>('[data-meter="energy"]')!;
    const tooltip = meter.querySelector<HTMLElement>('[data-meter-tooltip]')!;

    expect(tooltip.textContent).toBe('4 / 3');
    expect(meter.getAttribute('aria-valuenow')).toBe('4');
    expect(meter.getAttribute('aria-valuemax')).toBe('4');
    expect(meter.getAttribute('aria-valuetext'))
      .toBe('3 standard energy and 1 bonus energy');
    expect(meter.style.getPropertyValue('--meter-value')).toBe('100%');

    ui.render(snapshot({ energy: 3 }), () => null);
    expect(meter.getAttribute('aria-valuemax')).toBe('3');
    expect(meter.getAttribute('aria-valuetext')).toBeNull();
  });

  it('maps half hull condition to half of the visible hull artwork', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ hull: 50 }), () => null);

    const hull = mount.querySelector<HTMLElement>('[data-meter="hull"]')!;
    expect(hull.style.getPropertyValue('--meter-value')).toBe('50%');
    expect(Number.parseFloat(hull.style.getPropertyValue('--meter-fill-height')))
      .toBeCloseTo(32.12, 2);
  });

  it('maps eighty food to eighty percent of the visible stomach area', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ hunger: 20 }), () => null);

    const hunger = mount.querySelector<HTMLElement>('[data-meter="hunger"]')!;
    expect(hunger.style.getPropertyValue('--meter-value')).toBe('80%');
    expect(Number.parseFloat(hunger.style.getPropertyValue('--meter-fill-height')))
      .toBeCloseTo(52.36, 2);
  });

  it('opens the simple cat status list with large actions and short unavailable labels', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.setAnchors([carlitosAnchor()]);
    ui.render(snapshot({
      carlitos: {
        alive: true,
        energy: 2,
        hunger: 4,
        sickness: 2,
        unhappiness: 5,
        pettedToday: true,
        deathCause: null,
      },
    }), (action) => ({
      petCarlitos: 'Carlitos has already been petted today.',
      feedCarlitos: 'No food remains.',
      treatCarlitos: 'No medical kit remains.',
    } as Partial<Record<string, string>>)[action] ?? null);

    const anchor = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="carlitos"]',
    )!;
    expect(anchor.getAttribute('aria-label')).toBe('CARLITOS');
    anchor.focus();
    press('[data-anchor-id="carlitos"]', 'Enter');

    const card = mount.querySelector<HTMLElement>('[data-carlitos-card]')!;
    expect(card.hidden).toBe(false);
    expect(card.textContent).not.toContain('CARLITOS');
    expect(card.querySelector('.carlitos-card__cat')).toBeNull();
    expect(card.querySelector('h2')).toBeNull();
    expect(card.querySelector('.carlitos-status__name')).toBeNull();
    expect(card.getAttribute('aria-label')).toBe('Cat status');
    expect(card.querySelectorAll('.carlitos-status')).toHaveLength(4);
    expect(card.querySelector('.carlitos-status:first-child'))
      .toBe(card.querySelector('[data-carlitos-energy-row]'));
    for (const [row, artwork] of [
      ['hunger', 'hunger'],
      ['happiness', 'mood'],
      ['health', 'health'],
      ['energy', 'energy'],
    ] as const) {
      expect(card.querySelector(`[data-carlitos-${row}-row] [data-ui-artwork="${artwork}"]`))
        .not.toBeNull();
    }
    expect(card.querySelector('[data-carlitos-hunger-label]')?.textContent).toBe('PECKISH');
    expect(card.querySelector('[data-carlitos-energy-label]')?.textContent).toBe('2 / 3');
    expect(card.querySelector('[data-carlitos-happiness]')?.textContent).toBe('LONELY');
    expect(card.querySelector('[data-carlitos-health]')?.textContent).toBe('SICK');
    expect(card.querySelector('[data-carlitos-hunger-row] [data-action="feedCarlitos"]')).not.toBeNull();
    expect(card.querySelector('[data-carlitos-happiness-row] [data-action="petCarlitos"]')).not.toBeNull();
    expect(card.querySelector('[data-carlitos-health-row] [data-action="treatCarlitos"]')).not.toBeNull();
    expect(card.querySelector('[data-carlitos-energy-row] [data-action]')).toBeNull();
    expect(card.querySelector('.carlitos-care')).toBeNull();
    expect(card.textContent).not.toContain('CREWMATE STATUS');
    expect(card.textContent).not.toContain("SHIP'S CAT");
    expect(card.textContent).not.toContain('DANGER');
    for (const [actionId, reason, label] of [
      ['petCarlitos', 'Carlitos has already been petted today.', 'PET'],
      ['feedCarlitos', 'No food remains.', 'FEED'],
      ['treatCarlitos', 'No medical kit remains.', 'TREAT'],
    ] as const) {
      const button = card.querySelector<HTMLButtonElement>(`[data-action="${actionId}"]`)!;
      expect(button.classList).toContain('carlitos-status__action');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-description')).toBe(reason);
      expect(button.textContent?.trim()).toBe(label);
      expect(button.querySelector('[data-carlitos-action-reason]')).toBeNull();
      button.click();
    }
    expect(action).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(card.querySelector('[data-action="petCarlitos"]'));
    expect(mount.querySelector('[data-pause]')?.contains(card)).toBe(false);
    expect(mainStyles).not.toMatch(/\.carlitos-card::after/);
    expect(mainStyles).toMatch(/\.carlitos-card__statuses\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(mainStyles).toMatch(/\.carlitos-status\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) 88px/s);
    expect(mainStyles).toMatch(/\.carlitos-status\s*\{[^}]*height:\s*58px[^}]*min-height:\s*58px/s);
    expect(mainStyles).toMatch(/\.carlitos-status\[data-carlitos-energy-row\]\s*\{[^}]*grid-template-columns:\s*auto auto[^}]*justify-content:\s*start/s);
    expect(mainStyles).toMatch(/\.carlitos-card__close\s*\{[^}]*top:\s*10px[^}]*right:\s*6px[^}]*width:\s*48px[^}]*height:\s*48px[^}]*padding:\s*6px 6px 9px[^}]*border:\s*0[^}]*background:\s*transparent[^}]*font-size:\s*2\.4rem[^}]*transform:\s*rotate\(-4deg\)/s);
    expect(mainStyles).toMatch(/\.carlitos-status__action:focus-visible\s*\{[^}]*outline:\s*none[^}]*filter:\s*brightness\(1\.18\)/s);
    expect(mainStyles).not.toMatch(/\.carlitos-card button:focus-visible\s*\{[^}]*#9b3e2c/s);
    expect(mainStyles).toMatch(/\.carlitos-status__action\s*\{[^}]*display:\s*flex[^}]*min-height:\s*40px/s);
  });

  it('supports Carlitos pointer, keyboard, dismissal, focus, and action flows', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
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
    anchor.click();
    expect(card.hidden).toBe(true);
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

  it('shows the taken ending record', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.showEnding({ id: 'taken', day: 8, savedPickupCount: 4 });

    expect(mount.querySelector('[data-ending-title]')?.textContent).toBe('TAKEN IN THE DARK');
    expect(mount.querySelector('[data-ending-body]')?.textContent)
      .toBe('The light found something that had been waiting for you.');
    expect(mount.querySelector('[data-ending-stats]')?.textContent)
      .toBe('DAY 8 · 4 PICKUPS SAVED');
    expect(mount.querySelector('[data-ending]')?.textContent).not.toContain('JOURNEY ENDED');
  });

  it('keeps visual quality controls out of the pause overlay', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);

    expect(mount.querySelector('[data-pause] [data-visual-quality-control]')).toBeNull();
    expect(mount.querySelector('[data-pause] [data-visual-quality]')).toBeNull();
    ui.dispose();
  });


  it('shows authored contextual choices only after selection unlocks', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.beginEventPresentation();
    void ui.showEventReveal(eventWithChoices('retrieve', 'leave'));
    ui.setEventSelection(new Map(), [
      { id: 'retrieve', label: 'RETRIEVE', unavailableReason: null },
      { id: 'leave', label: 'LEAVE IT', unavailableReason: null },
    ]);
    expect(labels('[data-event-choice]')).toEqual(['RETRIEVE', 'LEAVE IT']);
    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.classList).toContain('is-visible');
    expect(caption.querySelector<HTMLElement>('[data-event-title]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect(caption.querySelector<HTMLElement>('[data-event-detail]')?.hidden).toBe(true);
    expect(caption.querySelector<HTMLElement>('[data-event-risk]')?.hidden).toBe(true);
  });

  it('uses the Handyman hand as a tooltip-free world choice', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventChoice = vi.fn();
    ui.onEventChoice = onEventChoice;
    ui.setAnchors([{
      id: 'handyman:hand',
      label: 'HAND',
      description: 'Touch the waiting hand.',
      tooltip: false,
      eventChoiceId: 'touch',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 240,
      y: 180,
      visible: true,
      depleted: false,
    }]);
    ui.beginEventPresentation();
    void ui.showEventReveal(eventWithChoices('touch'));
    ui.setEventSelection(new Map(), [{
      id: 'touch',
      label: 'Touch the Hand',
      unavailableReason: null,
      anchorId: 'handyman:hand',
    }]);

    const hand = mount.querySelector<HTMLButtonElement>('[data-anchor-id="handyman:hand"]')!;
    expect(mount.querySelector('[data-event-choices] [data-event-choice="touch"]')).toBeNull();
    expect(hand.querySelector('[role="tooltip"]')).toBeNull();
    expect(hand.getAttribute('aria-label')).toBe('HAND');

    hand.click();
    expect(onEventChoice).toHaveBeenCalledExactlyOnceWith('touch');
  });

  it('publishes the Midnight Tour island hover target', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    ui.setAnchors([{
      id: 'midnight-tour:island',
      label: 'ISLAND',
      description: 'Turn the boat toward the small island.',
      eventChoiceId: 'visit',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 400,
      y: 260,
      visible: true,
      depleted: false,
    }]);
    const island = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="midnight-tour:island"]',
    )!;

    island.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('midnight-tour:island');

    island.dispatchEvent(new MouseEvent('pointerout', {
      bubbles: true,
      relatedTarget: mount,
    }));
    expect(highlight).toHaveBeenLastCalledWith(null);
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
    expect(bucket.querySelector('[data-overlap-cycle]')?.textContent)
      .toBe('SCROLL OR ← → TO SELECT');

    bucket.focus();
    press('[data-anchor-id="bucket-overlap"]', 'ArrowRight');

    expect(document.activeElement).toBe(scuba);
    expect(scuba.style.zIndex).toBe('100001');
    expect(highlight).toHaveBeenLastCalledWith('scuba-overlap');

    scuba.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 1,
    }));

    expect(document.activeElement).toBe(bucket);
    expect(bucket.style.zIndex).toBe('100001');
    expect(scuba.style.zIndex).toBe('99800');
    expect(highlight).toHaveBeenLastCalledWith('bucket-overlap');
  });

  it('activates a focused contextual choice with the keyboard', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onEventChoice = vi.fn();
    ui.onEventChoice = onEventChoice;
    openContextualEvent(ui);
    const choice = mount.querySelector<HTMLButtonElement>('[data-event-choice="retrieve"]')!;
    choice.focus();
    press('[data-event-choice="retrieve"]', 'Enter');
    press('[data-event-choice="retrieve"]', ' ');
    expect(onEventChoice).toHaveBeenCalledWith('retrieve');
    expect(onEventChoice).toHaveBeenCalledTimes(2);
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

  it('routes Drifting Cargo through its projected prop instead of a response button', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const selected = vi.fn();
    ui.onEventChoice = selected;
    ui.setAnchors([
      {
        id: 'drifting-supplies',
        label: 'CRATE',
        description: 'Floating salvage within reach.',
        eventChoiceId: 'retrieve',
        itemType: null,
        toolId: null,
        action: null,
        remainingUses: null,
        x: 420,
        y: 260,
        visible: true,
        depleted: false,
        hitArea: { width: 96, height: 82, depth: 2 },
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
    ]);
    ui.beginEventPresentation();
    ui.setEventSelection(new Map(), [
      {
        id: 'retrieve',
        label: 'Retrieve It',
        unavailableReason: null,
        anchorId: 'drifting-supplies',
        energyCost: 3,
      },
      { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
    ]);

    expect(
      mount.querySelector(
        '[data-event-choices] [data-event-choice="retrieve"]',
      ),
    ).toBeNull();
    const loot = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="drifting-supplies"]',
    )!;
    expect(loot.querySelector('[role="tooltip"]')?.textContent)
      .toBe('CRATE — ⚡⚡⚡');
    expect(loot.dataset.eventChoice).toBe('retrieve');
    expect(loot.dataset.backingInstanceId).toBeUndefined();
    expect(loot.getAttribute('aria-disabled')).toBe('false');
    expect(mount.querySelector('[data-anchor-id="end-day-pillow"]')?.getAttribute(
      'data-event-choice',
    )).toBe('sleep');
    loot.click();
    loot.focus();
    press('[data-anchor-id="drifting-supplies"]', 'Enter');
    expect(selected.mock.calls).toEqual([['retrieve'], ['retrieve']]);
    expect(mainStyles).toMatch(
      /\.boat-anchor\s*\{[^}]*cursor:\s*pointer;/s,
    );
    expect(mainStyles).toMatch(
      /\.boat-anchor\[data-event-state="locked"\]\s*\{[^}]*pointer-events:\s*none;/s,
    );
    expect(mainStyles).toMatch(
      /\.boat-anchor\[data-event-state="locked"\] \.boat-tooltip\s*\{[^}]*display:\s*none;/s,
    );
    expect(mainStyles).not.toMatch(
      /\.boat-anchor\[data-event-state="available"\]\s*\{[^}]*(?:outline|box-shadow):/s,
    );
    expect(mainStyles).toMatch(/:focus-visible\s*\{[^}]*outline:\s*none;/s);
    expect(mainStyles).not.toMatch(/outline:\s*[1-9]/);
    expect(mainStyles).not.toContain('#c98242');
  });

  it('keeps low-energy Drifting Cargo inspectable with an insufficient-energy tooltip', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const selected = vi.fn();
    ui.onEventChoice = selected;
    ui.setAnchors([{
      id: 'drifting-supplies',
      label: 'SALVAGE',
      description: 'Floating salvage within reach.',
      eventChoiceId: 'retrieve',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 420,
      y: 260,
      visible: true,
      depleted: false,
    }]);
    ui.beginEventPresentation();
    ui.setEventSelection(new Map(), [{
      id: 'retrieve',
      label: 'Retrieve It',
      unavailableReason: 'Requires 3 energy; you have 2.',
      anchorId: 'drifting-supplies',
      energyCost: 3,
    }]);

    const loot = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="drifting-supplies"]',
    )!;
    expect(loot.querySelector('[role="tooltip"]')?.textContent)
      .toBe('SALVAGE — ⚡⚡⚡ — INSUFFICIENT ENERGY');
    expect(loot.disabled).toBe(false);
    expect(loot.dataset.eventState).toBe('unavailable');
    expect(loot.getAttribute('aria-disabled')).toBe('true');
    loot.click();
    expect(selected).not.toHaveBeenCalled();
  });

  it('shows Carlitos energy without player energy lightning', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const choose = vi.fn();
    ui.onEventChoice = choose;
    const projectedAnchors = () => [{
      id: 'carlitos',
      companionId: 'carlitos' as const,
      label: 'CARLITOS',
      description: 'Check his hunger, happiness, and health.',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 420,
      y: 260,
      visible: true,
      depleted: false,
    }];
    ui.setAnchors(projectedAnchors());
    ui.beginEventPresentation();
    ui.setEventSelection(new Map(), [{
      id: 'delegate-carlitos',
      label: 'Send Carlitos',
      unavailableReason: null,
      anchorId: 'carlitos',
      energyCost: 3,
      energyOwner: 'carlitos',
    }]);

    const carlitos = mount.querySelector<HTMLButtonElement>('[data-anchor-id="carlitos"]')!;
    const tooltip = carlitos.querySelector('[role="tooltip"]')?.textContent ?? '';
    expect(tooltip).toContain('CARLITOS: 3 ENERGY');
    expect(tooltip).not.toContain('⚡');
    expect(mount.querySelector('[data-event-choices]')?.textContent).toBe('');
    carlitos.click();
    expect(choose).toHaveBeenCalledWith('delegate-carlitos');
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

  it('exposes the exact Carlitos delegation reason through aria-disabled', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const reason = 'Carlitos is Sick and cannot retrieve the loot.';
    ui.beginEventPresentation();
    ui.setEventSelection(new Map(), [{
      id: 'delegate-carlitos',
      label: 'Send Carlitos',
      unavailableReason: reason,
    }]);

    const choice = mount.querySelector<HTMLButtonElement>(
      '[data-event-choice="delegate-carlitos"]',
    )!;
    expect(choice.getAttribute('aria-disabled')).toBe('true');
    expect(choice.getAttribute('aria-description')).toBe(reason);
    expect(choice.textContent).toContain(reason);
  });

  it('clears contextual choice state before disposal removes the UI', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    openContextualEvent(ui);
    const strip = mount.querySelector<HTMLElement>('[data-event-choices]')!;

    ui.dispose();

    expect(strip.hidden).toBe(true);
    expect(strip.childElementCount).toBe(0);
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

  it('does not show an empty event caption during selection', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.beginEventPresentation();

    await ui.showEventReveal(testEvent());
    ui.setEventSelection(new Map(), [{
      id: 'sleep',
      label: 'Sleep',
      unavailableReason: null,
    }]);

    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.classList).not.toContain('is-visible');
    expect(caption.getAttribute('aria-hidden')).toBe('true');
    expect(mainStyles).toMatch(/\.event-caption\[aria-hidden="true"\]\s*\{[^}]*visibility:\s*hidden/s);
    expect(caption.querySelector<HTMLElement>('[data-event-title]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect(caption.querySelector<HTMLElement>('[data-event-detail]')?.hidden).toBe(true);
    expect(caption.querySelector<HTMLElement>('[data-event-risk]')?.hidden).toBe(true);
    expect(caption.dataset.danger).toBe('dangerous');
    expect(mainStyles).toMatch(/\.event-caption__detail\[hidden\]/);
    expect(mainStyles).toMatch(/\.event-caption__risk\[hidden\]/);
  });

  it('routes the event sleep response through the pillow instead of the caption', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const choice = vi.fn();
    const action = vi.fn();
    ui.onEventChoice = choice;
    ui.onAction = action;
    ui.render(snapshot(), () => null);

    await ui.showEventReveal(testEvent());
    ui.setEventSelection(new Map(), [
      { id: 'sleep', label: 'Sleep', unavailableReason: null },
    ]);

    const pillow = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="end-day-pillow"]',
    )!;
    expect(mount.querySelector('[data-event-choice="sleep"]')).toBe(pillow);
    expect(mount.querySelector('[data-event-choices]')?.textContent).not.toContain('Sleep');
    expect(pillow.querySelector('[role="tooltip"]')?.textContent).toBe('SLEEP');
    expect(pillow.getAttribute('aria-disabled')).toBe('false');

    pillow.click();
    expect(choice).toHaveBeenCalledWith('sleep');
    expect(action).not.toHaveBeenCalled();

    ui.clearEventPresentation();
    expect(pillow.querySelector('[role="tooltip"]')?.textContent).toBe('END DAY');
    expect(pillow.hasAttribute('data-event-choice')).toBe(false);
  });

  it('shows Guarded Sleep watch in the centered confirmation popup', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const choose = vi.fn();
    ui.onEventChoice = choose;
    ui.render(snapshot({
      carlitos: {
        alive: true,
        energy: 3,
        hunger: 5,
        sickness: 0,
        unhappiness: 0,
        pettedToday: false,
        deathCause: null,
      },
    }), () => null);
    ui.setAnchors([{
      id: 'carlitos',
      companionId: 'carlitos',
      label: 'CARLITOS',
      description: 'Check his hunger, happiness, and health.',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 620,
      y: 260,
      visible: true,
      depleted: false,
    }]);

    ui.beginEventPresentation();
    void ui.showEventReveal({
      id: 'guarded-sleep',
      revealText: 'Carlitos sits alert while the night presses close.',
      danger: 'uncertain',
    });
    ui.setEventSelection(new Map(), [
      { id: 'watch', label: 'Let Carlitos Watch', unavailableReason: null },
      { id: 'sleep', label: 'Sleep Normally', unavailableReason: null },
    ]);

    const popup = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(popup.classList).toContain('confirmation-dialog');
    expect(popup.classList).toContain('scuba-popup-paper');
    expect(popup.getAttribute('role')).toBe('dialog');
    expect(popup.getAttribute('aria-modal')).toBe('true');
    expect(popup.querySelector('[data-event-title]')?.textContent)
      .toBe('Let Carlitos watch?');
    expect(labels('[data-event-choices] [data-event-choice]')).toEqual(['Yes']);
    expect(mount.querySelector('[data-anchor-id="carlitos"]')?.hasAttribute('data-event-choice'))
      .toBe(false);
    popup.querySelector<HTMLButtonElement>('[data-event-choice="watch"]')!.click();
    expect(choose).toHaveBeenCalledWith('watch');
    expect(mainStyles).toMatch(
      /\.event-caption\.confirmation-dialog\s*\{[^}]*top:\s*50%;[^}]*width:\s*min\(480px,/s,
    );
  });

  it('keeps Other People sleep on the pillow beside eligible signals', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const choose = vi.fn();
    ui.onEventChoice = choose;

    ui.render(snapshot(), () => null);

    ui.beginEventPresentation();
    ui.setEventSelection(
      new Map([['flashlight-1', 'flashlight']]),
      [{ id: 'sleep', label: 'Let It Pass', unavailableReason: null }],
    );

    expect(
      mount.querySelector('[data-event-choices] [data-event-choice="sleep"]'),
    ).toBeNull();
    expect(mount.querySelector('[data-event-choices]')?.textContent)
      .not.toContain('Let It Pass');
    const pillow = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="end-day-pillow"]',
    )!;
    expect(pillow.dataset.eventChoice).toBe('sleep');
    expect(pillow.querySelector('[role="tooltip"]')?.textContent).toBe('SLEEP');
    expect(pillow.disabled).toBe(false);
    expect(pillow.getAttribute('aria-disabled')).toBe('false');
    expect(mount.querySelector('[data-endure]')).toBeNull();

    pillow.click();
    expect(choose).toHaveBeenCalledWith('sleep');
  });

  it('keeps normal Flowers choices while routing sleep through the pillow', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);

    ui.beginEventPresentation();
    ui.setEventSelection(new Map(), [
      { id: 'collect', label: 'Collect', unavailableReason: null },
      { id: 'bucket', label: 'Use Bucket', unavailableReason: null },
      { id: 'sleep', label: 'Sleep', unavailableReason: null },
    ]);

    expect(labels('[data-event-choices] [data-event-choice]')).toEqual([
      'Collect',
      'Use Bucket',
    ]);
    expect(mount.querySelector('[data-anchor-id="end-day-pillow"]')?.getAttribute(
      'data-event-choice',
    )).toBe('sleep');
  });

  it('shows and clears two gradual Bad Sleep half closures', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.setBadSleepCue(true);

    const eyelids = mount.querySelector<HTMLElement>('[data-bad-sleep-cue]')!;
    expect(eyelids.querySelectorAll('.bad-sleep-cue__eye')).toHaveLength(2);
    expect(eyelids.querySelectorAll('.bad-sleep-cue__eyelid')).toHaveLength(4);
    expect(eyelids.classList).toContain('is-visible');
    expect(mainStyles).toMatch(/\.bad-sleep-cue\.is-visible/);
    ui.setBadSleepCue(false);
    expect(eyelids.classList).not.toContain('is-visible');
    ui.setBadSleepCue(true);
    ui.clearEventPresentation();
    expect(eyelids.classList).not.toContain('is-visible');
    expect(mainStyles).toMatch(/\.sleep-cover\s*\{[^}]*z-index:\s*9/s);
    expect(mainStyles).toMatch(/\.sleep-cover\s*\{[^}]*background:\s*#010202/s);
    expect(mainStyles).not.toContain('.bad-sleep-cue__frame');
    expect(mainStyles).not.toContain('fill-rule=');
    expect(mainStyles).toMatch(/\.bad-sleep-cue__eye\s*\{[^}]*width:\s*50%/s);
    expect(mainStyles).toMatch(/\.bad-sleep-cue__eyelid\s*\{[^}]*height:\s*63%/s);
    expect(mainStyles).toMatch(
      /\.bad-sleep-cue__eyelid--top\s*\{[^}]*clip-path:[^;}]*50% 80%/s,
    );
    expect(mainStyles).toMatch(
      /\.bad-sleep-cue__eyelid--bottom\s*\{[^}]*clip-path:[^;}]*50% 20%/s,
    );
    expect(mainStyles.match(/(?:38|62)% \{ transform: translateY\(-60%\); \}/g))
      .toHaveLength(2);
    expect(mainStyles.match(/(?:38|62)% \{ transform: translateY\(60%\); \}/g))
      .toHaveLength(2);
    expect(mainStyles).not.toMatch(/(?:38|62)% \{ transform: translateY\(0\); \}/);
  });

  it('shows the pale sleep mask only for Ghosts and clears it with the event', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const mask = mount.querySelector<HTMLElement>('[data-event-sleep-mask]');

    ui.setEventSleepMask('ghosts', true);
    expect(mask?.classList.contains('is-visible')).toBe(true);
    expect(mask?.getAttribute('aria-hidden')).toBe('true');

    ui.clearEventPresentation();
    expect(mask?.classList.contains('is-visible')).toBe(false);

    for (const eventId of ['eerie-melody', 'face-on-the-moon', 'man-in-the-fog']) {
      ui.setEventSleepMask(eventId, true);
      expect(mask?.classList.contains('is-visible')).toBe(false);
    }
  });

  it('hides the reveal while an event resolves', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    await ui.showEventReveal(testEvent());
    ui.setEventSelection(new Map(), [{
      id: 'continue',
      label: 'Continue',
      unavailableReason: null,
    }]);
    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.classList).toContain('is-visible');

    ui.hideEventReveal();

    expect(caption.classList).not.toContain('is-visible');
    expect(caption.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows quantity only when an item represents more than one copy', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    ui.setAnchors([
      {
        id: 'bucket-test', itemType: 'bucket', toolId: null, action: null,
        remainingUses: null, quantity: 1, x: 140, y: 180, visible: true, depleted: false,
      },
      {
        id: 'cannedFood-test', itemType: 'cannedFood', toolId: null, action: 'eat',
        remainingUses: 1, quantity: 2, x: 340, y: 300, visible: true, depleted: false,
      },
    ]);

    expect(
      mount.querySelector('[data-anchor-id="bucket-test"] [role="tooltip"]')?.textContent,
    ).toBe('BUCKET');
    expect(
      mount.querySelector('[data-anchor-id="cannedFood-test"] [role="tooltip"]')?.textContent,
    ).toBe('FOOD ×2');
  });

  it.each([
    [99, 1],
    [67, 1],
    [66, 1],
    [34, 1],
    [33, 1],
  ] as const)('shows one repair energy at %i hull', (hull, energyCost) => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ hull }), () => null);

    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;
    expect(repair.querySelector('[role="tooltip"]')?.textContent)
      .toBe(`REPAIR ${'\u26a1'.repeat(energyCost)}`);
    expect(repair.getAttribute('aria-label'))
      .toBe(`REPAIR, ${['', 'one', 'two', 'three'][energyCost]} energy`);
  });

  it('shows Open and three energy symbols beside the recovered chest', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ energy: 3 }), () => null);
    ui.setAnchors([{
      id: 'persistent-chest',
      label: 'OPEN',
      description: 'A closed chest.',
      itemType: null,
      toolId: 'chest',
      action: 'openChest',
      remainingUses: null,
      quantity: 1,
      x: 400,
      y: 300,
      visible: true,
      depleted: false,
    }]);

    const chest = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="persistent-chest"]',
    )!;
    expect(chest.querySelector('[role="tooltip"]')?.textContent)
      .toBe(`OPEN ${'\u26a1'.repeat(3)}`);
    expect(chest.getAttribute('aria-label')).toBe('OPEN, three energy');
  });

  it('keeps full-hull repair visible but unavailable', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(
      snapshot({ hull: 100 }),
      (id) => id === 'repair' ? 'The hull needs no repair.' : null,
    );

    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;
    expect(repair.querySelector('[role="tooltip"]')?.textContent).toBe('REPAIR');
    expect(repair.getAttribute('aria-disabled')).toBe('true');
    repair.click();
    expect(action).not.toHaveBeenCalled();
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

  it.each([
    ['safe', 'Safe event. A shadow moves beneath the boat.'],
    ['uncertain', 'Uncertain event. A shadow moves beneath the boat.'],
    ['dangerous', 'Dangerous event. A shadow moves beneath the boat.'],
  ] as const)('announces %s event risk without the title', async (danger, accessibleName) => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.beginEventPresentation();
    await ui.showEventReveal({ ...testEvent(), danger });
    ui.setEventSelection(new Map());

    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.dataset.danger).toBe(danger);
    expect(caption.getAttribute('aria-label')).toBeNull();
    expect(caption.classList).not.toContain('is-visible');
    expect(caption.getAttribute('aria-hidden')).toBe('true');
    expect(caption.querySelector<HTMLElement>('[data-event-title]')?.hidden).toBe(true);
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('');
    expect(caption.querySelector<HTMLElement>('[data-event-detail]')?.hidden).toBe(true);
    expect(caption.querySelector<HTMLElement>('[data-event-risk]')?.hidden).toBe(true);
    await Promise.resolve();
    expect(mount.querySelector('[data-survival-announcer]')?.textContent).toBe(accessibleName);
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

  it('uses a top-right journal close icon and omits the empty title', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.showJournal([]);

    const close = mount.querySelector<HTMLButtonElement>('[data-journal-close]')!;
    expect(close.textContent).toBe('×');
    expect(close.getAttribute('aria-label')).toBe('Close journal');
    expect(close.classList).toContain('journal-page__close');
    expect(mount.querySelector('[data-journal-title]')?.textContent)
      .toBe('The journal is still waiting for its first completed day.');
    expect(mount.querySelector('[data-journal-title]')?.getAttribute('data-empty')).toBe('true');
    expect(mount.querySelector<HTMLElement>('[data-journal-story]')?.hidden).toBe(true);
    expect(mount.textContent).not.toContain('NO COMPLETED ENTRIES YET');
    expect(mainStyles).toMatch(
      /\.journal-page > \.journal-page__close\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*12px 14px auto auto;[^}]*width:\s*48px;[^}]*height:\s*48px;[^}]*padding:\s*6px 6px 9px;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font-size:\s*2\.4rem;/s,
    );
    expect(mainStyles).toMatch(
      /\.journal-page h2\[data-empty="true"\]\s*\{[^}]*font-family:\s*var\(--font-narrative\);[^}]*font-size:\s*clamp\(\.95rem, 2vw, 1\.12rem\);[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.7;/s,
    );
    expect(mainStyles).toMatch(
      /\.journal-page__navigation\s*\{[^}]*grid-row:\s*4;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*48px 1fr 48px;[^}]*align-self:\s*end;/s,
    );
    expect(mainStyles).toMatch(
      /\.journal-page\s*\{[^}]*background:\s*radial-gradient\(ellipse at 18% 78%/s,
    );
    expect(mainStyles).toMatch(
      /\.journal-overlay\s*\{[^}]*transition:\s*opacity 180ms ease, visibility 0s linear 180ms;/s,
    );
    expect(mainStyles).toMatch(
      /\.journal-overlay\.is-visible\s*\{[^}]*transition-delay:\s*0s;/s,
    );
    expect(mainStyles).not.toContain('.journal-page__close-strip');
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

  it('shows Check the Back choices in a centered fishing-style popup', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const event = {
      ...eventWithChoices('check', 'sleep'),
      id: 'check-the-back',
      danger: 'safe' as const,
    };

    ui.beginEventPresentation();
    void ui.showEventReveal(event);
    ui.setEventSelection(new Map(), [
      { id: 'check', label: 'Yes', unavailableReason: null },
      { id: 'sleep', label: 'No', unavailableReason: null },
    ]);

    const popup = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(popup.classList).toContain('confirmation-dialog');
    expect(popup.classList).toContain('scuba-popup-paper');
    expect(popup.getAttribute('role')).toBe('dialog');
    expect(popup.getAttribute('aria-modal')).toBe('true');
    expect(popup.querySelector('[data-event-title]')?.textContent).toBe('Check the back?');
    expect(labels('[data-event-choices] [data-event-choice]')).toEqual(['Yes', 'No']);
    expect(mainStyles).toMatch(
      /\.event-caption\.confirmation-dialog\s*\{[^}]*top:\s*50%;[^}]*width:\s*min\(480px,/s,
    );
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

  it('keeps a broken item anchor inspectable without exposing a usable action', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const state = new SurvivalSession(saved('bucket'), {
      seed: 1,
      initialConditions: { 'bucket-1': 'broken' },
    }).snapshot();
    ui.render(state, () => null);
    ui.setAnchors([{
      id: 'bucket-1', itemType: 'bucket', toolId: null, action: null, remainingUses: 0,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const broken = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-1"]')!;
    expect(broken.disabled).toBe(false);
    expect(broken.querySelector('[role="tooltip"]')?.textContent).toBe('BUCKET');
    expect(broken.getAttribute('aria-description')).toContain('BROKEN');
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

  it('uses the standard 2.5 second fade for Midnight Tour travel', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);
    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;

    await ui.setSleepCoverProfile('midnight-tour');
    expect(cover.dataset.profile).toBe('midnight-tour');
    let settled = false;
    const pending = ui.setSleepCovered(true);
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(2_499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(mainStyles).not.toMatch(
      /\.sleep-cover\[data-profile="midnight-tour"\][^{]*\{[^}]*transition-duration:/s,
    );
  });

  it('covers the Midnight Tour attack instantly', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);
    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;

    await ui.setSleepCoverProfile('midnight-attack');
    const pending = ui.setSleepCovered(true);

    expect(cover.classList).toContain('is-covered');
    await pending;
    expect(cover.dataset.profile).toBe('midnight-attack');
    expect(mainStyles).toMatch(
      /\.sleep-cover\[data-profile="midnight-attack"\][^{]*\{[^}]*transition-duration:\s*0s/s,
    );
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

  it('publishes first and repeated identical outcomes as fresh live mutations', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const announcer = mount.querySelector<HTMLElement>('[data-survival-announcer]');
    expect(announcer).not.toBeNull();
    if (!announcer) return;
    const publications: string[] = [];
    const observer = new MutationObserver(() => {
      if (announcer.textContent) publications.push(announcer.textContent);
    });
    observer.observe(announcer, { childList: true, characterData: true, subtree: true });
    ui.showFeedback({ accepted: true, message: 'The patch holds.' });
    await Promise.resolve();
    await Promise.resolve();
    ui.showFeedback({ accepted: true, message: 'The patch holds.' });
    await Promise.resolve();
    await Promise.resolve();

    observer.disconnect();
    expect(publications.filter((message) => message === 'The patch holds.')).toHaveLength(2);
  });

  it('cancels a deferred live announcement when disposed', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const announcer = mount.querySelector<HTMLElement>('[data-survival-announcer]');
    expect(announcer).not.toBeNull();
    if (!announcer) return;
    const publications: string[] = [];
    const observer = new MutationObserver(() => publications.push(announcer.textContent ?? ''));
    observer.observe(announcer, { childList: true, characterData: true, subtree: true });

    ui.showFeedback({ accepted: true, message: 'Too late.' });
    ui.dispose();
    await Promise.resolve();
    await Promise.resolve();

    observer.disconnect();
    expect(publications).not.toContain('Too late.');
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

  it('routes the projected boat pillow to End Day', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);

    const pillow = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="end-day-pillow"]',
    )!;
    pillow.click();

    expect(action).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith('endDay', undefined);
  });

  it('emits fishing directly from the rod and ignores number keys', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot({ bait: 2 }), () => null);

    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));

    expect(action).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith('fish', undefined);
    expect(mount.querySelector('[data-action-options]')).toBeNull();
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

    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    layer.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 190, clientY: 230 }));
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 190, clientY: 230 }));
    expect(cast).toHaveBeenCalledOnce();
    expect(cast).toHaveBeenCalledWith({ x: 150, y: 160 });

    ui.setFishingState({ mode: 'waiting', message: 'WAIT FOR A BITE', biteTarget: null });
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 220, clientY: 260 }));
    ui.setFishingState({ mode: 'result', message: 'IT GOT AWAY', biteTarget: null });
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

  it('places catch information beside the landed bow display', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const result = mount.querySelector<HTMLElement>('[data-fishing-result]')!;

    ui.showFishingResult({
      caption: 'LARGE CATCH',
      title: 'TUNA',
      detail: '+2 FOOD',
      catchTarget: {
        x: 260, y: 240, width: 110, height: 70, depth: 2, visible: true,
      },
    });

    expect(result.dataset.anchorState).toBe('projected');
    expect(mount.querySelector('[data-fishing-result-caption]')?.textContent).toBe('LARGE CATCH');
    expect(mount.querySelector('[data-fishing-result-title]')?.textContent).toBe('TUNA');
    expect(mount.querySelector('[data-fishing-result-detail]')?.textContent).toBe('+2 FOOD');
    expect(mainStyles).toMatch(
      /\.routine-dialog--fishing \.routine-dialog__card > \*\s*\{[^}]*justify-self:\s*center;/s,
    );
    expect(document.activeElement).toBe(
      mount.querySelector('[data-fishing-result-continue]'),
    );
  });

  it('opens drifting item focus from an initial anchor and returns to the boat', () => {
    const style = document.createElement('style');
    style.textContent = mainStyles.match(
      /\.drifting-item-focus__card nav(?:\[hidden\])?\s*\{[^}]*\}/g,
    )?.join('\n') ?? '';
    const mount = document.createElement('main');
    document.body.append(style, mount);
    const ui = createUI(mount);
    const selected = vi.fn();
    const returned = vi.fn();
    ui.onDriftingItemSelect = selected;
    ui.onDriftingItemBack = returned;
    ui.setAnchors([{
      id: 'event:drifting-supplies',
      eventFocusId: 'drifting-supplies',
      tooltip: false,
      label: 'SALVAGE',
      description: 'Floating salvage drifts beside the boat.',
      itemType: null,
      toolId: null,
      action: null,
      remainingUses: null,
      x: 420,
      y: 260,
      visible: true,
      depleted: false,
      hitArea: { width: 64, height: 64, depth: 2 },
    }]);
    ui.beginEventPresentation();
    ui.setEventSelection(new Map());

    const anchor = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="event:drifting-supplies"]',
    )!;
    expect(anchor.querySelector('.boat-tooltip')).toBeNull();
    expect(anchor.dataset.eventState).toBe('available');
    expect(anchor.disabled).toBe(false);
    expect(anchor.tabIndex).toBe(0);
    anchor.click();
    expect(selected).toHaveBeenCalledWith('drifting-supplies');

    ui.showDriftingItemFocus({
      eventId: 'drifting-supplies',
      target: { x: 420, y: 260, width: 64, height: 64, depth: 2, visible: true },
      choices: [
        {
          id: 'retrieve',
          label: 'RETRIEVE',
          energyCost: 3,
          energyOwner: 'player',
          unavailableReason: null,
        },
        {
          id: 'delegate-carlitos',
          label: 'SEND CARLITOS',
          energyCost: 3,
          energyOwner: 'carlitos',
          unavailableReason: 'Carlitos needs more energy.',
        },
        { id: 'sleep', label: 'LET IT DRIFT', unavailableReason: null },
      ],
    });

    const focus = mount.querySelector<HTMLElement>('[data-drifting-item-focus]')!;
    const focusCard = focus.querySelector<HTMLElement>('.drifting-item-focus__card')!;
    expect(focusCard.classList).toContain('dive-result__paper');
    expect(focus.querySelector('[data-drifting-item-title]')).toBeNull();
    expect(focus.getAttribute('aria-labelledby')).toBeNull();
    expect(focus.getAttribute('aria-label')).toBe('Pickup choices');
    expect(focus.textContent).not.toContain('DRIFTING BARREL');
    expect(focus.dataset.anchorState).toBe('projected');
    const popupX = Number.parseFloat(focus.style.getPropertyValue('--drifting-x'));
    const popupWidth = Number.parseFloat(focus.style.getPropertyValue('--drifting-width'));
    const targetLeft = 420 - 64 / 2;
    const targetRight = 420 + 64 / 2;
    expect(popupX + popupWidth <= targetLeft || popupX >= targetRight).toBe(true);
    expect(focus.textContent).not.toContain('DRIFTING ITEM');
    const energyCosts = [...focus.querySelectorAll<HTMLElement>('.drifting-item-focus__cost')];
    expect(energyCosts.map(({ textContent }) => textContent)).toEqual(['⚡️⚡️⚡️', '⚡️⚡️⚡️']);
    expect(energyCosts.map((cost) => cost.getAttribute('aria-label')))
      .toEqual(['3 energy', '3 energy']);
    expect(focus.textContent).not.toContain('PLAYER');
    expect(focus.textContent).not.toContain('CARLITOS —');
    expect(mainStyles).toMatch(
      /\.drifting-item-focus__choice-main\s*\{[^}]*font-size:\s*1rem;/s,
    );
    expect(focus.textContent).toContain('LET IT DRIFT');
    expect(focus.querySelector('.event-choice__reason')?.textContent)
      .toBe('Carlitos needs more energy.');
    expect(document.activeElement).toBe(
      focus.querySelector<HTMLButtonElement>('[data-event-choice="retrieve"]'),
    );

    const back = focus.querySelector<HTMLButtonElement>('[data-drifting-item-back]')!;
    expect(back.parentElement).toBe(focus);
    expect(back.parentElement).not.toBe(focusCard);
    expect(back.textContent?.trim()).toBe('');
    expect(back.querySelector('[data-drifting-item-back-icon] path')?.getAttribute('d'))
      .toBe('M9 3h6v10h5l-8 8-8-8h5z');
    expect(back.getAttribute('aria-label')).toBe('Return to boat');
    expect(mainStyles).toMatch(
      /\.drifting-item-focus__back-icon\s*\{[^}]*width:\s*82px;[^}]*height:\s*82px;/s,
    );
    expect(mainStyles).toMatch(
      /\.drifting-item-focus__back:hover\s*\{[^}]*color:\s*#ead4a5;[^}]*\}/s,
    );
    expect(mainStyles).not.toMatch(
      /\.drifting-item-focus__back:hover\s*,\s*\.drifting-item-focus__back:focus-visible/,
    );
    expect(mainStyles).toMatch(
      /\.drifting-item-focus__back:focus-visible\s*\{[^}]*outline:\s*none;/s,
    );
    back.click();
    expect(returned).toHaveBeenCalledOnce();
  });

  it('uses a top-left chest icon to switch between front and rear camera views', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const turn = vi.fn();
    ui.onCameraTurn = turn;
    const button = mount.querySelector<HTMLButtonElement>('[data-camera-turn]')!;
    const returnButton = mount.querySelector<HTMLButtonElement>(
      '[data-camera-return-front]',
    )!;

    expect(button.hidden).toBe(true);
    expect(returnButton.hidden).toBe(true);
    expect(button.classList).toContain('chest-camera-turn');
    expect(button.classList).not.toContain('drifting-item-focus__back');
    expect(button.parentElement).toBe(mount.querySelector('[data-survival-top]'));
    const chestArtwork = button.querySelector('[data-ui-artwork="chest"]');
    expect(chestArtwork).not.toBeNull();
    expect(chestArtwork?.querySelector('[data-chest-scale]')?.getAttribute('transform'))
      .toBe('translate(40 36) scale(.84 .8) translate(-40 -36)');
    const keyhole = chestArtwork?.querySelector('.ui-artwork__chest-keyhole');
    expect(keyhole).not.toBeNull();
    expect(keyhole?.getAttribute('transform'))
      .toBe('translate(40 42.5) scale(.5) translate(-40 -42.5)');
    expect(mainStyles).toContain('.ui-artwork__chest-keyhole { fill: #050606; }');
    expect(button.querySelector('[data-camera-turn-icon]')).toBeNull();
    expect(mainStyles).toContain(
      '.ui-artwork--chest path:not(.ui-artwork__shine) { stroke-width: 7.125; vector-effect: non-scaling-stroke; }',
    );

    ui.setCameraTurnState(true, false);
    expect(button.hidden).toBe(false);
    expect(returnButton.hidden).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Look behind at the chest');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.querySelector('[data-camera-turn-tooltip]')?.textContent).toBe('LOOK BACK');
    button.click();
    expect(turn).toHaveBeenCalledOnce();

    ui.setCameraTurnState(true, true);
    expect(returnButton.hidden).toBe(false);
    expect(returnButton.getAttribute('aria-label')).toBe('Return to front of boat');
    expect(returnButton.querySelector('svg')?.getAttribute('fill')).toBe('none');
    expect(returnButton.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
    expect(returnButton.querySelectorAll('path')).toHaveLength(2);
    expect(button.getAttribute('aria-label')).toBe('Look forward from the chest');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.querySelector('[data-camera-turn-tooltip]')?.textContent)
      .toBe('LOOK FORWARD');
    expect(mainStyles).toMatch(
      /\.survival-meters\s*\{[^}]*position:\s*absolute;[^}]*top:\s*18px;[^}]*left:\s*22px;/s,
    );
    expect(mainStyles).toMatch(
      /\.chest-camera-turn\s*\{[^}]*width:\s*114px;[^}]*height:\s*105px;/s,
    );
    expect(mainStyles).not.toContain('#c96d3d');

    returnButton.click();
    expect(turn).toHaveBeenCalledTimes(2);

    ui.setCameraTurnState(true, false);
    expect(returnButton.hidden).toBe(true);

    ui.setCameraTurnState(false, false);
    expect(button.hidden).toBe(true);
    ui.dispose();
  });

  it('focuses the back control when no drifting item choice is available', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);

    ui.showDriftingItemFocus({
      eventId: 'drifting-supplies',
      target: null,
      choices: [
        {
          id: 'retrieve',
          label: 'RETRIEVE',
          energyCost: 3,
          energyOwner: 'player',
          unavailableReason: 'You need more energy.',
        },
        {
          id: 'delegate-carlitos',
          label: 'SEND CARLITOS',
          energyCost: 3,
          energyOwner: 'carlitos',
          unavailableReason: 'Carlitos needs more energy.',
        },
      ],
    });

    expect(document.activeElement).toBe(
      mount.querySelector<HTMLButtonElement>('[data-drifting-item-back]'),
    );
  });

  it('keeps the fishing Back control wide, transparent, and above fishing input', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const exit = vi.fn();
    const cast = vi.fn(() => true);
    ui.onFishingViewExit = exit;
    ui.onFishingCast = cast;
    ui.setFishingState({ mode: 'aiming', message: 'Cast your line.', biteTarget: null });
    ui.setFishingViewExitVisible(true);
    const button = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;
    const rule = mainStyles.match(/\.fishing-view-exit\s*\{([^}]*)\}/s)?.[1] ?? '';
    const arrowRule = mainStyles.match(
      /\.fishing-view-exit__arrow\s*\{([^}]*)\}/s,
    )?.[1] ?? '';
    const arrow = button.querySelector<SVGElement>('.fishing-view-exit__arrow')!;

    expect(button.hidden).toBe(false);
    expect(button.closest('[data-fishing]')).not.toBeNull();
    expect(button.closest('[inert]')).toBeNull();
    expect(button.textContent?.trim()).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Return to boat view');
    expect(mount.querySelector('.survival-ui')?.getAttribute('data-fishing-exit-visible')).toBe('true');
    expect(rule).toMatch(/z-index:\s*19/);
    expect(rule).toMatch(/width:\s*min\(36rem,\s*calc\(100% - 32px\)\)/);
    expect(rule).toMatch(/min-height:\s*168px/);
    expect(rule).toMatch(/padding:\s*12px 24px 24px/);
    expect(rule).toMatch(/border:\s*0/);
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).not.toContain('border-radius');
    expect(arrow.tagName.toLowerCase()).toBe('svg');
    expect(arrow.getAttribute('viewBox')).toBe('4 4 16 16');
    expect(arrow.getAttribute('fill')).toBe('none');
    expect(arrow.getAttribute('stroke')).toBe('currentColor');
    expect([...arrow.querySelectorAll('path')].map((path) => path.getAttribute('d')))
      .toEqual(['M12 5v14', 'm19 12-7 7-7-7']);
    expect(arrowRule).toMatch(/width:\s*132px/);
    expect(arrowRule).toMatch(/height:\s*132px/);
    expect(mainStyles).not.toContain('.fishing-view-exit__arrow::before');
    expect(mainStyles).toMatch(
      /\.boat-anchors\s*\{[^}]*z-index:\s*10;/s,
    );
    expect(mainStyles).toMatch(
      /\.survival-ui\[data-fishing-exit-visible="true"\] \.boat-tooltip\s*\{[^}]*visibility:\s*hidden;/s,
    );

    button.dispatchEvent(new MouseEvent('pointerup', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    }));
    button.click();
    expect(exit).toHaveBeenCalledOnce();
    expect(cast).not.toHaveBeenCalled();
  });

  it('keeps the fishing Back control active after result confirmation', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const exit = vi.fn();
    ui.onFishingViewExit = exit;

    ui.setFishingViewExitVisible(true);
    ui.setFishingState({ mode: 'ready', message: '', biteTarget: null });

    const layer = mount.querySelector<HTMLElement>('[data-fishing]')!;
    const button = mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!;
    expect(layer.classList).toContain('is-visible');
    expect(layer.hasAttribute('inert')).toBe(false);
    expect(button.hidden).toBe(false);
    expect(document.activeElement).toBe(button);

    button.click();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('uses the authored fishing-fade duration while preserving supersession', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    activeUIs.push(ui);
    const fade = mount.querySelector<HTMLElement>('[data-fishing-fade]')!;

    let firstSettled = false;
    const first = ui.setFishingFade(true);
    void first.then(() => { firstSettled = true; });
    expect(fade.classList).toContain('is-covered');
    await vi.advanceTimersByTimeAsync(179);
    expect(firstSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await first;

    const second = ui.setFishingFade(false);
    expect(fade.classList).not.toContain('is-covered');
    const replacement = ui.setFishingFade(true);
    await second;
    await vi.advanceTimersByTimeAsync(180);
    await replacement;
    expect(mainStyles).toMatch(/\.fishing-fade\s*\{[^}]*transition:\s*opacity/s);
    expect(mainStyles).not.toMatch(/prefers-reduced[-]motion/);
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

  it('keeps unavailable projected actions focusable while suppressing commands', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), (id) => id === 'fish' ? 'The line is tangled.' : null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;

    expect(fish.disabled).toBe(false);
    expect(fish.getAttribute('aria-disabled')).toBe('true');
    expect(fish.getAttribute('aria-description')).toContain('line is tangled');
    fish.focus();
    expect(document.activeElement).toBe(fish);
    fish.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(action).not.toHaveBeenCalled();

    ui.setBusy(true);
    expect(fish.disabled).toBe(true);
  });

  it('shows one visible rejection for an unavailable action click without locking or moving focus', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const reason = 'The line is tangled.';
    const announcer = mount.querySelector<HTMLElement>('[data-survival-announcer]')!;
    const publications: string[] = [];
    const observer = new MutationObserver(() => {
      if (announcer.textContent) publications.push(announcer.textContent);
    });
    observer.observe(announcer, { childList: true, characterData: true, subtree: true });
    ui.onAction = action;
    ui.render(snapshot(), (id) => id === 'fish' ? reason : null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const feedback = mount.querySelector<HTMLElement>('[data-survival-feedback]')!;

    fish.focus();
    fish.click();
    await Promise.resolve();
    await Promise.resolve();

    observer.disconnect();
    expect(feedback.textContent).toBe(reason);
    expect(feedback.classList).toContain('is-visible');
    expect(feedback.dataset.accepted).toBe('false');
    expect(publications.filter((message) => message === reason)).toHaveLength(1);
    expect(action).not.toHaveBeenCalled();
    expect(mount.querySelector('.survival-ui')?.hasAttribute('aria-busy')).toBe(false);
    expect(fish.disabled).toBe(false);
    expect(document.activeElement).toBe(fish);
  });

  it('does not bind numbered keys to survival actions or expose shortcut metadata', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const reason = 'The line is tangled.';
    const announcer = mount.querySelector<HTMLElement>('[data-survival-announcer]')!;
    const publications: string[] = [];
    const observer = new MutationObserver(() => {
      if (announcer.textContent) publications.push(announcer.textContent);
    });
    observer.observe(announcer, { childList: true, characterData: true, subtree: true });
    ui.onAction = action;
    ui.render(snapshot(), (id) => id === 'fish' ? reason : null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const feedback = mount.querySelector<HTMLElement>('[data-survival-feedback]')!;

    fish.focus();
    for (const key of ['1', '2', '3', '4', '5', '6', '7']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    await Promise.resolve();
    await Promise.resolve();

    observer.disconnect();
    expect(feedback.classList).not.toContain('is-visible');
    expect(publications).toEqual([]);
    expect(action).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(fish);
    mount.querySelectorAll('[data-action]').forEach((button) => {
      expect(button.hasAttribute('aria-keyshortcuts')).toBe(false);
      expect(button.getAttribute('aria-description')).not.toContain('[1]');
      expect(button.getAttribute('aria-description')).not.toContain('[7]');
    });
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

  it('keeps number keys inactive while Escape retains its overlay behavior', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true }));
    expect(action).not.toHaveBeenCalled();

    void ui.showEventReveal(testEvent());
    ui.setEventSelection(new Map());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(action).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pause).toHaveBeenCalledWith(true);
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
    expect(mount.querySelector('[data-pause]')?.classList).toContain('is-visible');
    expect(document.activeElement).toBe(mount.querySelector('[data-resume]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pause).toHaveBeenLastCalledWith(false);
    ui.setPaused(false);
    ui.setPaused(true);
    mount.querySelector<HTMLButtonElement>('[data-resume]')!.click();
    expect(pause).toHaveBeenLastCalledWith(false);
  });

  it('requires confirmation before restarting from pause', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const restart = vi.fn();
    ui.onRestart = restart;
    ui.render(snapshot(), () => null);
    ui.setPaused(true);

    const button = mount.querySelector<HTMLButtonElement>('[data-pause-restart]')!;
    expect(button.textContent).toContain('START OVER');
    button.click();
    expect(restart).not.toHaveBeenCalled();
    expect(button.textContent).toContain('CONFIRM START OVER');

    ui.setPaused(false);
    ui.setPaused(true);
    expect(button.textContent).toContain('START OVER');
    button.click();
    button.click();
    expect(restart).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
  });

  it('keeps the pause overlay free of scroll containers', () => {
    expect(mainStyles).toMatch(
      /\.pause-overlay \.cinematic-overlay__content\s*\{[^}]*overflow:\s*hidden;/s,
    );
    expect(mainStyles).toMatch(
      /\.cinematic-overlay\.pause-overlay\s*\{[^}]*padding-block:\s*clamp\(8px, 4dvh, 24px\);/s,
    );
    expect(mainStyles).toMatch(
      /\.pause-overlay \.salvage-action\s*\{[^}]*min-height:\s*clamp\(44px, 12dvh, 58px\);/s,
    );
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
    ui.setPaused(true);
    expect(endingLayer.hasAttribute('inert')).toBe(true);
    mount.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(restarted).not.toHaveBeenCalled();
    ui.setPaused(false);
    expect(endingLayer.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(endingTitle);
  });

  it('routes projected actions without pointer coordinates', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    expect(ui).not.toHaveProperty('onPointer');
    ui.onAction = action;
    ui.render(snapshot({ hull: 40 }), () => null);

    mount.querySelector<HTMLButtonElement>('[data-action="repair"]')!.click();
    expect(action).toHaveBeenCalledWith('repair', undefined);
  });

  it('shows the terminal record and emits full restart once', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const restart = vi.fn();
    ui.onRestart = restart;

    ui.showEnding({ id: 'sinking', day: 8, savedPickupCount: 4, cause: { eventId: 'tornado' } });

    expect(mount.querySelector('[data-ending-title]')?.textContent).toBe('THE BOAT IS GONE');
    expect(mount.querySelector('[data-ending-body]')?.textContent)
      .toBe('The last damage opened the boat to the sea.');
    expect(mount.querySelector('[data-ending-stats]')?.textContent)
      .toBe('DAY 8 · 4 PICKUPS SAVED');
    expect(mount.querySelector('[data-ending-cause]')?.textContent)
      .toBe('LAST EVENT: TORNADO');
    mount.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('keeps status controls separate from the physical End Day pillow anchor', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);

    const top = mount.querySelector('[data-survival-top]')!;
    const status = top.querySelector('[data-survival-status]')!;
    const journal = top.querySelector('[data-journal-open]')!;
    const endDay = mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;

    expect(status.querySelector('[data-day]')?.textContent).toBe('DAY 1');
    expect(status.querySelector('[data-phase]')).toBeNull();
    expect(status.querySelector('[data-weather]')).toBeNull();
    expect(status.querySelector('[data-ui-artwork="journal"]')).toBeNull();
    expect(journal.querySelector('[data-ui-artwork="journal"]')).not.toBeNull();
    expect(mainStyles).toMatch(
      /\.journal-marker\s*\{[^}]*width:\s*114px;[^}]*height:\s*105px/s,
    );
    expect(mainStyles).toMatch(
      /\.journal-marker__art\s*\{[^}]*width:\s*114px;[^}]*height:\s*105px/s,
    );
    expect(top.querySelector('[data-action="endDay"]')).toBeNull();
    expect(endDay.closest('[data-boat-anchors]')).not.toBeNull();
    expect(endDay.dataset.anchorId).toBe('end-day-pillow');
    expect(endDay.dataset.tool).toBe('pillow');
    expect(endDay.querySelector('[role="tooltip"]')?.textContent).toBe('END DAY');
    expect(endDay.getAttribute('aria-description')).toContain('Rest on the pillow');
    expect(endDay.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(mount.querySelector('[data-ui-artwork="pillow"]')).toBeNull();
    ui.dispose();
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
