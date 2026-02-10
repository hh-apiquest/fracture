// Authentication Plugins for ApiQuest
import type { IAuthPlugin } from '@apiquest/types';

// Export individual auth plugins
export { bearerAuth } from './bearer-auth.js';
export { basicAuth } from './basic-auth.js';
export { apiKeyAuth } from './apikey-auth.js';
export { oauth2Auth, type OAuth2Config } from './oauth2-auth.js';

// Export helpers
export { isNullOrEmpty, isNullOrWhitespace } from './helpers.js';

// Import all plugins for registry
import { bearerAuth } from './bearer-auth.js';
import { basicAuth } from './basic-auth.js';
import { apiKeyAuth } from './apikey-auth.js';
import { oauth2Auth } from './oauth2-auth.js';

// Auth Plugin Registry
export const authPlugins: IAuthPlugin[] = [
  bearerAuth,
  basicAuth,
  apiKeyAuth,
  oauth2Auth
];

export function getAuthPlugin(type: string): IAuthPlugin | undefined {
  return authPlugins.find(p => p.authTypes.includes(type));
}

// Export individual plugins and registry
export default authPlugins;
