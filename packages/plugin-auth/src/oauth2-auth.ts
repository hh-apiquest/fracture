// OAuth 2.0 Authentication
import got from 'got';
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger } from '@apiquest/types';
import { isNullOrEmpty, isNullOrWhitespace } from './helpers.js';

/**
 * OAuth2 configuration interface
 * 
 * Client credential placement:
 * - clientId/clientSecret: Always required, contain the actual credential values
 * - clientAuthentication: Where/how to send credentials to token endpoint
 *   - 'body': Send as client_id/client_secret in form body (default, standard OAuth2)
 *   - 'basic': Send as HTTP Basic Auth header (Base64 encoded clientId:clientSecret)
 *   - 'header': Send as custom headers (names specified by clientIdField/clientSecretField)
 *   - 'query': Send as query parameters (names specified by clientIdField/clientSecretField)
 * - clientIdField/clientSecretField: Custom field names for 'header' or 'query' placement
 * - extraHeaders/extraBody/extraQuery: Additional parameters for token request
 * - cacheToken: Whether to cache token across requests (default: true)
 */
export interface OAuth2Config {
  grantType: 'client_credentials' | 'password' | 'authorization_code';
  accessTokenUrl: string;
  clientId: string;
  clientSecret: string;
  username?: string;
  password?: string;
  scope?: string;
  authorizationCode?: string;
  redirectUri?: string;
  // Client credential placement (default: 'body' for backwards compatibility)
  clientAuthentication?: 'body' | 'basic' | 'header' | 'query';
  clientIdField?: string;        // Field name for header/query placement (default: 'client_id')
  clientSecretField?: string;    // Field name for header/query placement (default: 'client_secret')
  // Extra parameters to include in token request
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  extraQuery?: Record<string, string>;
  // Token caching (default: true for performance)
  cacheToken?: boolean;
}

// Simple in-memory token cache
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

// Helper function for OAuth2 token retrieval
async function getOAuth2AccessToken(config: OAuth2Config, logger?: ILogger): Promise<string> {
  logger?.trace('Token request initiated');
  logger?.trace('Grant type', { grantType: config.grantType });
  logger?.trace('Token endpoint', { url: config.accessTokenUrl });
  logger?.trace('Client auth method', { method: config.clientAuthentication ?? 'body' });
  const cachingEnabled = (config.cacheToken ?? true);
  logger?.trace('Token caching', { enabled: cachingEnabled });

  const cacheKey = `${config.accessTokenUrl}:${config.clientId}:${config.grantType}`;

  const useCaching = (config.cacheToken ?? true);
  if (useCaching) {
    const cached = tokenCache.get(cacheKey);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      logger?.trace('Using cached token', { expiresInSeconds: Math.floor((cached.expiresAt - Date.now()) / 1000) });
      return cached.token;
    } else if (cached !== undefined) {
      logger?.trace('Cached token expired, fetching new token');
    }
  } else {
    logger?.trace('Token caching disabled, fetching new token');
  }

  const clientAuth = config.clientAuthentication ?? 'body';
  
  // Build request parameters
  const params = new URLSearchParams();
  params.append('grant_type', config.grantType);
  
  // Add client credentials based on authentication method
  if (clientAuth === 'body') {
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
  }
  
  // Add scope if specified
  if (!isNullOrWhitespace(config.scope) && config.scope !== undefined) {
    params.append('scope', config.scope);
  }
  
  // Grant type specific params
  if (config.grantType === 'password' && !isNullOrEmpty(config.username) && !isNullOrEmpty(config.password)) {
    params.append('username', config.username ?? '');
    params.append('password', config.password ?? '');
  } else if (config.grantType === 'authorization_code' && !isNullOrEmpty(config.authorizationCode)) {
    params.append('code', config.authorizationCode ?? '');
    if (!isNullOrEmpty(config.redirectUri)) {
      params.append('redirect_uri', config.redirectUri ?? '');
    }
  }
  
  // Add extra body parameters
  if (config.extraBody !== null && config.extraBody !== undefined) {
    for (const [key, value] of Object.entries(config.extraBody)) {
      params.append(key, String(value));
    }
  }
  
  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  
  // Add client credentials to headers if needed
  if (clientAuth === 'basic') {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else if (clientAuth === 'header') {
    const idField = config.clientIdField ?? 'X-Client-Id';
    const secretField = config.clientSecretField ?? 'X-Client-Secret';
    headers[idField] = config.clientId;
    headers[secretField] = config.clientSecret;
  }
  
  // Add extra headers
  if (config.extraHeaders !== null && config.extraHeaders !== undefined) {
    Object.assign(headers, config.extraHeaders);
  }
  
  // Build URL with query parameters if needed
  let tokenUrl = config.accessTokenUrl;
  if (clientAuth === 'query') {
    const url = new URL(config.accessTokenUrl);
    const idField = config.clientIdField ?? 'client_id';
    const secretField = config.clientSecretField ?? 'client_secret';
    url.searchParams.set(idField, config.clientId);
    url.searchParams.set(secretField, config.clientSecret);
    
    // Add extra query parameters
    if (config.extraQuery !== null && config.extraQuery !== undefined) {
      for (const [key, value] of Object.entries(config.extraQuery)) {
        url.searchParams.set(key, value);
      }
    }
    
    tokenUrl = url.toString();
  }
  
  logger?.trace('Token request details', { url: tokenUrl, headers: JSON.stringify(headers), body: params.toString() });

  try {
    const response = await got.post(tokenUrl, {
      body: params.toString(),
      headers,
      responseType: 'json'
    });

    interface OAuth2TokenResponse {
      access_token?: string;
      expires_in?: number;
      [key: string]: unknown;
    }

    const data = response.body as OAuth2TokenResponse;
    const accessToken = data.access_token;
    const expiresIn = (typeof data.expires_in === 'number' && data.expires_in > 0) ? data.expires_in : 3600;

    logger?.trace('Token retrieved', { expiresInSeconds: expiresIn });

    if (accessToken === undefined) {
      throw new Error('No access_token in OAuth2 response');
    }

    if (useCaching) {
      const expiresAt = Date.now() + (expiresIn - 300) * 1000;
      tokenCache.set(cacheKey, { token: accessToken, expiresAt });
      logger?.trace('Token cached', { expiresAt: new Date(expiresAt).toISOString() });
    }

    return accessToken;
  } catch (error) {
    interface ErrorWithResponse {
      message: string;
      response?: {
        statusCode: number;
        body: unknown;
      };
    }

    const err = error as ErrorWithResponse;
    const details = [];
    details.push(`OAuth2 token request failed: ${err.message}`);
    if (err.response !== undefined) {
      details.push(`  Status: ${err.response.statusCode}`);
      details.push(`  Response: ${JSON.stringify(err.response.body)}`);
    }
    details.push(`  URL: ${tokenUrl}`);
    details.push(`  Method: ${clientAuth}`);
    details.push(`  Body: ${params.toString()}`);

    const fullError = details.join('\n');
    logger?.debug('OAuth2 token request failed', { details: fullError });
    throw new Error(fullError);
  }
}

