export function validateCommittedMenuModel(
  modelId: string,
  bytes: Uint8Array,
): string;

export function validateMenuAttribution(
  ledger: string,
  measurements: Readonly<Record<string, { readonly triangles: number }>>,
): void;
