// Section 27: HTTP Runtime Options Tests
// Tests that HTTP options are correctly applied during execution

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { createTestServer, type MockHttpServer, mockOptionsPlugin } from './test-helpers.js';

describe('Section 27: HTTP Runtime Options', () => {
  let runner: CollectionRunner;
  let server: MockHttpServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = createTestServer();
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  describe('27.1 Timeout Options', () => {
    test('timeout.request sets maximum request duration', async () => {
      
      const collection: Collection = {
        info: { id: 'test', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Timeout Test',
          data: { method: 'GET', url: 'mock://test' },
          postRequestScript: `
            quest.test('timeout.request received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.timeout.request).to.equal(5000);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        timeout: { request: 5000 }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('timeout.connection sets connection timeout', async () => {
      
      const collection: Collection = {
        info: { id: 'test', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Connection Timeout Test',
          data: { method: 'GET', url: 'mock://test' },
          postRequestScript: `
            quest.test('timeout.connection received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.timeout.connection).to.equal(3000);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        timeout: { connection: 3000 }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('timeout.response sets response timeout', async () => {
      
      const collection: Collection = {
        info: { id: 'test', name: 'Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Response Timeout Test',
          data: { method: 'GET', url: 'mock://test' },
          postRequestScript: `
            quest.test('timeout.response received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.timeout.response).to.equal(2000);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        timeout: { response: 2000 }
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('All timeout options propagate together', async () => {
      
      const collection: Collection = {
        info: { id: 'timeout-all', name: 'All Timeout Options', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'All Timeout Test',
          data: { method: 'GET', url: 'mock://test' },
          postRequestScript: `
            quest.test('All timeout options received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.timeout.request).to.equal(5000);
              expect(body.receivedOptions.timeout.connection).to.equal(3000);
              expect(body.receivedOptions.timeout.response).to.equal(2000);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        timeout: {
          request: 5000,
          connection: 3000,
          response: 2000
        }
      });
      
      expect(result.passedTests).toBe(1);
    });
  });

  describe('27.2 Delay Options', () => {
    test('execution.delay adds delay between requests', async () => {
      
      const collection: Collection = {
        info: { id: 'delay-test', name: 'Delay Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request 1',
          data: { method: 'GET', url: 'mock://json' }
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Request 2',
          data: { method: 'GET', url: 'mock://json' }
        }, {
          type: 'request',
          id: 'req-3',
          name: 'Request 3',
          data: { method: 'GET', url: 'mock://json' }
        }]
      };

      const startTime = Date.now();
      await runner.run(collection, {
        execution: { delay: 100 }
      });
      const duration = Date.now() - startTime;
      
      // With 3 requests and 100ms delay, we expect at least 200ms total (2 delays between 3 requests)
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    test('No delay when execution.delay is 0 or undefined', async () => {
      const collection: Collection = {
        info: { id: 'nodelay-test', name: 'No Delay Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Request 1',
          data: { method: 'GET', url: 'mock://json' }
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Request 2',
          data: { method: 'GET', url: 'mock://json' }
        }]
      };

      const startTime = Date.now();
      await runner.run(collection, {
        execution: { delay: 0 }
      });
      const duration = Date.now() - startTime;
      
      // Without delay, should execute quickly (under 100ms for 2 simple requests)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('27.3 Bail Option', () => {
    test('execution.bail stops on first failure', async () => {
      const collection: Collection = {
        info: { id: 'bail-test', name: 'Bail Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Failing Request',
          data: { method: 'GET', url: 'mock://status/404' },
          postRequestScript: `
            quest.test('Should fail', () => {
              expect(quest.response.status).to.equal(200);
            });
          `
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Should not execute',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Should not run', () => {
              expect(true).to.be.true;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: true }
      });
      
      // First request should fail, second should not execute
      expect(result.failedTests).toBe(1);
      expect(result.passedTests).toBe(0);
      expect(result.requestResults).toHaveLength(1); // Only first request executed
    });

    test('execution.bail: false continues after failures', async () => {
      const collection: Collection = {
        info: { id: 'nobail-test', name: 'No Bail Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Failing Request',
          data: { method: 'GET', url: 'mock:///status/404' },
          postRequestScript: `
            quest.test('Should fail', () => {
              expect(quest.response.status).to.equal(200);
            });
          `
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Should still execute',
          data: { method: 'GET', url: 'mock://json' },
          postRequestScript: `
            quest.test('Should pass', () => {
              expect(quest.response.status).to.equal(200);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        execution: { bail: false }
      });
      
      // First request fails, second passes
      expect(result.failedTests).toBe(1);
      expect(result.passedTests).toBe(1);
      expect(result.requestResults).toHaveLength(2); // Both requests executed
    });
  });

  describe('27.4 Redirect Options', () => {
    test('followRedirects: true follows redirects', async () => {
      const collection: Collection = {
        info: { id: 'http-1', name: 'Redirect Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://redirect/1' },
          postRequestScript: `
            quest.test('Final status after redirect', () => {
              expect(quest.response.status).to.equal(200);
            });
          `
        }]
      };

      const result = await runner.run(collection, { followRedirects: true });
      expect(result.passedTests).toBe(1);
    });

    test('followRedirects: false does not follow redirects', async () => {
      const collection: Collection = {
        info: { id: 'http-2', name: 'No Redirect Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'mock://redirect/1' },
          postRequestScript: `
            quest.test('Returns redirect status', () => {
              expect(quest.response.status).to.be.oneOf([301, 302, 303, 307, 308]);
            });
          `
        }]
      };

      const result = await runner.run(collection, { followRedirects: false });
      expect(result.passedTests).toBe(1);
    });

    test('maxRedirects limits number of redirects followed', async () => {
      
      const collection: Collection = {
        info: { id: 'maxred-test', name: 'Max Redirects Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Redirect Limit Test',
          data: { method: 'GET', url: 'mock://test' },
          postRequestScript: `
            quest.test('maxRedirects received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.maxRedirects).to.equal(5);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        maxRedirects: 5
      });
      
      expect(result.passedTests).toBe(1);
    });

    test('followRedirects and maxRedirects propagate together', async () => {
      
      const collection: Collection = {
        info: { id: 'redirect-both', name: 'Both Redirect Options', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Redirect Options Test',
          data: { method: 'GET', url: 'mock://test' },
          postRequestScript: `
            quest.test('Both redirect options received', () => {
              const body = JSON.parse(quest.response.body);
              expect(body.receivedOptions.followRedirects).to.be.true;
              expect(body.receivedOptions.maxRedirects).to.equal(10);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        followRedirects: true,
        maxRedirects: 10
      });
      
      expect(result.passedTests).toBe(1);
    });
  });

  describe('27.5 Cookie Jar Options', () => {
    test('jar.persist: false disables cookie persistence', async () => {
      const collection: Collection = {
        info: { id: 'http-3', name: 'Cookie Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Set Cookie',
          data: { method: 'GET', url: 'mock://cookies/set/session/abc123' }
        }, {
          type: 'request',
          id: 'req-2',
          name: 'Check Cookie',
          data: { method: 'GET', url: 'mock://cookies/get' },
          postRequestScript: `
            quest.test('Cookie not persisted', () => {
              const cookies = quest.cookies.toObject();
              expect(cookies.session).to.be.undefined;
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        jar: { persist: false }
      });
      expect(result.passedTests).toBe(1);
    });

    test('jar.persist: true enables cookie persistence', async () => {
      const collection: Collection = {
        info: { id: 'http-4', name: 'Cookie Persist Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Set Cookie',
          data: { method: 'GET', url: 'mock://cookies/set/session/abc123' }
         }, {
          type: 'request',
          id: 'req-2',
          name: 'Check Cookie',
          data: { method: 'GET', url: 'mock://cookies/get' },
          postRequestScript: `
            quest.test('Cookie persisted', () => {
              const cookies = quest.cookies.toObject();
              expect(cookies.session).to.equal('abc123');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        jar: { persist: true }
      });
      expect(result.passedTests).toBe(1);
    });
  });

  describe('27.6 Cookie Options', () => {
    test('cookies array adds cookies to all requests', async () => {
      const collection: Collection = {
        info: { id: 'http-5', name: 'Cookie Inject Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Check Cookie',
          data: { method: 'GET', url: 'mock://cookies/get' },
          postRequestScript: `
            quest.test('Injected cookie present', () => {
              const cookies = quest.cookies.toObject();
              expect(cookies.auth).to.equal('token123');
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        cookies: [{ name: 'auth', value: 'token123', domain: 'localhost', path: '/' }]
      });
      expect(result.passedTests).toBe(1);
    });
  });
});
