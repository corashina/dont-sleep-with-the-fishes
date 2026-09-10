import { getEventResultTextId } from '../i18n/eventMessages';
import { journalEventResult, journalNarratedItemChange } from '../i18n/journalEventResults';
import { journalEventSetup } from '../i18n/journalEventSetups';
import { journalInventoryMessage, journalItemName } from '../i18n/journalInventoryMessages';
import { journalMessage } from '../i18n/journalMessages';
import { formatJournalMutations } from './journalInventory';
import type { JournalEventRecord } from './journalRecords';
import { nightTraderTrade } from './nightTraderTrades';

export function formatJournalEvent(record: JournalEventRecord): string {
  const receivedFood = record.text.kind === 'domain' && record.text.id === 'fallbackFood';
  if (record.text.kind !== 'eventResult' && !receivedFood) throw new Error('Journal event requires a recorded result.');
  if (record.attemptedChoiceId === null) throw new Error('Journal event requires a recorded choice.');
  const textId = record.text.kind === 'eventResult' ? getEventResultTextId(record.text.reference) : undefined;
  const setup = journalEventSetup(record.eventId, record.attemptedChoiceId, textId);
  const trade = record.eventId === 'night-trader' || record.eventId === 'handyman';
  const offering = tradeOffering(record, trade);
  const result = textId === undefined
    ? journalMessage(record.attemptedChoiceId === 'delegate-carlitos' ? 'spareFoodCarlitos' : 'spareFood')
    : textId === 'traderReceived'
      ? journalInventoryMessage('gain', journalItemName(nightTraderTrade(record.attemptedChoiceId).reward))
      : journalEventResult(textId);
  // The result already names acquired items. Trade costs belong to the exchange, not damage or ammunition use.
  const mutations = record.inventoryMutations.filter(({ kind }) => (
    (kind !== 'gain' || record.eventId === 'handyman') && !(trade && (kind === 'lose' || kind === 'consume'))
  ));
  const narrated = textId === undefined ? undefined : journalNarratedItemChange(textId);
  return [setup, offering, result, formatJournalMutations(mutations, narrated)].filter(Boolean).join(' ');
}

function tradeOffering(record: JournalEventRecord, trade: boolean): string {
  if (!trade) return '';
  if (record.attemptedItemId !== null) {
    return journalInventoryMessage('trade', journalItemName(record.attemptedItemId));
  }
  return record.attemptedChoiceId === 'chest' ? journalInventoryMessage('tradedChest') : '';
}
