import { describe, expect, it } from 'vitest';
import { SHIP_LAYOUT } from '../src/world/ShipLayout';
import {
  SHIP_DANGER_LAYOUT,
  validateShipDangerLayout,
} from '../src/world/ShipDangerLayout';

describe('ship danger layout', () => {
  it('defines the approved fixed hazard counts', () => {
    expect(SHIP_DANGER_LAYOUT.alarms).toHaveLength(3);
    expect(SHIP_DANGER_LAYOUT.fires).toHaveLength(3);
    expect(SHIP_DANGER_LAYOUT.smokeOutlets).toHaveLength(4);
    expect(SHIP_DANGER_LAYOUT.leaks).toHaveLength(6);
    expect(SHIP_DANGER_LAYOUT.puddles).toHaveLength(5);
    expect(SHIP_DANGER_LAYOUT.streams).toHaveLength(3);
    expect(SHIP_DANGER_LAYOUT.brokenPlanks).toHaveLength(3);
    expect(SHIP_DANGER_LAYOUT.wetStreaks).toHaveLength(3);
  });

  it('uses one alarm in every enclosed room', () => {
    expect(SHIP_DANGER_LAYOUT.alarms.map(({ zoneId }) => zoneId).sort())
      .toEqual(['crewCabin', 'storageWorkroom', 'wheelhouse']);
  });

  it('keeps roof, machinery, and hull fires outside reachable floor space', () => {
    SHIP_DANGER_LAYOUT.fires.forEach(({ unreachable }) => expect(unreachable).toBe(true));
  });

  it('validates against current rooms, doors, and evacuation bounds', () => {
    expect(() => validateShipDangerLayout(SHIP_DANGER_LAYOUT, SHIP_LAYOUT)).not.toThrow();
  });
});
