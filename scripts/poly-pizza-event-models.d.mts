export interface PolyPizzaEventModelSource {
  readonly id: string;
  readonly pageUrl: string;
  readonly downloadUrl: string;
  readonly sourceAssetId: string;
  readonly publicId: string;
  readonly resourceId: string;
  readonly title: string;
  readonly creator: string;
  readonly license: 'CC0 1.0' | 'CC-BY 3.0';
  readonly licenseUrl: string;
  readonly sha256: string;
  readonly committedSha256: string;
  readonly sourceTriangles: number;
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly downloadedOn: string;
  readonly maxTriangles: number;
}

export const POLY_PIZZA_EVENT_MODEL_SOURCES:
  Readonly<Record<string, PolyPizzaEventModelSource>>;
export const POLY_PIZZA_EVENT_MODEL_IDS: readonly string[];
