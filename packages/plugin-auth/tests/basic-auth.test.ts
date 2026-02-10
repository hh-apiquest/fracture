import { describe, test, expect } from 'vitest';
import { basicAuth } from '../src/index.js';
import type { Request, Auth } from '@apiquest/types';

describe('Basic Auth Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(basicAuth.name).toBe('Basic Authentication');
      expect(basicAuth.version).toBe('1.0.0');
      expect(basicAuth.description).toBe('HTTP Basic authentication (Authorization: Basic base64(username:password))');
    });

    test('should declare basic auth type', () => {
      expect(basicAuth.authTypes).toContain('basic');
      expect(basicAuth.authTypes).toHaveLength(1);
    });

    test('should support http, graphql, and grpc protocols', () => {
      expect(basicAuth.protocols).toContain('http');
      expect(basicAuth.protocols).toContain('graphql');
      expect(basicAuth.protocols).toContain('grpc');
    });

    test('should have data schema', () => {
      expect(basicAuth.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(basicAuth.dataSchema.properties.username).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(basicAuth.dataSchema.properties.password).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation with valid username and password', () => {
      const auth: Auth = {
        type: 'basic',
        data: {
          username: 'testuser',
          password: 'testpass'
        }
      };

      const result = basicAuth.validate(auth, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation without username', () => {
      const auth: Auth = {
        type: 'basic',
        data: {
          password: 'testpass'
        }
      };

      const result = basicAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Username is required');
    });

    test('should fail validation without password', () => {
      const auth: Auth = {
        type: 'basic',
        data: {
          username: 'testuser'
        }
      };

      const result = basicAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Password is required');
    });

    test('should fail validation without both username and password', () => {
      const auth: Auth = {
        type: 'basic',
        data: {}
      };

      const result = basicAuth.validate(auth, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Apply', () => {
    test('should add Authorization header with Basic auth', async () => {
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
        type: 'basic',
        data: {
          username: 'testuser',
          password: 'testpass'
        }
      };

      const modifiedRequest = await basicAuth.apply(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^Basic /);
      
      // Decode and verify credentials
      const encoded = headers['Authorization'].replace('Basic ', '');
      const decoded = Buffer.from(encoded, 'base64').toString();
      expect(decoded).toBe('testuser:testpass');
    });

    test('should correctly encode special characters in credentials', async () => {
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
        type: 'basic',
        data: {
          username: 'user@example.com',
          password: 'p@ss:w0rd!'
        }
      };

      const modifiedRequest = await basicAuth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      const encoded = headers['Authorization'].replace('Basic ', '');
      const decoded = Buffer.from(encoded, 'base64').toString();
      expect(decoded).toBe('user@example.com:p@ss:w0rd!');
    });

    test('should not overwrite existing Authorization header', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
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
        type: 'basic',
        data: {
          username: 'testuser',
          password: 'testpass'
        }
      };

      const modifiedRequest = await basicAuth.apply(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer existing-token');
    });

    test('should throw error when username is missing', async () => {
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
        type: 'basic',
        data: {
          password: 'testpass'
        }
      };

      await expect(
        basicAuth.apply(request, auth, {})
      ).rejects.toThrow('Username and password are required');
    });

    test('should throw error when password is missing', async () => {
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
        type: 'basic',
        data: {
          username: 'testuser'
        }
      };

      await expect(
        basicAuth.apply(request, auth, {})
      ).rejects.toThrow('Username and password are required');
    });

    test('should create headers object if it does not exist', async () => {
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
        type: 'basic',
        data: {
          username: 'testuser',
          password: 'testpass'
        }
      };

      const modifiedRequest = await basicAuth.apply(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^Basic /);
    });
  });
});
