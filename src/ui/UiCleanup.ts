export interface CleanupResult {
  readonly failed: boolean;
  readonly firstError: unknown;
}

export function runCleanupSteps(cleanups: readonly (() => void)[]): CleanupResult {
  let failed = false;
  let firstError: unknown;
  cleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  });
  return { failed, firstError };
}

export function settleAfterCleanup(
  resolve: () => void,
  cleanups: readonly (() => void)[],
): void {
  const result = runCleanupSteps(cleanups);
  resolve();
  if (result.failed) throw result.firstError;
}

export function throwCleanupFailure(result: CleanupResult): void {
  if (result.failed) throw result.firstError;
}
