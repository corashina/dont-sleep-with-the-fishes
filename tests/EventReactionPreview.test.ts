import { describe, expect, it, vi } from 'vitest';
import { REACTION_PREVIEW_EVENTS, reactionPreviewSetup, resolveReactionPreview, type EventReactionPreviewRequest } from '../src/survival/EventReactionPreview';
import { playEventReactionPreview, type EventReactionPreviewPorts } from '../src/survival/EventReactionPreviewPlayer';
import type { SurvivalEventId } from '../src/survival/eventCatalog';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { EventPresentationCue } from '../src/survival/eventPresentationCue';

function fogRequest(mode: EventReactionPreviewRequest['mode'] = 'reaction'): EventReactionPreviewRequest {
  const result = reactionPreviewSetup('monster-in-the-fog').choices.find(d => d.choice.id === 'flashlight')!.choice.outcomes[1]!;
  return { eventId: 'monster-in-the-fog', choiceId: 'flashlight', resultId: result.resultId!, mode };
}

// Importance: 95/100. Forced previews must use real results and never depend on random outcome selection.
describe('event reaction preview outcomes', () => {
  it('repeats the flashlight hull damage with an unchanged starting snapshot', () => {
    const a = resolveReactionPreview(fogRequest());
    const b = resolveReactionPreview(fogRequest());
    expect(a.outcome.deltas.hull).toBe(-20);
    expect(a.outcome.deltas.health ?? 0).toBe(0);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.before.health).toBe(100);
    expect(a.before.inventory['flashlight-1']?.condition).toBe('usable');
  });

  it('resolves every available catalog result by its exact id', () => {
    let count = 0;
    for (const event of REACTION_PREVIEW_EVENTS) {
      for (const { choice, failures } of reactionPreviewSetup(event.id).choices) {
        if (failures.length > 0) continue;
        for (const result of choice.outcomes) {
          const preview = resolveReactionPreview({ eventId: event.id as SurvivalEventId, choiceId: choice.id, resultId: result.resultId!, mode: 'reaction' });
          expect(preview.outcome.accepted, `${event.id}/${choice.id}/${result.resultId}`).toBe(true);
          expect(preview.outcome.eventResult?.resultId).toBe(result.resultId);
          count++;
        }
      }
    }
    expect(count).toBeGreaterThan(100);
  });
});

function ports(): EventReactionPreviewPorts {
  return {
    world: {
      stageEvent: vi.fn(), revealEvent: vi.fn(async () => {}), playEventItemUse: vi.fn(async () => {}),
      playEventChoice: vi.fn(async () => {}), reactToEventOutcome: vi.fn(async () => {}),
      clearEvent: vi.fn(), syncInventory: vi.fn(), setEventEligibleItems: vi.fn(), setEventSelectedItem: vi.fn(), prepareEventOutcome: vi.fn(),
    },
    audio: { beginEvent: vi.fn(), beginEventReaction: vi.fn(), finishEventReaction: vi.fn(), clearEvent: vi.fn(), eventItem: vi.fn(), eventItemCue: vi.fn(), bucketHelmetRain: vi.fn() },
    bundles: { beginLoad: vi.fn(async () => {}), activate: vi.fn(async () => {}), cancelPendingActivation: vi.fn(), releaseActive: vi.fn() },
    setEnvironment: vi.fn(), restore: vi.fn(), isCurrent: () => true,
  };
}

