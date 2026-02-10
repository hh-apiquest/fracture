import type { CookieSetOptions, ICookieJar, IProtocolPlugin, IAuthPlugin, Auth, Request, RuntimeOptions, ValidationResult, ValidationError, PluginEventDefinition } from '@apiquest/types';

class FakeJarClass implements ICookieJar {
  get(name: string, domain?: string, path?: string): string | null {
    return null;
  }
  set(name: string, value: string, options: CookieSetOptions): void {
  }
  has(name: string, domain?: string, path?: string): boolean {
    return false;
  }
  remove(name: string, domain?: string, path?: string): void {
  }
  clear(): void {
  }
  toObject(): Record<string, string> {
    return {};
  }
  getCookieHeader(url: string): string | null {
    return null;
  }
  store(setCookieHeaders: string | string[] | null | undefined, requestUrl: string): void {
  }
}

export const FakeJar = new FakeJarClass();

// Mock protocol plugin for tests that don't need actual HTTP execution
export const mockProtocolPlugin: IProtocolPlugin = {
  protocols: ['http'],
  name: 'Mock HTTP Plugin',
  version: '1.0.0',
  description: 'Mock plugin for testing',
  supportedAuthTypes: ['bearer', 'basic'],
  dataSchema: {},
  async execute() {
    return {
      status: 200,
      statusText: 'OK',
      body: '{}',
      headers: {},
      duration: 100
    };
  },
  validate() {
    return { valid: true };
  }
};

// Mock streaming protocol plugin with plugin events for testing
export const mockStreamingPlugin: IProtocolPlugin = {
  protocols: ['mock-stream'],
  name: 'Mock Streaming Plugin',
  version: '1.0.0',
  description: 'Mock streaming plugin for testing plugin events',
  supportedAuthTypes: [],
  dataSchema: {},
  events: [
    {
      name: 'onMessage',
      description: 'Fired when a message is received',
      canHaveTests: true,
      required: false
    },
    {
      name: 'onError',
      description: 'Fired when an error occurs',
      canHaveTests: false,
      required: false
    },
    {
      name: 'onComplete',
      description: 'Fired when stream completes',
      canHaveTests: true,
      required: false
    }
  ],
  async execute(request, context, options, emitEvent) {
    // Simulate streaming by emitting multiple onMessage events
    const messageCount = context.expectedMessages ?? 3;
    for (let i = 0; i < messageCount; i++) {
      if (emitEvent !== null && emitEvent !== undefined) {
        await emitEvent('onMessage', {
          message: `Message ${i + 1}`,
          index: i
        });
      }
    }
    
    // Build response before emitting onComplete
    // Real-world: WebSocket onClose has final status, gRPC onEnd has trailers
    const response = {
      status: 200,
      statusText: 'OK',
      body: `Received ${messageCount} messages`,
      headers: {},
      duration: 100
    };
    
    // Set response in context so onComplete event scripts can access quest.response
    // This matches real-world behavior: completion events have access to final metadata
    context.currentResponse = response;
    
    // Emit onComplete (response now available via quest.response)
    if (emitEvent !== null && emitEvent !== undefined) {
      await emitEvent('onComplete', {
        totalMessages: messageCount
      });
    }
    
    return response;
  },
  validate() {
    return { valid: true };
  }
};

/**
 * Mock options plugin that echoes received options in response body.
 * Use for testing option propagation from runner to plugins.
 * Simulates basic HTTP behaviors: redirects and cookies.
 */
