import got, { OptionsOfTextResponseBody, Response, RequestError } from 'got';
import type { IProtocolPlugin, Request, ExecutionContext, ProtocolResponse, ValidationResult, ValidationError, RuntimeOptions, ILogger } from '@apiquest/types';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';

interface BodyObject {
  mode?: string;
  raw?: string;
  urlencoded?: Array<{ key?: string; value?: unknown; disabled?: boolean }>;
  formdata?: Array<{ key?: string; value?: unknown; disabled?: boolean }>;
  [key: string]: unknown;
}

// Helper functions for string validation
function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Parse proxy configuration from environment variables
 * Platform-agnostic: checks both uppercase and lowercase variants
 */
function getProxyFromEnv(targetUrl: string): { host: string; port: number; auth?: { username: string; password: string } } | null {
  // Check both uppercase and lowercase variants (platform-agnostic)
  const HTTP_PROXY = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const HTTPS_PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  
  // Choose proxy based on target URL protocol
  const proxyUrl = targetUrl.startsWith('https:') ? (HTTPS_PROXY ?? HTTP_PROXY) : HTTP_PROXY;
  
  if (proxyUrl === undefined || proxyUrl === '') {
    return null;
  }
  
  try {
    const parsed = new URL(proxyUrl);
    return {
      host: parsed.hostname,
      port: (parsed.port !== '' ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80)),
      auth: parsed.username !== '' ? {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password)
      } : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Check if host should bypass proxy based on NO_PROXY env var
 */
function shouldBypassProxy(targetUrl: string): boolean {
  const NO_PROXY = process.env.NO_PROXY ?? process.env.no_proxy;
  
  if (NO_PROXY === undefined || NO_PROXY === '') {
    return false;
  }
  
  const bypassList = NO_PROXY.split(',').map(s => s.trim());
  const parsed = new URL(targetUrl);
  
  return bypassList.some(pattern => {
    return parsed.hostname === pattern || 
           (pattern.startsWith('*.') && parsed.hostname.endsWith(pattern.slice(1)));
  });
}

export const httpPlugin: IProtocolPlugin = {
  name: 'HTTP Client',
  version: '1.0.0',
  description: 'HTTP/HTTPS protocol support for REST APIs',
  
  // What protocols this plugin provides
  protocols: ['http'],

  // Supported authentication types
  supportedAuthTypes: ['bearer', 'basic', 'oauth2', 'apikey', 'digest', 'ntlm'],
  
  // Accept additional auth plugins beyond the listed types
  strictAuthList: false,

  // Data schema for HTTP requests
  dataSchema: {
    type: 'object',
    required: ['method', 'url'],
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        description: 'HTTP method'
      },
      url: {
        type: 'string',
        description: 'Request URL'
      },
      headers: {
        type: 'object',
        description: 'HTTP headers',
        additionalProperties: { type: 'string' }
      },
      body: {
        description: 'Request body (string or structured object)',
        oneOf: [
          { type: 'string' },
          { type: 'object' }
        ]
      }
    }
  },

  // Options schema for runtime configuration
  optionsSchema: {
    keepAlive: {
      type: 'boolean',
      default: true,
      description: 'Keep TCP connections alive between requests'
    },
    timeout: {
      type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds'
    },
    followRedirects: {
      type: 'boolean',
      default: true,
      description: 'Follow HTTP redirects automatically'
    },
    maxRedirects: {
      type: 'number',
      default: 5,
      description: 'Maximum number of redirects to follow'
    },
    validateCertificates: {
      type: 'boolean',
      default: true,
      description: 'Validate SSL/TLS certificates'
    }
  },

  async execute(request: Request, context: ExecutionContext, options: RuntimeOptions, emitEvent?: (eventName: string, eventData: unknown) => Promise<void>, logger?: ILogger): Promise<ProtocolResponse> {
    const startTime = Date.now();
    const url = String(request.data.url ?? '');

    try {
      // Request configuration
      const method = String(request.data.method ?? 'GET');
      const headers: Record<string, string> = typeof request.data.headers === 'object' && request.data.headers !== null
        ? Object.fromEntries(
            Object.entries(request.data.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          )
        : {};
      const body: unknown = request.data.body;

      if (isNullOrWhitespace(url)) {
        logger?.error('HTTP request missing URL');
        throw new Error('URL is required for HTTP requests');
      }

      const httpOptions: Record<string, unknown> = (options.plugins?.http as Record<string, unknown> | null | undefined) ?? {};
      const httpTimeout = typeof httpOptions.timeout === 'number' ? httpOptions.timeout : null;
      const timeout = options.timeout?.request ?? httpTimeout ?? 60000;
      const httpFollowRedirects = typeof httpOptions.followRedirects === 'boolean' ? httpOptions.followRedirects : null;
      const followRedirects = options.followRedirects ?? httpFollowRedirects ?? true;
      const httpMaxRedirects = typeof httpOptions.maxRedirects === 'number' ? httpOptions.maxRedirects : null;
      const maxRedirects = options.maxRedirects ?? httpMaxRedirects ?? 5;
      const httpValidateCerts = typeof httpOptions.validateCertificates === 'boolean' ? httpOptions.validateCertificates : null;
      const validateCerts = options.ssl?.validateCertificates ?? httpValidateCerts ?? true;

      logger?.debug('HTTP request options resolved', {
        method,
        timeout,
        followRedirects,
        maxRedirects,
        validateCerts
      });

      // Cookie handling
      const cookieHeader = context.cookieJar.getCookieHeader(url);
      if (cookieHeader !== null) {
        headers['Cookie'] = cookieHeader;
        logger?.trace('Cookie header applied', { url });
      }

      const gotOptions: OptionsOfTextResponseBody = {
        method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
        headers: { ...headers },
        throwHttpErrors: false,
        timeout: { request: timeout },
        followRedirect: followRedirects,
        allowGetBody: true,
        https: {
          rejectUnauthorized: validateCerts,
          certificate: options.ssl?.clientCertificate?.cert,
          key: options.ssl?.clientCertificate?.key,
          passphrase: options.ssl?.clientCertificate?.passphrase,
          certificateAuthority: options.ssl?.ca
        },
        signal: context.abortSignal as AbortSignal | undefined
      };

      // Body encoding
      if (body !== undefined && body !== null && body !== '') {
        if (typeof body === 'string') {
          gotOptions.body = body;
        } else if (typeof body === 'object') {
          const bodyObj = body as BodyObject;

          if (bodyObj.mode === 'none') {
            logger?.trace('HTTP body mode set to none; skipping body');
          } else if (bodyObj.mode === 'raw' && typeof bodyObj.raw === 'string') {
            gotOptions.body = bodyObj.raw;
          } else if (bodyObj.mode === 'urlencoded' && Array.isArray(bodyObj.urlencoded)) {
            const params = new URLSearchParams();
            bodyObj.urlencoded.forEach((item: { key?: string; value?: unknown; disabled?: boolean }) => {
              if (typeof item.key === 'string' && item.value !== undefined) {
                params.append(item.key, String(item.value));
              }
            });
            gotOptions.body = params.toString();
            gotOptions.headers ??= {};
            gotOptions.headers['content-type'] = 'application/x-www-form-urlencoded';
          } else if (bodyObj.mode === 'formdata' && Array.isArray(bodyObj.formdata)) {
            gotOptions.json = bodyObj;
          } else {
            gotOptions.json = bodyObj;
          }
        }
      }

      // Proxy setup
      let proxyConfig = options.proxy;

      if ((proxyConfig?.host === undefined) && shouldBypassProxy(url) === false) {
        const envProxy = getProxyFromEnv(url);
        if (envProxy !== null) {
          proxyConfig = {
            enabled: true,
            host: envProxy.host,
            port: envProxy.port,
            auth: envProxy.auth
          };
        }
      }

      if (proxyConfig?.enabled !== false && proxyConfig?.host !== undefined && proxyConfig.host !== '') {
        const targetUrl = new URL(url);
        const explicitBypass = proxyConfig.bypass?.some(pattern => {
          return targetUrl.hostname === pattern ||
                 (pattern.startsWith('*.') && targetUrl.hostname.endsWith(pattern.slice(1)));
        }) ?? false;

        const envBypass = shouldBypassProxy(url);
        const shouldBypass = explicitBypass || envBypass;

        if (shouldBypass === false) {
          const proxyAuth = (proxyConfig.auth !== undefined && proxyConfig.auth !== null)
            ? `${encodeURIComponent(proxyConfig.auth.username)}:${encodeURIComponent(proxyConfig.auth.password)}@`
            : '';

          const fullProxyUrl = `http://${proxyAuth}${proxyConfig.host}:${proxyConfig.port}`;

          gotOptions.agent = {
            http: new HttpProxyAgent({
              keepAlive: true,
              keepAliveMsecs: 1000,
              maxSockets: 256,
              maxFreeSockets: 256,
              scheduling: 'lifo',
              proxy: fullProxyUrl
            }),
            https: new HttpsProxyAgent({
              keepAlive: true,
              keepAliveMsecs: 1000,
              maxSockets: 256,
              maxFreeSockets: 256,
              scheduling: 'lifo',
              proxy: fullProxyUrl
            })
          };
        }
      }

      // Dispatch
      logger?.debug('HTTP request dispatch', { url, method });
      const response: Response = await got(url, gotOptions);
      const duration = Date.now() - startTime;

      // Response normalization
      const normalizedHeaders: Record<string, string | string[]> = {};
      if (typeof response.headers === 'object' && response.headers !== null) {
        Object.entries(response.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            normalizedHeaders[key.toLowerCase()] = value.map(item => String(item));
          } else if (value !== undefined && value !== null) {
            normalizedHeaders[key.toLowerCase()] = String(value);
          }
        });
      }

      if (normalizedHeaders['set-cookie'] !== undefined) {
        context.cookieJar.store(normalizedHeaders['set-cookie'], url);
        logger?.trace('Cookies stored from response', { url });
      }

      logger?.debug('HTTP response received', { status: response.statusCode, duration });

      return {
        status: response.statusCode,
        statusText: (response.statusMessage !== null && response.statusMessage !== undefined && response.statusMessage.length > 0) ? response.statusMessage : '',
        headers: normalizedHeaders,
        body: String(response.body),
        duration,
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err as RequestError;

      if (error instanceof RequestError && error.name === 'AbortError') {
        logger?.warn('HTTP request aborted', { url, duration });
        return {
          status: 0,
          statusText: 'Aborted',
          body: '',
          headers: {},
          duration,
          error: 'Request aborted'
        };
      }

      if (error instanceof RequestError) {
        if (error.response !== undefined) {
          const normalizedHeaders: Record<string, string | string[]> = {};
          if (typeof error.response.headers === 'object' && error.response.headers !== null) {
            Object.entries(error.response.headers).forEach(([key, value]) => {
              if (Array.isArray(value)) {
                normalizedHeaders[key.toLowerCase()] = value.map(item => String(item));
              } else if (value !== undefined && value !== null) {
                normalizedHeaders[key.toLowerCase()] = String(value);
              }
            });
          }

          if (normalizedHeaders['set-cookie'] !== undefined) {
            context.cookieJar.store(normalizedHeaders['set-cookie'], url);
            logger?.trace('Cookies stored from error response', { url });
          }

          logger?.debug('HTTP error response received', { status: error.response.statusCode, duration });

          return {
            status: error.response.statusCode,
            statusText: (error.response.statusMessage !== null && error.response.statusMessage !== undefined && error.response.statusMessage.length > 0) ? error.response.statusMessage : '',
            headers: normalizedHeaders,
            body: String(error.response.body),
            duration,
          };
        } else {
          logger?.warn('HTTP network error', { message: error.message, duration });
          return {
            status: 0,
            statusText: 'Network Error',
            headers: {},
            body: '',
            duration,
            error: !isNullOrEmpty(error.message) ? error.message : 'Network request failed'
          };
        }
      }

      logger?.error('HTTP unexpected error', { error: err instanceof Error ? err.message : String(err), duration });
      return {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: '',
        duration,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  },

  validate(request: Request, options: RuntimeOptions): ValidationResult {
    const errors: ValidationError[] = [];

    // Check URL
    if (typeof request.data.url !== 'string' || isNullOrWhitespace(request.data.url)) {
      errors.push({
        message: 'URL is required',
        location: '',
        source: 'protocol'
      });
    }

    // Check method
    const method = (typeof request.data.method === 'string' && !isNullOrEmpty(request.data.method)) ? request.data.method.toUpperCase() : 'GET';
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(method)) {
      errors.push({
        message: `Invalid HTTP method: ${method}`,
        location: '',
        source: 'protocol'
      });
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors
      };
    }

    return { valid: true };
  }
};

export default httpPlugin;
