import type { BoatWorld } from './BoatWorld';
import type { SurvivalAudio } from '../audio/SurvivalAudio';
import type { ItemAnimationLabBundlePort } from './ItemAnimationLabFlow';
import { resolveReactionPreview, type EventReactionPreviewRequest } from './EventReactionPreview';
import { isEventPresentationRoute } from './eventPresentationRoutes';
import type { SurvivalEventId } from './eventCatalog';
import { runCleanupSteps } from '../world/SceneResources';
import type { ItemId } from '../game/ItemState';

export interface EventReactionPreviewPorts {
  readonly world: Pick<BoatWorld, 'stageEvent' | 'revealEvent' | 'playEventItemUse'
    | 'playEventChoice' | 'reactToEventOutcome' | 'clearEvent' | 'syncInventory' | 'setEventEligibleItems'
    | 'setEventSelectedItem' | 'prepareEventOutcome'>;
  readonly audio: Pick<SurvivalAudio, 'beginEvent' | 'beginEventReaction' | 'finishEventReaction' | 'clearEvent' | 'eventItem' | 'eventItemCue' | 'bucketHelmetRain'>;
  readonly bundles: ItemAnimationLabBundlePort;
  setEnvironment(eventId: SurvivalEventId): void;
  restore(): void | Promise<void>;
  isCurrent(): boolean;
}

/** Uses a disposable session. The lab session and saved run are never mutated. */
export async function playEventReactionPreview(
  request: EventReactionPreviewRequest,
  ports: EventReactionPreviewPorts,
): Promise<void> {
  const { world, audio } = ports;
  try {
    const preview = resolveReactionPreview(request);
    ports.setEnvironment(request.eventId);
    await ports.bundles.beginLoad(request.eventId);
    if (!ports.isCurrent()) return;
    await ports.bundles.activate(request.eventId);
    if (!ports.isCurrent()) return;
    world.syncInventory(preview.before);
    world.setEventEligibleItems(new Set());
    world.setEventSelectedItem(null);
    if (isEventPresentationRoute(request.eventId, 'dedicated')) {
      world.stageEvent({ eventId: request.eventId, variantSeed: preview.variantSeed,
        targetInstanceId: preview.before.pendingEventTargetId,
        ...(request.eventId === 'starry-night' ? {
          constellationItems: preview.event.choices.filter(choice => choice.id !== 'sleep').map(choice => choice.id as ItemId),
        } : {}),
      });
    } else world.stageEvent(request.eventId, preview.variantSeed);
    audio.beginEvent(request.eventId);
    if (request.mode === 'sequence') {
      await world.revealEvent(request.eventId);
      if (!ports.isCurrent()) return;
      await playPreviewChoice(request, preview, ports);
      if (!ports.isCurrent()) return;
    }
    if (isEventPresentationRoute(request.eventId, 'focused')) world.prepareEventOutcome(request.eventId, preview.outcome);
    audio.beginEventReaction(request.eventId, preview.outcome);
    await world.reactToEventOutcome(request.eventId, preview.outcome,
      isEventPresentationRoute(request.eventId, 'focused') ? preview.choice : preview.physical,
      preview.presentation);
  } finally {
    if (ports.isCurrent()) {
      try {
        runCleanupSteps([
          () => audio.finishEventReaction(), () => audio.clearEvent(), () => world.clearEvent(),
          () => ports.bundles.cancelPendingActivation(), () => ports.bundles.releaseActive(),
        ]);
      } finally { await ports.restore(); }
    }
  }
}

async function playPreviewChoice(
  request: EventReactionPreviewRequest,
  preview: ReturnType<typeof resolveReactionPreview>,
  ports: EventReactionPreviewPorts,
): Promise<void> {
  const { world, audio } = ports;
  if (preview.choice.instanceId === null) {
    await world.playEventChoice(request.eventId, preview.choice);
    return;
  }
  const itemId = preview.choices.find(d => d.choice.id === request.choiceId)!.choice.itemId;
  if (itemId === 'umbrella' || itemId === 'cannedFood' || itemId === 'baitTin' || itemId === 'anchor') {
    audio.eventItem(itemId);
  }
  await world.playEventItemUse(request.eventId, request.choiceId, preview.choice.instanceId, cue => {
    if (!ports.isCurrent() || itemId === undefined) return;
    if (itemId === 'bucket') {
      if (request.eventId === 'shower-night') audio.bucketHelmetRain();
    } else audio.eventItemCue(itemId, request.eventId === 'other-people' && itemId === 'radio' ? 1 : cue);
  });
}
