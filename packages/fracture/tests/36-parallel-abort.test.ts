/**
 * Test Plan Section 36: Parallel Execution with Abort/Bail
 * Tests that abort signals and bail work correctly with parallel execution
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';

describe('Section 36: Parallel Execution Abort/Bail', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  // ========================================================================
  // 36.1: Bail stops scheduling new requests in parallel mode
  // ========================================================================
  
  describe('36.1 Bail stops scheduling in parallel mode', () => {
    test('Bail prevents new requests from being scheduled', async () => {
      const collection: Collection = {
        info: { id: 'test-parallel-bail', name: 'Parallel Bail' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1 - passes',
            data: { url: 'mock://test' },
            postRequestScript: `
              quest.test('Test passes', () => {
                expect(true).to.be.true;
              });
            `
          },
          {
            type: 'request',
            id: 'req2',
            name: 'Request 2 - fails',
            data: { url: 'mock://test' },
            postRequestScript: `
              quest.test('Test fails', () => {
                expect(1).to.equal(2);
              });
            `
          },
          {
            type: 'request',
            id: 'req3',
            name: 'Request 3 - should not execute',
            data: { url: 'mock://test' }
          },
          {
            type: 'request',
            id: 'req4',
            name: 'Request 4 - should not execute',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 2, bail: true }
      });

      // With concurrency=2: req1 and req2 execute in parallel
      // req2 fails → abort() → req3 and req4 never dequeue
      // Result: 2 requests (req1 passes, req2 fails)
      expect(result.requestResults.length).toBeLessThanOrEqual(2);
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toBe('Test failure (--bail)');
    });
  });

  // ========================================================================
  // 36.2: Abort signal stops parallel execution
  // ========================================================================
  
  describe('36.2 Abort signal stops execution', () => {
    test('Abort signal cancels pending requests', async () => {
      const collection: Collection = {
        info: { id: 'test-abort-parallel', name: 'Abort Parallel' },
        protocol: 'mock-options',
        items: Array.from({ length: 10 }, (_, i) => ({
          type: 'request' as const,
          id: `req${i}`,
          name: `Request ${i}`,
          data: { url: 'mock://test/delay/500' }
        }))
      };

      const controller = new AbortController();
      
      // Start execution
      const runPromise = runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 2 },
        signal: controller.signal
      });

      // Abort after 600ms (enough for ~2 requests to complete)
      setTimeout(() => controller.abort(), 600);

      const result = await runPromise;

      // Not all 10 requests should complete
      expect(result.requestResults.length).toBeLessThan(10);
      expect(result.aborted).toBe(true);
    });
  });

  // ========================================================================
  // 36.3: Running requests complete before shutdown
  // ========================================================================
  
  describe('36.3 Running requests complete gracefully', () => {
    test('In-flight requests complete on abort', async () => {
      const collection: Collection = {
        info: { id: 'test-graceful-abort', name: 'Graceful Abort' },
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

      const controller = new AbortController();
      
      // Start execution with concurrency=2
      const runPromise = runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 2 },
        signal: controller.signal
      });

      // Abort immediately - req1 and req2 should complete, req3 should not start
      setTimeout(() => controller.abort(), 50);

      const result = await runPromise;

      // First 2 requests complete (in-flight), 3rd doesn't start
      expect(result.requestResults.length).toBeGreaterThanOrEqual(0);
      expect(result.requestResults.length).toBeLessThanOrEqual(2);
      expect(result.aborted).toBe(true);
    });
  });

  // ========================================================================
  // 36.4: Bail with dependencies
  // ========================================================================
  
  describe('36.4 Bail respects dependencies', () => {
    test('Dependent requests not scheduled after bail', async () => {
      const collection: Collection = {
        info: { id: 'test-bail-deps', name: 'Bail With Dependencies' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-a',
            name: 'Request A - fails',
            data: { url: 'mock://test' },
            postRequestScript: `
              quest.test('Fails', () => {
                expect(1).to.equal(2);
              });
            `
          },
          {
            type: 'request',
            id: 'req-b',
            name: 'Request B - depends on A',
            dependsOn: ['req-a'],
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        execution: { allowParallel: true, bail: true }
      });

      // A executes and fails, B never starts
      expect(result.requestResults.length).toBe(1);
      expect(result.requestResults[0].requestId).toBe('req-a');
      expect(result.aborted).toBe(true);
    });
  });

  // ========================================================================
  // 36.5: Abort during script execution
  // ========================================================================
  
  describe('36.5 Abort during script execution', () => {
    test('Abort signal checked during long script', async () => {
      const collection: Collection = {
        info: { id: 'test-abort-script', name: 'Abort During Script' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Long running request',
            data: { url: 'mock://test/delay/1000' }
          }
        ]
      };

      const controller = new AbortController();
      
      // Start execution
      const runPromise = runner.run(collection, {
        execution: { allowParallel: true },
        signal: controller.signal
      });

      // Abort after 200ms (during request execution)
      setTimeout(() => controller.abort(), 200);

      const result = await runPromise;

      // Request should be aborted
      expect(result.aborted).toBe(true);
      
      // May have 0 or 1 results depending on timing
      expect(result.requestResults.length).toBeGreaterThanOrEqual(0);
      expect(result.requestResults.length).toBeLessThanOrEqual(1);
    });
  });

  // ========================================================================
  // 36.6: Multiple concurrent failures with bail
  // ========================================================================
  
  describe('36.6 Multiple failures in parallel with bail', () => {
    test('First failure triggers bail', async () => {
      const collection: Collection = {
        info: { id: 'test-multi-fail', name: 'Multiple Failures' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req1',
            name: 'Request 1 - fails',
            data: { url: 'mock://test' },
            postRequestScript: `
              quest.test('Fails', () => {
                expect(1).to.equal(2);
              });
            `
          },
          {
            type: 'request',
            id: 'req2',
            name: 'Request 2 - also fails',
            data: { url: 'mock://test' },
            postRequestScript: `
              quest.test('Also fails', () => {
                expect(2).to.equal(3);
              });
            `
          },
          {
            type: 'request',
            id: 'req3',
            name: 'Request 3 - never runs',
            data: { url: 'mock://test' }
          }
        ]
      };

      const result = await runner.run(collection, {
        execution: { allowParallel: true, maxConcurrency: 2, bail: true }
      });

      // With concurrency=2: req1 and req2 execute in parallel
      // One fails → abort() → req3 never dequeues
      // Should have executed req1 and/or req2, not req3
      expect(result.requestResults.length).toBeLessThanOrEqual(2);
      expect(result.aborted).toBe(true);
      expect(result.abortReason).toBe('Test failure (--bail)');
    });
  });
});
