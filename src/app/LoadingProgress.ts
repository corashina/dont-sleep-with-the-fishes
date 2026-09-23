export interface LoadingProgress {
  readonly stage: 'loadingAssets' | 'buildingScene' | 'preparingTextures'
    | 'preparingSceneShaders' | 'preparingObjectShaders' | 'preparingEffects'
    | 'startingScene' | 'sceneReady';
  readonly completed?: number;
  readonly total?: number;
}

export type ReportLoadingProgress = (progress: LoadingProgress) => void;

/** Give the loading label a chance to paint before synchronous GPU setup. */
export async function reportLoadingStage(
  report: ReportLoadingProgress | undefined,
  stage: LoadingProgress['stage'],
): Promise<void> {
  if (report === undefined) return;
  report({ stage });
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}
