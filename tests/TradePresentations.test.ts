import { Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HandymanPresentation } from '../src/survival/HandymanPresentation';
import type { FocusedEventPresentationDependencies } from '../src/survival/FocusedEventPresentation';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createEventTestResult, EVENT_TEST_OPTIONS } from '../src/app/EventTest';
import { createTestPropModels } from './helpers/propModels';

function dependencies(): FocusedEventPresentationDependencies {
  const storage = new Group();
  storage.position.set(0.8, 0.2, 1.4);
  const slot = new Group();
  slot.position.set(0.2, 0.1, -0.3);
  slot.rotation.set(0.1, 0.4, -0.2);
  slot.scale.setScalar(0.6);
  storage.add(slot);
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
      borrowEventActor: vi.fn(() => null),
      recordFor: vi.fn(() => ({ root: storage, visibleCopies: 0 })),
    },
    chestDisplay: { root: new Group(), restorePose: vi.fn() },
    emitCue: vi.fn(),
    takeCameraControl: vi.fn(),
  } as unknown as FocusedEventPresentationDependencies;
}

describe('Handyman presentation', () => {
  // Importance: 95/100. Inventory sync must replace the placed reward without restoring the payment.
  it('finishes a real trade with one consumed payment and one stored reward', async () => {
    const saved = createEventTestResult(EVENT_TEST_OPTIONS.find(({ id }) => id === 'handyman')!, 0).savedItems;
    const session = new SurvivalSession(saved, { seed: 0, initialEventId: 'handyman' });
    const models = createTestPropModels();
    const boat = new Group();
    const supplies = new BoatSupplyDisplay(models, boat, saved);
    const presentation = new HandymanPresentation({ ...dependencies(), supplyDisplay: supplies });
    try {
      supplies.sync(session.snapshot());
      presentation.stage();
      void presentation.reveal();
      presentation.settleForVisibilityChange();
      const payment = presentation.playChoice({ choiceId: 'radio', instanceId: 'radio-1', condition: 'usable' });
      const borrowed = supplies.borrowEventActor('radio-1')!;
      presentation.update(0.7, 0.7);
      supplies.update(0.7);
      expect(borrowed.root.scale.length()).toBe(0);
      presentation.settleForVisibilityChange();
      await payment;
      const outcome = session.resolveEvent({ kind: 'item', choiceId: 'radio', instanceId: 'radio-1' });
      expect(outcome.rewardSummary).toMatchObject({ kind: 'item', id: 'compass' });
      const reaction = presentation.react(outcome.eventResult!, outcome);
      presentation.settleForVisibilityChange();
      await reaction;
      const reward = presentation.root.getObjectByName('handyman-reward-compass')!;
      const placed = reward.getWorldPosition(new Vector3());
      supplies.sync(session.snapshot());
      // Check the visible result hold before the event is cleared.
      expect(reward.visible).toBe(false);
      expect(presentation.root.userData.rewardVisible).toBe(false);
      presentation.update(5, 0.5);
      expect(reward.visible).toBe(false);
      const stored = supplies.recordFor('compass')!.root.children[0]!;
      expect(stored.visible).toBe(true);
      expect(stored.getWorldPosition(new Vector3()).distanceTo(placed)).toBeLessThan(0.001);
      presentation.clear();
      expect(supplies.recordFor('radio')!.root.visible).toBe(false);
      expect(supplies.recordFor('compass')!.root.visible).toBe(true);
      expect(supplies.recordFor('compass')!.root.children[0]!.getWorldPosition(new Vector3()).distanceTo(placed)).toBeLessThan(0.001);
      expect(borrowed.root.parent).toBeNull();
    } finally {
      presentation.dispose();
      supplies.dispose();
      models.dispose();
    }
  });

  // Importance: 95/100. The real stored item must reach the palm and stay hidden until inventory sync.
  it('moves the borrowed payment to the palm in world space and releases it on cleanup', async () => {
    const deps = dependencies();
    const boat = new Group();
    boat.position.set(3, 0.2, -2);
    boat.rotation.y = 0.3;
    const root = new Group();
    boat.add(root);
    const release = vi.fn();
    const releaseOnNextSync = vi.fn();
    vi.mocked(deps.supplyDisplay.borrowEventActor).mockReturnValue({
      instanceId: 'radio-1', root, release, releaseOnNextSync,
      applyPose: (pose) => {
        root.position.set(1 + pose.x, 0.3 + pose.y, 0.5 + pose.z);
        root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
      },
    });
    const presentation = new HandymanPresentation(deps);
    presentation.stage();
    void presentation.reveal();
    presentation.settleForVisibilityChange();
    const payment = presentation.playChoice({ choiceId: 'radio', instanceId: 'radio-1', condition: 'usable' });
    presentation.update(0.7, 0.7);
    const palm = new Vector3(0.05, 0.32, 0.05);
    presentation.root.getObjectByName('handyman-payment-actors')!.localToWorld(palm);
    expect(root.getWorldPosition(new Vector3()).distanceTo(palm)).toBeLessThan(0.001);
    expect(root.scale.length()).toBe(0);
    expect(releaseOnNextSync).toHaveBeenCalled();
    presentation.settleForVisibilityChange();
    await payment;
    expect(root.scale.length()).toBe(0);
    presentation.clear();
    expect(release).toHaveBeenCalledOnce();
    presentation.dispose();
  });

});