export const mockOptionsPlugin: IProtocolPlugin = {
  protocols: ['mock-options'],
  name: 'Mock Options Plugin',
  version: '1.0.0',
  description: 'Echoes runtime options for testing',
  supportedAuthTypes: ['mock-auth', 'mock-auth1', 'mock-auth2', 'mock-auth3'],
  dataSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] },
      url: { type: 'string', minLength: 1 }
    },
    required: ['url']
  },
  
  async execute(request, context, options) {
    const startTime = Date.now();
    const url = String(request.data.url ?? '');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    
    // Check abort signal before execution
    if (context.abortSignal?.aborted === true) {
      return {
        status: 0,
        statusText: 'Aborted',
        body: '',
        headers: {},
        duration: 0,
        error: 'Request aborted'
      };
    }
    
    // Handle /status/:code routes to return specific status codes
    const statusMatch = url.match(/\/status\/(\d+)/);
    if (statusMatch !== null) {
      const statusCode = parseInt(statusMatch[1], 10);
      const statusText = statusCode === 200 ? 'OK' : statusCode === 404 ? 'Not Found' : statusCode === 500 ? 'Internal Server Error' : 'Status';
      return {
        status: statusCode,
        statusText,
        body: JSON.stringify({ status: statusCode }),
        headers,
        duration: Date.now() - startTime
      };
    }
    
    // Handle /delay/:ms routes to simulate execution delays
    const delayMatch = url.match(/\/delay\/(\d+)/);
    if (delayMatch !== null) {
      const delayMs = parseInt(delayMatch[1], 10);
      // Wait for delay or until abort signal fires
      const delayResult = await new Promise<'completed' | 'aborted'>((resolve) => {
        const timeout = setTimeout(() => resolve('completed'), delayMs);
        const abortHandler = (): void => {
          clearTimeout(timeout);
          resolve('aborted');
        };
        if (context.abortSignal !== undefined) {
          context.abortSignal.addEventListener('abort', abortHandler, { once: true });
        }
      });
      
      if (delayResult === 'aborted') {
        return {
          status: 0,
          statusText: 'Aborted',
          body: '',
          headers: {},
          duration: Date.now() - startTime,
          error: 'Request aborted'
        };
      }
    }
    
    // Simulate network errors for invalid domains (return error response, don't throw)
    if (url.includes('invalid-domain') || url.includes('does-not-exist')) {
      return {
        status: 0,
        statusText: 'Network Error',
        body: '',
        headers: {},
        duration: Date.now() - startTime,
        error: `getaddrinfo ENOTFOUND ${url}`
      };
    }
    
    // Read cookies from jar and prepare Cookie header (like HTTP plugin does)
    const cookieHeader = context.cookieJar.getCookieHeader(url);
    const requestCookies = (cookieHeader !== null && cookieHeader !== '') ? `Cookie: ${cookieHeader}` : 'No cookies';
    
    // Simulate redirects
    if (url.includes('/redirect/') && options.followRedirects !== false) {
      // Mock follows redirects - return final 200
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ message: 'Final destination after redirect', requestCookies }),
        headers,
        duration: 5
      };
    } else if (url.includes('/redirect/') && options.followRedirects === false) {
      // Mock doesn't follow - return 302
      return {
        status: 302,
        statusText: 'Found',
        body: '',
        headers: { ...headers, 'location': 'mock://final' },
        duration: 5
      };
    }
    
    // Handle cookie routes (matching MockHttpServer routes)
    if (url.includes('/set-cookies')) {
      // Set multiple cookies
      const setCookieHeaders = [
        'sessionId=abc123; Path=/',
        'userId=user456; Path=/; HttpOnly'
      ];
      headers['set-cookie'] = setCookieHeaders.join(', ');
      
      // Store cookies in jar
      setCookieHeaders.forEach(cookie => context.cookieJar.store(cookie, url));
      
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ message: 'Cookies set' }),
        headers,
        duration: 5
      };
    }
    
    if (url.includes('/echo-cookies')) {
      // Echo back the cookies that were sent
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ cookies: cookieHeader ?? '' }),
        headers,
        duration: 5
      };
    }
    
    if (url.includes('/set-cookie-attributes')) {
      const setCookieHeader = 'token=xyz789; Path=/api; Secure; HttpOnly; SameSite=Strict';
      headers['set-cookie'] = setCookieHeader;
      context.cookieJar.store(setCookieHeader, url);
      
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ message: 'Cookie with attributes set' }),
        headers,
        duration: 5
      };
    }
    
    if (url.includes('/api/set')) {
      const setCookieHeader = 'api_token=secret; Path=/api';
      headers['set-cookie'] = setCookieHeader;
      context.cookieJar.store(setCookieHeader, url);
      
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ message: 'API cookie set' }),
        headers,
        duration: 5
      };
    }
    
    if (url.includes('/api/check') || url.includes('/other/check')) {
      // Check if cookie was sent
      const hasCookie = (cookieHeader ?? '').includes('api_token');
      return {
        status: 200,
        statusText: 'OK',
        body: JSON.stringify({ hasCookie }),
        headers,
        duration: 5
      };
    }
    
    if (url.includes('/error-with-cookie')) {
      const setCookieHeader = 'error_cookie=error_value';
      headers['set-cookie'] = setCookieHeader;
      context.cookieJar.store(setCookieHeader, url);
      
      return {
        status: 401,
        statusText: 'Unauthorized',
        body: JSON.stringify({ error: 'Unauthorized' }),
        headers,
        duration: 5
      };
    }
    
    // Simulate setting cookies (original pattern)
    if (url.includes('/cookies/set/')) {
      const match = url.match(/\/cookies\/set\/([^/]+)\/([^/]+)/);
      if (match !== null) {
        const [, name, value] = match;
        const setCookieHeader = `${name}=${value}; Path=/`;
        headers['set-cookie'] = setCookieHeader;
        
        // Store cookie in jar (like HTTP plugin does)
        context.cookieJar.store(setCookieHeader, url);
        
        // Return indicating cookies were set
        return {
          status: 200,
          statusText: 'OK',
          body: JSON.stringify({ message: 'Cookie set', name, value, requestCookies }),
          headers,
          duration: 5
        };
      }
    }
    
    // Default: echo received options
    return {
      status: 200,
      statusText: 'OK',
      body: JSON.stringify({
        receivedOptions: {
          timeout: options.timeout,
          ssl: options.ssl,
          proxy: options.proxy,
          followRedirects: options.followRedirects,
          maxRedirects: options.maxRedirects,
          execution: options.execution,
          jar: options.jar,
          plugins: options.plugins
        }
      }),
      headers,
      duration: 5
    };
  },
  
  validate(request: Request, options: RuntimeOptions): ValidationResult {
    const errors: ValidationError[] = [];

    // Check URL
    if (typeof request.data.url !== 'string' || request.data.url.trim() === '') {
      errors.push({
        message: 'URL is required',
        location: '',
        source: 'protocol'
      });
    }

    // Check method
    const method = (typeof request.data.method === 'string' && request.data.method.trim() !== '') ? request.data.method.toUpperCase() : 'GET';
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(method)) {
      errors.push({
        message: `Invalid HTTP method: ${method}`,
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
  }
};

/**
 * Mock auth plugin for testing auth orchestration.
 * Simpler than real auth plugins.
 */
export const mockAuthPlugin: IAuthPlugin = {
  name: 'Mock Auth Plugin',
  version: '1.0.0',
  description: 'Mock auth for testing fracture orchestration',
  authTypes: ['mock-auth', 'mock-auth1', 'mock-auth2', 'mock-auth3'],
  protocols: ['mock-options', 'http'],
  dataSchema: {},
  
  async apply(request: Request, auth: Auth): Promise<Request> {
    request.data.headers = request.data.headers ?? {};
    (request.data.headers as Record<string, string>)['X-Mock-Auth'] = (auth.data as { token: string }).token;
    return request;
  },
  
  validate(auth: Auth): ValidationResult {
    const hasToken = Boolean((auth.data as { token?: string })?.token);
    return {
      valid: hasToken,
      errors: hasToken ? [] : [{
        message: 'Mock auth requires a token',
        location: 'auth',
        source: 'auth'
      }]
    };
  }
};

// Export aliases for different auth types using the same mock auth plugin
export const bearerAuth = mockAuthPlugin;
export const basicAuth = mockAuthPlugin;
export const apiKeyAuth = mockAuthPlugin;

// Get real HTTP plugin for tests that make actual requests
// export function getHttpPlugin(): IProtocolPlugin {
//   const pluginManager = new PluginManager();
//   pluginManager.registerPlugin(httpPlugin);

//   const plugin = pluginManager.getPlugin('http');
//   if (!plugin) {
//     throw new Error('HTTP plugin not registered');
//   }

//   return plugin;
// }

// ============================================================================
// Mock HTTP Server for Testing
// ============================================================================
import http from 'http';

export interface MockServerOptions {
  port?: number;
  hostname?: string;
}

export interface MockServerRoute {
  method: string;
  path: string;
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
}

export class MockHttpServer {
  private server: http.Server | null = null;
  private port: number;
  private hostname: string;
  private routes: MockServerRoute[] = [];

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 0; // 0 = random port
    this.hostname = options.hostname ?? 'localhost';
  }

  /**
   * Register a route handler
   */
  on(method: string, path: string, handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): void {
    this.routes.push({ method: method.toUpperCase(), path, handler });
  }

  /**
   * Start the mock server
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        // Enable CORS for tests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle OPTIONS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        // Find matching route
        const route = this.routes.find(r =>
          r.method === req.method &&
          (r.path === req.url || new RegExp(r.path).test(req.url ?? ''))
        );

        if (route !== undefined) {
          try {
            route.handler(req, res);
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.listen(this.port, this.hostname, () => {
        const address = this.server!.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('Failed to start server'));
          return;
        }
        this.port = address.port;
        resolve(`http://${this.hostname}:${this.port}`);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server !== null) {
        const server = this.server;
        server.close((err) => {
          if (err !== null && err !== undefined) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the base URL of the server
   */
  get url(): string {
    return `http://${this.hostname}:${this.port}`;
  }
}

