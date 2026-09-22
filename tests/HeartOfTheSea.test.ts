// Importance: 98/100. Protects unique quest progress and save integrity.
import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

describe('Heart of the Sea progress', () => {
  it('starts empty and copies initial progress', () => {
    const pieces = { flowers: true, blood: false, chest: false };
    const session = new SurvivalSession([], { seed: 41, initialHeartPieces: pieces });
    pieces.flowers = false;
    expect(session.snapshot().heartPieces).toEqual({ flowers: true, blood: false, chest: false });
    expect(new SurvivalSession([], { seed: 42 }).snapshot().heartPieces)
      .toEqual({ flowers: false, blood: false, chest: false });
  });

  it.each(Array.from({ length: 8 }, (_, mask) => mask))('restores piece mask %i', (mask) => {
    const heartPieces = { flowers: (mask & 1) !== 0, blood: (mask & 2) !== 0, chest: (mask & 4) !== 0 };
    const source = new SurvivalSession([], { seed: 41, initialHeartPieces: heartPieces });
    const saved = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: source.exportCheckpoint() });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(saved)));
    expect(parsed).not.toBeNull();
    expect(SurvivalSession.restore(parsed!.checkpoint.session).snapshot().heartPieces).toEqual(heartPieces);
  });

  it.each([
    null, [], {}, { flowers: true, blood: false },
    { flowers: 1, blood: false, chest: false },
    { flowers: false, blood: 'false', chest: false },
    { flowers: false, blood: false, chest: false, extra: true },
  ])('rejects malformed progress %j', (heartPieces) => {
    const source = new SurvivalSession([], { seed: 41 });
    const saved = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: source.exportCheckpoint() });
    expect(parseSurvivalSaveDocument({ ...saved, checkpoint: {
      ...saved.checkpoint, session: { ...saved.checkpoint.session, heartPieces },
    } })).toBeNull();
  });
});
