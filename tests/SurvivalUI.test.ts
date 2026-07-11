// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const activeUIs: SurvivalUI[] = [];

afterEach(() => {
  activeUIs.splice(0).forEach((ui) => ui.dispose());
  document.body.innerHTML = '';
});

function createUI(mount: HTMLElement): SurvivalUI {
  const ui = new SurvivalUI(mount);
  activeUIs.push(ui);
  return ui;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    ...new SurvivalSession(['fishingRod', 'waterJug'], {
      seed: 7,
      random: sequenceRandom([0.5]),
    }).snapshot(),
    ...overrides,
  };
}

describe('SurvivalUI', () => {
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

  it('announces outcomes politely and exposes one terminal alert heading', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    const liveRegion = mount.querySelector('[data-outcome-message]');
    expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');

    ui.showEnding('dead', 3, 77, 12);
    const alerts = mount.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBe(mount.querySelector('[data-ending-title]'));
  });

  it('renders labeled meters, actions, weather, hotspots, and all item charges', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot(), () => null);

    expect(mount.querySelector('[data-day]')?.textContent).toContain('DAY 1');
    expect(mount.querySelector('[data-weather]')?.textContent).toContain('CALM');
    expect(mount.querySelector('[data-phase]')?.textContent).toContain('DAYLIGHT');
    expect(mount.querySelector('[data-meter="health"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(mount.querySelector('[data-meter="hunger"]')?.getAttribute('aria-valuenow')).toBe('20');
    expect(mount.querySelector('[data-meter="energy"]')?.getAttribute('aria-valuenow')).toBe('4');
    expect(mount.querySelector('[data-meter="hull"]')?.getAttribute('aria-valuenow')).toBe('75');
    expect(mount.querySelector('[data-item="waterJug"]')?.textContent).toContain('3');
    expect(mount.querySelectorAll('[data-inventory-items] [data-item]')).toHaveLength(ITEM_IDS.length);
    expect(mount.querySelectorAll('[data-action]')).toHaveLength(7);
    expect(mount.querySelectorAll('[data-hotspot]')).toHaveLength(4);
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
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot({ bait: 2 }), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;

    fish.click();
    expect(action).not.toHaveBeenCalled();
    mount.querySelector<HTMLButtonElement>('[data-action-option="fish"]')!.click();
    expect(action).toHaveBeenLastCalledWith('fish', undefined);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    mount.querySelector<HTMLButtonElement>('[data-action-option="useBait"]')!.click();
    expect(action).toHaveBeenLastCalledWith('fish', 'useBait');
    expect(action).toHaveBeenCalledTimes(2);
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
    const fish = mount.querySelector<HTMLButtonElement>('[data-hotspot="fish"]')!;
    const dive = mount.querySelector<HTMLButtonElement>('[data-action="dive"]')!;
    const options = mount.querySelector<HTMLElement>('[data-action-options]')!;

    fish.click();
    expect(options.classList).toContain('is-visible');
    expect(document.activeElement).toBe(mount.querySelector('[data-action-options-title]'));
    expect(mount.querySelector('.survival-actions')?.hasAttribute('inert')).toBe(true);
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

  it('keeps unavailable actions and hotspots focusable while suppressing commands', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const action = vi.fn();
    ui.onAction = action;
    ui.render(snapshot(), (id) => id === 'fish' ? 'The line is tangled.' : null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    const hotspot = mount.querySelector<HTMLButtonElement>('[data-hotspot="fish"]')!;

    for (const control of [fish, hotspot]) {
      expect(control.disabled).toBe(false);
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(control.getAttribute('aria-description')).toContain('line is tangled');
      control.focus();
      expect(document.activeElement).toBe(control);
      control.click();
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    expect(action).not.toHaveBeenCalled();

    ui.setBusy(true);
    expect(fish.disabled).toBe(true);
    expect(hotspot.disabled).toBe(true);
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

  it('routes event choices, endurance, outcomes, and continue without duplicate commands', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const eventItem = vi.fn();
    const endure = vi.fn();
    const continued = vi.fn();
    const skipped = vi.fn();
    ui.onEventItem = eventItem;
    ui.onEndure = endure;
    ui.onContinue = continued;
    ui.onSkip = skipped;
    ui.render(snapshot(), () => null);
    const fish = mount.querySelector<HTMLButtonElement>('[data-action="fish"]')!;
    fish.focus();

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    mount.querySelector<HTMLButtonElement>('[data-event-items] [data-item="waterJug"]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-endure]')!.click();
    expect(eventItem).toHaveBeenCalledWith('waterJug');
    expect(endure).toHaveBeenCalledOnce();

    ui.showOutcome({
      accepted: true,
      code: 'survived',
      message: 'The shadow turns away.',
      deltas: { health: -8, rescueProgress: 10 },
      cue: 'impact',
    });
    expect(mount.querySelector('[data-outcome]')?.classList).toContain('is-visible');
    expect(mount.querySelector('[data-outcome-deltas]')?.textContent).toContain('HEALTH -8');
    expect(mount.querySelector('[data-outcome-deltas]')?.textContent).toContain('RESCUE +10');
    mount.querySelector<HTMLButtonElement>('[data-skip]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-continue]')!.click();
    expect(skipped).toHaveBeenCalledOnce();
    expect(continued).toHaveBeenCalledOnce();

    ui.hideOutcome();
    expect(mount.querySelector('[data-outcome]')?.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(fish);
  });

  it('restores direct-click and numeric-shortcut command origins after outcomes', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    ui.render(snapshot(), () => null);
    const dive = mount.querySelector<HTMLButtonElement>('[data-action="dive"]')!;
    const endDay = mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!;
    ui.onAction = () => ui.showOutcome({
      accepted: true,
      code: 'complete',
      message: 'The work is done.',
      deltas: {},
      cue: 'none',
    });

    dive.click();
    ui.hideOutcome();
    expect(document.activeElement).toBe(dive);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '7' }));
    ui.hideOutcome();
    expect(document.activeElement).toBe(endDay);

    endDay.click();
    ui.render(snapshot(), (id) => id === 'endDay' ? 'Night has already fallen.' : null);
    ui.hideOutcome();
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
    ui.onAction = () => ui.showOutcome({
      accepted: true,
      code: 'complete',
      message: 'The work is done.',
      deltas: {},
      cue: 'none',
    });

    dive.click();
    ui.hideOutcome();

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

  it('marks critical meter values with a non-color danger state', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);

    ui.render(snapshot({ health: 12, hull: 21 }), () => null);

    const health = mount.querySelector('[data-meter="health"]');
    expect(health?.classList).toContain('is-danger');
    expect(health?.getAttribute('aria-valuetext')).toBe('12, critical');
    expect(mount.querySelector('[data-meter="hull"]')?.classList).not.toContain('is-danger');
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

  it('closes inventory before requesting pause and resumes accessibly', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = createUI(mount);
    const pause = vi.fn();
    ui.onPauseChange = pause;
    ui.render(snapshot(), () => null);

    mount.querySelector<HTMLButtonElement>('[data-inventory-toggle]')!.click();
    expect(mount.querySelector('[data-inventory]')?.classList).toContain('is-visible');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mount.querySelector('[data-inventory]')?.classList).not.toContain('is-visible');
    expect(pause).not.toHaveBeenCalled();

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
    const actionDock = mount.querySelector<HTMLElement>('.survival-actions')!;
    const hotspots = mount.querySelector<HTMLElement>('.survival-hotspots')!;
    const inventoryToggle = mount.querySelector<HTMLButtonElement>('[data-inventory-toggle]')!;

    ui.showEvent({ id: 'test', title: 'A shadow', prompt: 'Something moves below.', danger: 'dangerous' }, snapshot());
    expect(actionDock.hasAttribute('inert')).toBe(true);
    expect(hotspots.hasAttribute('inert')).toBe(true);
    expect(inventoryToggle.hasAttribute('inert')).toBe(true);
    fish.click();
    inventoryToggle.click();
    expect(action).not.toHaveBeenCalled();
    expect(mount.querySelector('[data-inventory]')?.classList).not.toContain('is-visible');

    ui.showOutcome({ accepted: true, code: 'safe', message: 'It passes.', deltas: {}, cue: 'none' });
    fish.click();
    expect(action).not.toHaveBeenCalled();
    ui.hideOutcome();
    expect(actionDock.hasAttribute('inert')).toBe(false);
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
    const continued = vi.fn();
    const skipped = vi.fn();
    const restarted = vi.fn();
    ui.onEventItem = eventItem;
    ui.onEndure = endure;
    ui.onContinue = continued;
    ui.onSkip = skipped;
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

    ui.showOutcome({ accepted: true, code: 'safe', message: 'It passes.', deltas: {}, cue: 'none' });
    const outcomeLayer = mount.querySelector<HTMLElement>('[data-outcome]')!;
    const outcomeTitle = mount.querySelector<HTMLElement>('[data-outcome-title]')!;
    ui.setPaused(true);
    expect(outcomeLayer.hasAttribute('inert')).toBe(true);
    mount.querySelector<HTMLButtonElement>('[data-continue]')!.click();
    mount.querySelector<HTMLButtonElement>('[data-skip]')!.click();
    expect(continued).not.toHaveBeenCalled();
    expect(skipped).not.toHaveBeenCalled();
    ui.setPaused(false);
    expect(outcomeLayer.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(outcomeTitle);
    ui.hideOutcome();

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

  it('traps keyboard focus inside event and outcome dialogs', () => {
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

    ui.showOutcome({ accepted: true, code: 'safe', message: 'It passes.', deltas: {}, cue: 'none' });
    const skip = mount.querySelector<HTMLButtonElement>('[data-skip]')!;
    const continueButton = mount.querySelector<HTMLButtonElement>('[data-continue]')!;
    continueButton.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(skip);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(continueButton);
  });

  it('routes diegetic hotspots and pointer coordinates', () => {
    const mount = document.createElement('main');
    const ui = createUI(mount);
    const action = vi.fn();
    const pointer = vi.fn();
    ui.onAction = action;
    ui.onPointer = pointer;
    ui.render(snapshot({ hull: 40 }), () => null);

    mount.querySelector<HTMLButtonElement>('[data-hotspot="repair"]')!.click();
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
