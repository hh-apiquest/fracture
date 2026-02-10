// Basic Authentication
import type { IAuthPlugin, Request, Auth, RuntimeOptions, ValidationResult, ILogger } from '@apiquest/types';

export const basicAuth: IAuthPlugin = {
  name: 'Basic Authentication',
  version: '1.0.0',
  description: 'HTTP Basic authentication (Authorization: Basic base64(username:password))',
  authTypes: ['basic'],
  protocols: ['http', 'graphql', 'grpc'],
  dataSchema: {
    type: 'object',
    required: ['username', 'password'],
    properties: {
      username: {
        type: 'string',
        description: 'Username'
      },
      password: {
        type: 'string',
        description: 'Password'
      }
    }
  },
  
  validate(auth: Auth, options: RuntimeOptions): ValidationResult {
    const errors = [];
    if ((auth.data?.username ?? null) === null) {
      errors.push({
        message: 'Username is required for basic auth',
        location: '',
        source: 'auth' as const
      });
    }
    if ((auth.data?.password ?? null) === null) {
      errors.push({
        message: 'Password is required for basic auth',
        location: '',
        source: 'auth' as const
      });
    }
    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  },
  
  async apply(request: Request, auth: Auth, options: RuntimeOptions, logger?: ILogger): Promise<Request> {
    if ((request.data.headers as Record<string, unknown> | null | undefined)?.['Authorization'] !== undefined) {
      logger?.trace('Authorization header already present, skipping basic auth apply');
      return request;
    }

    const username = auth.data?.username as string | undefined;
    const password = auth.data?.password as string | undefined;

    if (username === undefined || password === undefined) {
      logger?.error('Basic auth missing username or password');
      throw new Error('Username and password are required for basic auth');
    }

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    request.data.headers ??= {};
    (request.data.headers as Record<string, string>)['Authorization'] = `Basic ${credentials}`;
    logger?.debug('Basic auth header applied');

    return request;
  }
};
