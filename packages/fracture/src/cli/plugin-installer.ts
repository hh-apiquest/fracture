import { exec } from 'child_process';
import { promisify } from 'util';
import type { PluginRequirements } from '../CollectionAnalyzer.js';
import type { ResolvedPlugin } from '../PluginResolver.js';

const execAsync = promisify(exec);

export interface PluginInstallResult {
  installed: string[];
  failed: string[];
  skipped: string[];
}

/**
 * Installer for ApiQuest plugins
 * Handles global installation of missing plugins via npm
 */
export class PluginInstaller {
  /**
   * Find plugins that are required but not resolved
   */
  static findMissingPlugins(
    requirements: PluginRequirements,
    resolved: ResolvedPlugin[]
  ): Set<string> {
    const missing = new Set<string>();
    
    // Check protocols
    for (const protocol of requirements.protocols) {
      const found = resolved.some(p => p.protocols?.includes(protocol) === true);
      if (!found) {
        const packageName = this.getPluginPackageName('protocol', protocol);
        missing.add(packageName);
      }
    }
    
    // Check auth types
    for (const authType of requirements.authTypes) {
      const found = resolved.some(p => p.authTypes?.includes(authType) === true);
      if (!found) {
        const packageName = this.getPluginPackageName('auth', authType);
        missing.add(packageName);
      }
    }
    
    // Check value providers
    for (const provider of requirements.valueProviders) {
      const found = resolved.some(p => p.provider === provider);
      if (!found) {
        const packageName = this.getPluginPackageName('provider', provider);
        missing.add(packageName);
      }
    }
    
    return missing;
  }
  
  /**
   * Install plugins globally via npm
   */
  static async installPlugins(packageNames: Set<string>): Promise<PluginInstallResult> {
    const result: PluginInstallResult = {
      installed: [],
      failed: [],
      skipped: []
    };
    
    for (const packageName of packageNames) {
      try {
        console.log(`Installing ${packageName}...`);
        
        // Install globally
        await execAsync(`npm install -g ${packageName}`, {
          timeout: 120000 // 2 minute timeout
        });
        
        result.installed.push(packageName);
        console.log(`Successfully installed ${packageName}`);
      } catch (error) {
        result.failed.push(packageName);
        console.error(`Failed to install ${packageName}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    return result;
  }
  
  /**
   * Map plugin requirements to npm package names
   */
  private static getPluginPackageName(type: 'protocol' | 'auth' | 'provider', identifier: string): string {
    // Protocol plugins: http → @apiquest/plugin-http
    if (type === 'protocol') {
      return `@apiquest/plugin-${identifier}`;
    }
    
    // Auth plugin: All auth types are in @apiquest/plugin-auth
    if (type === 'auth') {
      return '@apiquest/plugin-auth';
    }
    
    // Value provider plugins: vault:file → @apiquest/plugin-vault-file
    if (type === 'provider') {
      // Provider format is "source:type" (e.g., "vault:file")
      const normalized = identifier.replace(':', '-');
      return `@apiquest/plugin-${normalized}`;
    }
    
    throw new Error(`Unknown plugin type: ${type}`);
  }
}
