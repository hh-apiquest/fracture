import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { graphqlPlugin } from '../src/index.js';
import type { Request, ExecutionContext, RuntimeOptions, ICookieJar, CookieSetOptions } from '@apiquest/types';
import http from 'http';

// Simple cookie jar implementation for testing
class TestCookieJar implements ICookieJar {
  get(_name: string, _domain?: string, _path?: string): string | null {
    return null;
  }
  set(_name: string, _value: string, _options: CookieSetOptions): void {
    // noop
  }
  has(_name: string, _domain?: string, _path?: string): boolean {
    return false;
  }
  remove(_name: string, _domain?: string, _path?: string): void {
    // noop
  }
  clear(): void {
    // noop
  }
  toObject(): Record<string, string> {
    return {};
  }
  getCookieHeader(_url: string): string | null {
    return null;
  }
  store(_setCookieHeaders: string | string[] | null | undefined, _requestUrl: string): void {
    // noop
  }
}

// Mock execution context
function createMockContext(): ExecutionContext {
  return {
    collectionInfo: {
      id: 'test-collection',
      name: 'Test Collection'
    },
    protocol: 'graphql',
    collectionVariables: {},
    globalVariables: {},
    scopeStack: [],
    iterationCurrent: 0,
    iterationCount: 1,
    iterationSource: 'none',
    executionHistory: [],
    options: {},
    cookieJar: new TestCookieJar(),
    protocolPlugin: graphqlPlugin
  };
}

const parseResponseBody = <T,>(body: unknown): T => {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return JSON.parse(rawBody) as T;
};

