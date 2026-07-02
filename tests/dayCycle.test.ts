import { describe, it, expect } from 'vitest';
import { GameState } from '../src/state/GameState';
import { Rng } from '../src/utils/rng';
import { resolveNight, pickNightEvent } from '../src/content/nightEvents';

function reachDay(): GameState {
  const s = new GameState();
  s.setPhase('scavenge');
  s.addItem('flareGun'); s.addItem('fishingRod'); s.addItem('bait'); s.addItem('ductTape'); s.addItem('anchor');
  s.setPhase('crewSelect');
  s.setCrewmate('frederik');
  s.setPhase('day');
  return s;
}

describe('day cycle integration', () => {
  it('death by hunger after enough days without food', () => {
    const s = reachDay();
    const rng = new Rng(99);
    let days = 0;
    while (!s.isDead() && days < 30) {
      // spend actions without eating
      while (s.actionsLeftToday > 0) s.performDayAction('chat');
      s.setPhase('night');
      const ev = pickNightEvent(rng, s.day, s.hopeAppeared);
      if (ev === 'hope') s.hopeAppeared = true;
      resolveNight(s, ev, '');
      if (s.rescued) break;
      s.setPhase('day');
      s.startNewDay();
      days++;
    }
    expect(s.isDead()).toBe(true);
  });
  it('rescue on hope + flareGun', () => {
    const s = reachDay();
    const rng = new Rng(99);
    s.setPhase('night');
    const ev = pickNightEvent(rng, s.day, s.hopeAppeared);
    if (ev === 'hope') s.hopeAppeared = true;
    resolveNight(s, ev, ev === 'hope' ? 'flareGun' : 'ductTape');
    // force hope path for deterministic rescue
    const r2 = resolveNight(s, 'hope', 'flareGun');
    expect(r2.rescued).toBe(true);
    expect(s.rescued).toBe(true);
  });
  it('day counter advances', () => {
    const s = reachDay();
    const d0 = s.day;
    s.setPhase('night'); resolveNight(s, 'leak', 'ductTape');
    s.setPhase('day'); s.startNewDay();
    expect(s.day).toBe(d0 + 1);
  });
});
