// API Key Authentication
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger } from '@apiquest/types';

export const apiKeyAuth: IAuthPlugin = {
  name: 'API Key',
  version: '1.0.0',
  description: 'API Key authentication (via header or query parameter)',
  authTypes: ['apikey'],
  protocols: ['http', 'graphql', 'grpc'],
  dataSchema: {
    type: 'object',
    required: ['key', 'value'],
    properties: {
      key: {
        type: 'string',
        description: 'API key name'
      },
      value: {
        type: 'string',
        description: 'API key value'
      },
      in: {
        type: 'string',
        enum: ['header', 'query'],
        default: 'header',
        description: 'Where to add the API key'
      }
    }
  },
  
  validate(auth: Auth, options: RuntimeOptions): ValidationResult {
    const errors = [];
    if ((auth.data?.key ?? null) === null) {
      errors.push({
        message: 'API key name is required',
        location: '',
        source: 'auth' as const
      });
    }
    if ((auth.data?.value ?? null) === null) {
      errors.push({
        message: 'API key value is required',
        location: '',
        source: 'auth' as const
      });
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  },
  
  async apply(request: Request, auth: Auth, options: RuntimeOptions, logger?: ILogger): Promise<Request> {
    const key = auth.data?.key as string | undefined;
    const value = auth.data?.value as string | undefined;
    const rawLocation = auth.data?.in as string | undefined;
    const location = rawLocation ?? 'header';

    logger?.debug('API key auth apply started', { location });

    if (key === undefined || value === undefined) {
      logger?.error('API key auth missing key or value');
      throw new Error('API key and value are required');
    }

    if (location === 'header') {
      request.data.headers ??= {};
      (request.data.headers as Record<string, string>)[key] = value;
      logger?.trace('API key applied to headers', { header: key });
    } else if (location === 'query') {
      const url = new URL(request.data.url as string);
      url.searchParams.set(key, value);
      request.data.url = url.toString();
      logger?.trace('API key applied to query string', { key });
    } else {
      logger?.error('Invalid API key location', { location });
      throw new Error(`Invalid API key location: ${location}. Must be 'header' or 'query'`);
    }

    return request;
  }
};
