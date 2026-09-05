import { DOMAIN_MESSAGES, domainMessage, type DomainMessageId } from '../i18n/domainMessages';
import { catchLabel, itemLabel } from '../i18n/itemMessages';
import { defineMessages } from '../i18n/messages';
import { resourceQuantity } from '../i18n/resourceMessages';
import type { ItemId } from '../game/ItemState';
import { getEventResultMessage, survivalEventById } from './eventCatalog';
import type { FishingCatchId } from './fishingCatalog';
import type { ActionOutcome, EventResultPresentation } from './survivalTypes';

export type OutcomeText =
  | { readonly kind: 'domain'; readonly id: DomainMessageId }
  | { readonly kind: 'eventPrompt'; readonly eventId: string }
  | { readonly kind: 'eventResult'; readonly reference: EventResultPresentation }
  | { readonly kind: 'fishing'; readonly catchId: FishingCatchId; readonly fish: boolean }
  | { readonly kind: 'chestResource'; readonly resource: 'food' | 'bait'; readonly quantity: number }
  | { readonly kind: 'chestItem'; readonly itemId: ItemId }
  | { readonly kind: 'chestRequired'; readonly state: 'none' | 'closed' | 'mimic' }
  | { readonly kind: 'companionEnergy'; readonly required: number; readonly available: number }
  | { readonly kind: 'companionCondition'; readonly status: DomainMessageId };

const t = defineMessages({
  fishing: { en: (label: string, fish: boolean) => fish ? `You caught a ${label}.` : `You reeled in ${label}.`, pl: (label: string, fish: boolean) => fish ? `Twój połów: ${label}.` : `Wyławiasz znalezisko: ${label}.` },
  chestResource: { en: (quantity: string) => `The chest holds ${quantity}.`, pl: (quantity: string) => `Zawartość skrzyni: ${quantity}.` },
  chestItem: { en: (label: string) => `The chest holds ${label}.`, pl: (label: string) => `Zawartość skrzyni: ${label}.` },
  chestRequired: { en: (state: string) => `That response requires a ${state} chest.`, pl: (state: string) => `Ta odpowiedź wymaga skrzyni. Wymagany stan: ${state}.` },
  none: { en: 'none', pl: 'brak' }, closed: { en: 'closed', pl: 'zamknięta' }, mimic: { en: 'mimic', pl: 'mimik' },
  companionEnergy: { en: (required: number, available: number) => `Carlitos needs ${required} energy; he has ${available}.`, pl: (required: number, available: number) => `Carlitos potrzebuje ${required} pkt. energii; ma ${available}.` },
  companionCondition: { en: (status: string) => `Carlitos is ${status} and cannot retrieve the loot.`, pl: (status: string) => `Carlitos nie może przynieść znaleziska. Jego stan: ${status.toLocaleLowerCase('pl')}.` },
});

export function domainText(id: DomainMessageId): OutcomeText { return Object.freeze({ kind: 'domain', id }); }

export function domainMessageId(message: string): DomainMessageId {
  const id = (Object.keys(DOMAIN_MESSAGES) as DomainMessageId[]).find((key) => (
    DOMAIN_MESSAGES[key].en === message || DOMAIN_MESSAGES[key].pl === message
  ));
  if (id === undefined) throw new Error(`Unregistered domain message: ${message}`);
  return id;
}

export function resolveOutcomeText(text: OutcomeText): string {
  switch (text.kind) {
    case 'domain': return domainMessage(text.id);
    case 'eventPrompt': {
      const event = survivalEventById(text.eventId);
      if (event === undefined) throw new Error(`Unknown event: ${text.eventId}`);
      return event.prompt;
    }
    case 'eventResult': return getEventResultMessage(text.reference);
    case 'fishing': return t('fishing', catchLabel(text.catchId).toLocaleLowerCase(), text.fish);
    case 'chestResource': return t('chestResource', resourceQuantity(text.resource, text.quantity));
    case 'chestItem': return t('chestItem', itemLabel(text.itemId).toLocaleLowerCase());
    case 'chestRequired': return t('chestRequired', t(text.state));
    case 'companionEnergy': return t('companionEnergy', text.required, text.available);
    case 'companionCondition': return t('companionCondition', domainMessage(text.status));
  }
}

/** The display getter is absent from JSON. Only its stable reference is saved. */
export function withOutcomeText<T extends Omit<ActionOutcome, 'message'>>(outcome: T, text: OutcomeText): T & ActionOutcome {
  const reference = cloneOutcomeText(text);
  const copy = { ...outcome, text: reference };
  Object.defineProperty(copy, 'message', { configurable: true, get: () => resolveOutcomeText(reference) });
  return copy as T & ActionOutcome;
}

export function cloneOutcomeText(text: OutcomeText): OutcomeText {
  return text.kind === 'eventResult'
    ? Object.freeze({ ...text, reference: Object.freeze({ ...text.reference }) })
    : Object.freeze({ ...text });
}

export function cloneActionOutcome(outcome: ActionOutcome): ActionOutcome {
  if (outcome.text === undefined) throw new Error('Outcome requires a stable text reference.');
  return withOutcomeText({
    ...outcome,
    deltas: Object.freeze({ ...outcome.deltas }),
    ...(outcome.rewardSummary === undefined ? {} : { rewardSummary: Object.freeze({ ...outcome.rewardSummary }) }),
    ...(outcome.eventResult === undefined ? {} : { eventResult: Object.freeze({ ...outcome.eventResult }) }),
  }, outcome.text);
}
