import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HandymanPresentation } from '../src/survival/HandymanPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import type { ActionOutcome } from '../src/survival/survivalTypes';
import { HANDYMAN_ITEM_IDS } from '../src/survival/tradeRules';

function dependencies(): FocusedEventPresentationDependencies {
  return {
    propModels: {
      create: () => new Group(),
      createEventModel: () => null,
      createPracticalLight: () => null,
    },
    waves: [],
    cameraRig: new Group(),
    camera: new PerspectiveCamera(),
    supplyDisplay: {
      releaseEventActor: vi.fn(),
      releaseEventActorOnNextSync: vi.fn(),
      clearEventPose: vi.fn(),
      pinEventActor: vi.fn(() => false),
      applyEventItemPose: vi.fn(),
    },
    chestDisplay: { root: new Group(), restorePose: vi.fn() },
    emitCue: vi.fn(),
    takeCameraControl: vi.fn(),
  } as unknown as FocusedEventPresentationDependencies;
}

function acceptedReward(itemId: 'cannedFood' | 'scubaSet'): ActionOutcome {
  return {
    accepted: true,
    code: 'event-resolved',
    message: '',
    deltas: {},
    cue: 'none',
    rewardSummary: { kind: 'item', id: itemId, quantity: 1 },
  };
}

describe('Handyman presentation', () => {
  it.each(HANDYMAN_ITEM_IDS)('accepts %s as an item payment actor', async (itemId) => {
    const presentation = new HandymanPresentation(dependencies());
    presentation.stage();

    const payment = presentation.playChoice({
      choiceId: itemId,
      instanceId: null,
      condition: 'usable',
    });

    expect(presentation.root.getObjectByName(`handyman-payment-${itemId}`)).toBeDefined();
    expect(presentation.root.getObjectByName('handyman-reward-actors')?.children).toHaveLength(0);
    presentation.settleForVisibilityChange();
    await payment;
    presentation.dispose();
  });

  it('removes the chest trade target', () => {
    const presentation = new HandymanPresentation(dependencies());

    expect(presentation.interactionTargets().map(({ id }) => id)).toEqual([
      'handyman:hand',
    ]);
    presentation.dispose();
  });

  it('reveals the committed item reward during the handover', async () => {
    const presentation = new HandymanPresentation(dependencies());
    presentation.stage();
    const reaction = presentation.react(
      { eventId: 'handyman', choiceId: 'radio', resultId: 'handyman-reward' },
      acceptedReward('scubaSet'),
    );

    expect(presentation.root.getObjectByName('handyman-reward-scubaSet')).toBeDefined();
    expect(presentation.root.getObjectByName('handyman-reward-radio')).toBeUndefined();
    presentation.settleForVisibilityChange();
    await reaction;
    expect(presentation.root.userData.state).toBe('held-reward');
    presentation.dispose();
  });
});
