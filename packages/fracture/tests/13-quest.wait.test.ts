/**
 * Test Plan Section 13: quest.wait
 * Tests delay execution functionality
 */

import { describe, test, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { ScriptEngine } from '../src/ScriptEngine.js';
import type { ExecutionContext, ScriptType } from '@apiquest/types';
import { mockProtocolPlugin, createTestServer, type MockHttpServer, FakeJar } from './test-helpers.js';

describe('Section 13: quest.wait', () => {
  let engine: ScriptEngine;
  let context: ExecutionContext;
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
    engine = new ScriptEngine();
    
    context = {
      protocol: 'http',
      collectionInfo: { id: 'col-123', name: 'Test Collection' },
      iterationSource: 'none',
      scopeStack: [],
      globalVariables: {},
      collectionVariables: {},
      environment: undefined,
      iterationData: [],
      iterationCurrent: 1,
      iterationCount: 1,
      currentResponse: undefined,
      currentRequest: undefined,
      executionHistory: [],
      options: {},
      protocolPlugin: mockProtocolPlugin,
      cookieJar: FakeJar
    };
  });

  // ========================================================================
  // Section 13.1: Basic wait functionality
  // ========================================================================
  
  describe('13.1 Basic wait functionality', () => {
    test('wait() delays execution for specified milliseconds', async () => {
      const script = `
        const start = Date.now();
        await quest.wait(100);
        const duration = Date.now() - start;
        
        quest.test('Waited approximately 100ms', () => {
          expect(duration).to.be.at.least(90); // Allow 10ms tolerance
          expect(duration).to.be.below(200);   // Should not be too long
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('wait() returns a Promise', async () => {
      const script = `
        const promise = quest.wait(10);
        
        quest.test('Returns Promise', () => {
          expect(promise).to.be.instanceof(Promise);
        });
        
        await promise; // Clean up
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('wait(0) completes immediately', async () => {
      const script = `
        const start = Date.now();
        await quest.wait(0);
        const duration = Date.now() - start;
        
        quest.test('Zero wait completes quickly', () => {
          expect(duration).to.be.below(50); // Should be nearly instant
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Multiple waits execute sequentially', async () => {
      const script = `
        const start = Date.now();
        await quest.wait(50);
        await quest.wait(50);
        const duration = Date.now() - start;
        
        quest.test('Sequential waits add up', () => {
          expect(duration).to.be.at.least(90);  // At least 100ms total
          expect(duration).to.be.below(200);    // Not too long
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 13.2: Error handling
  // ========================================================================
  
  describe('13.2 Error handling', () => {
    test('wait() throws error for negative milliseconds', async () => {
      const script = `
        try {
          await quest.wait(-100);
          quest.fail('Should have thrown error');
        } catch (error) {
          quest.test('Negative ms throws error', () => {
            expect(error.message).to.include('non-negative');
          });
        }
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('wait() throws error for NaN', async () => {
      const script = `
        try {
          await quest.wait(NaN);
          quest.fail('Should have thrown error');
        } catch (error) {
          quest.test('NaN throws error', () => {
            expect(error.message).to.include('valid number');
          });
        }
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('wait() throws error for non-number input', async () => {
      const script = `
        try {
          await quest.wait('100');
          quest.fail('Should have thrown error');
        } catch (error) {
          quest.test('String throws error', () => {
            expect(error.message).to.include('valid number');
          });
        }
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 13.3: Use cases
  // ========================================================================
  
  describe('13.3 Use cases', () => {
    test('Rate limiting between requests', async () => {
      const script = `
        const results = [];
        
        // Simulate first request
        results.push(Date.now());
        
        // Wait before second request
        await quest.wait(50);
        
        // Simulate second request
        results.push(Date.now());
        
        const gap = results[1] - results[0];
        
        quest.test('Requests spaced by delay', () => {
          expect(gap).to.be.at.least(40);
          expect(gap).to.be.below(150);
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Can be used in variable assignment flow', async () => {
      context.scopeStack = [{ level: 'request', id: 'test', vars: {} }];
      
      const script = `
        // Set variable then wait
        quest.scope.variables.set('step', '1');
        await quest.wait(10);
        quest.scope.variables.set('step', '2');
        
        quest.test('Variables set after wait', () => {
          expect(quest.scope.variables.get('step')).to.equal('2');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });

    test('Can be used before making sendRequest', async () => {
      const script = `
        // Wait before making request (e.g., for rate limiting)
        await quest.wait(20);
        
        const response = await quest.sendRequest({
          url: '${serverUrl}/status/200',
          method: 'GET'
        });
        
        quest.test('Request succeeds after wait', () => {
          expect(response.status).to.be.a('number');
        });
      `;
      
      const result = await engine.execute(script, context, 'request-post' as ScriptType, () => {});
      expect(result.success).toBe(true);
      expect(result.tests[0]?.passed).toBe(true);
    });
  });
});