// Importance: 95/100. Playback must restore the lab, even after failure, and must not continue after disposal.
describe('event reaction preview playback', () => {
  it('cuts to black on the bite cue and uncovers the lab after playback', async () => {
    const p = ports();
    let emit!: (cue: EventPresentationCue) => void;
    const ui = { setSleepCoverProfile: vi.fn(async () => {}), setSleepCovered: vi.fn(async () => {}) };
    const phase = SurvivalPhase.forTest({
      session: new SurvivalSession([], { seed: 19 }),
      world: { ...p.world, setEventCueHandler: handler => { emit = handler; } }, ui,
    }, 'item-animation-lab');
    vi.mocked(p.world.reactToEventOutcome).mockImplementation(async () => {
      expect(ui.setSleepCovered).not.toHaveBeenCalledWith(true);
      emit({ eventId: 'monster-in-the-fog', cue: 'bite' });
      expect(ui.setSleepCoverProfile).toHaveBeenLastCalledWith('midnight-attack');
      expect(ui.setSleepCovered).toHaveBeenLastCalledWith(true);
    });
    try {
      phase.start();
      await phase.previewEventReaction(fogRequest());
      expect(ui.setSleepCovered).toHaveBeenLastCalledWith(false);
      expect(ui.setSleepCoverProfile).toHaveBeenLastCalledWith('solid');
    } finally { phase.dispose(); }
  });
  it('stages the exact reward constellations for Starry Night', async () => {
    const p = ports();
    const { event, choices } = reactionPreviewSetup('starry-night');
    const { choice } = choices[0]!;
    await playEventReactionPreview({ eventId: 'starry-night', choiceId: choice.id,
      resultId: choice.outcomes[0]!.resultId!, mode: 'sequence' }, p);
    expect(p.world.stageEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'starry-night', constellationItems: event.choices.filter(c => c.id !== 'sleep').map(c => c.id),
    }));
    expect(p.audio.beginEvent).toHaveBeenCalledWith('starry-night');
  });
  it('restores lab weather and inventory without changing or saving its session', async () => {
    const session = new SurvivalSession([{ type: 'flashlight', instanceId: 'flashlight-1' }], { seed: 19 });
    const initial = session.snapshot();
    const p = ports();
    const checkpoint = vi.fn();
    const phase = SurvivalPhase.forTest({ session, world: p.world, ui: {}, onCheckpointChange: checkpoint }, 'item-animation-lab');
    try {
      phase.start();
      phase.setWeatherOverride('rain');
      expect(await phase.previewEventReaction(fogRequest())).toBe(true);
      expect(session.snapshot()).toEqual(initial);
      expect(p.world.syncInventory).toHaveBeenLastCalledWith(initial);
      expect(phase.getPresentationWeather()).toBe('rain');
      expect(phase.getSurvivalCheckpoint()).toBeNull();
      expect(checkpoint).not.toHaveBeenCalled();
    } finally { phase.dispose(); }
  });
  it.each(['reaction', 'sequence'] as const)('plays %s and restores the lab', async mode => {
    const p = ports();
    await playEventReactionPreview(fogRequest(mode), p);
    expect(p.world.revealEvent).toHaveBeenCalledTimes(mode === 'sequence' ? 1 : 0);
    expect(p.world.playEventItemUse).toHaveBeenCalledTimes(mode === 'sequence' ? 1 : 0);
    expect(p.world.reactToEventOutcome).toHaveBeenCalledWith('monster-in-the-fog', expect.objectContaining({ deltas: expect.objectContaining({ hull: -20 }) }), expect.anything(), expect.anything());
    expect(p.world.clearEvent).toHaveBeenCalledOnce();
    expect(p.restore).toHaveBeenCalledOnce();
  });
  it('restores after a reaction fails', async () => {
    const p = ports();
    vi.mocked(p.world.reactToEventOutcome).mockRejectedValue(new Error('failure'));
    await expect(playEventReactionPreview(fogRequest(), p)).rejects.toThrow('failure');
    expect(p.restore).toHaveBeenCalledOnce();
    expect(p.bundles.releaseActive).toHaveBeenCalledOnce();
  });
  it('does not stage or restore a disposed scene after loading', async () => {
    const p = ports();
    p.isCurrent = () => false;
    await playEventReactionPreview(fogRequest(), p);
    expect(p.world.stageEvent).not.toHaveBeenCalled();
    expect(p.restore).not.toHaveBeenCalled();
  });
});