// Simple mock GraphQL server for testing
class TestGraphQLServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url ?? '/';

        // Helper to read body
        const readBody = (callback: (body: string) => void): void => {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => { callback(body); });
        };

        // Only POST requests allowed for GraphQL
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ errors: [{ message: 'Method not allowed' }] }));
          return;
        }

        // /graphql - GraphQL endpoint
        if (url === '/graphql') {
          readBody((body) => {
            try {
              const graphqlRequest = JSON.parse(body) as {
                query?: string;
                variables?: Record<string, unknown>;
                operationName?: string;
              };

              // Basic query parsing to determine what to return
              const query = graphqlRequest.query ?? '';

              // Handle hello query
              if (query.includes('hello')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  data: {
                    hello: 'Hello, World!'
                  }
                }));
                return;
              }

              // Handle user query with variables
              if (query.includes('user') && query.includes('$id')) {
                const userId = graphqlRequest.variables?.id;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  data: {
                    user: {
                      id: userId,
                      name: 'Test User',
                      email: 'test@example.com'
                    }
                  }
                }));
                return;
              }

              // Handle createUser mutation
              if (query.includes('createUser')) {
                const name = graphqlRequest.variables?.name;
                const email = graphqlRequest.variables?.email;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  data: {
                    createUser: {
                      id: '123',
                      name,
                      email
                    }
                  }
                }));
                return;
              }

              // Handle error test query
              if (query.includes('errorTest')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  data: null,
                  errors: [
                    { message: 'Test error 1' },
                    { message: 'Test error 2' }
                  ]
                }));
                return;
              }

              // Handle invalid syntax test
              if (query.includes('invalidSyntax')) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  errors: [{
                    message: 'Syntax Error: Unexpected token'
                  }]
                }));
                return;
              }

              // Default: unknown query
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                data: null,
                errors: [{ message: 'Unknown query' }]
              }));
            } catch (parseError) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                errors: [{ message: 'Invalid JSON' }]
              }));
            }
          });
          return;
        }

        // 404 fallback
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: 'Not found' }] }));
      });

      this.server.listen(0, 'localhost', () => {
        const address = this.server?.address();
        if (address !== null && typeof address === 'object') {
          this.port = address.port;
          resolve(`http://localhost:${this.port}`);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server !== null) {
        this.server.close((err) => {
          if (err !== null && err !== undefined) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

describe('GraphQL Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(graphqlPlugin.name).toBe('GraphQL');
      expect(graphqlPlugin.version).toBe('1.0.0');
      expect(graphqlPlugin.description).toBe('GraphQL query and mutation support');
    });

    test('should declare graphql protocol', () => {
      expect(graphqlPlugin.protocols).toContain('graphql');
      expect(graphqlPlugin.protocols).toHaveLength(1);
    });

    test('should declare supported auth types', () => {
      expect(graphqlPlugin.supportedAuthTypes).toContain('bearer');
      expect(graphqlPlugin.supportedAuthTypes).toContain('basic');
      expect(graphqlPlugin.supportedAuthTypes).toContain('oauth2');
      expect(graphqlPlugin.supportedAuthTypes).toContain('apikey');
    });

    test('should not use strict auth list', () => {
      expect(graphqlPlugin.strictAuthList).toBe(false);
    });

    test('should have data schema', () => {
      expect(graphqlPlugin.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(graphqlPlugin.dataSchema.properties.url).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(graphqlPlugin.dataSchema.properties.query).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(graphqlPlugin.dataSchema.properties.mutation).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(graphqlPlugin.dataSchema.properties.variables).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(graphqlPlugin.dataSchema.properties.operationName).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(graphqlPlugin.dataSchema.properties.headers).toBeDefined();
    });

    test('should have options schema', () => {
      expect(graphqlPlugin.optionsSchema).toBeDefined();
      expect(graphqlPlugin.optionsSchema?.timeout).toBeDefined();
      expect(graphqlPlugin.optionsSchema?.validateCertificates).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation for valid query', () => {
      const request: Request = {
        type: 'request',
        id: 'test-1',
        name: 'Test Request',
        data: {
          url: 'https://api.example.com/graphql',
          query: '{ hello }'
        }
      };

      const result = graphqlPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should pass validation for valid mutation', () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
        name: 'Test Request',
        data: {
          url: 'https://api.example.com/graphql',
          mutation: 'mutation { createUser(name: "Test") { id } }'
        }
      };

      const result = graphqlPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation for missing URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
        name: 'Test Request',
        data: {
          query: '{ hello }'
        }
      };

      const result = graphqlPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('URL is required');
    });

    test('should fail validation for empty URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-4',
        name: 'Test Request',
        data: {
          url: '   ',
          query: '{ hello }'
        }
      };

      const result = graphqlPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should fail validation for missing query and mutation', () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          url: 'https://api.example.com/graphql'
        }
      };

      const result = graphqlPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Either query or mutation is required');
    });

    test('should fail validation for both query and mutation', () => {
      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          url: 'https://api.example.com/graphql',
          query: '{ hello }',
          mutation: 'mutation { createUser { id } }'
        }
      };

      const result = graphqlPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Cannot have both query and mutation');
    });
  });

  describe('Request Execution', () => {
    let server: TestGraphQLServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestGraphQLServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('should execute simple query', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-7',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          query: '{ hello }'
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      const responseData = JSON.parse(response.body as string) as { data: { hello: string } };
      expect(responseData.data.hello).toBe('Hello, World!');
    });

    test('should execute query with variables', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-8',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          query: 'query GetUser($id: ID!) { user(id: $id) { id name email } }',
          variables: {
            id: '123'
          }
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      const responseData = parseResponseBody<{ data: { user: { id: string; name: string; email: string } } }>(response.body);
      expect(responseData.data.user.id).toBe('123');
      expect(responseData.data.user.name).toBe('Test User');
    });

    test('should execute mutation', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-9',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          mutation: 'mutation CreateUser($name: String!, $email: String!) { createUser(name: $name, email: $email) { id name email } }',
          variables: {
            name: 'New User',
            email: 'new@example.com'
          }
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      const responseData = parseResponseBody<{ data: { createUser: { id: string; name: string; email: string } } }>(response.body);
      expect(responseData.data.createUser.name).toBe('New User');
      expect(responseData.data.createUser.email).toBe('new@example.com');
    });

    test('should handle custom headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-10',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          query: '{ hello }',
          headers: {
            'Authorization': 'Bearer test-token',
            'X-Custom-Header': 'custom-value'
          }
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
    });

    test('should handle GraphQL errors in response', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-11',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          query: '{ errorTest }'
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Test error 1');
      expect(response.error).toContain('Test error 2');
    });

    test('should handle HTTP error status', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-12',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          query: '{ invalidSyntax }'
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(400);
    });

    test('should handle network errors', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-13',
        name: 'Test Request',
        data: {
          url: 'http://invalid-domain-that-does-not-exist-12345.com/graphql',
          query: '{ hello }'
        }
      };

      const context = createMockContext();
      const options: RuntimeOptions = {
        timeout: { request: 1000 }
      };

      const response = await graphqlPlugin.execute(request, context, options);
      
      expect(response.status).toBe(0);
      expect(response.statusText).toBe('Network Error');
      expect(response.error).toBeDefined();
    });

    test('should handle missing URL error', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-14',
        name: 'Test Request',
        data: {
          url: '',
          query: '{ hello }'
        }
      };

      const context = createMockContext();
      
      const response = await graphqlPlugin.execute(request, context, {});
      expect(response.status).toBe(0);
      expect(response.statusText).toBe('Error');
      expect(response.error).toContain('URL is required');
    });

    test('should handle operation name', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-15',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/graphql`,
          query: 'query HelloQuery { hello }',
          operationName: 'HelloQuery'
        }
      };

      const context = createMockContext();
      const response = await graphqlPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
    });
  });
});