export const oauth2Auth: IAuthPlugin = {
  // Identity
  name: 'OAuth 2.0',
  version: '1.0.0',
  description: 'OAuth 2.0 authentication (multiple grant types supported)',
  
  // What auth types this provides
  authTypes: ['oauth2'],
  
  // Which protocols this works with
  protocols: ['http', 'graphql', 'grpc'],
  
  dataSchema: {
    type: 'object',
    required: ['grantType', 'accessTokenUrl', 'clientId', 'clientSecret'],
    properties: {
      grantType: {
        type: 'string',
        enum: ['client_credentials', 'password', 'authorization_code'],
        description: 'OAuth 2.0 grant type'
      },
      accessTokenUrl: {
        type: 'string',
        description: 'Token endpoint URL'
      },
      clientId: {
        type: 'string',
        description: 'OAuth client ID (always required, contains the credential value)'
      },
      clientSecret: {
        type: 'string',
        description: 'OAuth client secret (always required, contains the credential value)'
      },
      username: {
        type: 'string',
        description: 'Username (for password grant)'
      },
      password: {
        type: 'string',
        description: 'Password (for password grant)'
      },
      scope: {
        type: 'string',
        description: 'OAuth scope'
      },
      authorizationCode: {
        type: 'string',
        description: 'Authorization code (for authorization_code grant)'
      },
      redirectUri: {
        type: 'string',
        description: 'Redirect URI'
      },
      clientAuthentication: {
        type: 'string',
        enum: ['body', 'basic', 'header', 'query'],
        default: 'body',
        description: 'How to send client credentials: body (form), basic (HTTP Basic Auth), header (custom headers), query (URL params)'
      },
      clientIdField: {
        type: 'string',
        description: 'Field name for client ID when using header or query authentication (default: client_id for query, X-Client-Id for header)'
      },
      clientSecretField: {
        type: 'string',
        description: 'Field name for client secret when using header or query authentication (default: client_secret for query, X-Client-Secret for header)'
      },
      extraHeaders: {
        type: 'object',
        description: 'Additional headers to include in token request (e.g., {"X-Trace-Id": "trace-123"})'
      },
      extraBody: {
        type: 'object',
        description: 'Additional form body parameters to include in token request (e.g., {"audience": "api"})'
      },
      extraQuery: {
        type: 'object',
        description: 'Additional query parameters to include in token request (e.g., {"audience": "api"})'
      },
      cacheToken: {
        type: 'boolean',
        default: true,
        description: 'Whether to cache tokens across requests (default: true). Set to false for deterministic/stateless execution.'
      }
    }
  },
  
  validate(auth: Auth, options: RuntimeOptions): ValidationResult {
    const errors = [];
    const config = auth.data as OAuth2Config | null | undefined;
    
    if (config === null || config === undefined || isNullOrWhitespace(config.accessTokenUrl)) {
      errors.push({
        message: 'OAuth2 accessTokenUrl is required',
        location: '',
        source: 'auth' as const
      });
    }
    if (config === null || config === undefined || isNullOrWhitespace(config.clientId)) {
      errors.push({
        message: 'OAuth2 clientId is required',
        location: '',
        source: 'auth' as const
      });
    }
    if (config === null || config === undefined || isNullOrWhitespace(config.clientSecret)) {
      errors.push({
        message: 'OAuth2 clientSecret is required',
        location: '',
        source: 'auth' as const
      });
    }
    
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  },
  
  async apply(request: Request, auth: Auth, options: RuntimeOptions, logger?: ILogger): Promise<Request> {
    if ((request.data.headers as Record<string, unknown> | null | undefined)?.['Authorization'] !== undefined) {
      logger?.trace('Authorization header already present, skipping OAuth2 apply');
      return request;
    }

    const config = auth.data as unknown as OAuth2Config;

    if (isNullOrEmpty(config.accessTokenUrl) || isNullOrEmpty(config.clientId) || isNullOrEmpty(config.clientSecret)) {
      logger?.error('OAuth2 config missing accessTokenUrl, clientId, or clientSecret');
      throw new Error('OAuth2 requires accessTokenUrl, clientId, and clientSecret');
    }

    const token = await getOAuth2AccessToken(config, logger);

    request.data.headers ??= {};
    (request.data.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    logger?.debug('OAuth2 Authorization header applied');

    return request;
  }
};
