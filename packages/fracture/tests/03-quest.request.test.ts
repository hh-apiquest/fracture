/**
 * Test Plan Section 3: quest.request
 * Tests for request info, headers, body, and timeout API
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { ExecutionContext, ScriptType, Request, Collection } from '@apiquest/types';
import { FakeJar, mockOptionsPlugin } from './test-helpers.js';

describe('Section 3: quest.request', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;
  let mockRequest: Request;
  let runner: CollectionRunner;

  beforeEach(() => {
    engine = new ScriptEngine();
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);

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
      },
      dependsOn: ['req-auth', 'req-setup'],
      condition: 'quest.variables.get("env") === "dev"'
    };

    context = {
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
      protocol: 'http',
      scopeStack: [],
      globalVariables: {},
      collectionVariables: {},
      environment: {
        name: 'Test',
        variables: {}
      },
      iterationData: [],
      iterationCurrent: 1,
      iterationCount: 1,
      currentRequest: mockRequest,
      currentResponse: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockOptionsPlugin,
      cookieJar: FakeJar,
      abortSignal: new AbortController().signal
    };
  });

  // ========================================================================
  // Section 3.1: quest.request.info
  // ========================================================================

  describe('3.1 quest.request.info', () => {
    test('quest.request.info.name matches request name', async () => {
      const script = `
        quest.test('Request name matches', () => {
          expect(quest.request.info.name).to.equal('Get User');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.info.id matches request ID', async () => {
      const script = `
        quest.test('Request ID matches', () => {
          expect(quest.request.info.id).to.equal('req-456');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.info.description matches request description', async () => {
      const script = `
        quest.test('Request description matches', () => {
          expect(quest.request.info.description).to.equal('Fetches user by ID');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.info.protocol matches request protocol', async () => {
      const script = `
        quest.test('Request protocol matches', () => {
          expect(quest.request.info.protocol).to.equal('http');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 3.2: Execution control surfaces
  // ========================================================================

  describe('3.2 Execution control surfaces', () => {
    test('quest.request.dependsOn exposes dependsOn array', async () => {
      const script = `
        quest.test('DependsOn is accessible', () => {
          expect(quest.request.dependsOn).to.be.an('array');
          expect(quest.request.dependsOn).to.include('req-auth');
          expect(quest.request.dependsOn).to.include('req-setup');
          expect(quest.request.dependsOn.length).to.equal(2);
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.dependsOn is null when omitted', async () => {
      delete mockRequest.dependsOn;

      const script = `
        quest.test('DependsOn is null when omitted', () => {
          expect(quest.request.dependsOn).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.condition exposes condition expression', async () => {
      const script = `
        quest.test('Condition is accessible', () => {
          expect(quest.request.condition).to.equal('quest.variables.get("env") === "dev"');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.condition is null when omitted', async () => {
      delete mockRequest.condition;

      const script = `
        quest.test('Condition is null when omitted', () => {
          expect(quest.request.condition).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 3.3: HTTP request fields
  // ========================================================================

  describe('3.3 HTTP request fields', () => {
    test('quest.request.url reflects final resolved URL', async () => {
      const script = `
        quest.test('URL is accessible', () => {
          expect(quest.request.url).to.equal('https://api.example.com/users/123');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('quest.request.method reflects configured method', async () => {
      const script = `
        quest.test('Method is accessible', () => {
          expect(quest.request.method).to.equal('GET');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 3.4: quest.request.headers API
  // ========================================================================

  describe('3.4 quest.request.headers API', () => {
    test('get(name) retrieves header value', async () => {
      const script = `
        quest.test('Get header works', () => {
          expect(quest.request.headers.get('Authorization')).to.equal('Bearer token123');
          expect(quest.request.headers.get('Content-Type')).to.equal('application/json');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get(name) is case-insensitive', async () => {
      const script = `
        quest.test('Get is case-insensitive', () => {
          expect(quest.request.headers.get('authorization')).to.equal('Bearer token123');
          expect(quest.request.headers.get('CONTENT-TYPE')).to.equal('application/json');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('add({key,value}) adds a header', async () => {
      const script = `
        quest.request.headers.add({key: 'X-Custom', value: 'custom-value'});
        
        quest.test('Add header works', () => {
          expect(quest.request.headers.get('X-Custom')).to.equal('custom-value');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);

      // Verify it was actually added to the request
      expect((mockRequest.data.headers as Record<string,string>)['X-Custom']).toBe('custom-value');
    });

    test('remove(name) removes header', async () => {
      const script = `
        quest.request.headers.remove('Content-Type');
        
        quest.test('Remove header works', () => {
          expect(quest.request.headers.get('Content-Type')).to.be.null;
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);

      // Verify it was actually removed
      expect((mockRequest.data.headers as Record<string,string>)['Content-Type']).toBeUndefined();
    });

    test('upsert({key,value}) adds if missing', async () => {
      const script = `
        quest.request.headers.upsert({key: 'X-New', value: 'new-value'});
        
        quest.test('Upsert adds new header', () => {
          expect(quest.request.headers.get('X-New')).to.equal('new-value');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('upsert({key,value}) updates if present', async () => {
      const script = `
        quest.request.headers.upsert({key: 'Authorization', value: 'Bearer newtoken'});
        
        quest.test('Upsert updates existing header', () => {
          expect(quest.request.headers.get('Authorization')).to.equal('Bearer newtoken');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('toObject() returns all headers', async () => {
      const script = `
        const headers = quest.request.headers.toObject();
        
        quest.test('ToObject returns all headers', () => {
          expect(headers).to.have.property('Authorization');
          expect(headers).to.have.property('Content-Type');
          expect(headers.Authorization).to.equal('Bearer token123');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Header mutations in preRequest affect outgoing request', async () => {
      const script = `
        quest.request.headers.add({key: 'X-Test', value: 'test123'});
        quest.request.headers.upsert({key: 'Authorization', value: 'Bearer updated'});
      `;

      await engine.execute(script, context, 'request-pre' as ScriptType, () => { });

      // Verify mutations persisted to the actual request
      expect((mockRequest.data.headers as Record<string,string>)['X-Test']).toBe('test123');
      expect((mockRequest.data.headers as Record<string,string>)['Authorization']).toBe('Bearer updated');
    });
  });

  // ========================================================================
  // Section 3.5: quest.request.body API
  // ========================================================================

  describe('3.5 quest.request.body API', () => {
    test('mode reflects current body mode', async () => {
      mockRequest.data.body = { mode: 'raw', raw: '{"test": true}' };

      const script = `
        quest.test('Body mode is accessible', () => {
          expect(quest.request.body.mode).to.equal('raw');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('get() returns current body content as string', async () => {
      mockRequest.data.body = { mode: 'raw', raw: '{"test": true}' };

      const script = `
        quest.test('Body get returns content', () => {
          expect(quest.request.body.get()).to.equal('{"test": true}');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('set(str) overrides body content', async () => {
      mockRequest.data.body = { mode: 'raw', raw: 'old content' };

      const script = `
        quest.request.body.set('{"new": "content"}');
        
        quest.test('Body set works', () => {
          expect(quest.request.body.get()).to.equal('{"new": "content"}');
        });
      `;

      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => { });
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Setting body in scripts affects outgoing request', async () => {
      mockRequest.data.body = { mode: 'raw', raw: 'original' };

      const script = `
        quest.request.body.set('{"modified": true}');
      `;

      await engine.execute(script, context, 'request-pre' as ScriptType, () => { });

      // Verify the change persisted
      expect((mockRequest.data.body as { raw: string }).raw).toBe('{"modified": true}');
    });
  });

  // ========================================================================
  // Section 3.6: quest.request.timeout API (LOW PRIORITY)
  // ========================================================================

  describe('3.6 quest.request.timeout API', () => {
    test('quest.request.timeout.set(ms) sets timeout for THIS request', async () => {
      const collection: Collection = {
        info: { id: 'timeout-test', name: 'Timeout Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'http://example.com' },
          preRequestScript: `
            quest.request.timeout.set(5000);
            quest.global.variables.set('timeout_in_pre', quest.request.timeout.get());
          `,
          postRequestScript: `
            quest.test('timeout was set in pre-request', () => {
              const timeoutFromPre = quest.global.variables.get('timeout_in_pre');
              expect(timeoutFromPre).to.equal(5000);
            });
            quest.test('timeout is still accessible in post-request', () => {
              expect(quest.request.timeout.get()).to.equal(5000);
            });
          `
        }]
      };

      const result = await runner.run(collection, { strictMode: false });
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(0);
    });

    test('quest.request.timeout.get() returns current timeout from CLI/context', async () => {
      const collection: Collection = {
        info: { id: 'timeout-test-2', name: 'Timeout Test 2', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'http://example.com' },
          postRequestScript: `
            quest.test('get returns context timeout', () => {
              expect(quest.request.timeout.get()).to.equal(3000);
            });
          `
        }]
      };

      const result = await runner.run(collection, {
        timeout: { request: 3000 },
        strictMode: false
      });
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(0);
    });

    test('quest.request.timeout.set() throws error when called outside pre-request script', async () => {
      const collection: Collection = {
        info: { id: 'timeout-test-3', name: 'Timeout Test 3', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: 'http://example.com' },
          postRequestScript: `
            try {
              quest.request.timeout.set(5000);
              quest.test('should not reach here', () => expect(true).to.be.false);
            } catch (error) {
              quest.test('throws error in post-request script', () => {
                expect(error.message).to.include('preRequestScript');
              });
            }
          `
        }]
      };
      
      const result = await runner.run(collection, { strictMode: false });
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(0);
    });

    test('quest.request.timeout.set() only affects current request, not subsequent requests', async () => {
      const collection: Collection = {
        info: { id: 'timeout-test-4', name: 'Timeout Test 4', version: '1.0.0' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'First Request',
            data: { method: 'GET', url: 'http://example.com' },
            preRequestScript: `
              quest.request.timeout.set(5000);
            `,
            postRequestScript: `
              quest.test('first request has 5000ms timeout', () => {
                expect(quest.request.timeout.get()).to.equal(5000);
              });
            `
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Second Request',
            data: { method: 'GET', url: 'http://example.com' },
            postRequestScript: `
              quest.test('second request reverts to context timeout', () => {
                // Should revert to context timeout (3000), not the previous request's timeout
                expect(quest.request.timeout.get()).to.equal(3000);
              });
            `
          }
        ]
      };

      const result = await runner.run(collection, {
        timeout: { request: 3000 },
        strictMode: false
      });
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(0);
    });
  });
});


