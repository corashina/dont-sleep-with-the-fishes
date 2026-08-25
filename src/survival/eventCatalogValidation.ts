import {
  EVENT_CHOICE_EXCLUDED_ITEM_IDS,
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/ItemState';
import {
  SURVIVAL_EVENT_IDS,
  SURVIVAL_EVENTS,
} from './eventCatalog';
import type {
  EventInventoryMutation,
  EventResource,
  IntegerValue,
  ResourceEffect,
  SurvivalEventDefinition,
  WeightedEventOutcome,
} from './survivalTypes';

const EVENT_RESOURCES: readonly EventResource[] = [
  'pressure', 'health', 'hull', 'energy', 'food', 'bait', 'repairMaterial', 'rescueLead',
];
const ITEM_MUTATIONS = ['consume', 'break', 'lose', 'gain', 'gainChest', 'breakRandom', 'loseRandom', 'loseEventTarget'];

type PlainRecord = Record<PropertyKey, unknown>;

function assertPlainObject(value: unknown, path: string): asserts value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be a plain object`);
  }
}

function printableKey(key: PropertyKey): string {
  return typeof key === 'symbol' ? key.toString() : String(key);
}

function assertExactKeys(
  record: PlainRecord,
  path: string,
  subject: string,
  allowed: readonly string[],
  required: readonly string[] = [],
): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      throw new Error(`${path} contains unsupported ${subject} key ${printableKey(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      throw new Error(`${path} ${subject} is missing required key ${key}`);
    }
  }
}

function validateIntegerValue(effect: ResourceEffect, path: string): void {
  const value = effect.value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || (effect.operation !== 'set' && value === 0)) {
      throw new Error(`${path} has an invalid resource value`);
    }
    return;
  }
  assertPlainObject(value, `${path}.value range`);
  assertExactKeys(value, `${path}.value`, 'range', ['min', 'max'], ['min', 'max']);
  if (!Number.isInteger(value.min) || !Number.isInteger(value.max)
    || value.min < 0 || value.max < value.min
    || (effect.operation !== 'set' && value.min === 0)) {
    throw new Error(`${path} has an invalid range`);
  }
}

function maximumIntegerValue(value: IntegerValue): number {
  return typeof value === 'number' ? value : value.max;
}

function maximumOutcomeLoss(
  outcomeEntry: WeightedEventOutcome,
  resourceName: 'health' | 'hull',
): number {
  return (outcomeEntry.effects.resources ?? [])
    .filter(({ resource, operation }) => (
      resource === resourceName && operation === 'subtract'
    ))
    .reduce((sum, effect) => sum + maximumIntegerValue(effect.value), 0);
}

function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value);
}

function validateMutation(candidate: unknown, path: string): void {
  assertPlainObject(candidate, `${path} mutation`);
  if (!Object.hasOwn(candidate, 'kind')) {
    throw new Error(`${path} mutation is missing required key kind`);
  }
  const kind = candidate.kind;
  if (typeof kind !== 'string' || !ITEM_MUTATIONS.includes(kind)) {
    throw new Error(`${path} has an unknown mutation kind`);
  }
  const itemSpecific = kind === 'consume' || kind === 'break' || kind === 'lose' || kind === 'gain';
  const allowed = kind === 'gain'
    ? ['kind', 'itemId', 'quantity', 'fallbackFood']
    : kind === 'gainChest'
      ? ['kind', 'quantity', 'fallbackFood']
      : itemSpecific ? ['kind', 'itemId', 'quantity'] : ['kind', 'quantity'];
  assertExactKeys(candidate, path, `${kind} mutation`, allowed, allowed);
  const quantity = candidate.quantity;
  if (!Number.isInteger(quantity) || (quantity as number) < 1) {
    throw new Error(`${path} has an invalid quantity`);
  }
  if (kind === 'loseRandom' && quantity !== 1) {
    throw new Error(`${path} loseRandom quantity must be one`);
  }
  if (kind === 'loseEventTarget') {
    if (quantity !== 1) throw new Error(`${path} has an invalid quantity`);
    return;
  }
  if (kind === 'gainChest') {
    if (quantity !== 1 || candidate.fallbackFood !== 1) {
      throw new Error(`${path} has an invalid gain quantity or fallback food`);
    }
    return;
  }
  if (!itemSpecific) return;
  const itemId = candidate.itemId;
  if (!isItemId(itemId)) throw new Error(`${path} contains unknown item`);
  if (kind === 'gain') {
    if (quantity !== 1 || candidate.fallbackFood !== 1) {
      throw new Error(`${path} has an invalid gain quantity or fallback food`);
    }
    return;
  }
  if (kind === 'break' && !ITEM_DEFINITIONS[itemId].breakable) {
    throw new Error(`${path} cannot break ${itemId} because it is not breakable`);
  }
}

