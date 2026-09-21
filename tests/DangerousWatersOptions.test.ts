import { describe, expect, it } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import {
  DangerousWatersPresentation,
  type DangerousWatersBoatReaction,
} from '../src/survival/DangerousWatersPresentation';
import { eventItemUseDurationForItem } from '../src/survival/eventItemUseChoreography';
import type { ActionOutcome } from '../src/survival/survivalTypes';

const reaction = (): DangerousWatersBoatReaction => ({
  driftX: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  cameraYaw: 0,
  cameraZ: 0,
  lightScale: 1,
  supplyRoll: 0,
  supplyLift: 0,
});

const outcome = (hull = 0): ActionOutcome => ({
  accepted: true,
  code: 'event-resolved',
  message: '',
  deltas: hull === 0 ? {} : { hull },
  cue: 'none',
});

const instance = (value: string): ItemInstanceId => value as ItemInstanceId;

async function finishItemUse(
  presentation: DangerousWatersPresentation,
  choiceId: 'anchor' | 'spyglass',
): Promise<void> {
  const itemId = choiceId === 'anchor' ? 'anchor' : 'spyglass';
  const context = choiceId === 'anchor' ? 'anchor-drop' : 'binocular-look';
  const duration = eventItemUseDurationForItem(context, itemId);
  const motion = presentation.playItemUse(choiceId, instance(`${choiceId}-1`));
  presentation.update(duration, duration);
  await expect(motion).resolves.toBe(true);
}

describe('DangerousWatersPresentation options', () => {
  it('settles and cancels item promises during visibility and lifecycle changes', async () => {
    const presentation = new DangerousWatersPresentation();
    presentation.stage();
    const settled = presentation.playItemUse('spyglass', instance('spyglass-1'));
    presentation.settleForVisibilityChange();
    await expect(settled).resolves.toBe(true);
    expect(presentation.root.visible).toBe(true);

    const cleared = presentation.playItemUse('anchor', instance('anchor-1'));
    presentation.clear();
    await expect(cleared).resolves.toBe(false);
    expect(presentation.root.visible).toBe(false);

    presentation.stage();
    const disposed = presentation.playItemUse('spyglass', instance('spyglass-1'));
    presentation.dispose();
    await expect(disposed).resolves.toBe(false);
    expect(presentation.root.parent).toBeNull();
    await expect(presentation.playItemUse('anchor', instance('anchor-1'))).resolves.toBe(false);
  });

  it('keeps the stopped anchor route when visibility settles item use before reaction', async () => {
    const presentation = new DangerousWatersPresentation();
    const pose = reaction();
    presentation.stage();
    const itemUse = presentation.playItemUse('anchor', instance('anchor-1'));

    presentation.settleForVisibilityChange();
    await expect(itemUse).resolves.toBe(true);
    presentation.copyBoatReaction(pose);
    const stoppedDrift = pose.driftX;
    expect(stoppedDrift).toBeLessThan(-0.15);

    const safe = presentation.react(outcome());
    presentation.update(0.9, 0.9);
    await safe;
    presentation.copyBoatReaction(pose);
    expect(pose.driftX).toBeCloseTo(stoppedDrift);
    presentation.dispose();
  });

  it.each([
    ['safe', 0],
    ['damaged', -7],
  ] as const)('keeps the anchor route when visibility settles a live %s reaction', async (
    _label,
    hull,
  ) => {
    const presentation = new DangerousWatersPresentation();
    const pose = reaction();
    presentation.stage();
    await finishItemUse(presentation, 'anchor');
    presentation.copyBoatReaction(pose);
    const stoppedDrift = pose.driftX;
    const result = presentation.react(outcome(hull));
    presentation.update(0.35, 0.35);

    presentation.settleForVisibilityChange();
    await result;
    presentation.copyBoatReaction(pose);
    expect(pose.driftX).toBeCloseTo(stoppedDrift);
    presentation.dispose();
  });
});
