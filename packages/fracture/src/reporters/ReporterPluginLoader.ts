import type { IReporter } from '@apiquest/types';
import type { ResolvedPlugin } from '../PluginResolver.js';

/**
 * Load reporter plugins from resolved plugin metadata.
 *
 * Filters the resolved plugin list to reporter-type entries,
 * dynamically imports the module, and returns the IReporter instances.
 * Only loads plugins for which the user has actually requested a reporter name
 * that matches one of the plugin's reportTypes.
 *
 * @param resolved - All resolved plugins from PluginResolver.scanDirectories()
 * @param requestedNames - Reporter names requested by the user via -r flag
 */
export async function loadReporterPlugins(
  resolved: ResolvedPlugin[],
  requestedNames: string[]
): Promise<IReporter[]> {
  if (requestedNames.length === 0) return [];

  const { pathToFileURL } = await import('url');

  const reporters: IReporter[] = [];
  const loaded = new Set<string>();

  for (const plugin of resolved) {
    if (plugin.type !== 'reporter') continue;

    // Only load if this plugin provides a reporter type the user actually requested
    const wantedTypes = (plugin.reportTypes ?? []).filter(rt => requestedNames.includes(rt));
    if (wantedTypes.length === 0) continue;

    // Skip if already loaded (e.g., same package found in multiple dirs)
    if (loaded.has(plugin.name)) continue;
    loaded.add(plugin.name);

    const moduleUrl = pathToFileURL(plugin.entryPoint).href;
    const pluginModule = await import(moduleUrl) as Record<string, unknown>;

    const defaultExport = pluginModule.default;
    const firstNamedExport = pluginModule[Object.keys(pluginModule)[0]];
    const exported = defaultExport ?? firstNamedExport;

    if (exported === null || exported === undefined) {
      throw new Error(`Reporter plugin '${plugin.name}' has no exports`);
    }

    reporters.push(exported as IReporter);
  }

  return reporters;
}
