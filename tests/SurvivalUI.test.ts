// @vitest-environment jsdom

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

describe('SurvivalUI', () => {
  it('keeps condition indicators unchanged and uses the approved survival perimeter layout', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    expect([...mount.querySelectorAll('[data-meter]')].map((meter) => meter.getAttribute('data-meter')))
      .toEqual(['health', 'hunger', 'energy', 'hull']);
    expect(mount.querySelector('[data-survival-top] [data-journal-open]')).not.toBeNull();
    expect(mount.querySelector('[data-survival-top] [data-action="endDay"]')).not.toBeNull();
    expect(mainStyles).toMatch(/\.survival-top\s*\{[^}]*top:\s*20px[^}]*right:\s*24px/s);
    expect(mainStyles).toMatch(/\.end-day-button\s*\{[^}]*right:\s*24px[^}]*bottom:\s*24px/s);
    expect(mainStyles).toMatch(/\.survival-meters\s*\{[^}]*top:\s*18px[^}]*left:\s*22px/s);
    ui.dispose();
  });

  it('renders the journal as a tall binder with rings, tabs, and a paper close strip', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.showJournal(journalEntries);

    expect(mount.querySelector('[data-journal-book]')).not.toBeNull();
    expect(mount.querySelectorAll('[data-journal-ring]')).toHaveLength(3);
    expect(mount.querySelectorAll('[data-journal-tab]')).toHaveLength(4);
    expect(mount.querySelector('[data-journal-close]')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('X CLOSE JOURNAL');
    expect(mainStyles).toMatch(/\.journal-book\s*\{[^}]*width:\s*min\(620px/s);
    expect(mainStyles).toMatch(/\.journal-page\s*\{[^}]*aspect-ratio:\s*0\.72/s);
    ui.dispose();
  });

  it('keeps the journal page within its padded binder at desktop and short heights', () => {
    expect(mainStyles).toMatch(/\.journal-page\s*\{[^}]*width:\s*min\(100%,\s*calc\(\(100dvh - 72px\) \* \.72\)\)[^}]*max-height:\s*100%/s);
    expect(mainStyles).toMatch(/@media \(max-height: 760px\) and \(min-width: 761px\)[\s\S]*?\.journal-page\s*\{[^}]*min-height:\s*0[^}]*max-height:\s*100%/s);
  });
  it('removes Rest while retaining catalog-backed one-use actions and dawn recovery', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    const state = new SurvivalSession(saved('bottledPaper', 'energyBar'), { seed: 1, initial: { energy: 2 } }).snapshot();
    ui.render(state, () => null);
    ui.setAnchors([
      { id: 'bottledPaper-1', itemType: 'bottledPaper', toolId: null, action: 'sendMessage', remainingUses: 1, x: 100, y: 100, visible: true, depleted: false },
      { id: 'energyBar-2', itemType: 'energyBar', toolId: null, action: 'useEnergyBar', remainingUses: 1, x: 200, y: 100, visible: true, depleted: false },
    ]);
    const endDay = mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;
    expect(mount.querySelector('[data-action="rest"]')).toBeNull();
    expect(endDay.closest('[data-survival-top]')).not.toBeNull();
    expect(endDay.getAttribute('aria-keyshortcuts')).toBe('7');
    expect(endDay.getAttribute('aria-description')).toBe('Rest and end the current day. Energy is restored at dawn.');
    expect(mount.querySelector('[data-action="sendMessage"]')?.textContent).toContain('BOTTLED PAPER');
    expect(mount.querySelector('[data-action="sendMessage"] [role="tooltip"]')?.textContent)
      .toBe('BOTTLED PAPER');
    expect(mount.querySelector('[data-action="sendMessage"]')?.getAttribute('aria-description'))
      .toContain('1 ENERGY — RESCUE +15');
    expect(mount.querySelector('[data-action="useEnergyBar"]')?.textContent).toContain('ENERGY BAR');
    expect(mount.querySelector('[data-action="useEnergyBar"]')?.getAttribute('aria-description'))
      .toContain('ENERGY TO 3');
    expect(mount.textContent).not.toContain('WATER');
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
    const targets = [...mount.querySelectorAll<HTMLButtonElement>('[data-repair-target]')];
    expect(targets.map(({ dataset }) => dataset.repairTarget)).toEqual(['bucket-2', 'compass-4']);
    targets[0]!.click();
    expect(action).toHaveBeenCalledWith('repairItem', { kind: 'itemRepair', target: 'bucket-2' });
  });

  it('presents events through the scene and routes only eligible physical anchors', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount, { matches: true });
    activeUIs.push(ui);
    const state = new SurvivalSession(saved('bucket', 'umbrella'), { seed: 3 }).snapshot();
    ui.render(state, () => null);
    ui.setAnchors([
      { id: 'bucket-1', itemType: 'bucket', toolId: null, action: null, remainingUses: null, x: 140, y: 180, visible: true, depleted: false },
      { id: 'umbrella-2', itemType: 'umbrella', toolId: null, action: null, remainingUses: null, x: 240, y: 180, visible: true, depleted: false },
    ]);
    const selected = vi.fn();
    ui.onEventItem = selected;

    const reveal = ui.showEventReveal(testEvent(['bucket']));
    await vi.runAllTimersAsync();
    await reveal;
    expect(mount.querySelector('[data-event]')).toBeNull();
    expect(mount.querySelector('[data-event-caption]')?.textContent).toContain('A shadow moves beneath the boat.');

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
    expect(mount.querySelector<HTMLButtonElement>('[data-endure]')?.hidden).toBe(false);
  });

  it('opens the marker through a callback and browses completed pages newest first', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const open = vi.fn();
    ui.onJournalOpen = open;
    mount.querySelector<HTMLButtonElement>('[data-journal-open]')!.click();
    expect(open).toHaveBeenCalledOnce();

    ui.showJournal(journalEntries);
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('DAY 2');
    expect(mount.querySelector('[data-journal-page-count]')?.textContent).toBe('PAGE 2 OF 2');
    const previous = mount.querySelector<HTMLButtonElement>('[data-journal-previous]')!;
    const next = mount.querySelector<HTMLButtonElement>('[data-journal-next]')!;
    previous.focus();
    previous.click();
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('DAY 1');
    expect(previous.disabled).toBe(true);
    expect(document.activeElement).toBe(next);
    next.click();
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('DAY 2');
    expect(document.activeElement).toBe(previous);
  });

  it('builds the journal as a leather-backed parchment book with decorative tabs', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.showJournal(journalEntries);

    expect(mount.querySelector('[data-journal-book]')).not.toBeNull();
    expect(mount.querySelector('[data-journal-rings]')).not.toBeNull();
    expect(mount.querySelectorAll('[data-journal-ring]')).toHaveLength(3);
    expect(mount.querySelectorAll('[data-journal-tab]')).toHaveLength(4);
    expect(mount.querySelector('[data-journal-close]')?.textContent).toMatch(/close journal/i);
    expect(mount.querySelectorAll('[data-journal-tab][data-action]')).toHaveLength(0);
  });

  it('keeps the journal browsing-only and closes it from Escape or its bookmark', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const close = vi.fn();
    ui.onJournalClose = close;

    ui.showJournal(journalEntries);
    expect(mount.querySelector('[data-journal-close]')).not.toBeNull();
    expect(mount.querySelector('[data-journal-continue]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledOnce();

    ui.showJournal(journalEntries);
    mount.querySelector<HTMLButtonElement>('[data-journal-close]')!.click();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('shows empty history safely and traps focus in the journal', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.showJournal([]);
    expect(mount.querySelector('[data-journal-title]')?.textContent).toBe('NO COMPLETED ENTRIES YET');
    const previous = mount.querySelector<HTMLButtonElement>('[data-journal-previous]')!;
    const close = mount.querySelector<HTMLButtonElement>('[data-journal-close]')!;
    expect(previous.disabled).toBe(true);
    close.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    const backward = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    });
    document.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    expect(mount.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);
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

  it('publishes item hover and focus through the nonmodal event presentation', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    ui.render(snapshot(), () => null);
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-test"]')!;
    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;

    repair.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    repair.focus();
    expect(highlight).not.toHaveBeenCalled();
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

  it('clears item highlighting when busy, removed, and disposed', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-test"]')!;

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    ui.setBusy(true);
    expect(highlight).toHaveBeenLastCalledWith(null);

    ui.setBusy(false);
    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    ui.setAnchors([]);
    expect(highlight).toHaveBeenLastCalledWith(null);

    ui.dispose();
    expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it('clears item highlighting when the same anchor becomes invisible', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-test"]')!;

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('bucket-test');
    ui.setAnchors([{
      id: 'bucket-test', itemType: 'bucket', toolId: null, action: null, remainingUses: null,
      x: 140, y: 180, visible: false, depleted: false,
    }]);

    expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it('clears item highlighting when the same anchor becomes a tool target', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="bucket-test"]')!;

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('bucket-test');
    ui.setAnchors([{
      id: 'bucket-test', itemType: null, toolId: 'repairTools', action: 'repair', remainingUses: null,
      x: 140, y: 180, visible: true, depleted: false,
    }]);

    expect(highlight).toHaveBeenLastCalledWith(null);
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
        id: 'bucket-test', itemType: null, toolId: 'repairTools' as const, action: 'repair' as const, remainingUses: null,
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

  it('prevents short-height cinematic content from overflowing horizontally', () => {
    const shortHeightStart = mainStyles.indexOf('@media (max-height: 760px) and (min-width: 761px)');
    const shortHeightEnd = mainStyles.indexOf('@media ', shortHeightStart + 1);
    const shortHeightStyles = mainStyles.slice(shortHeightStart, shortHeightEnd);

    expect(shortHeightStart).toBeGreaterThanOrEqual(0);
    expect(shortHeightStyles).toMatch(
      /\.cinematic-overlay__content\s*\{[^}]*max-height:\s*calc\(100dvh - 28px\);[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;/s,
    );
  });

  it('wraps every survival cinematic overlay in one bounded content region', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    for (const selector of ['[data-repair-options]', '[data-pause]', '[data-ending]']) {
      const overlay = mount.querySelector<HTMLElement>(selector)!;
      expect(overlay.children).toHaveLength(1);
      expect(overlay.firstElementChild?.classList).toContain('cinematic-overlay__content');
    }

    ui.dispose();
  });
  it('renders repair tools as a projected transparent action target without marker dots', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ hull: 40 }), () => null);
    const repair = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-tools"]')!;
    expect(repair.dataset.targetKind).toBe('tool');
    expect(repair.style.width).toBe('96px');
    expect(repair.style.height).toBe('52px');
    expect(repair.style.marginLeft).toBe('-48px');
    expect(repair.style.marginTop).toBe('-26px');
    expect(Number(repair.style.zIndex)).toBeGreaterThan(0);
    expect(repair.querySelector('[role="tooltip"]')?.textContent).toMatch(/PLANK.*HAMMER.*REPAIR.*2 ENERGY/is);

    ui.setAnchors([{
      id: 'scubaSet-1', itemType: 'scubaSet', toolId: null, action: 'dive', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
      hitArea: { width: 96, height: 52, depth: 2.4 },
    }]);

    const anchor = mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-1"]')!;
    expect(anchor.dataset.targetKind).toBe('item');
    expect(anchor.style.transform).toBe('translate(320px, 240px)');
    expect(anchor.style.width).toBe('96px');
    expect(anchor.style.height).toBe('52px');
    expect(anchor.style.marginLeft).toBe('-48px');
    expect(anchor.style.marginTop).toBe('-26px');
    expect(Number(anchor.style.zIndex)).toBeGreaterThan(0);
    expect(anchor.getAttribute('aria-keyshortcuts')).toBe('2');
    expect(anchor.querySelector('[role="tooltip"]')?.textContent).toBe('SCUBA GEAR');
    expect(anchor.getAttribute('aria-description')).toMatch(/SCUBA GEAR.*DIVE.*3 ENERGY/is);
    expect(mount.querySelector('.survival-actions')).toBeNull();
    expect(mount.querySelector('.inventory-tray')).toBeNull();
  });

  it('renders the fixed fishing equipment with permanent one-energy tool copy', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    ui.render(new SurvivalSession([], { seed: 1 }).snapshot(), () => null);
    ui.setAnchors([{
      id: 'fishing-tools',
      itemType: null,
      toolId: 'fishingRod',
      action: 'fish',
      remainingUses: null,
      x: 320,
      y: 240,
      visible: true,
      depleted: false,
    }]);

    const fishing = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-tools"]')!;
    expect(fishing.dataset.targetKind).toBe('tool');
    expect(fishing.dataset.tool).toBe('fishingRod');
    expect(fishing.getAttribute('aria-keyshortcuts')).toBe('1');
    expect(fishing.getAttribute('aria-description')).toMatch(
      /FISH.*Cast from the bow to find food or drifting junk.*1 ENERGY/is,
    );
    ui.dispose();
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

  it('shows quantities and condition state on contextual item tooltips', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const state = new SurvivalSession(saved('flareGun', 'flashlight', 'baitTin', 'bucket'), {
      seed: 1,
      initialConditions: { 'bucket-4': 'broken' },
    }).snapshot();
    ui.render(state, () => null);
    ui.setAnchors([
      { id: 'flareGun-1', itemType: 'flareGun', toolId: null, action: null, remainingUses: 1, x: 1, y: 1, visible: true, depleted: false },
      { id: 'flashlight-2', itemType: 'flashlight', toolId: null, action: null, remainingUses: null, x: 2, y: 2, visible: true, depleted: false },
      { id: 'baitTin-3', itemType: 'baitTin', toolId: null, action: null, remainingUses: 1, x: 3, y: 3, visible: true, depleted: false },
      { id: 'bucket-4', itemType: 'bucket', toolId: null, action: null, remainingUses: 0, x: 4, y: 4, visible: true, depleted: false },
    ]);

    expect(mount.querySelector('[data-anchor-id="flareGun-1"] [role="tooltip"]')?.textContent).toBe('FLARE GUN');
    expect(mount.querySelector('[data-anchor-id="flashlight-2"] [role="tooltip"]')?.textContent).toBe('FLASHLIGHT');
    expect(mount.querySelector('[data-anchor-id="baitTin-3"] [role="tooltip"]')?.textContent).toBe('BAIT');
    expect(mount.querySelector('[data-anchor-id="bucket-4"] [role="tooltip"]')?.textContent).toBe('BUCKET');
    expect(mount.querySelector('[data-anchor-id="bucket-4"]')?.getAttribute('aria-description')).toContain('BROKEN');
  });

  it('keeps edge-aligned tooltips inside the clipped survival viewport', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    ui.setAnchors([
      { id: 'left', itemType: 'flareGun', toolId: null, action: null, remainingUses: 1, x: 8, y: 300, visible: true, depleted: false },
      { id: 'right', itemType: 'flashlight', toolId: null, action: null, remainingUses: null, x: window.innerWidth - 8, y: 300, visible: true, depleted: false },
    ]);
    const style = document.createElement('style');
    style.textContent = mainStyles;
    mount.append(style);

    const px = (value: string): number => Number.parseFloat(value);
    const ruleFor = (selector: string): CSSStyleDeclaration => {
      const availableRules = [...style.sheet!.cssRules]
        .map((candidate) => candidate.cssText.slice(0, 80))
        .join(' | ');
      const rule = [...style.sheet!.cssRules].find((candidate) => (
        candidate instanceof CSSStyleRule && candidate.selectorText === selector
      )) as CSSStyleRule | undefined;
      expect(rule, `Missing stylesheet rule: ${selector}; available: ${availableRules}`).toBeDefined();
      return rule!.style;
    };
    const anchorStyle = ruleFor('.boat-anchor');
    const leftTooltipStyle = ruleFor('.boat-anchor[data-tooltip-x="left"] .boat-tooltip');
    const rightTooltipStyle = ruleFor('.boat-anchor[data-tooltip-x="right"] .boat-tooltip');
    const anchorWidth = px(anchorStyle.width);
    const anchorHalfWidth = anchorWidth / 2;
    const leftTooltipEdge = 8 - anchorHalfWidth + px(leftTooltipStyle.left);
    const rightTooltipEdge = window.innerWidth - 8
      - anchorHalfWidth
      + anchorWidth
      - px(rightTooltipStyle.right);

    expect(leftTooltipEdge).toBe(8);
    expect(rightTooltipEdge).toBe(window.innerWidth - 8);
  });

  it('renders stable action cost, effect, and risk previews in accessible descriptions', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLElement>('[data-action="fish"]')!;
    const description = fish.getAttribute('aria-description') ?? '';
    expect(description).toContain('1 ENERGY');
    expect(description).toContain('Chance to gain food');
    expect(description).toContain('UNCERTAIN');
    expect(fish.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(mount.querySelector('.inventory-tray')).toBeNull();
  });

  it('updates guaranteed previews to clamped snapshot effects and selected repair source', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const state = snapshot({ hunger: 20, health: 90, hull: 90, energy: 3, repairMaterial: 1 });
    ui.render(state, () => null);
    expect(mount.querySelector('[data-action="eat"]')?.getAttribute('aria-description')).toContain('HUNGER -20');
    expect(mount.querySelector('[data-action="treat"]')?.getAttribute('aria-description')).toContain('HEALTH +10');
    expect(mount.querySelector('[data-action="repair"]')?.getAttribute('aria-description')).toContain('2 ENERGY + MATERIAL');
    expect(mount.querySelector('[data-action="repair"]')?.getAttribute('aria-description')).toContain('HULL +10');

    const tape = new SurvivalSession(saved('ductTape'), { seed: 1, initial: { hull: 92 } }).snapshot();
    ui.render(tape, () => null);
    expect(mount.querySelector('[data-action="repair"]')?.getAttribute('aria-description')).toContain('2 ENERGY + TAPE');
    expect(mount.querySelector('[data-action="repair"]')?.getAttribute('aria-description')).toContain('HULL +8');
  });

  it('keeps recovered item names concise while preserving action detail accessibly', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const state = snapshot({
      ...new SurvivalSession(saved('cannedFood', 'baitTin', 'fishingNet'), { seed: 1 }).snapshot(),
      food: 2,
      bait: 3,
    });
    ui.render(state, () => null);
    ui.setAnchors([
      { id: 'cannedFood-1', itemType: 'cannedFood', toolId: null, action: 'eat', remainingUses: 0, x: 1, y: 1, visible: true, depleted: true },
      { id: 'baitTin-2', itemType: 'baitTin', toolId: null, action: null, remainingUses: 0, x: 2, y: 2, visible: true, depleted: true },
      { id: 'fishingNet-3', itemType: 'fishingNet', toolId: null, action: null, remainingUses: null, x: 3, y: 3, visible: true, depleted: false },
    ]);
    expect(mount.querySelector('[data-item="baitTin"] [role="tooltip"]')?.textContent).toBe('BAIT');
    expect(mount.querySelector('[data-item="fishingNet"] [role="tooltip"]')?.textContent).toBe('FISHING NET');
    expect(mount.querySelector('[data-item="cannedFood"]')?.getAttribute('aria-description'))
      .toContain('UNAVAILABLE');
  });

  it('does not render stale hand-line fishing copy without a projected rod', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ inventory: new SurvivalSession(saved(), { seed: 1 }).snapshot().inventory }), () => null);
    ui.setAnchors([{ id: 'repair-tools', itemType: null, toolId: 'repairTools', action: 'repair', remainingUses: null, x: 1, y: 1, visible: true, depleted: false }]);
    expect(mount.textContent).not.toMatch(/hand-line/i);
    expect(mount.querySelector('[data-action="fish"]')).toBeNull();
  });
  it('labels every survival action and meter without relying on color', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot(), () => null);

    [...mount.querySelectorAll('[role="meter"]')].forEach((meter) => {
      expect(meter.getAttribute('aria-label')).toBeTruthy();
      expect(meter.querySelector('[data-meter-value]')?.textContent).toMatch(/^\d+$/);
    });
    [...mount.querySelectorAll<HTMLButtonElement>('[data-action]:not([data-action=""])')].forEach((button) => {
      expect(button.textContent?.trim()).not.toBe('');
      expect(button.getAttribute('aria-keyshortcuts')).toMatch(/^[1-7]$/);
    });
  });

  it('keeps one exposed polite announcer and one terminal alert heading', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    const liveRegion = mount.querySelector('[data-survival-announcer]');
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');
    expect(mount.querySelector('[data-outcome-message]')).toBeNull();
    expect(liveRegion?.closest('[aria-hidden="true"], [inert]')).toBeNull();

    ui.showEnding('dead', 3, 77, 12);
    const alerts = mount.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBe(mount.querySelector('[data-ending-title]'));
  });

  it('uses nonmodal feedback and removes outcome continuation controls', async () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.showFeedback({ accepted: true, message: 'The patch holds.' });

    expect(mount.querySelector('[data-survival-feedback]')?.textContent).toBe('The patch holds.');
    expect(mount.querySelector('[data-survival-feedback]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-survival-feedback]')?.closest('[role="dialog"]')).toBeNull();
    expect(mount.querySelector('[data-outcome]')).toBeNull();
    expect(mount.querySelector('[data-continue]')).toBeNull();
    expect(mount.querySelector('[data-skip]')).toBeNull();
    expect(mount.querySelector('[data-journal-continue]')).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(mount.querySelector('[data-survival-announcer]')?.textContent).toBe('The patch holds.');
  });

  it('covers, holds, and uncovers sleep without becoming interactive', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount, { matches: false });
    activeUIs.push(ui);
    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;

    const closing = ui.setSleepCovered(true);
    expect(cover.classList).toContain('is-covered');
    expect(cover.getAttribute('aria-hidden')).toBe('true');
    await vi.advanceTimersByTimeAsync(650);
    await closing;

    const hold = ui.holdSleep();
    await vi.advanceTimersByTimeAsync(450);
    await hold;

    const opening = ui.setSleepCovered(false);
    await vi.advanceTimersByTimeAsync(650);
    await opening;
    expect(cover.classList).not.toContain('is-covered');
    vi.useRealTimers();
  });

  it('keeps Pause and terminal modals above covered sleep with focus isolated', () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);

    void ui.setSleepCovered(true);
    ui.setPaused(true);

    const cover = mount.querySelector<HTMLElement>('[data-sleep-cover]')!;
    const pause = mount.querySelector<HTMLElement>('[data-pause]')!;
    const resume = mount.querySelector<HTMLButtonElement>('[data-resume]')!;
    expect(cover.classList).toContain('is-covered');
    expect(pause.classList).toContain('is-visible');
    expect(pause.hasAttribute('inert')).toBe(false);
    expect(pause.getAttribute('aria-hidden')).toBe('false');
    expect(document.activeElement).toBe(resume);
    expect(mount.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);

    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    expect(action).not.toHaveBeenCalled();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(resume);

    expect(mainStyles).toMatch(/\.ending-overlay\s*\{[^}]*z-index:\s*21/s);
    expect(mainStyles).toMatch(/\.pause-overlay\s*\{[^}]*z-index:\s*22/s);
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

  it('renders labeled meters, weather, and projected actions', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot(), () => null);

    expect(mount.querySelector('[data-day]')?.textContent).toContain('DAY 1');
    expect(mount.querySelector('[data-weather]')?.textContent).toContain('CALM');
    expect(mount.querySelector('[data-phase]')?.textContent).toContain('DAYLIGHT');
    expect(mount.querySelector('[data-meter="health"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(mount.querySelector('[data-meter="hunger"]')?.getAttribute('aria-valuenow')).toBe('80');
    expect(mount.querySelector('[data-meter="energy"]')?.getAttribute('aria-valuenow')).toBe('3');
    expect(mount.querySelector('[data-meter="hull"]')?.getAttribute('aria-valuenow')).toBe('75');
    expect(mount.querySelectorAll('[data-action]:not([data-action=""])')).toHaveLength(6);
    expect(mount.querySelectorAll('[data-anchor-id]')).toHaveLength(6);
    expect(mount.querySelectorAll('[data-hotspot]')).toHaveLength(0);
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

  it('emits fishing directly from the rod and shortcut regardless of bait', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot({ bait: 2 }), () => null);

    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));

    expect(action.mock.calls).toEqual([
      ['fish', undefined],
      ['fish', undefined],
    ]);
    expect(mount.querySelector('[data-action-options]')).toBeNull();
  });

  it('describes automatic bait use on the fixed one-energy fishing action', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ bait: 0 }), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const copy = fish.getAttribute('aria-description') ?? '';

    expect(copy).toContain('FISH');
    expect(copy).toContain('1 ENERGY');
    expect(copy).toMatch(/bait.*automat/i);
  });

  it('shows only the simple fishing rod tooltip while preserving accessible detail', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    ui.setAnchors([
      { id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish', remainingUses: null, x: 90, y: 180, visible: true, depleted: false },
    ]);

    const button = mount.querySelector<HTMLButtonElement>('[data-tool="fishingRod"]')!;
    expect(button.querySelector('[role="tooltip"]')?.textContent).toBe('Fishing rod');
    expect(button.getAttribute('aria-description')).toContain('1 ENERGY');
    ui.dispose();
  });

  it('shows a modal fishing result and emits one Continue intent', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onContinue = vi.fn();
    ui.onFishingResultContinue = onContinue;

    ui.showFishingResult({ title: 'COD', detail: '+1 FOOD' });

    const dialog = mount.querySelector<HTMLElement>('[data-fishing-result]')!;
    expect(dialog.classList.contains('is-visible')).toBe(true);
    expect(dialog.querySelector('[data-fishing-result-title]')?.textContent).toBe('COD');
    expect(dialog.querySelector('[data-fishing-result-detail]')?.textContent).toBe('+1 FOOD');
    const button = dialog.querySelector<HTMLButtonElement>('[data-fishing-result-continue]')!;
    expect(document.activeElement).toBe(button);
    button.click();
    button.click();
    expect(onContinue).toHaveBeenCalledOnce();

    ui.hideFishingResult();
    expect(dialog.classList.contains('is-visible')).toBe(false);
    ui.dispose();
  });

  it('renders every fishing mode with exact interaction copy', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const instruction = mount.querySelector<HTMLElement>('[data-fishing-instruction]')!;

    ui.setFishingState({ mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null });
    expect(instruction.textContent).toBe('CLICK THE WATER TO CAST');
    ui.setFishingState({ mode: 'waiting', message: 'WAIT FOR A BITE', biteTarget: null });
    expect(instruction.textContent).toBe('WAIT FOR A BITE');
    ui.setFishingState({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: { x: 160, y: 90, width: 60, height: 44, depth: 1, visible: true },
    });
    expect(instruction.textContent).toBe('BITE - REEL NOW');
    ui.setFishingState({ mode: 'result', message: 'CAUGHT MACKEREL', biteTarget: null });
    expect(instruction.textContent).toBe('CAUGHT MACKEREL');
    ui.setFishingState({ mode: 'result', message: 'IT GOT AWAY', biteTarget: null });
    expect(instruction.textContent).toBe('IT GOT AWAY');
    ui.setFishingState({ mode: 'hidden', message: '', biteTarget: null });
    expect(mount.querySelector('[data-fishing]')?.classList).not.toContain('is-visible');
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
    expect(mainStyles).not.toMatch(/@keyframes fishing-bite-pulse\s*\{[^}]*transform/s);
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

  it('settles and safely supersedes reduced-motion fishing fades without transition events', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount, { matches: true });
    activeUIs.push(ui);
    const fade = mount.querySelector<HTMLElement>('[data-fishing-fade]')!;

    const first = ui.setFishingFade(true);
    expect(fade.classList).toContain('is-covered');
    const second = ui.setFishingFade(false);
    await first;
    expect(fade.classList).not.toContain('is-covered');
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(mainStyles).toMatch(/\.fishing-fade\s*\{[^}]*transition:\s*opacity/s);
    expect(mainStyles).toMatch(/prefers-reduced-motion:[\s\S]*\.fishing-fade\s*\{[^}]*transition-duration:\s*1ms/s);
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

  it('shows one visible rejection for an unavailable numeric shortcut without locking or moving focus', async () => {
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
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
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

  it('announces unavailable numeric shortcuts, including repeated reasons', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const session = new SurvivalSession(saved(), { seed: 7, initial: { energy: 0 } });
    const action = vi.fn();
    const announcer = mount.querySelector<HTMLElement>('[data-survival-announcer]')!;
    const publications: string[] = [];
    const observer = new MutationObserver(() => {
      if (announcer.textContent) publications.push(announcer.textContent);
    });
    observer.observe(announcer, { childList: true, characterData: true, subtree: true });
    ui.onAction = action;
    ui.render(session.snapshot(), (id) => session.availableReason(id));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    await Promise.resolve();
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    await Promise.resolve();
    await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    await Promise.resolve();
    await Promise.resolve();

    observer.disconnect();
    expect(publications.filter((message) => message === 'Fishing requires one energy.')).toHaveLength(2);
    expect(publications).toContain('Diving requires a recovered scuba set.');
    expect(action).not.toHaveBeenCalled();
  });

  it('restores direct-click and numeric-shortcut command origins after cues', () => {
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

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '7' }));
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

  it('uses each meter scale and direction for visual and accessible danger states', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ health: 21, hunger: 20, energy: 3, hull: 21 }), () => null);

    const health = mount.querySelector<HTMLElement>('[data-meter="health"]')!;
    const food = mount.querySelector<HTMLElement>('[data-meter="hunger"]')!;
    const energy = mount.querySelector<HTMLElement>('[data-meter="energy"]')!;
    const hull = mount.querySelector<HTMLElement>('[data-meter="hull"]')!;

    expect(food.getAttribute('aria-label')).toBe('FOOD');
    expect(food.getAttribute('aria-valuenow')).toBe('80');
    expect(food.style.getPropertyValue('--meter-value')).toBe('80%');
    expect(food.querySelector('.survival-meter__label')?.textContent).toContain('FOOD');
    expect(food.classList).not.toContain('is-danger');
    expect(food.getAttribute('aria-valuetext')).toBeNull();
    expect(energy.getAttribute('aria-valuemax')).toBe('3');
    expect(energy.style.getPropertyValue('--meter-value')).toBe('100%');
    expect(energy.querySelector('.survival-meter__fill')?.tagName).toBe('DIV');
    expect(energy.classList).not.toContain('is-danger');

    ui.render(snapshot({ health: 20, hunger: 70, energy: 1, hull: 20 }), () => null);

    expect(health.classList).toContain('is-danger');
    expect(health.getAttribute('aria-valuetext')).toBe('20, low');
    expect(health.querySelector('[data-meter-danger]')?.textContent).toBe('LOW');
    expect(food.getAttribute('aria-valuenow')).toBe('30');
    expect(food.style.getPropertyValue('--meter-value')).toBe('30%');
    expect(food.classList).toContain('is-danger');
    expect(food.getAttribute('aria-valuetext')).toBe('30, low');
    expect(food.querySelector('[data-meter-danger]')?.textContent).toBe('LOW');
    expect(energy.classList).toContain('is-danger');
    expect(energy.getAttribute('aria-valuetext')).toBe('1, low');
    expect(energy.querySelector('[data-meter-danger]')?.textContent).toBe('LOW');
    expect(hull.classList).toContain('is-danger');
    expect(hull.getAttribute('aria-valuetext')).toBe('20, low');
    expect(hull.querySelector('[data-meter-danger]')?.textContent).toBe('LOW');

    ui.render(snapshot({ hunger: 90 }), () => null);

    expect(food.getAttribute('aria-valuenow')).toBe('10');
    expect(food.style.getPropertyValue('--meter-value')).toBe('10%');
    expect(food.classList).toContain('is-danger');
  });

  it('uses number shortcuts only when no overlay is open', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(action).toHaveBeenLastCalledWith('fish', undefined);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true }));
    expect(action).toHaveBeenCalledOnce();

    void ui.showEventReveal(testEvent());
    ui.setEventSelection(new Map());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(action).toHaveBeenCalledOnce();
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

  it('separates journal, status, and stable End Day controls', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);

    const top = mount.querySelector('[data-survival-top]')!;
    const status = top.querySelector('[data-survival-status]')!;
    const journal = top.querySelector('[data-journal-open]')!;
    const endDay = top.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;

    expect(status.querySelector('[data-day]')?.textContent).toBe('DAY 1');
    expect(status.querySelector('[data-phase]')?.textContent).toBe('DAYLIGHT');
    expect(status.querySelector('[data-weather]')?.textContent).toBe('CALM');
    expect(status.querySelector('[data-ui-artwork="journal"]')).toBeNull();
    expect(journal.querySelector('[data-ui-artwork="journal"]')).not.toBeNull();
    expect(endDay.closest('[data-boat-anchors]')).toBeNull();
    expect(endDay.getAttribute('aria-keyshortcuts')).toBe('7');
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
