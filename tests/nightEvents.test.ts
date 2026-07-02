import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';
import { Rng } from '../src/utils/rng';
import { resolveNight, pickNightEvent, NIGHT_EVENT_BY_ID } from '../src/content/nightEvents';

function nightState(): GameState {
  const s = new GameState();
  s.setPhase('scavenge'); s.setPhase('crewSelect'); s.setPhase('day'); s.setPhase('night');
  return s;
}

describe('night resolution', () => {
  it('correct counter = safe, no cost', () => {
    const s = nightState();
    s.addItem('ductTape');
    const r = resolveNight(s, 'leak', 'ductTape');
    expect(r.outcome).toBe('safe');
    expect(r.rescued).toBe(false);
    expect(s.resources.hull).toBe(100);
  });
  it('wrong item = failure cost applied', () => {
    const s = nightState();
    s.addItem('bucket'); // not a valid counter for leak
    const r = resolveNight(s, 'leak', 'bucket');
    expect(r.outcome).toBe('failure');
    expect(s.resources.hull).toBe(70); // -30
  });
  it('no item (empty string) = failure cost applied', () => {
    const s = nightState();
    const r = resolveNight(s, 'leak', '');
    expect(r.outcome).toBe('failure');
    expect(s.resources.hull).toBe(70);
  });
  it('eerieMelody + flashlight = worse outcome', () => {
    const s = nightState();
    s.addItem('flashlight');
    const r = resolveNight(s, 'eerieMelody', 'flashlight');
    expect(r.outcome).toBe('worse');
    expect(s.resources.health).toBe(55);  // 100-45
    expect(s.resources.morale).toBe(50);  // 70-20
  });
  it('eerieMelody + ductTape = safe', () => {
    const s = nightState();
    s.addItem('ductTape');
    const r = resolveNight(s, 'eerieMelody', 'ductTape');
    expect(r.outcome).toBe('safe');
  });
  it('hope + flareGun = rescued', () => {
    const s = nightState();
    s.addItem('flareGun');
    const r = resolveNight(s, 'hope', 'flareGun');
    expect(r.outcome).toBe('safe');
    expect(r.rescued).toBe(true);
    expect(s.rescued).toBe(true);
  });
  it('row halves giant squid failure damage', () => {
    const s = nightState();
    s.setCrewmate('row');
    s.addItem('bucket');
    resolveNight(s, 'giantSquid', 'bucket');
    expect(s.resources.hull).toBe(70); // 60 halved -> 30 damage
  });
  it('pickNightEvent forces hope by day 5 if not yet appeared', () => {
    const rng = new Rng(123);
    const id = pickNightEvent(rng, 5, false);
    expect(id).toBe('hope');
  });
  it('pickNightEvent returns a valid event id', () => {
    const rng = new Rng(7);
    const id = pickNightEvent(rng, 1, false);
    expect(NIGHT_EVENT_BY_ID[id]).toBeDefined();
  });
});
