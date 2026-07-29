// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { getSinkingState } from '../src/game/sinking';
import { GameUI } from '../src/ui/GameUI';
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

describe('GameUI carry HUD', () => {
  it('anchors the watch to the right of the centered carry slots', () => {
    expect(mainStyles).toMatch(
      /\.carried\s*\{[^}]*display:\s*grid;[^}]*justify-items:\s*center;/s,
    );
    expect(mainStyles).toMatch(
      /\.pocket-watch\s*\{[^}]*position:\s*absolute;[^}]*left:\s*calc\(100% \+ 16px\);/s,
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

  it('shows and clears the full-hand status', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const session = runningSession(['anchor']);
    render(ui, session);
    expect(mount.querySelector('[data-carry-full]')?.textContent)
      .toBe('HANDS FULL - RETURN TO THE BOAT');
    session.saveCarriedBundle();
    render(ui, session);
    expect(mount.querySelector('[data-carry-full]')?.textContent).toBe('');
    ui.dispose();
  });

  it('keeps the empty full-hand status available without reserved space', () => {
    const emptyRule = mainStyles.match(/\.carry-full:empty\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(emptyRule).toMatch(/margin-top:\s*0;/);
    expect(emptyRule).not.toMatch(/display:\s*none;/);
    expect(emptyRule).not.toMatch(/visibility:\s*hidden;/);
  });

  it('reuses unchanged carry slot nodes', () => {
    const mount = document.createElement('main');
    const ui = new GameUI(mount);
    const session = runningSession(['cannedFood']);
    render(ui, session);
    const before = [...mount.querySelectorAll('[data-weight-circle]')];
    render(ui, session);
    expect([...mount.querySelectorAll('[data-weight-circle]')]).toEqual(before);
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
