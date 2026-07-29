// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { ScavengeSession } from '../src/game/ScavengeSession';
import { getSinkingState } from '../src/game/sinking';
import { GameUI } from '../src/ui/GameUI';
import { itemThumbnailUrl } from '../src/ui/itemThumbnailManifest';

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
