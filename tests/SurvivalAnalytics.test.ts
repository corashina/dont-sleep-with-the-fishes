// Importance: 95/100. Prevents duplicate endings and test scenes from corrupting live gameplay reports.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackGameEnding, trackGameStart } from '../src/browser/GoogleAnalytics';
import { SurvivalPhase, type SurvivalPhaseStart } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';

vi.mock('../src/browser/GoogleAnalytics', () => ({
  trackGameStart: vi.fn(),
  trackGameEnding: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const fresh = { kind: 'fresh', savedItems: [], seed: 41, scavengeElapsedSeconds: 0 } as const;

describe('survival analytics hooks', () => {
  it.each(['rescue', 'kraken', 'death', 'sinking'] as const)('reports the %s ending once', endingId => {
    const session = SurvivalSession.createEndingPreview([], 41, endingId);
    if (endingId === 'kraken') session.resolveEvent({ kind: 'choice', choiceId: 'return-heart' });
    const terminal = session.snapshot();
    const phase = SurvivalPhase.forTestStart({
      session: { snapshot: () => terminal }, world: {}, ui: {},
    }, fresh);
    try {
      phase.start();
      phase.start();
      phase.update(1, 1);
      phase.update(2, 1);
      expect(trackGameEnding).toHaveBeenCalledExactlyOnceWith(terminal.ending);
      expect(trackGameStart).not.toHaveBeenCalled();
    } finally { phase.dispose(); }
  });

  it.each<SurvivalPhaseStart>([
    { ...fresh, kind: 'ending-preview', endingId: 'death' },
    { ...fresh, initialEventId: 'monster-in-the-fog' },
    { ...fresh, initialEventId: 'item-animation-lab' },
  ])('excludes $kind scenes with event $initialEventId', start => {
    const terminal = SurvivalSession.createEndingPreview([], 41, 'death').snapshot();
    const phase = SurvivalPhase.forTestStart({
      session: { snapshot: () => terminal }, world: {}, ui: {},
    }, start);
    try {
      phase.start();
      phase.update(1, 1);
      expect(trackGameEnding).not.toHaveBeenCalled();
      expect(trackGameStart).not.toHaveBeenCalled();
    } finally { phase.dispose(); }
  });

  it('reports an ending after restoring a save without reporting another start', () => {
    const session = new SurvivalSession([], { seed: 41 });
    let current = session.snapshot();
    const phase = SurvivalPhase.forTestStart({
      session: { snapshot: () => current }, world: {}, ui: {},
    }, { kind: 'restored', checkpoint: { session: session.exportCheckpoint(), scavengeElapsedSeconds: 60 } });
    try {
      phase.start();
      expect(trackGameStart).not.toHaveBeenCalled();
      expect(trackGameEnding).not.toHaveBeenCalled();
      current = SurvivalSession.createEndingPreview([], 41, 'death').snapshot();
      phase.update(1, 1);
      phase.update(2, 1);
      expect(trackGameEnding).toHaveBeenCalledExactlyOnceWith(current.ending);
      expect(trackGameStart).not.toHaveBeenCalled();
    } finally { phase.dispose(); }
  });
});
