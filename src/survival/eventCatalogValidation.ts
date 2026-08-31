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
  const kind = mutationKind(candidate, path);
  const itemSpecific = mutationUsesItemId(kind);
  const allowed = mutationKeys(kind, itemSpecific);
  assertExactKeys(candidate, path, `${kind} mutation`, allowed, allowed);
  validateMutationQuantity(candidate, kind, path);
  if (!itemSpecific) return;
  validateItemMutation(candidate, kind, path);
}

function mutationKind(candidate: PlainRecord, path: string): string {
  if (!Object.hasOwn(candidate, 'kind')) {
    throw new Error(`${path} mutation is missing required key kind`);
  }
  if (typeof candidate.kind !== 'string' || !ITEM_MUTATIONS.includes(candidate.kind)) {
    throw new Error(`${path} has an unknown mutation kind`);
  }
  return candidate.kind;
}

function mutationUsesItemId(kind: string): boolean {
  return kind === 'consume' || kind === 'break' || kind === 'lose' || kind === 'gain';
}

function mutationKeys(kind: string, itemSpecific: boolean): readonly string[] {
  if (kind === 'gain') return ['kind', 'itemId', 'quantity', 'fallbackFood'];
  if (kind === 'gainChest') return ['kind', 'quantity', 'fallbackFood'];
  return itemSpecific ? ['kind', 'itemId', 'quantity'] : ['kind', 'quantity'];
}

function validateMutationQuantity(candidate: PlainRecord, kind: string, path: string): void {
  const { quantity } = candidate;
  if (!Number.isInteger(quantity) || (quantity as number) < 1) {
    throw new Error(`${path} has an invalid quantity`);
  }
  if (kind === 'loseRandom' && quantity !== 1) {
    throw new Error(`${path} loseRandom quantity must be one`);
  }
  if (kind === 'loseEventTarget') {
    if (quantity !== 1) throw new Error(`${path} has an invalid quantity`);
  }
  if (kind === 'gainChest') {
    if (quantity !== 1 || candidate.fallbackFood !== 1) {
      throw new Error(`${path} has an invalid gain quantity or fallback food`);
    }
  }
}

