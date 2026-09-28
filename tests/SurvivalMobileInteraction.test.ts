// @vitest-environment jsdom
// Importance: target selection 95; fishing input 95; interruption 100.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';
import { SurvivalFishingView } from '../src/ui/SurvivalFishingView';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';

const views: { dispose(): void }[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.dispose());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function touch(target: Element, type: string, x: number, y: number, pointerId = 1): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
}

function anchor(id: string, x: number, y: number, overrides: Partial<BoatInteractionAnchor> = {}): BoatInteractionAnchor {
  return {
    id, itemType: null, toolId: 'fishingRod', action: 'fish',
    x, y, visible: true, depleted: false, remainingUses: null,
    hitArea: { width: 20, height: 20, depth: 1 }, ...overrides,
  };
}

describe('survival touch interaction', () => {
  it('selects the direct visible target before an overlapping expanded target', () => {
    const host = document.createElement('main');
    document.body.append(host);
    const view = new BoatAnchorView(host);
    host.append(...view.roots);
    views.push(view);
    const action = vi.fn();
    view.onAction = action;
    view.setAnchors([
      anchor('near', 100, 100, { hitArea: { width: 20, height: 20, depth: 1 }, touchHitTest: () => 'expanded' }),
      anchor('direct', 110, 100, { hitArea: { width: 20, height: 20, depth: 2 }, touchHitTest: (x) => x === 110 ? 'direct' : null }),
    ]);
    const direct = host.querySelector<HTMLButtonElement>('[data-anchor-id="direct"]')!;
    touch(direct, 'pointerdown', 110, 100);
    touch(direct, 'pointerup', 110, 100);
    direct.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 110, clientY: 100 }));
    expect(direct.classList.contains('is-touch-selected')).toBe(true);
    expect(action).not.toHaveBeenCalled();
    touch(direct, 'pointerdown', 110, 100);
    touch(direct, 'pointerup', 110, 100);
    direct.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 110, clientY: 100 }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not select an occluded precise target through its expanded hit area', () => {
    const host = document.createElement('main');
    document.body.append(host);
    const view = new BoatAnchorView(host);
    host.append(...view.roots);
    views.push(view);
    const action = vi.fn();
    view.onAction = action;
    view.setAnchors([anchor('hidden', 100, 100, { touchHitTest: () => null })]);
    const hidden = host.querySelector<HTMLButtonElement>('[data-anchor-id="hidden"]')!;
    touch(hidden, 'pointerdown', 100, 100);
    touch(hidden, 'pointerup', 100, 100);
    touch(hidden, 'pointerdown', 100, 100);
    touch(hidden, 'pointerup', 100, 100);
    expect(hidden.classList.contains('is-touch-selected')).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('uses a 48 pixel expanded area for a visible projected target', () => {
    const host = document.createElement('main');
    const canvas = document.createElement('canvas');
    document.body.append(host);
    document.body.append(canvas);
    const view = new BoatAnchorView(host);
    host.append(...view.roots);
    views.push(view);
    view.setAnchors([anchor('small', 100, 100)]);
    const small = host.querySelector<HTMLButtonElement>('[data-anchor-id="small"]')!;
    touch(canvas, 'pointerdown', 121, 100);
    touch(canvas, 'pointerup', 121, 100);
    expect(small.classList.contains('is-touch-selected')).toBe(true);
    expect(Number.parseInt(small.style.width)).toBeGreaterThanOrEqual(48);
  });

  // Importance: 97/100. A second finger must not validate another finger's drag.
  it('requires each item release to match its own short touch', () => {
    const host = document.createElement('main');
    document.body.append(host);
    const view = new BoatAnchorView(host);
    host.append(...view.roots);
    views.push(view);
    const action = vi.fn();
    view.onAction = action;
    view.setAnchors([anchor('supply', 100, 100)]);
    const button = host.querySelector<HTMLButtonElement>('[data-anchor-id="supply"]')!;
    touch(button, 'pointerup', 100, 100, 4);
    touch(button, 'pointerdown', 70, 100, 1);
    touch(button, 'pointerdown', 100, 100, 2);
    touch(button, 'pointerup', 100, 100, 1);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 100, clientY: 100 }));
    touch(button, 'pointercancel', 100, 100, 2);
    touch(button, 'pointerup', 100, 100, 2);
    expect(button.classList.contains('is-touch-selected')).toBe(false);
    expect(action).not.toHaveBeenCalled();
    touch(button, 'pointerdown', 100, 100, 3);
    touch(button, 'pointerup', 100, 100, 3);
    expect(button.classList.contains('is-touch-selected')).toBe(true);
  });

  // Importance: 95/100. Event text must own its scroll gesture.
  it('ignores touches inside a scrollable event caption', () => {
    const host = document.createElement('main');
    const caption = document.createElement('section');
    caption.className = 'event-caption is-visible';
    document.body.append(host);
    host.append(caption);
    const view = new BoatAnchorView(host);
    host.append(...view.roots);
    views.push(view);
    view.setAnchors([anchor('supply', 100, 100)]);
    const button = host.querySelector<HTMLButtonElement>('[data-anchor-id="supply"]')!;
    touch(caption, 'pointerdown', 100, 100);
    touch(caption, 'pointerup', 100, 100);
    expect(button.classList.contains('is-touch-selected')).toBe(false);
  });

  it('casts once for a touch pointer and its generated click, then reels once per bite', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const view = new SurvivalFishingView(mount);
    mount.append(...view.roots);
    views.push(view);
    const cast = vi.fn(() => true);
    const reel = vi.fn(() => true);
    view.onCast = cast;
    view.onReel = reel;
    view.setState({ mode: 'aiming', message: 'Cast', biteTarget: null });
    touch(view.interactionRoot, 'pointerdown', 100, 100);
    touch(view.interactionRoot, 'pointerup', 100, 100);
    view.interactionRoot.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100, clientY: 100 }));
    expect(cast).toHaveBeenCalledOnce();
    view.setState({ mode: 'bite', message: 'Reel', biteTarget: {
      x: 100, y: 100, width: 10, height: 10, depth: 1, visible: true,
    } });
    expect(Number.parseInt(view.biteButton.style.width)).toBeGreaterThanOrEqual(48);
    view.biteButton.click();
    view.biteButton.click();
    expect(reel).toHaveBeenCalledOnce();
  });

  // Importance: 97/100. Drag and cancelled gestures must not cast.
  it('casts only after a matching short water touch', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const view = new SurvivalFishingView(mount);
    mount.append(...view.roots);
    views.push(view);
    const cast = vi.fn(() => true);
    view.onCast = cast;
    view.setState({ mode: 'aiming', message: 'Cast', biteTarget: null });
    touch(view.interactionRoot, 'pointerup', 100, 100, 4);
    touch(view.interactionRoot, 'pointerdown', 50, 100, 1);
    touch(view.interactionRoot, 'pointerdown', 100, 100, 2);
    touch(view.interactionRoot, 'pointerup', 100, 100, 1);
    view.interactionRoot.dispatchEvent(new MouseEvent('click', {
      bubbles: true, detail: 1, clientX: 100, clientY: 100,
    }));
    touch(view.interactionRoot, 'pointercancel', 100, 100, 2);
    touch(view.interactionRoot, 'pointerup', 100, 100, 2);
    expect(cast).not.toHaveBeenCalled();
    touch(view.interactionRoot, 'pointerdown', 100, 100, 3);
    touch(view.interactionRoot, 'pointerup', 100, 100, 3);
    expect(cast).toHaveBeenCalledOnce();
  });

  // Importance: 97/100. A tap that starts on Exit must never cast on water.
  it('does not cast when a touch starts on Exit and ends on water', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const view = new SurvivalFishingView(mount);
    mount.append(...view.roots);
    views.push(view);
    const cast = vi.fn(() => true);
    view.onCast = cast;
    view.setState({ mode: 'aiming', message: 'Cast', biteTarget: null });
    view.setExitVisible(true);

    touch(view.exitButton, 'pointerdown', 100, 100, 7);
    touch(view.interactionRoot, 'pointerup', 105, 105, 7);
    expect(cast).not.toHaveBeenCalled();

    touch(view.interactionRoot, 'pointerdown', 105, 105, 8);
    touch(view.interactionRoot, 'pointerup', 105, 105, 8);
    expect(cast).toHaveBeenCalledOnce();
  });

  it('preserves a prior pause when mobile suspension ends', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const session = new SurvivalSession([], { seed: 1 });
    const world = { update: vi.fn() };
    const ui = new SurvivalUI(mount);
    const phase = SurvivalPhase.forTest({ session, world, ui });
    views.push(phase);
    phase.start();
    phase.setPaused(true);
    phase.setMobileSuspended(true);
    phase.setMobileSuspended(false);
    phase.update(1, 1);
    expect(world.update).not.toHaveBeenCalled();
  });

  it('needs one Resume after a hidden mixed-pointer session', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const world = { update: vi.fn() };
    const phase = SurvivalPhase.forTest({ ui, world, session: new SurvivalSession([], { seed: 1 }) });
    views.push(phase);
    phase.start();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    phase.setMobileSuspended(true);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    phase.update(1, 1);
    expect(world.update).not.toHaveBeenCalled();
    phase.setMobileSuspended(false);
    phase.update(2, 1);
    expect(world.update).toHaveBeenCalledOnce();
  });

  it('keeps a prior manual pause through a hidden touch session', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const world = { update: vi.fn() };
    const phase = SurvivalPhase.forTest({ ui, world, session: new SurvivalSession([], { seed: 1 }) });
    views.push(phase);
    phase.start();
    phase.setPaused(true);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    phase.setMobileSuspended(false);
    phase.update(1, 1);
    expect(world.update).not.toHaveBeenCalled();
  });

  it('keeps an open journal through mobile suspension', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const phase = SurvivalPhase.forTest({ ui, world: {}, session: new SurvivalSession([], { seed: 1 }) });
    views.push(phase);
    phase.start();
    ui.showJournal([]);
    const journal = mount.querySelector<HTMLElement>('[data-journal]')!;
    expect(journal.classList.contains('is-visible')).toBe(true);
    phase.setMobileSuspended(true);
    phase.setMobileSuspended(false);
    expect(journal.classList.contains('is-visible')).toBe(true);
    expect(mount.querySelector('[data-pause]')?.classList.contains('is-visible')).toBe(false);
  });

  it('routes the visible mobile pause control through the survival pause action', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    views.push(ui);
    const pause = vi.fn();
    ui.onPauseChange = pause;
    mount.querySelector<HTMLButtonElement>('[data-mobile-pause]')!.click();
    expect(pause).toHaveBeenCalledExactlyOnceWith(true);
  });
});
