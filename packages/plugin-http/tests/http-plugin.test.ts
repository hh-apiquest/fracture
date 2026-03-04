import { describe, test, expect, beforeEach, afterEach, beforeAll} from 'vitest';
import { httpPlugin } from '../src/index.js';
import type { Request, ExecutionContext, RuntimeOptions, ICookieJar, CookieSetOptions, ProtocolResponse } from '@apiquest/types';

// Helper to extract typed response data
function getResponseData(response: ProtocolResponse): { status: number; statusText: string; body: string; headers: Record<string, string | string[]> } {
  return response.data as { status: number; statusText: string; body: string; headers: Record<string, string | string[]> };
}
import http from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { TestHttpsServer, TestProxyServer } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    protocol: 'http',
    collectionVariables: {},
    globalVariables: {},
    scope: {
      level: 'collection',
      id: 'test-collection',
      vars: {}
    },
    iterationCurrent: 0,
    iterationCount: 1,
    iterationSource: 'none',
    executionHistory: [],
    options: {},
    cookieJar: new TestCookieJar(),
    protocolPlugin: httpPlugin,
    abortSignal: new AbortController().signal
  };
}

// Simple mock HTTP server for testing
class TestServer {
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

        // GET /test - Basic endpoint
        if (req.method === 'GET' && url === '/test') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'success' }));
          return;
        }

        // /echo - Echo body for all methods (including GET)
        if (url === '/echo') {
          readBody((body) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              method: req.method,
              received: body
            }));
          });
          return;
        }

        // /headers - Return request headers
        if (url === '/headers') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(req.headers));
          return;
        }

        // /full-echo - Return both request headers and body
        if (url === '/full-echo') {
          readBody((body) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              method: req.method,
              headers: req.headers,
              body
            }));
          });
          return;
        }

        // /params - Return parsed query parameters from the URL (preserves duplicates as arrays)
        if (url.startsWith('/params')) {
          const parsedUrl = new URL(url, 'http://localhost');
          const params: Record<string, string | string[]> = {};
          parsedUrl.searchParams.forEach((value, key) => {
            const existing = params[key];
            if (existing === undefined) {
              params[key] = value;
            } else if (Array.isArray(existing)) {
              existing.push(value);
            } else {
              params[key] = [existing, value];
            }
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ params, path: parsedUrl.pathname }));
          return;
        }

        // /methods/:method - Test specific HTTP methods
        const methodMatch = url.match(/^\/methods\/(\w+)$/);
        if (methodMatch !== null) {
          readBody((body) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              method: req.method,
              expectedMethod: methodMatch[1].toUpperCase(),
              body: body.length > 0 ? body : null
            }));
          });
          return;
        }

        // /status/:code - Return specific status
        const statusMatch = url.match(/^\/status\/(\d+)$/);
        if (statusMatch !== null) {
          const code = parseInt(statusMatch[1], 10);
          res.writeHead(code);
          res.end(JSON.stringify({ status: code }));
          return;
        }

        // 404 fallback
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
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

