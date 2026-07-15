export const initialSelections = (itemIds) => Object.fromEntries(itemIds.map((id) => [id, 'current']));

export const initialPreviewStates = (catalog) => Object.fromEntries(
  Object.entries(catalog.items).map(([itemId, choices]) => [
    itemId,
    Object.fromEntries(choices.map(({ id }) => [id, 'pending'])),
  ]),
);

const previewStatuses = new Set(['pending', 'ready', 'failed']);

export function setPreviewState(state, itemId, candidateId, status) {
  if (!state[itemId] || !(candidateId in state[itemId])) {
    throw new Error(`Unknown choice: ${itemId}:${candidateId}`);
  }
  if (!previewStatuses.has(status)) {
    throw new Error(`Unknown preview status: ${status}`);
  }

  return {
    ...state,
    [itemId]: {
      ...state[itemId],
      [candidateId]: status,
    },
  };
}

export const isChoiceSelectable = (previewStates, itemId, candidateId) => (
  previewStates[itemId]?.[candidateId] === 'ready'
);

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

export function readySelectionSummary(state, catalog, previewStates) {
  const everySelectionReady = Object.entries(state).every(([itemId, candidateId]) => (
    isChoiceSelectable(previewStates, itemId, candidateId)
  ));

  return everySelectionReady ? selectionSummary(state, catalog) : null;
}

export const selectionEvent = (selections) => ({
  type: 'choice',
  choice: 'selection-summary',
  selections,
});

export function reconcileSelections(state, catalog, previewStates) {
  return Object.fromEntries(Object.entries(state).map(([itemId, candidateId]) => {
    if (isChoiceSelectable(previewStates, itemId, candidateId)) {
      return [itemId, candidateId];
    }

    const fallback = catalog.items[itemId]?.find(({ id }) => (
      isChoiceSelectable(previewStates, itemId, id)
    ));
    if (!fallback) {
      throw new Error(`No successful choice for item: ${itemId}`);
    }
    return [itemId, fallback.id];
  }));
}

export function validatedKenneySourceUrl(rawUrl) {
  try {
    if (typeof rawUrl !== 'string' || /[<>"'`\s]/u.test(rawUrl)) {
      throw new Error('unsafe characters');
    }
    const sourceUrl = new URL(rawUrl);
    const allowedHost = sourceUrl.hostname === 'kenney.nl' || sourceUrl.hostname === 'www.kenney.nl';
    if (sourceUrl.protocol !== 'https:' || !allowedHost || !sourceUrl.pathname.startsWith('/assets/')) {
      throw new Error('unexpected origin or path');
    }
    return sourceUrl.href;
  } catch {
    throw new Error(`Invalid Kenney asset URL: ${rawUrl}`);
  }
}

export function candidateMetadata(sourceAssetId) {
  if (typeof sourceAssetId !== 'string') {
    throw new Error('Invalid source asset id');
  }

  const separator = sourceAssetId.indexOf(':');
  const packIdentity = separator === -1 ? sourceAssetId : sourceAssetId.slice(0, separator);
  const packs = packIdentity.split('+').filter(Boolean).map((pack) => {
    const versionSeparator = pack.lastIndexOf('@');
    if (versionSeparator <= 0 || versionSeparator === pack.length - 1) {
      throw new Error(`Invalid source asset id: ${sourceAssetId}`);
    }
    return {
      name: pack.slice(0, versionSeparator),
      version: pack.slice(versionSeparator + 1),
    };
  });
  if (packs.length === 0) {
    throw new Error(`Invalid source asset id: ${sourceAssetId}`);
  }

  return {
    packs,
    status: sourceAssetId.includes(':composite/') ? 'composite' : 'direct',
  };
}
