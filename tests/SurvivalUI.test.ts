// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { SurvivalUI } from '../src/ui/SurvivalUI';

afterEach(() => {
  document.body.innerHTML = '';
});

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
  it('renders labeled meters, actions, weather, hotspots, and all item charges', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);

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
    const ui = new SurvivalUI(mount);
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

  it('shows unavailable reasons and event item selection accessibly', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    ui.render(snapshot(), (action) => action === 'repair' ? 'No repair material or duct tape.' : null);

    const repair = mount.querySelector<HTMLButtonElement>('[data-action="repair"]')!;
    expect(repair.getAttribute('aria-description')).toContain('No repair material');
    expect(repair.disabled).toBe(true);
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
    const ui = new SurvivalUI(mount);
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

  it('keeps meter and action nodes stable across differential renders', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
    ui.render(snapshot(), () => null);
    const health = mount.querySelector<HTMLElement>('[data-meter="health"]')!;
    const fish = mount.querySelector('[data-action="fish"]');

    ui.render(snapshot({ health: 63 }), () => null);

    expect(mount.querySelector('[data-meter="health"]')).toBe(health);
    expect(mount.querySelector('[data-action="fish"]')).toBe(fish);
    expect(health.getAttribute('aria-valuenow')).toBe('63');
    expect(health.style.getPropertyValue('--meter-value')).toBe('63%');
  });

  it('uses number shortcuts only when no overlay is open', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
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
    const ui = new SurvivalUI(mount);
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

  it('routes diegetic hotspots and pointer coordinates', () => {
    const mount = document.createElement('main');
    const ui = new SurvivalUI(mount);
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
    const ui = new SurvivalUI(mount);
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
    const ui = new SurvivalUI(mount);
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