function validateOutcome(
  entry: WeightedEventOutcome,
  path: string,
  phase: SurvivalEventDefinition['phase'],
): void {
  const candidateOutcome: unknown = entry;
  assertPlainObject(candidateOutcome, `${path} outcome`);
  assertExactKeys(
    candidateOutcome,
    path,
    'outcome',
    ['resultId', 'weight', 'message', 'presentationKey', 'minimumPriorAppearances', 'effects'],
    ['weight', 'message', 'effects'],
  );
  const outcomeEntry = candidateOutcome as unknown as WeightedEventOutcome;
  if (outcomeEntry.resultId !== undefined
    && (typeof outcomeEntry.resultId !== 'string' || outcomeEntry.resultId.trim().length === 0)) {
    throw new Error(`${path} result ID is blank`);
  }
  if (!Number.isFinite(outcomeEntry.weight) || outcomeEntry.weight <= 0) throw new Error(`${path} outcome weight is invalid`);
  if (typeof outcomeEntry.message !== 'string' || outcomeEntry.message.trim().length === 0) throw new Error(`${path} message is blank`);
  if (outcomeEntry.presentationKey !== undefined
    && (typeof outcomeEntry.presentationKey !== 'string'
      || outcomeEntry.presentationKey.trim().length === 0)) {
    throw new Error(`${path} presentation key is invalid`);
  }
  if (outcomeEntry.minimumPriorAppearances !== undefined
    && (!Number.isInteger(outcomeEntry.minimumPriorAppearances)
      || outcomeEntry.minimumPriorAppearances < 1)) {
    throw new Error(`${path} minimum prior appearances is invalid`);
  }
  const candidateEffects: unknown = outcomeEntry.effects;
  assertPlainObject(candidateEffects, `${path}.effects`);
  assertExactKeys(
    candidateEffects,
    `${path}.effects`,
    'effect',
    [
      'resources', 'items', 'chest',
      'nextDawnEnergy', 'followUpNight', 'ending',
    ],
  );
  const hasResources = Object.hasOwn(candidateEffects, 'resources');
  const hasItems = Object.hasOwn(candidateEffects, 'items');
  const hasChest = Object.hasOwn(candidateEffects, 'chest');
  const hasNextDawnEnergy = Object.hasOwn(candidateEffects, 'nextDawnEnergy');
  const hasFollowUpNight = Object.hasOwn(candidateEffects, 'followUpNight');
  const hasEnding = Object.hasOwn(candidateEffects, 'ending');
  const chest = hasChest ? candidateEffects.chest : undefined;
  const resourceEntries = hasResources
    ? candidateEffects.resources
    : undefined;
  const itemEntries = hasItems
    ? candidateEffects.items
    : undefined;
  if (hasResources && !Array.isArray(resourceEntries)) {
    throw new Error(`${path}.resources must be an array`);
  }
  if (hasItems && !Array.isArray(itemEntries)) {
    throw new Error(`${path}.items must be an array`);
  }
  const resources = Array.isArray(resourceEntries) ? resourceEntries : [];
  const items = Array.isArray(itemEntries) ? itemEntries : [];
  for (const [index, candidateEffect] of resources.entries()) {
    const effectPath = `${path}.resources[${index}]`;
    assertPlainObject(candidateEffect, `${effectPath} resource effect`);
    assertExactKeys(
      candidateEffect,
      effectPath,
      'resource effect',
      ['resource', 'operation', 'value'],
      ['resource', 'operation', 'value'],
    );
    const effect = candidateEffect as unknown as ResourceEffect;
    if (!EVENT_RESOURCES.includes(effect.resource)) throw new Error(`${effectPath} contains unknown resource`);
    if (!['add', 'subtract', 'set'].includes(effect.operation)) throw new Error(`${effectPath} has an invalid operation`);
    validateIntegerValue(effect, effectPath);
    if (effect.resource === 'rescueLead') {
      if (effect.operation !== 'add') {
        throw new Error(`${effectPath} rescue lead must use add`);
      }
      const minimum = typeof effect.value === 'number' ? effect.value : effect.value.min;
      const maximum = typeof effect.value === 'number' ? effect.value : effect.value.max;
      if (minimum < 1 || maximum > 8) {
        throw new Error(`${effectPath} rescue lead must stay from one through eight`);
      }
    }
  }
  if (phase === 'night' && resources.some(
    (candidateEffect) => (candidateEffect as ResourceEffect).resource === 'energy',
  )) {
    throw new Error(`${path} changes immediate energy during a night event`);
  }
  for (const [index, itemEffect] of items.entries()) {
    validateMutation(itemEffect, `${path}.items[${index}]`);
  }
  const randomLossQuantity = items.reduce((sum, itemEffect) => {
    const mutation = itemEffect as EventInventoryMutation;
    return mutation.kind === 'loseRandom' ? sum + mutation.quantity : sum;
  }, 0);
  if (randomLossQuantity > 1) {
    throw new Error(`${path} loseRandom quantity total must not exceed one`);
  }
  for (const resourceName of ['health', 'hull'] as const) {
    if (maximumOutcomeLoss(outcomeEntry, resourceName) > 60) {
      throw new Error(`${path} removes more than 60 ${resourceName}`);
    }
  }
  if (hasChest && !['acquire', 'close', 'destroy'].includes(chest as string)) {
    throw new Error(`${path}.chest has an invalid effect`);
  }
  if (hasNextDawnEnergy && (
    !Number.isInteger(candidateEffects.nextDawnEnergy)
    || (candidateEffects.nextDawnEnergy as number) < 0
    || (candidateEffects.nextDawnEnergy as number) > 3
  )) {
    throw new Error(`${path}.nextDawnEnergy must be an integer from zero through three`);
  }
  if (hasFollowUpNight && candidateEffects.followUpNight !== true) {
    throw new Error(`${path}.followUpNight must be true`);
  }
  if (hasEnding && candidateEffects.ending !== 'taken') {
    throw new Error(`${path}.ending must be taken`);
  }
}

