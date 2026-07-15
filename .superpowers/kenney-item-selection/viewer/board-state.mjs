export const initialSelections = (itemIds) => Object.fromEntries(itemIds.map((id) => [id, 'current']));

export function selectChoice(state, itemId, candidateId) {
  if (!(itemId in state)) throw new Error(`Unknown item: ${itemId}`);
  return { ...state, [itemId]: candidateId };
}

export function selectionSummary(state, catalog) {
  return Object.fromEntries(Object.entries(state).map(([itemId, candidateId]) => {
    const choice = catalog.items[itemId].find(({ id }) => id === candidateId);
    if (!choice) throw new Error(`Unknown choice: ${itemId}:${candidateId}`);
    return [itemId, { candidateId, label: choice.label, sourceAssetId: choice.sourceAssetId }];
  }));
}
