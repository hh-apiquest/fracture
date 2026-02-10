import { describe, test, expect } from 'vitest';
import { bearerAuth } from '../src/index.js';
import type { Request, Auth, RuntimeOptions } from '@apiquest/types';

describe('Bearer Auth Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(bearerAuth.name).toBe('Bearer Token');
      expect(bearerAuth.version).toBe('1.0.0');
      expect(bearerAuth.description).toBe('Bearer token authentication (Authorization: Bearer <token>)');
    });

    test('should declare bearer auth type', () => {
      expect(bearerAuth.authTypes).toContain('bearer');
      expect(bearerAuth.authTypes).toHaveLength(1);
    });

    test('should support http, graphql, and grpc protocols', () => {
      expect(bearerAuth.protocols).toContain('http');
      expect(bearerAuth.protocols).toContain('graphql');
      expect(bearerAuth.protocols).toContain('grpc');
    });

    test('should have data schema', () => {
      expect(bearerAuth.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(bearerAuth.dataSchema.properties.token).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation with valid token', () => {
      const auth: Auth = {
        type: 'bearer',
        data: {
          token: 'my-test-token-123'
        }
      };

      const result = bearerAuth.validate(auth, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation without token', () => {
      const auth: Auth = {
        type: 'bearer',
        data: {}
      };

      const result = bearerAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Bearer token is required');
    });

    test('should fail validation with null token', () => {
      const auth: Auth = {
        type: 'bearer',
        data: {
          token: null
        }
      };

      const result = bearerAuth.validate(auth, {});
      expect(result.valid).toBe(false);
    });
  });

  describe('Apply', () => {
    test('should add Authorization header with Bearer token', async () => {
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
        type: 'bearer',
        data: {
          token: 'my-secret-token-abc123'
        }
      };

      const modifiedRequest = await bearerAuth.apply(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-secret-token-abc123');
    });

    test('should not overwrite existing Authorization header', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
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
        type: 'bearer',
        data: {
          token: 'new-token'
        }
      };

      const modifiedRequest = await bearerAuth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer existing-token');
    });

    test('should throw error when token is missing', async () => {
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
        type: 'bearer',
        data: {}
      };

      await expect(
        bearerAuth.apply(request, auth, {})
      ).rejects.toThrow('Bearer token is required');
    });

    test('should create headers object if it does not exist', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-4',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
          // No headers property
        }
      };

      const auth: Auth = {
        type: 'bearer',
        data: {
          token: 'test-token'
        }
      };

      const modifiedRequest = await bearerAuth.apply(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });

    test('should preserve existing headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users',
          headers: {
            'Content-Type': 'application/json',
            'X-Custom': 'value'
          }
        }
      };

      const auth: Auth = {
        type: 'bearer',
        data: {
          token: 'test-token'
        }
      };

      const modifiedRequest = await bearerAuth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Custom']).toBe('value');
      expect(headers['Authorization']).toBe('Bearer test-token');
    });
  });
});