export function validateSurvivalEventCatalog(
  catalog: readonly SurvivalEventDefinition[],
): void {
  const eventIds = new Set<string>();
  for (const eventEntry of catalog) {
    if (typeof eventEntry.id !== 'string' || eventEntry.id.trim().length === 0) throw new Error('event ID is blank');
    if (!['safe', 'uncertain', 'dangerous'].includes(eventEntry.danger)) {
      throw new Error(`${eventEntry.id} danger is invalid`);
    }
    if (typeof eventEntry.revealText !== 'string' || eventEntry.revealText.trim().length === 0) {
      throw new Error(`${eventEntry.id} reveal text is blank`);
    }
    if (eventIds.has(eventEntry.id)) throw new Error(`event ID ${eventEntry.id} is duplicated`);
    eventIds.add(eventEntry.id);
    if (!Number.isFinite(eventEntry.weight) || eventEntry.weight <= 0) throw new Error(`${eventEntry.id} event weight is invalid`);
    if (!Number.isInteger(eventEntry.earliestDay) || eventEntry.earliestDay < 0
      || (eventEntry.latestDay !== undefined
        && (!Number.isInteger(eventEntry.latestDay) || eventEntry.latestDay < eventEntry.earliestDay))) {
      throw new Error(`${eventEntry.id} has invalid day bounds`);
    }
    if (!Number.isInteger(eventEntry.cooldownDays) || eventEntry.cooldownDays < 0) {
      throw new Error(`${eventEntry.id} has an invalid cooldown`);
    }
    if (Object.hasOwn(eventEntry, 'requiresLivingCompanion')
      && typeof eventEntry.requiresLivingCompanion !== 'boolean') {
      throw new Error(`${eventEntry.id} living companion requirement must be boolean`);
    }
    if (eventEntry.maximumAppearances !== undefined
      && (!Number.isInteger(eventEntry.maximumAppearances) || eventEntry.maximumAppearances < 1)) {
      throw new Error(`${eventEntry.id} has an invalid maximum appearances`);
    }
    if (eventEntry.absentItemIds !== undefined) {
      if (!Array.isArray(eventEntry.absentItemIds) || eventEntry.absentItemIds.length === 0) {
        throw new Error(`${eventEntry.id} absent item IDs must be a non-empty array`);
      }
      const absentItemIds = new Set<ItemId>();
      for (const itemId of eventEntry.absentItemIds) {
        if (!isItemId(itemId)) throw new Error(`${eventEntry.id} absent item IDs contain an unknown item`);
        if (absentItemIds.has(itemId)) throw new Error(`${eventEntry.id} absent item ID ${itemId} is duplicated`);
        absentItemIds.add(itemId);
      }
    }
    if (eventEntry.minimumRescueLead !== undefined
      && (!Number.isFinite(eventEntry.minimumRescueLead)
        || !Number.isInteger(eventEntry.minimumRescueLead)
        || eventEntry.minimumRescueLead < 0
        || eventEntry.minimumRescueLead > 8)) {
      throw new Error(`${eventEntry.id} has an invalid minimum rescue lead`);
    }
    for (const [name, value] of [
      ['minimum', eventEntry.minimumPressure],
      ['maximum', eventEntry.maximumPressure],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 4)) {
        throw new Error(`${eventEntry.id} has an invalid ${name} pressure`);
      }
    }
    if (eventEntry.minimumPressure !== undefined
      && eventEntry.maximumPressure !== undefined
      && eventEntry.minimumPressure > eventEntry.maximumPressure) {
      throw new Error(`${eventEntry.id} has inverted pressure bounds`);
    }
    if (eventEntry.allowedChestStates !== undefined
      && (!Array.isArray(eventEntry.allowedChestStates)
        || eventEntry.allowedChestStates.length === 0
        || eventEntry.allowedChestStates.some(
          (state) => !['none', 'closed', 'mimic'].includes(state),
        ))) {
      throw new Error(`${eventEntry.id} allowed chest states are invalid`);
    }
    const candidateTargetItemIds: unknown = eventEntry.targetItemIds;
    if (candidateTargetItemIds !== undefined || Object.hasOwn(eventEntry, 'targetItemIds')) {
      if (!Array.isArray(candidateTargetItemIds)) {
        throw new Error(`${eventEntry.id} target item IDs must be an array`);
      }
      if (candidateTargetItemIds.length === 0) {
        throw new Error(`${eventEntry.id} target item IDs are empty`);
      }
      const targetItemIds = new Set<ItemId>();
      for (const candidateItemId of candidateTargetItemIds) {
        if (!isItemId(candidateItemId)) {
          throw new Error(`${eventEntry.id} target item IDs contain an unknown item`);
        }
        if (targetItemIds.has(candidateItemId)) {
          throw new Error(`${eventEntry.id} target item ID ${candidateItemId} is duplicated`);
        }
        targetItemIds.add(candidateItemId);
      }
    }
    if (!Array.isArray(eventEntry.choices) || eventEntry.choices.length === 0) {
      throw new Error(`${eventEntry.id} choices are empty`);
    }
    const choiceIds = new Set<string>();
    for (const eventChoice of eventEntry.choices) {
      if (typeof eventChoice.id !== 'string' || eventChoice.id.trim().length === 0) throw new Error(`${eventEntry.id} choice ID is blank`);
      if (choiceIds.has(eventChoice.id)) throw new Error(`${eventEntry.id} choice ID ${eventChoice.id} is duplicated`);
      choiceIds.add(eventChoice.id);
      if (eventChoice.itemId !== undefined && !isItemId(eventChoice.itemId)) throw new Error(`${eventEntry.id}.${eventChoice.id} contains unknown item`);
      if (eventChoice.itemId !== undefined
        && EVENT_CHOICE_EXCLUDED_ITEM_IDS.includes(eventChoice.itemId)) {
        throw new Error(`${eventEntry.id}.${eventChoice.id} uses an event-choice-excluded item`);
      }
      if (Object.hasOwn(eventChoice, 'companionAction')
        && eventChoice.companionAction !== 'delegateCarlitos') {
        throw new Error(`${eventEntry.id}.${eventChoice.id} has an invalid companion action`);
      }
      if (eventChoice.requiredChestState !== undefined
        && !['none', 'closed', 'mimic'].includes(eventChoice.requiredChestState)) {
        throw new Error(`${eventEntry.id}.${eventChoice.id} has an invalid required chest state`);
      }
      if (eventChoice.requirements !== undefined) {
        if (!Array.isArray(eventChoice.requirements)) {
          throw new Error(`${eventEntry.id}.${eventChoice.id} requirements must be an array`);
        }
        const requirementResources = new Set<EventResource>();
        for (const requirement of eventChoice.requirements) {
          if (requirement === null || typeof requirement !== 'object' || Array.isArray(requirement)) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement must be an object`);
          }
          const candidate = requirement as Record<string, unknown>;
          assertExactKeys(candidate, `${eventEntry.id}.${eventChoice.id} requirement`, 'requirement', ['resource', 'minimum'], ['resource', 'minimum']);
          if (!EVENT_RESOURCES.includes(candidate.resource as EventResource)) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement contains unknown resource`);
          }
          if (!Number.isInteger(candidate.minimum) || (candidate.minimum as number) < 0) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement has an invalid minimum`);
          }
          const resource = candidate.resource as EventResource;
          if (requirementResources.has(resource)) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement ${resource} is duplicated`);
          }
          requirementResources.add(resource);
        }
      }
      if (!Array.isArray(eventChoice.outcomes) || eventChoice.outcomes.length === 0) throw new Error(`${eventEntry.id}.${eventChoice.id} outcomes are empty`);
      (eventChoice.outcomes as readonly WeightedEventOutcome[]).forEach(
        (entry, index) => validateOutcome(
          entry,
          `${eventEntry.id}.${eventChoice.id}.outcomes[${index}]`,
          eventEntry.phase,
        ),
      );
    }
    if (!eventEntry.choices.some(({ itemId }) => itemId === undefined)) {
      throw new Error(`${eventEntry.id} has no no-item response`);
    }
  }
  for (const id of SURVIVAL_EVENT_IDS) {
    if (!eventIds.has(id)) throw new Error(`event ${id} is missing`);
  }
  if (eventIds.size !== SURVIVAL_EVENT_IDS.length) {
    throw new Error('event catalog contains an unsupported event');
  }
}

validateSurvivalEventCatalog(SURVIVAL_EVENTS);
