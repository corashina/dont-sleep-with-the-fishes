// Importance: 10/10. Protects full-view umbrella shielding and its event hold state.
import { describe, expect, it, vi } from 'vitest';
import {
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
} from 'three';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BoatSupplyDisplay,
  BorrowedSupplyActor,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';

const INSTANCE_ID = 'umbrella-1' as ItemInstanceId;

function outcome(): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Done.',
      deltas: {},
      cue: 'none',
    },
    resourceDeltas: {},
    gainedInstanceIds: [],
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: INSTANCE_ID,
    selectedCondition: 'usable',
    targetInstanceId: null,
  };
}

describe('umbrella shield presentation', () => {
  it('releases the held shield only when the event clears', async () => {
    const root = new Group();
    const material = new MeshStandardMaterial({ side: DoubleSide });
    const canopy = new Mesh(new RingGeometry(0, 0.45, 8), material);
    root.add(canopy);
    const actor: BorrowedSupplyActor = {
      instanceId: INSTANCE_ID,
      root,
      applyPose: vi.fn(),
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const supplies = {
      borrowEventActor: vi.fn(() => actor),
      stowEventItemUntilDay: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const adapter = new EventItemUseAdapter(
      new PerspectiveCamera(),
      new EventItemEffects(),
    );
    const controller = new EventItemUseController(supplies, adapter);
    const use = controller.play({
      eventId: 'death-stare',
      choiceId: 'umbrella',
      instanceId: INSTANCE_ID,
      itemId: 'umbrella',
      context: 'umbrella-shield',
      aimTarget: null,
    });

    expect(canopy.material).toBe(material);

    controller.update(10);
    await use;
    await controller.react(outcome());
    controller.update(10);

    expect(root.visible).toBe(true);
    expect(actor.release).not.toHaveBeenCalled();

    controller.clear('night');

    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
    canopy.geometry.dispose();
    material.dispose();
  });
});
