import { Group, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import {
  REPAIR_HAMMER_PEAK_SECONDS,
  RepairToolboxAnimation,
} from '../src/survival/RepairToolboxAnimation';

describe('RepairToolboxAnimation', () => {
  it('strikes higher points on both sides while keeping the center point low', () => {
    const boat = new Group();
    const toolbox = new Group();
    const hammer = new Object3D();
    toolbox.add(hammer);
    boat.add(toolbox);
    const animation = new RepairToolboxAnimation(boat, toolbox, hammer);

    void animation.play();
    animation.update(REPAIR_HAMMER_PEAK_SECONDS[0]!);
    expect(hammer.position.y).toBeCloseTo(0.12);

    animation.update(
      REPAIR_HAMMER_PEAK_SECONDS[6]! - REPAIR_HAMMER_PEAK_SECONDS[0]!,
    );
    expect(hammer.position.y).toBeCloseTo(-0.16);

    animation.update(
      REPAIR_HAMMER_PEAK_SECONDS[11]! - REPAIR_HAMMER_PEAK_SECONDS[6]!,
    );
    expect(hammer.position.y).toBeCloseTo(0.12);
    animation.cancel();
  });
});
