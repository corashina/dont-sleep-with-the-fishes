export interface PolyPizzaModelSource {
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
  readonly simplifyRatio?: number;
  readonly simplifyError?: number;
}

export const POLY_PIZZA_MODEL_SOURCES: Readonly<Record<string, PolyPizzaModelSource>>;
export const POLY_PIZZA_MODEL_IDS: readonly string[];

export interface BuildPolyPizzaModelOptions {
  readonly id: string;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly descriptor?: PolyPizzaModelSource;
  readonly verifySource?: boolean;
}

export interface BuildPolyPizzaModelsOptions {
  readonly sourceRoot: string;
  readonly outputRoot: string;
  readonly sources?: Readonly<Record<string, PolyPizzaModelSource>>;
  readonly verifySource?: boolean;
}

export interface BuildPolyPizzaModelResult {
  readonly sha256: string;
  readonly sourceTriangles: number;
  readonly triangles: number;
}

export function countDocumentTriangles(document: unknown): number;
export function buildPolyPizzaModel(
  options: BuildPolyPizzaModelOptions,
): Promise<BuildPolyPizzaModelResult>;
export function buildPolyPizzaModels(
  options: BuildPolyPizzaModelsOptions,
): Promise<Record<string, BuildPolyPizzaModelResult>>;
