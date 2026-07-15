// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import type { JournalEntry } from '../src/survival/journal';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
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
  daytime: null,
  nighttime: {
    kind: 'event',
    event: {
      phase: 'night',
      eventId: `night-${day}`,
      title: 'Quiet Night',
      prompt: `Night ${day} settled over the boat.`,
      attemptedItemId: null,
      resolution: 'endure',
      outcomeCode: 'event-resolved',
      outcomeMessage: 'I made it through until morning.',
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
    { id: 'fishingRod-test', itemType: 'fishingRod', action: 'fish', remainingUses: null, x: 140, y: 180, visible: true, depleted: false },
    { id: 'scubaSet-test', itemType: 'scubaSet', action: 'dive', remainingUses: null, x: 240, y: 250, visible: true, depleted: false },
    { id: 'cannedFood-test', itemType: 'cannedFood', action: 'eat', remainingUses: 1, x: 340, y: 300, visible: true, depleted: false },
    { id: 'repair-patch', itemType: null, action: 'repair', remainingUses: null, x: 440, y: 280, visible: true, depleted: false },
    { id: 'medicalKit-test', itemType: 'medicalKit', action: 'treat', remainingUses: 2, x: 540, y: 250, visible: true, depleted: false },
    { id: 'waterJug-test', itemType: 'waterJug', action: 'rest', remainingUses: 3, x: 640, y: 220, visible: true, depleted: false },
  ]);
  activeUIs.push(ui);
  return ui;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    ...new SurvivalSession(saved('fishingRod', 'waterJug'), {
      seed: 7,
      random: sequenceRandom([0.5]),
    }).snapshot(),
    ...overrides,
  };
}

