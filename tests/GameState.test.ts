import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';
import { Phase } from '../src/state/phases';

describe('GameState', () => {
  it('starts at intro with full resources and empty inventory', () => {
    const s = new GameState();
    expect(s.phase).toBe(Phase.Intro);
    expect(s.resources.hull).toBe(100);
    expect(s.inventory).toEqual([]);
    expect(s.food).toBe(0);
    expect(s.crewmate).toBeNull();
  });
  it('setPhase enforces legal transitions', () => {
    const s = new GameState();
    expect(() => s.setPhase(Phase.Night)).toThrow();
    s.setPhase(Phase.Scavenge);
    expect(s.phase).toBe(Phase.Scavenge);
  });
  it('addItem respects maxSlots (5) and rejects duplicates', () => {
    const s = new GameState();
    s.setPhase(Phase.Scavenge);
    expect(s.addItem('anchor')).toBe(true);
    expect(s.addItem('anchor')).toBe(false); // duplicate
    s.addItem('flareGun'); s.addItem('flashlight'); s.addItem('ductTape'); s.addItem('bucket');
    expect(s.inventory.length).toBe(5);
    expect(s.addItem('bait')).toBe(false); // full
  });
  it('hasItem / removeItem', () => {
    const s = new GameState();
    s.setPhase(Phase.Scavenge);
    s.addItem('anchor');
    expect(s.hasItem('anchor')).toBe(true);
    s.removeItem('anchor');
    expect(s.hasItem('anchor')).toBe(false);
  });
  it('food is stackable and does not consume slots', () => {
    const s = new GameState();
    s.addFood(3);
    expect(s.food).toBe(3);
    expect(s.inventory).toEqual([]);
    expect(s.consumeFood()).toBe(true);
    expect(s.food).toBe(2);
  });
  it('consumeFood fails when empty', () => {
    const s = new GameState();
    expect(s.consumeFood()).toBe(false);
  });
  it('adjustResource clamps 0..100', () => {
    const s = new GameState();
    s.adjustResource('hull', -30);
    expect(s.resources.hull).toBe(70);
    s.adjustResource('hull', -999);
    expect(s.resources.hull).toBe(0);
    s.adjustResource('hunger', 999);
    expect(s.resources.hunger).toBe(100);
  });
  it('isDead true when hunger/hull/health hit 0', () => {
    const s = new GameState();
    expect(s.isDead()).toBe(false);
    s.adjustResource('hull', -100);
    expect(s.isDead()).toBe(true);
  });
});
