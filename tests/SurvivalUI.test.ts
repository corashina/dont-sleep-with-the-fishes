// @vitest-environment jsdom
// Importance: 4/5. Protects survival commands and access.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import type { JournalEntry } from '../src/survival/journal';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';
import type { SurvivalEventDefinition, SurvivalSnapshot } from '../src/survival/survivalTypes';
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
      resolution: 'endure',
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
      id: 'end-day-lantern', itemType: null, toolId: 'lantern', action: 'endDay',
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
    outcomes: [{ weight: 1, message: 'Nothing happens.', effects: {} }] as const,
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
      outcomes: [{ weight: 1, message: 'Nothing happens.', effects: {} }],
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

describe('SurvivalUI', () => {
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

  it('routes Drifting Loot through its projected prop instead of a response button', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const selected = vi.fn();
    const highlighted = vi.fn();
    ui.onEventChoice = selected;
    ui.onAnchorHighlight = highlighted;
    ui.setAnchors([
      {
        id: 'drifting-loot',
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
        id: 'end-day-lantern',
        itemType: null,
        toolId: 'lantern',
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
        anchorId: 'drifting-loot',
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
      '[data-anchor-id="drifting-loot"]',
    )!;
    expect(loot.querySelector('[role="tooltip"]')?.textContent)
      .toBe('CRATE — ⚡⚡⚡');
    expect(loot.dataset.eventChoice).toBe('retrieve');
    expect(loot.dataset.backingInstanceId).toBeUndefined();
    expect(loot.getAttribute('aria-disabled')).toBe('false');
    expect(mount.querySelector('[data-anchor-id="end-day-lantern"]')?.getAttribute(
      'data-event-choice',
    )).toBe('sleep');
    loot.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlighted).toHaveBeenLastCalledWith('drifting-loot');
    loot.click();
    loot.focus();
    press('[data-anchor-id="drifting-loot"]', 'Enter');
    expect(selected.mock.calls).toEqual([['retrieve'], ['retrieve']]);
    expect(mainStyles).toMatch(
      /\.boat-anchor\s*\{[^}]*cursor:\s*pointer;/s,
    );
  });

  it('keeps low-energy Drifting Loot inspectable with an insufficient-energy tooltip', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const selected = vi.fn();
    ui.onEventChoice = selected;
    ui.setAnchors([{
      id: 'drifting-loot',
      label: 'BARREL',
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
      anchorId: 'drifting-loot',
      energyCost: 3,
    }]);

    const loot = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="drifting-loot"]',
    )!;
    expect(loot.querySelector('[role="tooltip"]')?.textContent)
      .toBe('BARREL — ⚡⚡⚡ — INSUFFICIENT ENERGY');
    expect(loot.disabled).toBe(false);
    expect(loot.getAttribute('aria-disabled')).toBe('true');
    loot.click();
    expect(selected).not.toHaveBeenCalled();
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

  it('presents events through the scene and routes only eligible physical anchors', async () => {
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
      { id: 'end-day-lantern', itemType: null, toolId: 'lantern', action: 'endDay', remainingUses: null, x: 640, y: 280, visible: true, depleted: false },
    ]);
    const selected = vi.fn();
    const endureEvent = vi.fn();
    ui.onEventItem = selected;
    ui.onEndure = endureEvent;

    ui.beginEventPresentation();
    expect(mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')?.hidden).toBe(false);
    expect(mount.querySelector('[data-action="endDay"]')?.getAttribute('aria-disabled')).toBe('true');
    const reveal = ui.showEventReveal(testEvent(['bucket']));
    await vi.runAllTimersAsync();
    await reveal;
    expect(mount.querySelector('[data-event]')).toBeNull();
    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.querySelector('[data-event-title]')?.textContent).toBe('A shadow');
    expect(caption.querySelector('[data-event-danger]')).toBeNull();
    expect(caption.querySelector('[data-event-reveal]')).toBeNull();
    expect(caption.dataset.danger).toBe('dangerous');
    expect(caption.getAttribute('aria-label')).toBe('Dangerous event: A shadow');

    ui.setEventSelection(new Map([['bucket-1', 'bucket']]));
    const bucket = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-1"]')!;
    const umbrella = mount.querySelector<HTMLButtonElement>('[data-anchor-id="umbrella-2"]')!;
    expect(bucket.dataset.eventState).toBe('eligible');
    expect(bucket.getAttribute('aria-disabled')).toBe('false');
    expect(bucket.querySelector('[role="tooltip"]')?.textContent).toBe('BUCKET');
    expect(umbrella.dataset.eventState).toBe('muted');
    expect(umbrella.disabled).toBe(false);
    expect(umbrella.getAttribute('aria-disabled')).toBe('true');

    umbrella.click();
    expect(selected).not.toHaveBeenCalled();
    bucket.click();
    expect(selected).toHaveBeenCalledWith('bucket', 'bucket-1');
    expect(mount.querySelector<HTMLButtonElement>('[data-endure]')?.hidden).toBe(true);

    ui.setEventSelection(new Map());
    const endure = mount.querySelector<HTMLButtonElement>('[data-endure]')!;
    expect(endure.hidden).toBe(false);
    expect(endure.tabIndex).toBe(0);
    endure.focus();
    endure.click();
    expect(endureEvent).toHaveBeenCalledOnce();

    ui.clearEventPresentation();
    expect(mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')?.hidden).toBe(false);
    expect(mount.querySelector('[data-action="endDay"]')?.getAttribute('aria-disabled')).toBe('false');
  });

  it('routes the event sleep response through the lantern instead of the caption', async () => {
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

    const lantern = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="end-day-lantern"]',
    )!;
    expect(mount.querySelector('[data-event-choice="sleep"]')).toBe(lantern);
    expect(mount.querySelector('[data-event-choices]')?.textContent).not.toContain('Sleep');
    expect(lantern.querySelector('[role="tooltip"]')?.textContent).toBe('SLEEP');
    expect(lantern.getAttribute('aria-disabled')).toBe('false');

    lantern.click();
    expect(choice).toHaveBeenCalledWith('sleep');
    expect(action).not.toHaveBeenCalled();

    ui.clearEventPresentation();
    expect(lantern.querySelector('[role="tooltip"]')?.textContent).toBe('END DAY');
    expect(lantern.hasAttribute('data-event-choice')).toBe(false);
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
    [66, 2],
    [34, 2],
    [33, 3],
  ] as const)('shows the repair tooltip tier at %i hull: %i energy', (hull, energyCost) => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ hull }), () => null);

    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;
    expect(repair.querySelector('[role="tooltip"]')?.textContent)
      .toBe(`REPAIR ${'\u26a1'.repeat(energyCost)}`);
    expect(repair.getAttribute('aria-label'))
      .toBe(`REPAIR, ${['', 'one', 'two', 'three'][energyCost]} energy`);
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
    ['safe', 'Safe event: A shadow'],
    ['uncertain', 'Uncertain event: A shadow'],
    ['dangerous', 'Dangerous event: A shadow'],
  ] as const)('announces %s event risk without visible risk copy', async (danger, accessibleName) => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.beginEventPresentation();
    await ui.showEventReveal({ ...testEvent(), danger });

    const caption = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    expect(caption.dataset.danger).toBe(danger);
    expect(caption.getAttribute('aria-label')).toBe(accessibleName);
    expect(caption.textContent.trim()).toBe('A shadow');
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

  it('publishes item, repair-toolbox, and lantern hover and focus', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    ui.render(snapshot(), () => null);
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-test"]')!;
    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;
    const lantern = mount.querySelector<HTMLButtonElement>('[data-anchor-id="end-day-lantern"]')!;

    repair.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('repair-tools');
    repair.focus();
    repair.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('repair-tools');
    repair.blur();
    expect(highlight).toHaveBeenLastCalledWith(null);

    lantern.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('end-day-lantern');
    lantern.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith(null);

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('bucket-test');
    item.focus();
    item.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('bucket-test');
    item.blur();
    expect(highlight).toHaveBeenLastCalledWith(null);

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    void ui.showEventReveal(testEvent());
    expect(highlight).toHaveBeenLastCalledWith('bucket-test');
  });

  it.each([
    {
      state: 'invisible',
      anchor: {
        id: 'bucket-test', itemType: 'bucket' as const, toolId: null, action: null, remainingUses: null,
        x: 140, y: 180, visible: false, depleted: false,
      },
    },
    {
      state: 'tool',
      anchor: {
        id: 'bucket-test', itemType: null, toolId: 'fishingRod' as const, action: 'fish' as const, remainingUses: null,
        x: 140, y: 180, visible: true, depleted: false,
      },
    },
  ])('does not republish latent hover after the anchor becomes $state', ({ anchor }) => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const hovered = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-test"]')!;
    const focused = mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-test"]')!;

    hovered.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    focused.focus();
    expect(highlight.mock.calls).toEqual([['bucket-test'], ['scubaSet-test']]);
    highlight.mockClear();

    ui.setAnchors([
      anchor,
      {
        id: 'scubaSet-test', itemType: 'scubaSet', toolId: null, action: 'dive', remainingUses: null,
        x: 240, y: 250, visible: true, depleted: false,
      },
    ]);
    focused.blur();

    expect(highlight).not.toHaveBeenCalledWith('bucket-test');
    expect(highlight.mock.calls).toEqual([[null]]);
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

  it('routes the projected boat lantern to End Day', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);

    const lantern = mount.querySelector<HTMLButtonElement>(
      '[data-anchor-id="end-day-lantern"]',
    )!;
    lantern.click();

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
      /\.routine-dialog--fishing \.routine-dialog__card > \*,\s*\.routine-dialog--salvage \.routine-dialog__card > \*\s*\{[^}]*justify-self:\s*center;/s,
    );
    expect(document.activeElement).toBe(
      mount.querySelector('[data-fishing-result-continue]'),
    );
  });

  it('shows the salvage result beside the held prop and issues Continue once', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const continued = vi.fn();
    ui.onDriftingLootContinue = continued;
    const target = {
      x: 420,
      y: 280,
      width: 96,
      height: 72,
      depth: 2,
      visible: true,
    };
    ui.showDriftingLootResult({
      caption: 'SALVAGE RECOVERED',
      title: '+2 FOOD',
      detail: '−3 ENERGY',
      target,
    });

    const result = mount.querySelector<HTMLElement>('[data-drifting-loot-result]')!;
    expect(result.dataset.anchorState).toBe('projected');
    expect(mainStyles).toMatch(
      /\.routine-dialog--fishing \.fishing-result-card > p\.fishing-result-detail,\s*\.routine-dialog--salvage \.fishing-result-card > p\.fishing-result-detail\s*\{/s,
    );
    const projectedX = result.style.getPropertyValue('--routine-x');
    target.x = 20;
    ui.setAnchors([]);
    expect(result.style.getPropertyValue('--routine-x')).toBe(projectedX);
    expect(mount.querySelector('[data-drifting-loot-result-caption]')?.textContent)
      .toBe('SALVAGE RECOVERED');
    expect(mount.querySelector('[data-drifting-loot-result-title]')?.textContent)
      .toBe('+2 FOOD');
    expect(mount.querySelector('[data-drifting-loot-result-detail]')?.textContent)
      .toBe('−3 ENERGY');

    const button = mount.querySelector<HTMLButtonElement>(
      '[data-drifting-loot-result-continue]',
    )!;
    expect(document.activeElement).toBe(button);
    button.click();
    button.click();
    expect(continued).toHaveBeenCalledOnce();
  });

  it('uses safe placement for unavailable salvage, repositions it, and cleans it up', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const continued = vi.fn();
    ui.onDriftingLootContinue = continued;
    ui.showDriftingLootResult({
      caption: 'SALVAGE RECOVERED',
      title: 'ENERGY BAR',
      detail: '−3 ENERGY',
      target: null,
    });

    const result = mount.querySelector<HTMLElement>('[data-drifting-loot-result]')!;
    const button = mount.querySelector<HTMLButtonElement>('[data-drifting-loot-result-continue]')!;
    expect(result.dataset.anchorState).toBe('fallback');
    expect(result.style.getPropertyValue('--routine-width')).toBe('360px');
    const initialX = result.style.getPropertyValue('--routine-x');
    ui.setAnchors([]);
    expect(result.style.getPropertyValue('--routine-x')).toBe(initialX);
    vi.spyOn(mount.querySelector<HTMLElement>('.survival-ui')!, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
      toJSON: () => ({}),
    });
    window.dispatchEvent(new Event('resize'));
    expect(result.style.getPropertyValue('--routine-x')).not.toBe(initialX);

    ui.hideDriftingLootResult();
    expect(result.classList).not.toContain('is-visible');
    expect(result.hasAttribute('inert')).toBe(true);
    expect(result.getAttribute('aria-hidden')).toBe('true');
    button.click();
    expect(continued).not.toHaveBeenCalled();

    ui.showDriftingLootResult({
      caption: 'SALVAGE RECOVERED',
      title: '+1 FOOD',
      detail: '−3 ENERGY',
      target: { x: 90, y: 180, width: 40, height: 40, depth: 2, visible: false },
    });
    expect(result.dataset.anchorState).toBe('fallback');
    ui.dispose();
    expect(mount.querySelector('.survival-ui')).toBeNull();
    expect(result.classList).not.toContain('is-visible');
    expect(result.hasAttribute('inert')).toBe(true);
    expect(result.getAttribute('aria-hidden')).toBe('true');
    button.click();
    expect(continued).not.toHaveBeenCalled();
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

    expect(button.hidden).toBe(false);
    expect(button.closest('[data-fishing]')).not.toBeNull();
    expect(button.closest('[inert]')).toBeNull();
    expect(button.textContent?.trim()).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Return to boat view');
    expect(mount.querySelector('.survival-ui')?.getAttribute('data-fishing-exit-visible')).toBe('true');
    expect(rule).toMatch(/z-index:\s*19/);
    expect(rule).toMatch(/width:\s*min\(36rem,\s*calc\(100% - 32px\)\)/);
    expect(rule).toMatch(/min-height:\s*84px/);
    expect(rule).toMatch(/border:\s*0/);
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).not.toContain('border-radius');
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

  it('does not restore anchor focus or republish a highlight while disposing active fishing', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlights: Array<string | null> = [];
    ui.onAnchorHighlight = (anchorId) => highlights.push(anchorId);
    ui.render(snapshot(), () => null);
    const dive = mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-test"]')!;
    const teardownFocus = vi.fn();
    dive.addEventListener('focus', teardownFocus);
    dive.focus();
    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    expect(highlights).toEqual(['scubaSet-test', null]);
    teardownFocus.mockClear();
    const callbacksBeforeDispose = highlights.length;

    ui.dispose();

    expect(teardownFocus).not.toHaveBeenCalled();
    expect(highlights.at(-1)).toBeNull();
    expect(highlights.slice(callbacksBeforeDispose)).toEqual([]);
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

    ui.showEnding('sunk', 2, 7, 40);
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

    ui.showEnding('sunk', 2, 7, 40);
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

  it('shows distinct terminal copy and emits full restart once', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const restart = vi.fn();
    ui.onRestart = restart;

    ui.showEnding('sunk', 8, 1234, 37);

    expect(mount.querySelector('[data-ending-title]')?.textContent).toContain('Boat is gone');
    expect(mount.querySelector('[data-ending-stats]')?.textContent).toContain('8 DAYS');
    expect(mount.querySelector('[data-ending-stats]')?.textContent).toContain('00:37');
    expect(mount.querySelector('[data-ending-stats]')?.textContent).toContain('1234');
    mount.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('keeps status controls separate from the physical End Day lantern anchor', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);

    const top = mount.querySelector('[data-survival-top]')!;
    const status = top.querySelector('[data-survival-status]')!;
    const journal = top.querySelector('[data-journal-open]')!;
    const endDay = mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;

    expect(status.querySelector('[data-day]')?.textContent).toBe('DAY 1');
    expect(status.querySelector('[data-phase]')?.textContent).toBe('DAYLIGHT');
    expect(status.querySelector('[data-weather]')?.textContent).toBe('CALM');
    expect(status.querySelector('[data-ui-artwork="journal"]')).toBeNull();
    expect(journal.querySelector('[data-ui-artwork="journal"]')).not.toBeNull();
    expect(top.querySelector('[data-action="endDay"]')).toBeNull();
    expect(endDay.closest('[data-boat-anchors]')).not.toBeNull();
    expect(endDay.dataset.anchorId).toBe('end-day-lantern');
    expect(endDay.dataset.tool).toBe('lantern');
    expect(endDay.querySelector('[role="tooltip"]')?.textContent).toBe('END DAY');
    expect(endDay.getAttribute('aria-description')).toContain('Douse the lantern');
    expect(endDay.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(mount.querySelector('[data-ui-artwork="lantern"]')).toBeNull();
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
