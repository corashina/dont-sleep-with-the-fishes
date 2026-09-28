// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from 'vitest';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function carlitosLab(lab = true, aboard = true) {
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new SurvivalUI(mount);
  const session = new SurvivalSession(aboard ? [{ type: 'carlitos', instanceId: 'carlitos-1' }] : [], {
    seed: 19, initialCarlitos: { pettedToday: true },
  });
  const playCarlitosAction = vi.fn<(
    action: 'petCarlitos' | 'feedCarlitos', onContact?: () => void,
  ) => Promise<void>>(() => Promise.resolve());
  const meowCarlitos = vi.spyOn(SurvivalAudio.prototype, 'meowCarlitos');
  const setEventEligibleItems = vi.fn();
  const cycleCarlitosPositionForLab = vi.fn();
  const getCarlitosPositionForLab = vi.fn(() => 'rim-forward-1');
  const onInvariantError = vi.fn();
  const onCheckpointChange = vi.fn();
  const phase = SurvivalPhase.forTest({
    session, ui, world: { playCarlitosAction, setEventEligibleItems, cycleCarlitosPositionForLab, getCarlitosPositionForLab },
    onInvariantError, onCheckpointChange,
  }, lab ? 'item-animation-lab' : undefined);
  cleanups.push(() => phase.dispose());
  phase.start();
  ui.setAnchors([{
    id: 'carlitos', companionId: 'carlitos', itemType: null, toolId: null,
    action: null, remainingUses: null, backingInstanceId: 'carlitos-1',
    x: 400, y: 300, visible: true, depleted: false,
  }]);
  onCheckpointChange.mockClear();
  const click = (selector: string) => {
    const button = mount.querySelector<HTMLButtonElement>(selector)!;
    expect(button).not.toBeNull();
    button.click();
    return button;
  };
  return { mount, ui, session, phase, playCarlitosAction, meowCarlitos,
    setEventEligibleItems, cycleCarlitosPositionForLab, getCarlitosPositionForLab,
    onInvariantError, onCheckpointChange, click };
}

describe('Item Animation Lab Carlitos', () => {
  // Importance: 95/100. Lab controls must not spend resources or bypass playback and mode guards.
  it('cycles positions through the card without changing the session or checkpoint', () => {
    const lab = carlitosLab();
    const snapshot = lab.session.snapshot();
    lab.click('[data-anchor-id="carlitos"]');
    expect(lab.mount.querySelector<HTMLElement>('[data-carlitos-position-controls]')!.hidden).toBe(false);
    lab.click('[data-carlitos-position="next"]');
    expect(lab.cycleCarlitosPositionForLab).toHaveBeenLastCalledWith(1);
    expect(lab.mount.querySelector('[data-carlitos-position-label]')!.textContent).toBe('rim-forward-1');
    lab.click('[data-carlitos-position="previous"]');
    expect(lab.cycleCarlitosPositionForLab).toHaveBeenLastCalledWith(-1);
    expect(lab.session.snapshot()).toEqual(snapshot);
    expect(lab.onCheckpointChange).not.toHaveBeenCalled();
    lab.ui.setPaused(true);
    expect(lab.click('[data-carlitos-position="next"]').disabled).toBe(true);
    lab.ui.setPaused(false);
    expect(lab.click('[data-carlitos-position="next"]').disabled).toBe(false);
  });

  it('blocks position changes during care playback and restores them after playback', async () => {
    const lab = carlitosLab();
    let finish = () => {};
    lab.playCarlitosAction.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    lab.phase.handleAction('petCarlitos');
    expect(lab.click('[data-carlitos-position="next"]').disabled).toBe(true);
    lab.ui.onCarlitosPosition(1);
    expect(lab.cycleCarlitosPositionForLab).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    lab.click('[data-carlitos-position="next"]');
    expect(lab.cycleCarlitosPositionForLab).toHaveBeenCalledWith(1);
  });

  it.each([[false, true], [true, false]])('guards position controls with lab=%s and aboard=%s', (active, aboard) => {
    const lab = carlitosLab(active, aboard);
    if (!active) expect(lab.mount.querySelector<HTMLElement>('[data-carlitos-position-controls]')!.hidden).toBe(true);
    expect(lab.click('[data-carlitos-position="next"]').disabled).toBe(true);
    lab.ui.onCarlitosPosition(1);
    expect(lab.cycleCarlitosPositionForLab).not.toHaveBeenCalled();
  });

  it('restores controls after playback rejects', async () => {
    const lab = carlitosLab();
    const error = new Error('Playback failed');
    lab.playCarlitosAction.mockRejectedValueOnce(error);
    lab.phase.handleAction('petCarlitos');
    await Promise.resolve();
    expect(lab.onInvariantError).toHaveBeenCalledWith(error);
    lab.phase.handleAction('feedCarlitos');
    expect(lab.playCarlitosAction).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it('ignores delayed sound and completion after disposal', async () => {
    const lab = carlitosLab();
    let finish = () => {};
    lab.playCarlitosAction.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    lab.phase.handleAction('petCarlitos');
    const contact = lab.playCarlitosAction.mock.lastCall?.[1];
    lab.phase.dispose();
    lab.setEventEligibleItems.mockClear();
    contact?.();
    finish();
    await Promise.resolve();
    expect(lab.meowCarlitos).not.toHaveBeenCalled();
    expect(lab.setEventEligibleItems).not.toHaveBeenCalled();
  });
});
