import { describe, test, expect } from 'vitest';
import { apiKeyAuth } from '../src/index.js';
import type { Request, Auth } from '@apiquest/types';

describe('API Key Auth Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(apiKeyAuth.name).toBe('API Key');
      expect(apiKeyAuth.version).toBe('1.0.0');
      expect(apiKeyAuth.description).toBe('API Key authentication (via header or query parameter)');
    });

    test('should declare apikey auth type', () => {
      expect(apiKeyAuth.authTypes).toContain('apikey');
      expect(apiKeyAuth.authTypes).toHaveLength(1);
    });

    test('should support http, graphql, and grpc protocols', () => {
      expect(apiKeyAuth.protocols).toContain('http');
      expect(apiKeyAuth.protocols).toContain('graphql');
      expect(apiKeyAuth.protocols).toContain('grpc');
    });

    test('should have data schema', () => {
      expect(apiKeyAuth.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(apiKeyAuth.dataSchema.properties.key).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(apiKeyAuth.dataSchema.properties.value).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(apiKeyAuth.dataSchema.properties.in).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation with valid key and value', () => {
      const auth: Auth = {
        type: 'apikey',
        data: {
          key: 'X-API-Key',
          value: 'test-api-key-123',
          in: 'header'
        }
      };

      const result = apiKeyAuth.validate(auth, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation without key', () => {
      const auth: Auth = {
        type: 'apikey',
        data: {
          value: 'test-value',
          in: 'header'
        }
      };

      const result = apiKeyAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('API key name is required');
    });

    test('should fail validation without value', () => {
      const auth: Auth = {
        type: 'apikey',
        data: {
          key: 'X-API-Key',
          in: 'header'
        }
      };

      const result = apiKeyAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('API key value is required');
    });

    test('should fail validation without both key and value', () => {
      const auth: Auth = {
        type: 'apikey',
        data: {
          in: 'header'
        }
      };

      const result = apiKeyAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Apply - Header', () => {
    test('should add API key to header', async () => {
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
        type: 'apikey',
        data: {
          key: 'X-API-Key',
          value: 'my-api-key-123',
          in: 'header'
        }
      };

      const modifiedRequest = await apiKeyAuth.apply(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('my-api-key-123');
    });

    test('should default to header placement when "in" is not specified', async () => {
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
        type: 'apikey',
        data: {
          key: 'X-Custom-Key',
          value: 'custom-value'
          // No "in" specified
        }
      };

      const modifiedRequest = await apiKeyAuth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Custom-Key']).toBe('custom-value');
    });

    test('should preserve existing headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {
            'Content-Type': 'application/json',
            'X-Custom': 'existing'
          }
        }
      };

      const auth: Auth = {
        type: 'apikey',
        data: {
          key: 'X-API-Key',
          value: 'api-value',
          in: 'header'
        }
      };

      const modifiedRequest = await apiKeyAuth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Custom']).toBe('existing');
      expect(headers['X-API-Key']).toBe('api-value');
    });
  });

  describe('Apply - Query', () => {
    test('should add API key to query parameter', async () => {
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
        type: 'apikey',
        data: {
          key: 'apikey',
          value: 'my-query-key-456',
          in: 'query'
        }
      };

      const modifiedRequest = await apiKeyAuth.apply(request, auth, {});

      expect(modifiedRequest.data.url).toBe('https://api.example.com/users?apikey=my-query-key-456');
    });

    test('should preserve existing query parameters', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users?page=1&limit=10'
        }
      };

      const auth: Auth = {
        type: 'apikey',
        data: {
          key: 'apikey',
          value: 'test-key',
          in: 'query'
        }
      };

      const modifiedRequest = await apiKeyAuth.apply(request, auth, {});

      const url = new URL(modifiedRequest.data.url as string);
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('apikey')).toBe('test-key');
    });

    test('should URL-encode special characters in query value', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const auth: Auth = {
        type: 'apikey',
        data: {
          key: 'token',
          value: 'key+with/special=chars',
          in: 'query'
        }
      };

      const modifiedRequest = await apiKeyAuth.apply(request, auth, {});

      const url = new URL(modifiedRequest.data.url as string);
      expect(url.searchParams.get('token')).toBe('key+with/special=chars');
    });
  });

  describe('Error Handling', () => {
    test('should throw error when key is missing', async () => {
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
        type: 'apikey',
        data: {
          value: 'test-value',
          in: 'header'
        }
      };

      await expect(
        apiKeyAuth.apply(request, auth, {})
      ).rejects.toThrow('API key and value are required');
    });

    test('should throw error when value is missing', async () => {
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
        type: 'apikey',
        data: {
          key: 'X-API-Key',
          in: 'header'
        }
      };

      await expect(
        apiKeyAuth.apply(request, auth, {})
      ).rejects.toThrow('API key and value are required');
    });

    test('should throw error for invalid location', async () => {
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
        type: 'apikey',
        data: {
          key: 'X-API-Key',
          value: 'test-value',
          in: 'invalid-location'
        }
      };

      await expect(
        apiKeyAuth.apply(request, auth, {})
      ).rejects.toThrow('Invalid API key location');
    });
  });
});
