import { describe, expect, it } from 'vitest';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_LAYOUT,
  SHIP_ROOM_WALL_HEIGHT,
} from '../src/world/ShipLayout';
import {
  SHIP_DANGER_LAYOUT,
  validateShipDangerLayout,
} from '../src/world/ShipDangerLayout';

describe('ship danger layout', () => {
  it('defines the approved fixed hazard counts', () => {
    expect(SHIP_DANGER_LAYOUT.alarms).toHaveLength(3);
    expect(SHIP_DANGER_LAYOUT.puddles).toHaveLength(16);
  });

  it('uses one alarm in every enclosed room', () => {
    expect(SHIP_DANGER_LAYOUT.alarms.map(({ zoneId }) => zoneId).sort())
      .toEqual(['crewCabin', 'storageWorkroom', 'wheelhouse']);
  });

  it('centers every alarm on its room ceiling', () => {
    const ceilingY = FREIGHTER_DIMENSIONS.deckY + SHIP_ROOM_WALL_HEIGHT - 0.08;
    SHIP_DANGER_LAYOUT.alarms.forEach((alarm) => {
      const room = SHIP_LAYOUT.zones.find(({ id }) => id === alarm.zoneId)!;
      expect(alarm.position[0]).toBeCloseTo((room.bounds.minX + room.bounds.maxX) / 2);
      expect(alarm.position[1]).toBeCloseTo(ceilingY);
      expect(alarm.position[2]).toBeCloseTo((room.bounds.minZ + room.bounds.maxZ) / 2);
      expect(alarm.rotation).toEqual([Math.PI / 2, 0, 0]);
    });
  });

  it('validates against current rooms, doors, and evacuation bounds', () => {
    expect(() => validateShipDangerLayout(SHIP_DANGER_LAYOUT, SHIP_LAYOUT)).not.toThrow();
  });

  it('rejects a cargo puddle that crosses the rail', () => {
    const invalid = {
      ...SHIP_DANGER_LAYOUT,
      puddles: SHIP_DANGER_LAYOUT.puddles.map((puddle) => puddle.id === 'cargo-port'
        ? { ...puddle, size: [8, puddle.size[1]] as const }
        : puddle),
    };
    expect(() => validateShipDangerLayout(invalid, SHIP_LAYOUT))
      .toThrow(/cargo-port puddle crosses the cargo rail/i);
  });

  it('rejects an indoor puddle that crosses a wall', () => {
    const invalid = {
      ...SHIP_DANGER_LAYOUT,
      puddles: SHIP_DANGER_LAYOUT.puddles.map((puddle) => puddle.id === 'crew-aft'
        ? { ...puddle, position: [puddle.position[0], puddle.position[1], 4.5] as const }
        : puddle),
    };
    expect(() => validateShipDangerLayout(invalid, SHIP_LAYOUT))
      .toThrow(/crew-aft puddle crosses the crewCabin walls/i);
  });
});
