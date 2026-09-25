import { createEventTestResult, EVENT_TEST_OPTIONS } from '../app/EventTest';
import { eventChoiceDecision } from './eventChoiceRules';
import { SURVIVAL_EVENTS, survivalEventById, type SurvivalEventId } from './eventCatalog';
import { eventPresentationRoute } from './eventPresentationRoutes';
import { deriveEventOutcomePresentation, deriveEventVariantSeed } from './eventPresentationOutcome';
import { deriveEventPhysicalResponse } from './EventPhysicalResponse';
import { COMPLETE_HEART } from './heartOfTheSea';
import { prepareStarryNightEvent } from './starryNight';
import { prepareTradeEvent } from './tradeEvents';
import { SurvivalSession } from './SurvivalSession';

export interface EventReactionPreviewRequest {
  readonly eventId: SurvivalEventId;
  readonly choiceId: string;
  readonly resultId: string;
  readonly mode: 'reaction' | 'sequence';
}

export const REACTION_PREVIEW_EVENTS = SURVIVAL_EVENTS.filter(event => eventPresentationRoute(event.id) !== null);

export function reactionPreviewSetup(eventId: string) {
  const option = EVENT_TEST_OPTIONS.find(option => option.phase !== 'ending' && option.eventId === eventId);
  const catalog = survivalEventById(eventId);
  if (option === undefined || option.phase === 'ending' || catalog === undefined) {
    throw new Error(`Unknown reaction preview event: ${eventId}`);
  }
  const seed = option.seed ?? 19;
  const savedItems = createEventTestResult(option, seed).savedItems;
  const session = new SurvivalSession(savedItems, {
    seed, initialEventId: eventId, initialHeartPieces: COMPLETE_HEART,
    initial: { food: 12, bait: 12, pressure: 4 },
    initialChest: { state: eventId === 'chest-attack' ? 'mimic' : 'closed', acquiredDay: 1 },
  });
  const before = session.snapshot();
  const event = prepareStarryNightEvent(prepareTradeEvent(catalog, before), before);
  const choices = event.choices.map(choice => eventChoiceDecision(event, choice, before));
  return { session, before, event, choices };
}

export function resolveReactionPreview(request: EventReactionPreviewRequest) {
  const setup = reactionPreviewSetup(request.eventId);
  const decision = setup.choices.find(({ choice }) => choice.id === request.choiceId);
  if (decision === undefined || decision.failures.length > 0) throw new Error('Unavailable preview choice.');
  if (!decision.choice.outcomes.some(outcome => outcome.resultId === request.resultId)) {
    throw new Error('Unknown preview result.');
  }
  const instanceId = decision.instanceId;
  const outcome = setup.session.resolveEvent(instanceId === null
    ? { kind: 'choice', choiceId: request.choiceId, resultId: request.resultId }
    : { kind: 'item', instanceId, choiceId: request.choiceId, resultId: request.resultId });
  if (!outcome.accepted) throw new Error(outcome.message);
  const after = setup.session.snapshot();
  const presentation = deriveEventOutcomePresentation(setup.before, after, outcome, instanceId);
  const choice = { choiceId: request.choiceId, instanceId, condition: presentation.selectedCondition };
  const physical = deriveEventPhysicalResponse(request.choiceId, setup.before.inventory, after.inventory, instanceId);
  return {
    ...setup, after, outcome, presentation, choice, physical,
    variantSeed: deriveEventVariantSeed(setup.before.seed, setup.before.day, request.eventId),
  };
}
