export interface GeneratedItemModelMetadata {
  readonly triangles: number;
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export function buildItemModelMetadata(
  modelsDir: string,
  itemIds: readonly string[],
): Promise<Readonly<Record<string, GeneratedItemModelMetadata>>>;