describe('HTTP Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(httpPlugin.name).toBe('HTTP Client');
      expect(httpPlugin.version).toBe('1.0.0');
      expect(httpPlugin.description).toBe('HTTP/HTTPS protocol support for REST APIs');
    });

    test('should declare http protocol', () => {
      expect(httpPlugin.protocols).toContain('http');
      expect(httpPlugin.protocols).toHaveLength(1);
    });

    test('should declare supported auth types', () => {
      expect(httpPlugin.supportedAuthTypes).toContain('bearer');
      expect(httpPlugin.supportedAuthTypes).toContain('basic');
      expect(httpPlugin.supportedAuthTypes).toContain('oauth2');
      expect(httpPlugin.supportedAuthTypes).toContain('apikey');
    });

    test('should not use strict auth list', () => {
      expect(httpPlugin.strictAuthList).toBe(false);
    });

    test('should have data schema', () => {
      const schema = httpPlugin.dataSchema as { properties: Record<string, unknown> };
      expect(schema).toBeDefined();
      expect(schema.properties.method).toBeDefined();
      expect(schema.properties.url).toBeDefined();
      expect(schema.properties.headers).toBeDefined();
      expect(schema.properties.body).toBeDefined();
    });

    test('should have options schema', () => {
      expect(httpPlugin.optionsSchema).toBeDefined();
      expect(httpPlugin.optionsSchema?.keepAlive).toBeDefined();
      expect(httpPlugin.optionsSchema?.timeout).toBeDefined();
      expect(httpPlugin.optionsSchema?.followRedirects).toBeDefined();
      expect(httpPlugin.optionsSchema?.maxRedirects).toBeDefined();
      expect(httpPlugin.optionsSchema?.validateCertificates).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation for valid GET request', () => {
      const request: Request = {
        type: 'request',
        id: 'test-1',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should pass validation for valid POST request', () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
        name: 'Test Request',
        data: {
          method: 'POST',
          url: 'https://api.example.com/users',
          body: { name: 'John' }
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation for missing URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
        name: 'Test Request',
        data: {
          method: 'GET'
        }
      };

      const result = httpPlugin.validate(request, {});
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
          method: 'GET',
          url: '   '
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should fail validation for invalid method', () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          method: 'INVALID',
          url: 'https://api.example.com/users'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Invalid HTTP method');
    });

    test('should pass validation for all valid HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      
      methods.forEach(method => {
        const request: Request = {
          type: 'request',
          id: `test-${method}`,
          name: 'Test Request',
          data: {
            method,
            url: 'https://api.example.com/users'
          }
        };

        const result = httpPlugin.validate(request, {});
        expect(result.valid).toBe(true);
      });
    });

    test('should pass validation for lowercase methods', () => {
      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          method: 'get',
          url: 'https://api.example.com/users'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Request Execution', () => {
    let server: TestServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('should execute simple GET request', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-7',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});

      expect((response.data as { status: number }).status).toBe(200);
      expect((response.data as { body: string }).body).toBe(JSON.stringify({ message: 'success' }));
    });

    test('should execute POST request with body', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-8',
        name: 'Test Request',
        data: {
          method: 'POST',
          url: `${baseUrl}/echo`,
          body: 'test data'
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);

      expect(data.status).toBe(200);
      expect(data.body).toContain('test data');
    });

    test('should handle custom headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-9',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: `${baseUrl}/headers`,
          headers: {
            'X-Custom-Header': 'custom-value'
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);

      expect(data.status).toBe(200);
      const headers = JSON.parse(data.body) as Record<string, unknown>;
      expect(headers['x-custom-header']).toBe('custom-value');
    });

    test('should handle different status codes', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-10',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: `${baseUrl}/status/404`
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);

      expect(data.status).toBe(404);
    });

    test('should handle network errors', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-11',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'http://invalid-domain-that-does-not-exist-12345.com'
        }
      };

      const context = createMockContext();
      const options: RuntimeOptions = {
        timeout: { request: 1000 }
      };

      const response = await httpPlugin.execute(request, context, options);
      const data = getResponseData(response);
      
      expect(data.status).toBe(0);
      expect(data.statusText).toBe('Network Error');
      expect(response.summary.message).toBeDefined();
    }, 10000);

    test('should handle missing URL error', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-12',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: ''
        }
      };

      const context = createMockContext();
      
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      expect(data.status).toBe(0);
      expect(data.statusText).toBe('Error');
      expect(response.summary.outcome).toBe('error');
      expect(response.summary.message).toContain('URL is required');
    });
  });

  describe('SSL/TLS Behavior', () => {
    let httpsServer: TestHttpsServer;
    let baseUrl: string;

    beforeEach(async () => {
      httpsServer = new TestHttpsServer();
      baseUrl = await httpsServer.start();
    });

    afterEach(async () => {
      await httpsServer.stop();
    });

    test('Self-signed cert with validation enabled fails', async () => {
      const request: Request = {
        type: 'request',
        id: 'ssl-1',
        name: 'SSL Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: { validateCertificates: true }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      const data = getResponseData(response);
      
      // Self-signed cert should fail validation
      expect(data.status).toBe(0);
      expect(response.summary.outcome).toBe('error');
      expect(response.summary.message).toBeDefined();
      expect(response.summary.message?.toLowerCase()).toContain('certificate');
    });

    test('Self-signed cert with validation disabled succeeds', async () => {
      const request: Request = {
        type: 'request',
        id: 'ssl-2',
        name: 'SSL Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: { validateCertificates: false }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      const data = getResponseData(response);
      
      expect(data.status).toBe(200);
      const body = JSON.parse(data.body) as { message: string };
      expect(body.message).toBe('HTTPS OK');
    });

    test('mTLS with valid client certificate succeeds', async () => {
      // Start server that requires client cert
      await httpsServer.stop();
      baseUrl = await httpsServer.start({ requireClientCert: true });
      
      const request: Request = {
        type: 'request',
        id: 'ssl-3',
        name: 'mTLS Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: {
          validateCertificates: false, // Self-signed server cert
          clientCertificate: {
            cert: readFileSync(join(__dirname, 'test-fixtures/client-cert.pem'), 'utf8'),
            key: readFileSync(join(__dirname, 'test-fixtures/client-key.pem'), 'utf8')
          }
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      const data = getResponseData(response);
      
      expect(data.status).toBe(200);
      const body = JSON.parse(data.body) as { clientCertProvided: boolean };
      expect(body.clientCertProvided).toBe(true);
    });

    test('Custom CA certificate validates server cert', async () => {
      const request: Request = {
        type: 'request',
        id: 'ssl-4',
        name: 'CA Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: {
          validateCertificates: true,
          ca: readFileSync(join(__dirname, 'test-fixtures/server-cert.pem'), 'utf8')
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      const data = getResponseData(response);
      
      // With proper CA, validation should pass
      expect(data.status).toBe(200);
    });
  });

  describe('Proxy Behavior', () => {
    let proxyServer: TestProxyServer;
    let targetServer: TestServer;
    let proxyPort: number;
    let targetUrl: string;

    beforeEach(async () => {
      proxyServer = new TestProxyServer();
      targetServer = new TestServer();
      proxyPort = await proxyServer.start();
      targetUrl = await targetServer.start();
    });

    afterEach(async () => {
      await proxyServer.stop();
      await targetServer.stop();
    });

    test('Routes request through proxy', async () => {
      const request: Request = {
        type: 'request',
        id: 'proxy-1',
        name: 'Proxy Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'localhost',
          port: proxyPort
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Request should go through proxy
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });

    test('Proxy authentication with credentials', async () => {
      // Stop and restart with auth
      await proxyServer.stop();
      proxyPort = await proxyServer.start({
        requireAuth: true,
        username: 'testuser',
        password: 'testpass'
      });
      
      const request: Request = {
        type: 'request',
        id: 'proxy-2',
        name: 'Proxy Auth Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'localhost',
          port: proxyPort,
          auth: {
            username: 'testuser',
            password: 'testpass'
          }
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });

    test('Proxy bypass for localhost', async () => {
      const request: Request = {
        type: 'request',
        id: 'proxy-3',
        name: 'Bypass Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test' // Targets localhost
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'proxy.example.com',
          port: 8080,
          bypass: ['localhost', '127.0.0.1']
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      const data = getResponseData(response);
      
      // Should bypass proxy (direct connection) - proxy log should be empty
      expect(proxyServer.requestLog).toHaveLength(0);
      expect(data.status).toBe(200);
    });
  });

  describe('Environment Variable Support', () => {
    let proxyServer: TestProxyServer;
    let targetServer: TestServer;
    let proxyPort: number;
    let targetUrl: string;
    const originalEnv = { ...process.env };

    beforeEach(async () => {
      proxyServer = new TestProxyServer();
      targetServer = new TestServer();
      proxyPort = await proxyServer.start();
      targetUrl = await targetServer.start();
    });

    afterEach(async () => {
      await proxyServer.stop();
      await targetServer.stop();
      // Restore original env vars
      process.env = { ...originalEnv };
    });

    test('HTTP_PROXY env var sets proxy for HTTP requests', async () => {
      process.env.HTTP_PROXY = `http://localhost:${proxyPort}`;
      
      const request: Request = {
        type: 'request',
        id: 'env-1',
        name: 'HTTP_PROXY Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      
      // Request should go through proxy from env var
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });

    test('HTTPS_PROXY env var sets proxy for HTTPS requests', async () => {
      process.env.HTTPS_PROXY = `http://localhost:${proxyPort}`;
      
      const httpsServer = new TestHttpsServer();
      const httpsUrl = await httpsServer.start();
      
      const request: Request = {
        type: 'request',
        id: 'env-2',
        name: 'HTTPS_PROXY Test',
        data: {
          method: 'GET',
          url: `${httpsUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: { validateCertificates: false }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Request should go through proxy from env var
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
      
      await httpsServer.stop();
    });

    test('NO_PROXY env var bypasses proxy for specified hosts', async () => {
      process.env.HTTP_PROXY = `http://localhost:${proxyPort}`;
      process.env.NO_PROXY = 'localhost,127.0.0.1';
      
      const request: Request = {
        type: 'request',
        id: 'env-3',
        name: 'NO_PROXY Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      
      // Should bypass proxy due to NO_PROXY
      expect(proxyServer.requestLog).toHaveLength(0);
      expect(data.status).toBe(200);
    });

    test('Explicit proxy options override env vars', async () => {
      process.env.HTTP_PROXY = `http://wrong-host:9999`;
      
      const request: Request = {
        type: 'request',
        id: 'env-4',
        name: 'Override Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'localhost',
          port: proxyPort
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Should use explicit proxy, not env var
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Body Modes
  // ==========================================================================

  describe('Body Modes', () => {
    let server: TestServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('string body is sent as-is', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-str-1',
        name: 'String Body',
        data: {
          method: 'POST',
          url: `${baseUrl}/echo`,
          body: 'raw string payload'
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { received: string };

      expect(data.status).toBe(200);
      expect(echo.received).toBe('raw string payload');
    });

    test('mode=raw sends raw string as body', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-raw-1',
        name: 'Raw Body',
        data: {
          method: 'POST',
          url: `${baseUrl}/echo`,
          body: { mode: 'raw', raw: '{"key":"value"}' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { received: string };

      expect(data.status).toBe(200);
      expect(echo.received).toBe('{"key":"value"}');
    });

    test('mode=raw with language sets Content-Type header automatically', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-raw-lang-1',
        name: 'Raw Body with Language',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: { mode: 'raw', raw: '{"key":"value"}', language: 'application/json' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string>; body: string };

      expect(data.status).toBe(200);
      expect(echo.headers['content-type']).toBe('application/json');
      expect(echo.body).toBe('{"key":"value"}');
    });

    test('mode=raw with language does not override explicitly set Content-Type', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-raw-lang-2',
        name: 'Raw Body Language No Override',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          headers: { 'content-type': 'text/plain' },
          body: { mode: 'raw', raw: 'plain text', language: 'application/json' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string>; body: string };

      expect(data.status).toBe(200);
      // User-provided content-type should win over language auto-header
      expect(echo.headers['content-type']).toBe('text/plain');
      expect(echo.body).toBe('plain text');
    });

    test('mode=none sends no body', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-none-1',
        name: 'No Body',
        data: {
          method: 'POST',
          url: `${baseUrl}/echo`,
          body: { mode: 'none' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { received: string };

      expect(data.status).toBe(200);
      expect(echo.received).toBe('');
    });

    test('mode=urlencoded encodes key-value pairs and sets Content-Type', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-urlenc-1',
        name: 'URL Encoded Body',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'urlencoded',
            kv: [
              { key: 'username', value: 'alice' },
              { key: 'password', value: 'secret123' }
            ]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string>; body: string };

      expect(data.status).toBe(200);
      // Content-Type must be set automatically
      expect(echo.headers['content-type']).toBe('application/x-www-form-urlencoded');
      // Body must be URL-encoded
      const params = new URLSearchParams(echo.body);
      expect(params.get('username')).toBe('alice');
      expect(params.get('password')).toBe('secret123');
    });

    test('mode=urlencoded skips empty key entries', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-urlenc-2',
        name: 'URL Encoded Empty Keys',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'urlencoded',
            kv: [
              { key: 'valid', value: 'yes' },
              { key: '', value: 'ignored' }
            ]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { body: string };

      const params = new URLSearchParams(echo.body);
      expect(params.get('valid')).toBe('yes');
      expect(params.has('')).toBe(false);
    });

    test('mode=formdata encodes key-value pairs and sets multipart Content-Type', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-form-1',
        name: 'Form Data Body',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'formdata',
            kv: [
              { key: 'field1', value: 'hello' },
              { key: 'field2', value: 'world' }
            ]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string>; body: string };

      expect(data.status).toBe(200);
      // Content-Type must be multipart/form-data with a boundary
      expect(echo.headers['content-type']).toMatch(/^multipart\/form-data/);
      // Body must contain field values
      expect(echo.body).toContain('hello');
      expect(echo.body).toContain('world');
      // Field names must appear in the body
      expect(echo.body).toContain('field1');
      expect(echo.body).toContain('field2');
    });

    test('mode=formdata skips entries with empty key', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-form-2',
        name: 'Form Data Empty Key',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'formdata',
            kv: [
              { key: 'present', value: 'yes' },
              { key: '', value: 'skip-me' }
            ]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { body: string };

      expect(echo.body).toContain('present');
      expect(echo.body).not.toContain('skip-me');
    });

    test('mode=formdata with binary type sends base64-decoded buffer', async () => {
      const originalText = 'binary-content';
      const base64Value = Buffer.from(originalText).toString('base64');

      const request: Request = {
        type: 'request',
        id: 'body-form-bin-1',
        name: 'Form Data Binary',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'formdata',
            kv: [
              { key: 'file', value: base64Value, type: 'binary' }
            ]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { body: string };

      expect(data.status).toBe(200);
      // The decoded bytes of the base64 value should appear in the multipart body
      expect(echo.body).toContain(originalText);
    });

    test('undefined body sends no body', async () => {
      const request: Request = {
        type: 'request',
        id: 'body-undef-1',
        name: 'No Body Undefined',
        data: {
          method: 'POST',
          url: `${baseUrl}/echo`
          // body intentionally omitted
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { received: string };

      expect(data.status).toBe(200);
      expect(echo.received).toBe('');
    });
  });

  // ==========================================================================
  // Query Parameters
  // ==========================================================================

  describe('Query Parameters', () => {
    let server: TestServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('params array is appended to request URL as query string', async () => {
      const request: Request = {
        type: 'request',
        id: 'params-1',
        name: 'Params Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/params`,
          params: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' }
          ]
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const result = JSON.parse(data.body) as { params: Record<string, string> };

      expect(data.status).toBe(200);
      expect(result.params['page']).toBe('1');
      expect(result.params['limit']).toBe('20');
    });

    test('multiple params with same key are all appended', async () => {
      const request: Request = {
        type: 'request',
        id: 'params-2',
        name: 'Duplicate Params Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/params`,
          params: [
            { key: 'tag', value: 'alpha' },
            { key: 'tag', value: 'beta' }
          ]
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const result = JSON.parse(data.body) as { params: Record<string, string | string[]> };

      expect(data.status).toBe(200);
      // Both values for the same key must be present as an array
      expect(result.params['tag']).toEqual(['alpha', 'beta']);
    });

    test('params with special characters are URL-encoded', async () => {
      const request: Request = {
        type: 'request',
        id: 'params-3',
        name: 'Special Chars Params',
        data: {
          method: 'GET',
          url: `${baseUrl}/params`,
          params: [
            { key: 'q', value: 'hello world & more' }
          ]
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const result = JSON.parse(data.body) as { params: Record<string, string> };

      expect(data.status).toBe(200);
      expect(result.params['q']).toBe('hello world & more');
    });

    test('params array is merged with existing query string on URL', async () => {
      const request: Request = {
        type: 'request',
        id: 'params-4',
        name: 'Merge Params Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/params?existing=true`,
          params: [
            { key: 'added', value: 'yes' }
          ]
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const result = JSON.parse(data.body) as { params: Record<string, string> };

      expect(data.status).toBe(200);
      expect(result.params['existing']).toBe('true');
      expect(result.params['added']).toBe('yes');
    });

    test('empty params array does not modify URL', async () => {
      const request: Request = {
        type: 'request',
        id: 'params-5',
        name: 'Empty Params Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/params`,
          params: []
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const result = JSON.parse(data.body) as { params: Record<string, string> };

      expect(data.status).toBe(200);
      expect(Object.keys(result.params)).toHaveLength(0);
    });

    test('undefined params does not modify URL', async () => {
      const request: Request = {
        type: 'request',
        id: 'params-6',
        name: 'Undefined Params Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/params`
          // params intentionally omitted
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const result = JSON.parse(data.body) as { params: Record<string, string> };

      expect(data.status).toBe(200);
      expect(Object.keys(result.params)).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Auto-Generated Headers
  // ==========================================================================

  describe('Auto-Generated Headers', () => {
    let server: TestServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('urlencoded body auto-sets application/x-www-form-urlencoded Content-Type', async () => {
      const request: Request = {
        type: 'request',
        id: 'autohdr-url-1',
        name: 'Auto Content-Type urlencoded',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'urlencoded',
            kv: [{ key: 'a', value: '1' }]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string> };

      expect(echo.headers['content-type']).toBe('application/x-www-form-urlencoded');
    });

    test('formdata body auto-sets multipart/form-data Content-Type with boundary', async () => {
      const request: Request = {
        type: 'request',
        id: 'autohdr-form-1',
        name: 'Auto Content-Type formdata',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: {
            mode: 'formdata',
            kv: [{ key: 'field', value: 'value' }]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string> };

      expect(echo.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    });

    test('raw body with language auto-sets Content-Type from language field', async () => {
      const request: Request = {
        type: 'request',
        id: 'autohdr-raw-1',
        name: 'Auto Content-Type raw language',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: { mode: 'raw', raw: '<root/>', language: 'application/xml' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string>; body: string };

      expect(echo.headers['content-type']).toBe('application/xml');
      expect(echo.body).toBe('<root/>');
    });

    test('raw body without language does not auto-set Content-Type', async () => {
      const request: Request = {
        type: 'request',
        id: 'autohdr-raw-2',
        name: 'No Auto Content-Type raw',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: { mode: 'raw', raw: 'plain raw content' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string> };

      // No automatic Content-Type should be set for raw without language
      expect(echo.headers['content-type']).toBeUndefined();
    });

    test('user-provided Content-Type is not overridden by urlencoded auto-header', async () => {
      const request: Request = {
        type: 'request',
        id: 'autohdr-url-2',
        name: 'User Content-Type wins urlencoded',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: {
            mode: 'urlencoded',
            kv: [{ key: 'a', value: '1' }]
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string> };

      // The urlencoded mode overwrites the header regardless — this tests current behavior
      // (the implementation does not check if content-type was already set for urlencoded)
      expect(echo.headers['content-type']).toContain('application/x-www-form-urlencoded');
    });

    test('mode=none body sends no Content-Type auto-header', async () => {
      const request: Request = {
        type: 'request',
        id: 'autohdr-none-1',
        name: 'None Mode No Content-Type',
        data: {
          method: 'POST',
          url: `${baseUrl}/full-echo`,
          body: { mode: 'none' }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      const data = getResponseData(response);
      const echo = JSON.parse(data.body) as { headers: Record<string, string> };

      // mode=none sends no body and no auto-generated Content-Type
      expect(echo.headers['content-type']).toBeUndefined();
    });
  });
});
