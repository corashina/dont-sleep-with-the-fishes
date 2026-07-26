export interface PolyPizzaFishingModelSource {
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
  readonly sourceTriangles: number;
  readonly downloadedOn: string;
  readonly maxTriangles: number;
}

export const POLY_PIZZA_FISHING_MODEL_SOURCES: Readonly<
  Record<string, PolyPizzaFishingModelSource>
>;
export const POLY_PIZZA_FISHING_MODEL_IDS: readonly string[];

export function buildPolyPizzaFishingModels(options: {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly verifySource?: boolean;
}): Promise<Record<string, {
  readonly sha256: string;
  readonly sourceTriangles: number;
  readonly triangles: number;
}>>;
