// Importance: 95/100. Pause, catch-up, and resets must not duplicate or retain stale foam.
import { expect, it } from 'vitest';
import { OceanFoamClock } from '../src/ocean/OceanFoamClock';
it('deposits once then advances at 30 Hz independent of render count', () => {
 const c = new OceanFoamClock(); c.advance(10);
 expect(c.resetRequired).toBe(true); expect(c.steps).toBe(1);
 c.advance(10); expect(c.steps).toBe(0); expect(c.resetRequired).toBe(false);
 c.advance(10 + 1/60); expect(c.steps).toBe(0); expect(c.mix).toBeCloseTo(0.5);
 c.advance(10 + 1/30); expect(c.steps).toBe(1); expect(c.firstStepTime).toBeCloseTo(10 + 1/30);
});
it('caps catch-up and discards excess backlog', () => {
 const c = new OceanFoamClock(); c.advance(1); c.advance(1.2);
 expect(c.steps).toBe(4); c.advance(1.2); expect(c.steps).toBe(0);
 c.advance(1.2 + 1/30); expect(c.steps).toBe(1);
});
it('clears history after a gap, rewind, or explicit reset', () => {
 const c = new OceanFoamClock(); c.advance(1);
 for (const time of [2, 1]) { c.advance(time); expect(c.resetRequired).toBe(true); expect(c.steps).toBe(1); }
 c.reset(); c.advance(1); expect(c.resetRequired).toBe(true);
});
it('rejects nonfinite time without poisoning subsequent updates', () => {
 const c = new OceanFoamClock(); c.advance(1);
 expect(() => c.advance(NaN)).toThrow(RangeError);
 c.advance(1 + 1/30); expect(c.steps).toBe(1);
});
