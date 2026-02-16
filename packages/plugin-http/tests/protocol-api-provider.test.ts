/**
 * Tests for HTTP Plugin protocolAPIProvider
 * Tests quest.request and quest.response interfaces provided by the HTTP plugin
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { httpPlugin } from '../src/index.js';
import type { ExecutionContext, Request, ProtocolResponse } from '@apiquest/types';

// Type for HTTP response data
interface HttpResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
}

// Type for the API interface returned by protocolAPIProvider
interface HttpProtocolAPI {
  request: {
    url: string;
    method: string;
    body: {
      get(): string | null;
      set(content: string): void;
      mode: string | null;
    };
    headers: {
      get(key: string): string | null;
      add(header: { key: string; value: string }): void;
      remove(key: string): void;
      upsert(header: { key: string; value: string }): void;
      toObject(): Record<string, string>;
    };
  };
  response: {
    status: number;
    statusText: string;
    headers: {
      get(name: string): string | string[] | null;
      has(name: string): boolean;
      toObject(): Record<string, string | string[]>;
    };
    body: string;
    text(): string;
    json(): unknown;
    duration: number;
    size: number;
    to: {
      be: {
        ok: boolean;
        success: boolean;
        clientError: boolean;
        serverError: boolean;
      };
      have: {
        status(code: number): boolean;
        header(name: string): boolean;
        jsonBody(field: string): boolean;
      };
    };
  };
}

// Helper to create mock execution context
function createMockContext(request?: Request, response?: ProtocolResponse): ExecutionContext {
  return {
    collectionInfo: { id: 'test-collection', name: 'Test Collection' },
    protocol: 'http',
    collectionVariables: {},
    globalVariables: {},
    scope: {
      level: 'collection',
      id: 'test-collection',
      vars: {}
    },
    iterationCurrent: 1,
    iterationCount: 1,
    iterationSource: 'none',
    executionHistory: [],
    options: {},
    cookieJar: {
      get: () => null,
      set: () => {},
      has: () => false,
      remove: () => {},
      clear: () => {},
      toObject: () => ({}),
      getCookieHeader: () => null,
      store: () => {}
    },
    protocolPlugin: httpPlugin,
    abortSignal: new AbortController().signal,
    currentRequest: request,
    currentResponse: response
  };
}

describe('HTTP Plugin protocolAPIProvider - quest.request', () => {
  let context: ExecutionContext;
  let mockRequest: Request;

  beforeEach(() => {
    mockRequest = {
      type: 'request',
      id: 'req-456',
      name: 'Get User',
      description: 'Fetches user by ID',
      data: {
        method: 'GET',
        url: 'https://api.example.com/users/123',
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        }
      }
    };

    context = createMockContext(mockRequest);
  });

  // ========================================================================
  // HTTP request fields
  // ========================================================================

  describe('HTTP request fields', () => {
    test('api.request.url reflects configured URL', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.request.url).toBe('https://api.example.com/users/123');
    });

    test('api.request.method reflects configured method', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.request.method).toBe('GET');
    });

    test('api.request.method works for all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      
      methods.forEach(method => {
        mockRequest.data.method = method;
        const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
        expect(api.request.method).toBe(method);
      });
    });
  });

  // ========================================================================
  // quest.request.headers API
  // ========================================================================

  describe('quest.request.headers API', () => {
    test('get(name) retrieves header value', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.request.headers.get('Authorization')).toBe('Bearer token123');
      expect(api.request.headers.get('Content-Type')).toBe('application/json');
    });

    test('get(name) is case-insensitive', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.request.headers.get('authorization')).toBe('Bearer token123');
      expect(api.request.headers.get('CONTENT-TYPE')).toBe('application/json');
      expect(api.request.headers.get('Authorization')).toBe('Bearer token123');
    });

    test('get(name) returns null for missing header', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.request.headers.get('X-Missing')).toBeNull();
    });

    test('add({key,value}) adds a header', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      api.request.headers.add({ key: 'X-Custom', value: 'custom-value' });
      
      expect(api.request.headers.get('X-Custom')).toBe('custom-value');
      expect((mockRequest.data.headers as Record<string,string>)['X-Custom']).toBe('custom-value');
    });

    test('remove(name) removes header', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      api.request.headers.remove('Content-Type');
      
      expect(api.request.headers.get('Content-Type')).toBeNull();
      expect((mockRequest.data.headers as Record<string,string>)['Content-Type']).toBeUndefined();
    });

    test('upsert({key,value}) adds if missing', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      api.request.headers.upsert({ key: 'X-New', value: 'new-value' });
      
      expect(api.request.headers.get('X-New')).toBe('new-value');
    });

    test('upsert({key,value}) updates if present', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      api.request.headers.upsert({ key: 'Authorization', value: 'Bearer newtoken' });
      
      expect(api.request.headers.get('Authorization')).toBe('Bearer newtoken');
      expect((mockRequest.data.headers as Record<string,string>)['Authorization']).toBe('Bearer newtoken');
    });

    test('toObject() returns all headers', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      const headers = api.request.headers.toObject();
      
      expect(headers).toHaveProperty('Authorization');
      expect(headers).toHaveProperty('Content-Type');
      expect(headers['Authorization']).toBe('Bearer token123');
    });

    test('Header mutations affect underlying request data', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      api.request.headers.add({ key: 'X-Test', value: 'test123' });
      api.request.headers.upsert({ key: 'Authorization', value: 'Bearer updated' });

      expect((mockRequest.data.headers as Record<string,string>)['X-Test']).toBe('test123');
      expect((mockRequest.data.headers as Record<string,string>)['Authorization']).toBe('Bearer updated');
    });
  });

  // ========================================================================
  // quest.request.body API
  // ========================================================================

  describe('quest.request.body API', () => {
    test('mode reflects current body mode', () => {
      mockRequest.data.body = { mode: 'raw', raw: '{"test": true}' };
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.request.body.mode).toBe('raw');
    });

    test('mode returns "raw" for string body', () => {
      mockRequest.data.body = '{"test": true}';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.request.body.mode).toBe('raw');
    });

    test('get() returns current body content as string for raw mode', () => {
      mockRequest.data.body = { mode: 'raw', raw: '{"test": true}' };
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.request.body.get()).toBe('{"test": true}');
    });

    test('get() returns string body directly', () => {
      mockRequest.data.body = '{"test": true}';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.request.body.get()).toBe('{"test": true}');
    });

    test('get() returns null for urlencoded mode', () => {
      mockRequest.data.body = { mode: 'urlencoded', kv: [{ key: 'test', value: 'value' }] };
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.request.body.get()).toBeNull();
    });

    test('get() returns null for formdata mode', () => {
      mockRequest.data.body = { mode: 'formdata', kv: [{ key: 'file', value: 'data' }] };
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.request.body.get()).toBeNull();
    });

    test('set(str) overrides body content', () => {
      mockRequest.data.body = { mode: 'raw', raw: 'old content' };
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      api.request.body.set('{"new": "content"}');
      
      expect(api.request.body.get()).toBe('{"new": "content"}');
      expect((mockRequest.data.body as { raw: string }).raw).toBe('{"new": "content"}');
    });

    test('set(str) creates body object if missing', () => {
      delete mockRequest.data.body;
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      api.request.body.set('{"created": true}');
      
      expect(api.request.body.get()).toBe('{"created": true}');
      expect(mockRequest.data.body).toEqual({ mode: 'raw', raw: '{"created": true}' });
    });

    test('set(str) updates string body directly', () => {
      mockRequest.data.body = 'original';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      api.request.body.set('updated');
      
      expect(mockRequest.data.body).toBe('updated');
    });
  });
});

describe('HTTP Plugin protocolAPIProvider - quest.response', () => {
  let context: ExecutionContext;
  let mockResponse: ProtocolResponse;

  beforeEach(() => {
    mockResponse = {
      data: {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'custom-value'
        },
        body: '{"userId": 123, "name": "Alice"}'
      } as HttpResponseData,
      summary: {
        outcome: 'success',
        code: 200,
        label: 'OK',
        duration: 145
      }
    };

    context = createMockContext(undefined, mockResponse);
  });

  // ========================================================================
  // Status
  // ========================================================================
  
  describe('Status', () => {
    test('api.response.status is correct for 2xx', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.response.status).toBe(200);
    });

    test('api.response.status is correct for 4xx', () => {
      (mockResponse.data as HttpResponseData).status = 404;
      (mockResponse.data as HttpResponseData).statusText = 'Not Found';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.status).toBe(404);
    });

    test('api.response.status is correct for 5xx', () => {
      (mockResponse.data as HttpResponseData).status = 500;
      (mockResponse.data as HttpResponseData).statusText = 'Internal Server Error';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.status).toBe(500);
    });

    test('api.response.statusText is populated', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.response.statusText).toBe('OK');
    });
  });

  // ========================================================================
  // Body parsing
  // ========================================================================
  
  describe('Body parsing', () => {
    test('api.response.body is raw response body string', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.body).toBe('{"userId": 123, "name": "Alice"}');
      expect(typeof api.response.body).toBe('string');
    });

    test('api.response.text() aliases .body', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.response.text()).toBe(api.response.body);
    });

    test('api.response.json() returns parsed object for valid JSON', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      const data = api.response.json() as { userId: number; name: string };
      
      expect(typeof data).toBe('object');
      expect(data.userId).toBe(123);
      expect(data.name).toBe('Alice');
    });

    test('api.response.json() returns {} for invalid JSON', () => {
      (mockResponse.data as HttpResponseData).body = 'not valid json {';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      const data = api.response.json();
      expect(data).toEqual({});
    });

    test('api.response.json() returns {} for empty body', () => {
      (mockResponse.data as HttpResponseData).body = '';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      const data = api.response.json();
      expect(data).toEqual({});
    });
  });

  // ========================================================================
  // Headers
  // ========================================================================
  
  describe('Headers', () => {
    test('get(name) returns header value', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.headers.get('Content-Type')).toBe('application/json');
      expect(api.response.headers.get('X-Custom-Header')).toBe('custom-value');
    });

    test('get(name) is case-insensitive', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.headers.get('content-type')).toBe('application/json');
      expect(api.response.headers.get('CONTENT-TYPE')).toBe('application/json');
      expect(api.response.headers.get('x-custom-header')).toBe('custom-value');
    });

    test('get(name) returns null for missing header', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      expect(api.response.headers.get('X-Missing')).toBeNull();
    });

    test('has(name) works correctly', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.headers.has('Content-Type')).toBe(true);
      expect(api.response.headers.has('X-Missing')).toBe(false);
    });

    test('has(name) is case-insensitive', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.headers.has('content-type')).toBe(true);
      expect(api.response.headers.has('CONTENT-TYPE')).toBe(true);
    });

    test('toObject() returns all headers', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      const headers = api.response.headers.toObject();
      
      expect(headers).toHaveProperty('Content-Type');
      expect(headers).toHaveProperty('X-Custom-Header');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  // ========================================================================
  // Metrics
  // ========================================================================
  
  describe('Metrics', () => {
    test('api.response.duration is measured in ms from summary', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.duration).toBe(145);
      expect(typeof api.response.duration).toBe('number');
      expect(api.response.duration).toBeGreaterThanOrEqual(0);
    });

    test('api.response.duration defaults to 0 when no summary', () => {
      mockResponse.summary = { outcome: 'success', duration: 0 };
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.duration).toBe(0);
    });

    test('api.response.size is bytes of response body', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      const bodyContent = '{"userId": 123, "name": "Alice"}';
      
      expect(api.response.size).toBe(bodyContent.length);
    });

    test('api.response.size is 0 for empty body', () => {
      (mockResponse.data as HttpResponseData).body = '';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.size).toBe(0);
    });
  });

  // ========================================================================
  // Assertion helpers
  // ========================================================================
  
  describe('Assertion helpers', () => {
    test('to.be.ok is true for status 200', () => {
      (mockResponse.data as HttpResponseData).status = 200;
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.be.ok).toBe(true);
    });

    test('to.be.ok is false for status 201', () => {
      (mockResponse.data as HttpResponseData).status = 201;
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.be.ok).toBe(false);
    });

    test('to.be.success is true for 2xx', () => {
      const statuses = [200, 201, 204, 299];
      
      statuses.forEach(status => {
        (mockResponse.data as HttpResponseData).status = status;
        const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
        expect(api.response.to.be.success).toBe(true);
      });
    });

    test('to.be.success is false for non-2xx', () => {
      const statuses = [199, 300, 400, 500];
      
      statuses.forEach(status => {
        (mockResponse.data as HttpResponseData).status = status;
        const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
        expect(api.response.to.be.success).toBe(false);
      });
    });

    test('to.be.clientError is true for 4xx', () => {
      const statuses = [400, 404, 422, 499];
      
      statuses.forEach(status => {
        (mockResponse.data as HttpResponseData).status = status;
        const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
        expect(api.response.to.be.clientError).toBe(true);
      });
    });

    test('to.be.clientError is false for non-4xx', () => {
      (mockResponse.data as HttpResponseData).status = 500;
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.be.clientError).toBe(false);
    });

    test('to.be.serverError is true for 5xx', () => {
      const statuses = [500, 502, 503, 599];
      
      statuses.forEach(status => {
        (mockResponse.data as HttpResponseData).status = status;
        const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
        expect(api.response.to.be.serverError).toBe(true);
      });
    });

    test('to.be.serverError is false for non-5xx', () => {
      (mockResponse.data as HttpResponseData).status = 404;
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.be.serverError).toBe(false);
    });

    test('to.have.status(code) matches exact status', () => {
      (mockResponse.data as HttpResponseData).status = 200;
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.have.status(200)).toBe(true);
      expect(api.response.to.have.status(404)).toBe(false);
    });

    test('to.have.header(name) checks header existence', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.have.header('Content-Type')).toBe(true);
      expect(api.response.to.have.header('content-type')).toBe(true);
      expect(api.response.to.have.header('X-Missing')).toBe(false);
    });

    test('to.have.jsonBody(field) checks JSON field existence', () => {
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.have.jsonBody('userId')).toBe(true);
      expect(api.response.to.have.jsonBody('name')).toBe(true);
      expect(api.response.to.have.jsonBody('missing')).toBe(false);
    });

    test('to.have.jsonBody(field) returns false for invalid JSON', () => {
      (mockResponse.data as HttpResponseData).body = 'not valid json {';
      const api = httpPlugin.protocolAPIProvider(context) as unknown as HttpProtocolAPI;
      
      expect(api.response.to.have.jsonBody('anything')).toBe(false);
    });
  });
});