/**
 * Create a pre-configured mock server with common test endpoints
 */
export function createTestServer(): MockHttpServer {
  const server = new MockHttpServer();

  // GET /status/:code - Return specific status code
  server.on('GET', '^/status/(\\d+)$', (req, res) => {
    const match = req.url?.match(/\/status\/(\d+)/);
    const code = parseInt(match?.[1] ?? '200');
    res.writeHead(code);
    res.end(JSON.stringify({ status: code }));
  });

  // GET /delay/:ms - Delayed response
  server.on('GET', '^/delay/(\\d+)$', (req, res) => {
    const match = req.url?.match(/\/delay\/(\d+)/);
    const delay = parseInt(match?.[1] ?? '0');
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ delayed: delay, message: 'Delayed response' }));
    }, delay);
  });

  // GET /json - Return JSON
  server.on('GET', '/json', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Hello, World!', timestamp: Date.now() }));
  });

  // POST /echo - Echo request body
  server.on('POST', '/echo', (req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        received: body,
        headers: req.headers,
        method: req.method
      }));
    });
  });

  // GET /auth/bearer - Require Bearer token
  server.on('GET', '/auth/bearer', (req, res) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ') === false) {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: true, token: auth?.split(' ')[1] }));
  });

  // GET /auth/basic - Require Basic auth
  server.on('GET', '/auth/basic', (req, res) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Basic ') === false) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Test"' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const decoded = Buffer.from(auth?.split(' ')[1] ?? '', 'base64').toString();
    const [username, password] = decoded.split(':');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated: true, username }));
  });

  // GET /redirect/:count - Redirect chain
  server.on('GET', '^/redirect/(\\d+)$', (req, res) => {
    const match = req.url?.match(/\/redirect\/(\d+)/);
    const count = parseInt(match?.[1] ?? '0');
    if (count > 0) {
      res.writeHead(302, { 'Location': `/redirect/${count - 1}` });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Final destination' }));
    }
  });

  // GET /headers - Return request headers
  server.on('GET', '/headers', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ headers: req.headers }));
  });

  // GET /cookies/set/:name/:value - Set cookies dynamically
  server.on('GET', '^/cookies/set', (req, res) => {
    const match = req.url?.match(/^\/cookies\/set\/([^/]+)\/([^/]+)/);
    if (match !== null && match !== undefined) {
      // Dynamic cookie setting: /cookies/set/name/value
      const [, name, value] = match;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `${name}=${value}; Path=/`
      });
      res.end(JSON.stringify({ message: 'Cookie set', name, value }));
    } else {
      // Default cookies for backward compatibility
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': [
          'sessionId=abc123; Path=/',
          'userId=user456; Path=/; HttpOnly'
        ]
      });
      res.end(JSON.stringify({ message: 'Cookies set' }));
    }
  });

  // GET /cookies/get - Get cookies from request
  server.on('GET', '/cookies/get', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cookies: req.headers.cookie ?? '' }));
  });

  // POST /upload - Handle file upload
  server.on('POST', '/upload', (req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        uploaded: true,
        size: body.length,
        contentType: req.headers['content-type']
      }));
    });
  });

  // GET /stream/:count - Server-sent events (simulated)
  server.on('GET', '^/stream/(\\d+)$', (req, res) => {
    const match = req.url?.match(/\/stream\/(\d+)/);
    const maxCount = parseInt(match?.[1] ?? '3');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    let count = 0;
    const interval = setInterval(() => {
      res.write(`data: ${JSON.stringify({ message: `Event ${++count}`, timestamp: Date.now() })}\n\n`);
      if (count >= maxCount) {
        clearInterval(interval);
        res.end();
      }
    }, 100);
  });

  // ANY /error - Force error
  server.on('GET', '/error', (req, res) => {
    res.destroy(); // Abruptly close connection
  });

  return server;
}

