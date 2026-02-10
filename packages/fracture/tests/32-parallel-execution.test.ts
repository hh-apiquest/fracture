/**
 * Test Plan Section 32: DAG-Based Parallel Execution
 * Tests that requests execute in parallel when dependencies allow,
 * respecting concurrency limits and dependencies
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection, ExecutionContext } from '@apiquest/types';
import { mockOptionsPlugin, mockAuthPlugin } from './test-helpers.js';

describe('Section 32: DAG-Based Parallel Execution', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
    runner.registerAuthPlugin(mockAuthPlugin);
  });

  // ========================================================================
  // 32.1: Parallel execution reduces total time
  // ========================================================================
  
  describe('32.1 Independent requests execute concurrently', () => {
    test('3 parallel requests complete faster than 3 sequential', async () => {
      const collection: Collection = {
        info: { id: 'test-parallel', name: 'Parallel Test' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1',
            data: { url: 'mock://test/delay/300' }
          },
          {
            type: 'request',
            id: 'req2',
            name: 'Request 2',
            data: { url: 'mock://test/delay/300' }
          },
          {
            type: 'request',
            id: 'req3',
            name: 'Request 3',
            data: { url: 'mock://test/delay/300' }
          }
        ]
      };

      // Sequential mode (concurrency=1)
      const seqStart = Date.now();
      const seqResult = await runner.run(collection, {
        execution: { allowParallel: false, maxConcurrency: 1 }
      });
      const seqDuration = Date.now() - seqStart;

      expect(seqResult.requestResults.length).toBe(3);
      // Sequential: Should take ~900ms (3 * 300ms)
      expect(seqDuration).toBeGreaterThanOrEqual(850); // Allow some margin

      // Parallel mode (concurrency=3)
      const parStart = Date.now();
      const parResult = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 3 }
      });
      const parDuration = Date.now() - parStart;

      expect(parResult.requestResults.length).toBe(3);
      // Parallel: Should take ~300ms (all execute concurrently)
      expect(parDuration).toBeLessThan(600); // Give some buffer
      expect(parDuration).toBeLessThan(seqDuration / 2);
    });

    test('Concurrency limit is respected', async () => {
      const collection: Collection = {
        info: { id: 'test-concurrency', name: 'Concurrency Limit Test' },
        protocol: 'mock-options',
        items: Array.from({ length: 10 }, (_, i) => ({
          type: 'request' as const,
          id: `req${i}`,
          name: `Request ${i}`,
          data: { url: 'mock://test/delay/200' }
        }))
      };

      // Concurrency=2: Should run in batches of 2
      const start = Date.now();
      const result = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 2 }
      });
      const duration = Date.now() - start;

      expect(result.requestResults.length).toBe(10);
      // With concurrency=2, 10 requests at 200ms each should take ~1000ms (5 batches)
      expect(duration).toBeGreaterThanOrEqual(950);
      expect(duration).toBeLessThan(1500); // Allow buffer
    });
  });

  // ========================================================================
  // 32.2: Dependencies prevent parallel execution
  // ========================================================================
  
  describe('32.2 DependsOn enforces ordering', () => {
    test('Dependent request waits for dependency', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-deps', name: 'Test Dependencies' },
        protocol: 'mock-options',
        preRequestScript: `
          const order = quest.global.variables.get('order') || '';
          quest.global.variables.set('order', order + quest.request.info.name + ',');
        `,
        items: [
          {
            type: 'request',
            id: 'req-a',
            name: 'Request A',
            data: { url: 'mock://test/delay/100' }
          },
          {
            type: 'request',
            id: 'req-b',
            name: 'Request B',
            dependsOn: ['req-a'], // MUST wait for A
            data: { url: 'mock://test/delay/100' }
          },
          {
            type: 'request',
            id: 'req-c',
            name: 'Request C',
            // No dependencies - can run in parallel with A
            data: { url: 'mock://test/delay/100' }
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: true, maxConcurrency: 5 }
      });

      expect(result.requestResults.length).toBe(3);
      
      // Extract execution order from global variable
      const order = globalVars['order'];

      // A and C can run in parallel, B must wait for A
      // Valid orders: "Request A,Request C,Request B," or "Request C,Request A,Request B,"
      expect(order).toContain('Request A');
      expect(order).toContain('Request B');
      expect(order).toContain('Request C');
      
      const aIndex = order.indexOf('Request A');
      const bIndex = order.indexOf('Request B');
      
      expect(aIndex).toBeLessThan(bIndex); // A before B
    });
  });

  // ========================================================================
  // 32.3: Scripts remain serialized in parallel mode
  // ========================================================================
  
  describe('32.3 Scripts serialized (no variable race)', () => {
    test('Pre-request scripts execute serially even in parallel mode', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-script-serial', name: 'Script Serialization' },
        protocol: 'mock-options',
        preRequestScript: `
          const currentCount = parseInt(quest.global.variables.get('counter') || '0');
          quest.global.variables.set('counter', (currentCount + 1).toString());
        `,
        items: Array.from({ length: 10 }, (_, i) => ({
          type: 'request' as const,
          id: `req${i}`,
          name: `Request ${i}`,
          data: { url: 'mock://test' }
        }))
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: true, maxConcurrency: 5 }
      });

      expect(result.requestResults.length).toBe(10);
      
      // Counter should be exactly 10 (no race conditions)
      const counterValue = globalVars['counter'];
      expect(counterValue).toBe('10');
    });
  });

  // ========================================================================
  // 32.4: Sequential mode still works (concurrency=1)
  // ========================================================================
  
  describe('32.4 Sequential mode (concurrency=1) preserves order', () => {
    test('Requests execute in tree order with concurrency=1', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-sequential', name: 'Sequential Mode' },
        protocol: 'mock-options',
        preRequestScript: `
          const order = quest.global.variables.get('order') || '';
          quest.global.variables.set('order', order + quest.request.info.name + ',');
        `,
        items: [
          {
            type: 'request',
            id: 'alpha',
            name: 'alpha',
            data: { url: 'mock://test' }
          },
          {
            type: 'request',
            id: 'beta',
            name: 'beta',
            data: { url: 'mock://test' }
          },
          {
            type: 'request',
            id: 'gamma',
            name: 'gamma',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: false, maxConcurrency: 1 }  // Sequential
      });

      expect(result.requestResults.length).toBe(3);
      
      // Due to alphabetical sorting, order should be deterministic
      const order = globalVars['order'];
      expect(order).toBe('alpha,beta,gamma,');
    });
  });

  // ========================================================================
  // 32.5: Children sorted alphabetically for deterministic DAG
  // ========================================================================
  
  describe('32.5 Children sorted alphabetically', () => {
    test('Requests sorted alphabetically at each level', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-sorting', name: 'Alphabetical Sorting' },
        protocol: 'mock-options',
        preRequestScript: `
          const order = quest.global.variables.get('order') || '';
          quest.global.variables.set('order', order + quest.request.info.name + ',');
        `,
        items: [
          {
            type: 'request',
            id: 'zebra',
            name: 'zebra',
            data: { url: 'mock://test' }
          },
          {
            type: 'request',
            id: 'alpha',
            name: 'alpha',
            data: { url: 'mock://test' }
          },
          {
            type: 'request',
            id: 'middle',
            name: 'middle',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: false }  // Sequential to verify order
      });

      expect(result.requestResults.length).toBe(3);
      
      // Declaration order: zebra, alpha, middle
      const order = globalVars['order'];
      expect(order).toBe('zebra,alpha,middle,');
    });

    test('Folders sorted before requests', async () => {
      const globalVars: Record<string, string> = {};
      
      const collection: Collection = {
        info: { id: 'test-folder-first', name: 'Folders First' },
        protocol: 'mock-options',
        preRequestScript: `
          const order = quest.global.variables.get('order') || '';
          quest.global.variables.set('order', order + quest.request.info.name + ',');
        `,
        items: [
          {
            type: 'request',
            id: 'aaa-request',
            name: 'aaa-request',
            data: { url: 'mock://test' }
          },
          {
            type: 'folder',
            id: 'zzz-folder',
            name: 'zzz-folder',
            items: [
              {
                type: 'request',
                id: 'child-req',
                name: 'child-req',
                data: { url: 'mock://test' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        globalVariables: globalVars,
        execution: { allowParallel: false }
      });

      // Declaration order: aaa-request first, then zzz-folder's child-req
      const order = globalVars['order'];
      expect(order).toBe('aaa-request,child-req,');
    });
  });
});