function validateItemMutation(candidate: PlainRecord, kind: string, path: string): void {
  const itemId = candidate.itemId;
  if (!isItemId(itemId)) throw new Error(`${path} contains unknown item`);
  if (kind === 'gain') {
    if (candidate.quantity !== 1 || candidate.fallbackFood !== 1) {
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
  validateOutcomeMetadata(outcomeEntry, path);
  const candidateEffects = validateEffectRecord(outcomeEntry.effects, path);
  const { resources, items } = validatedEffectArrays(candidateEffects, path);
  validateResourceEffects(resources, path);
  validateNightEnergyEffects(resources, path, phase);
  validateItemEffects(items, path);
  validateOutcomeLosses(outcomeEntry, items, path);
  validateOptionalEffects(candidateEffects, path);
}

function validateOutcomeMetadata(outcomeEntry: WeightedEventOutcome, path: string): void {
  validateOutcomeResultId(outcomeEntry, path);
  validateOutcomeWeightAndMessage(outcomeEntry, path);
  validateOutcomePresentation(outcomeEntry, path);
  validateOutcomeAppearanceMinimum(outcomeEntry, path);
}

function validateOutcomeResultId(outcomeEntry: WeightedEventOutcome, path: string): void {
  if (outcomeEntry.resultId !== undefined
    && (typeof outcomeEntry.resultId !== 'string' || outcomeEntry.resultId.trim().length === 0)) {
    throw new Error(`${path} result ID is blank`);
  }
}

function validateOutcomeWeightAndMessage(outcomeEntry: WeightedEventOutcome, path: string): void {
  if (!Number.isFinite(outcomeEntry.weight) || outcomeEntry.weight <= 0) throw new Error(`${path} outcome weight is invalid`);
  if (typeof outcomeEntry.message !== 'string' || outcomeEntry.message.trim().length === 0) throw new Error(`${path} message is blank`);
}

function validateOutcomePresentation(outcomeEntry: WeightedEventOutcome, path: string): void {
  if (outcomeEntry.presentationKey !== undefined
    && (typeof outcomeEntry.presentationKey !== 'string'
      || outcomeEntry.presentationKey.trim().length === 0)) {
    throw new Error(`${path} presentation key is invalid`);
  }
}

function validateOutcomeAppearanceMinimum(outcomeEntry: WeightedEventOutcome, path: string): void {
  if (outcomeEntry.minimumPriorAppearances !== undefined
    && (!Number.isInteger(outcomeEntry.minimumPriorAppearances)
      || outcomeEntry.minimumPriorAppearances < 1)) {
    throw new Error(`${path} minimum prior appearances is invalid`);
  }
}

function validateEffectRecord(value: unknown, path: string): PlainRecord {
  const candidateEffects: unknown = value;
  assertPlainObject(candidateEffects, `${path}.effects`);
  assertExactKeys(
    candidateEffects,
    `${path}.effects`,
    'effect',
    [
      'resources', 'items', 'chest',
      'nextDawnEnergy', 'followUpNight',
    ],
  );
  return candidateEffects;
}

function validatedEffectArrays(candidateEffects: PlainRecord, path: string) {
  const hasResources = Object.hasOwn(candidateEffects, 'resources');
  const hasItems = Object.hasOwn(candidateEffects, 'items');
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
  return { resources, items };
}

function validateResourceEffects(resources: unknown[], path: string): void {
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
}

function validateNightEnergyEffects(
  resources: unknown[],
  path: string,
  phase: SurvivalEventDefinition['phase'],
): void {
  if (phase === 'night' && resources.some(
    (candidateEffect) => (candidateEffect as ResourceEffect).resource === 'energy',
  )) {
    throw new Error(`${path} changes immediate energy during a night event`);
  }
}

function validateItemEffects(items: unknown[], path: string): void {
  for (const [index, itemEffect] of items.entries()) {
    validateMutation(itemEffect, `${path}.items[${index}]`);
  }
}

function validateOutcomeLosses(
  outcomeEntry: WeightedEventOutcome,
  items: unknown[],
  path: string,
): void {
  const randomLossQuantity = items.reduce<number>((sum, itemEffect) => {
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
}

function validateOptionalEffects(candidateEffects: PlainRecord, path: string): void {
  const hasChest = Object.hasOwn(candidateEffects, 'chest');
  const hasNextDawnEnergy = Object.hasOwn(candidateEffects, 'nextDawnEnergy');
  const hasFollowUpNight = Object.hasOwn(candidateEffects, 'followUpNight');
  const chest = hasChest ? candidateEffects.chest : undefined;
  if (hasChest && !['acquire', 'close', 'destroy'].includes(chest as string)) {
    throw new Error(`${path}.chest has an invalid effect`);
  }
  if (hasNextDawnEnergy && (
    !Number.isInteger(candidateEffects.nextDawnEnergy)
    || (candidateEffects.nextDawnEnergy as number) < 0
    || (candidateEffects.nextDawnEnergy as number) > 4
  )) {
    throw new Error(`${path}.nextDawnEnergy must be an integer from zero through four`);
  }
  if (hasFollowUpNight && candidateEffects.followUpNight !== true) {
    throw new Error(`${path}.followUpNight must be true`);
  }
}

export function validateSurvivalEventCatalog(
  catalog: readonly SurvivalEventDefinition[],
): void {
  const eventIds = new Set<string>();
  for (const eventEntry of catalog) {
    validateEvent(eventEntry, eventIds);
  }
  validateCatalogEventIds(eventIds);
}

function validateEvent(eventEntry: SurvivalEventDefinition, eventIds: Set<string>): void {
  validateEventIdentity(eventEntry, eventIds);
  validateEventSchedule(eventEntry);
  validateEventAppearanceRules(eventEntry);
  validateAbsentItemIds(eventEntry);
  validateMinimumRescueLead(eventEntry);
  validatePressureBounds(eventEntry);
  validateAllowedChestStates(eventEntry);
  validateTargetItemIds(eventEntry);
  validateChoices(eventEntry);
}

function validateEventIdentity(eventEntry: SurvivalEventDefinition, eventIds: Set<string>): void {
  if (typeof eventEntry.id !== 'string' || eventEntry.id.trim().length === 0) throw new Error('event ID is blank');
  if (!['safe', 'uncertain', 'dangerous'].includes(eventEntry.danger)) {
    throw new Error(`${eventEntry.id} danger is invalid`);
  }
  if (typeof eventEntry.revealText !== 'string' || eventEntry.revealText.trim().length === 0) {
    throw new Error(`${eventEntry.id} reveal text is blank`);
  }
  if (eventIds.has(eventEntry.id)) throw new Error(`event ID ${eventEntry.id} is duplicated`);
  eventIds.add(eventEntry.id);
}

function validateEventSchedule(eventEntry: SurvivalEventDefinition): void {
  if (!Number.isFinite(eventEntry.weight) || eventEntry.weight <= 0) throw new Error(`${eventEntry.id} event weight is invalid`);
  if (!Number.isInteger(eventEntry.earliestDay) || eventEntry.earliestDay < 0
    || (eventEntry.latestDay !== undefined
      && (!Number.isInteger(eventEntry.latestDay) || eventEntry.latestDay < eventEntry.earliestDay))) {
    throw new Error(`${eventEntry.id} has invalid day bounds`);
  }
  if (!Number.isInteger(eventEntry.cooldownDays) || eventEntry.cooldownDays < 0) {
    throw new Error(`${eventEntry.id} has an invalid cooldown`);
  }
}

function validateEventAppearanceRules(eventEntry: SurvivalEventDefinition): void {
  if (Object.hasOwn(eventEntry, 'requiresLivingCompanion')
    && typeof eventEntry.requiresLivingCompanion !== 'boolean') {
    throw new Error(`${eventEntry.id} living companion requirement must be boolean`);
  }
  if (eventEntry.maximumAppearances !== undefined
    && (!Number.isInteger(eventEntry.maximumAppearances) || eventEntry.maximumAppearances < 1)) {
    throw new Error(`${eventEntry.id} has an invalid maximum appearances`);
  }
}

function validateAbsentItemIds(eventEntry: SurvivalEventDefinition): void {
  if (eventEntry.absentItemIds === undefined) return;
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

function validateMinimumRescueLead(eventEntry: SurvivalEventDefinition): void {
  if (eventEntry.minimumRescueLead !== undefined
    && (!Number.isFinite(eventEntry.minimumRescueLead)
      || !Number.isInteger(eventEntry.minimumRescueLead)
      || eventEntry.minimumRescueLead < 0
      || eventEntry.minimumRescueLead > 8)) {
    throw new Error(`${eventEntry.id} has an invalid minimum rescue lead`);
  }
}

function validatePressureBounds(eventEntry: SurvivalEventDefinition): void {
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
}

function validateAllowedChestStates(eventEntry: SurvivalEventDefinition): void {
  if (eventEntry.allowedChestStates !== undefined
    && (!Array.isArray(eventEntry.allowedChestStates)
      || eventEntry.allowedChestStates.length === 0
      || eventEntry.allowedChestStates.some(
        (state) => !['none', 'closed', 'mimic'].includes(state),
      ))) {
    throw new Error(`${eventEntry.id} allowed chest states are invalid`);
  }
}

function validateTargetItemIds(eventEntry: SurvivalEventDefinition): void {
  const candidateTargetItemIds: unknown = eventEntry.targetItemIds;
  if (candidateTargetItemIds === undefined && !Object.hasOwn(eventEntry, 'targetItemIds')) return;
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

function validateChoices(eventEntry: SurvivalEventDefinition): void {
  if (!Array.isArray(eventEntry.choices) || eventEntry.choices.length === 0) {
    throw new Error(`${eventEntry.id} choices are empty`);
  }
  const choiceIds = new Set<string>();
  for (const eventChoice of eventEntry.choices) {
    validateChoice(eventEntry, eventChoice, choiceIds);
  }
  if (!eventEntry.choices.some(({ itemId }) => itemId === undefined)) {
    throw new Error(`${eventEntry.id} has no no-item response`);
  }
}

function validateChoice(
  eventEntry: SurvivalEventDefinition,
  eventChoice: SurvivalEventDefinition['choices'][number],
  choiceIds: Set<string>,
): void {
  if (typeof eventChoice.id !== 'string' || eventChoice.id.trim().length === 0) throw new Error(`${eventEntry.id} choice ID is blank`);
  if (choiceIds.has(eventChoice.id)) throw new Error(`${eventEntry.id} choice ID ${eventChoice.id} is duplicated`);
  choiceIds.add(eventChoice.id);
  if (eventChoice.itemId !== undefined && !isItemId(eventChoice.itemId)) throw new Error(`${eventEntry.id}.${eventChoice.id} contains unknown item`);
  if (eventChoice.itemId !== undefined
    && EVENT_CHOICE_EXCLUDED_ITEM_IDS.includes(eventChoice.itemId)) {
    throw new Error(`${eventEntry.id}.${eventChoice.id} uses an event-choice-excluded item`);
  }
  validateChoiceOptions(eventEntry, eventChoice);
  validateChoiceRequirements(eventEntry, eventChoice);
  validateChoiceOutcomes(eventEntry, eventChoice);
}

function validateChoiceOptions(
  eventEntry: SurvivalEventDefinition,
  eventChoice: SurvivalEventDefinition['choices'][number],
): void {
  if (Object.hasOwn(eventChoice, 'companionAction')
    && eventChoice.companionAction !== 'delegateCarlitos') {
    throw new Error(`${eventEntry.id}.${eventChoice.id} has an invalid companion action`);
  }
  if (eventChoice.requiredChestState !== undefined
    && !['none', 'closed', 'mimic'].includes(eventChoice.requiredChestState)) {
    throw new Error(`${eventEntry.id}.${eventChoice.id} has an invalid required chest state`);
  }
}

function validateChoiceRequirements(
  eventEntry: SurvivalEventDefinition,
  eventChoice: SurvivalEventDefinition['choices'][number],
): void {
  if (eventChoice.requirements === undefined) return;
  if (!Array.isArray(eventChoice.requirements)) {
    throw new Error(`${eventEntry.id}.${eventChoice.id} requirements must be an array`);
  }
  const requirementResources = new Set<EventResource>();
  for (const requirement of eventChoice.requirements) {
    validateChoiceRequirement(eventEntry, eventChoice, requirement, requirementResources);
  }
}

function validateChoiceRequirement(
  eventEntry: SurvivalEventDefinition,
  eventChoice: SurvivalEventDefinition['choices'][number],
  requirement: unknown,
  requirementResources: Set<EventResource>,
): void {
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

function validateChoiceOutcomes(
  eventEntry: SurvivalEventDefinition,
  eventChoice: SurvivalEventDefinition['choices'][number],
): void {
  if (!Array.isArray(eventChoice.outcomes) || eventChoice.outcomes.length === 0) throw new Error(`${eventEntry.id}.${eventChoice.id} outcomes are empty`);
  (eventChoice.outcomes as readonly WeightedEventOutcome[]).forEach(
    (entry, index) => validateOutcome(
      entry,
      `${eventEntry.id}.${eventChoice.id}.outcomes[${index}]`,
      eventEntry.phase,
    ),
  );
}

function validateCatalogEventIds(eventIds: Set<string>): void {
  for (const id of SURVIVAL_EVENT_IDS) {
    if (!eventIds.has(id)) throw new Error(`event ${id} is missing`);
  }
  if (eventIds.size !== SURVIVAL_EVENT_IDS.length) {
    throw new Error('event catalog contains an unsupported event');
  }
}

validateSurvivalEventCatalog(SURVIVAL_EVENTS);
