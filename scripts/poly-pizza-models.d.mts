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
  readonly downloadedOn: string;
  readonly nodeName?: string;
  readonly removeNodeNames?: readonly string[];
  readonly translation?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly components?: readonly PolyPizzaModelSource[];
  readonly maxTriangles?: number;
  readonly simplifyRatio?: number;
  readonly simplifyError?: number;
  readonly committedSha256?: string;
  readonly textureProfile?: Readonly<{
    maxDimension: number;
    colorQuality: number;
    normalQuality: number;
    maxFileBytes: number;
    textures: readonly Readonly<{
      name: string;
      width: number;
      height: number;
      channels: number;
      slots: readonly string[];
      hasAlpha: boolean;
    }>[];
  }>;
}

export const POLY_PIZZA_MODEL_SOURCES: Readonly<Record<string, PolyPizzaModelSource>>;
export const POLY_PIZZA_MODEL_IDS: readonly string[];

export interface BuildPolyPizzaModelOptions {
  readonly id: string;
  readonly sourcePath: string;
  readonly componentSourcePaths?: Readonly<Record<string, string>>;
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
