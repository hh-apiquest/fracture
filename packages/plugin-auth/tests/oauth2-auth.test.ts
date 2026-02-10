import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { oauth2Auth } from '../src/index.js';
import type { Request, Auth } from '@apiquest/types';
import http from 'http';

// Simple mock OAuth2 server
class MockOAuth2Server {
  private server: http.Server | null = null;
  private port = 0;
  public requests: Array<{ headers: http.IncomingHttpHeaders; body: string; url: string }> = [];

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          this.requests.push({
            headers: req.headers,
            body,
            url: req.url ?? '/'
          });

          // Always return a successful token response
          res.write(JSON.stringify({
            access_token: 'mock-access-token-123',
            token_type: 'Bearer',
            expires_in: 3600
          }));
          res.end();
        });
      });

      this.server.listen(0, 'localhost', () => {
        const address = this.server?.address();
        if (address !== null && typeof address === 'object') {
          this.port = address.port;
          resolve(`http://localhost:${this.port}/token`);
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

  reset(): void {
    this.requests = [];
  }
}

describe('OAuth2 Auth Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(oauth2Auth.name).toBe('OAuth 2.0');
      expect(oauth2Auth.version).toBe('1.0.0');
      expect(oauth2Auth.description).toBe('OAuth 2.0 authentication (multiple grant types supported)');
    });

    test('should declare oauth2 auth type', () => {
      expect(oauth2Auth.authTypes).toContain('oauth2');
      expect(oauth2Auth.authTypes).toHaveLength(1);
    });

    test('should support http, graphql, and grpc protocols', () => {
      expect(oauth2Auth.protocols).toContain('http');
      expect(oauth2Auth.protocols).toContain('graphql');
      expect(oauth2Auth.protocols).toContain('grpc');
    });

    test('should have data schema', () => {
      expect(oauth2Auth.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(oauth2Auth.dataSchema.properties.grantType).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(oauth2Auth.dataSchema.properties.accessTokenUrl).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(oauth2Auth.dataSchema.properties.clientId).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(oauth2Auth.dataSchema.properties.clientSecret).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation with required fields', () => {
      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: 'https://auth.example.com/token',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret'
        }
      };

      const result = oauth2Auth.validate(auth, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation without accessTokenUrl', () => {
      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret'
        }
      };

      const result = oauth2Auth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.includes('accessTokenUrl'))).toBe(true);
    });

    test('should fail validation without clientId', () => {
      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: 'https://auth.example.com/token',
          clientSecret: 'test-client-secret'
        }
      };

      const result = oauth2Auth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.includes('clientId'))).toBe(true);
    });

    test('should fail validation without clientSecret', () => {
      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: 'https://auth.example.com/token',
          clientId: 'test-client-id'
        }
      };

      const result = oauth2Auth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.includes('clientSecret'))).toBe(true);
    });
  });

  describe('Apply - Client Credentials', () => {
    let server: MockOAuth2Server;
    let tokenUrl: string;

    beforeEach(async () => {
      server = new MockOAuth2Server();
      tokenUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('should fetch token and add Authorization header', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-1',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      };

      const modifiedRequest = await oauth2Auth.apply(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer mock-access-token-123');
    });

    test('should send client credentials in body by default', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      };

      await oauth2Auth.apply(request, auth, {});

      expect(server.requests).toHaveLength(1);
      const tokenRequest = server.requests[0];
      const params = new URLSearchParams(tokenRequest.body);
      
      expect(params.get('grant_type')).toBe('client_credentials');
      expect(params.get('client_id')).toBe('test-client');
      expect(params.get('client_secret')).toBe('test-secret');
      expect(tokenRequest.headers.authorization).toBeUndefined();
    });

    test('should send client credentials in Basic Auth header', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          clientAuthentication: 'basic'
        }
      };

      await oauth2Auth.apply(request, auth, {});

      expect(server.requests).toHaveLength(1);
      const tokenRequest = server.requests[0];
      const params = new URLSearchParams(tokenRequest.body);
      
      expect(params.get('client_id')).toBeNull();
      expect(params.get('client_secret')).toBeNull();
      expect(tokenRequest.headers.authorization).toBeDefined();
      expect(tokenRequest.headers.authorization).toMatch(/^Basic /);
    });

    test('should send client credentials in custom headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-4',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          clientAuthentication: 'header',
          clientIdField: 'X-Client-Id',
          clientSecretField: 'X-Client-Secret'
        }
      };

      await oauth2Auth.apply(request, auth, {});

      expect(server.requests).toHaveLength(1);
      const tokenRequest = server.requests[0];
      
      expect(tokenRequest.headers['x-client-id']).toBe('test-client');
      expect(tokenRequest.headers['x-client-secret']).toBe('test-secret');
    });

    test('should send client credentials in query parameters', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          clientAuthentication: 'query'
        }
      };

      await oauth2Auth.apply(request, auth, {});

      expect(server.requests).toHaveLength(1);
      const tokenRequest = server.requests[0];
      const url = new URL(`http://localhost${tokenRequest.url}`);
      
      expect(url.searchParams.get('client_id')).toBe('test-client');
      expect(url.searchParams.get('client_secret')).toBe('test-secret');
    });

    test('should not overwrite existing Authorization header', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {
            'Authorization': 'Bearer existing-token'
          }
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      };

      const modifiedRequest = await oauth2Auth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer existing-token');
      // Should not have made a token request
      expect(server.requests).toHaveLength(0);
    });

    test('should include scope in token request', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-7',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          scope: 'read:users write:users'
        }
      };

      await oauth2Auth.apply(request, auth, {});

      const tokenRequest = server.requests[0];
      const params = new URLSearchParams(tokenRequest.body);
      expect(params.get('scope')).toBe('read:users write:users');
    });

    test('should include extra body parameters', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-8',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          extraBody: {
            audience: 'https://api.example.com',
            resource: 'users'
          }
        }
      };

      await oauth2Auth.apply(request, auth, {});

      const tokenRequest = server.requests[0];
      const params = new URLSearchParams(tokenRequest.body);
      expect(params.get('audience')).toBe('https://api.example.com');
      expect(params.get('resource')).toBe('users');
    });

    test('should include extra headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-9',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: tokenUrl,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          extraHeaders: {
            'X-Trace-Id': 'trace-123',
            'X-Request-Id': 'req-456'
          }
        }
      };

      await oauth2Auth.apply(request, auth, {});

      const tokenRequest = server.requests[0];
      expect(tokenRequest.headers['x-trace-id']).toBe('trace-123');
      expect(tokenRequest.headers['x-request-id']).toBe('req-456');
    });
  });

  describe('Error Handling', () => {
    test('should throw error when accessTokenUrl is missing', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-10',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          clientId: 'test-client',
          clientSecret: 'test-secret'
        }
      };

      await expect(
        oauth2Auth.apply(request, auth, {})
      ).rejects.toThrow();
    });

    test('should throw error when clientId is missing', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-11',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: 'https://auth.example.com/token',
          clientSecret: 'test-secret'
        }
      };

      await expect(
        oauth2Auth.apply(request, auth, {})
      ).rejects.toThrow();
    });

    test('should throw error when clientSecret is missing', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-12',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'oauth2',
        data: {
          grantType: 'client_credentials',
          accessTokenUrl: 'https://auth.example.com/token',
          clientId: 'test-client'
        }
      };

      await expect(
        oauth2Auth.apply(request, auth, {})
      ).rejects.toThrow();
    });
  });
});
