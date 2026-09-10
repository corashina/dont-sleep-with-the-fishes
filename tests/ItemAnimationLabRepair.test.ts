// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.innerHTML = '';
});

function repairLab() {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new SurvivalUI(mount);
  const session = new SurvivalSession([
    { instanceId: 'ductTape-1', type: 'ductTape' },
    { instanceId: 'bucket-1', type: 'bucket' },
    { instanceId: 'compass-1', type: 'compass' },
    { instanceId: 'knife-1', type: 'knife' },
  ], { seed: 19, initialConditions: { 'knife-1': 'lost' } });
  const syncInventory = vi.fn();
  const onCheckpointChange = vi.fn();
  const onFatalError = vi.fn();
  const phase = SurvivalPhase.forTest({
    session, ui, world: { syncInventory }, onCheckpointChange, onFatalError,
  }, 'item-animation-lab');
  cleanups.push(() => phase.dispose());
  phase.start();
  onCheckpointChange.mockClear();

  const click = (selector: string) => {
    const button = mount.querySelector<HTMLButtonElement>(selector);
    expect(button).not.toBeNull();
    button!.click();
  };
  const openRepair = () => {
    ui.onEventItem('tape-stretch', 'ductTape-1');
    click('[data-event-choice="repairItem"]');
    expect(mount.querySelector('[data-repair-options]')?.getAttribute('aria-hidden')).toBe('false');
  };
  return { mount, ui, session, phase, syncInventory, onCheckpointChange, onFatalError, click, openRepair };
}

describe('Item Animation Lab repair menu', () => {
  it('repairs chosen broken items through the real menu and keeps tape for repeated tests', () => {
    const lab = repairLab();
    const before = lab.session.snapshot();
    for (const [choice, target] of [['bucket-scoop', 'bucket-1'], ['compass-search', 'compass-1']] as const) {
      lab.ui.onEventItem(choice, target);
      lab.click('[data-event-choice="break"]');
    }
    lab.openRepair();
    expect([...lab.mount.querySelectorAll<HTMLElement>('[data-repair-target]')]
      .map((button) => button.dataset.repairTarget)).toEqual(['bucket-1', 'compass-1']);
    lab.click('[data-repair-target="bucket-1"]');
    expect(lab.session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
    expect(lab.session.snapshot().inventory['compass-1']?.condition).toBe('broken');
    expect(lab.syncInventory).toHaveBeenLastCalledWith(lab.session.snapshot());
    expect(lab.mount.querySelector('[data-repair-options]')?.getAttribute('aria-hidden')).toBe('true');

    lab.openRepair();
    expect(lab.mount.querySelectorAll('[data-repair-target]')).toHaveLength(1);
    lab.click('[data-repair-target="compass-1"]');
    const after = lab.session.snapshot();
    expect(after.inventory).toEqual(before.inventory);
    expect(after.energy).toBe(before.energy);
    expect(after.day).toBe(before.day);
    expect(after.journalEntries).toEqual(before.journalEntries);
    expect(lab.phase.getSurvivalCheckpoint()).toBeNull();
    expect(lab.onCheckpointChange).not.toHaveBeenCalled();
    expect(lab.onFatalError).not.toHaveBeenCalled();
  });
});
