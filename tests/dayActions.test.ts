import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';

function dayState(): GameState {
  const s = new GameState();
  s.setPhase('scavenge');
  s.setPhase('crewSelect');
  s.setPhase('day');
  s.addItem('fishingRod'); s.addItem('bait');
  return s;
}

describe('day actions', () => {
  it('fish requires rod + bait and yields 1 food', () => {
    const s = dayState();
    const r = s.performDayAction('fish');
    expect(r.ok).toBe(true);
    expect(s.food).toBe(1);
    expect(s.actionsLeftToday).toBe(2);
  });
  it('fish fails without rod', () => {
    const s = dayState();
    s.removeItem('fishingRod');
    const r = s.performDayAction('fish');
    expect(r.ok).toBe(false);
    expect(s.food).toBe(0);
    expect(s.actionsLeftToday).toBe(3);
  });
  it('eat consumes 1 food and restores hunger', () => {
    const s = dayState();
    s.addFood(2);
    s.adjustResource('hunger', -40); // 60
    const r = s.performDayAction('eat');
    expect(r.ok).toBe(true);
    expect(s.food).toBe(1);
    expect(s.resources.hunger).toBe(85);
  });
  it('eat fails without food', () => {
    const s = dayState();
    expect(s.performDayAction('eat').ok).toBe(false);
  });
  it('repair restores base 10; frederik adds 5', () => {
    const s = dayState();
    s.setCrewmate('frederik');
    s.adjustResource('hull', -50); // 50
    s.performDayAction('repair');
    expect(s.resources.hull).toBe(65);
  });
  it('row uses base 10', () => {
    const s = dayState();
    s.setCrewmate('row');
    s.adjustResource('hull', -50);
    s.performDayAction('repair');
    expect(s.resources.hull).toBe(60);
  });
  it('chat restores morale', () => {
    const s = dayState();
    s.adjustResource('morale', -30); // 40
    s.performDayAction('chat');
    expect(s.resources.morale).toBeGreaterThan(40);
  });
  it('frederik guarantees bait on a successful fish day', () => {
    const s = dayState();
    s.setCrewmate('frederik');
    s.removeItem('bait');                 // no bait now
    expect(s.performDayAction('fish').ok).toBe(false);
    s.addItem('bait');
    s.performDayAction('fish');           // consumes 1 bait...
    expect(s.hasItem('bait')).toBe(true); // ...but frederik guarantees +1
  });
  it('cannot act when no actions left', () => {
    const s = dayState();
    s.actionsLeftToday = 0;
    expect(s.performDayAction('chat').ok).toBe(false);
  });
  it('startNewDay resets actions to 3', () => {
    const s = dayState();
    s.actionsLeftToday = 0;
    s.startNewDay();
    expect(s.actionsLeftToday).toBe(3);
  });
});
