// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  const onInvariantError = vi.fn();
  const onCheckpointChange = vi.fn();
  const phase = SurvivalPhase.forTest({
    session, ui, world: { playCarlitosAction, setEventEligibleItems },
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
    setEventEligibleItems, onInvariantError, onCheckpointChange, click };
}

describe('Item Animation Lab Carlitos', () => {
  it('replays pet and feed from his card without care limits or session changes', async () => {
    const lab = carlitosLab();
    const before = lab.session.snapshot();
    expect(lab.session.availableReason('petCarlitos')).not.toBeNull();
    expect(lab.session.availableReason('feedCarlitos')).not.toBeNull();
    lab.click('[data-anchor-id="carlitos"]');
    expect(lab.mount.querySelector<HTMLElement>('[data-carlitos-card]')!.hidden).toBe(false);
    expect(lab.mount.querySelector<HTMLElement>('[data-carlitos-rest]')!.hidden).toBe(true);
    expect(lab.mount.textContent).not.toContain('Care raises');
    expect(lab.mount.textContent).not.toContain('Rest restores');
    for (const action of ['petCarlitos', 'feedCarlitos', 'petCarlitos', 'feedCarlitos'] as const) {
      const button = lab.click(`[data-carlitos-card] [data-action="${action}"]`);
      expect(lab.playCarlitosAction.mock.lastCall?.[0]).toBe(action);
      expect(button.disabled).toBe(true);
      await Promise.resolve();
      expect(button.disabled).toBe(false);
    }
    expect(lab.playCarlitosAction).toHaveBeenCalledTimes(4);
    expect(lab.session.snapshot()).toBe(before);
    expect(lab.phase.getSurvivalCheckpoint()).toBeNull();
    expect(lab.onCheckpointChange).not.toHaveBeenCalled();
  });

  it('blocks overlap and meows at pet contact or food arrival', async () => {
    const lab = carlitosLab();
    let finish = () => {};
    lab.playCarlitosAction.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    lab.phase.handleAction('petCarlitos');
    expect(lab.meowCarlitos).not.toHaveBeenCalled();
    lab.phase.handleAction('feedCarlitos');
    expect(lab.playCarlitosAction).toHaveBeenCalledTimes(1);
    lab.playCarlitosAction.mock.lastCall?.[1]?.();
    expect(lab.meowCarlitos).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    expect(lab.setEventEligibleItems).toHaveBeenLastCalledWith(expect.objectContaining({ size: 3 }));
    lab.phase.handleAction('feedCarlitos');
    expect(lab.playCarlitosAction).toHaveBeenCalledTimes(2);
    expect(lab.meowCarlitos).toHaveBeenCalledTimes(1);
    lab.playCarlitosAction.mock.lastCall?.[1]?.();
    expect(lab.meowCarlitos).toHaveBeenCalledTimes(2);
    finish();
    await Promise.resolve();
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

  it('keeps normal care limits outside the lab', () => {
    const normal = carlitosLab(false);
    normal.phase.handleAction('petCarlitos');
    normal.phase.handleAction('feedCarlitos');
    expect(normal.playCarlitosAction).not.toHaveBeenCalled();
  });

  it('does not play when Carlitos is absent', () => {
    const lab = carlitosLab(true, false);
    lab.phase.handleAction('petCarlitos');
    lab.phase.handleAction('feedCarlitos');
    expect(lab.playCarlitosAction).not.toHaveBeenCalled();
  });
});
