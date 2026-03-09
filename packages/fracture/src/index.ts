// Main exports for @apiquest/fracture
export * from './CollectionRunner.js';
export * from './VariableResolver.js';
export * from './ScriptEngine.js';
export * from './PluginManager.js';
export * from './AuthNegotiator.js';

// Plugin discovery utilities — exported for library embedders and desktop app integration
export { PluginResolver, type ResolvedPlugin } from './PluginResolver.js';
export { getPluginDirectories } from './cli/plugin-discovery.js';

// Reporters
export * from './reporters/index.js';
