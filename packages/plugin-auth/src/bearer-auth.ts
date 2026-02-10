// Bearer Token Authentication
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger } from '@apiquest/types';

export const bearerAuth: IAuthPlugin = {
  name: 'Bearer Token',
  version: '1.0.0',
  description: 'Bearer token authentication (Authorization: Bearer <token>)',
  authTypes: ['bearer'],
  protocols: ['http', 'graphql', 'grpc'],
  dataSchema: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        description: 'Bearer token value'
      }
    }
  },
  
  validate(auth: Auth, options: RuntimeOptions): ValidationResult {
    if ((auth.data?.token ?? null) === null) {
      return {
        valid: false,
        errors: [{
          message: 'Bearer token is required',
          location: '',
          source: 'auth'
        }]
      };
    }
    return { valid: true };
  },
  
  async apply(request: Request, auth: Auth, options: RuntimeOptions, logger?: ILogger): Promise<Request> {
    if ((request.data.headers as Record<string, unknown> | null | undefined)?.['Authorization'] !== undefined) {
      logger?.trace('Authorization header already present, skipping bearer auth apply');
      return request;
    }

    const token = auth.data?.token as string | undefined;

    if (token === undefined) {
      logger?.error('Bearer auth missing token');
      throw new Error('Bearer token is required');
    }

    request.data.headers ??= {};
    (request.data.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    logger?.debug('Bearer auth header applied');

    return request;
  }
};
