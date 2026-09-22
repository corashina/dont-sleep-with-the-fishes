/** Run progress is separate from tools and cannot be lost or traded. */
export const HEART_PIECE_IDS = ['flowers', 'blood', 'chest'] as const;
export type HeartPieceId = typeof HEART_PIECE_IDS[number];
export type HeartPieces = Readonly<Record<HeartPieceId, boolean>>;
export const EMPTY_HEART: HeartPieces = Object.freeze({ flowers: false, blood: false, chest: false });
export const COMPLETE_HEART: HeartPieces = Object.freeze({ flowers: true, blood: true, chest: true });

export function heartPieceCount(pieces: HeartPieces): number {
  return Number(pieces.flowers) + Number(pieces.blood) + Number(pieces.chest);
}

export function isHeartComplete(pieces: HeartPieces): boolean {
  return pieces.flowers && pieces.blood && pieces.chest;
}

export function collectHeartPiece(pieces: HeartPieces, id: HeartPieceId): HeartPieces {
  return pieces[id] ? pieces : Object.freeze({ ...pieces, [id]: true });
}

export function parseHeartPieces(value: unknown): HeartPieces | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !HEART_PIECE_IDS.every((id) => (
    Object.hasOwn(record, id) && typeof record[id] === 'boolean'
  ))) return null;
  return Object.freeze({ flowers: record.flowers as boolean, blood: record.blood as boolean, chest: record.chest as boolean });
}
