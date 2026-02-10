// Main exports for @apiquest/fracture
export * from './CollectionRunner.js';
export * from './VariableResolver.js';
export * from './ScriptEngine.js';
export * from './PluginManager.js';
export * from './ConsoleReporter.js';

// Convenience function for quick runs
import { CollectionRunner } from './CollectionRunner.js';
import type { Collection, RunOptions, RunResult } from '@apiquest/types';

export async function run(options: {
  collection: Collection;
  environment?: RunOptions['environment'];
  data?: RunOptions['data'];
  globalVariables?: RunOptions['globalVariables'];
}): Promise<RunResult> {
  const runner = new CollectionRunner();
  return await runner.run(options.collection, {
    environment: options.environment,
    data: options.data,
    globalVariables: options.globalVariables
  });
}
