// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';
import { getSinkingState } from '../src/game/sinking';
import { GameUI } from '../src/ui/GameUI';
import { formatDuration } from '../src/ui/formatDuration';
import { itemThumbnailUrl } from '../src/ui/itemThumbnailManifest';

const mainStyles = readFileSync('src/styles/main.css', 'utf8');

function runningSession(types: readonly ItemId[]): ScavengeSession {
  const items = types.map((type, index): ItemInstance => ({
    instanceId: `${type}-${index + 1}` as ItemInstanceId,
    type,
  }));
  const session = new ScavengeSession(items);
  session.start();
  items.forEach(({ instanceId }) => session.pickUp(instanceId));
  return session;
}

function render(ui: GameUI, session: ScavengeSession): void {
  ui.render(session.snapshot(), getSinkingState(0, 120));
}

describe('GameUI scavenging item tooltip', () => {
  it('uses the survival tooltip treatment at the projected item edge', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.setPrompt('BOTTOM PROMPT');
    ui.setItemTooltip({
      text: 'BUCKET',
      x: 420,
      y: 180,
      placement: 'above',
    });

    const tooltip = mount.querySelector<HTMLElement>('[data-item-tooltip]')!;
    expect(tooltip.classList).toContain('boat-tooltip');
    expect(tooltip.classList).toContain('is-visible');
    expect(tooltip.textContent).toBe('BUCKET');
    expect(tooltip.style.left).toBe('420px');
    expect(tooltip.style.top).toBe('180px');
    expect(tooltip.dataset.placement).toBe('above');
    expect(mount.querySelector('[data-prompt]')?.classList).not.toContain('is-visible');

    ui.setItemTooltip(null);
    expect(tooltip.classList).not.toContain('is-visible');
    ui.dispose();
  });

  it('keeps visual quality controls out of the pause screen', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('[data-pause] [data-visual-quality-control]')).toBeNull();
    expect(mount.querySelector('[data-pause] [data-visual-quality]')).toBeNull();
    ui.dispose();
  });

  it('replaces the crosshair with a pickup hand for a valid pickup target', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const pointer = mount.querySelector<HTMLElement>('[data-pickup-pointer]')!;
    const crosshair = mount.querySelector<HTMLElement>('[data-crosshair]')!;

    ui.setPickupPointer(true);

    expect(pointer.classList).toContain('is-visible');
    expect(crosshair.classList).toContain('is-pickup-hidden');

    ui.setPickupPointer(false);

    expect(pointer.classList).not.toContain('is-visible');
    expect(crosshair.classList).not.toContain('is-pickup-hidden');
    ui.dispose();
  });
});

describe('GameUI scavenging ending', () => {
  it('renders the ending stages and exposes the main-menu action only when ready', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new GameUI(mount);
    const uiRoot = mount.querySelector<HTMLElement>('.game-ui')!;

    ui.renderEnding('sinking', 0.4);
    expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);
    expect(mount.querySelector('[data-ending]')?.classList.contains('is-visible')).toBe(false);
    expect((mount.querySelector('[data-ending-action]') as HTMLButtonElement).hidden).toBe(true);
    expect(uiRoot.style.getPropertyValue('--scavenge-ending-blackout')).toBe('0.4');

    ui.renderEnding('endingHold', 1);
    expect(mount.querySelector('[data-ending]')?.classList.contains('is-visible')).toBe(true);
    expect((mount.querySelector('[data-ending-action]') as HTMLButtonElement).hidden).toBe(true);

    ui.renderEnding('menuReady', 1);
    const action = mount.querySelector('[data-ending-action]') as HTMLButtonElement;
    expect(action.hidden).toBe(false);
    expect(document.activeElement).toBe(action);
    expect(mount.querySelector('[data-ending-title]')?.textContent).toBe('SUNK WITH DOROTHY');
    ui.dispose();
    mount.remove();
  });

  it('calls replay once and removes the ending action listener on disposal', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const onReplay = vi.fn();
    ui.onReplay = onReplay;
    ui.renderEnding('menuReady', 1);
    const action = mount.querySelector<HTMLButtonElement>('[data-ending-action]')!;

    action.click();
    action.click();
    expect(onReplay).toHaveBeenCalledOnce();

    ui.dispose();
    action.click();
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('preserves title-screen ownership when playing is rendered before the game starts', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    ui.renderEnding('playing', 0);

    expect(mount.querySelector('[data-hud]')).toHaveProperty('hidden', true);
    ui.dispose();
  });

  it('initializes the watch from the scavenging duration rule', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);

    expect(mount.querySelector('[data-timer]')?.textContent)
      .toBe(formatDuration(SCAVENGE_DURATION_SECONDS));
    ui.dispose();
  });
});

