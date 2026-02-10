import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the user data directory (same as Electron app.getPath('userData'))
 * This ensures plugins installed by desktop are available to CLI and vice versa
 */
export function getUserDataPath(): string {
  const home = os.homedir();
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows: C:\Users\<user>\AppData\Roaming\@apiquest\desktop
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), '@apiquest', 'desktop');
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/@apiquest/desktop
    return path.join(home, 'Library', 'Application Support', '@apiquest', 'desktop');
  } else {
    // Linux: ~/.config/@apiquest/desktop
    return path.join(home, '.config', '@apiquest', 'desktop');
  }
}

/**
 * Get plugin directories for CLI
 * Returns an array of directories to scan for plugins
 */
export function getPluginDirectories(): string[] {
  const dirs: string[] = [];

  // 1. Development packages folder
  // The CLI dist is at packages/cli/dist, so __dirname/../../ gets us to workspace packages
  const devPackagesDir = path.resolve(__dirname, '../../..');
  
  // Check if packages folder exists (we're in dev workspace)
  if (fs.existsSync(devPackagesDir) && fs.statSync(devPackagesDir).isDirectory()) {
    // Verify it's the packages folder by checking for multiple @apiquest packages
    const entries = fs.readdirSync(devPackagesDir);
    const hasPluginAuth = entries.includes('plugin-auth');
    const hasPluginHttp = entries.includes('plugin-http');
    
    if (hasPluginAuth && hasPluginHttp) {
      console.debug(`[CLI] DEV MODE: Loading plugins from ${devPackagesDir}`);
      dirs.push(devPackagesDir);
    }
  }

  // 2. Shared user data plugins directory (same as desktop)
  const userDataPath = getUserDataPath();
  const sharedPluginsDir = path.join(userDataPath, 'plugins');
  dirs.push(sharedPluginsDir);

  // 3. Global npm packages (@apiquest scope)
  try {
    const globalNodeModules = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    const globalApiquestDir = path.join(globalNodeModules, '@apiquest');
    dirs.push(globalApiquestDir);
  } catch (error) {
    console.warn('[CLI] Could not determine global npm directory:', error);
  }

  return dirs;
}
