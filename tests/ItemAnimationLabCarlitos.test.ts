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
