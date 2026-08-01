import { resolve } from 'node:path';

export function parseModelCheckArguments(args, defaultModelsDir, withLedger = true) {
  const options = {
    assetsOnly: false,
    modelsDir: resolve(...defaultModelsDir),
    ...(withLedger ? { ledgerPath: resolve('src', 'assets', 'ATTRIBUTION.md') } : {}),
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--assets-only') {
      options.assetsOnly = true;
      continue;
    }
    const key = argument === '--models-dir'
      ? 'modelsDir'
      : argument === '--ledger-path' && withLedger ? 'ledgerPath' : null;
    if (key === null) throw new Error(`unknown argument: ${argument}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
    options[key] = resolve(value);
  }
  return options;
}