describe('GameUI carry HUD', () => {
  it('keeps the carry row centered and anchors the watch in the top-right corner', () => {
    expect(mainStyles).toMatch(
      /\.carried\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;/s,
    );
    expect(mainStyles).toMatch(
      /\.pocket-watch\s*\{[^}]*position:\s*absolute;[^}]*top:\s*clamp\(16px, 2vw, 24px\);[^}]*right:\s*clamp\(8px, 2\.35vw, 30px\);[^}]*left:\s*auto;/s,
    );
  });

  it('uses one large fluid size for the carry slots and watch', () => {
    expect(mainStyles).toMatch(
      /\.illustrated-hud\s*\{[^}]*--carry-slot-size:\s*clamp\(68px, 15vw, 192px\);/s,
    );
    expect(mainStyles).toMatch(
      /\.weight-circles__row\s*\{[^}]*grid-template-columns:\s*repeat\(3, var\(--carry-slot-size\)\);/s,
    );
    expect(mainStyles).toMatch(
      /\.weight-circle\s*\{[^}]*width:\s*var\(--carry-slot-size\);[^}]*height:\s*var\(--carry-slot-size\);/s,
    );
    expect(mainStyles).toMatch(
      /\.pocket-watch\s*\{[^}]*width:\s*var\(--carry-slot-size\);[^}]*height:\s*var\(--carry-slot-size\);/s,
    );
  });

  it('pops new thumbnails and their circle rims together', () => {
    expect(mainStyles).toMatch(
      /\.weight-circle\.is-filled\s*\{[^}]*animation:\s*carry-slot-pop 180ms/s,
    );
    expect(mainStyles).toMatch(
      /\.weight-circle__thumbnail\s*\{[^}]*animation:\s*carry-thumbnail-pop 180ms/s,
    );
    expect(mainStyles).toMatch(
      /@keyframes carry-thumbnail-pop\s*\{[^}]*scale\(\.55\)[\s\S]*scale\(1\.08\)[\s\S]*scale\(1\)/s,
    );
  });

  it('resets the timer block transform on the anchored watch', () => {
    expect(mainStyles).toMatch(
      /\.pocket-watch\s*\{[^}]*transform:\s*none;/s,
    );
  });

  it('keeps thumbnail opacity separate from the translucent circle treatment', () => {
    expect(mainStyles).toMatch(/\.weight-circle__thumbnail\s*\{[^}]*opacity:\s*1;/s);
    expect(mainStyles).not.toMatch(/\.weight-circle\s*\{[^}]*opacity:/s);
  });

  it('keeps the filled circle paint translucent behind its opaque thumbnail', () => {
    expect(mainStyles).toMatch(
      /\.weight-circle\.is-filled\s*\{[^}]*background:\s*radial-gradient\(circle at 45% 38%, #33445880, #111925b8 76%\);/s,
    );
  });

  it('keeps three empty carry circles', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    render(ui, runningSession([]));
    expect(mount.querySelectorAll('[data-weight-circle]')).toHaveLength(3);
    expect(mount.querySelectorAll('[data-weight-circle].is-filled')).toHaveLength(0);
    ui.dispose();
  });

  it('repeats a heavy item thumbnail across its weight slots', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    render(ui, runningSession(['medicalKit']));
    const images = [...mount.querySelectorAll<HTMLImageElement>('[data-weight-circle] img')];
    expect(images).toHaveLength(2);
    expect(images.every(
      (image) => image.getAttribute('src') === itemThumbnailUrl('medicalKit'),
    )).toBe(true);
    ui.dispose();
  });

  it('does not render full-hand guidance below the carry slots', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    render(ui, runningSession(['anchor']));
    expect(mount.querySelector('[data-carry-full]')).toBeNull();
    expect(mount.textContent).not.toContain('HANDS FULL');
    ui.dispose();
  });

  it('keeps the top-right watch outside the centered carry container', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const carried = mount.querySelector('[data-carried]')!;
    const watch = mount.querySelector('.pocket-watch')!;
    expect(carried.contains(watch)).toBe(false);
    ui.dispose();
  });

  it('reuses unchanged carry slot nodes', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const session = runningSession(['cannedFood']);
    render(ui, session);
    const before = [...mount.querySelectorAll('[data-weight-circle]')];
    const imageBefore = mount.querySelector('[data-weight-circle] img');
    render(ui, session);
    expect([...mount.querySelectorAll('[data-weight-circle]')]).toEqual(before);
    expect(mount.querySelector('[data-weight-circle] img')).toBe(imageBefore);
    ui.dispose();
  });

  it('keeps a filled slot when its thumbnail fails', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    render(ui, runningSession(['cannedFood']));
    const image = mount.querySelector<HTMLImageElement>('[data-weight-circle] img')!;
    image.dispatchEvent(new Event('error'));
    expect(image.hidden).toBe(true);
    expect(image.closest('[data-weight-circle]')?.classList).toContain('is-filled');
    ui.dispose();
  });
});
