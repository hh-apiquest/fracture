import got, { OptionsOfTextResponseBody, Response, RequestError } from 'got';
import type { IProtocolPlugin, Request, ExecutionContext, ProtocolResponse, ValidationResult, ValidationError, RuntimeOptions, ILogger } from '@apiquest/types';

// Helper functions for string validation
function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}
function buildSummary(
  status: number,
  label: string,
  duration: number,
  outcome: 'success' | 'error',
  message?: string
): ProtocolResponse['summary'] {
  return {
    outcome,
    code: status,
    label,
    message,
    duration
  };
}

export const graphqlPlugin: IProtocolPlugin = {
  name: 'GraphQL',
  version: '1.0.0',
  description: 'GraphQL query and mutation support',
  protocols: ['graphql'],
  supportedAuthTypes: ['bearer', 'basic', 'apikey', 'oauth2'],
  strictAuthList: false,
  protocolAPIProvider(context: ExecutionContext) {
    const responseData = (context.currentResponse?.data ?? context.currentResponse ?? {}) as {
      status?: number;
      statusText?: string;
      headers?: Record<string, string | string[]>;
      body?: string;
    };

    return {
      request: {
        url: (context.currentRequest?.data.url ?? '') as string,
        method: (context.currentRequest?.data.method ?? '') as string,
        headers: {
          toObject() {
            return (context.currentRequest?.data.headers ?? {}) as Record<string, string>;
          }
        }
      },
      response: {
        status: responseData.status ?? 0,
        statusText: responseData.statusText ?? '',
        headers: {
          get(name: string) {
            if (responseData.headers === null || responseData.headers === undefined) return null;
            const lowerName = name.toLowerCase();
            for (const [key, value] of Object.entries(responseData.headers)) {
              if (key.toLowerCase() === lowerName) {
                return value;
              }
            }
            return null;
          },
          has(name: string) {
            if (responseData.headers === null || responseData.headers === undefined) return false;
            const lowerName = name.toLowerCase();
            for (const key of Object.keys(responseData.headers)) {
              if (key.toLowerCase() === lowerName) {
                return true;
              }
            }
            return false;
          },
          toObject() {
            return responseData.headers ?? {};
          }
        },
        body: responseData.body ?? '',
        text() {
          return responseData.body ?? '';
        },
        json() {
          try {
            return JSON.parse(responseData.body ?? '{}') as unknown;
          } catch {
            return {};
          }
        }
      }
    };
  },
  dataSchema: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'GraphQL endpoint URL'
      },
      query: {
        type: 'string',
        description: 'GraphQL query'
      },
      mutation: {
        type: 'string',
        description: 'GraphQL mutation'
      },
      variables: {
        type: 'object',
        description: 'GraphQL variables'
      },
      operationName: {
        type: 'string',
        description: 'Operation name (for multi-operation documents)'
      },
      headers: {
        type: 'object',
        description: 'Custom HTTP headers',
        additionalProperties: { type: 'string' }
      }
    }
  },

  // Options schema for runtime configuration
  optionsSchema: {
    timeout: {
      type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds'
    },
    validateCertificates: {
      type: 'boolean',
      default: true,
      description: 'Validate SSL/TLS certificates'
    }
  },

  validate(request: Request, options: RuntimeOptions): ValidationResult {
    const errors: ValidationError[] = [];

    // Check URL
    if (typeof request.data.url !== 'string' || isNullOrWhitespace(request.data.url)) {
      errors.push({
        message: 'GraphQL endpoint URL is required',
        location: '',
        source: 'protocol'
      });
    }

    // Check that either query or mutation is present
    const hasQuery = typeof request.data.query === 'string' && !isNullOrEmpty(request.data.query);
    const hasMutation = typeof request.data.mutation === 'string' && !isNullOrEmpty(request.data.mutation);

    if (!hasQuery && !hasMutation) {
      errors.push({
        message: 'Either query or mutation is required',
        location: '',
        source: 'protocol'
      });
    }

    if (hasQuery && hasMutation) {
      errors.push({
        message: 'Cannot have both query and mutation - use one or the other',
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
  },

  async execute(
    request: Request,
    context: ExecutionContext,
    options: RuntimeOptions,
    emitEvent?: (eventName: string, eventData: unknown) => Promise<void>,
    logger?: ILogger
  ): Promise<ProtocolResponse> {
    const startTime = Date.now();
    const url = String(request.data.url ?? '');

    try {
      if (isNullOrWhitespace(url)) {
        logger?.error('GraphQL request missing URL');
        throw new Error('GraphQL endpoint URL is required');
      }

      // Request configuration
      const operation = request.data.query ?? request.data.mutation;

      const graphqlBody: {
        query: string;
        variables?: Record<string, unknown>;
        operationName?: string;
      } = {
        query: String(operation),
      };

      if (request.data.variables !== undefined && request.data.variables !== null) {
        graphqlBody.variables = request.data.variables as Record<string, unknown>;
      }

      if (request.data.operationName !== undefined && request.data.operationName !== null) {
        graphqlBody.operationName = String(request.data.operationName);
      }

      // Headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (typeof request.data.headers === 'object' && request.data.headers !== null) {
        Object.entries(request.data.headers as Record<string, unknown>).forEach(([key, value]) => {
          headers[key] = String(value);
        });
      }

      const graphqlOptions: Record<string, unknown> = (options.plugins?.graphql as Record<string, unknown> | null | undefined) ?? {};
      const graphqlTimeout = typeof graphqlOptions.timeout === 'number' ? graphqlOptions.timeout : null;
      const timeout = options.timeout?.request ?? graphqlTimeout ?? 60000;
      const graphqlValidateCerts = typeof graphqlOptions.validateCertificates === 'boolean' ? graphqlOptions.validateCertificates : null;
      const validateCerts = options.ssl?.validateCertificates ?? graphqlValidateCerts ?? true;

      logger?.debug('GraphQL request options resolved', { timeout, validateCerts });

      // Cookie handling
      const cookieHeader = context.cookieJar.getCookieHeader(url);
      if (cookieHeader !== null) {
        headers['Cookie'] = cookieHeader;
        logger?.trace('Cookie header applied', { url });
      }

      const gotOptions: OptionsOfTextResponseBody = {
        method: 'POST',
        headers: { ...headers },
        json: graphqlBody,
        throwHttpErrors: false,
        timeout: { request: timeout },
        followRedirect: true,
        https: {
          rejectUnauthorized: validateCerts
        }
      };

      // Dispatch
      logger?.debug('GraphQL request dispatch', { url });
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

      let errorMsg: string | undefined = undefined;
      try {
        const responseData = JSON.parse(String(response.body)) as { errors?: Array<{ message: string }> };
        if (responseData?.errors !== undefined && responseData.errors !== null && responseData.errors.length > 0) {
          errorMsg = `GraphQL errors: ${responseData.errors.map((e: { message: string }) => e.message).join(', ')}`;
        }
      } catch (parseError) {
        logger?.trace('GraphQL response body not JSON');
      }

      logger?.debug('GraphQL response received', { status: response.statusCode, duration });

      const statusText = (response.statusMessage !== null && response.statusMessage !== undefined && response.statusMessage.length > 0) ? response.statusMessage : '';
      return {
        data: {
          status: response.statusCode,
          statusText,
          headers: normalizedHeaders,
          body: String(response.body)
        },
        summary: buildSummary(
          response.statusCode,
          statusText,
          duration,
          'success',
          errorMsg
        )
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err as RequestError;

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

          let errorResponseMsg: string | undefined = undefined;
          try {
            const responseData = JSON.parse(String(error.response.body)) as { errors?: Array<{ message: string }> };
            if (responseData?.errors !== undefined && responseData.errors !== null && responseData.errors.length > 0) {
              errorResponseMsg = `GraphQL errors: ${responseData.errors.map((e: { message: string }) => e.message).join(', ')}`;
            }
          } catch (parseError) {
            logger?.trace('GraphQL error response body not JSON');
          }

          logger?.debug('GraphQL error response received', { status: error.response.statusCode, duration });

          const statusText = (error.response.statusMessage !== null && error.response.statusMessage !== undefined && error.response.statusMessage.length > 0) ? error.response.statusMessage : '';
          return {
            data: {
              status: error.response.statusCode,
              statusText,
              headers: normalizedHeaders,
              body: String(error.response.body)
            },
            summary: buildSummary(
              error.response.statusCode,
              statusText,
              duration,
              'error',
              errorResponseMsg
            )
          };
        } else {
          logger?.warn('GraphQL network error', { message: error.message, duration });
          const message = !isNullOrEmpty(error.message) ? error.message : 'Network request failed';
          return {
            data: {
              status: 0,
              statusText: 'Network Error',
              headers: {},
              body: ''
            },
            summary: buildSummary(0, 'Network Error', duration, 'error', message)
          };
        }
      }

      logger?.error('GraphQL unexpected error', { error: err instanceof Error ? err.message : String(err), duration });
      const message = err instanceof Error ? err.message : String(err);
      return {
        data: {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: ''
        },
        summary: buildSummary(0, 'Error', duration, 'error', message)
      };
    }
  },
};

export default graphqlPlugin;