describe('SurvivalUI', () => {
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

  it('publishes item hover and focus while ignoring fixed anchors and clearing for modals', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    ui.render(snapshot(), () => null);
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;
    const fixed = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-patch"]')!;

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('fishingRod-test');
    item.focus();
    item.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('fishingRod-test');
    item.blur();
    expect(highlight).toHaveBeenLastCalledWith(null);

    fixed.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith(null);

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves.', danger: 'dangerous' }, snapshot());
    expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it('clears item highlighting when busy, removed, and disposed', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;

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
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('fishingRod-test');
    ui.setAnchors([{
      id: 'fishingRod-test', itemType: 'fishingRod', action: 'fish', remainingUses: null,
      x: 140, y: 180, visible: false, depleted: false,
    }]);

    expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it('clears item highlighting when the same anchor becomes a fixed target', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const item = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;

    item.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    expect(highlight).toHaveBeenLastCalledWith('fishingRod-test');
    ui.setAnchors([{
      id: 'fishingRod-test', itemType: null, action: 'repair', remainingUses: null,
      x: 140, y: 180, visible: true, depleted: false,
    }]);

    expect(highlight).toHaveBeenLastCalledWith(null);
  });

  it.each([
    {
      state: 'invisible',
      anchor: {
        id: 'fishingRod-test', itemType: 'fishingRod' as const, action: 'fish' as const, remainingUses: null,
        x: 140, y: 180, visible: false, depleted: false,
      },
    },
    {
      state: 'fixed',
      anchor: {
        id: 'fishingRod-test', itemType: null, action: 'repair' as const, remainingUses: null,
        x: 140, y: 180, visible: true, depleted: false,
      },
    },
  ])('does not republish latent hover after the anchor becomes $state', ({ anchor }) => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const highlight = vi.fn();
    ui.onAnchorHighlight = highlight;
    const hovered = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-test"]')!;
    const focused = mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-test"]')!;

    hovered.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    focused.focus();
    expect(highlight.mock.calls).toEqual([['fishingRod-test'], ['scubaSet-test']]);
    highlight.mockClear();

    ui.setAnchors([
      anchor,
      {
        id: 'scubaSet-test', itemType: 'scubaSet', action: 'dive', remainingUses: null,
        x: 240, y: 250, visible: true, depleted: false,
      },
    ]);
    focused.blur();

    expect(highlight).not.toHaveBeenCalledWith('fishingRod-test');
    expect(highlight.mock.calls).toEqual([[null]]);
  });

  it('defines illustrated survival, tooltip, and cinematic overlay contracts', () => {
    expect(mainStyles).toContain('.survival-condition__art');
    expect(mainStyles).toContain('.journal-marker__art');
    expect(mainStyles).not.toContain('.boat-anchor[data-action="endDay"] .boat-tooltip');
    expect(mainStyles).toContain('.cinematic-overlay::before');
    expect(mainStyles).toContain('.event-overlay[data-danger="dangerous"]');
  });

  it('centers survival HUD zones, overlay content, and vignette backing', () => {
    expect(mainStyles).toMatch(/\.survival-meters\s*\{[^}]*right:\s*22px;[^}]*left:\s*auto;[^}]*transform-origin:\s*top right;/s);
    expect(mainStyles).toMatch(/\.survival-top\s*\{[^}]*left:\s*50%;[^}]*translateX\(-50%\)/s);
    expect(mainStyles).toMatch(/\.cinematic-overlay\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*overflow:\s*hidden;[^}]*circle at 50% 50%/s);
    expect(mainStyles).toMatch(/\.cinematic-overlay__content\s*\{[^}]*align-content:\s*safe center;[^}]*justify-items:\s*center;[^}]*max-height:\s*100%;[^}]*overflow-y:\s*auto;/s);
    expect(mainStyles).toMatch(/\.cinematic-overlay::before\s*\{[^}]*top:\s*50%;[^}]*translate\(-50%,\s*-50%\)/s);
    expect(mainStyles).toMatch(/\.performance-stats\s*\{[^}]*top:\s*112px;[^}]*right:\s*24px;/s);
  });

  it('styles the journal as a centered bounded paper page with reduced-motion support', () => {
    expect(mainStyles).toMatch(/\.journal-marker:focus-visible\s*\{/);
    expect(mainStyles).toMatch(/\.journal-overlay::before\s*\{[^}]*display:\s*none/s);
    expect(mainStyles).toMatch(/\.journal-page\s*\{[^}]*width:\s*min\(680px/s);
    expect(mainStyles).toMatch(/\.journal-page\s*\{[^}]*repeating-linear-gradient/s);
    expect(mainStyles).toMatch(/\.journal-page::before\s*\{[^}]*repeating-radial-gradient/s);
    expect(mainStyles).toMatch(/\.journal-page::after\s*\{[^}]*box-shadow:\s*inset/s);
    expect(mainStyles).toMatch(/\.journal-page__edge-arrow\s*\{/);
    expect(mainStyles).toMatch(/\.journal-page__folio\s*\{/);
    expect(mainStyles).toMatch(/\.journal-page__bookmark\s*\{/);
    expect(mainStyles).toMatch(/\.journal-page__story\s*\{[^}]*overflow-y:\s*auto/s);
    expect(mainStyles).toMatch(/@media \(max-height:\s*760px\)[\s\S]*\.journal-page/s);
    expect(mainStyles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.sleep-cover[^}]*transition-duration:\s*1ms/s);
  });

  it('styles feedback as noninteractive and keeps the sleep cover noninteractive', () => {
    expect(mainStyles).toMatch(/\.survival-feedback\s*\{[^}]*pointer-events:\s*none/s);
    expect(mainStyles).toMatch(/\.sleep-cover\s*\{[^}]*pointer-events:\s*none/s);
  });

  it('wraps every survival cinematic overlay in one bounded content region', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    for (const selector of ['[data-action-options]', '[data-event]', '[data-pause]', '[data-ending]']) {
      const overlay = mount.querySelector<HTMLElement>(selector)!;
      expect(overlay.children).toHaveLength(1);
      expect(overlay.firstElementChild?.classList).toContain('cinematic-overlay__content');
    }

    ui.dispose();
  });

  it('guards unavailable anchor press feedback while retaining informational tooltips', () => {
    expect(mainStyles).toMatch(/\.boat-anchor\[data-target-kind="item"\]::before\s*\{[^}]*content:\s*none;/s);
    expect(mainStyles).toMatch(/\.boat-anchor\[data-target-kind="fixed"\]::before\s*\{[^}]*background:\s*var\(--anchor-accent\);/s);
    expect(mainStyles).toMatch(/\.boat-anchor\[data-target-kind="item"\]\[aria-disabled="true"\]\s*\{[^}]*border-color:\s*transparent;/s);
    expect(mainStyles).toMatch(/\.boat-anchor:hover \.boat-tooltip,\s*\.boat-anchor:focus-visible \.boat-tooltip\s*\{[^}]*opacity:\s*1;[^}]*visibility:\s*visible;/s);
  });

  it('renders projected item tooltips without action dock or inventory tray', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const fixed = mount.querySelector<HTMLButtonElement>('[data-anchor-id="repair-patch"]')!;
    expect(fixed.dataset.targetKind).toBe('fixed');
    expect(fixed.style.width).toBe('');
    expect(fixed.style.height).toBe('');

    ui.setAnchors([{
      id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
      hitArea: { width: 96, height: 52, depth: 2.4 },
    }]);

    const anchor = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-1"]')!;
    expect(anchor.dataset.targetKind).toBe('item');
    expect(anchor.style.transform).toBe('translate(320px, 240px)');
    expect(anchor.style.width).toBe('96px');
    expect(anchor.style.height).toBe('52px');
    expect(anchor.style.marginLeft).toBe('-48px');
    expect(anchor.style.marginTop).toBe('-26px');
    expect(Number(anchor.style.zIndex)).toBeGreaterThan(0);
    expect(anchor.getAttribute('aria-keyshortcuts')).toBe('1');
    expect(anchor.querySelector('[role="tooltip"]')?.textContent).toMatch(/FISHING ROD.*FISH.*2 ENERGY/is);
    expect(mount.querySelector('.survival-actions')).toBeNull();
    expect(mount.querySelector('.inventory-tray')).toBeNull();
  });

  it('uses the exact minimum target geometry for an item anchor without a hit area', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.setAnchors([{
      id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const anchor = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-1"]')!;
    expect(anchor.style.width).toBe('54px');
    expect(anchor.style.height).toBe('54px');
    expect(anchor.style.marginLeft).toBe('-27px');
    expect(anchor.style.marginTop).toBe('-27px');
  });

  it('clears item geometry and stacking when an anchor ID becomes fixed', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.setAnchors([{
      id: 'shared', itemType: 'fishingRod', action: 'fish', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
      hitArea: { width: 96, height: 52, depth: 2.4 },
    }]);
    ui.setAnchors([{
      id: 'shared', itemType: null, action: 'repair', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const anchor = mount.querySelector<HTMLButtonElement>('[data-anchor-id="shared"]')!;
    expect(anchor.dataset.targetKind).toBe('fixed');
    expect(anchor.style.width).toBe('');
    expect(anchor.style.height).toBe('');
    expect(anchor.style.marginLeft).toBe('');
    expect(anchor.style.marginTop).toBe('');
    expect(anchor.style.zIndex).toBe('');
  });

  it('stacks a nearer positive-depth item target above a farther one', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.setAnchors([
      {
        id: 'near', itemType: 'fishingRod', action: 'fish', remainingUses: null,
        x: 320, y: 240, visible: true, depleted: false,
        hitArea: { width: 96, height: 52, depth: 1.25 },
      },
      {
        id: 'far', itemType: 'scubaSet', action: 'dive', remainingUses: null,
        x: 320, y: 240, visible: true, depleted: false,
        hitArea: { width: 96, height: 52, depth: 3.75 },
      },
    ]);

    const near = mount.querySelector<HTMLButtonElement>('[data-anchor-id="near"]')!;
    const far = mount.querySelector<HTMLButtonElement>('[data-anchor-id="far"]')!;
    expect(Number(near.style.zIndex)).toBeGreaterThan(Number(far.style.zIndex));
  });

  it('keeps unavailable anchors focusable and suppresses their commands', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const onAction = vi.fn();
    ui.onAction = onAction;
    ui.render(snapshot(), (action) => action === 'fish' ? 'Fishing requires a recovered fishing rod.' : null);
    ui.setAnchors([{
      id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish', remainingUses: null,
      x: 320, y: 240, visible: true, depleted: false,
    }]);

    const button = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('keeps a depleted duplicate action anchor focusable but blocks its delegated action', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const onAction = vi.fn();
    ui.onAction = onAction;
    ui.render(snapshot({ repairMaterial: 1 }), () => null);
    ui.setAnchors([
      {
        id: 'ductTape-1', itemType: 'ductTape', action: 'repair', remainingUses: 1,
        x: 320, y: 240, visible: true, depleted: false,
      },
      {
        id: 'ductTape-2', itemType: 'ductTape', action: 'repair', remainingUses: 0,
        x: 360, y: 240, visible: true, depleted: true,
      },
    ]);

    const available = mount.querySelector<HTMLButtonElement>('[data-anchor-id="ductTape-1"]')!;
    const depleted = mount.querySelector<HTMLButtonElement>('[data-anchor-id="ductTape-2"]')!;
    expect(depleted.disabled).toBe(false);
    expect(depleted.getAttribute('aria-disabled')).toBe('true');
    expect(depleted.textContent).toMatch(/DEPLETED.*0 USES REMAINING/i);
    depleted.focus();
    expect(document.activeElement).toBe(depleted);
    depleted.click();
    expect(onAction).not.toHaveBeenCalled();
    available.click();
    expect(onAction).toHaveBeenCalledWith('repair', undefined);
  });

  it('shows remaining uses and durable state on contextual item tooltips', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    ui.setAnchors([
      { id: 'flareGun-1', itemType: 'flareGun', action: null, remainingUses: 1, x: 1, y: 1, visible: true, depleted: false },
      { id: 'flashlight-1', itemType: 'flashlight', action: null, remainingUses: null, x: 2, y: 2, visible: true, depleted: false },
      { id: 'baitTin-1', itemType: 'baitTin', action: null, remainingUses: 3, x: 3, y: 3, visible: true, depleted: false },
      { id: 'baitTin-2', itemType: 'baitTin', action: null, remainingUses: 0, x: 4, y: 4, visible: true, depleted: true },
    ]);

    expect(mount.querySelector('[data-anchor-id="flareGun-1"]')?.textContent).toMatch(/1 USE REMAINING/i);
    expect(mount.querySelector('[data-anchor-id="flashlight-1"]')?.textContent).toMatch(/DURABLE/i);
    expect(mount.querySelector('[data-anchor-id="baitTin-1"]')?.textContent).toMatch(/3 USES REMAINING/i);
    expect(mount.querySelector('[data-anchor-id="baitTin-2"]')?.textContent).toMatch(/DEPLETED.*0 USES REMAINING/i);
  });

  it('marks left, right, and top-edge anchors for on-screen tooltip placement', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    ui.setAnchors([
      { id: 'left', itemType: 'flareGun', action: null, remainingUses: 1, x: 8, y: 300, visible: true, depleted: false },
      { id: 'right', itemType: 'flashlight', action: null, remainingUses: null, x: window.innerWidth - 8, y: 300, visible: true, depleted: false },
      { id: 'top', itemType: null, action: 'repair', remainingUses: null, x: window.innerWidth / 2, y: 8, visible: true, depleted: false },
    ]);

    expect(mount.querySelector('[data-anchor-id="left"]')?.getAttribute('data-tooltip-x')).toBe('left');
    expect(mount.querySelector('[data-anchor-id="right"]')?.getAttribute('data-tooltip-x')).toBe('right');
    expect(mount.querySelector('[data-anchor-id="top"]')?.getAttribute('data-tooltip-y')).toBe('below');
  });

  it('keeps edge-aligned tooltips inside the clipped survival viewport', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    ui.setAnchors([
      { id: 'left', itemType: 'flareGun', action: null, remainingUses: 1, x: 8, y: 300, visible: true, depleted: false },
      { id: 'right', itemType: 'flashlight', action: null, remainingUses: null, x: window.innerWidth - 8, y: 300, visible: true, depleted: false },
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
    expect(fish.textContent).toContain('2 ENERGY');
    expect(fish.textContent).toContain('Chance to gain food');
    expect(fish.textContent).toContain('UNCERTAIN');
    expect(fish.getAttribute('aria-description')).toContain('2 ENERGY');
    expect(fish.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(mount.querySelector('.inventory-tray')).toBeNull();
  });

  it('updates guaranteed previews to clamped snapshot effects and selected repair source', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const state = snapshot({ hunger: 20, health: 90, hull: 90, energy: 3, repairMaterial: 1 });
    ui.render(state, () => null);
    expect(mount.querySelector('[data-action="eat"]')?.textContent).toContain('HUNGER -20');
    expect(mount.querySelector('[data-action="treat"]')?.textContent).toContain('HEALTH +10');
    expect(mount.querySelector('[data-action="repair"]')?.textContent).toContain('2 ENERGY + MATERIAL');
    expect(mount.querySelector('[data-action="repair"]')?.textContent).toContain('HULL +10');
    expect(mount.querySelector('[data-action="rest"]')?.textContent).toContain('ENERGY +1');

    const tape = new SurvivalSession(saved('ductTape'), { seed: 1, initial: { hull: 92 } }).snapshot();
    ui.render(tape, () => null);
    expect(mount.querySelector('[data-action="repair"]')?.textContent).toContain('2 ENERGY + TAPE');
    expect(mount.querySelector('[data-action="repair"]')?.textContent).toContain('HULL +8');
  });

  it('marks transferred store items clearly and unavailable in event choices', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const state = new SurvivalSession(saved('cannedFood', 'baitTin'), { seed: 1 }).snapshot();
    ui.showEvent({ id: 'x', title: 'X', prompt: 'X', danger: 'safe' }, state);
    for (const id of ['cannedFood', 'baitTin']) {
      const choice = mount.querySelector<HTMLButtonElement>(`[data-event-items] [data-item="${id}"]`)!;
      expect(choice.textContent).toContain('TRANSFERRED TO STORES');
      expect(choice.getAttribute('aria-description')).toContain('Use through day actions');
      expect(choice.disabled).toBe(true);
    }
  });

  it('shows transferred item states and shared logical item descriptions', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const state = snapshot({
      ...new SurvivalSession(saved('cannedFood', 'baitTin', 'fishingRod'), { seed: 1 }).snapshot(),
      food: 2,
      bait: 3,
    });
    ui.render(state, () => null);
    ui.setAnchors([
      { id: 'cannedFood-1', itemType: 'cannedFood', action: 'eat', remainingUses: 0, x: 1, y: 1, visible: true, depleted: true },
      { id: 'baitTin-1', itemType: 'baitTin', action: null, remainingUses: 0, x: 2, y: 2, visible: true, depleted: true },
      { id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish', remainingUses: null, x: 3, y: 3, visible: true, depleted: false },
    ]);
    expect(mount.querySelector('[data-item="baitTin"]')?.textContent).toMatch(/bait|fishing/i);
    expect(mount.querySelector('[data-item="fishingRod"]')?.textContent).toMatch(/food|fish/i);
    ui.showEvent({ id: 'x', title: 'X', prompt: 'X', danger: 'safe' }, state);
    expect(mount.querySelector('[data-event-items] [data-item="fishingRod"]')?.getAttribute('aria-description')).toMatch(/food|fish/i);
  });

  it('does not render stale hand-line fishing copy without a projected rod', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot({ inventory: new SurvivalSession(saved(), { seed: 1 }).snapshot().inventory }), () => null);
    ui.setAnchors([{ id: 'repair-patch', itemType: null, action: 'repair', remainingUses: null, x: 1, y: 1, visible: true, depleted: false }]);
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
    [...mount.querySelectorAll<HTMLButtonElement>('[data-action]')].forEach((button) => {
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
    expect(mount.querySelector('[data-meter="energy"]')?.getAttribute('aria-valuenow')).toBe('4');
    expect(mount.querySelector('[data-meter="hull"]')?.getAttribute('aria-valuenow')).toBe('75');
    expect(mount.querySelectorAll('[data-action]')).toHaveLength(7);
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

  it('emits unbaited fishing directly when no bait remains', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot({ bait: 0 }), () => null);
    const options = mount.querySelector<HTMLElement>('[data-action-options]');

    expect(options).not.toBeNull();
    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();

    expect(action).toHaveBeenCalledWith('fish', undefined);
    expect(options?.classList).not.toContain('is-visible');
  });

  it('emits both fishing choices with their matching option values', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot({ bait: 2 }), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;

    fish.click();
    expect(action).not.toHaveBeenCalled();
    mount.querySelector<HTMLButtonElement>('[data-action-option="fish"]')!.click();
    expect(action).toHaveBeenLastCalledWith('fish', undefined);
    expect(document.activeElement).toBe(fish);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    mount.querySelector<HTMLButtonElement>('[data-action-option="useBait"]')!.click();
    expect(action).toHaveBeenLastCalledWith('fish', 'useBait');
    expect(action).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(fish);
  });

  it('isolates fishing choices and restores their command origin on Escape', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPauseChange = pause;
    ui.render(snapshot({ bait: 1 }), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const dive = mount.querySelector<HTMLButtonElement>('[data-action="dive"]')!;
    const options = mount.querySelector<HTMLElement>('[data-action-options]')!;

    fish.click();
    expect(options.classList).toContain('is-visible');
    expect(document.activeElement).toBe(mount.querySelector('[data-action-options-title]'));
    expect(mount.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);
    dive.click();
    expect(action).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(options.classList).not.toContain('is-visible');
    expect(document.activeElement).toBe(fish);
    expect(pause).not.toHaveBeenCalled();
  });

  it('keeps Pause above fishing choices and resumes into the choice layer', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot({ bait: 1 }), () => null);
    const options = mount.querySelector<HTMLElement>('[data-action-options]')!;

    mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!.click();
    ui.setPaused(true);
    expect(options.hasAttribute('inert')).toBe(true);
    mount.querySelector<HTMLButtonElement>('[data-action-option="useBait"]')!.click();
    expect(action).not.toHaveBeenCalled();

    ui.setPaused(false);
    expect(options.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(mount.querySelector('[data-action-options-title]'));
    mount.querySelector<HTMLButtonElement>('[data-action-option="useBait"]')!.click();
    expect(action).toHaveBeenCalledWith('fish', 'useBait');
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

  it('shows unavailable reasons and event item selection accessibly', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), (action) => action === 'repair' ? 'No repair material or duct tape.' : null);

    const repair = mount.querySelector<HTMLButtonElement>('[data-action="repair"]')!;
    expect(repair.getAttribute('aria-description')).toContain('No repair material');
    expect(mount.querySelector('[data-event]')?.hasAttribute('inert')).toBe(true);

    ui.showEvent({
      id: 'test',
      title: 'A shadow',
      prompt: 'Something moves below.',
      danger: 'dangerous',
    }, snapshot());

    expect(mount.querySelector('[data-event]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-event]')?.hasAttribute('inert')).toBe(false);
    expect(mount.querySelector('[data-event-items] [data-item="fishingRod"]')).not.toBeNull();
    expect(document.activeElement).toBe(mount.querySelector('[data-event-title]'));
  });

  it('announces unavailable numeric shortcuts, including repeated reasons', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const session = new SurvivalSession(saved(), { seed: 7 });
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
    expect(publications.filter((message) => message === 'Fishing requires a recovered fishing rod.')).toHaveLength(2);
    expect(publications).toContain('Diving requires a recovered scuba set.');
    expect(action).not.toHaveBeenCalled();
  });

  it('routes event choices and endurance without duplicate commands', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const eventItem = vi.fn();
    const endure = vi.fn();
    ui.onEventItem = eventItem;
    ui.onEndure = endure;
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    fish.focus();

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    mount.querySelector<HTMLButtonElement>('[data-event-items] [data-item="waterJug"]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-endure]')!.click();
    expect(eventItem).toHaveBeenCalledWith('waterJug');
    expect(endure).toHaveBeenCalledOnce();
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

  it('keeps meter and action nodes stable across differential renders', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const health = mount.querySelector<HTMLElement>('[data-meter="health"]')!;
    const fish = mount.querySelector('[data-action="fish"]');

    ui.render(snapshot({ health: 63 }), () => null);

    expect(mount.querySelector('[data-meter="health"]')).toBe(health);
    expect(mount.querySelector('[data-action="fish"]')).toBe(fish);
    expect(health.getAttribute('aria-valuenow')).toBe('63');
    expect(health.style.getPropertyValue('--meter-value')).toBe('63%');
  });

  it('uses each meter scale and direction for visual and accessible danger states', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ health: 21, hunger: 20, energy: 4, hull: 21 }), () => null);

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
    expect(energy.getAttribute('aria-valuemax')).toBe('4');
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

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
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

  it('isolates background commands throughout every modal state', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const anchorLayer = mount.querySelector<HTMLElement>('[data-boat-anchors]')!;

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    expect(anchorLayer.hasAttribute('inert')).toBe(true);
    fish.click();
    expect(action).not.toHaveBeenCalled();

    ui.hideEvent();
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

  it('makes pause topmost and restores each underlying modal focus', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const eventItem = vi.fn();
    const endure = vi.fn();
    const restarted = vi.fn();
    ui.onEventItem = eventItem;
    ui.onEndure = endure;
    ui.onRestart = restarted;
    ui.render(snapshot(), () => null);
    const pause = mount.querySelector<HTMLElement>('[data-pause]')!;

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    const eventLayer = mount.querySelector<HTMLElement>('[data-event]')!;
    const eventTitle = mount.querySelector<HTMLElement>('[data-event-title]')!;
    ui.setPaused(true);
    expect(pause.hasAttribute('inert')).toBe(false);
    expect(eventLayer.hasAttribute('inert')).toBe(true);
    expect(eventLayer.getAttribute('aria-hidden')).toBe('true');
    mount.querySelector<HTMLButtonElement>('[data-event-items] [data-item="waterJug"]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-endure]')!.click();
    expect(eventItem).not.toHaveBeenCalled();
    expect(endure).not.toHaveBeenCalled();
    ui.setPaused(false);
    expect(eventLayer.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(eventTitle);

    ui.hideEvent();

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

  it('traps keyboard focus inside the event dialog', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    const firstEventItem = mount.querySelector<HTMLButtonElement>('[data-event-items] button')!;
    const endure = mount.querySelector<HTMLButtonElement>('[data-endure]')!;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(endure);
    endure.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(firstEventItem);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(endure);
  });

  it('routes projected actions and pointer coordinates', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    const pointer = vi.fn();
    ui.onAction = action;
    ui.onPointer = pointer;
    ui.render(snapshot({ hull: 40 }), () => null);

    mount.querySelector<HTMLButtonElement>('[data-action="repair"]')!.click();
    expect(action).toHaveBeenCalledWith('repair', undefined);
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 27, clientY: 39 }));
    expect(pointer).toHaveBeenCalledWith(27, 39);
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

  it('renders illustrated conditions and journal status without persistent tallies', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    expect(mount.querySelector('[data-meter="health"] [data-ui-artwork="health"]')).not.toBeNull();
    expect(mount.querySelector('[data-meter="hunger"] [data-ui-artwork="hunger"]')).not.toBeNull();
    expect(mount.querySelector('[data-meter="energy"] [data-ui-artwork="energy"]')).not.toBeNull();
    expect(mount.querySelector('[data-meter="hull"] [data-ui-artwork="hull"]')).not.toBeNull();
    expect(mount.querySelector('.journal-marker [data-ui-artwork="journal"]')).not.toBeNull();
    expect(mount.querySelector('.survival-stores')).toBeNull();
    expect(mount.querySelector('[data-store]')).toBeNull();
    expect(mount.querySelector('[data-action-options]')?.classList).toContain('cinematic-overlay');
    expect(mount.querySelector('[data-event]')?.classList).toContain('cinematic-overlay');
    expect(mount.querySelector('[data-pause]')?.classList).toContain('cinematic-overlay');
    expect(mount.querySelector('[data-ending]')?.classList).toContain('cinematic-overlay');

    ui.dispose();
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

  it('removes document, pointer, and button listeners exactly once on dispose', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    const pointer = vi.fn();
    const pause = vi.fn();
    ui.onAction = action;
    ui.onPointer = pointer;
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;

    ui.dispose();
    ui.dispose();
    fish.click();
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1, clientY: 2 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(action).not.toHaveBeenCalled();
    expect(pointer).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(mount.children).toHaveLength(0);
  });
});
